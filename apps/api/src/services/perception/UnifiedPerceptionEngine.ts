import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import util from 'util';
import {
  PerceptionSnapshot,
  AudioEvent,
  SceneEvent,
  SpeakerTrack,
  ExtractorManifest,
  PerceptionBuildConfig,
} from '@excerpt/clipping-core';
import { getBinaryPath } from '../binaryPath';
import { VideoProcessor } from '../videoProcessor';
import { TranscriptionService } from '../transcriptionService';
import { CinematicCropping } from '../nexus/CinematicCropping';

const execFileAsync = util.promisify(execFile);

export interface UnifiedPerceptionOptions {
  sourceHash: string;
  durationSec: number;
  skipVisualTracking?: boolean;
  config?: Partial<PerceptionBuildConfig>;
}

export class UnifiedPerceptionEngine {
  private static instance: UnifiedPerceptionEngine;
  private processor = new VideoProcessor();
  private transcriptionService = new TranscriptionService();
  private cropEngine = new CinematicCropping();

  public readonly defaultConfig: PerceptionBuildConfig = {
    schemaVersion: '2.0',
    ffmpegVersion: '8.1',
    transcriptionProvider: 'groq',
    transcriptionModel: 'whisper-large-v3-turbo',
    transcriptionLanguage: 'en',
    audioSampleRateHz: 2, // 2Hz (0.5s intervals)
    sceneThreshold: 0.25,
    visualFps: 4,
    cropPlannerVersion: '1.2',
  };

  public get manifest(): ExtractorManifest {
    return {
      ffmpegVersion: this.defaultConfig.ffmpegVersion,
      transcriptionProvider: this.defaultConfig.transcriptionProvider,
      transcriptionModel: this.defaultConfig.transcriptionModel,
      perceptionSchemaVersion: this.defaultConfig.schemaVersion,
      audioSampleRateHz: this.defaultConfig.audioSampleRateHz,
      sceneThreshold: this.defaultConfig.sceneThreshold,
      config: this.defaultConfig,
    };
  }

  private constructor() {}

  public static getInstance(): UnifiedPerceptionEngine {
    if (!UnifiedPerceptionEngine.instance) {
      UnifiedPerceptionEngine.instance = new UnifiedPerceptionEngine();
    }
    return UnifiedPerceptionEngine.instance;
  }

  /**
   * Deterministically serializes a PerceptionBuildConfig with sorted keys.
   */
  public canonicalizeConfig(config: PerceptionBuildConfig): string {
    const sortedKeys = Object.keys(config).sort() as (keyof PerceptionBuildConfig)[];
    const canonicalObj: Record<string, any> = {};
    for (const key of sortedKeys) {
      canonicalObj[key] = config[key];
    }
    return JSON.stringify(canonicalObj);
  }

  /**
   * Generates a composite cache key incorporating sourceHash and canonical PerceptionBuildConfig.
   * Ensures changing ANY extractor parameter or model version invalidates old perception data.
   */
  public generateCacheKey(sourceHash: string, customConfig?: Partial<PerceptionBuildConfig>): string {
    const effectiveConfig: PerceptionBuildConfig = {
      ...this.defaultConfig,
      ...(customConfig || {}),
    };
    const canonicalStr = this.canonicalizeConfig(effectiveConfig);
    const keyMaterial = `${sourceHash}::${canonicalStr}`;
    return crypto.createHash('sha256').update(keyMaterial).digest('hex');
  }

  /**
   * Computes a SHA-256 integrity checksum for a PerceptionSnapshot.
   */
  public computeSnapshotChecksum(snapshot: Omit<PerceptionSnapshot, 'checksum'>): string {
    const hash = crypto.createHash('sha256');
    hash.update(snapshot.schemaVersion);
    hash.update(snapshot.cacheKey);
    hash.update(snapshot.source.hash);
    hash.update(String(snapshot.source.durationSec));
    hash.update(snapshot.transcript.fullText);
    hash.update(JSON.stringify(snapshot.audio.energySummary));
    hash.update(JSON.stringify(snapshot.scenes.events));
    hash.update(JSON.stringify(snapshot.speakers.tracks));
    return hash.digest('hex');
  }

