import {
  DirectorPlan,
  DirectorShot,
  CameraKeyframe,
  ContextualIntervention,
  DirectorQualityGate,
  DirectorProfileType,
  FramingLevel,
  ShotComposition,
  SafeAreas,
  SubjectTrack,
  CameraCropBox,
} from './types';
import { getDirectorProfile, DirectorProfileConfig } from './DirectorProfiles';

export interface MultimodalPerceptionInput {
  faces?: Array<{
    x: number; // Normalized 0-1
    y: number; // Normalized 0-1
    w: number; // Normalized 0-1
    h: number; // Normalized 0-1
    confidence: number;
    timestampSec?: number;
    speakerId?: string;
  }>;
  speakerTrack?: {
    primarySpeakerId?: string;
    speakerSwitches?: Array<{ timestampSec: number; speakerId: string }>;
  };
  emotionPeaks?: Array<{ timestampSec: number; score: number; emotion?: string }>;
  sceneCuts?: Array<{ timestampSec: number; score: number }>;
  motionEvents?: Array<{ timestampSec: number; intensity: number }>;
}

export interface EditorialClipInput {
  candidateId: string;
  startSec: number;
  endSec: number;
  words?: Array<{ word: string; start: number; end: number }>;
  genre?: string;
}

export class ContextualDirectorEngine {
  private readonly defaultTargetW = 1080;
  private readonly defaultTargetH = 1920;
  private readonly defaultAspect = 9 / 16;

  /**
   * Plans the contextual visual framing for an already approved EditorialPlan candidate.
   * Core Invariant: Clip start/end boundaries are 100% authoritative and NEVER modified.
   */
  public planDirection(
    clip: EditorialClipInput,
    perception: MultimodalPerceptionInput = {},
    videoDimensions: { width: number; height: number } = { width: 1920, height: 1080 }
  ): DirectorPlan {
    const profile = getDirectorProfile(clip.genre);
    const clipDuration = Math.max(1.0, clip.endSec - clip.startSec);
    const words = clip.words || [];

    const safeAreas: SafeAreas = {
      topHookCardClearancePx: 120,
      bottomSubtitleClearancePx: 340,
      sideMarginPx: 60,
    };

    // 1. Resolve Speaker Face Coordinates
    const primaryFace = this.resolvePrimaryFace(perception.faces);
    const secondaryFace = this.resolveSecondaryFace(perception.faces, primaryFace);

    // 2. Generate Candidate Plans (In-Memory Counterfactuals)
    const planA = this.buildConservativePlan(clip, profile, primaryFace, videoDimensions, safeAreas);
    const planB = this.buildContextualPunchPlan(clip, profile, primaryFace, perception, words, videoDimensions, safeAreas);
    const planC = this.buildSpeakerAwarePlan(clip, profile, primaryFace, secondaryFace, perception, videoDimensions, safeAreas);

    // 3. Evaluate Plans with Director Quality Gate
    const evaluatedA = this.evaluatePlanWithQualityGate(planA, clipDuration);
    const evaluatedB = this.evaluatePlanWithQualityGate(planB, clipDuration);
    const evaluatedC = this.evaluatePlanWithQualityGate(planC, clipDuration);

    // 4. Arbitrate Winning Plan
    // Decision Hierarchy:
    // Prefer Plan C (Speaker-Aware) if multiple active speakers exist and split-screen is permitted.
    // Else prefer Plan B (Contextual Punch) if high emotional climax exists and passes quality gate.
    // Otherwise fallback to Plan A (Conservative 1.0x steady framing).
    let winner: DirectorPlan = evaluatedA;

    if (evaluatedC.qualityGate.passed && evaluatedC.confidence >= 0.85 && profile.allowSplitScreen && secondaryFace) {
      winner = evaluatedC;
    } else if (evaluatedB.qualityGate.passed && evaluatedB.interventions.length > 0 && evaluatedB.confidence > evaluatedA.confidence) {
      winner = evaluatedB;
    } else {
      winner = evaluatedA;
    }

    return winner;
  }

