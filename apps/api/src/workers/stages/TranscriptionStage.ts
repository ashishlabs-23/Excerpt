import fs from 'fs';
import { DatabaseService } from '../../services/supabaseService';
import { GraphBuilderService } from '../../services/intelligence/GraphBuilderService';
import { WordInfo } from '../../services/transcriptionService';
import { JobStateMachine, JobStatus } from '../../utils/JobStateMachine';
import { PipelineStage, StageResult } from './types';

export interface TranscriptionInput {
  jobId: string;
  inputPath: string;
  sourceDuration: number;
  cachedTranscriptionPath: string;
  forceDraftMode?: boolean;
  db: DatabaseService;
  graphBuilderService?: GraphBuilderService;
  allowRecovery?: boolean;
}

export interface TranscriptionOutput {
  transcriptionText: string;
  segments: any[];
  words: WordInfo[];
  graph?: any;
  eventGraph?: any;
  storyGraph?: any;
  rankedCandidates?: any[];
  recoveryMode: boolean;
  recoveryReason?: string;
  transcriptionTelemetry?: any;
}

export class TranscriptionStage implements PipelineStage<TranscriptionInput, TranscriptionOutput> {
  readonly name = 'stage_1_transcription';
  private graphBuilderService: GraphBuilderService;

  constructor(graphBuilderService?: GraphBuilderService) {
    this.graphBuilderService = graphBuilderService || new GraphBuilderService();
  }

  async execute(input: TranscriptionInput): Promise<StageResult<TranscriptionOutput>> {
    const startedAt = Date.now();
    const {
      jobId,
      inputPath,
      sourceDuration,
      cachedTranscriptionPath,
      forceDraftMode,
      db,
      allowRecovery = process.env.EXCERPT_TRANSCRIPTION_ALLOW_RECOVERY === 'true',
    } = input;

    let transcriptionText = '';
    let segments: any[] = [];
    let words: WordInfo[] = [];
    let graph: any = null;
    let eventGraph: any = null;
    let storyGraph: any = null;
    let rankedCandidates: any[] = [];
    let recoveryMode = false;
    let recoveryReason: string | undefined;
    let transcriptionTelemetry: any = null;

    if (forceDraftMode) {
      console.log(`[TranscriptionStage]: Force draft mode requested for ${jobId}. Skipping transcription.`);
      return {
        success: true,
        data: {
          transcriptionText: '',
          segments: [],
          words: [],
          recoveryMode: true,
          recoveryReason: 'Force draft mode enabled',
        },
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      let validCacheLoaded = false;
      if (fs.existsSync(cachedTranscriptionPath)) {
        try {
          const cachedData = JSON.parse(fs.readFileSync(cachedTranscriptionPath, 'utf8'));
          const parsedGraph = typeof cachedData.graph === 'string' ? JSON.parse(cachedData.graph) : cachedData.graph;
          const candidateText = cachedData.text || (parsedGraph?.transcript ? parsedGraph.transcript.map((s: any) => s.text).join(' ') : '');
          const candidateSegments = cachedData.segments || (parsedGraph?.transcript ? parsedGraph.transcript.map((s: any) => ({ text: s.text, start: s.start, end: s.end, speaker: s.speaker })) : []);

          if (candidateText && candidateText.trim().length > 0 && candidateSegments.length > 0) {
            console.log(`[TranscriptionStage]: 🧠 Semantic Cache HIT for jobId=${jobId}`);
            transcriptionText = candidateText;
            segments = candidateSegments;
            words = cachedData.words && Array.isArray(cachedData.words) && cachedData.words.length > 0
              ? cachedData.words
              : (parsedGraph?.transcript ? parsedGraph.transcript.flatMap((s: any) => s.words || []) : []);
            graph = parsedGraph;
            eventGraph = cachedData.eventGraph || null;
            storyGraph = cachedData.storyGraph || null;
            rankedCandidates = cachedData.rankedCandidates || [];
            validCacheLoaded = true;
          } else {
            console.warn(`[TranscriptionStage]: Semantic cache at ${cachedTranscriptionPath} has empty data. Invalidating.`);
            try { fs.unlinkSync(cachedTranscriptionPath); } catch {}
          }
        } catch (cacheErr: any) {
          console.warn(`[TranscriptionStage]: Failed to read semantic cache: ${cacheErr.message}. Invalidating.`);
          try { fs.unlinkSync(cachedTranscriptionPath); } catch {}
        }
      }

      if (!validCacheLoaded) {
        await JobStateMachine.transition(db, jobId, JobStatus.TRANSCRIBING, {
          progress: 20,
          stage_label: 'Extracting audio & preparing analysis frames',
        });
        console.log(`[TranscriptionStage]: 🌪️ Neural Decode & Spatial Graph Build START for ${jobId}...`);
        const graphBuildStart = Date.now();

        // Heartbeat timer
        const transcriptionHeartbeat = setInterval(async () => {
          const elapsedSec = Math.round((Date.now() - graphBuildStart) / 1000);
          try {
            await db.updateJob(jobId, { stage_label: `Transcription in progress (${elapsedSec}s elapsed)` });
            console.log(`[TranscriptionStage]: [TRANSCRIPTION_HEARTBEAT] jobId=${jobId} elapsed=${elapsedSec}s`);
          } catch {}
        }, 30_000);

        const GRAPH_BUILD_TIMEOUT_MS = 5 * 60 * 1000;
        try {
          graph = await Promise.race([
            this.graphBuilderService.build(inputPath, sourceDuration),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`TRANSCRIPTION_TIMEOUT: graphBuilderService.build exceeded ${GRAPH_BUILD_TIMEOUT_MS / 1000}s`)), GRAPH_BUILD_TIMEOUT_MS)
            ),
          ]);
        } finally {
          clearInterval(transcriptionHeartbeat);
        }

