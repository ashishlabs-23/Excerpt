import path from 'path';
import fs from 'fs';
import { NexusSignal } from './NexusRegistry';
import { safeSpawnPython } from '../../lib/safeSpawnPython';

interface CropPlanRegion {
  track: number;
  slot: string;
  x: number;
  y: number;
  confidence: number;
}

interface CropPlanFrame {
  index: number;
  time: number;
  layout: string;
  regions: CropPlanRegion[];
}

interface CropPlanPoint {
  index: number;
  time: number;
  offset: number;
  y_offset: number;
  confidence: number;
}

interface CropPlanResult {
  frames_data: CropPlanFrame[];
  points: CropPlanPoint[];
  count: number;
  status: string;
  detection_backend: string;
  content_type: string;
  content_type_breakdown?: Record<string, number>;
  recommended_zoom: number;
  stats: {
    total_frames: number;
    faces_detected: number;
    detection_rate: number;
    mean_confidence: number;
    ema_alpha: number;
    dead_zone: number;
    mar_speaker_detection?: boolean;
  };
}

export class CinematicCropping {
  private getUnifiedScriptPath(): string | null {
    const candidates = [
      path.join(process.cwd(), 'scripts', 'unified_crop_planner.py'),
      path.join(process.cwd(), 'apps', 'api', 'scripts', 'unified_crop_planner.py'),
      path.join(__dirname, '..', 'scripts', 'unified_crop_planner.py'),
      path.join(__dirname, '..', '..', 'scripts', 'unified_crop_planner.py'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  /**
   * Runs the Unified Perception Engine & Crop Planner on extracted frames.
   * Returns both a NexusSignal (for scoring) and the full unified crop plan.
   */
  public async analyze(
    analysisDir: string,
    duration: number
  ): Promise<{ signal: NexusSignal; cropPlan: CropPlanResult | null }> {
    const unifiedScript = this.getUnifiedScriptPath();
    
    let stdout = '';
    let usedScript = 'unified_crop_planner.py';
    
    if (unifiedScript) {
      console.log(`[CinematicCropping]: Running Unified Perception Engine & Crop Planner...`);
      stdout = await safeSpawnPython('unified_crop_planner.py', ['--frames', analysisDir, '--duration', String(duration), '--multi-entity'], 120000);
    }
    
    if (!stdout) {
      console.warn('[CinematicCropping]: No crop planning scripts executed successfully. Skipping.');
      return {
        signal: {
          score: 0.5,
          weight: 0,
          reason: 'No crop planning scripts found/executed',
          status: 'skipped',
          fallback_used: true,
        },
        cropPlan: null,
      };
    }

    try {
      
      try {
        const parsed: CropPlanResult = JSON.parse(stdout);

        if (parsed.status !== 'success' || !parsed.points || parsed.points.length === 0) {
          return {
            signal: {
              score: 0.3,
              weight: 0.1,
              reason: `Crop plan empty or failed: ${parsed.status}`,
              status: 'skipped',
              fallback_used: true,
            },
            cropPlan: null,
          };
        }

        // Derive a face-tracking quality score from detection stats
        const detectionRate = parsed.stats?.detection_rate || 0;
        const meanConfidence = parsed.stats?.mean_confidence || 0;
        const qualityScore = Math.min(1, detectionRate * 0.6 + meanConfidence * 0.4);
        const backend = parsed.detection_backend || 'unknown';
        const contentType = parsed.content_type || 'mixed';

        return {
          signal: {
            score: Number(qualityScore.toFixed(4)),
            weight: 0.4,
            reason: `${backend} detected faces in ${Math.round(detectionRate * 100)}% of frames (avg conf: ${meanConfidence.toFixed(2)}) | content: ${contentType}`,
            status: 'success',
            fallback_used: false,
          },
          cropPlan: parsed,
        };
      } catch (parseError: any) {
        console.warn(`[CinematicCropping]: JSON parse error: ${parseError.message}`);
        return {
          signal: {
            score: 0.5,
            weight: 0,
            reason: `Crop plan parse error: ${parseError.message}`,
            status: 'skipped',
            fallback_used: true,
          },
          cropPlan: null,
        };
      }
    } catch (error: any) {
      console.warn(`[CinematicCropping]: Analysis failed: ${error.message || error}`);
      return {
        signal: {
          score: 0.5,
          weight: 0,
          reason: `Cinematic crop error: ${error.message}`,
          status: 'skipped',
          fallback_used: true,
        },
        cropPlan: null,
      };
    }
  }

  /**
   * Quick signal-only method for NexusRegistry compatibility.
   */
  public async getSignal(videoPath: string): Promise<NexusSignal> {
    // This is a lightweight stub — the full analysis happens in analyzeClip
    // via the NexusRegistry which calls analyze() with the frame directory.
    return {
      score: 0.5,
      weight: 0.2,
      reason: 'Cinematic cropping runs during render phase',
      status: 'skipped',
      fallback_used: false,
    };
  }
}
