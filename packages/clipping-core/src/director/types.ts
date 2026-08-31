export enum FramingLevel {
  ACTIVE_SPEAKER = 'ACTIVE_SPEAKER', // 1. Face + speaker track available, high conf
  TWO_SPEAKER = 'TWO_SPEAKER',       // 2. Two confident speakers alternating
  WIDE_SHOT = 'WIDE_SHOT',           // 3. Face available but low conf, or >2 speakers
  CENTER_CROP = 'CENTER_CROP',       // 4. No usable face/speaker track
  SPLIT_SCREEN_STACK = 'SPLIT_SCREEN_STACK' // 5. Top/Bottom stacked 9:16 layout
}

export type LayoutMode = 'single_speaker' | 'split_screen_stack' | 'speaker_switch' | 'auto';

export interface CameraKeyframe {
  timestampMs: number;
  cropBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  secondaryCropBox?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  scale: number; // Default 1.0. Micro punch-ins (1.05-1.12)
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
