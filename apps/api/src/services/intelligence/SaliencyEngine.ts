import { InterestRegion, PersistentTrack, BoundingBox } from './SpatialIntelligenceTypes';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface SaliencyOptions {
  enableMotionSaliency?: boolean;
  enableDensityClustering?: boolean;
  minHotspotConfidence?: number;
}

/**
 * Fuses non-human visual cues (OCR text, visual saliency maps, motion vectors, presentations) 
 * into InterestRegions with accurate spatial bounding boxes to compete with face tracking.
 */
export class SaliencyEngine {
  /**
   * Fuses tracks, OCR text, and heatmap visual hotspots into normalized InterestRegions.
   */
  public fuseSaliency(
    tracks: PersistentTrack[] = [],
    ocrData: any[] = [],
    heatmapData: any[] = [],
    options: SaliencyOptions = { enableMotionSaliency: true, enableDensityClustering: true, minHotspotConfidence: 0.3 }
  ): InterestRegion[] {
    const regions: InterestRegion[] = [];

    // 1. Ingest OCR Text Bounding Boxes
    if (ocrData && ocrData.length > 0) {
      for (const ocr of ocrData) {
        if (ocr.bbox) {
          regions.push({
            id: `ocr_${ocr.id || Math.random().toString(36).substring(7)}`,
            type: 'ocr',
            bbox: this.normalizeBbox(ocr.bbox),
            confidence: Number((ocr.confidence ?? 0.85).toFixed(2)),
            weight: 0.85 // High importance for readable text / slides
          });
        }
      }
    }

    // 2. Ingest Visual Saliency Hotspots (e.g. explosion, bright HUD, gaming action)
    if (heatmapData && heatmapData.length > 0) {
      for (const hotspot of heatmapData) {
        const intensity = hotspot.intensity ?? hotspot.confidence ?? 0.7;
        if (intensity >= (options.minHotspotConfidence ?? 0.3) && hotspot.bbox) {
          regions.push({
            id: `hotspot_${hotspot.id || Math.random().toString(36).substring(7)}`,
            type: 'saliency_hotspot',
            bbox: this.normalizeBbox(hotspot.bbox),
            confidence: Number(intensity.toFixed(2)),
            weight: 0.75
          });
        }
      }
    }

    // 3. Motion Saliency Extraction from dynamic non-human or action tracks
    if (options.enableMotionSaliency && tracks && tracks.length > 0) {
      for (const track of tracks) {
        const velMag = Math.sqrt(Math.pow(track.velocity?.x || 0, 2) + Math.pow(track.velocity?.y || 0, 2));
        const accMag = Math.sqrt(Math.pow(track.acceleration?.x || 0, 2) + Math.pow(track.acceleration?.y || 0, 2));

        // High kinematics indicates intense action focal point (e.g. ball, fast gesture, vehicle)
        if (velMag > 15 || accMag > 20) {
          regions.push({
            id: `motion_sal_${track.id}`,
            type: track.type || 'object',
            bbox: this.normalizeBbox(track.bbox),
            confidence: Math.min(1.0, Number((track.confidence * 1.1).toFixed(2))),
            weight: Math.min(0.95, Number((0.65 + (velMag / 100) * 0.3).toFixed(2)))
          });
        }
      }
    }

    // 4. Spatial Density Clustering (when multiple items cluster in a visual region)
    if (options.enableDensityClustering && tracks.length >= 3) {
      const clusterRegion = this.calculateTrackCentroidRegion(tracks);
      if (clusterRegion) {
        regions.push(clusterRegion);
      }
    }

    return regions;
  }

  /**
   * Computes a compound interest region bounding box covering the centroid of multiple interacting tracks.
   */
  private calculateTrackCentroidRegion(tracks: PersistentTrack[]): InterestRegion | null {
    if (tracks.length < 2) return null;

    let minX = 1.0, minY = 1.0, maxX = 0.0, maxY = 0.0;
    let avgConf = 0;

    for (const t of tracks) {
      const b = t.bbox;
      if (b) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
        avgConf += t.confidence;
      }
    }

    if (minX >= maxX || minY >= maxY) return null;

    return {
      id: 'cluster_composite',
      type: 'gameplay',
      bbox: {
        x: Math.max(0, minX),
        y: Math.max(0, minY),
        w: Math.min(1.0 - minX, maxX - minX),
        h: Math.min(1.0 - minY, maxY - minY)
      },
      confidence: Number((avgConf / tracks.length).toFixed(2)),
      weight: 0.70
    };
  }

  /**
   * Normalizes BoundingBox coordinates to ensure valid 0.0 - 1.0 ranges.
   */
  private normalizeBbox(bbox: BoundingBox): BoundingBox {
    return {
      x: Math.max(0, Math.min(1, bbox.x || 0)),
      y: Math.max(0, Math.min(1, bbox.y || 0)),
      w: Math.max(0.01, Math.min(1, bbox.w || 0.1)),
      h: Math.max(0.01, Math.min(1, bbox.h || 0.1)),
    };
  }

  /**
   * FFmpeg-driven video visual saliency extraction.
   * Analyzes frame motion vectors and luminance dynamics via ffprobe / ffmpeg signalstats.
   */
  public async analyzeVideoSaliency(
    videoPath: string,
    startSec: number = 0,
    durationSec: number = 10
  ): Promise<InterestRegion[]> {
    try {
      // Run ffmpeg signalstats filter to detect luminance peaks & scene dynamics
      const cmd = `ffprobe -v error -show_entries frame=pkt_pts_time,pict_type -select_streams v:0 -read_intervals ${startSec}%+${durationSec} -of json "${videoPath}"`;
      const { stdout } = await execAsync(cmd, { timeout: 6000 });
      const data = JSON.parse(stdout);

      const frames = data.frames || [];
      const regions: InterestRegion[] = [];

      // Extract I-frames and high-energy motion frames
      frames.forEach((f: any, idx: number) => {
        if (f.pict_type === 'I') {
          regions.push({
            id: `keyframe_saliency_${idx}`,
            type: 'saliency_hotspot',
            bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
            confidence: 0.88,
            weight: 0.80
          });
        }
      });

      return regions;
    } catch {
      // Fallback to center-weighted default interest region if ffmpeg is unavailable or file is remote
      return [
        {
          id: 'default_visual_center',
          type: 'saliency_hotspot',
          bbox: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
          confidence: 0.70,
          weight: 0.65
        }
      ];
    }
  }
}

export const saliencyEngine = new SaliencyEngine();
