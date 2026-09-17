import { PerceptionFrame } from '../perception/types';
import { MediaArtifact } from '../ingestion/types';
import { CameraPlan, CameraKeyframe, CameraCropBox, DirectorConfig, FramingLevel, LayoutMode } from './types';
import { ComputeCeiling } from './ComputeCeiling';
import { createSingleSubjectComposition, createSplitStackComposition } from '../composition/CompositionPlan';

export interface HysteresisState {
  currentSpeakerId: string | null;
  currentSpeakerSinceMs: number;
  candidateSpeakerId: string | null;
  candidateSpeakerSinceMs: number;
  lastSwitchTimestampMs: number;
  rapidSwitchCount: number;
  lastStableCropBox: CameraCropBox | null;
  faceLossSinceMs: number | null;
  lastFrameTimestampMs: number;
  currentCameraMode: 'HOLD' | 'TRACK' | 'PAN' | 'CUT';
  candidateCameraMode: 'HOLD' | 'TRACK' | 'PAN' | 'CUT' | null;
  candidateModeSinceMs: number;
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
      lastFrameTimestampMs: 0,
      currentCameraMode: 'HOLD',
      candidateCameraMode: null,
      candidateModeSinceMs: 0,
    };

    for (const frame of sampled) {
      const kf = this.calculateKeyframe(frame, artifact, config, context);
      keyframes.push(kf);
    }

    const smoothed = this.applyTemporalSmoothing(keyframes, config);

    // Multi-Speaker Editorial Candidate Evaluation:
    // Do not automatically trigger split-screen purely on count >= 2.
    // Require sustained co-presence (> 40% of frames), prominent face scale, and spatial relevance.
    const splitFramesCount = smoothed.filter(k => k.framingLevel === FramingLevel.SPLIT_SCREEN_STACK).length;
    const splitRatio = smoothed.length > 0 ? splitFramesCount / smoothed.length : 0;
    const hasEditorialSplitValue = splitRatio >= 0.40;

    let layoutMode: LayoutMode = 'single_speaker';
    if (config.preferredLayout === 'split_screen_stack') {
      layoutMode = 'split_screen_stack';
    } else if (config.preferredLayout === 'single_speaker') {
      layoutMode = 'single_speaker';
    } else if (hasEditorialSplitValue) {
      layoutMode = 'split_screen_stack';
    } else {
      layoutMode = 'single_speaker';
    }

    // Synthesize structured CompositionPlan with dynamic time-varying camera paths
    let composition = undefined;
    const primaryKeyframes = smoothed.map(k => ({
      timestampMs: k.timestampMs,
      crop: { x: k.cropBox.x, y: k.cropBox.y, width: k.cropBox.w, height: k.cropBox.h },
    }));

    if (layoutMode === 'split_screen_stack') {
      const splitKeyframe = smoothed.find(k => k.secondaryCropBox) || smoothed[0];
      const primaryCrop = splitKeyframe.cropBox;
      const secondaryCrop = splitKeyframe.secondaryCropBox || primaryCrop;
      const secondaryKeyframes = smoothed
        .filter(k => k.secondaryCropBox)
        .map(k => ({
          timestampMs: k.timestampMs,
          crop: { x: k.secondaryCropBox!.x, y: k.secondaryCropBox!.y, width: k.secondaryCropBox!.w, height: k.secondaryCropBox!.h },
        }));

      composition = createSplitStackComposition(
        { x: primaryCrop.x, y: primaryCrop.y, width: primaryCrop.w, height: primaryCrop.h },
        { x: secondaryCrop.x, y: secondaryCrop.y, width: secondaryCrop.w, height: secondaryCrop.h },
        1080,
        1920,
        primaryKeyframes,
        secondaryKeyframes.length > 0 ? secondaryKeyframes : primaryKeyframes
      );
    } else {
      const firstCrop = smoothed[0]?.cropBox || { x: 0, y: 0, w: 1080, h: 1920 };
      composition = createSingleSubjectComposition(
        { x: firstCrop.x, y: firstCrop.y, width: firstCrop.w, height: firstCrop.h },
        1080,
        1920,
        primaryKeyframes
      );
    }

    return {
      schemaVersion: '1.1.0',
      layoutMode,
      keyframes: smoothed,
      composition,
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

    // 2. Multi-Speaker Co-Presence & Editorial Relevance Check
    // Exclude background bystanders / tiny faces (w < 0.08)
    const prominentFaces = facesData.filter((f: any) => ((f.w ?? f.width ?? 0) >= 0.08));

    if (
      prominentFaces.length >= 2 &&
      (!config.preferredLayout || config.preferredLayout === 'auto' || config.preferredLayout === 'split_screen_stack')
    ) {
      // Sort faces by horizontal X coordinate (left to right)
      const sortedFaces = [...prominentFaces].sort((a, b) => a.x - b.x);
      const horizontalSeparation = Math.abs(sortedFaces[1].x - sortedFaces[0].x);

      // Require meaningful spatial separation (distinct participants, not overlapping/crowded)
      if (horizontalSeparation >= 0.18 || config.preferredLayout === 'split_screen_stack') {
        targetFace = sortedFaces[0];
        secondaryFace = sortedFaces[1];
        level = FramingLevel.SPLIT_SCREEN_STACK;
      } else {
        targetFace = sortedFaces[0];
        level = FramingLevel.ACTIVE_SPEAKER;
      }
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
    
    let scale = 1.0;
    if (config.enablePunchIn && speakerConfidence > 0.9) {
      scale = 1.06;
    }

    const outputAspect = config.targetAspectRatio || 9 / 16;
    const viewportHeightPx = artH / scale;
    const viewportWidthPx = viewportHeightPx * outputAspect;

    const toSourcePixels = (box: { x: number; y: number; w: number; h: number }) => {
      const isNorm = box.w <= 1.0 && box.h <= 1.0 && box.x <= 1.0 && box.y <= 1.0;
      return {
        x: isNorm ? box.x * artW : box.x,
        y: isNorm ? box.y * artH : box.y,
        w: isNorm ? box.w * artW : box.w,
        h: isNorm ? box.h * artH : box.h,
      };
    };

    let x = (artW - viewportWidthPx) / 2; // Default center
    let y = 0;

    if (level === FramingLevel.ACTIVE_SPEAKER && targetFace) {
      const facePx = toSourcePixels(targetFace);
      const faceCenterX = facePx.x + facePx.w / 2;
      const idealX = faceCenterX - viewportWidthPx / 2;
      const maxOffsetX = Math.max(0, artW - viewportWidthPx);
      x = Math.max(0, Math.min(maxOffsetX, idealX));

      // P6.4B: Feasible vertical crop region (AutoFlip + safe headroom & subtitle bounds)
      const subtitleReserveRatio = config.subtitleReserveRatio ?? 0.22;
      const safeTopLimit = viewportHeightPx * 0.05; // 5% minimum safe headroom
      const subtitleZoneTop = viewportHeightPx * (1.0 - subtitleReserveRatio); // e.g. 78% of viewport height

      const faceTopPx = facePx.y;
      const faceBottomPx = facePx.y + facePx.h;

      // 1. Headroom constraint: faceTopInCrop >= safeTopLimit => y <= faceTopPx - safeTopLimit
      const yMax = faceTopPx - safeTopLimit;

      // 2. Subtitle clearance: faceBottomInCrop <= subtitleZoneTop => y >= faceBottomPx - subtitleZoneTop
      const yMin = faceBottomPx - subtitleZoneTop;

      // Ideal eye-line positioning (0.33 of viewport height)
      const eyeLineRatio = 0.33;
      const idealY = (faceTopPx + facePx.h * 0.4) - viewportHeightPx * eyeLineRatio;

      if (yMin <= yMax) {
        // Feasible crop exists: place camera within [yMin, yMax] honoring eye-line
        y = Math.max(yMin, Math.min(yMax, idealY));
      } else {
        // P6.4C Infeasible crop fallback: preserve headroom to protect eyes/head
        y = yMax;
      }
      if (y < 0) y = 0;
    }

    let secondaryCropBox: CameraKeyframe['secondaryCropBox'] = undefined;
    if (level === FramingLevel.SPLIT_SCREEN_STACK && targetFace && secondaryFace) {
      const faceA = toSourcePixels(targetFace);
      const faceB = toSourcePixels(secondaryFace);
      const halfTargetW = viewportWidthPx;
      const speakerAX = Math.max(0, Math.min(faceA.x + faceA.w / 2 - halfTargetW / 2, artW - halfTargetW));
      const speakerBX = Math.max(0, Math.min(faceB.x + faceB.w / 2 - halfTargetW / 2, artW - halfTargetW));

      x = speakerAX;
      secondaryCropBox = {
        x: speakerBX,
        y: 0,
        w: halfTargetW,
        h: viewportHeightPx,
      };
    }

    const deadbandPx = viewportWidthPx * (config.deadbandRatio ?? 0.03);
    const cutThresholdPx = viewportWidthPx * (config.cutThresholdRatio ?? 0.25);

    const targetCropBox: CameraCropBox = { x, y, w: viewportWidthPx, h: viewportHeightPx };
    let cropBox: CameraCropBox = { ...targetCropBox };
    let cameraMode: 'HOLD' | 'TRACK' | 'PAN' | 'CUT' = 'HOLD';

    if (context) {
      const dtSec = context.lastFrameTimestampMs > 0
        ? Math.max(0.01, (frame.timestampMs - context.lastFrameTimestampMs) / 1000)
        : 0.04;
      context.lastFrameTimestampMs = frame.timestampMs;

      if (context.lastStableCropBox === null) {
        context.lastStableCropBox = { ...targetCropBox };
        context.currentCameraMode = 'HOLD';
        cameraMode = 'HOLD';
      } else {
        const dx = targetCropBox.x - context.lastStableCropBox.x;
        const dy = targetCropBox.y - context.lastStableCropBox.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const isCameraPan = frame.cameraMotion?.available && frame.cameraMotion.data === 'pan';
        const isSpeakerCut = context.lastSwitchTimestampMs === frame.timestampMs && dist > cutThresholdPx;

        let desiredMode: 'HOLD' | 'TRACK' | 'PAN' | 'CUT';
        if (isSpeakerCut) {
          desiredMode = 'CUT';
        } else if (isCameraPan) {
          desiredMode = 'PAN';
        } else if (dist < deadbandPx) {
          desiredMode = 'HOLD';
        } else {
          desiredMode = 'TRACK';
        }

        // Camera mode persistence / hysteresis (minimum 150ms dwell time)
        if (desiredMode === 'CUT') {
          context.currentCameraMode = 'CUT';
          context.candidateCameraMode = null;
        } else if (desiredMode === context.currentCameraMode) {
          context.candidateCameraMode = null;
        } else {
          if (context.candidateCameraMode !== desiredMode) {
            context.candidateCameraMode = desiredMode;
            context.candidateModeSinceMs = frame.timestampMs;
          } else {
            const dwellMs = frame.timestampMs - context.candidateModeSinceMs;
            if (dwellMs >= 150) {
              context.currentCameraMode = desiredMode;
              context.candidateCameraMode = null;
            }
          }
        }

        cameraMode = context.currentCameraMode;

        switch (cameraMode) {
          case 'HOLD':
            cropBox = { ...context.lastStableCropBox };
            break;

          case 'PAN':
            // Pin horizontal translation, allow vertical safe adjustment
            cropBox = {
              x: context.lastStableCropBox.x,
              y,
              w: viewportWidthPx,
              h: viewportHeightPx,
            };
            context.lastStableCropBox = cropBox;
            break;

          case 'CUT':
            // Instantaneous cut to new target
            cropBox = { ...targetCropBox };
            context.lastStableCropBox = cropBox;
            context.currentCameraMode = 'HOLD'; // Settle into hold after cut
            break;

          case 'TRACK':
          default:
            // Velocity-capped 2D tracking
            const maxDelta = config.maxVelocityPxPerSec * dtSec;
            const stepX = Math.abs(dx) > maxDelta ? Math.sign(dx) * maxDelta : dx;
            const stepY = Math.abs(dy) > maxDelta ? Math.sign(dy) * maxDelta : dy;
            cropBox = {
              x: context.lastStableCropBox.x + stepX,
              y: context.lastStableCropBox.y + stepY,
              w: viewportWidthPx,
              h: viewportHeightPx,
            };
            context.lastStableCropBox = cropBox;
            break;
        }
      }
    }

    return {
      timestampMs: frame.timestampMs,
      cropBox,
      secondaryCropBox,
      scale,
      framingLevel: level,
      cameraMode,
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

      // Preserve intentional cuts without smoothing blur
      if (curr.cameraMode === 'CUT') {
        smoothed.push({ ...curr });
        continue;
      }

      let newX = curr.cropBox.x;
      let newY = curr.cropBox.y;
      const dx = curr.cropBox.x - prev.cropBox.x;
      const dy = curr.cropBox.y - prev.cropBox.y;
      
      // Anti-Jitter Pass for micro-movements
      if (Math.abs(dx) < config.jitterThresholdPx) {
        newX = prev.cropBox.x;
      } else {
        const velocityX = dx / dtSec;
        if (Math.abs(velocityX) > config.maxVelocityPxPerSec) {
          const maxDx = config.maxVelocityPxPerSec * dtSec * Math.sign(velocityX);
          newX = prev.cropBox.x + maxDx;
        }
      }

      if (Math.abs(dy) < config.jitterThresholdPx) {
        newY = prev.cropBox.y;
      } else {
        const velocityY = dy / dtSec;
        if (Math.abs(velocityY) > config.maxVelocityPxPerSec) {
          const maxDy = config.maxVelocityPxPerSec * dtSec * Math.sign(velocityY);
          newY = prev.cropBox.y + maxDy;
        }
      }

      smoothed.push({
        ...curr,
        cropBox: { ...curr.cropBox, x: newX, y: newY }
      });
    }

    return smoothed;
  }
}
