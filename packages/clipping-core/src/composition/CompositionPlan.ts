/**
 * CompositionPlan.ts — Canonical multi-subject and multi-modal layout specification for @excerpt/clipping-core.
 *
 * Enforces the architectural invariant:
 *   The director decides the composition; the renderer realizes the composition.
 *   Composition logic must never leak into FFmpeg CLI generation code.
 */

export type CompositionMode =
  | 'single_subject'
  | 'split_stack'
  | 'split_side_by_side'
  | 'screen_plus_face'
  | 'gameplay_plus_face'
  | 'full_frame_broll';

export type OverlapPolicy =
  | 'forbidden'
  | 'allowed'
  | 'allowed_within_parent';

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrackRole =
  | 'primary_speaker'
  | 'secondary_speaker'
  | 'screen'
  | 'gameplay'
  | 'broll'
  | 'neutral_scene';

export interface CameraPathKeyframe {
  timestampMs: number;
  crop: PixelBounds;
}

export interface CompositionTrack {
  id: string;
  sourceId: string;
  role: TrackRole;
  sourceCrop: PixelBounds;
  canvasPlacement: PixelBounds;
  zIndex: number;
  overlapPolicy: OverlapPolicy;
  cameraPath?: {
    keyframes: CameraPathKeyframe[];
  };
}

export interface CompositionSafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CompositionPlan {
  mode: CompositionMode;
  canvas: {
    width: number;
    height: number;
    aspectRatio: '9:16' | '1:1' | '16:9';
    fps?: number;
  };
  tracks: CompositionTrack[];
  safeZones: CompositionSafeZone[];
  divider?: {
    enabled: boolean;
    color: string;
    thicknessPx: number;
  };
}

export const DEFAULT_9_16_SAFE_ZONES: CompositionSafeZone[] = [
  {
    top: 120,     // Header overlay safe margin
    bottom: 380,  // Captions & platform description safe margin
    left: 80,     // Left margin
    right: 120,   // Right interaction gutter (like, share, comment icons)
  },
];

/**
 * Creates a standard single-subject composition (1080x1920 portrait).
 */
export function createSingleSubjectComposition(
  cropBox: PixelBounds,
  canvasWidth: number = 1080,
  canvasHeight: number = 1920,
  cameraKeyframes?: CameraPathKeyframe[]
): CompositionPlan {
  return {
    mode: 'single_subject',
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      aspectRatio: '9:16',
    },
    tracks: [
      {
        id: 'track_primary',
        sourceId: 'source_0',
        role: 'primary_speaker',
        sourceCrop: { ...cropBox },
        canvasPlacement: {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        },
        zIndex: 0,
        overlapPolicy: 'forbidden',
        cameraPath: cameraKeyframes && cameraKeyframes.length > 0 ? { keyframes: cameraKeyframes } : undefined,
      },
    ],
    safeZones: DEFAULT_9_16_SAFE_ZONES,
  };
}

/**
 * Creates a stacked split-screen composition for dual speakers (top/bottom).
 * Top: Primary speaker (e.g. Host/Active), scaled to 1080x960.
 * Bottom: Secondary speaker (e.g. Guest/Reactor), scaled to 1080x960.
 */
export function createSplitStackComposition(
  primaryCrop: PixelBounds,
  secondaryCrop: PixelBounds,
  canvasWidth: number = 1080,
  canvasHeight: number = 1920,
  topKeyframes?: CameraPathKeyframe[],
  bottomKeyframes?: CameraPathKeyframe[]
): CompositionPlan {
  const halfHeight = Math.floor(canvasHeight / 2);

  return {
    mode: 'split_stack',
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      aspectRatio: '9:16',
    },
    tracks: [
      {
        id: 'track_top',
        sourceId: 'source_0',
        role: 'primary_speaker',
        sourceCrop: { ...primaryCrop },
        canvasPlacement: {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: halfHeight,
        },
        zIndex: 0,
        overlapPolicy: 'forbidden',
        cameraPath: topKeyframes && topKeyframes.length > 0 ? { keyframes: topKeyframes } : undefined,
      },
      {
        id: 'track_bottom',
        sourceId: 'source_0',
        role: 'secondary_speaker',
        sourceCrop: { ...secondaryCrop },
        canvasPlacement: {
          x: 0,
          y: halfHeight,
          width: canvasWidth,
          height: halfHeight,
        },
        zIndex: 1,
        overlapPolicy: 'forbidden',
        cameraPath: bottomKeyframes && bottomKeyframes.length > 0 ? { keyframes: bottomKeyframes } : undefined,
      },
    ],
    safeZones: DEFAULT_9_16_SAFE_ZONES,
    divider: {
      enabled: true,
      color: '#1e293b',
      thicknessPx: 4,
    },
  };
}

