import { DirectorProfileType, ShotComposition, LayoutMode } from './types';

export interface DirectorProfileConfig {
  genre: DirectorProfileType;
  interventionThreshold: number; // Minimum score (0-100) needed to trigger visual intervention
  maxZoomScale: number; // Maximum punch-in zoom scale (1.0 = no zoom)
  minHoldDurationSec: number; // Minimum hold time before next camera movement
  allowReactionShots: boolean;
  allowSplitScreen: boolean;
  weights: {
    semantic: number;
    emotion: number;
    speaker: number;
    motion: number;
    sceneCut: number;
    unnecessaryPenalty: number;
  };
  composition: ShotComposition;
  preferredLayout: LayoutMode;
}

export const DIRECTOR_PROFILES: Record<DirectorProfileType, DirectorProfileConfig> = {
  PODCAST: {
    genre: 'PODCAST',
    interventionThreshold: 68,
    maxZoomScale: 1.14,
    minHoldDurationSec: 3.0,
    allowReactionShots: true,
    allowSplitScreen: true,
    weights: {
      semantic: 0.25,
      emotion: 0.30,
      speaker: 0.30,
      motion: 0.05,
      sceneCut: 0.10,
      unnecessaryPenalty: 25,
    },
    composition: {
      strategy: 'rule_of_thirds',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.12,
      leadRoomPaddingRatio: 0.08,
    },
    preferredLayout: 'auto',
  },

  INTERVIEW: {
    genre: 'INTERVIEW',
    interventionThreshold: 72,
    maxZoomScale: 1.12,
    minHoldDurationSec: 3.5,
    allowReactionShots: true,
    allowSplitScreen: true,
    weights: {
      semantic: 0.30,
      emotion: 0.25,
      speaker: 0.35,
      motion: 0.05,
      sceneCut: 0.05,
      unnecessaryPenalty: 30,
    },
    composition: {
      strategy: 'rule_of_thirds',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.14,
      leadRoomPaddingRatio: 0.10,
    },
    preferredLayout: 'auto',
  },

  SPORTS: {
    genre: 'SPORTS',
    interventionThreshold: 85, // Rarely punch-in artificially; rely on natural play
    maxZoomScale: 1.08,
    minHoldDurationSec: 4.0,
    allowReactionShots: false,
    allowSplitScreen: false,
    weights: {
      semantic: 0.10,
      emotion: 0.35,
      speaker: 0.05,
      motion: 0.40,
      sceneCut: 0.10,
      unnecessaryPenalty: 40,
    },
    composition: {
      strategy: 'lead_room',
      targetEyeLineRatio: 0.38,
      headroomPaddingRatio: 0.15,
      leadRoomPaddingRatio: 0.15,
    },
    preferredLayout: 'single_speaker',
  },

  GAMING: {
    genre: 'GAMING',
    interventionThreshold: 75,
    maxZoomScale: 1.10,
    minHoldDurationSec: 3.0,
    allowReactionShots: false,
    allowSplitScreen: false,
    weights: {
      semantic: 0.15,
      emotion: 0.40,
      speaker: 0.10,
      motion: 0.25,
      sceneCut: 0.10,
      unnecessaryPenalty: 30,
    },
    composition: {
      strategy: 'safe_mode',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.10,
      leadRoomPaddingRatio: 0.05,
    },
    preferredLayout: 'single_speaker',
  },

  TUTORIAL: {
    genre: 'TUTORIAL',
    interventionThreshold: 88, // Do not zoom during code / UI walkthroughs
    maxZoomScale: 1.05,
    minHoldDurationSec: 5.0,
    allowReactionShots: false,
    allowSplitScreen: false,
    weights: {
      semantic: 0.40,
      emotion: 0.10,
      speaker: 0.10,
      motion: 0.10,
      sceneCut: 0.30,
      unnecessaryPenalty: 45,
    },
    composition: {
      strategy: 'center',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.12,
      leadRoomPaddingRatio: 0.05,
    },
    preferredLayout: 'single_speaker',
  },

  NEWS: {
    genre: 'NEWS',
    interventionThreshold: 80,
    maxZoomScale: 1.08,
    minHoldDurationSec: 4.0,
    allowReactionShots: false,
    allowSplitScreen: false,
    weights: {
      semantic: 0.35,
      emotion: 0.20,
      speaker: 0.25,
      motion: 0.05,
      sceneCut: 0.15,
      unnecessaryPenalty: 35,
    },
    composition: {
      strategy: 'center',
      targetEyeLineRatio: 0.33,
      headroomPaddingRatio: 0.15,
      leadRoomPaddingRatio: 0.05,
    },
    preferredLayout: 'single_speaker',
  },

  VLOG: {
    genre: 'VLOG',
    interventionThreshold: 65, // More dynamic framing permitted for high-energy vlogs
    maxZoomScale: 1.16,
    minHoldDurationSec: 2.5,
    allowReactionShots: true,
    allowSplitScreen: false,
    weights: {
      semantic: 0.25,
      emotion: 0.35,
      speaker: 0.15,
      motion: 0.15,
      sceneCut: 0.10,
      unnecessaryPenalty: 20,
    },
    composition: {
      strategy: 'center',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.12,
      leadRoomPaddingRatio: 0.08,
    },
    preferredLayout: 'single_speaker',
  },

  DEBATE: {
    genre: 'DEBATE',
    interventionThreshold: 66,
    maxZoomScale: 1.14,
    minHoldDurationSec: 2.5,
    allowReactionShots: true,
    allowSplitScreen: true,
    weights: {
      semantic: 0.30,
      emotion: 0.30,
      speaker: 0.30,
      motion: 0.05,
      sceneCut: 0.05,
      unnecessaryPenalty: 22,
    },
    composition: {
      strategy: 'two_shot',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.12,
      leadRoomPaddingRatio: 0.10,
    },
    preferredLayout: 'auto',
  },

  UNKNOWN: {
    genre: 'UNKNOWN',
    interventionThreshold: 75,
    maxZoomScale: 1.10,
    minHoldDurationSec: 3.5,
    allowReactionShots: false,
    allowSplitScreen: false,
    weights: {
      semantic: 0.25,
      emotion: 0.25,
      speaker: 0.25,
      motion: 0.10,
      sceneCut: 0.15,
      unnecessaryPenalty: 30,
    },
    composition: {
      strategy: 'center',
      targetEyeLineRatio: 0.35,
      headroomPaddingRatio: 0.12,
      leadRoomPaddingRatio: 0.05,
    },
    preferredLayout: 'single_speaker',
  },
};

