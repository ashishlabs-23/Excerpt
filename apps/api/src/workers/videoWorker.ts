import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { execFile } from 'child_process';

// Robust .env finder for monorepo environments
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
  console.log(`[Worker]: Godmode Env Loaded from ${foundEnv}`);
} else {
  dotenv.config();
}


import { VideoProcessor } from '../services/videoProcessor';
import { StorageService } from '../services/storageService';
import { DatabaseService } from '../services/supabaseService';
import { TranscriptionService, TranscriptionResult, WordInfo } from '../services/transcriptionService';
import { AIService } from '../services/aiService';
import { GraphBuilderService } from '../services/intelligence/GraphBuilderService';
import { EventGraphBuilder } from '../services/intelligence/EventGraphBuilder';
import { StoryBuilderService } from '../services/intelligence/StoryBuilderService';
import { CandidateGenerator } from '../services/intelligence/CandidateGenerator';
import { CriticEngine } from '../services/intelligence/CriticEngine';
import { PersonaRankingEngine } from '../services/intelligence/PersonaRankingEngine';
import { CaptionService } from '../services/captionService';
import { fallbackClipService } from '../services/fallbackClipService';
// Job state is owned exclusively by Supabase. Use db.updateJob() for all status mutations.
import { NexusRegistry } from '../services/nexus/NexusRegistry';
import { LearningService } from '../services/nexus/LearningService';
import { JobStateMachine, JobStatus } from '../utils/JobStateMachine';
import { NEXUS_FEATURES, isMultiModalEnabled, EXPERIMENTAL_FEATURES, isOrchestratorEnabled, ORCHESTRATOR_FEATURES, getActiveTiers } from '../config/features';
import { CategoryClassifier } from '../services/intelligence/CategoryClassifier';
import { createDefaultContext, PipelineContext } from '../services/intelligence/PipelineContext';
import { downloadEngine } from '../services/download';
import { EventEngine } from '../services/intelligence/EventEngine';
import { CrowdExcitementEngine } from '../services/intelligence/CrowdExcitementEngine';
import { CommentaryEmotionEngine } from '../services/intelligence/CommentaryEmotionEngine';
import { CelebrationDetector } from '../services/intelligence/CelebrationDetector';
import { ReplayDetector } from '../services/intelligence/ReplayDetector';
import { WowMomentEngine } from '../services/intelligence/WowMomentEngine';
import { SmartBoundaryEngine } from '../services/intelligence/SmartBoundaryEngine';
import { EmotionThumbnailEngine } from '../services/intelligence/EmotionThumbnailEngine';
import { installConsoleLogger, withLogContext } from '../services/logger';
import { assertSafeRemoteVideoUrl } from '../services/urlSafety';
import {
  buildSrtFromSegments,
  correctSpelling,
  rankClipCandidates,
  validateGeneratedFile,
  snapToSegmentBoundary,
  protectClipBoundaries,
} from '../services/pipelineUtils';
import { validateClip } from '../services/clipValidator';
// Voiceover process disabled in videoWorker as per the new isolated architecture.
import { broadcastGraphicsDetector } from '../services/intelligence/BroadcastGraphicsDetector';
import { visualDebugger } from '../services/intelligence/VisualDebugger';
import { narrativeIntelligenceEngine } from '../services/intelligence/NarrativeIntelligenceEngine';
import { curiosityGapEngine } from '../services/intelligence/CuriosityGapEngine';
import { payoffDetectionEngine } from '../services/intelligence/PayoffDetectionEngine';
import { emotionIntelligenceEngine } from '../services/intelligence/EmotionIntelligenceEngine';
import { retentionPredictionEngine } from '../services/intelligence/RetentionPredictionEngine';
import { viralPatternEngine } from '../services/intelligence/ViralPatternEngine';
import { clipCompletenessEngine } from '../services/intelligence/ClipCompletenessEngine';
import { viewerSatisfactionEngine } from '../services/intelligence/ViewerSatisfactionEngine';
import { universalWowMomentEngineV2 } from '../services/intelligence/UniversalWowMomentEngineV2';
import { learningSubsystem } from '../services/intelligence/LearningSubsystem';
import { IntelligenceOrchestrator, OrchestrationContext } from '../services/nexus/IntelligenceOrchestrator';
import { classifyError } from '../utils/errorClassifier';
import { TimelineEvent, JobDebugData, JobPerformanceMetrics } from '../types/diagnostics';

installConsoleLogger();

// yt-dlp cookies no longer required as we use Cobalt API

const processor = new VideoProcessor();
const storage = StorageService.getInstance();
const db = new DatabaseService();
const transcriptionService = new TranscriptionService();
const aiService = new AIService();
const captionService = new CaptionService();
const graphBuilderService = new GraphBuilderService();
const eventGraphBuilder = new EventGraphBuilder();
const storyBuilderService = new StoryBuilderService();
const candidateGenerator = new CandidateGenerator();
const criticEngine = new CriticEngine();
const personaRankingEngine = new PersonaRankingEngine();
const nexus = NexusRegistry.getInstance();
const learning = LearningService.getInstance();
const categoryClassifier = new CategoryClassifier();
const eventEngine = new EventEngine();
const crowdExcitementEngine = new CrowdExcitementEngine();
const commentaryEmotionEngine = new CommentaryEmotionEngine();
const celebrationDetector = new CelebrationDetector();
const replayDetector = new ReplayDetector();
const wowMomentEngine = new WowMomentEngine();
const smartBoundaryEngine = new SmartBoundaryEngine();
const emotionThumbnailEngine = new EmotionThumbnailEngine();

