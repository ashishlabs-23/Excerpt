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

export interface CompositionTrack {
  id: string;
  sourceId: string;
  role: TrackRole;
  sourceCrop: PixelBounds;
  canvasPlacement: PixelBounds;
  zIndex: number;
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
  canvasHeight: number = 1920
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
  canvasHeight: number = 1920
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
 * Validates invariant integrity of a CompositionPlan.
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

  return {
    valid: errors.length === 0,
    errors,
  };
}
