import { PerceptionFrame } from '../perception/types';
import { MediaArtifact } from '../ingestion/types';
import { CameraPlan, CameraKeyframe, DirectorConfig, FramingLevel, LayoutMode } from './types';
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

    // Determine overall layout mode
    let layoutMode: LayoutMode = config.preferredLayout && config.preferredLayout !== 'auto'
      ? config.preferredLayout
      : 'single_speaker';

    if (config.preferredLayout === 'auto' || !config.preferredLayout) {
      const splitFramesCount = smoothed.filter(k => k.framingLevel === FramingLevel.SPLIT_SCREEN_STACK).length;
      if (splitFramesCount > smoothed.length * 0.4) {
        layoutMode = 'split_screen_stack';
      }
    }

    return {
      schemaVersion: '1.1.0',
      layoutMode,
      keyframes: smoothed
    };
  }

  private static calculateKeyframe(frame: PerceptionFrame, artifact: MediaArtifact, config: DirectorConfig): CameraKeyframe {
    const { faces, persons, speaker } = frame;
    let level = FramingLevel.CENTER_CROP;
    let targetFace: any = null;
    let secondaryFace: any = null;

    const facesData = faces?.available && Array.isArray(faces.data) ? faces.data : [];
    const personsData = persons?.available && Array.isArray(persons.data) ? persons.data : [];
    const speakerData = speaker?.available ? speaker.data : null;
    const speakerConfidence = speakerData?.confidence ?? 0;

    // Multi-Speaker / Podcast Split Screen Check
    if (facesData.length >= 2) {
      // Sort faces by horizontal X coordinate (left to right)
      const sortedFaces = [...facesData].sort((a, b) => a.x - b.x);
      targetFace = sortedFaces[0];
      secondaryFace = sortedFaces[1];
      level = FramingLevel.SPLIT_SCREEN_STACK;
    } else if (facesData.length === 1 && speakerData && speakerConfidence > 0.7) {
      // Level 1: Active Speaker
      level = FramingLevel.ACTIVE_SPEAKER;
      targetFace = facesData[0];
    } else if (facesData.length === 1) {
      level = FramingLevel.ACTIVE_SPEAKER;
      targetFace = facesData[0];
    } else if (personsData.length > 0) {
      level = FramingLevel.WIDE_SHOT;
    } else {
      level = FramingLevel.CENTER_CROP;
    }

    const artW = artifact.width ?? 1920;
    const artH = artifact.height ?? 1080;
    const targetWidth = artH * config.targetAspectRatio;
    const targetHeight = artH;
    
    let x = (artW - targetWidth) / 2; // Default center
    let y = 0;

    if (level === FramingLevel.ACTIVE_SPEAKER && targetFace) {
      const faceCenterX = targetFace.x + (targetFace.w / 2);
      x = faceCenterX - (targetWidth / 2);
      x = Math.max(0, Math.min(x, artW - targetWidth));
    }

    let secondaryCropBox: CameraKeyframe['secondaryCropBox'] = undefined;
    if (level === FramingLevel.SPLIT_SCREEN_STACK && targetFace && secondaryFace) {
      // Calculate top box (Speaker A) and bottom box (Speaker B)
      const halfTargetW = targetWidth;
      const speakerAX = Math.max(0, Math.min(targetFace.x + (targetFace.w / 2) - (halfTargetW / 2), artW - halfTargetW));
      const speakerBX = Math.max(0, Math.min(secondaryFace.x + (secondaryFace.w / 2) - (halfTargetW / 2), artW - halfTargetW));

      x = speakerAX;
      secondaryCropBox = {
        x: speakerBX,
        y: 0,
        w: halfTargetW,
        h: targetHeight
      };
    }

    // Micro punch-in for high speaker engagement
    let scale = 1.0;
    if (config.enablePunchIn && speakerConfidence > 0.9) {
      scale = 1.06;
    }

    return {
      timestampMs: frame.timestampMs,
      cropBox: { x, y, w: targetWidth, h: targetHeight },
      secondaryCropBox,
      scale,
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