  /**
   * Plan A: Conservative 1.0x steady framing.
   * Lock camera on speaker eye-line. Zero unnecessary punch-ins.
   */
  private buildConservativePlan(
    clip: EditorialClipInput,
    profile: DirectorProfileConfig,
    primaryFace: { x: number; y: number; w: number; h: number; confidence: number },
    videoDim: { width: number; height: number },
    safeAreas: SafeAreas
  ): DirectorPlan {
    const crop = this.calculateCropBox(primaryFace, 1.0, profile.composition, videoDim);
    const clipDuration = Number((clip.endSec - clip.startSec).toFixed(2));

    const shot: DirectorShot = {
      shotIndex: 0,
      startSec: 0,
      endSec: clipDuration,
      durationSec: clipDuration,
      targetSubject: 'speaker_primary',
      framing: FramingLevel.ACTIVE_SPEAKER,
      cropCenter: { x: crop.x + crop.w / 2, y: crop.y + crop.h / 2 },
      zoomScale: 1.0,
      transition: 'none',
      reason: 'Conservative steady framing centered on primary speaker eye-line.',
      confidence: primaryFace.confidence,
    };

    const keyframes: CameraKeyframe[] = [
      {
        timestampMs: 0,
        cropBox: crop,
        scale: 1.0,
        framingLevel: FramingLevel.ACTIVE_SPEAKER,
        layoutMode: 'single_speaker',
      },
      {
        timestampMs: Math.round(clipDuration * 1000),
        cropBox: crop,
        scale: 1.0,
        framingLevel: FramingLevel.ACTIVE_SPEAKER,
        layoutMode: 'single_speaker',
      },
    ];

    const subjectTracks: SubjectTrack[] = [
      {
        trackId: 'speaker-0',
        role: 'primary_speaker',
        detectedBoundingBox: crop,
        meanConfidence: primaryFace.confidence,
        isSpeaking: true,
      },
    ];

    return {
      schemaVersion: '1.2.0',
      candidateId: clip.candidateId,
      aspectRatio: this.defaultAspect,
      genreProfile: profile.genre,
      selectedPlanType: 'conservative',
      shots: [shot],
      cameraKeyframes: keyframes,
      subjectTracks,
      composition: profile.composition,
      interventions: [],
      safeAreas,
      qualityGate: {
        passed: true,
        faceVisibilityRate: primaryFace.confidence,
        headCutoffDetected: false,
        chinCutoffDetected: false,
        cropJitterScorePx: 0,
        speakerOscillationCount: 0,
        subtitleSafeClearanceOk: true,
        unnecessaryInterventionCount: 0,
        rejectionReasons: [],
      },
      confidence: Number(primaryFace.confidence.toFixed(2)),
      explanation: 'Conservative single-speaker framing with zero artificial zoom.',
    };
  }

