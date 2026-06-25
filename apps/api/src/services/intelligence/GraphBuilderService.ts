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
    console.log(`[GraphBuilder]: Starting intelligence graph build for ${path.basename(videoPath)}...`);
    const graph = new VideoIntelligenceGraph(path.basename(videoPath), durationSeconds);
    
    // Create a temporary analysis directory for visual processing
    const analysisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vig_frames_'));

    try {
      // 1. Run Core Modality Extraction (Concurrent)
      console.log(`[GraphBuilder]: Triggering multimodal extractors...`);
      const [transcriptionResult, visualResult, audioResult] = await Promise.allSettled([
        this.extractTranscript(videoPath),
        this.extractVisual(videoPath, durationSeconds, analysisDir),
        this.extractAudio(videoPath, durationSeconds)
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

      console.log(`[GraphBuilder]: Unified Graph Built successfully. Nodes: ${graph.transcript.length} transcript, ${graph.visual.length} visual.`);
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
    // Extract frames at 4fps
    await this.processor.extractAnalysisFrames(videoPath, 0, duration, tempDir);
    // Run Python tracking logic over the extracted frames
    return this.cropEngine.analyze(tempDir, duration);
  }

  private async extractAudio(videoPath: string, duration: number): Promise<GraphAudioNode[]> {
    // TODO: We could use ffmpeg `astats` or `volumedetect` to get actual dB energy per second.
    // For now, we return a mock array mapping to 1-second intervals.
    const audioNodes: GraphAudioNode[] = [];
    for (let t = 0; t < duration; t++) {
      audioNodes.push({
        time: t,
        duration: 1.0,
        energy: 0.5, // placeholder
        isSilence: false // placeholder
      });
    }
    return audioNodes;
  }
}
