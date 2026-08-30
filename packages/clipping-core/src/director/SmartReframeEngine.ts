import { PerceptionFrame } from '../perception/types';
import { MediaArtifact } from '../ingestion/types';
import { CameraPlan, CameraKeyframe, DirectorConfig, FramingLevel } from './types';
import { ComputeCeiling } from './ComputeCeiling';

export class SmartReframeEngine {
  /**
   * Generates a deterministic CameraPlan from perception data.
   */
  static generatePlan(
    artifact: MediaArtifact,
    frames: PerceptionFrame[],
    config: DirectorConfig
  ): CameraPlan {
    const samplingHz = ComputeCeiling.calculateSamplingRate(artifact.durationMs);
    const stepMs = 1000 / samplingHz;
    
    const keyframes: CameraKeyframe[] = [];

    // Filter frames to match the sampling rate
    const sampled = frames.filter(f => f.timestampMs % stepMs === 0 || f === frames[frames.length - 1]);

    for (const frame of sampled) {
      const kf = this.calculateKeyframe(frame, artifact, config);
      keyframes.push(kf);
    }

    const smoothed = this.applyTemporalSmoothing(keyframes, config);

    return {
      schemaVersion: '1.0.0',
      keyframes: smoothed
    };
  }

  private static calculateKeyframe(frame: PerceptionFrame, artifact: MediaArtifact, config: DirectorConfig): CameraKeyframe {
    const { faces, persons, speaker } = frame;
    let level = FramingLevel.CENTER_CROP;
    let targetFace: any = null;

    const facesData = faces?.available && Array.isArray(faces.data) ? faces.data : [];
    const personsData = persons?.available && Array.isArray(persons.data) ? persons.data : [];
    const speakerData = speaker?.available ? speaker.data : null;
    const speakerConfidence = speakerData?.confidence ?? 0;

    // Fallback Precedence Logic
    if (facesData.length === 1 && speakerData && speakerConfidence > 0.8) {
      // Level 1: Active Speaker
      level = FramingLevel.ACTIVE_SPEAKER;
      targetFace = facesData[0];
    } else if (facesData.length === 2 && personsData.length === 2) {
      // Level 2: Two Speaker
      level = FramingLevel.TWO_SPEAKER;
    } else if (facesData.length > 0 || personsData.length > 0) {
      // Level 3: Wide Shot
      level = FramingLevel.WIDE_SHOT;
    } else {
      // Level 4: Center Crop fallback
      level = FramingLevel.CENTER_CROP;
    }

    const targetWidth = (artifact.height ?? 1080) * config.targetAspectRatio;
    const targetHeight = artifact.height ?? 1080;
    
    let x = ((artifact.width ?? 1920) - targetWidth) / 2; // Default center
    let y = 0;

    if (level === FramingLevel.ACTIVE_SPEAKER && targetFace) {
      const faceCenterX = targetFace.x + (targetFace.w / 2);
      x = faceCenterX - (targetWidth / 2);

      // Clamp to screen bounds
      x = Math.max(0, Math.min(x, (artifact.width ?? 1920) - targetWidth));
    }

    return {
      timestampMs: frame.timestampMs,
      cropBox: { x, y, w: targetWidth, h: targetHeight },
      scale: 1.0,
      framingLevel: level
    };
  }

  private static applyTemporalSmoothing(keyframes: CameraKeyframe[], config: DirectorConfig): CameraKeyframe[] {
    if (keyframes.length === 0) return [];

    const smoothed: CameraKeyframe[] = [keyframes[0]];

    for (let i = 1; i < keyframes.length; i++) {
      const prev = smoothed[i - 1];
      const curr = keyframes[i];
      const dtSec = (curr.timestampMs - prev.timestampMs) / 1000;
      
      if (dtSec === 0) continue;

      let newX = curr.cropBox.x;
      const dx = curr.cropBox.x - prev.cropBox.x;
      
      // Anti-Jitter Pass
      if (Math.abs(dx) < config.jitterThresholdPx) {
        newX = prev.cropBox.x; // Lock position
      } else {
        // Velocity Cap Pass
        const velocity = dx / dtSec;
        if (Math.abs(velocity) > config.maxVelocityPxPerSec) {
          const maxDx = config.maxVelocityPxPerSec * dtSec * Math.sign(velocity);
          newX = prev.cropBox.x + maxDx;
        }
      }

      smoothed.push({
        ...curr,
        cropBox: { ...curr.cropBox, x: newX }
      });
    }

    return smoothed;
  }
}