function envNumber(name: string, fallback: number, min: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

const JOB_MAX_ATTEMPTS = envNumber('EXCERPT_JOB_MAX_ATTEMPTS', 3, 1);
const JOB_RETRY_BASE_MS = envNumber('EXCERPT_JOB_RETRY_BASE_MS', 5000, 1000);
const JOB_RETRY_MAX_MS = Math.max(
  JOB_RETRY_BASE_MS,
  envNumber('EXCERPT_JOB_RETRY_MAX_MS', 60000, JOB_RETRY_BASE_MS)
);

interface PlannedClip {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  content: string;
  virality_score: number;
  clip_score?: number;
  hook?: string;
  summary?: string;
  reason?: string;
  face_focus_score?: number;
  score_breakdown?: {
    speech_energy?: number;
    emotion_score?: number;
    keyword_importance?: number;
    face_presence_score?: number;
    motion_intensity?: number;
  };
  isRecovery?: boolean;
}

interface StageMetric {
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'skipped' | 'failed';
  fallback_used?: boolean;
  error?: string;
  [key: string]: any;
}

function buildRecoveryClips(totalDuration: number, requestedClips: number): PlannedClip[] {
  const safeDuration = Math.max(1, Number.isFinite(totalDuration) ? Number(totalDuration.toFixed(2)) : 1);
  const clipCount = safeDuration < 20
    ? 1
    : Math.max(1, Math.min(requestedClips || 1, Math.max(1, Math.floor(safeDuration / 20) || 1)));
  const clipDuration = safeDuration < 30
    ? safeDuration
    : Math.min(45, Math.max(15, Math.floor(safeDuration / clipCount)));
  const availableWindow = Math.max(0, safeDuration - clipDuration);
  const step = clipCount === 1 ? 0 : availableWindow / (clipCount - 1);

  return Array.from({ length: clipCount }, (_, index) => {
    const start = Number(Math.max(0, index * step).toFixed(2));
    const end = Number(Math.min(safeDuration, start + clipDuration).toFixed(2));
    const recoverySummary = 'AI services were unavailable, so Excerpt generated a draft clip directly from the source timeline.';
    return {
      id: `recovery_clip_${index + 1}`,
      start_time: start,
      end_time: end,
      title: `Draft Clip ${index + 1}`,
      content: recoverySummary,
      virality_score: 72,
      clip_score: 72,
      hook: 'Excerpt generated a draft clip while AI analysis was unavailable.',
      summary: recoverySummary,
      reason: 'Recovery mode preserved a complete speaker-led segment when primary AI services were unavailable.',
      face_focus_score: 48,
      isRecovery: true,
    };
  });
}

function createPipelineMonitor() {
  return {
    startedAt: Date.now(),
    stages: {} as Record<string, StageMetric>,
    run: new Set<string>(),
    skipped: new Set<string>(),
    failed: new Set<string>(),
  };
}

function recordStage(
  monitor: ReturnType<typeof createPipelineMonitor>,
  stageKey: string,
  startedAtMs: number,
  status: StageMetric['status'],
  extra: Record<string, any> = {}
) {
  const durationMs = Date.now() - startedAtMs;
  monitor.stages[stageKey] = {
    durationMs,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    status,
    ...extra,
  } as StageMetric;

  if (status === 'success') {
    monitor.run.add(stageKey);
  } else if (status === 'skipped') {
    monitor.skipped.add(stageKey);
  } else {
    monitor.failed.add(stageKey);
  }

  if (durationMs > 2000) {
    console.warn(`[Pipeline] Slow stage detected: ${stageKey} -> ${durationMs}ms`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number) {
  const exponential = JOB_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(JOB_RETRY_MAX_MS, exponential + jitter);
}

function isPathInside(parentDir: string, candidatePath: string) {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function shouldCleanupUploadedSource(candidatePath: string) {
  const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
  return isPathInside(uploadDir, candidatePath);
}

/**
 * Generates an ASS subtitle file content from segments.
 */
/**
 * Generates an ASS subtitle file content from segments with premium styling and highlighting.
 */
function generateAssFile(segments: any[], clipStart: number, clipEnd: number): string {
  const highlightColor = '00FFFF'; // Yellow in ASS (BGR format: &H00<BB><GG><RR>)
  
  const header = `[Script Info]
Title: Excerpt Neural Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,110,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4.5,0,2,80,80,480,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments
    .filter(s => s.end > clipStart && s.start < clipEnd)
    .map((s, idx) => {
      const start = Math.max(0, s.start - clipStart);
      const end = Math.min(clipEnd - clipStart, s.end - clipStart);
      
      const formatTime = (t: number) => {
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 100);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
      };

      // Dynamic Word Highlighting
      const words = s.text.trim().toUpperCase().split(/\s+/);
      const processedText = words.map((word: string, wIdx: number) => {
        // Highlight approximately every 4th word or words longer than 7 chars
        const shouldHighlight = (wIdx + idx) % 4 === 0 || word.length > 7;
        if (shouldHighlight) {
          return `{\\1c&H${highlightColor}&}${word}{\\1c&HFFFFFF&}`;
        }
        return word;
      }).join(' ');

      // Positioned at 75% height (1440px from top)
      return `Dialogue: 0,${formatTime(start)},${formatTime(end)},Default,,0,0,0,,{\\pos(540,1440)}${processedText}`;
    })
    .join('\n');

  return header + events;
}

export const processVideoJob = async (jobId: string, data: any) => withLogContext({ jobId }, async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Worker]: Processing job ${jobId}`);
  console.log(`[Worker]: Video URL: ${data.videoUrl}`);
  console.log(`[Worker]: Requested clips: ${data.numClips || 3}`);
  console.log(`${'='.repeat(60)}\n`);

  // FFmpeg Health Check before starting
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', ['-version'], (err) => {
        if (err) {
          reject(new Error(`FFmpeg health check failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
    console.log(`[Worker]: FFmpeg binary is available and healthy.`);
  } catch (healthErr: any) {
    throw new Error(`CRITICAL STARTUP FAILURE: ${healthErr.message}`);
  }

  // AI Health Check before starting
  const aiService = new AIService();
  const isAiHealthy = await aiService.healthCheck();
  if (!isAiHealthy) {
    throw new Error(`AI_HEALTH_CHECK_FAILED: All AI providers exhausted`);
  }

  const monitor = createPipelineMonitor();
  let tempDir = '';
  let uploadedSourcePathToCleanup = '';
  const { EnvironmentInspector } = require('../services/download/EnvironmentInspector');
  const envSnapshot = await EnvironmentInspector.getSnapshot();

  const debugData: Record<string, any> = {
    schema_version: '1.0.0',
    workerId: process.env.RENDER_SERVICE_ID || process.env.HOSTNAME || require('os').hostname(),
    host: {
      hostname: require('os').hostname(),
      pid: process.pid,
      buildSha: process.env.RENDER_GIT_COMMIT || 'local',
      provider: process.env.RENDER ? 'render' : 'local',
      startedAt: new Date().toISOString()
    },
    environment: envSnapshot,
    run_id: jobId,
    timestamp: new Date().toISOString(),
    stages: {},
  };

  let isCancelled = false;
  // Start heartbeat interval to prevent job from being marked as stalled and check for user cancellation
  const heartbeatInterval = setInterval(async () => {
    try {
      const { data: jobRecord, error: fetchError } = await db.getSupabase().from('jobs').select('status').eq('id', jobId).single();
      if (!fetchError && jobRecord?.status === 'cancelled') {
        isCancelled = true;
      } else {
        await db.updateJob(jobId, { heartbeat_at: new Date().toISOString() });
      }
    } catch (err) {
      console.warn(`[Worker Heartbeat]: Failed to send heartbeat for job ${jobId}:`, err);
    }
  }, 20000);

  const checkCancellation = () => {
    if (isCancelled) {
      throw new Error('Job was cancelled by the user.');
    }
  };
  
  let clips: PlannedClip[] = [];
  const { AnalysisCacheService } = require('../services/analysis_cache_service');
  const cacheService = AnalysisCacheService.getInstance();
  const requiredVersions = {
    analysis_version: '3.0',
    ranking_version: '2.1',
    render_version: '1.7',
  };
  let videoHash = '';
  let isCacheHit = false;
  const { VideoMemoryService } = require('../services/video_memory_service');
  const memoryService = VideoMemoryService.getInstance();
  const clipAnalyses = new Map<string, any>();
  let stage6StartedAt = 0;
  let rankingDecision: any = null;
  let orchestrationContext: any = null;
  let recoveryReason: string | undefined;
  let recoveryMode = false;
  let generationMode: 'ai' | 'heuristic' | 'recovery' = 'ai';
  try {
    checkCancellation();
    // Update status to 'processing'
    try { await JobStateMachine.transition(db, jobId, JobStatus.PROCESSING, { progress: 0 }); } catch {}

    let videoUrl = String(data.videoUrl || '');
    const numClips = data.numClips || 3;
    const intent = data.intent || 'viral';
    const avoidSimilarClips = data.avoidSimilarClips || 'balanced'; // 'strict' | 'balanced' | 'explore'

    if (/^https?:\/\//i.test(videoUrl)) {
      videoUrl = await assertSafeRemoteVideoUrl(videoUrl);
    }

    // Load previously generated clip memories to avoid similarities
    let existingClipsMemories: any[] = [];
    try {
      const { data: mems } = await db.getSupabase()
        .from('generated_clip_memory')
        .select('start_time, end_time')
        .eq('video_url', videoUrl);
      if (mems) {
        existingClipsMemories = mems;
        console.log(`[Worker]: Loaded ${existingClipsMemories.length} existing clip memories to enforce diversity.`);
      }
    } catch (memErr: any) {
      console.warn('[Worker]: Failed to fetch generated clip memory:', memErr.message);
    }

    // Load historical timeline coverage to avoid overlap and discover new clips (Discovery Mode / Gallery Discovery)
    let excludedZones: { start: number; end: number }[] = [];
    try {
      const { data: coverageMems } = await db.getSupabase()
        .from('video_timeline_coverage')
        .select('start_time, end_time')
        .eq('video_id', videoUrl);
      if (coverageMems) {
        excludedZones = coverageMems.map((m: any) => ({
          start: m.start_time,
          end: m.end_time,
        }));
        console.log(`[Worker]: Loaded ${excludedZones.length} timeline coverage exclusion zones from database.`);
      }
    } catch (memErr: any) {
      console.warn('[Worker]: Failed to fetch timeline coverage exclusion zones:', memErr.message);
    }

    // â”€â”€ Phase 0: Persistent Cache Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const cacheKey = processor.getCacheKey(videoUrl);
    const cacheDir = path.join(process.cwd(), 'temp', 'cache', cacheKey);
    const cachedInputPath = path.join(cacheDir, 'input.mp4');
    const cachedTranscriptionPath = path.join(cacheDir, 'transcription.txt');
    
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    tempDir = path.join(process.cwd(), 'temp', jobId);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, 'input.mp4');
    const forceDraftMode = process.env.EXCERPT_FORCE_DRAFT_MODE === 'true';
    const userRequestedMode = data.generationMode || 'draft';
    const isDraftMode = forceDraftMode || userRequestedMode === 'draft';
    recoveryReason = undefined;
    recoveryMode = false;
    generationMode = 'ai';

    // ── Phase 1: Recovery / Retrieval ──────────────────────────
    const stage0StartedAt = Date.now();
    try { await JobStateMachine.transition(db, jobId, JobStatus.PROCESSING, { progress: 10 }); } catch {}
    
    // Check if videoUrl is a local file (multer path) or a URL
    const isLocal = fs.existsSync(videoUrl);
    let videoTitle = 'Unknown Video';
    let videoChannel = 'Unknown Channel';

    if (isLocal) {
      console.log(`[Worker]: Local file clone sequence active...`);
      fs.copyFileSync(videoUrl, inputPath);
      if (shouldCleanupUploadedSource(videoUrl)) {
        uploadedSourcePathToCleanup = videoUrl;
      }
    } else if (fs.existsSync(cachedInputPath)) {
      console.log(`[Worker]: 🧠 Neural Cache HIT! Reusing source from ${cachedInputPath}`);
      fs.copyFileSync(cachedInputPath, inputPath);
    } else {
      console.log(`[Worker]: 🛰️ Satellite Link Active -> Downloading from ${videoUrl}`);
      try {
        const dlResult = await processor.downloadVideo(videoUrl, cachedInputPath, async (percent: number, speed?: string, eta?: string, strategy?: string) => {
          // Map 0-100% download progress to 10%-40% overall pipeline progress
          const scaledProgress = 10 + Math.floor(percent * 0.3);
          
          const updatePayload: any = { progress: scaledProgress };
          
          // Expose rich diagnostic telemetry to the UI if available
          if (speed || eta || strategy) {
            updatePayload.debug_data = {
              ...debugData,
              stage: 'downloading',
              speed,
              eta,
              strategy,
              percent_complete: percent
            };
          }
          
          try { await db.updateJob(jobId, updatePayload); } catch {}
        });
        
        // ── Telemetry: persist download attempt array immediately so dashboard
        //    can surface strategy stats even if job fails later in the pipeline.
        debugData.download = { attempts: dlResult.attempts };
        try {
          await db.updateJob(jobId, {
            performance_metrics: {
              download_attempts: dlResult.attempts,
              download_ms: monitor.stages.stage_0_input?.durationMs ?? null,
            },
          });
        } catch (telErr: any) {
          console.warn('[Worker]: Non-fatal — failed to persist download_attempts early:', telErr.message);
        }
      } catch (dlError: any) {
        if (dlError.attempts) {
          debugData.download = { attempts: dlError.attempts };
          await db.updateJob(jobId, {
            debug_data: debugData,
            performance_metrics: { download_attempts: dlError.attempts },
          });
        }
        throw dlError;
      }
      
      // Copy to job-specific path for FFmpeg stability
      fs.copyFileSync(cachedInputPath, inputPath);
      console.log(`[Worker]: 🗄️ Source cached for future Neural Remixes.`);
    }
    
    const videoSize = fs.statSync(inputPath).size;
    console.log(`[Worker]: Vector data ready: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
    const sourceDuration = await processor.getVideoDuration(inputPath);
    console.log(`[Worker]: Source duration: ${sourceDuration.toFixed(2)} seconds`);

    // Fetch video metadata for hash generation if possible (falls back safely)
    try {
      if (!isLocal && /^https?:\/\//i.test(videoUrl)) {
        const metadata = await processor.getVideoMetadata(videoUrl);
        videoTitle = metadata.title || videoTitle;
        videoChannel = metadata.channel || videoChannel;
      }
    } catch (metaErr) {
      console.warn('[Worker]: Video metadata lookup failed for hash generation, falling back.');
    }

    let cleanVideoUrl = videoUrl;
    try {
      const u = new URL(videoUrl);
      u.searchParams.delete('si');
      u.searchParams.delete('pp');
      cleanVideoUrl = u.toString();
    } catch (e) {}

    videoHash = cacheService.generateVideoHash(cleanVideoUrl, sourceDuration);
    console.log(`[Worker]: Video hash for caching: ${videoHash}`);

    // Check Cache Hit
    const cacheHit = await cacheService.getCache(videoHash, requiredVersions);
    let cachedClips: PlannedClip[] = [];
    if (cacheHit.rawAnalysis && cacheHit.candidateMoments) {
      console.log(`[Worker]: ðŸ§  Neural Cache HIT! Reusing cached video analysis for video hash: ${videoHash}`);
      isCacheHit = true;
      clips = cacheHit.candidateMoments;
      // We will copy cached values and bypass heavy generation stages
    }

    recordStage(monitor, 'stage_0_input', stage0StartedAt, 'success');
    debugData.stages.stage_0 = {
      source_duration_sec: Number(sourceDuration.toFixed(2)),
      execution_time_ms: monitor.stages.stage_0_input.durationMs,
    };

    // â”€â”€ Step 1: Transcription Retrieval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const stage1StartedAt = Date.now();
    let transcriptionText = '';
    let segments: any[] = [];
    let words: WordInfo[] = [];
    let pipelineContext: PipelineContext = createDefaultContext(jobId);

    if (cacheHit.rawAnalysis && cacheHit.candidateMoments) {
      console.log(`[Worker]: Bypassing analysis stages due to cache hit.`);
      transcriptionText = cacheHit.rawAnalysis.transcript || '';
      segments = cacheHit.rawAnalysis.segments || [];
      words = cacheHit.rawAnalysis.words || [];
      pipelineContext.category = cacheHit.rawAnalysis.category || { category: 'podcast', confidence: 1.0, fallback_used: true, signals: {} };
      clips = cacheHit.candidateMoments;
    } else {
      // Execute normal analysis and ranking sequence

      if (!forceDraftMode) {
        try {
          if (fs.existsSync(cachedTranscriptionPath)) {
          console.log(`[Worker]: ðŸ§  Semantic Cache HIT! Loading existing transcription.`);
          const cachedData = JSON.parse(fs.readFileSync(cachedTranscriptionPath, 'utf8'));
          const parsedGraph = typeof cachedData.graph === 'string' ? JSON.parse(cachedData.graph) : cachedData.graph;
          transcriptionText = cachedData.text || (parsedGraph?.transcript ? parsedGraph.transcript.map((s: any) => s.text).join(' ') : '');
          segments = cachedData.segments || (parsedGraph?.transcript ? parsedGraph.transcript.map((s: any) => ({ text: s.text, start: s.start, end: s.end, speaker: s.speaker })) : []);
          words = cachedData.words || [];
        } else {
          await JobStateMachine.transition(db, jobId, JobStatus.TRANSCRIBING, { progress: 20 });
          console.log(`[Worker]: 🌪️ Groq / Neural Decode & Spatial Graph Build START...`);
          
          const graph = await graphBuilderService.build(inputPath, sourceDuration);
          pipelineContext.vig = graph;

          console.log(`[Worker]: 🧠 Distilling VIG into Causal Event Graph...`);
          const eventGraph = eventGraphBuilder.build(graph);
          pipelineContext.eventGraph = eventGraph;

          console.log(`[Worker]: 📖 Story Builder reasoning over Event Graph...`);
          const storyGraph = await storyBuilderService.buildStoryGraph(graph, eventGraph);
          pipelineContext.storyGraph = storyGraph;

          console.log(`[Worker]: 🎬 Generating Candidates & Executing Critic...`);
          for (const story of storyGraph.stories) {
            candidateGenerator.generateCandidates(story);
            
            // Filter candidates using Critic
            story.candidate_ranges = story.candidate_ranges.filter(candidate => {
              const criticResult = criticEngine.evaluateCandidate(candidate, story, graph);
              if (!criticResult.approved) {
                console.log(`[Critic]: Rejected candidate for story ${story.id} - ${criticResult.reason}`);
                return false;
              }
              return true;
            });
          }

          console.log(`[Worker]: 🏆 Ranking Final Story Candidates (TikTok Persona)...`);
          const rankedCandidates = await personaRankingEngine.rank(storyGraph.stories, 'TikTok');
          pipelineContext.rankedCandidates = rankedCandidates;

          // Backwards compatibility for existing tools
          transcriptionText = graph.transcript.map(s => s.text).join(' ');
          segments = graph.transcript.map(s => ({
            text: s.text,
            start: s.start,
            end: s.end,
            speaker: s.speaker
          }));
          words = graph.transcript.flatMap(s => s.words) as any;

          // Serialize and cache the pipeline context for future bypassing
          const cacheData = {
            graph,
            eventGraph,
            storyGraph,
            rankedCandidates
          };
          fs.writeFileSync(cachedTranscriptionPath, JSON.stringify(cacheData, null, 2));

        }
      } catch (transcriptionError: any) {
        recoveryMode = true;
        recoveryReason = transcriptionError.message;
        await JobStateMachine.transition(db, jobId, JobStatus.RECOVERING, { progress: 35 });
        console.warn(`[Worker]: Transcription unavailable. Switching to draft clip recovery mode.`);
      }
    } else {
      recoveryReason = 'Draft mode forced for local/offline verification.';
      await JobStateMachine.transition(db, jobId, JobStatus.RECOVERING, { progress: 35 });
      console.warn(`[Worker]: Draft mode forced. Skipping transcription and AI analysis.`);
    }

    // Save transcription to database if it's new or updated
    if (transcriptionText) {
      try {
        await db.updateJob(jobId, {
          transcription: transcriptionText,
          transcription_status: 'completed',
          progress: 40
        });
        console.log(`[Worker]: Transcription state synchronized with DB.`);
      } catch (dbError: any) {
        console.warn(`[Worker]: Failed to save transcription to DB: ${dbError.message}`);
      }
    }
    recordStage(
      monitor,
      'stage_1_transcript',
      stage1StartedAt,
      transcriptionText ? 'success' : 'skipped',
      {
        fallback_used: !transcriptionText,
        error: recoveryReason,
      }
    );
    debugData.stages.stage_1 = {
      transcript_available: Boolean(transcriptionText),
      segment_count: segments.length,
      execution_time_ms: monitor.stages.stage_1_transcript.durationMs,
      fallback_used: !transcriptionText,
    };

    // â”€â”€ Stage 1.5: Category Intelligence Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Classifies video content type (podcast, football, cricket, etc.) so that
    // downstream stages can apply category-appropriate detection adapters.
    // Gated by EXCERPT_MULTIMODAL_ENABLED=true. Fails gracefully to 'podcast'.
    const stage15StartedAt = Date.now();
    // pipelineContext already instantiated above
    pipelineContext.transcript = transcriptionText;
    pipelineContext.transcriptSegments = segments;
    pipelineContext.words = words;
    pipelineContext.duration = sourceDuration;
    if (isMultiModalEnabled('classifier') && !isDraftMode) {
      try {
        const categoryResult = await categoryClassifier.classify(
          transcriptionText,
          inputPath,
          /* skipVisual */ process.env.EXCERPT_SKIP_VISUAL_CLASSIFIER === 'true'
        );
        pipelineContext.category = categoryResult;
        console.log(
          `[Stage 1.5]: Category â†’ '${ categoryResult.category }' (confidence: ${(categoryResult.confidence * 100).toFixed(1)}%${ categoryResult.fallback_used ? ' â€” fallback used' : '' })`
        );
      } catch (classifierError: any) {
        console.warn(`[Stage 1.5]: Classifier error (non-fatal, using podcast default): ${classifierError.message}`);
        pipelineContext.category.signals.transcript_signal = `error: ${classifierError.message}`;
      }
    } else {
      console.log(`[Stage 1.5]: Skipped (EXCERPT_MULTIMODAL_ENABLED not set).`);
    }
    pipelineContext.executionTimes.classifier = Date.now() - stage15StartedAt;
    debugData.stages.stage_1_5 = {
      enabled: isMultiModalEnabled('classifier'),
      category: pipelineContext.category.category,
      confidence: pipelineContext.category.confidence,
      fallback_used: pipelineContext.category.fallback_used,
      signals: pipelineContext.category.signals,
      execution_time_ms: pipelineContext.executionTimes.classifier,
    };

    // â”€â”€ Step 2: AI Detection (Burst Decode Sequence) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const stage3StartedAt = Date.now();
    try { await JobStateMachine.transition(db, jobId, JobStatus.DETECTING_CLIPS, { progress: 50 }); } catch {}
    console.log(`[SYNC] Llama-3.3 / AI Detection START -> Finding viral moments (Burst Sequence)...`);
    
    clips = [];
    let heuristicCandidates: PlannedClip[] = [];
    let isV2PipelineUsed = false;

    // Check if category is a sports/vlog/reaction category
    const isV2Category =
      pipelineContext.category.category !== 'podcast' &&
      pipelineContext.category.category !== 'interview' &&
      pipelineContext.category.category !== 'tutorial' &&
      pipelineContext.category.category !== 'documentary';

    if (isMultiModalEnabled('event_engine') && isV2Category && !isDraftMode) {
      if (pipelineContext.category.category === 'football') {
        console.log(`[Worker]: Category is 'football'. Initiating strict Football Boundary Ownership sequence...`);
        try {
          const orchestrator = IntelligenceOrchestrator.getInstance();
          const payload = { videoPath: inputPath, transcript: transcriptionText };
          
          const eventRes = await orchestrator.runSingle('football_events', payload, tempDir);
          let candidates = eventRes.data?.candidates || [];
          
          if (candidates.length > 0) {
            const storyRes = await orchestrator.runSingle('football_story', { ...payload, candidates }, tempDir, { football_events: eventRes });
            const scoreboardRes = await orchestrator.runSingle('scoreboard', { ...payload, candidates }, tempDir);
            const tensionRes = await orchestrator.runSingle('tension_curve', { ...payload, candidates }, tempDir);
            
            const outcomeRes = await orchestrator.runSingle('story_outcome', { ...payload, candidates }, tempDir, {
              football_events: eventRes,
              football_story: storyRes,
              scoreboard: scoreboardRes,
              tension_curve: tensionRes
            });
            let policyCandidates = outcomeRes.data?.story_candidates || candidates;

            const boundaryRes = await orchestrator.runSingle('boundary_optimizer', { ...payload, story_candidates: policyCandidates }, tempDir, {
              story_outcome: outcomeRes
            });
            
            candidates = boundaryRes.data?.optimized_candidates || policyCandidates;
          }

          if (candidates && candidates.length > 0) {
            isV2PipelineUsed = true;
            generationMode = 'ai';
            console.log(`[Worker]: Football intelligence yielded ${candidates.length} candidates. Calling LLM for title/description refinement...`);
            
            clips = await aiService.detectClips(
              transcriptionText,
              videoUrl,
              numClips,
              candidates,
              'football',
              excludedZones
            );
          } else {
            console.log(`[Worker]: Football intelligence yielded 0 candidates. Falling back...`);
          }
        } catch (v2Error: any) {
          console.error(`[Worker]: Football Boundary Ownership pipeline failed. Falling back...`, v2Error);
        }
      } else {
        console.log(`[Worker]: Category is '${pipelineContext.category.category}'. Initiating V2 Multi-Modal event detection pipeline...`);
        try {
          // 1. Crowd excitement timeline
          await crowdExcitementEngine.generateTimeline(inputPath, pipelineContext);
          // 2. Commentary emotions
          const cePromise = process.env.EXCERPT_NEXUS_COMMENTARY_EMOTION === 'true' 
            ? commentaryEmotionEngine.analyze(inputPath, pipelineContext)
            : Promise.resolve({});
          
          // 3. Replay detector
          await replayDetector.detect(inputPath, pipelineContext);
          
          // 4. Celebration detector (pose based)
          const celEvents = await celebrationDetector.detect(inputPath, pipelineContext);
          
          // 5. Run main Event Engine
          const detectedEvents = await eventEngine.detect(inputPath, pipelineContext);
          
          // Merge pose celebrations into events
          if (celEvents && celEvents.length > 0) {
            pipelineContext.events = [...pipelineContext.events, ...celEvents];
            // Sort chronologically
            pipelineContext.events.sort((a, b) => a.start - b.start);
          }

          // 6. Wow moment engine
          const wowMoments = wowMomentEngine.generateWowMoments(pipelineContext);

          // 6.5. Situation Engine (Phase 2)
          const { situationEngine } = require('../services/intelligence/SituationEngine');
          situationEngine.process(pipelineContext);

          // 6.6. Emotion, Tension & Editorial Preference Engines (Phase 4 & 5)
          const { emotionEngine } = require('../services/intelligence/EmotionEngine');
          const { tensionEngine } = require('../services/intelligence/TensionEngine');
          const { narrativeEngine } = require('../services/intelligence/NarrativeEngine');
          const { editorialPreferenceEngine } = require('../services/intelligence/EditorialPreferenceEngine');
          const { replaySequenceEngine } = require('../services/intelligence/ReplaySequenceEngine');
          const { clipQualityEngine } = require('../services/intelligence/ClipQualityEngine');
          
          emotionEngine.process(pipelineContext);
          tensionEngine.process(pipelineContext);
          replaySequenceEngine.process(pipelineContext); // Phase 8
          narrativeEngine.process(pipelineContext);
          editorialPreferenceEngine.process(pipelineContext);
          clipQualityEngine.evaluateClips(pipelineContext); // Phase 9

          if (pipelineContext.events.length > 0) {
            isV2PipelineUsed = true;
            generationMode = 'ai';
            console.log(`[Worker]: V2 event pipeline detected ${pipelineContext.events.length} events. Mapping to PlannedClips...`);
            
            // Map events to PlannedClip structure and deduplicate by boundary
            const uniqueClips: any[] = [];
            
            pipelineContext.events.forEach((event, idx) => {
              const boundary = smartBoundaryEngine.computeBoundary(event, pipelineContext);
              
              // Skip if we already have a clip with roughly the same semantic boundary
              const isDuplicate = uniqueClips.some(c => Math.abs(c.start_time - boundary.start) < 2.0);
              if (!isDuplicate) {
                const clipId = `v3-story-${idx}-${crypto.randomBytes(3).toString('hex')}`;
                uniqueClips.push({
                  id: clipId,
                  start_time: boundary.start,
                  end_time: boundary.end,
                  title: `${event.type.charAt(0).toUpperCase() + event.type.slice(1)} Story Sequence`,
                  content: `V3 Story Engine extracted narrative sequence resolving around a ${event.type}.`,
                  virality_score: Math.round((event.confidence || 0.8) * 100),
                  clip_score: Math.round((event.confidence || 0.8) * 100),
                  reason: `StoryGraph Engine mapped semantic boundaries from buildup to reaction.`,
                  isRecovery: false,
                });
              }
            });
            clips = uniqueClips;

            // Phase 5 Persistence: Fire and forget
            const { databasePersistenceEngine } = require('../services/intelligence/DatabasePersistenceEngine');
            const { storyGraphEngine } = require('../services/intelligence/StoryGraphEngine');
            const graph = storyGraphEngine.buildGraph(pipelineContext);
            databasePersistenceEngine.saveIntelligence(pipelineContext, graph, jobId);
          } else {
            console.log(`[Worker]: V2 event pipeline detected 0 events. Falling back to V1 transcript pipeline...`);
          }
        } catch (v2Error: any) {
          console.error(`[Worker]: V2 Multi-Modal pipeline failed. Falling back to V1 transcript pipeline...`, v2Error);
        }
      }
    }

    if (!isV2PipelineUsed) {
      if (segments.length > 0) {
        try {
          heuristicCandidates = fallbackClipService.detectClips({
            segments,
            videoUrl,
            numClips: Math.min(Math.max(numClips * 3, 4), 8),
            totalDuration: sourceDuration,
            excludedZones,
          });
        } catch (candidateError: any) {
          console.warn(`[Worker]: Candidate preselection unavailable: ${candidateError.message}`);
        }
      }

      if (!recoveryMode && transcriptionText.trim()) {
        try {
          clips = await aiService.detectClips(transcriptionText, videoUrl, numClips, heuristicCandidates, intent as any, excludedZones);
        } catch (aiError: any) {
          recoveryReason = aiError.message;
          console.warn(`[Worker]: AI Detection jitter detected. Attempting transcript-guided fallback...`);
          await JobStateMachine.transition(db, jobId, JobStatus.RECOVERING, {
            progress: 55,
            generation_mode: 'heuristic',
          });

          try {
            clips = heuristicCandidates.length > 0
              ? heuristicCandidates.slice(0, numClips)
              : fallbackClipService.detectClips({
                  segments,
                  videoUrl,
                  numClips,
                  totalDuration: sourceDuration,
                  excludedZones,
                });
            generationMode = 'heuristic';
            recoveryMode = false;
            console.log(`[Worker]: Heuristic fallback active. Generated ${clips.length} transcript-guided clip plans.`);
          } catch (fallbackError: any) {
            recoveryMode = true;
            generationMode = 'recovery';
            const fallbackReason = fallbackError?.message
              ? `${recoveryReason} Heuristic fallback failed: ${fallbackError.message}`
              : recoveryReason;
            recoveryReason = fallbackReason;
            console.warn(`[Worker]: Heuristic fallback unavailable. Initiating Neural Recovery...`);
            await JobStateMachine.transition(db, jobId, JobStatus.RECOVERING, {
              progress: 55,
              generation_mode: 'recovery',
            });
          }
        }
      }

      if (recoveryMode) {
        generationMode = 'recovery';
        clips = buildRecoveryClips(sourceDuration, numClips);
        console.log(`[Worker]: Recovery mode active. Generated ${clips.length} draft clip plans.`);
      }
    }

    // NEW: Snap all detected clips to transcript segment boundaries for clean cuts
    if (segments.length > 0) {
      console.log(`[Worker]: Aligning ${clips.length} clips with transcript boundaries...`);
      clips = clips.map(clip => {
        const snapped = snapToSegmentBoundary(
          clip.start_time * 1000,
          clip.end_time * 1000,
          segments.map(s => ({ start_ms: s.start * 1000, end_ms: s.end * 1000, text: s.text }))
        );
        return {
          ...clip,
          start_time: Number((snapped.startMs / 1000).toFixed(2)),
          end_time: Number((snapped.endMs / 1000).toFixed(2))
        };
      });
    }
    
    // Ensure every clip ID is a valid UUID so Supabase inserts for nexus_signals do not throw syntax errors
    clips = clips.map(clip => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clip.id);
      return {
        ...clip,
        id: isUuid ? clip.id : crypto.randomUUID()
      };
    });
    
    console.log(`[SYNC] Llama-3.3 / AI Detection DONE -> Successfully decoded ${clips.length} viral segments.`);
    recordStage(
      monitor,
      'stage_3_segment_generation',
      stage3StartedAt,
      clips.length > 0 ? 'success' : 'skipped',
      {
        fallback_used: generationMode !== 'ai',
        error: recoveryReason,
      }
    );
    debugData.stages.stage_3 = {
      clip_count: clips.length,
      generation_mode: generationMode,
      execution_time_ms: monitor.stages.stage_3_segment_generation.durationMs,
      fallback_used: generationMode !== 'ai',
    };
    
    // â”€â”€ Step 2.5: Neural Nexus Modular Analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const stageNexusStartedAt = Date.now();
    const clipAnalyses = new Map<string, any>();
    console.log(`[Nexus]: Initiating Modular Analysis for ${clips.length} segments in parallel...`);

    const nexusAnalysisPromises = clips.map(async (clip, idx) => {
      try {
        const clipDuration = clip.end_time - clip.start_time;

        // â”€â”€ Extract analysis frames for Stage 5b Cinematic Cropping â”€â”€
        let analysisDir: string | undefined;
        if (NEXUS_FEATURES.cinematic_cropping && clipDuration > 0) {
          analysisDir = path.join(tempDir, `frames_${clip.id}`);
          fs.mkdirSync(analysisDir, { recursive: true });
          try {
            await processor.extractAnalysisFrames(inputPath, clip.start_time, clipDuration, analysisDir);
          } catch (frameErr: any) {
            console.warn(`[Worker]: Frame extraction failed for clip ${idx + 1} (non-fatal): ${frameErr.message}`);
            analysisDir = undefined; // Fall through to center crop
          }
        }

        const clipSegments = segments.filter(s => s.start >= clip.start_time && s.end <= clip.end_time);
        const analysis = await nexus.analyzeClip(
          inputPath, transcriptionText, clipSegments,
          { runId: jobId, clipId: clip.id, isDraftMode },
          analysisDir,
          clipDuration
        );

        // Cleanup frames immediately after analysis to prevent disk bloat
        if (analysisDir) {
          try { fs.rmSync(analysisDir, { recursive: true, force: true }); } catch {}
        }

        (clip as any).enhancements = analysis.enhancements;
        (clip as any).nexus_metadata = analysis.metadata;
        clipAnalyses.set(clip.id, analysis);

        if (NEXUS_FEATURES.scoring_merge_enabled) {
          const oldScore = clip.virality_score;
          const offset = analysis.finalScoreOffset * 100;
          clip.virality_score = Math.min(100, Math.max(0, Math.round(oldScore + offset)));
          console.log(`[Nexus]: Clip ${idx + 1} Score Adjusted: ${oldScore} -> ${clip.virality_score} (Offset: ${offset.toFixed(1)})`);
        }

        learning.logResult(jobId, clip.id, clip.virality_score, analysis);

        const perClipSummary = analysis.metadata?.pipeline_summary || {};
        for (const stageKey of perClipSummary.run || []) {
          monitor.run.add(stageKey);
        }
        for (const stageKey of perClipSummary.skipped || []) {
          monitor.skipped.add(stageKey);
        }
        for (const stageKey of perClipSummary.failed || []) {
          monitor.failed.add(stageKey);
        }

        const stageTimes = analysis.metadata?.durationMs || {};
        for (const [stageKey, executionTime] of Object.entries(stageTimes)) {
          const status = (perClipSummary.failed || []).includes(stageKey)
            ? 'failed'
            : (perClipSummary.skipped || []).includes(stageKey)
              ? 'skipped'
              : 'success';
          const existing = monitor.stages[stageKey];
          if (!existing || Number(executionTime) > existing.durationMs) {
            monitor.stages[stageKey] = {
              durationMs: Number(executionTime) || 0,
              startedAt: new Date(Date.now() - (Number(executionTime) || 0)).toISOString(),
              finishedAt: new Date().toISOString(),
              status,
            };
          }
        }
      } catch (nexusError) {
        console.error(`[Nexus]: Analysis failed for clip ${idx + 1}, skipping.`, nexusError);
      }
    });

    await Promise.all(nexusAnalysisPromises);
    recordStage(
      monitor,
      'stage_2_to_12_nexus_modules',
      stageNexusStartedAt,
      clipAnalyses.size > 0 ? 'success' : 'skipped',
      {
        fallback_used: clipAnalyses.size !== clips.length,
      }
    );
    
    if (clips.length === 0) {
      console.error(`[SYNC] Llama-3.3 / AI Detection FAILED -> No clips found in transcription.`);
      throw new Error('AI returned 0 clips. The transcription may have been too short or empty.');
    }

    // â”€â”€ Intelligence Orchestrator: Python Engine Bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    orchestrationContext = null;
    if (isOrchestratorEnabled() && !isDraftMode) {
      const orchStartedAt = Date.now();
      console.log(`[Intelligence Orchestrator]: Launching Python intelligence pipeline...`);
      try {
        const orchestrator = IntelligenceOrchestrator.getInstance();
        const orchPayload: Record<string, any> = {
          job_id: jobId,
          video_path: inputPath,
          video_type: pipelineContext.category.category,
          platform: 'tiktok',
          duration: sourceDuration,
          transcript: transcriptionText,
          segments: segments.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text,
          })),
          words: words.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          clips: clips.map((c: any) => ({
            id: c.id,
            start_time: c.start_time,
            end_time: c.end_time,
            title: c.title,
            virality_score: c.virality_score,
          })),
          events: pipelineContext.events || [],
          category: pipelineContext.category,
        };

        orchestrationContext = await orchestrator.run({
          jobId,
          videoPath: inputPath,
          videoType: pipelineContext.category.category,
          platform: 'tiktok',
          tempDir,
          payload: orchPayload,
          tiers: getActiveTiers(),
        });

        // Merge successful engine outputs into PipelineContext for downstream use
        if (ORCHESTRATOR_FEATURES.merge_results && orchestrationContext) {
          for (const [engineKey, result] of Object.entries(orchestrationContext.results)) {
            const res = result as any;
            if (res.status === 'success' && res.data) {
              (pipelineContext as any)[`orch_${engineKey}`] = res.data;
            }
          }
          console.log(`[Intelligence Orchestrator]: Merged ${Object.keys(orchestrationContext.results).length} engine outputs into pipeline context.`);
        }

        recordStage(monitor, 'stage_intelligence_orchestrator', orchStartedAt, 'success');
      } catch (orchError: any) {
        console.error(`[Intelligence Orchestrator]: Pipeline failed (non-fatal): ${orchError.message}`);
        recordStage(monitor, 'stage_intelligence_orchestrator', orchStartedAt, 'failed', {
          error: orchError.message,
        });
      }
    } else {
      console.log(`[Intelligence Orchestrator]: Skipped (EXCERPT_ORCHESTRATOR_ENABLED not set).`);
      monitor.skipped.add('stage_intelligence_orchestrator');
    }

    // Run Broadcast Graphics & Gameplay Density Engine (Phases 1-10)
    console.log(`[Graphics Engine]: Initiating Broadcast Graphics and Gameplay Density Engine...`);
    const visualFrames = (!isDraftMode && process.env.EXCERPT_NEXUS_BROADCAST_GRAPHICS === 'true') ? await broadcastGraphicsDetector.analyzeVideo(inputPath, pipelineContext) : [];
    
    // Map visual frames to context visual timeline
    pipelineContext.visualTimeline = visualFrames.map(vf => ({
      second: vf.second,
      segment_type: broadcastGraphicsDetector.classifySegment(vf, broadcastGraphicsDetector.calculateGraphicKeywordScore(vf.ocr_text), broadcastGraphicsDetector.calculateGameplayDensity(vf)),
      gameplay_density: broadcastGraphicsDetector.calculateGameplayDensity(vf),
      text_density: vf.text_density,
      motion_score: vf.motion_score
    }));

    // Output developer visual debugger timeline report
    if (!isDraftMode && process.env.EXCERPT_NEXUS_VISUAL_DEBUGGER === 'true') {
      visualDebugger.generateReport(visualFrames);
    }

    // Compute graphics intelligence metrics per clip candidate
    if (!pipelineContext.broadcastGraphics) {
      pipelineContext.broadcastGraphics = {};
    }

    for (const clip of clips) {
      const startSec = Math.floor(clip.start_time);
      const endSec = Math.ceil(clip.end_time);

      // Extract visual frames belonging to the clip's time range
      const clipFrames = visualFrames.filter(f => f.second >= startSec && f.second <= endSec);
      
      let avgTextDensity = 0;
      let avgMotion = 0;
      let avgPlayerCount = 0;
      let avgPlayerDensity = 0;
      let avgFieldConfidence = 0;
      let fieldVisibleCount = 0;
      let ocrConcatenated = '';

      if (clipFrames.length > 0) {
        avgTextDensity = clipFrames.reduce((sum, f) => sum + f.text_density, 0) / clipFrames.length;
        avgMotion = clipFrames.reduce((sum, f) => sum + f.motion_score, 0) / clipFrames.length;
        avgPlayerCount = clipFrames.reduce((sum, f) => sum + f.player_count, 0) / clipFrames.length;
        avgPlayerDensity = clipFrames.reduce((sum, f) => sum + f.player_density, 0) / clipFrames.length;
        avgFieldConfidence = clipFrames.reduce((sum, f) => sum + f.field_confidence, 0) / clipFrames.length;
        fieldVisibleCount = clipFrames.filter(f => f.field_visible).length;
        ocrConcatenated = clipFrames.map(f => f.ocr_text).filter(Boolean).join(' ');
      }

      const compositeFrame: any = {
        second: startSec,
        detected: clipFrames.length > 0 ? clipFrames.some(f => f.detected) : false,
        confidence: clipFrames.length > 0 ? Math.max(...clipFrames.map(f => f.confidence)) : 0.0,
        graphic_type: clipFrames.find(f => f.graphic_type !== 'none')?.graphic_type ?? 'none',
        text_density: isNaN(avgTextDensity) ? 0 : avgTextDensity,
        motion_score: isNaN(avgMotion) ? 0 : avgMotion,
        field_visible: fieldVisibleCount > (clipFrames.length / 2),
        field_confidence: isNaN(avgFieldConfidence) ? 0 : avgFieldConfidence,
        player_count: isNaN(avgPlayerCount) ? 0 : Math.round(avgPlayerCount),
        player_density: isNaN(avgPlayerDensity) ? 0 : avgPlayerDensity,
        ocr_text: ocrConcatenated
      };

      const ocrScore = broadcastGraphicsDetector.calculateGraphicKeywordScore(ocrConcatenated);
      const gameplayDensity = broadcastGraphicsDetector.calculateGameplayDensity(compositeFrame);
      let penalty = broadcastGraphicsDetector.calculateGraphicPenalty(compositeFrame, ocrScore);
      const visualSegment = broadcastGraphicsDetector.classifySegment(compositeFrame, ocrScore, gameplayDensity);

      // Event-Aware Graphics Preservation (Phase 9)
      const hasEventNearby = (pipelineContext.wowMoments || []).some(
        (w) => Math.abs(w.timestamp - clip.start_time) < 15.0 || Math.abs(w.timestamp - clip.end_time) < 15.0
      );

      let eventImportance = 0;
      if (hasEventNearby && penalty < 0) {
        penalty = 0; // Remove penalty
        eventImportance = 10; // Apply bonus
      }

      // Replay importance (Phase 10)
      const hasReplay = (pipelineContext.replaySegments || []).some(
        (r) => r.start >= clip.start_time && r.end <= clip.end_time
      );
      const replayImportance = hasReplay ? 25 : 0;

      pipelineContext.broadcastGraphics[clip.id] = {
        detected: compositeFrame.detected,
        confidence: compositeFrame.confidence,
        graphic_type: compositeFrame.graphic_type,
        gameplay_density: gameplayDensity,
        graphic_penalty: penalty,
        visual_segment: visualSegment
      };

      (clip as any).gameplay_density = gameplayDensity;
      (clip as any).graphic_penalty = penalty;
      (clip as any).replay_importance = replayImportance;
      (clip as any).event_importance = eventImportance;

      // Apply Clip Boundary Protection (Phase 12)
      const adjustedBoundary = protectClipBoundaries(clip.start_time, clip.end_time, pipelineContext);
      clip.start_time = adjustedBoundary.start;
      clip.end_time = adjustedBoundary.end;
    }

    // Run V3 Engines for all candidate clips before ranking
    if (EXPERIMENTAL_FEATURES.v3_engines) {
      console.log(`[V3 Engines]: Evaluating narrative, curiosity, payoff, emotion, retention, completeness, and viral patterns...`);
      universalWowMomentEngineV2.generate(pipelineContext);
      for (const clip of clips) {
        if (EXPERIMENTAL_FEATURES.narrative_engine) narrativeIntelligenceEngine.analyze(clip.id, clip.start_time, clip.end_time, pipelineContext);
        curiosityGapEngine.analyze(clip.id, clip.start_time, clip.end_time, pipelineContext);
        payoffDetectionEngine.analyze(clip.id, clip.start_time, clip.end_time, pipelineContext);
        emotionIntelligenceEngine.analyze(clip.id, clip.start_time, clip.end_time, pipelineContext);
        retentionPredictionEngine.predict(clip.id, clip.start_time, clip.end_time, pipelineContext);
        viralPatternEngine.classify(clip.id, clip.start_time, clip.end_time, pipelineContext);
        clipCompletenessEngine.analyze(clip.id, clip.start_time, clip.end_time, pipelineContext);
        viewerSatisfactionEngine.calculate(clip.id, pipelineContext);
      }
    }

    // Calculate timeline coverage percentage
    let timelineCoveragePercent = 0;
    if (sourceDuration > 0 && excludedZones.length > 0) {
      // Simple approximation of unique coverage seconds
      // Let's merge intervals to get the exact coverage seconds
      const sortedZones = [...excludedZones].sort((a, b) => a.start - b.start);
      let totalCoverageSeconds = 0;
      let currentStart = -1;
      let currentEnd = -1;

      for (const zone of sortedZones) {
        if (currentStart === -1) {
          currentStart = zone.start;
          currentEnd = zone.end;
        } else if (zone.start <= currentEnd) {
          currentEnd = Math.max(currentEnd, zone.end);
        } else {
          totalCoverageSeconds += (currentEnd - currentStart);
          currentStart = zone.start;
          currentEnd = zone.end;
        }
      }
      if (currentStart !== -1) {
        totalCoverageSeconds += (currentEnd - currentStart);
      }
      timelineCoveragePercent = (totalCoverageSeconds / sourceDuration) * 100;
      console.log(`[Worker]: Calculated video timeline coverage is ${timelineCoveragePercent.toFixed(1)}%`);
    }

    stage6StartedAt = Date.now();
    rankingDecision = rankClipCandidates(
      clips.map((clip, index) => {
        const analysis = clipAnalyses.get(clip.id);
        const satisfaction = pipelineContext.satisfaction?.[clip.id]?.satisfaction_score ?? 50;
        const retention = pipelineContext.retention?.[clip.id]?.retention_score ?? 50;
        const emotionArc = pipelineContext.emotionIntelligence?.[clip.id]?.arc_strength ?? 50;
        const narrativeScore = pipelineContext.narrative?.[clip.id]?.narrative_score ?? 50;
        const curiosity = pipelineContext.curiosity?.[clip.id]?.curiosity_score ?? 50;
        const payoff = pipelineContext.payoff?.[clip.id]?.payoff_strength ?? 50;

        return {
          id: clip.id,
          originalIndex: index,
          originalScore: Number((((clip.clip_score || clip.virality_score || 0) / 100)).toFixed(4)),
          audioScore: Number((analysis?.signals?.audio?.score || 0.5).toFixed(4)),
          faceScore: Number(((analysis?.signals?.face?.score ?? ((clip.face_focus_score || 50) / 100))).toFixed(4)),
          visualScore: Number((analysis?.signals?.visual?.score || 0.5).toFixed(4)),
          hookScore: Number((analysis?.signals?.hook?.score || 0.5).toFixed(4)),
          satisfactionScore: satisfaction / 100,
          retentionScore: retention / 100,
          emotionArcScore: emotionArc / 100,
          narrativeScore: narrativeScore / 100,
          curiosityScore: curiosity / 100,
          payoffScore: payoff / 100,
          gameplayDensity: ((clip as any).gameplay_density ?? 50) / 100,
          graphicPenalty: (clip as any).graphic_penalty ?? 0,
          replayImportance: (clip as any).replay_importance ?? 0,
          eventImportance: (clip as any).event_importance ?? 0,
        };
      }),
      clips[0]?.id,
      pipelineContext.category.category,
      timelineCoveragePercent
    );

    // Store V3 telemetry for feedback loop learning
    if (EXPERIMENTAL_FEATURES.boundary_learning) {
      for (const clip of clips) {
        try {
          await learningSubsystem.logTelemetry(
            jobId,
            clip.id,
            rankingDecision.scores[clip.id] || clip.virality_score,
            rankingDecision.reasonForSelection,
            pipelineContext
          );
        } catch (logErr) {
          console.warn(`[V3 Learning]: Skipped telemetry log for ${clip.id}:`, logErr);
        }
      }
    }

    // Apply Diversity Ranking & Overlap Exclusions (Two-Stage Checker)
    let finalSelectedClips: PlannedClip[] = [];
    const orderedClips = rankingDecision.orderedIds
      .map((clipId: string) => clips.find((clip: any) => clip.id === clipId))
      .filter((clip: any): clip is PlannedClip => Boolean(clip));

    // Determine overlap threshold based on avoidSimilarClips parameter
    const overlapThreshold = avoidSimilarClips === 'strict' ? 0.05 : avoidSimilarClips === 'balanced' ? 0.30 : 0.85;

    // Load VideoMemoryService
    const { VideoMemoryService } = require('../services/video_memory_service');
    const memoryService = VideoMemoryService.getInstance();

    for (const candidate of orderedClips) {
      if (finalSelectedClips.length >= numClips) break;

      // 1. Check overlap against currently selected clips in this run
      const localOverlap = finalSelectedClips.some(existing => {
        const overlap = Math.max(0, Math.min(existing.end_time, candidate.end_time) - Math.max(existing.start_time, candidate.start_time));
        const shorter = Math.max(1, Math.min(existing.end_time - existing.start_time, candidate.end_time - candidate.start_time));
        return (overlap / shorter) > overlapThreshold;
      });

      if (localOverlap) {
        console.log(`[Diversity Engine]: Skipping candidate ${candidate.id} (${candidate.start_time}s - ${candidate.end_time}s) due to local overlap conflict.`);
        continue;
      }

      // Stage 1 Check: Fast Time-Overlap Exclusion Zones check in Database
      let isOverlapDuplicate = false;
      try {
        isOverlapDuplicate = await memoryService.checkOverlap(videoUrl, candidate.start_time, candidate.end_time);
      } catch (err: any) {
        console.warn('[Diversity Engine] Stage 1 database overlap check failed, falling back to local memory logic:', err.message);
        // Fallback to local memory overlap logic if DB fails
        isOverlapDuplicate = existingClipsMemories.some(existing => {
          const overlap = Math.max(0, Math.min(existing.end_time, candidate.end_time) - Math.max(existing.start_time, candidate.start_time));
          const shorter = Math.max(1, Math.min(existing.end_time - existing.start_time, candidate.end_time - candidate.start_time));
          return (overlap / shorter) > overlapThreshold;
        });
      }

      if (isOverlapDuplicate) {
        console.log(`[Diversity Engine]: Skipping candidate ${candidate.id} (${candidate.start_time}s - ${candidate.end_time}s) due to time overlap exclusion zone with existing clips.`);
        continue;
      }

      // Stage 2 Check: Semantic Similarity Check (Slow Path)
      // Only execute slow path if Stage 1 (Time Overlap) check passes.
      // Compute temporary candidate embedding using AI service
      let isSemanticDuplicate = false;
      try {
        const textToEmbed = candidate.content || candidate.title;
        if (textToEmbed) {
          const embeddingResponse = await aiService.generateEmbedding(textToEmbed);
          if (embeddingResponse && embeddingResponse.embedding) {
            (candidate as any).temp_embedding = embeddingResponse.embedding;
            isSemanticDuplicate = await memoryService.checkSemanticSimilarity(videoUrl, embeddingResponse.embedding, 0.80);
          }
        }
      } catch (err: any) {
        console.warn('[Diversity Engine] Stage 2 semantic similarity check skipped due to error:', err.message);
      }

      if (isSemanticDuplicate) {
        console.log(`[Diversity Engine]: Skipping candidate ${candidate.id} (${candidate.start_time}s - ${candidate.end_time}s) due to semantic similarity overlap threshold (80%).`);
        continue;
      }

      finalSelectedClips.push(candidate);
    }

    // Fallback in case diversity filter pruned too aggressively
    if (finalSelectedClips.length === 0 && orderedClips.length > 0) {
      console.warn('[Diversity Engine]: Strict filters returned zero clips. Falling back to simple ordering.');
      finalSelectedClips = orderedClips.slice(0, numClips);
    }

    clips = finalSelectedClips;

    }


    recordStage(monitor, 'stage_6_ranking', stage6StartedAt, 'success');
    debugData.stage_6 = {
      top_segment_id: rankingDecision.topSegmentId,
      top_segment_score: rankingDecision.topSegmentScore,
      score_breakdown: rankingDecision.scoreBreakdown,
      weights_used: rankingDecision.weightsUsed,
      reason_for_selection: rankingDecision.reasonForSelection,
    };
    
    console.log(`[SYNC] FFmpeg / Clipping START -> Cutting ${clips.length} segments...`);
    
    // ─── Step 3: Enqueue Render Jobs ──────────────────────────
    const stage11StartedAt = Date.now();
    try { await JobStateMachine.transition(db, jobId, JobStatus.DETECTING_CLIPS, { progress: 60 }); } catch {}
    console.log(`[Worker]: Enqueueing ${clips.length} clips for renderWorker...`);
    
    const dbClips = [];
    const validationWarnings: string[] = [];

    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex];
      const clipId = clip.id;
      let renderStart = clip.start_time;
      let renderEnd = clip.end_time;
      let duration = renderEnd - renderStart;
      
      const shortSourceFloor = Math.max(1, Number(sourceDuration.toFixed(2)));
      const shortSourceSlack = sourceDuration < 30 ? Math.min(0.75, Math.max(0.25, sourceDuration * 0.08)) : 0;
      const minDuration = sourceDuration < 30 ? Math.max(2, Number((shortSourceFloor - shortSourceSlack).toFixed(2))) : clip.isRecovery ? 10.0 : 15.0;

      if (sourceDuration < 30 && duration >= Math.max(2, Number((sourceDuration * 0.72).toFixed(2))) && duration < shortSourceFloor) {
        renderStart = 0;
        renderEnd = shortSourceFloor;
        duration = renderEnd - renderStart;
      }
      
      if (duration < 14.9 && !clip.isRecovery && sourceDuration >= 30) {
        console.warn(`[Worker]: HARDWARE LOCK TRIPPED - Clip ${clipIndex + 1} (${duration.toFixed(1)}s) violated the 15s protocol. Discarding.`);
        continue;
      }

      if (duration < minDuration) {
        console.warn(`[Worker]: Clip ${clipIndex + 1} (${duration.toFixed(1)}s) is too short to render safely. Discarding.`);
        continue;
      }

      let cropPlan = (clip as any).nexus_metadata?.crop_plan || {};
      
      if (pipelineContext.category.category === 'football' && !isDraftMode) {
        if (EXPERIMENTAL_FEATURES.football_intelligence) {
          try {
            const orchestrator = IntelligenceOrchestrator.getInstance();
            const payload = { videoPath: inputPath, clipId, start_time: renderStart, end_time: renderEnd, cropPlan };
            const criticRes = await orchestrator.runSingle('ball_visibility_critic', payload, tempDir);
            const repairRes = await orchestrator.runSingle('ball_visibility_repair', { ...payload, critic: criticRes }, tempDir, { ball_visibility_critic: criticRes });
            const reframeRes = await orchestrator.runSingle('reframe_engine', { ...payload, repair: repairRes }, tempDir, { ball_visibility_repair: repairRes });
            const predictiveRes = await orchestrator.runSingle('predictive_crop_engine', { ...payload, reframe: reframeRes }, tempDir, { reframe_engine: reframeRes });

            if (predictiveRes.data?.crop_plan) {
               cropPlan = predictiveRes.data.crop_plan;
            }
          } catch (err: any) {
            console.warn(`[Worker]: Football Crop Ownership sequence failed for clip ${clipIndex + 1}.`, err.message);
          }
        }
      }

      // Compute global render hash for deduplication
      const crypto = require('crypto');
      const hashPayload = `${data.videoUrl}_${renderStart}_${renderEnd}_${JSON.stringify(cropPlan || {})}`;
      const candidateHash = crypto.createHash('md5').update(hashPayload).digest('hex');
      const generationKey = candidateHash;

      const clipTitle = (clip as any).enhancements?.title || clip.title || `Viral Fragment #${clipId.slice(0, 4)}`;
      const hookText = (clip as any).enhancements?.hook || clip.hook || clip.content;
      const summaryText = (clip as any).enhancements?.description || clip.summary || clip.content;
      const clipScore = clip.clip_score || clip.virality_score;

      // DB.1: Prepare Clip DB record
      const dbClip = {
        id: clipId,
        job_id: jobId,
        status: 'pending',
        environment: (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')),
        title: clipTitle,
        start_time: renderStart,
        end_time: renderEnd,
        storage_path: '',
        thumbnail_url: '',
        metadata: {
          title: clipTitle,
          hook: hookText,
          summary: summaryText,
          generation_key: generationKey,
          selection_reason: clip.reason,
          virality_score: clip.virality_score,
          clip_score: clipScore,
          score_breakdown: clip.score_breakdown,
          generation_mode: generationMode,
          nexus: (clip as any).nexus_metadata,
        }
      };
      
      // Check cache immediately to prevent queuing duplicate render jobs
      const cachedRender = await db.getRenderCache(candidateHash);
      
      // Override ID if clip already exists in DB to allow UPSERT matching on primary key
      const { data: existingClip } = await db.getSupabase().from('clips').select('id').eq('metadata->>generation_key', candidateHash).maybeSingle();
      if (existingClip) {
        dbClip.id = existingClip.id;
      }

      if (cachedRender) {
        console.log(`[Worker]: ⚡ L5 Cache HIT for clip ${clipId} during planning. Bypassing render queue.`);
        dbClip.status = 'uploaded';
        (dbClip as any).storage_path = cachedRender.storage_path;
        (dbClip as any).thumbnail_url = cachedRender.thumbnail_path;
        dbClips.push(dbClip);
        continue;
      }
      
      dbClips.push(dbClip);

      const renderJobData = {
        job_id: jobId,
        clip_id: dbClip.id,
        status: 'pending',
        environment: (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')),
        payload: {
          clipStart: renderStart,
          clipEnd: renderEnd,
          clipWords: (clip as any).words || [],
          cropPlan: cropPlan
        }
      };
      
      // Store in a separate array instead of modifying dbClip
      (dbClips as any)._pendingRenderJobs = (dbClips as any)._pendingRenderJobs || [];
      if (dbClip.status !== 'uploaded') {
        (dbClips as any)._pendingRenderJobs.push(renderJobData);
      }
    }

    if (dbClips.length === 0) {
      throw new Error('No clips were generated to enqueue.');
    }

    // Save Idempotent Clips FIRST so foreign keys don't fail
    await Promise.race([
      db.saveClips(dbClips),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PERSISTENCE_TIMEOUT')), 30000))
    ]);

    // Create Render Jobs AFTER clips are saved
    const pendingRenders = (dbClips as any)._pendingRenderJobs || [];
    for (const renderJobData of pendingRenders) {
      console.log(`[Worker]: Attempting to create render job for clip_id ${renderJobData.clip_id}`);
      await db.createRenderJob(renderJobData);
    }

    console.log(`[Worker]: ${dbClips.length} clips enqueued to render_jobs successfully.`);

    recordStage(monitor, 'stage_11_persistence', stage11StartedAt, 'success');

    const totalExecutionTimeMs = Date.now() - monitor.startedAt;

    const pipelineSummary = {
      modules_run: Array.from(monitor.run),
      modules_skipped: Array.from(monitor.skipped),
      modules_failed: Array.from(monitor.failed),
      total_execution_time_ms: totalExecutionTimeMs,
      validation_warnings: validationWarnings,
    };
    
    // Save to Analysis Cache
    try {
      await cacheService.setCache(videoHash, requiredVersions, {
        rawAnalysis: {
          transcript: transcriptionText,
          segments,
          words,
          category: pipelineContext.category,
        },
        candidateMoments: clips,
        renderPlans: dbClips.map(c => ({
          id: c.id,
          title: c.title,
          start_time: c.start_time,
          end_time: c.end_time,
          cropPlan: c.metadata?.nexus?.crop_plan,
        })),
        telemetry: {
          provider_used: aiService.lastTelemetry?.provider_used || 'unknown',
          provider_latency: aiService.lastTelemetry?.provider_latency || 0,
          cache_hit: isCacheHit,
          cache_version: requiredVersions.analysis_version,
        }
      });
    } catch (cacheSetErr: any) {
      console.warn('[Worker]: Non-fatal - failed to write to analysis cache:', cacheSetErr.message);
    }


    // ─── Step 4: Render-Proof Verification ──────────────────────────
    try { await JobStateMachine.transition(db, jobId, JobStatus.RENDERING, { progress: 85 }); } catch (err: any) { console.warn(`Failed to set rendering status: ${err.message}`) }
    console.log('[Worker]: Waiting for RenderWorker to complete clips...');
    let allRendered = false;
    let renderAttempts = 0;
    const maxRenderAttempts = 120; // 10 minutes max wait
    
    while (!allRendered && renderAttempts < maxRenderAttempts) {
      const { data: currentClips } = await db.getSupabase().from('clips').select('id, status, storage_path, thumbnail_url').in('id', dbClips.map((c: any) => c.id));
      const pending = currentClips?.filter(c => c.status !== 'uploaded' && c.status !== 'failed') || [];
      if (pending.length === 0) {
        allRendered = true;
        
        // Verification Gate
        const uploadedClips = currentClips?.filter(c => c.status === 'uploaded' && c.storage_path) || [];
        let validClipsCount = 0;

        for (const c of uploadedClips) {
          const videoExists = await storage.checkObjectExists(c.storage_path);
          const thumbExists = c.thumbnail_url ? await storage.checkObjectExists(c.thumbnail_url) : false;
          
          if (videoExists && thumbExists) {
            validClipsCount++;
          } else {
            console.warn(`[Worker]: Render verification failed for clip ${c.id}: Video Exists=${videoExists}, Thumb Exists=${thumbExists}`);
          }
        }

        if (validClipsCount === 0) {
           throw new Error('Render verification failed: No valid clips with verified storage paths were generated.');
        }
      } else {
        await sleep(5000);
        renderAttempts++;
      }
    }
    
    if (!allRendered) {
      throw new Error('Render-Proof Check timeout: RenderWorker did not complete clips in time.');
    }

    const usedFallbackMode = clips.some((c: any) => c.isRecovery);
    const finalStatus = 'completed';
    const finalDbClips = dbClips;
    const finalReason = usedFallbackMode ? recoveryReason : undefined;

    // ─── Step 5: Finalize ───────────────────────────────────────────
    await Promise.race([
      db.updateJob(jobId, {
        status: finalStatus,
        progress: 100,
        result: finalDbClips,
        generation_mode: generationMode,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PERSISTENCE_TIMEOUT')), 30000))
    ]).catch(err => {
      console.error(`[Worker]: ${err.message}`);
    });
    
    // Save clips to DB
    try {
      if (dbClips.length > 0) {
        const clipsToSave = dbClips.map((c: any) => ({
          id: c.id,
          job_id: c.job_id,
          thumbnail_url: c.thumbnail_url,
          title: c.title,
          start_time: c.start_time,
          end_time: c.end_time,
          metadata: c.metadata,
          status: c.status,
          storage_path: c.storage_path
        }));
        await db.saveClips(clipsToSave);
        console.log(`[Worker]: ${dbClips.length} clips successfully saved to Supabase`);

        for (const clip of dbClips) {
          try {
            const crypto = require('crypto');
            await memoryService.recordClipCoverage({
              video_id: videoUrl,
              start_time: clip.start_time,
              end_time: clip.end_time,
              clip_id: clip.id,
              transcript_hash: crypto.createHash('sha256').update((clip as any).caption || '').digest('hex'),
              story_signature: clip.metadata?.nexus?.story_signature || 'viral_moment',
              event_signature: clip.metadata?.nexus?.event_signature || 'moment',
              semantic_summary: (clip.metadata as any)?.description || (clip as any).caption,
              embedding: (clip as any).temp_embedding || null
            });
          } catch (memErr: any) {
            console.warn(`[Worker]: Primary timeline coverage write failed for clip ${clip.id} (likely UUID constraint): ${memErr.message}. Retrying with omitted clip_id.`);
            try {
              const crypto = require('crypto');
              await memoryService.recordClipCoverage({
                video_id: videoUrl,
                start_time: clip.start_time,
                end_time: clip.end_time,
                transcript_hash: crypto.createHash('sha256').update((clip as any).caption || '').digest('hex'),
                story_signature: clip.metadata?.nexus?.story_signature || 'viral_moment',
                event_signature: clip.metadata?.nexus?.event_signature || 'moment',
                semantic_summary: (clip.metadata as any)?.description || (clip as any).caption,
                embedding: (clip as any).temp_embedding || null
              });
            } catch (retryErr: any) {
              console.warn(`[Worker]: Fallback timeline coverage write failed: ${retryErr.message}`);
            }
          }
        }
      }
    } catch (dbError: any) {
      console.error(`[Worker]: CRITICAL - Failed to save clips to DB: ${dbError.message}`);
      throw dbError;
    }

    try {
      await JobStateMachine.transition(db, jobId, JobStatus.COMPLETED, {
        pipeline_summary: pipelineSummary,
        // ── Full performance_metrics: all stage timings + download attempt telemetry.
        //    Keys match what /api/system/dashboard and /api/system/jobs/retry-telemetry
        //    expect. Never delete existing keys — merge with spread so early writes survive.
        performance_metrics: {
          total: totalExecutionTimeMs,
          // Stage timings (milliseconds)
          download_ms:        monitor.stages.stage_0_input?.durationMs           ?? null,
          transcription_ms:   monitor.stages.stage_1_transcript?.durationMs      ?? null,
          ai_analysis_ms:     monitor.stages.stage_3_segment_generation?.durationMs ?? null,
          ranking_ms:         monitor.stages.stage_6_ranking?.durationMs          ?? null,
          // Nexus / multi-module stages
          nexus_ms:           monitor.stages.stage_2_to_12_nexus_modules?.durationMs ?? null,
          classification_ms:  monitor.stages.stage_1_5?.durationMs                ?? null,
          // Download strategy telemetry — the full DownloadAttempt[] array
          // consumed by DownloadStrategyExplorer and RetryTelemetryCard
          download_attempts: Array.isArray(debugData.download?.attempts)
            ? debugData.download.attempts
            : [],
          // Generation metadata
          generation_mode: generationMode,
          cache_hit:        isCacheHit,
        },
        debug_data: debugData,
      });
    } catch (telemetryErr: any) {
      console.warn(`[Worker]: Telemetry persistence failed (non-fatal): ${telemetryErr.message}`);
    }

    return {
      status: 'completed',
      progress: 100,
      result: dbClips,
      recoveryMode: usedFallbackMode,
      generationMode,
      recoveryReason,
      debug_data: debugData,
      pipeline_summary: pipelineSummary,
      totalExecutionTimeMs,
    };
  } catch (error: any) {
    const isCancel = error.message === 'Job was cancelled by the user.';
    const attempt = data.attempt || 1;
    const maxAttempts = data.maxAttempts || 3;
    const isFinalAttempt = attempt >= maxAttempts;
    const retryable = !isCancel && error.retryable !== false;
    const isTerminal = !retryable || isFinalAttempt || isCancel;
    
    const terminalStatus = isCancel ? JobStatus.CANCELLED : JobStatus.FAILED;
    console.error(`[Worker]: ❌ Job ${jobId} ${isCancel ? 'CANCELLED' : 'FAILED'} (Attempt ${attempt}/${maxAttempts}):`, error.message);
    const totalExecutionTimeMs = Date.now() - monitor.startedAt;
    const performanceMetrics = {
      total: totalExecutionTimeMs,
      // Stage timings — named consistently with success path and dashboard API expectations
      download_ms:        monitor.stages.stage_0_input?.durationMs           ?? null,
      transcription_ms:   monitor.stages.stage_1_transcript?.durationMs      ?? null,
      ai_analysis_ms:     monitor.stages.stage_3_segment_generation?.durationMs ?? null,
      ranking_ms:         monitor.stages.stage_6_ranking?.durationMs          ?? null,
      nexus_ms:           monitor.stages.stage_2_to_12_nexus_modules?.durationMs ?? null,
      classification_ms:  monitor.stages.stage_1_5?.durationMs                ?? null,
      // Download attempt telemetry — preserved on failure so strategy stats stay accurate
      download_attempts: (error as any).attempts
        ? (error as any).attempts
        : Array.isArray((debugData as any)?.download?.attempts)
          ? (debugData as any).download.attempts
          : [],
    };
    const pipelineSummary = {
      modules_run: Array.from(monitor.run),
      modules_skipped: Array.from(monitor.skipped),
      modules_failed: Array.from(new Set([...Array.from(monitor.failed), 'pipeline_failure'])),
      total_execution_time_ms: totalExecutionTimeMs,
      output_files: [],
    };

    const classifiedError = classifyError(error.stderr || error.message);
    const stderrTail = error.stderr ? error.stderr.split('\n').slice(-20).join('\n') : undefined;

    const debugData: JobDebugData = {
      stage: 'failed',
      operation: error.operation || 'unknown',
      exit_code: error.exitCode || 1,
      error_type: classifiedError.category,
      summary: classifiedError.summary,
      stderr_tail: stderrTail,
      timestamp: new Date().toISOString(),
      raw_message: error.message
    };

    try {
      if (isTerminal) {
        // IMPORTANT: If we are already in failed/cancelled state, do not override
        const { data: latestJob } = await db.getJob(jobId);
        if (latestJob?.status !== JobStatus.FAILED && latestJob?.status !== JobStatus.CANCELLED) {
          await JobStateMachine.transition(db, jobId, terminalStatus, {
            failed_reason: error.message,
            debug_data: debugData,
            performance_metrics: performanceMetrics,
            pipeline_summary: pipelineSummary,
          });
        }
      } else {
        // Option B: Keep job in PROCESSING during internal retries, but persist telemetry
        await db.updateJob(jobId, {
          debug_data: debugData,
          performance_metrics: performanceMetrics,
          pipeline_summary: pipelineSummary,
        });
      }
    } catch (dbError: any) {
      console.warn(`[Worker]: Failed to update job telemetry in DB: ${dbError.message}`);
    }

    return {
      status: isTerminal ? terminalStatus : JobStatus.PROCESSING,
      failedReason: error.message,
      retryable,
      totalExecutionTimeMs,
    };
  } finally {
    clearInterval(heartbeatInterval);
    if (tempDir) {
      try { const fs = require('fs'); fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }

    if (uploadedSourcePathToCleanup) {
      try { const fs = require('fs'); fs.rmSync(uploadedSourcePathToCleanup, { force: true }); } catch {}
    }
  }
});

let isPolling = false;
let stopRequested = false;

async function processClaimedJobWithRetries(job: any, workerId: number) {
  let payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? { ...job.payload } : {};
  
  const configuredMaxAttempts = Number(payload.maxAttempts || JOB_MAX_ATTEMPTS);
  const maxAttempts = Number.isFinite(configuredMaxAttempts) ? Math.max(1, configuredMaxAttempts) : JOB_MAX_ATTEMPTS;
  
  // Load existing attempts from payload if present
  let attemptsHistory: any[] = Array.isArray(payload.attempts) ? payload.attempts : [];
  let attempt = attemptsHistory.length;
  
  let lastResult: any = null;

  while (attempt < maxAttempts && !stopRequested) {
    attempt += 1;
    const attemptStartedAt = new Date().toISOString();
    
    // Update the DB immediately to reflect the start of the retry
    const currentAttemptObj = {
      attempt,
      startedAt: attemptStartedAt,
      worker: workerId,
      success: false,
    };
    
    const attemptPayload = {
      ...payload,
      attempts: [...attemptsHistory, currentAttemptObj],
      maxAttempts
    };

    const jobData = {
      videoUrl: job.youtube_url || job.video_url || job.url,
      numClips: job.num_clips || 3,
      ...payload,
      attempt,
      maxAttempts,
    };

    try {
      // Because we use Option B, the status is ALWAYS 'processing' when retrying.
      // This is allowed by the strict state machine trigger.
      await JobStateMachine.transition(db, job.id, JobStatus.PROCESSING, {
        progress: attempt === 1 ? Math.max(0, Number(job.progress || 0)) : 0,
        payload: attemptPayload,
      });
    } catch (err: any) {
      console.warn(`[Worker]: Failed to persist retry attempt ${attempt}/${maxAttempts} start:`, err.message);
    }

    console.log(`[Worker]: Attempt ${attempt}/${maxAttempts} starting for job ${job.id}`);
    
    let attemptDurationMs = 0;
    
    if (job.job_type === 'voiceover' || job.payload?.job_type === 'voiceover') {
      console.warn(`[Worker]: Ignoring voiceover job ${job.id} as videoWorker no longer handles voiceovers.`);
      lastResult = { status: 'failed', failedReason: 'Voiceovers are handled by a dedicated worker.', retryable: false, totalExecutionTimeMs: 0 };
    } else {
      lastResult = await processVideoJob(job.id, jobData);
    }
    
    attemptDurationMs = lastResult?.totalExecutionTimeMs || 0;
    
    // Finalize attempt
    const completedAt = new Date().toISOString();
    const isSuccess = lastResult?.status === 'completed';
    const retryable = lastResult?.retryable !== false;
    const failedReason = lastResult?.failedReason || (isSuccess ? undefined : 'Job failed before completion.');

    const finalizedAttemptObj = {
      ...currentAttemptObj,
      completedAt,
      success: isSuccess,
      retryable: isSuccess ? undefined : retryable,
      error: isSuccess ? undefined : failedReason,
      durationMs: attemptDurationMs
    };
    
    attemptsHistory.push(finalizedAttemptObj);
    payload = {
      ...payload,
      attempts: attemptsHistory,
      successfulAttempt: isSuccess ? attempt : undefined
    };

    if (isSuccess) {
      // The DB is already updated to completed by processVideoJob, but let's just make sure payload is synced
      try {
        await db.updateJob(job.id, { payload });
      } catch(e) {}
      return lastResult;
    }

    if (!retryable || attempt >= maxAttempts || stopRequested) {
      // Terminated. The DB was already updated to failed by processVideoJob.
      // Just sync the final payload
      payload.exhausted_at = new Date().toISOString();
      try {
        await db.updateJob(job.id, { payload });
      } catch (err: any) {
        console.warn(`[Worker]: Failed to sync terminal payload for ${job.id}:`, err.message);
      }
      return { ...lastResult, status: JobStatus.FAILED, failedReason };
    }

    const retryDelayMs = getRetryDelayMs(attempt);
    console.log(`[Worker]: Job ${job.id} failed attempt ${attempt}/${maxAttempts} - ${failedReason}. Retrying in ${retryDelayMs/1000}s...`);
    
    payload.next_retry_at = new Date(Date.now() + retryDelayMs).toISOString();
    
    // As requested: At the end of every retry cycle persist immediately!
    try {
      await db.updateJob(job.id, { payload });
    } catch(e: any) {
      console.warn(`[Worker]: Failed to persist retry payload for ${job.id}:`, e.message);
    }

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await sleep(retryDelayMs);
  }

  return lastResult;
}

let activeWorkers = 0;
const MAX_CONCURRENT_WORKERS = 5;

const pollForJobs = async (workerId: number) => {
  console.log(`[Worker-${workerId}]: 🟢 Polling started.`);
  while (!stopRequested) {
    try {
      const workerEnv = (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'));
      const job = await db.getNextQueuedJob(workerEnv);
      
      if (job) {
        console.log(`[Worker-${workerId}]: ⚡ Processing Job ${job.id}`);
        const result = await processClaimedJobWithRetries(job, workerId);
        if (result?.status === 'completed') {
          console.log(`[Worker-${workerId}]: ✅ Job ${job.id} finished.`);
        } else {
          console.warn(`[Worker-${workerId}]: Job ${job.id} ended with status ${result?.status || 'unknown'}.`);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (err: any) {
      console.error(`[Worker-${workerId}]: ❌ Error:`, err.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  console.log(`[Worker-${workerId}]: 🛑 Stopped.`);
};

export const startWorker = async () => {
  if (isPolling) {
    console.log('[Worker]: Neural Worker already running.');
    return;
  }

  isPolling = true;
  console.log(`[Worker]: 🚀 Gen-4 Cloud-Polling Worker Starting with Concurrency ${MAX_CONCURRENT_WORKERS}...`);

  // Start the stale job reclamation sweeper periodically (every 5 minutes)
  const sweeperInterval = setInterval(async () => {
    try {
      console.log('[Worker Sweeper]: Checking for stalled/orphaned jobs...');
      const reclaimedIds = await db.reclaimOrphanedJobs();
      if (reclaimedIds.length > 0) {
        console.log(`[Worker Sweeper]: Reclaimed ${reclaimedIds.length} orphaned jobs:`, reclaimedIds);
      }
    } catch (err: any) {
      console.error('[Worker Sweeper]: Sweeper loop encountered error:', err.message);
    }
  }, 5 * 60000);

  // Start concurrent polling loops
  const workerPromises = Array.from({ length: MAX_CONCURRENT_WORKERS }, (_, i) => pollForJobs(i + 1));
  
  // Wait for all to stop if stopRequested
  await Promise.all(workerPromises);
  
  clearInterval(sweeperInterval);
  isPolling = false;
  console.log(`[Worker]: 🛑 All workers stopped.`);
};

export const stopWorker = () => {
  stopRequested = true;
};

// Start if run directly
if (require.main === module) {
  startWorker().catch(err => {
    console.error('[Worker]: Fatal startup error:', err);
    process.exit(1);
  });
}