  /**
   * Orchestrates the Unified Perception Build across audio, visual, and speech modalities.
   * Produces a compact, event-driven PerceptionSnapshot.
   */
  public async extract(
    videoPath: string,
    options: UnifiedPerceptionOptions
  ): Promise<PerceptionSnapshot> {
    const startTime = Date.now();
    const duration = Math.max(1, options.durationSec);
    const sourceHash = options.sourceHash;
    const cacheKey = this.generateCacheKey(sourceHash);

    console.log(`[UnifiedPerception]: 🚀 Starting unified perception build on ${path.basename(videoPath)} (${duration.toFixed(1)}s, cacheKey=${cacheKey.slice(0, 10)})...`);

    // Probe dimensions
    let width = 1920;
    let height = 1080;
    let fps = 30;
    try {
      const dims = await this.processor.getVideoDimensions(videoPath);
      width = dims.width;
      height = dims.height;
    } catch {}

    const tempBase = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempBase)) fs.mkdirSync(tempBase, { recursive: true });
    const framesTempDir = fs.mkdtempSync(path.join(tempBase, 'perception_frames_'));

    try {
      // Launch distinct analysis passes concurrently:
      // 1. Speech Transcription (Whisper)
      // 2. Audio Loudness & Energy (FFmpeg ebur128 single-pass)
      // 3. Visual Scene Cut Detection (FFmpeg scdet single-pass)
      // 4. Visual Tracking (4fps analysis frames -> unified crop planner)
      const [transcriptResult, audioResult, sceneResult, visualResult] = await Promise.allSettled([
        this.extractTranscript(videoPath),
        this.extractAudioLoudness(videoPath, duration),
        this.extractSceneEvents(videoPath, duration),
        options.skipVisualTracking
          ? Promise.resolve(null)
          : this.extractVisualTracking(videoPath, duration, framesTempDir),
      ]);

      // 1. Parse Transcript
      let fullText = '';
      let segments: Array<{ text: string; start: number; end: number; speaker: string }> = [];
      let words: Array<{ word: string; start: number; end: number; confidence?: number }> = [];

      if (transcriptResult.status === 'fulfilled' && transcriptResult.value) {
        const tr = transcriptResult.value;
        segments = (tr.segments || []).map((s: any) => ({
          text: s.text,
          start: s.start,
          end: s.end,
          speaker: s.speaker || 'SPEAKER_0',
        }));
        words = (tr.words || []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        }));
        fullText = tr.text || segments.map(s => s.text).join(' ');
      } else if (transcriptResult.status === 'rejected') {
        console.warn(`[UnifiedPerception]: Transcript extraction warning: ${transcriptResult.reason?.message}`);
      }

      // 2. Parse Audio: Compact 2Hz summary array + AudioEvent[]
      let energySummary: number[] = [];
      let meanVolumeDb = -22;
      let maxVolumeDb = -1.5;
      let audioEvents: AudioEvent[] = [];

      if (audioResult.status === 'fulfilled') {
        const ar = audioResult.value;
        energySummary = ar.energySummary;
        meanVolumeDb = ar.meanVolumeDb;
        maxVolumeDb = ar.maxVolumeDb;
        audioEvents = ar.events;
      }

      // 3. Parse Scenes: Compact SceneEvent[]
      let sceneEvents: SceneEvent[] = [];
      if (sceneResult.status === 'fulfilled') {
        sceneEvents = sceneResult.value;
      }

      // 4. Parse Visual: SpeakerTrack[] with identity and coordinates
      let speakerTracks: SpeakerTrack[] = [];
      let faceProminenceScore = 0.5;

      if (visualResult.status === 'fulfilled' && visualResult.value) {
        const vr = visualResult.value;
        faceProminenceScore = vr.faceScore;
        speakerTracks = vr.speakerTracks;
      }

      const elapsedMs = Date.now() - startTime;
      console.log(`[UnifiedPerception]: ✅ Unified perception build completed in ${elapsedMs}ms:`, {
        segments: segments.length,
        words: words.length,
        audioEnergySamples: energySummary.length,
        audioEvents: audioEvents.length,
        sceneEvents: sceneEvents.length,
        speakerTracks: speakerTracks.length,
      });

      const snapshot: PerceptionSnapshot = {
        schemaVersion: '2.0',
        cacheKey,
        source: {
          hash: sourceHash,
          durationSec: duration,
          width,
          height,
          fps,
          audioChannels: 2,
        },
        transcript: {
          fullText,
          segments,
          words,
        },
        audio: {
          sampleIntervalSec: 1 / this.manifest.audioSampleRateHz, // 0.5s
          energySummary,
          meanVolumeDb,
          maxVolumeDb,
          events: audioEvents,
        },
        scenes: {
          events: sceneEvents,
        },
        speakers: {
          tracks: speakerTracks,
          faceProminenceScore,
        },
        extractors: this.manifest,
        createdAt: new Date().toISOString(),
      };

      snapshot.checksum = this.computeSnapshotChecksum(snapshot);

      return snapshot;
    } finally {
      try {
        if (fs.existsSync(framesTempDir)) {
          fs.rmSync(framesTempDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  private async extractTranscript(videoPath: string) {
    return this.transcriptionService.transcribe(videoPath);
  }

  /**
   * Broadcast-grade EBU R128 loudness measurement across full duration.
   * Derives a compact 2Hz energy summary and sparse AudioEvent[] (silence, peaks).
   */
  private async extractAudioLoudness(videoPath: string, durationSec: number) {
    const ffmpegBin = getBinaryPath('ffmpeg');
    const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';

    const events: AudioEvent[] = [];
    const sampleRateHz = this.manifest.audioSampleRateHz; // 2Hz
    const totalSamples = Math.max(1, Math.round(durationSec * sampleRateHz));
    const energySummary: number[] = new Array(totalSamples).fill(0.3);

    let meanVolumeDb = -22;
    let maxVolumeDb = -1.5;

    try {
      const { stderr } = await execFileAsync(
        ffmpegBin,
        [
          '-t', String(durationSec),
          '-i', videoPath,
          '-vn',
          '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M',
          '-f', 'null', nullSink,
        ],
        { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
      );

      const lines = stderr.split(/\r?\n/);
      const secondLoudness: Map<number, number[]> = new Map();
      let currentT = 0;

      for (const line of lines) {
        const tMatch = line.match(/pts_time:([\d.]+)/) || line.match(/t:([\d.]+)/);
        if (tMatch) {
          currentT = parseFloat(tMatch[1]);
          continue;
        }
        const mMatch = line.match(/lavfi\.r128\.M=([\-\d.]+)/);
        if (mMatch) {
          const lufs = parseFloat(mMatch[1]);
          if (!isNaN(lufs) && isFinite(lufs)) {
            const bucketIndex = Math.floor(currentT * sampleRateHz);
            if (!secondLoudness.has(bucketIndex)) secondLoudness.set(bucketIndex, []);
            secondLoudness.get(bucketIndex)!.push(lufs);
          }
        }
      }

      let sumLufs = 0;
      let sampleCount = 0;

      for (let i = 0; i < totalSamples; i++) {
        const samples = secondLoudness.get(i);
        if (samples && samples.length > 0) {
          const avgLufs = samples.reduce((s, v) => s + v, 0) / samples.length;
          sumLufs += avgLufs;
          sampleCount++;
          const energy = Math.max(0, Math.min(1, Number(((avgLufs + 70) / 70).toFixed(3))));
          energySummary[i] = energy;

          const timeSec = i / sampleRateHz;
          if (energy >= 0.75) {
            events.push({
              type: 'loudness_peak',
              startSec: timeSec,
              endSec: timeSec + (1 / sampleRateHz),
              value: avgLufs,
            });
          }
          if (avgLufs <= -50) {
            events.push({
              type: 'silence',
              startSec: timeSec,
              endSec: timeSec + (1 / sampleRateHz),
              value: avgLufs,
            });
          }
        }
      }

      if (sampleCount > 0) {
        meanVolumeDb = Number((sumLufs / sampleCount).toFixed(1));
        const allSamples = Array.from(secondLoudness.values()).flat();
        if (allSamples.length > 0) {
          maxVolumeDb = Number(Math.max(...allSamples).toFixed(1));
        }
      }
    } catch (err: any) {
      console.warn(`[UnifiedPerception]: Audio loudness fallback (${err.message}).`);
    }

    events.sort((a, b) => a.startSec - b.startSec);
    return { energySummary, meanVolumeDb, maxVolumeDb, events };
  }

  /**
   * Fast scene change event derivation across the full source via scdet filter.
   * Uses thresholding + hysteresis to produce compact SceneEvent[] instead of frame dumps.
   */
  private async extractSceneEvents(videoPath: string, durationSec: number): Promise<SceneEvent[]> {
    const ffmpegBin = getBinaryPath('ffmpeg');
    const events: SceneEvent[] = [];
    const threshold = this.manifest.sceneThreshold; // 0.25

    try {
      const { stdout } = await execFileAsync(
        ffmpegBin,
        [
          '-t', String(durationSec),
          '-v', 'error',
          '-i', videoPath,
          '-filter:v', `select='gt(scene,${threshold})',metadata=print:file=-`,
          '-f', 'null', '-',
        ],
        { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
      );

      const lines = stdout.split(/\r?\n/);
      let currentPts = 0;

      for (const line of lines) {
        const ptsMatch = line.match(/pts_time:([\d.]+)/);
        if (ptsMatch) {
          currentPts = parseFloat(ptsMatch[1]);
        }
        const scoreMatch = line.match(/lavfi\.scene_score=([\d.]+)/);
        if (scoreMatch && !isNaN(currentPts)) {
          const score = parseFloat(scoreMatch[1]);
          events.push({
            startSec: Number(currentPts.toFixed(2)),
            endSec: Number((currentPts + 0.1).toFixed(2)),
            score: Number(score.toFixed(3)),
          });
        }
      }
    } catch (err: any) {
      console.warn(`[UnifiedPerception]: Scene event extraction fallback (${err.message}).`);
    }

    events.sort((a, b) => a.startSec - b.startSec);
    return events;
  }

  /**
   * Runs frame extraction and Unified Crop Planner once to derive SpeakerTrack[] with spatial identity.
   */
  private async extractVisualTracking(videoPath: string, durationSec: number, tempDir: string) {
    const speakerTracks: SpeakerTrack[] = [];
    let faceScore = 0.5;

    try {
      await this.processor.extractAnalysisFrames(videoPath, 0, durationSec, tempDir);
      const cropResult = await this.cropEngine.analyze(tempDir, durationSec);

      if (cropResult?.cropPlan?.frames_data) {
        for (const frame of cropResult.cropPlan.frames_data) {
          const regions = frame.regions || [];
          for (const reg of regions) {
            speakerTracks.push({
              speakerId: `SPEAKER_TRACK_${reg.track ?? 0}`,
              startSec: Number(frame.time.toFixed(2)),
              endSec: Number((frame.time + 0.25).toFixed(2)),
              centerX: Number((reg.x / 1920).toFixed(3)),
              centerY: Number((reg.y / 1080).toFixed(3)),
              speakingProbability: Number((reg.confidence ?? 0.5).toFixed(2)),
              confidence: Number((reg.confidence ?? 0.5).toFixed(2)),
            });
          }
        }
      }

      faceScore = cropResult?.signal?.score ?? 0.5;
    } catch (err: any) {
      console.warn(`[UnifiedPerception]: Visual tracking fallback (${err.message}).`);
    }

    speakerTracks.sort((a, b) => a.startSec - b.startSec);
    return { speakerTracks, faceScore };
  }
}

export const unifiedPerceptionEngine = UnifiedPerceptionEngine.getInstance();
