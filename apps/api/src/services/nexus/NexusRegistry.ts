import { NEXUS_FEATURES } from '../../config/features';
import { AudioIntelligence } from './AudioIntelligence';
import { FaceTracking } from './FaceTracking';
import { VisualActivity } from './VisualActivity';
import { HookIntelligence } from './HookIntelligence';
import { ThumbnailIntelligence } from './ThumbnailIntelligence';
import { EnhancementService } from './EnhancementService';
import { CinematicCropping } from './CinematicCropping';

export interface NexusSignal {
  score: number;
  weight: number;
  reason: string;
  status?: 'success' | 'skipped';
  fallback_used?: boolean;
}

export interface NexusResult {
  finalScoreOffset: number;
  signals: Record<string, NexusSignal>;
  metadata: Record<string, any>;
  enhancements?: {
    hook: string;
    title: string;
    description: string;
    keywords: string;
    caption?: string;
    hashtags?: string[];
    fallback_used?: boolean;
  };
}

interface StageTracker {
  run: string[];
  skipped: string[];
  failed: string[];
  execution_time_ms: Record<string, number>;
}

interface AnalysisContext {
  runId?: string;
  clipId?: string;
  isDraftMode?: boolean;
}

export class NexusRegistry {
  private static instance: NexusRegistry;
  private audio = new AudioIntelligence();
  private face = new FaceTracking();
  private visual = new VisualActivity();
  private hook = new HookIntelligence();
  private thumbnail = new ThumbnailIntelligence();
  private enhancement = new EnhancementService();
  private cinematicCrop = new CinematicCropping();

  private constructor() {}

  public static getInstance(): NexusRegistry {
    if (!NexusRegistry.instance) {
      NexusRegistry.instance = new NexusRegistry();
    }
    return NexusRegistry.instance;
  }

  private createTracker(): StageTracker {
    return {
      run: [],
      skipped: [],
      failed: [],
      execution_time_ms: {},
    };
  }

  private async runStage<T extends Record<string, any>>(
    tracker: StageTracker,
    stageKey: string,
    runner: () => Promise<T> | T,
    fallback: T
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const result = await runner();
      const durationMs = Date.now() - startedAt;
      tracker.execution_time_ms[stageKey] = durationMs;
      if (durationMs > 2000) {
        console.warn(`[Nexus] Slow stage detected: ${stageKey} -> ${durationMs}ms`);
      }

      if (result?.status === 'skipped') {
        tracker.skipped.push(stageKey);
      } else {
        tracker.run.push(stageKey);
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      tracker.execution_time_ms[stageKey] = durationMs;
      tracker.failed.push(stageKey);
      console.error(`[Nexus] ${stageKey} failed:`, error);
      return fallback;
    }
  }