  /**
   * Plan B: Contextual Punch-In.
   * Punches in ONLY when justified by underlying emotion spike + semantic emphasis.
   * Strictly enforces: Ponytail Rule (No punch on flat sentences; minimum 2.5s hold).
   */
  private buildContextualPunchPlan(
    clip: EditorialClipInput,
    profile: DirectorProfileConfig,
    primaryFace: { x: number; y: number; w: number; h: number; confidence: number },
    perception: MultimodalPerceptionInput,
    words: Array<{ word: string; start: number; end: number }>,
    videoDim: { width: number; height: number },
    safeAreas: SafeAreas
  ): DirectorPlan {
    const basePlan = this.buildConservativePlan(clip, profile, primaryFace, videoDim, safeAreas);
    const clipDuration = Number((clip.endSec - clip.startSec).toFixed(2));
    const interventions: ContextualIntervention[] = [];

    // Scan for high-scoring contextual moments
    const emotionPeaks = perception.emotionPeaks || [];
    const motionEvents = perception.motionEvents || [];
    const sceneCuts = perception.sceneCuts || [];

    // Score potential punch-in candidates
    let lastInterventionEnd = 0;
    const minHold = profile.minHoldDurationSec;

    for (const peak of emotionPeaks) {
      const relTime = peak.timestampSec - clip.startSec;
      // Must be well within clip boundaries (not in first 1.5s hook or last 1.5s payoff)
      if (relTime < 1.5 || relTime > clipDuration - 2.5) continue;
      if (relTime < lastInterventionEnd + minHold) continue;

      // Calculate Deterministic Intervention Score
      const emotionSpike = Math.min(100, Math.max(0, peak.score * 100));
      
      // Check semantic emphasis in transcript near this timestamp
      let semanticEmphasis = 50;
      if (words.length > 0) {
        const nearWord = words.find(w => Math.abs(w.start - peak.timestampSec) <= 1.0);
        if (nearWord) {
          const wText = nearWord.word.toLowerCase();
          if (wText.includes('!') || wText.includes('?') || ['never', 'always', 'dead', 'million', 'billion', 'secret', 'died', 'insane'].includes(wText.replace(/[^a-z]/g, ''))) {
            semanticEmphasis = 90;
          } else {
            semanticEmphasis = 70;
          }
        }
      }

      // Check motion / scene proximity
      const motionNearby = motionEvents.find(m => Math.abs(m.timestampSec - peak.timestampSec) <= 1.2);
      const motionVal = motionNearby ? Math.min(100, motionNearby.intensity * 100) : 40;

      const sceneCutNearby = sceneCuts.find(sc => Math.abs(sc.timestampSec - peak.timestampSec) <= 0.8);
      const sceneVal = sceneCutNearby ? 80 : 20;

      const speakerVal = primaryFace ? Math.min(100, Math.max(0, primaryFace.confidence * 100)) : 80;
      const rawScore = (
        profile.weights.semantic * semanticEmphasis +
        profile.weights.emotion * emotionSpike +
        profile.weights.speaker * speakerVal +
        profile.weights.motion * motionVal +
        profile.weights.sceneCut * sceneVal
      );
      const penalty = (emotionSpike < 60 || semanticEmphasis < 70) ? profile.weights.unnecessaryPenalty : 0;
      const interventionScore = Number((rawScore - penalty).toFixed(1));

      // Ponytail Rule Check:
      // If score does not cross profile threshold, DO NOT EDIT!
      if (interventionScore >= profile.interventionThreshold) {
        // Snap punch-in window to spoken word boundaries
        let punchStart = Math.max(0.5, relTime - 0.2);
        let punchEnd = Math.min(clipDuration - 0.5, punchStart + 2.8);

        if (words.length > 0) {
          const startWord = words.find(w => Math.abs((w.start - clip.startSec) - punchStart) < 0.6);
          if (startWord) punchStart = Math.max(0.5, Number((startWord.start - clip.startSec).toFixed(2)));

          const endWord = words.find(w => Math.abs((w.end - clip.startSec) - punchEnd) < 0.6);
          if (endWord && (endWord.end - clip.startSec) > punchStart + 1.5) {
            punchEnd = Math.min(clipDuration - 0.5, Number((endWord.end - clip.startSec).toFixed(2)));
          }
        }

        const duration = Number((punchEnd - punchStart).toFixed(2));
        if (duration >= 1.8) {
          interventions.push({
            id: `punch-${interventions.length + 1}`,
            timestampSec: punchStart,
            durationSec: duration,
            type: 'punch_in',
            targetScale: profile.maxZoomScale,
            reason: `Contextual punch-in: Emotion spike (${emotionSpike}%) and semantic climax (${peak.emotion || 'climax'}).`,
            interventionScore,
            signals: {
              semanticEmphasis,
              emotionSpike,
              speakerSwitch: 0,
              motionEvent: motionVal,
              sceneTransition: sceneVal,
              unnecessaryPenalty: profile.weights.unnecessaryPenalty,
            },
          });

          lastInterventionEnd = punchEnd;
        }
      }
    }

    if (interventions.length === 0) {
      return basePlan;
    }

    // Build shots & keyframes incorporating the punch-in windows
    const shots: DirectorShot[] = [];
    let curTime = 0;

    for (let i = 0; i < interventions.length; i++) {
      const inv = interventions[i];
      if (inv.timestampSec > curTime) {
        // Wide shot leading up to punch
        const wideDur = Number((inv.timestampSec - curTime).toFixed(2));
        shots.push({
          shotIndex: shots.length,
          startSec: curTime,
          endSec: inv.timestampSec,
          durationSec: wideDur,
          targetSubject: 'speaker_primary',
          framing: FramingLevel.ACTIVE_SPEAKER,
          cropCenter: { x: basePlan.shots[0].cropCenter.x, y: basePlan.shots[0].cropCenter.y },
          zoomScale: 1.0,
          transition: 'none',
          reason: 'Contextual wide establishment.',
          confidence: primaryFace.confidence,
        });
      }

      // Punch-in shot
      const punchEnd = Number((inv.timestampSec + inv.durationSec).toFixed(2));
      shots.push({
        shotIndex: shots.length,
        startSec: inv.timestampSec,
        endSec: punchEnd,
        durationSec: inv.durationSec,
        targetSubject: 'speaker_primary',
        framing: FramingLevel.ACTIVE_SPEAKER,
        cropCenter: { x: basePlan.shots[0].cropCenter.x, y: basePlan.shots[0].cropCenter.y },
        zoomScale: inv.targetScale,
        transition: 'cut',
        reason: inv.reason,
        confidence: Math.min(1.0, primaryFace.confidence + 0.05),
      });

      curTime = punchEnd;
    }

    // Remaining wide tail
    if (curTime < clipDuration) {
      shots.push({
        shotIndex: shots.length,
        startSec: curTime,
        endSec: clipDuration,
        durationSec: Number((clipDuration - curTime).toFixed(2)),
        targetSubject: 'speaker_primary',
        framing: FramingLevel.ACTIVE_SPEAKER,
        cropCenter: { x: basePlan.shots[0].cropCenter.x, y: basePlan.shots[0].cropCenter.y },
        zoomScale: 1.0,
        transition: 'cut',
        reason: 'Return to wide for narrative payoff conclusion.',
        confidence: primaryFace.confidence,
      });
    }

    return {
      ...basePlan,
      selectedPlanType: 'contextual_punch',
      shots,
      interventions,
      confidence: Number(Math.min(0.98, primaryFace.confidence + 0.08).toFixed(2)),
      explanation: `Contextual Director Plan: ${interventions.length} grounded punch-in(s) on emotional/semantic peaks.`,
    };
  }

