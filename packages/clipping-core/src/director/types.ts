export enum FramingLevel {
  ACTIVE_SPEAKER = 'ACTIVE_SPEAKER', // 1. Face + speaker track available, high conf
  TWO_SPEAKER = 'TWO_SPEAKER',       // 2. Two confident speakers alternating
  WIDE_SHOT = 'WIDE_SHOT',           // 3. Face available but low conf, or >2 speakers
  CENTER_CROP = 'CENTER_CROP'        // 4. No usable face/speaker track
}

export interface CameraKeyframe {
  timestampMs: number;
  cropBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  scale: number; // Default 1.0. Do not compound with AR conversion.
  framingLevel: FramingLevel;
}

export interface DirectorConfig {
  targetAspectRatio: number; // e.g., 9/16 for vertical
  maxVelocityPxPerSec: number;
  jitterThresholdPx: number;
  headroomPaddingRatio: number; // Ratio of face height to add above the face
}

export interface CameraPlan {
  schemaVersion: string;
  keyframes: CameraKeyframe[];
}