export function getDirectorProfile(genreStr?: string): DirectorProfileConfig {
  if (!genreStr) return DIRECTOR_PROFILES.UNKNOWN;
  const upper = genreStr.trim().toUpperCase();
  if (upper.includes('PODCAST')) return DIRECTOR_PROFILES.PODCAST;
  if (upper.includes('INTERVIEW')) return DIRECTOR_PROFILES.INTERVIEW;
  if (upper.includes('SPORT') || upper.includes('FOOTBALL') || upper.includes('SOCCER')) return DIRECTOR_PROFILES.SPORTS;
  if (upper.includes('GAME') || upper.includes('GAMING') || upper.includes('ESPORT')) return DIRECTOR_PROFILES.GAMING;
  if (upper.includes('TUTORIAL') || upper.includes('CODE') || upper.includes('COURSE')) return DIRECTOR_PROFILES.TUTORIAL;
  if (upper.includes('NEWS') || upper.includes('FINANCE') || upper.includes('COMMENTARY')) return DIRECTOR_PROFILES.NEWS;
  if (upper.includes('VLOG') || upper.includes('TRAVEL') || upper.includes('LIFESTYLE')) return DIRECTOR_PROFILES.VLOG;
  if (upper.includes('DEBATE')) return DIRECTOR_PROFILES.DEBATE;
  return DIRECTOR_PROFILES.UNKNOWN;
}