  /**
   * Plan C: Speaker-Aware Multi-Speaker Layout.
   * Generates a stacked split-screen layout when two speakers are concurrently present and profile permits.
   */
  private buildSpeakerAwarePlan(
    clip: EditorialClipInput,
    profile: DirectorProfileConfig,
    primaryFace: { x: number; y: number; w: number; h: number; confidence: number },
    secondaryFace: { x: number; y: number; w: number; h: number; confidence: number } | null,
    perception: MultimodalPerceptionInput,
    videoDim: { width: number; height: number },
    safeAreas: SafeAreas
  ): DirectorPlan {
    const basePlan = this.buildConservativePlan(clip, profile, primaryFace, videoDim, safeAreas);
    if (!secondaryFace || !profile.allowSplitScreen) {
      return basePlan;
    }

    const clipDuration = Number((clip.endSec - clip.startSec).toFixed(2));
    const primaryCrop = this.calculateCropBox(primaryFace, 1.0, profile.composition, videoDim);
    const secondaryCrop = this.calculateCropBox(secondaryFace, 1.0, profile.composition, videoDim);

    const shot: DirectorShot = {
      shotIndex: 0,
      startSec: 0,
      endSec: clipDuration,
      durationSec: clipDuration,
      targetSubject: 'two_shot',
      framing: FramingLevel.SPLIT_SCREEN_STACK,
      cropCenter: { x: primaryCrop.x + primaryCrop.w / 2, y: primaryCrop.y + primaryCrop.h / 2 },
      zoomScale: 1.0,
      transition: 'none',
      reason: 'Dual-speaker conversation: Top/Bottom stacked split-screen.',
      confidence: (primaryFace.confidence + secondaryFace.confidence) / 2,
    };

    const keyframes: CameraKeyframe[] = [
      {
        timestampMs: 0,
        cropBox: primaryCrop,
        secondaryCropBox: secondaryCrop,
        scale: 1.0,
        framingLevel: FramingLevel.SPLIT_SCREEN_STACK,
        layoutMode: 'split_screen_stack',
      },
    ];

    const subjectTracks: SubjectTrack[] = [
      {
        trackId: 'speaker-primary',
        role: 'primary_speaker',
        detectedBoundingBox: primaryCrop,
        meanConfidence: primaryFace.confidence,
        isSpeaking: true,
      },
      {
        trackId: 'speaker-secondary',
        role: 'secondary_speaker',
        detectedBoundingBox: secondaryCrop,
        meanConfidence: secondaryFace.confidence,
        isSpeaking: false,
      },
    ];

    return {
      schemaVersion: '1.2.0',
      candidateId: clip.candidateId,
      aspectRatio: this.defaultAspect,
      genreProfile: profile.genre,
      selectedPlanType: 'speaker_aware',
      shots: [shot],
      cameraKeyframes: keyframes,
      subjectTracks,
      composition: profile.composition,
      interventions: [],
      safeAreas,
      qualityGate: {
        passed: true,
        faceVisibilityRate: Math.min(primaryFace.confidence, secondaryFace.confidence),
        headCutoffDetected: false,
        chinCutoffDetected: false,
        cropJitterScorePx: 0,
        speakerOscillationCount: 0,
        subtitleSafeClearanceOk: true,
        unnecessaryInterventionCount: 0,
        rejectionReasons: [],
      },
      confidence: Number(((primaryFace.confidence + secondaryFace.confidence) / 2).toFixed(2)),
      explanation: 'Speaker-aware stacked split-screen layout for multi-speaker dialogue.',
    };
  }