        const graphBuildMs = Date.now() - graphBuildStart;
        console.log(`[TranscriptionStage]: [TRANSCRIPTION_COMPLETE] jobId=${jobId} durationMs=${graphBuildMs} transcriptSegments=${graph?.transcript?.length ?? 0}`);
        await db.updateJob(jobId, { stage_label: `Transcription complete (${Math.round(graphBuildMs / 1000)}s)`, progress: 40 });

        if (graph?.transcript && Array.isArray(graph.transcript)) {
          transcriptionText = graph.transcript.map((s: any) => s.text).join(' ');
          segments = graph.transcript.map((s: any) => ({
            text: s.text,
            start: s.start,
            end: s.end,
            speaker: s.speaker,
          }));
          words = graph.transcript
            .flatMap((s: any) => s.words || [])
            .filter((w: any) => w && typeof w.start === 'number' && typeof w.end === 'number');
        }
      }

      // Persist transcription state to DB
      if (transcriptionText) {
        try {
          await db.updateJob(jobId, {
            transcription: transcriptionText,
            transcription_segments: segments,
            ...(transcriptionTelemetry ? { transcription_telemetry: transcriptionTelemetry } : {}),
          } as any);
          console.log(`[TranscriptionStage]: Transcription state synchronized with DB for ${jobId}.`);
        } catch (dbError: any) {
          console.warn(`[TranscriptionStage]: Failed to save transcription to DB: ${dbError.message}`);
        }
      }

      return {
        success: true,
        data: {
          transcriptionText,
          segments,
          words,
          graph,
          eventGraph,
          storyGraph,
          rankedCandidates,
          recoveryMode,
          recoveryReason,
          transcriptionTelemetry,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (transcriptionError: any) {
      const errorCode = transcriptionError.transcriptionErrorCode || 'TRANSCRIPTION_FAILED';
      transcriptionTelemetry = transcriptionError.telemetry ?? {
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        outcome: errorCode,
        error_message: transcriptionError.message?.slice(0, 500),
        http_status: transcriptionError.httpStatus ?? null,
        retryable: transcriptionError.retryable !== false,
        recorded_at: new Date().toISOString(),
      };

      console.warn(`[TranscriptionStage]: [TRANSCRIPTION_FAILURE] code=${errorCode} retryable=${transcriptionError.retryable !== false} jobId=${jobId}`);
      try {
        await db.updateJob(jobId, { transcription_telemetry: transcriptionTelemetry } as any);
      } catch {}

      const isRetryableProviderError = [
        'TRANSCRIPTION_TIMEOUT',
        'WORKER_SHUTDOWN',
        'WHISPER_UNAVAILABLE',
        'WHISPER_HTTP_ERROR',
        'CIRCUIT_OPEN',
      ].some(code => errorCode.startsWith(code) || transcriptionError.message?.includes(code));

      if (isRetryableProviderError && !allowRecovery) {
        console.error(`[TranscriptionStage]: [TRANSCRIPTION_HARD_FAIL] errorCode=${errorCode} — re-throwing for retry.`);
        return {
          success: false,
          error: transcriptionError,
          durationMs: Date.now() - startedAt,
        };
      }

      recoveryMode = true;
      recoveryReason = transcriptionError.message;
      await JobStateMachine.transition(db, jobId, JobStatus.RECOVERING, { progress: 35 });

      return {
        success: true,
        data: {
          transcriptionText: '',
          segments: [],
          words: [],
          graph: null,
          recoveryMode: true,
          recoveryReason,
          transcriptionTelemetry,
        },
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
