import { PerceptionFrame } from '../perception/types';
import { MediaArtifact } from '../ingestion/types';
import { CameraPlan, CameraKeyframe, CameraCropBox, DirectorConfig, FramingLevel, LayoutMode } from './types';
import { ComputeCeiling } from './ComputeCeiling';

export interface HysteresisState {
  currentSpeakerId: string | null;
  currentSpeakerSinceMs: number;
  candidateSpeakerId: string | null;
  candidateSpeakerSinceMs: number;
  lastSwitchTimestampMs: number;
  rapidSwitchCount: number;
  lastStableCropBox: CameraCropBox | null;
  faceLossSinceMs: number | null;
}

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

    const context: HysteresisState = {
      currentSpeakerId: null,
      currentSpeakerSinceMs: 0,
      candidateSpeakerId: null,
      candidateSpeakerSinceMs: 0,
      lastSwitchTimestampMs: 0,
      rapidSwitchCount: 0,
      lastStableCropBox: null,
      faceLossSinceMs: null,
    };

    for (const frame of sampled) {
      const kf = this.calculateKeyframe(frame, artifact, config, context);
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

  private static calculateKeyframe(
    frame: PerceptionFrame,
    artifact: MediaArtifact,
    config: DirectorConfig,
    context?: HysteresisState
  ): CameraKeyframe {
    const { faces, persons, speaker } = frame;
    let level = FramingLevel.CENTER_CROP;
    let targetFace: any = null;
    let secondaryFace: any = null;

    const facesData = faces?.available && Array.isArray(faces.data) ? faces.data : [];
    const personsData = persons?.available && Array.isArray(persons.data) ? persons.data : [];
    const speakerData = speaker?.available ? speaker.data : null;
    const speakerConfidence = speakerData?.confidence ?? 0;
    const activeSpkId = speakerData?.activeSpeakerId ?? null;

    const artW = artifact.width ?? 1920;
    const artH = artifact.height ?? 1080;
    const targetWidth = artH * config.targetAspectRatio;
    const targetHeight = artH;

    // 1. Face-Loss Hold Fallback
    if (facesData.length === 0) {
      if (context && context.lastStableCropBox) {
        if (context.faceLossSinceMs === null) {
          context.faceLossSinceMs = frame.timestampMs;
        }
        const lossDurationSec = (frame.timestampMs - context.faceLossSinceMs) / 1000;
        const holdThreshold = config.faceLossHoldDurationSec ?? 0.8;

        if (lossDurationSec <= holdThreshold) {
          // Hold last stable crop! DO NOT jump to center/random
          return {
            timestampMs: frame.timestampMs,
            cropBox: { ...context.lastStableCropBox },
            scale: 1.0,
            framingLevel: FramingLevel.ACTIVE_SPEAKER,
          };
        }
      }

      // Prolonged loss: neutral framing
      level = personsData.length > 0 ? FramingLevel.WIDE_SHOT : FramingLevel.CENTER_CROP;
      return {
        timestampMs: frame.timestampMs,
        cropBox: { x: (artW - targetWidth) / 2, y: 0, w: targetWidth, h: targetHeight },
        scale: 1.0,
        framingLevel: level,
      };
    }

    // Faces are present: reset faceLoss tracker
    if (context) {
      context.faceLossSinceMs = null;
    }

    // 2. Multi-Speaker Turn-Taking / Split-Screen Check
    if (facesData.length >= 2 && (!config.preferredLayout || config.preferredLayout === 'auto' || config.preferredLayout === 'split_screen_stack')) {
      // Sort faces by horizontal X coordinate (left to right)
      const sortedFaces = [...facesData].sort((a, b) => a.x - b.x);
      targetFace = sortedFaces[0];
      secondaryFace = sortedFaces[1];
      level = FramingLevel.SPLIT_SCREEN_STACK;
    } else if (facesData.length >= 2 && config.preferredLayout === 'single_speaker') {
      // Single speaker layout requested in multi-face scene: Apply Two-State Hysteresis
      level = FramingLevel.ACTIVE_SPEAKER;
      const holdTimeSec = config.speakerHoldTimeSec ?? 1.8;
      const deltaThreshold = config.speakerSwitchThresholdDelta ?? 0.15;

      if (context && activeSpkId) {
        if (!context.currentSpeakerId) {
          context.currentSpeakerId = activeSpkId;
          context.currentSpeakerSinceMs = frame.timestampMs;
          context.lastSwitchTimestampMs = frame.timestampMs;
        } else if (activeSpkId !== context.currentSpeakerId) {
          if (speakerConfidence >= 0.7) {
            if (context.candidateSpeakerId !== activeSpkId) {
              context.candidateSpeakerId = activeSpkId;
              context.candidateSpeakerSinceMs = frame.timestampMs;
            } else {
              const candDurationSec = (frame.timestampMs - context.candidateSpeakerSinceMs) / 1000;
              if (candDurationSec >= holdTimeSec) {
                // Commit switch A -> B
                const elapsedSinceLastSwitch = (frame.timestampMs - context.lastSwitchTimestampMs) / 1000;
                if (elapsedSinceLastSwitch < holdTimeSec) {
                  context.rapidSwitchCount++;
                }
                context.currentSpeakerId = context.candidateSpeakerId;
                context.currentSpeakerSinceMs = frame.timestampMs;
                context.candidateSpeakerId = null;
                context.lastSwitchTimestampMs = frame.timestampMs;
              }
            }
          } else {
            // Advantage dropped below threshold before hold duration
            context.candidateSpeakerId = null;
          }
        } else {
          context.candidateSpeakerId = null;
        }

        // Pick face matching active speaker if labeled, else match based on current speaker id
        targetFace = facesData.find((f: any) => f.speakerId === context.currentSpeakerId) || facesData[0];
      } else {
        targetFace = facesData[0];
      }
    } else if (facesData.length === 1 && speakerData && speakerConfidence > 0.7) {
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

    const cropBox: CameraCropBox = { x, y, w: targetWidth, h: targetHeight };

    // GAP A: Camera-motion compensation.
    // When a camera pan is detected, the face detector sees apparent subject movement
    // that is actually background motion. Pin crop X to the last stable position so
    // the virtual camera does not chase the background-induced face drift.
    // Vertical reframing, hysteresis, and face-loss logic are unaffected.
    if (
      context &&
      frame.cameraMotion.available &&
      frame.cameraMotion.data === 'pan' &&
      context.lastStableCropBox !== null
    ) {
      cropBox.x = context.lastStableCropBox.x;
    }

    // Record last stable crop box when active face is established
    if (context && level === FramingLevel.ACTIVE_SPEAKER) {
      context.lastStableCropBox = cropBox;
    }

    return {
      timestampMs: frame.timestampMs,
      cropBox,
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