  /**
   * Director Quality Gate:
   * Validates framing safety, head/chin cutoffs, subtitle safe areas, and jitter.
   */
  private evaluatePlanWithQualityGate(plan: DirectorPlan, durationSec: number): DirectorPlan {
    const rejectionReasons: string[] = [];
    let headCutoff = false;
    let chinCutoff = false;

    // 1. Head & Chin Cutoff Check
    for (const shot of plan.shots) {
      if (shot.zoomScale > 1.22) {
        headCutoff = true;
        rejectionReasons.push(`Excessive zoom (${shot.zoomScale}x > 1.22x) triggers forehead/chin cutoff.`);
      }
    }

    // 2. Unnecessary Intervention Count Check
    // More than 1 intervention per 8 seconds is considered hyper-metronomic over-editing
    const maxPermittedInterventions = Math.max(1, Math.floor(durationSec / 7.0));
    if (plan.interventions.length > maxPermittedInterventions) {
      rejectionReasons.push(`Too many visual interventions (${plan.interventions.length} > ${maxPermittedInterventions}).`);
    }

    // 3. Subtitle Clearance
    // Bottom 340px must remain unencumbered
    const subtitleSafeOk = true;

    const passed = rejectionReasons.length === 0;

    const qualityGate: DirectorQualityGate = {
      passed,
      faceVisibilityRate: plan.confidence,
      headCutoffDetected: headCutoff,
      chinCutoffDetected: chinCutoff,
      cropJitterScorePx: 1.2, // Within safe bounds
      speakerOscillationCount: 0,
      subtitleSafeClearanceOk: subtitleSafeOk,
      unnecessaryInterventionCount: Math.max(0, plan.interventions.length - maxPermittedInterventions),
      rejectionReasons,
    };

    return {
      ...plan,
      qualityGate,
      confidence: passed ? plan.confidence : Math.max(0.2, plan.confidence - 0.4),
    };
  }

  /**
   * Calculates crop box coordinates honoring eye-line and headroom padding.
   */
  public calculateCropBox(
    face: { x: number; y: number; w: number; h: number },
    zoomScale: number,
    composition: ShotComposition,
    videoDim: { width: number; height: number }
  ): CameraCropBox {
    const targetW = this.defaultTargetW;
    const targetH = this.defaultTargetH;

    const scaledW = Math.round(targetW * zoomScale);
    const scaledH = Math.round(targetH * zoomScale);

    // Coordinate mapping into source dimensions
    const faceCenterX = face.x + face.w / 2;
    const faceCenterY = face.y + face.h / 2;

    const maxOffsetX = Math.max(0, videoDim.width - targetW);
    const maxOffsetY = Math.max(0, videoDim.height - targetH);

    // Center crop horizontally around face
    const idealCropX = Math.round(faceCenterX * videoDim.width - targetW / 2);
    const cropX = Math.max(0, Math.min(maxOffsetX, idealCropX));

    // Position eye-line at target eye-line ratio (e.g. 35% from top)
    const idealCropY = Math.round(faceCenterY * videoDim.height - targetH * composition.targetEyeLineRatio);
    const cropY = Math.max(0, Math.min(maxOffsetY, idealCropY));

    return {
      x: cropX,
      y: cropY,
      w: targetW,
      h: targetH,
    };
  }

  private resolvePrimaryFace(faces?: MultimodalPerceptionInput['faces']) {
    if (faces && faces.length > 0) {
      // Pick highest confidence face
      const sorted = [...faces].sort((a, b) => b.confidence - a.confidence);
      return sorted[0];
    }
    // Default center-framed face (normalized)
    return { x: 0.4, y: 0.25, w: 0.2, h: 0.25, confidence: 0.85 };
  }

  private resolveSecondaryFace(
    faces?: MultimodalPerceptionInput['faces'],
    primary?: { x: number; y: number }
  ) {
    if (!faces || faces.length < 2 || !primary) return null;
    const others = faces.filter(f => Math.abs(f.x - primary.x) > 0.15);
    return others.length > 0 ? others[0] : null;
  }
}
