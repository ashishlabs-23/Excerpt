import { CategoryClassifier } from '../../services/intelligence/CategoryClassifier';
import { EventGraphBuilder } from '../../services/intelligence/EventGraphBuilder';
import { StoryBuilderService } from '../../services/intelligence/StoryBuilderService';
import { PipelineContext } from '../../services/intelligence/PipelineContext';
import { isMultiModalEnabled } from '../../config/features';
import { EventEngine } from '../../services/intelligence/EventEngine';
import { CrowdExcitementEngine } from '../../services/intelligence/CrowdExcitementEngine';
import { CommentaryEmotionEngine } from '../../services/intelligence/CommentaryEmotionEngine';
import { CelebrationDetector } from '../../services/intelligence/CelebrationDetector';
import { ReplayDetector } from '../../services/intelligence/ReplayDetector';
import { WowMomentEngine } from '../../services/intelligence/WowMomentEngine';
import { SmartBoundaryEngine } from '../../services/intelligence/SmartBoundaryEngine';
import { PipelineStage, StageResult } from './types';
import crypto from 'crypto';

export interface IntelligenceInput {
  jobId: string;
  inputPath: string;
  sourceDuration: number;
  transcriptionText: string;
  segments: any[];
  words: any[];
  graph?: any;
  isDraftMode?: boolean;
  tempDir: string;
  pipelineContext: PipelineContext;
}

export interface IntelligenceOutput {
  pipelineContext: PipelineContext;
  category: any;
  eventGraph?: any;
  storyGraph?: any;
  isV2PipelineUsed: boolean;
  v2Candidates?: any[];
}

export class IntelligenceStage implements PipelineStage<IntelligenceInput, IntelligenceOutput> {
  readonly name = 'stage_2_intelligence';

  private categoryClassifier = new CategoryClassifier();
  private eventGraphBuilder = new EventGraphBuilder();
  private storyBuilderService = new StoryBuilderService();
  private eventEngine = new EventEngine();
  private crowdExcitementEngine = new CrowdExcitementEngine();
  private commentaryEmotionEngine = new CommentaryEmotionEngine();
  private celebrationDetector = new CelebrationDetector();
  private replayDetector = new ReplayDetector();
  private wowMomentEngine = new WowMomentEngine();
  private smartBoundaryEngine = new SmartBoundaryEngine();

  async execute(input: IntelligenceInput): Promise<StageResult<IntelligenceOutput>> {
    const startedAt = Date.now();
    const {
      jobId,
      inputPath,
      sourceDuration,
      transcriptionText,
      segments,
      words,
      graph,
      isDraftMode = false,
      pipelineContext,
    } = input;

    let eventGraph = null;
    let storyGraph = null;
    let isV2PipelineUsed = false;
    let v2Candidates: any[] = [];

    try {
      // 1. Context Population
      pipelineContext.transcript = transcriptionText;
      pipelineContext.transcriptSegments = segments;
      pipelineContext.words = words;
      pipelineContext.duration = sourceDuration;
      if (graph) {
        pipelineContext.vig = graph;
      }

      // 2. Category Classification
      const stage15StartedAt = Date.now();
      if (isMultiModalEnabled('classifier') && !isDraftMode) {
        try {
          const categoryResult = await this.categoryClassifier.classify(
            transcriptionText,
            inputPath,
            process.env.EXCERPT_SKIP_VISUAL_CLASSIFIER === 'true'
          );
          pipelineContext.category = categoryResult;
          console.log(
            `[IntelligenceStage]: Category -> '${categoryResult.category}' (confidence: ${(categoryResult.confidence * 100).toFixed(1)}%${categoryResult.fallback_used ? ' — fallback used' : ''})`
          );
        } catch (classifierError: any) {
          console.warn(`[IntelligenceStage]: Classifier error (non-fatal, using default): ${classifierError.message}`);
          pipelineContext.category.signals.transcript_signal = `error: ${classifierError.message}`;
        }
      } else {
        console.log(`[IntelligenceStage]: Category classification skipped or disabled.`);
      }
      pipelineContext.executionTimes.classifier = Date.now() - stage15StartedAt;

      // 3. Causal Event Graph & Story Graph (if graph exists)
      if (graph) {
        try {
          console.log(`[IntelligenceStage]: 🧠 Distilling VIG into Causal Event Graph...`);
          eventGraph = this.eventGraphBuilder.build(graph);
          pipelineContext.eventGraph = eventGraph;

          console.log(`[IntelligenceStage]: 📖 Story Builder reasoning over Event Graph...`);
          storyGraph = await this.storyBuilderService.buildStoryGraph(graph, eventGraph);
          pipelineContext.storyGraph = storyGraph;
        } catch (storyErr: any) {
          console.warn(`[IntelligenceStage]: StoryGraph generation failed (non-fatal): ${storyErr.message}`);
        }
      }

      // 4. Multimodal Domain-Specific Event Engines
      const isV2Category =
        pipelineContext.category.category !== 'podcast' &&
        pipelineContext.category.category !== 'interview' &&
        pipelineContext.category.category !== 'tutorial' &&
        pipelineContext.category.category !== 'documentary';

      if (isMultiModalEnabled('event_engine') && isV2Category && !isDraftMode) {
        console.log(`[IntelligenceStage]: Category '${pipelineContext.category.category}' qualifies for V2 Multi-Modal event detection.`);
        try {
          // Crowd Excitement
          await this.crowdExcitementEngine.generateTimeline(inputPath, pipelineContext);

          // Commentary Emotions
          if (process.env.EXCERPT_NEXUS_COMMENTARY_EMOTION === 'true') {
            await this.commentaryEmotionEngine.analyze(inputPath, pipelineContext);
          }

          // Replay & Celebration
          await this.replayDetector.detect(inputPath, pipelineContext);
          const celEvents = await this.celebrationDetector.detect(inputPath, pipelineContext);

          // Event Engine
          await this.eventEngine.detect(inputPath, pipelineContext);

          if (celEvents && celEvents.length > 0) {
            pipelineContext.events = [...pipelineContext.events, ...celEvents];
            pipelineContext.events.sort((a, b) => a.start - b.start);
          }

          // Wow Moments
          this.wowMomentEngine.generateWowMoments(pipelineContext);

          // Extract narrative & semantic clips
          if (pipelineContext.events.length > 0) {
            isV2PipelineUsed = true;
            const uniqueClips: any[] = [];
            pipelineContext.events.forEach((event, idx) => {
              const boundary = this.smartBoundaryEngine.computeBoundary(event, pipelineContext);
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
            v2Candidates = uniqueClips;
          }
        } catch (v2Err: any) {
          console.warn(`[IntelligenceStage]: V2 event pipeline failed (non-fatal, falling back): ${v2Err.message}`);
        }
      }

      return {
        success: true,
        data: {
          pipelineContext,
          category: pipelineContext.category,
          eventGraph,
          storyGraph,
          isV2PipelineUsed,
          v2Candidates,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
