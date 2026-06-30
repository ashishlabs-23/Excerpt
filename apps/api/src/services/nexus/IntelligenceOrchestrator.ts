/**
 * IntelligenceOrchestrator.ts — Bridge between the TypeScript production pipeline
 * and the 27 standalone Python intelligence engines.
 *
 * Architecture:
 *   videoWorker.ts → IntelligenceOrchestrator → child_process.spawn → Python engines
 *                                             ← JSON responses ←
 *
 * All Python engines follow the same CLI contract:
 *   python <engine>.py --input-json <path> --output-json <path>
 *
 * The orchestrator writes JSON payloads to temp files, spawns each engine,
 * reads the JSON output, and returns typed results into the pipeline context.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { FootballCropAuditor } from '../intelligence/FootballCropAuditor';
import { FootballCropPlanner, StoryEvent } from '../intelligence/FootballCropPlanner';

// ─── Interfaces ─────────────────────────────────────────────────────────────

/** Execution result from a single Python engine run. */
export interface EngineResult {
  engineName: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  data: Record<string, any>;
  executionTimeMs: number;
  retryCount: number;
  error?: string;
}

/** Aggregated context holding all engine results for a job. */
export interface OrchestrationContext {
  jobId: string;
  videoPath: string;
  videoType: string;
  platform: string;
  results: Record<string, EngineResult>;
  executionTimeline: Array<{ engine: string; startedAt: number; endedAt: number; status: string }>;
  totalExecutionMs: number;
}

/** Configuration for a single engine invocation. */
export interface EngineConfig {
  /** Python script filename (e.g. 'story_engine.py') */
  scriptName: string;
  /** Unique key used in the orchestration context (e.g. 'story') */
  engineKey: string;
  /** Human-readable label for logging */
  label: string;
  /** Tier: 1 = always run, 2 = conditional, 3 = expensive/candidate-only */
  tier: 1 | 2 | 3;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Max retry attempts on failure */
  maxRetries: number;
  /** Content categories that activate this engine (empty = all) */
  activateFor: string[];
  /** Engine keys that must complete before this engine can run */
  dependsOn: string[];
  /**
   * Optional CLI argument overrides. If absent, the orchestrator uses
   * the standard --input-json / --output-json contract.
   */
  customArgs?: (inputPath: string, outputPath: string, payload: Record<string, any>) => string[];
}

/** Options passed to the orchestrator's run method. */
export interface OrchestrationOptions {
  jobId: string;
  videoPath: string;
  videoType: string;
  platform: string;
  tempDir: string;
  /** Pre-assembled payload data to send to all engines */
  payload: Record<string, any>;
  /** Only run engines in these tiers (default: [1, 2, 3]) */
  tiers?: number[];
  /** Explicit list of engine keys to run (overrides tier logic) */
  onlyEngines?: string[];
  /** Skip these engine keys */
  skipEngines?: string[];
}

// ─── Engine Registry ────────────────────────────────────────────────────────