/**
 * Creates a picture-in-picture screen + talking head composition.
 * Base: screen recording (fullscreen or top 65%).
 * Overlay: presenter talking head floating in corner or bottom inset.
 */
export function createScreenPlusFaceComposition(
  screenCrop: PixelBounds,
  faceCrop: PixelBounds,
  canvasWidth: number = 1080,
  canvasHeight: number = 1920
): CompositionPlan {
  return {
    mode: 'screen_plus_face',
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      aspectRatio: '9:16',
    },
    tracks: [
      {
        id: 'track_screen',
        sourceId: 'source_screen',
        role: 'screen',
        sourceCrop: { ...screenCrop },
        canvasPlacement: {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        },
        zIndex: 0,
        overlapPolicy: 'allowed',
      },
      {
        id: 'track_face_pip',
        sourceId: 'source_face',
        role: 'primary_speaker',
        sourceCrop: { ...faceCrop },
        canvasPlacement: {
          x: canvasWidth - 360 - 40, // 40px margin right
          y: canvasHeight - 480 - 160, // 160px above bottom captions
          width: 360,
          height: 480,
        },
        zIndex: 10,
        overlapPolicy: 'allowed',
      },
    ],
    safeZones: DEFAULT_9_16_SAFE_ZONES,
  };
}

function doRectanglesIntersect(r1: PixelBounds, r2: PixelBounds): boolean {
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  );
}

/**
 * Validates invariant integrity of a CompositionPlan.
 * Supports OverlapPolicy ('forbidden' | 'allowed' | 'allowed_within_parent') with zIndex ordering.
 */
export function validateCompositionPlan(plan: CompositionPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.mode) errors.push('CompositionMode is required.');
  if (plan.canvas.width <= 0 || plan.canvas.height <= 0) {
    errors.push(`Invalid canvas dimensions: ${plan.canvas.width}x${plan.canvas.height}`);
  }
  if (!Array.isArray(plan.tracks) || plan.tracks.length === 0) {
    errors.push('CompositionPlan must contain at least one track.');
  }

  if (plan.mode === 'split_stack' && plan.tracks.length < 2) {
    errors.push('split_stack composition requires at least 2 tracks (top and bottom).');
  }

  for (const track of plan.tracks || []) {
    if (track.sourceCrop.width <= 0 || track.sourceCrop.height <= 0) {
      errors.push(`Track ${track.id} has invalid sourceCrop dimensions: ${track.sourceCrop.width}x${track.sourceCrop.height}`);
    }
    if (track.canvasPlacement.width <= 0 || track.canvasPlacement.height <= 0) {
      errors.push(`Track ${track.id} has invalid canvasPlacement dimensions: ${track.canvasPlacement.width}x${track.canvasPlacement.height}`);
    }
  }

  // Validate track overlap constraints
  const tracks = plan.tracks || [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const t1 = tracks[i];
      const t2 = tracks[j];

      if (doRectanglesIntersect(t1.canvasPlacement, t2.canvasPlacement)) {
        // Overlap is permitted if either track explicitly permits it or is an overlay with distinct zIndex
        const permitsOverlap =
          t1.overlapPolicy === 'allowed' ||
          t2.overlapPolicy === 'allowed' ||
          t1.overlapPolicy === 'allowed_within_parent' ||
          t2.overlapPolicy === 'allowed_within_parent' ||
          (t1.zIndex !== t2.zIndex && (plan.mode === 'screen_plus_face' || plan.mode === 'gameplay_plus_face'));

        if (!permitsOverlap) {
          errors.push(`Collision: Track ${t1.id} and Track ${t2.id} overlap on canvas but overlapPolicy is forbidden.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
