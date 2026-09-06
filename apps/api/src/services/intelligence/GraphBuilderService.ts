import { VideoProcessor } from '../videoProcessor';
import { TranscriptionService } from '../transcriptionService';
import { CinematicCropping } from '../nexus/CinematicCropping';
import {
  VideoIntelligenceGraph,
  GraphTranscriptSentence,
  GraphVisualNode,
  VisualRegion,
  GraphAudioNode
} from './VideoGraph';
import path from 'path';
import fs from 'fs';
import os from 'os';

export class GraphBuilderService {
  private processor = new VideoProcessor();
  private transcriptionService = new TranscriptionService();
  private cropEngine = new CinematicCropping();

  /**
   * Orchestrates the multi-modal extraction engines to build a unified
   * Video Intelligence Graph.
   */
  public async build(videoPath: string, durationSeconds: number): Promise<VideoIntelligenceGraph> {
    const buildStart = Date.now();
    console.log(`[GraphBuilder]: [BUILD_START] videoPath=${path.basename(videoPath)} duration=${durationSeconds}s ts=${new Date().toISOString()}`);
    const graph = new VideoIntelligenceGraph(path.basename(videoPath), durationSeconds);
    
    // Create a temporary analysis directory inside temp for visual processing
    const tempBase = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempBase)) fs.mkdirSync(tempBase, { recursive: true });
    const analysisDir = fs.mkdtempSync(path.join(tempBase, 'vig_frames_'));

    try {
      // 1. Run Core Modality Extraction (Concurrent)
      console.log(`[GraphBuilder]: [EXTRACTORS_START] transcript+visual+audio launching concurrently ts=${new Date().toISOString()}`);
      const [transcriptionResult, visualResult, audioResult] = await Promise.allSettled([
        this.extractTranscript(videoPath).then(r => {
          console.log(`[GraphBuilder]: [TRANSCRIPT_DONE] elapsed=${Date.now() - buildStart}ms segments=${r?.segments?.length ?? 0} ts=${new Date().toISOString()}`);
          return r;
        }).catch(e => {
          console.error(`[GraphBuilder]: [TRANSCRIPT_FAILED] elapsed=${Date.now() - buildStart}ms error=${e?.message} ts=${new Date().toISOString()}`);
          throw e;
        }),
        this.extractVisual(videoPath, durationSeconds, analysisDir).then(r => {
          console.log(`[GraphBuilder]: [VISUAL_DONE] elapsed=${Date.now() - buildStart}ms ts=${new Date().toISOString()}`);
          return r;
        }).catch(e => {
          console.error(`[GraphBuilder]: [VISUAL_FAILED] elapsed=${Date.now() - buildStart}ms error=${e?.message} ts=${new Date().toISOString()}`);
          throw e;
        }),
        this.extractAudio(videoPath, durationSeconds).then(r => {
          console.log(`[GraphBuilder]: [AUDIO_DONE] elapsed=${Date.now() - buildStart}ms ts=${new Date().toISOString()}`);
          return r;
        }).catch(e => {
          console.error(`[GraphBuilder]: [AUDIO_FAILED] elapsed=${Date.now() - buildStart}ms error=${e?.message} ts=${new Date().toISOString()}`);
          throw e;
        }),
      ]);

      // 2. Fuse Transcript
      if (transcriptionResult.status === 'fulfilled' && transcriptionResult.value) {
        console.log(`[GraphBuilder]: Fusing transcript into graph...`);
        const result = transcriptionResult.value;
        
        graph.transcript = result.segments.map((seg: any) => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker || 'unknown',
          words: (result.words || [])
            .filter((w: any) => w.start >= seg.start && w.start <= seg.end)
            .map((w: any) => ({
              word: w.word,
              start: w.start,
              end: w.end,
              confidence: w.confidence
            }))
        }));
      } else if (transcriptionResult.status === 'rejected') {
        console.error(`[GraphBuilder]: Transcript extraction failed:`, transcriptionResult.reason);
        throw transcriptionResult.reason;
      }

      // 3. Fuse Visual (Crop Plan / Layout Engine)
      if (visualResult.status === 'fulfilled' && visualResult.value) {
        console.log(`[GraphBuilder]: Fusing visual intelligence into graph...`);
        const { cropPlan } = visualResult.value;
        if (cropPlan?.frames_data) {
          graph.visual = cropPlan.frames_data.map((f: any) => ({
            time: f.time,
            layout: f.layout || 'single',
            dominantContentType: cropPlan.content_type || 'mixed',
            regions: (f.regions || []).map((r: any) => ({
              slot: r.slot,
              trackId: r.track,
              x: r.x,
              y: r.y,
              confidence: r.confidence
            }))
          }));
        }
      }

      // 4. Fuse Audio Energy (Placeholder until audio energy is extracted)
      if (audioResult.status === 'fulfilled' && audioResult.value) {
        console.log(`[GraphBuilder]: Fusing audio energy...`);
        graph.audio = audioResult.value;
      }

      console.log(`[GraphBuilder]: [BUILD_COMPLETE] elapsed=${Date.now() - buildStart}ms transcript=${graph.transcript.length} visual=${graph.visual.length} ts=${new Date().toISOString()}`);
      return graph;
    } finally {
      // Cleanup analysis frames
      try {
        if (fs.existsSync(analysisDir)) {
          fs.rmSync(analysisDir, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.warn(`[GraphBuilder]: Failed to cleanup analysis dir:`, cleanupErr);
      }
    }
  }


  private async extractTranscript(videoPath: string) {
    return this.transcriptionService.transcribe(videoPath);
  }

  private async extractVisual(videoPath: string, duration: number, tempDir: string) {
    const VISUAL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
    const start = Date.now();
    console.log(`[GraphBuilder]: [VISUAL_START] frames+cropEngine launching ts=${new Date().toISOString()}`);

    return Promise.race([
      (async () => {
        // Extract frames at 4fps
        await this.processor.extractAnalysisFrames(videoPath, 0, duration, tempDir);
        console.log(`[GraphBuilder]: [VISUAL_FRAMES_DONE] elapsedMs=${Date.now() - start} ts=${new Date().toISOString()}`);
        // Run Python tracking logic over the extracted frames
        return this.cropEngine.analyze(tempDir, duration);
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          const err = new Error(`VISUAL_TIMEOUT: extractVisual exceeded ${VISUAL_TIMEOUT_MS / 1000}s`);
          console.error(`[GraphBuilder]: [VISUAL_TIMEOUT] elapsedMs=${Date.now() - start} ts=${new Date().toISOString()}`);
          reject(err);
        }, VISUAL_TIMEOUT_MS)
      )
    ]);
  }


  private async extractAudio(videoPath: string, duration: number): Promise<GraphAudioNode[]> {
    const audioNodes: GraphAudioNode[] = [];
    const totalDuration = Math.max(1, Math.round(duration));

    try {
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      const { getBinaryPath } = require('../videoProcessor');
      const ffmpegBin = getBinaryPath('ffmpeg');
      const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';

      // Real FFmpeg broadcast loudness measurement (EBU R128 Momentary Loudness)
      const { stderr } = await execFileAsync(
        ffmpegBin,
        [
          '-i', videoPath,
          '-vn',
          '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M',
          '-f', 'null', nullSink
        ],
        { timeout: 45000, maxBuffer: 10 * 1024 * 1024 }
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
            const sec = Math.floor(currentT);
            if (!secondLoudness.has(sec)) secondLoudness.set(sec, []);
            secondLoudness.get(sec)!.push(lufs);
          }
        }
      }

      for (let t = 0; t < totalDuration; t++) {
        const samples = secondLoudness.get(t);
        if (samples && samples.length > 0) {
          const avgLufs = samples.reduce((s, v) => s + v, 0) / samples.length;
          // Normalize LUFS (-70 to 0) to [0, 1] energy range
          const energy = Math.max(0, Math.min(1, Number(((avgLufs + 70) / 70).toFixed(3))));
          audioNodes.push({
            time: t,
            duration: 1.0,
            energy,
            isSilence: avgLufs <= -50
          });
        } else {
          audioNodes.push({
            time: t,
            duration: 1.0,
            energy: 0.3,
            isSilence: false
          });
        }
      }
      return audioNodes;
    } catch (err: any) {
      console.warn(`[GraphBuilder]: Real audio extraction fallback: ${err.message}`);
      for (let t = 0; t < totalDuration; t++) {
        audioNodes.push({
          time: t,
          duration: 1.0,
          energy: 0.5,
          isSilence: false
        });
      }
      return audioNodes;
    }
  }
}
