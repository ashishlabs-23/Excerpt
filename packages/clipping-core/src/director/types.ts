export enum FramingLevel {
  ACTIVE_SPEAKER = 'ACTIVE_SPEAKER', // 1. Face + speaker track available, high conf
  TWO_SPEAKER = 'TWO_SPEAKER',       // 2. Two confident speakers alternating
  WIDE_SHOT = 'WIDE_SHOT',           // 3. Face available but low conf, or >2 speakers
  CENTER_CROP = 'CENTER_CROP',       // 4. No usable face/speaker track
  SPLIT_SCREEN_STACK = 'SPLIT_SCREEN_STACK', // 5. Top/Bottom stacked 9:16 layout
  REACTION_SHOT = 'REACTION_SHOT',   // 6. Non-speaking listener reaction
  SCREEN_ACTION = 'SCREEN_ACTION'    // 7. Gameplay / screen recording HUD
}

export type LayoutMode = 'single_speaker' | 'split_screen_stack' | 'speaker_switch' | 'auto';

export type DirectorProfileType =
  | 'PODCAST'
  | 'INTERVIEW'
  | 'SPORTS'
  | 'GAMING'
  | 'TUTORIAL'
  | 'NEWS'
  | 'VLOG'
  | 'DEBATE'
  | 'UNKNOWN';

export interface CameraCropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraKeyframe {
  timestampMs: number;
  cropBox: CameraCropBox;
  secondaryCropBox?: CameraCropBox;
  scale: number; // Default 1.0. Micro punch-ins (1.05-1.18)
  framingLevel: FramingLevel;
  layoutMode?: LayoutMode;
}

export interface DirectorConfig {
  targetAspectRatio: number; // e.g., 9/16 for vertical
  maxVelocityPxPerSec: number;
  jitterThresholdPx: number;
  headroomPaddingRatio: number; // Ratio of face height to add above the face
  preferredLayout?: LayoutMode;
  enablePunchIn?: boolean;
}

export interface CameraPlan {
  schemaVersion: string;
  layoutMode: LayoutMode;
  keyframes: CameraKeyframe[];
}

export interface ContextualIntervention {
  id: string;
  timestampSec: number;
  durationSec: number;
  type: 'punch_in' | 'speaker_switch' | 'reaction_shot' | 'recenter' | 'none';
  targetScale: number; // 1.0 (wide) to 1.18 (punch-in)
  reason: string;
  interventionScore: number;
  signals: {
    semanticEmphasis: number;
    emotionSpike: number;
    speakerSwitch: number;
    motionEvent: number;
    sceneTransition: number;
    unnecessaryPenalty: number;
  };
}

export interface DirectorShot {
  shotIndex: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  targetSubject: 'speaker_primary' | 'speaker_secondary' | 'two_shot' | 'screen_action' | 'wide' | 'listener_reaction';
  framing: FramingLevel;
  cropCenter: { x: number; y: number };
  zoomScale: number;
  transition: 'cut' | 'smooth_pan' | 'none';
  reason: string;
  confidence: number;
}

export interface SubjectTrack {
  trackId: string;
  role: 'primary_speaker' | 'secondary_speaker' | 'guest' | 'action_object';
  detectedBoundingBox?: CameraCropBox;
  meanConfidence: number;
  isSpeaking: boolean;
}

export interface ShotComposition {
  strategy: 'rule_of_thirds' | 'center' | 'lead_room' | 'two_shot' | 'safe_mode';
  targetEyeLineRatio: number; // typically 0.30 - 0.35
  headroomPaddingRatio: number; // 0.10 - 0.15
  leadRoomPaddingRatio: number; // 0.05 - 0.10
}

export interface SafeAreas {
  topHookCardClearancePx: number; // Top ~100px safe zone
  bottomSubtitleClearancePx: number; // Bottom ~320px safe zone (for captions & progress bar)
  sideMarginPx: number;
}

export interface DirectorQualityGate {
  passed: boolean;
  faceVisibilityRate: number; // % frames with clear face
  headCutoffDetected: boolean;
  chinCutoffDetected: boolean;
  cropJitterScorePx: number;
  speakerOscillationCount: number;
  subtitleSafeClearanceOk: boolean;
  unnecessaryInterventionCount: number;
  rejectionReasons: string[];
}

export interface DirectorPlan {
  schemaVersion: '1.2.0';
  candidateId: string;
  aspectRatio: number; // 9/16 = 0.5625
  genreProfile: DirectorProfileType;
  selectedPlanType: 'conservative' | 'contextual_punch' | 'speaker_aware';
  shots: DirectorShot[];
  cameraKeyframes: CameraKeyframe[];
  subjectTracks: SubjectTrack[];
  composition: ShotComposition;
  interventions: ContextualIntervention[];
  safeAreas: SafeAreas;
  qualityGate: DirectorQualityGate;
  confidence: number;
  filtergraph?: string;
  explanation: string;
}