  public async analyzeClip(
    videoPath: string,
    transcript: string,
    segments: any[],
    context: AnalysisContext = {},
    analysisDir?: string,
    clipDuration?: number
  ): Promise<NexusResult> {
    const signals: Record<string, NexusSignal> = {};
    const metadata: Record<string, any> = {
      run_id: context.runId,
      clip_id: context.clipId,
      timestamp: new Date().toISOString(),
    };
    const tracker = this.createTracker();

    // ── Stage: Parallel Analysis ─────────────────────────────
    const parallelStages: Promise<void>[] = [];

    // Audio Intelligence
    if (NEXUS_FEATURES.audio_intelligence && !context.isDraftMode) {
      parallelStages.push(
        this.runStage(
          tracker,
          'stage_4_audio_analysis',
          () => this.audio.getSignal(videoPath),
          {
            score: 0.5,
            weight: 0,
            reason: 'Audio analysis skipped after error.',
            status: 'skipped',
            fallback_used: true,
          }
        ).then(res => { signals.audio = res; })
      );
    } else {
      tracker.skipped.push('stage_4_audio_analysis');
    }

    // Face Tracking
    if (NEXUS_FEATURES.face_tracking && !context.isDraftMode) {
      parallelStages.push(
        this.runStage(
          tracker,
          'stage_face_tracking',
          () => this.face.getSignal(videoPath),
          {
            score: 0.5,
            weight: 0,
            reason: 'Face analysis skipped after error.',
            status: 'skipped',
            fallback_used: true,
          }
        ).then(res => { signals.face = res; })
      );
    } else {
      tracker.skipped.push('stage_face_tracking');
    }

    // Visual Activity
    if (NEXUS_FEATURES.visual_activity && !context.isDraftMode) {
      parallelStages.push(
        this.runStage(
          tracker,
          'stage_5_visual_analysis',
          () => this.visual.getSignal(videoPath),
          {
            score: 0.5,
            weight: 0,
            reason: 'Visual analysis skipped after error.',
            status: 'skipped',
            fallback_used: true,
          }
        ).then(res => { signals.visual = res; })
      );
    } else {
      tracker.skipped.push('stage_5_visual_analysis');
    }

    // Hook Intelligence
    parallelStages.push(
      this.runStage(
        tracker,
        'stage_2_hook_intelligence',
        () => this.hook.getSignal(videoPath, transcript, segments),
        {
          score: 0.5,
          weight: 0,
          reason: 'Hook analysis skipped after error.',
          status: 'skipped',
          fallback_used: true,
        }
      ).then(res => { 
        signals.hook = res; 
        metadata.hook_needs_rewrite = (res?.score || 0) < 0.65;
      })
    );

    // Thumbnail Intelligence
    if (NEXUS_FEATURES.thumbnail_generator) {
      parallelStages.push(
        this.runStage(
          tracker,
          'stage_7_thumbnail',
          () => this.thumbnail.getSignal(videoPath),
          {
            score: 0,
            weight: 0,
            reason: 'Thumbnail selection skipped after error.',
            status: 'skipped',
            fallback_used: true,
          }
        ).then(res => { signals.thumbnail = res; })
      );
    } else {
      tracker.skipped.push('stage_7_thumbnail');
    }

    // Wait for all parallel stages to complete
    await Promise.all(parallelStages);

    // ── Stage: Sequential Analysis (Dependent) ─────────────────────

    // Cinematic Cropping (Dependent on frames being extracted)
    if (NEXUS_FEATURES.cinematic_cropping && analysisDir && clipDuration) {
      const cropResult = await this.runStage(
        tracker,
        'stage_5b_cinematic_crop',
        async () => {
          const result = await this.cinematicCrop.analyze(analysisDir, clipDuration);
          if (result.cropPlan) {
            metadata.crop_plan = result.cropPlan;
          }
          return result.signal;
        },
        {
          score: 0.5,
          weight: 0,
          reason: 'Cinematic crop analysis skipped after error.',
          status: 'skipped',
          fallback_used: true,
        }
      );
      signals.cinematic_crop = cropResult;
    } else {
      tracker.skipped.push('stage_5b_cinematic_crop');
    }

    const finalScoreOffset = await this.runStage(
      tracker,
      'stage_10_quality_guard',
      () => ({
        value: this.mergeSignals(signals),
        status: 'success' as 'success' | 'skipped',
      }),
      {
        value: 0,
        status: 'skipped',
      }
    );
    const totalScore = 0.7 + (finalScoreOffset.value || 0);
    metadata.is_high_quality = totalScore > 0.65;
    metadata.is_rejected = totalScore < 0.4 || (signals.visual?.score ?? 0.5) < 0.1;

    let enhancements = undefined;
    if (NEXUS_FEATURES.hook_rewrite || NEXUS_FEATURES.metadata_generator) {
      const hookScore = signals.hook?.score || 0.5;
      const [hookResult, metadataResult] = await Promise.all([
        NEXUS_FEATURES.hook_rewrite
          ? this.runStage(
              tracker,
              'stage_8_hook_rewrite',
              () =>
                this.enhancement.rewriteHook(
                  transcript,
                  'Viral Clip Candidate',
                  hookScore
                ),
              {
                hook: `${transcript.split(/\s+/).slice(0, 12).join(' ')}...`,
                status: 'skipped',
                fallback_used: true,
              }
            )
          : Promise.resolve({
              hook: `${transcript.split(/\s+/).slice(0, 12).join(' ')}...`,
              status: 'skipped' as const,
              fallback_used: false,
            }),
        NEXUS_FEATURES.metadata_generator
          ? this.runStage(
              tracker,
              'stage_9_metadata',
              () =>
                this.enhancement.generateMetadata(
                  transcript,
                  'Viral Clip Candidate'
                ),
              {
                title: 'Viral Clip Candidate',
                description: 'Viral clip from original source.',
                keywords: 'viral, podcast, moments',
                caption: 'Check this clip out.',
                hashtags: ['viral', 'shorts', 'clips'],
                status: 'skipped',
                fallback_used: true,
              }
            )
          : Promise.resolve({
              title: 'Viral Clip Candidate',
              description: 'Viral clip from original source.',
              keywords: 'viral, podcast, moments',
              caption: 'Check this clip out.',
              hashtags: ['viral', 'shorts', 'clips'],
              status: 'skipped' as const,
              fallback_used: false,
            }),
      ]);

      enhancements = {
        hook: hookResult.hook,
        title: metadataResult.title,
        description: metadataResult.description,
        keywords: metadataResult.keywords,
        caption: metadataResult.caption,
        hashtags: metadataResult.hashtags,
        fallback_used:
          Boolean(hookResult.fallback_used) || Boolean(metadataResult.fallback_used),
      };
    } else {
      tracker.skipped.push('stage_8_hook_rewrite');
      tracker.skipped.push('stage_9_metadata');
    }

    if (NEXUS_FEATURES.learning_module) {
      metadata.learning_analysis = await this.runStage(
        tracker,
        'stage_12_learning',
        async () => {
          const learning = require('./LearningService').LearningService.getInstance();
          return {
            summary: await learning.analyzePatternsWithOllama(),
            status: 'success' as 'success' | 'skipped',
          };
        },
        {
          summary: 'Analysis skipped.',
          status: 'skipped',
        }
      );
    } else {
      tracker.skipped.push('stage_12_learning');
    }

    metadata.execution_time_ms = tracker.execution_time_ms;
    metadata.pipeline_summary = {
      run: tracker.run,
      skipped: tracker.skipped,
      failed: tracker.failed,
    };
    metadata.signal_breakdown = Object.fromEntries(
      Object.entries(signals).map(([key, value]) => [
        key,
        {
          score: value.score,
          weight: value.weight,
          reason: value.reason,
          status: value.status || 'success',
          fallback_used: Boolean(value.fallback_used),
        },
      ])
    );

    return {
      finalScoreOffset: finalScoreOffset.value || 0,
      signals,
      metadata,
      enhancements,
    };
  }

  private mergeSignals(signals: Record<string, NexusSignal>): number {
    if (Object.keys(signals).length === 0) {
      return 0;
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const key in signals) {
      const signal = signals[key];
      totalWeightedScore += signal.score * signal.weight;
      totalWeight += signal.weight;
    }

    const modularSignalAvg = totalWeight > 0 ? totalWeightedScore / totalWeight : 0.5;
    return (modularSignalAvg - 0.5) * 0.4;
  }
}