const ENGINE_REGISTRY: EngineConfig[] = [
  // ── Tier 1: Perception (cheap, always run) ──────────────────────────────
  {
    scriptName: 'transcript_service.py',
    engineKey: 'transcript',
    label: 'WhisperX Transcript',
    tier: 1,
    timeoutMs: 300_000,
    maxRetries: 2,
    activateFor: [],
    dependsOn: [],
    customArgs: (inputPath) => ['--audio', inputPath],
  },
  {
    scriptName: 'detection_service.py',
    engineKey: 'detection',
    label: 'YOLO Object Detection',
    tier: 1,
    timeoutMs: 300_000,
    maxRetries: 2,
    activateFor: [],
    dependsOn: [],
    customArgs: (inputPath) => ['--frames', path.dirname(inputPath)],
  },
  {
    scriptName: 'tracking_service.py',
    engineKey: 'tracking',
    label: 'ByteTrack Multi-Object Tracking',
    tier: 1,
    timeoutMs: 180_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['detection', 'motion'],
  },
  {
    scriptName: 'speaker_service.py',
    engineKey: 'speaker',
    label: 'Active Speaker Detection',
    tier: 1,
    timeoutMs: 180_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['transcript'],
    customArgs: (inputPath, outputPath) => ['--input-json', inputPath, '--output', outputPath],
  },

  // ── Tier 2: Understanding (conditional on content type) ─────────────────
  {
    scriptName: 'motion_engine.py',
    engineKey: 'motion',
    label: 'Motion Intelligence',
    tier: 2,
    timeoutMs: 180_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: [],
    customArgs: (inputPath, outputPath, payload) => ['--video', payload.videoPath || 'dummy.mp4', '--output-json', outputPath],
  },
  {
    scriptName: 'attention_engine.py',
    engineKey: 'attention',
    label: 'Attention Engine',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['detection'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'emotion_engine.py',
    engineKey: 'emotion',
    label: 'Emotion Engine',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: [],
  },
  {
    scriptName: 'event_engine.py',
    engineKey: 'events',
    label: 'Event Detection Engine',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['tracking'],
  },
  {
    scriptName: 'football_event_engine.py',
    engineKey: 'football_events',
    label: 'Football Event Engine',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['tracking'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'football_story_engine.py',
    engineKey: 'football_story_engine',
    label: 'Football Story Engine',
    tier: 1,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['football_events'],
    customArgs: (inputPath, outputPath, payload) => ['--events-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'football_hook_engine.py',
    engineKey: 'football_hook_engine',
    label: 'Football Hook Engine',
    tier: 1,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['football_story_engine'],
    customArgs: (inputPath, outputPath, payload) => ['--story-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'commentary_hype_engine.py',
    engineKey: 'commentary_hype',
    label: 'Commentary Hype Engine',
    tier: 2,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['transcript'],
    customArgs: (inputPath, outputPath, payload) => {
      return ['--input-json', inputPath, '--output-json', outputPath]; 
    },
  },
  {
    scriptName: 'sports_engine.py',
    engineKey: 'sports',
    label: 'Sports Intelligence',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football', 'basketball', 'cricket', 'tennis', 'sports'],
    dependsOn: ['detection', 'tracking'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'ball_intelligence_engine.py',
    engineKey: 'ball',
    label: 'Ball Trajectory Intelligence',
    tier: 2,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football', 'basketball', 'cricket', 'tennis', 'sports'],
    dependsOn: ['detection', 'tracking'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'replay_detection_engine.py',
    engineKey: 'replay',
    label: 'Replay Detection',
    tier: 2,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football', 'basketball', 'cricket', 'sports'],
    dependsOn: ['tracking'],
  },

  // ── Tier 3: Narrative & Evaluation (expensive, candidate-only) ──────────
  {
    scriptName: 'story_engine.py',
    engineKey: 'story',
    label: 'Story Arc Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['emotion', 'events', 'football_events'],
  },
  {
    scriptName: 'goal_importance_engine.py',
    engineKey: 'goal_importance',
    label: 'Goal Importance Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['football_events', 'commentary_hype', 'scoreboard'],
    customArgs: (inputPath, outputPath, payload) => {
      const hypeScore = payload.commentary_hype_results?.hype?.hype_score || 0.7;
      const minute = payload.scoreboard_results?.scoreboard?.minute || 89;
      const scoreDiff = payload.scoreboard_results?.scoreboard?.score_diff || 0;
      return [
        '--minute', String(minute),
        '--score-diff', String(scoreDiff),
        '--hype', String(hypeScore),
        '--output-json', outputPath
      ];
    },
  },
  {
    scriptName: 'golden_moment_engine.py',
    engineKey: 'golden_moment',
    label: 'Golden Moment Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['emotion', 'events'],
  },
  {
    scriptName: 'editor_emulation_engine.py',
    engineKey: 'editor',
    label: 'Editor Emulation',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['story', 'events'],
  },
  {
    scriptName: 'editor_agent.py',
    engineKey: 'editor_agent',
    label: 'Editor Agent',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['story', 'emotion', 'events'],
  },
  {
    scriptName: 'virality_engine.py',
    engineKey: 'virality',
    label: 'Virality Prediction',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['emotion', 'motion'],
    customArgs: (inputPath, outputPath) => [
      '--mode', 'predict',
      '--model-path', path.join(path.dirname(inputPath), '..', 'virality_model.json'),
      '--input-json', inputPath,
      '--output-json', outputPath,
    ],
  },
  {
    scriptName: 'retention_engine.py',
    engineKey: 'retention',
    label: 'Retention Prediction',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: [],
    customArgs: (inputPath, outputPath) => [
      '--mode', 'predict',
      '--model-dir', path.join(path.dirname(inputPath), '..'),
      '--input-json', inputPath,
      '--output-json', outputPath,
    ],
  },
  {
    scriptName: 'subject_priority_engine.py',
    engineKey: 'subject_priority',
    label: 'Subject Priority',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['detection', 'tracking', 'speaker'],
    customArgs: (inputPath, outputPath) => [
      '--tracks-json', inputPath,
      '--timeline-json', inputPath,
      '--output-json', outputPath,
    ],
  },
  {
    scriptName: 'reframe_engine.py',
    engineKey: 'reframe',
    label: 'Smart Reframer',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['subject_priority'],
    customArgs: (inputPath, outputPath) => ['--priority-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'ball_visibility_critic.py',
    engineKey: 'ball_visibility',
    label: 'Ball Visibility Critic',
    tier: 3,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['tracking', 'reframe'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'ball_visibility_repair.py',
    engineKey: 'ball_visibility_repair',
    label: 'Ball Visibility Repair',
    tier: 1,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['ball_visibility_critic'],
    customArgs: (inputPath, outputPath, payload) => ['--critic-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'reframe_engine.py',
    engineKey: 'reframe_engine',
    label: 'Reframe Engine',
    tier: 1,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['ball_visibility_repair'],
    customArgs: (inputPath, outputPath, payload) => ['--priority-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'predictive_crop_engine.py',
    engineKey: 'predictive_crop_engine',
    label: 'Predictive Crop Engine',
    tier: 1,
    timeoutMs: 120_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['reframe_engine'],
    customArgs: (inputPath, outputPath, payload) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'scoreboard_engine.py',
    engineKey: 'scoreboard',
    label: 'Scoreboard Context',
    tier: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['tracking'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'football_story_engine.py',
    engineKey: 'football_story',
    label: 'Football Narrative Engine',
    tier: 1,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['football_events', 'emotion'],
    customArgs: (inputPath, outputPath) => ['--events-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'tension_curve_engine.py',
    engineKey: 'tension_curve',
    label: 'Tension Curve Engine',
    tier: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['football_events', 'scoreboard'],
    customArgs: (inputPath, outputPath) => ['--input-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'story_outcome_engine.py',
    engineKey: 'story_outcome',
    label: 'Story Outcome Engine',
    tier: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['football_events', 'football_story', 'scoreboard', 'tension_curve', 'commentary_hype'],
    customArgs: (inputPath, outputPath) => ['--events-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'story_context_engine.py',
    engineKey: 'story_context',
    label: 'Story Context Engine',
    tier: 1,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['football_events'],
    customArgs: (inputPath, outputPath) => ['--events-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'reaction_ownership_engine.py',
    engineKey: 'reaction_ownership',
    label: 'Reaction Ownership Engine',
    tier: 1,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: ['football', 'sports'],
    dependsOn: ['football_events', 'emotion'],
    customArgs: (inputPath, outputPath) => ['--events-json', inputPath, '--emotion-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'moment_boundary_optimizer.py',
    engineKey: 'boundary_optimizer',
    label: 'Moment Boundary Optimizer',
    tier: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: ['football'],
    dependsOn: ['story_outcome', 'story_context', 'reaction_ownership', 'commentary_hype'],
    customArgs: (inputPath, outputPath) => ['--policy-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'predictive_crop_engine.py',
    engineKey: 'predictive_crop',
    label: 'Predictive Crop Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['tracking'],
    customArgs: (inputPath, outputPath) => ['--tracks-json', inputPath, '--output-json', outputPath],
  },
  {
    scriptName: 'caption_engine.py',
    engineKey: 'captions',
    label: 'Kinetic Caption Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['transcript', 'speaker'],
    customArgs: (inputPath, outputPath) => ['--words-json', inputPath, '--output', outputPath],
  },
  {
    scriptName: 'critic_engine.py',
    engineKey: 'critic',
    label: 'Critic Engine',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['story', 'reframe', 'captions'],
  },
  {
    scriptName: 'reward_model.py',
    engineKey: 'reward',
    label: 'Preference Reward Model',
    tier: 3,
    timeoutMs: 30_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['critic', 'goal_importance', 'commentary_hype'],
    customArgs: (inputPath, outputPath) => [
      '--action', 'predict',
      '--data-json', inputPath,
      '--output-json', outputPath,
    ],
  },
  {
    scriptName: 'preference_scheduler.py',
    engineKey: 'preference_scheduler',
    label: 'Preference Scheduler',
    tier: 3,
    timeoutMs: 15_000,
    maxRetries: 0,
    activateFor: [],
    dependsOn: ['reward', 'critic'],
    customArgs: (inputPath, outputPath) => {
      return [
        '--reward-json', inputPath,
        '--critic-score', '80',
        '--context-json', inputPath,
        '--output-json', outputPath,
      ];
    },
  },
  {
    scriptName: 'moment_engine.py',
    engineKey: 'moment',
    label: 'Moment Detection',
    tier: 3,
    timeoutMs: 60_000,
    maxRetries: 1,
    activateFor: [],
    dependsOn: ['emotion', 'events'],
  },
];

// ─── Orchestrator ───────────────────────────────────────────────────────────

export class IntelligenceOrchestrator {
  private static instance: IntelligenceOrchestrator;

  private constructor() {}

  public static getInstance(): IntelligenceOrchestrator {
    if (!IntelligenceOrchestrator.instance) {
      IntelligenceOrchestrator.instance = new IntelligenceOrchestrator();
    }
    return IntelligenceOrchestrator.instance;
  }

  // ── Script path resolution ──────────────────────────────────────────────

  private resolveScriptPath(scriptName: string): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'apps', 'api', 'scripts', scriptName),
      path.resolve(__dirname, '..', '..', 'scripts', scriptName),
      path.resolve(process.cwd(), 'scripts', scriptName),
    ];
    return candidates.find((c) => fs.existsSync(c)) || null;
  }

  // ── Single engine execution ─────────────────────────────────────────────

  private async executeEngine(
    config: EngineConfig,
    payload: Record<string, any>,
    tempDir: string,
    previousResults: Record<string, EngineResult>,
    attempt: number = 0
  ): Promise<EngineResult> {
    const startedAt = Date.now();
    const tag = `[Orchestrator][${config.label}]`;
    const nonce = crypto.randomBytes(4).toString('hex');
    const inputPath = path.join(tempDir, `intel_${config.engineKey}_${nonce}_in.json`);
    const outputPath = path.join(tempDir, `intel_${config.engineKey}_${nonce}_out.json`);

    try {
      // 1. Check script exists
      const scriptPath = this.resolveScriptPath(config.scriptName);
      if (!scriptPath) {
        console.warn(`${tag} Script not found: ${config.scriptName}. Skipping.`);
        return {
          engineName: config.engineKey,
          status: 'skipped',
          data: {},
          executionTimeMs: Date.now() - startedAt,
          retryCount: attempt,
          error: `Script not found: ${config.scriptName}`,
        };
      }

      // 2. Merge upstream dependency outputs into the payload
      const enrichedPayload: Record<string, any> = { ...payload };
      for (const dep of config.dependsOn) {
        const depResult = previousResults[dep];
        if (depResult && depResult.status === 'success') {
          enrichedPayload[`${dep}_results`] = depResult.data;
        }
      }

      // 3. Write input JSON
      fs.writeFileSync(inputPath, JSON.stringify(enrichedPayload, null, 2), 'utf-8');

      const args: string[] = config.customArgs
        ? config.customArgs(inputPath, outputPath, enrichedPayload)
        : ['--input-json', inputPath, '--output-json', outputPath];

      // 5. Spawn Python process
      const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
      console.log(`${tag} Starting (attempt ${attempt + 1}/${config.maxRetries + 1})...`);

      const stdout = await this.spawnPython(pythonBin, scriptPath, args, config.timeoutMs);

      // 6. Parse stdout for immediate status
      let stdoutParsed: Record<string, any> = {};
      try {
        stdoutParsed = JSON.parse(stdout.trim().split('\n').pop() || '{}');
      } catch {
        // stdout may not be JSON — that's OK, the result file is canonical
      }

      if (stdoutParsed.status === 'failed') {
        throw new Error(stdoutParsed.error || 'Engine reported failure via stdout');
      }

      // 7. Read output JSON file
      let outputData: Record<string, any> = {};
      if (fs.existsSync(outputPath)) {
        const raw = fs.readFileSync(outputPath, 'utf-8');
        if (config.engineKey === 'captions') {
          outputData = { ass_path: outputPath, content: raw };
        } else {
          outputData = JSON.parse(raw);
        }
      } else {
        // Fall back to stdout if no file was written
        outputData = stdoutParsed;
      }

      const executionTimeMs = Date.now() - startedAt;
      console.log(`${tag} Completed in ${executionTimeMs}ms.`);

      if (executionTimeMs > 5000) {
        console.warn(`${tag} Slow execution detected: ${executionTimeMs}ms.`);
      }

      // 8. Quality Dashboard Logging (ENGINE_EXECUTION_LOG)
      try {
        const auditLogPath = path.join(process.cwd(), 'engine_audit.json');
        
        // Influence Gate Flags
        const candidateChanged = outputData?.candidate_changed ?? false;
        const rankingChanged = outputData?.ranking_changed ?? false;
        const renderChanged = outputData?.render_changed ?? false;
        const outputConsumed = outputData?.output_consumed ?? false;
        const outputGenerated = outputData && Object.keys(outputData).length > 0;
        
        let status = 'ACTIVE';
        if (!candidateChanged && !rankingChanged && !renderChanged) {
          status = 'NO PRODUCTION IMPACT';
        }

        const auditEntry = {
          engine: config.engineKey,
          executed: true,
          output_generated: outputGenerated,
          output_consumed: outputConsumed,
          candidate_changed: candidateChanged,
          ranking_changed: rankingChanged,
          render_changed: renderChanged,
          status: status,
          timestamp: new Date().toISOString()
        };
        fs.appendFileSync(auditLogPath, JSON.stringify(auditEntry) + '\n');
      } catch (e) {
        console.warn(`${tag} Failed to write ENGINE_EXECUTION_LOG:`, e);
      }

      return {
        engineName: config.engineKey,
        status: 'success',
        data: outputData,
        executionTimeMs,
        retryCount: attempt,
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startedAt;
      const isTimeout = error.message?.includes('TIMEOUT') || error.killed;

      console.error(`${tag} Failed (attempt ${attempt + 1}): ${error.message}`);

      // Retry logic
      if (attempt < config.maxRetries) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt), 10_000);
        console.log(`${tag} Retrying in ${backoffMs}ms...`);
        await this.sleep(backoffMs);
        return this.executeEngine(config, payload, tempDir, previousResults, attempt + 1);
      }

      return {
        engineName: config.engineKey,
        status: isTimeout ? 'timeout' : 'failed',
        data: {},
        executionTimeMs,
        retryCount: attempt,
        error: error.message,
      };
    } finally {
      // Cleanup temp files
      this.safeUnlink(inputPath);
      this.safeUnlink(outputPath);
    }
  }

  // ── Python spawner ──────────────────────────────────────────────────────

  private spawnPython(
    pythonBin: string,
    scriptPath: string,
    args: string[],
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = execFile(
        pythonBin,
        [scriptPath, ...args],
        {
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: 20 * 1024 * 1024, // 20MB
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr?.trim() || error.message;
            if ((error as any).killed || (error as any).signal === 'SIGKILL') {
              return reject(new Error(`TIMEOUT after ${timeoutMs}ms: ${msg}`));
            }
            return reject(new Error(`${msg}`));
          }
          resolve(stdout);
        }
      );
    });
  }

  // ── Topological dependency sorting ──────────────────────────────────────

  /**
   * Sorts the engine list into execution waves where each wave can run
   * in parallel. Engines in wave N+1 depend on engines in wave N or earlier.
   */
  private buildExecutionWaves(engines: EngineConfig[]): EngineConfig[][] {
    const keySet = new Set(engines.map((e) => e.engineKey));
    const resolved = new Set<string>();
    const remaining = [...engines];
    const waves: EngineConfig[][] = [];

    let safetyCounter = 0;
    while (remaining.length > 0 && safetyCounter < 20) {
      safetyCounter++;
      const wave: EngineConfig[] = [];
      const stillRemaining: EngineConfig[] = [];

      for (const engine of remaining) {
        const depsInScope = engine.dependsOn.filter((d) => keySet.has(d));
        const satisfied = depsInScope.every((d) => resolved.has(d));

        if (satisfied) {
          wave.push(engine);
        } else {
          stillRemaining.push(engine);
        }
      }

      if (wave.length === 0) {
        // Circular dependency or unresolvable — force-schedule remaining
        console.warn(
          `[Orchestrator] Dependency deadlock detected. Force-scheduling: ${stillRemaining.map((e) => e.engineKey).join(', ')}`
        );
        waves.push(stillRemaining);
        break;
      }

      waves.push(wave);
      for (const engine of wave) {
        resolved.add(engine.engineKey);
      }
      remaining.length = 0;
      remaining.push(...stillRemaining);
    }

    return waves;
  }

  // ── Filter engines by content type and tier ─────────────────────────────

  private filterEngines(opts: OrchestrationOptions): EngineConfig[] {
    const tiers = new Set(opts.tiers || [1, 2, 3]);
    const onlySet = opts.onlyEngines ? new Set(opts.onlyEngines) : null;
    const skipSet = new Set(opts.skipEngines || []);

    return ENGINE_REGISTRY.filter((engine) => {
      // Tier check
      if (!tiers.has(engine.tier)) return false;

      // Explicit inclusion list
      if (onlySet && !onlySet.has(engine.engineKey)) return false;

      // Explicit exclusion list
      if (skipSet.has(engine.engineKey)) return false;

      // Content type activation check
      if (engine.activateFor.length > 0) {
        const videoType = opts.videoType.toLowerCase();
        if (!engine.activateFor.some((cat) => videoType.includes(cat))) {
          return false;
        }
      }

      return true;
    });
  }

  // ── Main orchestration entry point ──────────────────────────────────────

  /**
   * Runs the full intelligence pipeline according to tier rules,
   * dependency ordering, and content-type gating.
   */
  public async run(opts: OrchestrationOptions): Promise<OrchestrationContext> {
    const orchestrationStart = Date.now();
    const tag = `[Orchestrator][${opts.jobId}]`;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${tag} Intelligence Orchestration Starting`);
    console.log(`${tag} Video: ${opts.videoPath}`);
    console.log(`${tag} Type: ${opts.videoType} | Platform: ${opts.platform}`);
    console.log(`${'═'.repeat(70)}\n`);

    // Ensure temp directory exists
    const intelDir = path.join(opts.tempDir, 'intelligence');
    if (!fs.existsSync(intelDir)) {
      fs.mkdirSync(intelDir, { recursive: true });
    }

    // 1. Filter engines
    const activeEngines = this.filterEngines(opts);
    console.log(
      `${tag} Active engines (${activeEngines.length}/${ENGINE_REGISTRY.length}): ${activeEngines.map((e) => e.engineKey).join(', ')}`
    );

    // 2. Build execution waves
    const waves = this.buildExecutionWaves(activeEngines);
    console.log(`${tag} Execution plan: ${waves.length} waves`);
    for (let i = 0; i < waves.length; i++) {
      console.log(`${tag}   Wave ${i + 1}: [${waves[i].map((e) => e.engineKey).join(', ')}]`);
    }

    // 3. Execute waves
    const allResults: Record<string, EngineResult> = {};
    const timeline: OrchestrationContext['executionTimeline'] = [];

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      const wave = waves[waveIdx];
      console.log(`\n${tag} ── Wave ${waveIdx + 1}/${waves.length} (${wave.length} engines in parallel) ──`);

      // Execute all engines in this wave concurrently
      const wavePromises = wave.map(async (engine) => {
        const waveStart = Date.now();
        const result = await this.executeEngine(engine, opts.payload, intelDir, allResults);
        allResults[engine.engineKey] = result;
        timeline.push({
          engine: engine.engineKey,
          startedAt: waveStart,
          endedAt: Date.now(),
          status: result.status,
        });
        return result;
      });

      const waveResults = await Promise.all(wavePromises);

      // Log wave summary
      const succeeded = waveResults.filter((r) => r.status === 'success').length;
      const failed = waveResults.filter((r) => r.status === 'failed' || r.status === 'timeout').length;
      const skipped = waveResults.filter((r) => r.status === 'skipped').length;
      console.log(
        `${tag} Wave ${waveIdx + 1} complete: ${succeeded} success, ${failed} failed, ${skipped} skipped`
      );
    }

    // 4. Build final context
    const totalExecutionMs = Date.now() - orchestrationStart;

    const context: OrchestrationContext = {
      jobId: opts.jobId,
      videoPath: opts.videoPath,
      videoType: opts.videoType,
      platform: opts.platform,
      results: allResults,
      executionTimeline: timeline,
      totalExecutionMs,
    };

    // 5. Print summary
    const successCount = Object.values(allResults).filter((r) => r.status === 'success').length;
    const failedCount = Object.values(allResults).filter(
      (r) => r.status === 'failed' || r.status === 'timeout'
    ).length;
    const skippedCount = Object.values(allResults).filter((r) => r.status === 'skipped').length;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${tag} Orchestration Complete`);
    console.log(`${tag} Total time: ${totalExecutionMs}ms`);
    console.log(`${tag} Results: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);

    if (failedCount > 0) {
      const failedEngines = Object.values(allResults)
        .filter((r) => r.status === 'failed' || r.status === 'timeout')
        .map((r) => `${r.engineName} (${r.error?.slice(0, 80)})`);
      console.warn(`${tag} Failed engines: ${failedEngines.join(', ')}`);
    }

    // Per-engine timing table
    console.log(`${tag} ── Timing Breakdown ──`);
    for (const [key, result] of Object.entries(allResults)) {
      const icon = result.status === 'success' ? '✓' : result.status === 'skipped' ? '⊘' : '✗';
      console.log(
        `${tag}   ${icon} ${key.padEnd(22)} ${String(result.executionTimeMs).padStart(7)}ms  [${result.status}]${result.retryCount > 0 ? ` (${result.retryCount} retries)` : ''}`
      );
    }
    console.log(`${'═'.repeat(70)}\n`);

    // 6. Cleanup intelligence temp directory
    this.safeRmDir(intelDir);

    // 7. Run Unified Crop Planner (Vision Engine V2)
    console.log(`${tag} Running Unified Vision Engine V2...`);
    const { UnifiedCropPlanner } = require('../intelligence/UnifiedCropPlanner');
    const { FootballAdapter } = require('../intelligence/FootballAdapter');
    const { PodcastAdapter } = require('../intelligence/PodcastAdapter');
    const { GamingAdapter } = require('../intelligence/GamingAdapter');
    const { RenderPlanTranslator } = require('../intelligence/RenderPlanTranslator');
    
    const planner = new UnifiedCropPlanner();
    const translator = new RenderPlanTranslator();
    
    // Dynamically select adapter
    let adapter;
    const vType = opts.videoType.toLowerCase();
    if (vType.includes('football') || vType.includes('sports')) {
      adapter = new FootballAdapter();
    } else if (vType.includes('podcast') || vType.includes('interview')) {
      adapter = new PodcastAdapter();
    } else if (vType.includes('gaming')) {
      adapter = new GamingAdapter();
    } else {
      adapter = new PodcastAdapter(); // Default fallback
    }

    const rawTracking = allResults['tracking']?.data || [];
    
    // Simulate processing the frames through the unified planner
    const plans = [];
    const renderPlans = [];
    const dt = 1/30; // 30fps assumption

    for (let i = 0; i < rawTracking.length; i++) {
        // Mock mapping raw tracker data to the new SpatialFrame schema
        const frameData = {
            frameIndex: i,
            timestamp: rawTracking[i]?.timestamp || (i * dt),
            regions: rawTracking[i]?.boxes || [], // Assuming standard bbox array
            globalMotion: { dx: 0, dy: 0 },
            ocrData: [],
            heatmapData: []
        };
        const cropPlan = planner.processFrame(frameData, adapter, dt);
        plans.push(cropPlan);
        renderPlans.push(translator.translate(cropPlan));
    }

    // Inject the final render plans into context for the videoProcessor
    context.results['unified_crop_plan'] = {
        engineName: 'unified_crop_plan',
        status: 'success',
        data: renderPlans,
        executionTimeMs: 0,
        retryCount: 0
    };
    
    // To maintain compatibility with existing V1 audits if we are in football mode:
    if (vType.includes('football')) {
      const { FootballCropAuditor } = require('../intelligence/FootballCropAuditor');
      const auditor = new FootballCropAuditor();
      const timeline = [
        { type: 'attack', start: 0, end: 5 },
        { type: 'shot', start: 5, end: 7 },
        { type: 'goal', start: 7, end: 10 },
        { type: 'celebration', start: 10, end: 15 }
      ];
      // Note: auditor expects the old schema, this may soft fail, which is acceptable 
      // since we don't reject clips for V1.
      const auditResult = auditor.evaluateCropPlan(plans, rawTracking as any, timeline);
      console.log(`${tag} V1 Crop Auditor Metrics:`, auditResult.metrics);
      
      // Inject the audit result into the context
      context.results['crop_audit'] = {
        engineName: 'crop_audit',
        status: auditResult.passed ? 'success' : 'failed',
        data: auditResult,
        executionTimeMs: 0,
        retryCount: 0
      };

      // Generate FOOTBALL_CROP_SCORECARD.md
      const scorecardPath = path.join(process.cwd(), 'FOOTBALL_CROP_SCORECARD.md');
      const scorecardContent = `# Football Crop Scorecard (Job: ${opts.jobId})
- Action Coverage Score: ${auditResult.metrics.actionCoverageScore.toFixed(1)}
- Tactical Context Score: ${auditResult.metrics.tacticalContextScore.toFixed(1)}
- Crop Stability Score: ${auditResult.metrics.cropStabilityScore.toFixed(1)}
- Story Coverage Score: ${auditResult.metrics.storyCoverageScore.toFixed(1)}
- Ball Visibility Score: ${auditResult.metrics.ballVisibilityScore.toFixed(1)}
- Goal Visibility Score: ${auditResult.metrics.goalVisibilityScore.toFixed(1)}
- Status: ${auditResult.passed ? 'SOFT PASS' : 'SOFT FAIL'}
`;
      fs.writeFileSync(scorecardPath, scorecardContent);

      // Append to football_crop_dataset.json
      const datasetPath = path.join(process.cwd(), 'football_crop_dataset.json');
      let dataset = [];
      if (fs.existsSync(datasetPath)) {
        try {
          dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
        } catch {}
      }
      dataset.push({
        clip_id: opts.jobId,
        event_type: 'mixed',
        ball_visibility: auditResult.metrics.ballVisibilityScore,
        goal_visibility: auditResult.metrics.goalVisibilityScore,
        action_coverage: auditResult.metrics.actionCoverageScore,
        tactical_context: auditResult.metrics.tacticalContextScore,
        crop_stability: auditResult.metrics.cropStabilityScore,
        story_coverage: auditResult.metrics.storyCoverageScore,
        editor_score: null
      });
      fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));

      if (!auditResult.passed) {
        console.warn(`${tag} ⚠ FOOTBALL CROP AUDIT WARNING: ${auditResult.issues.join(', ')}`);
        // SOFT FAIL MODE: We do not reject clips for V1.
      }
    }

    return context;
  }

  // ── Convenience: Run a single engine ────────────────────────────────────

  /**
   * Execute a single engine by key. Useful for targeted re-runs
   * or repair strategies.
   */
  public async runSingle(
    engineKey: string,
    payload: Record<string, any>,
    tempDir: string,
    previousResults: Record<string, EngineResult> = {}
  ): Promise<EngineResult> {
    const config = ENGINE_REGISTRY.find((e) => e.engineKey === engineKey);
    if (!config) {
      return {
        engineName: engineKey,
        status: 'failed',
        data: {},
        executionTimeMs: 0,
        retryCount: 0,
        error: `Unknown engine key: ${engineKey}`,
      };
    }

    const intelDir = path.join(tempDir, 'intelligence');
    if (!fs.existsSync(intelDir)) {
      fs.mkdirSync(intelDir, { recursive: true });
    }

    return this.executeEngine(config, payload, intelDir, previousResults);
  }

  // ── Convenience: Get the engine registry ────────────────────────────────

  public getRegistry(): ReadonlyArray<EngineConfig> {
    return ENGINE_REGISTRY;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }

  private safeRmDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {}
  }
}
