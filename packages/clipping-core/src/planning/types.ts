export interface WordUnit {
  text: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}

export interface ClauseUnit {
  id: string;
  sentenceId: string;
  text: string;
  startSec: number;
  endSec: number;
  words: WordUnit[];
  isIntroductoryPreamble: boolean;
  endsWithConjunction: boolean;
}

export interface SentenceUnit {
  id: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  speaker?: string;
  words: WordUnit[];
  clauses: ClauseUnit[];
  hasTerminalPunctuation: boolean;
}

export interface BoundaryEvidence {
  sentenceBoundary: number;
  clauseBoundary: number;
  acousticBoundary: number;
  speakerTurnBoundary: number;
  sceneBoundary: number;
  payoffBoundary: number;
}

export interface BoundaryFeasibility {
  lowerBound: number;
  upperBound: number;
  isFeasible: boolean;
  hardViolations: string[];
}

export interface BoundaryProfile {
  name: 'podcast' | 'interview' | 'tutorial' | 'sports' | 'vlog' | 'default';
  preRollMs: number;             // ms before speech onset for natural attack/breath (e.g. 120ms)
  postRollMs: number;            // ms after speech end into room tone (e.g. 180ms)
  speechSafetyMarginMs: number;  // ms minimum clearance before next speech onset (e.g. 80ms)
  silenceThresholdDb: number;    // dB for acoustic silence detection (e.g. -35dB)
  minSilenceMs: number;          // ms minimum pause to qualify as silence (e.g. 250ms)
  shortPauseMs: number;          // ms intra-sentence pause (e.g. 180ms)
  longPauseMs: number;           // ms acoustic inter-sentence pause for AcousticBoundarySnapper (e.g. 450ms)
  /**
   * Minimum inter-word silence (ms) that SemanticUnitTokenizer treats as a sentence boundary.
   * MUST be kept distinct from longPauseMs: a 350ms pause can be an excellent acoustic landing
   * without being a sentence boundary. All values MUST be >= 650ms to avoid splitting
   * mid-thought pauses (breath, emphasis, intra-sentence hesitation).
   */
  sentenceBreakPauseMs: number;
  sceneCutThreshold?: number;        // FFmpeg select scene score threshold (e.g. 0.30)
  reactionTailWindowMs?: number;     // Window after speech to look for secondary speaker reaction (e.g. 300ms)
  maxReactionExtensionMs?: number;   // Max extension for conversational reaction hold (e.g. 400ms)
  fadeInMs?: number;                 // Baseline fade-in for shallow silence (e.g. 35ms)
  fadeOutMs?: number;                // Baseline fade-out for shallow silence (e.g. 40ms)
  viewerStartWeights?: ViewerStartWeights; // Configurable start preference weights
  viewerEndWeights?: ViewerEndWeights;     // Configurable end preference weights
}

export const STANDARD_BOUNDARY_PROFILES: Record<BoundaryProfile['name'], BoundaryProfile> = {
  podcast: {
    name: 'podcast',
    preRollMs: 140,
    postRollMs: 200,
    speechSafetyMarginMs: 80,
    silenceThresholdDb: -35,
    minSilenceMs: 250,
    shortPauseMs: 200,
    longPauseMs: 500,
    sentenceBreakPauseMs: 700, // Podcast hosts pause 400-700ms mid-sentence for emphasis
  },
  interview: {
    name: 'interview',
    preRollMs: 120,
    postRollMs: 180,
    speechSafetyMarginMs: 90,
    silenceThresholdDb: -32,
    minSilenceMs: 220,
    shortPauseMs: 180,
    longPauseMs: 450,
    sentenceBreakPauseMs: 680,
  },
  tutorial: {
    name: 'tutorial',
    preRollMs: 100,
    postRollMs: 160,
    speechSafetyMarginMs: 70,
    silenceThresholdDb: -38,
    minSilenceMs: 200,
    shortPauseMs: 150,
    longPauseMs: 400,
    sentenceBreakPauseMs: 650,
  },
  sports: {
    name: 'sports',
    preRollMs: 80,
    postRollMs: 140,
    speechSafetyMarginMs: 60,
    silenceThresholdDb: -28,
    minSilenceMs: 180,
    shortPauseMs: 120,
    longPauseMs: 350,
    sentenceBreakPauseMs: 650, // Commentary can pause 350ms acoustically but 650ms+ for actual sentence end
  },
  vlog: {
    name: 'vlog',
    preRollMs: 100,
    postRollMs: 160,
    speechSafetyMarginMs: 75,
    silenceThresholdDb: -32,
    minSilenceMs: 200,
    shortPauseMs: 160,
    longPauseMs: 420,
    sentenceBreakPauseMs: 670,
  },
  default: {
    name: 'default',
    preRollMs: 120,
    postRollMs: 180,
    speechSafetyMarginMs: 80,
    silenceThresholdDb: -35,
    minSilenceMs: 220,
    shortPauseMs: 180,
    longPauseMs: 450,
    sentenceBreakPauseMs: 650,
  },
};

export type BoundaryCandidateType = 'semantic' | 'punctuation' | 'acoustic' | 'visual' | 'hybrid';

export type ClipShape = 'podcast_insight' | 'story' | 'tutorial' | 'funny_moment' | 'general';
export type EndMode = 'payoff' | 'reaction' | 'resolution' | 'loop_friendly';

export interface ViewerStartWeights {
  promiseAlignment?: number;
  hookStrength?: number;
  contextSufficiency?: number;
  visualSalience?: number;
  speechOnsetQuality?: number;
  deadAirPenalty?: number;
  previousContextPenalty?: number;
}

export interface ViewerEndWeights {
  completion?: number;
  payoff?: number;
  reaction?: number;
  acousticLanding?: number;
  nextSpeechRisk?: number;
  deadTailPenalty?: number;
  loopFriendlyBonus?: number;
}

export interface StartPreference {
  promiseAlignmentScore: number;      // Reassurance that clip delivers topic/hook promise
  hookStrengthScore: number;          // Intentional hook / thesis clause presence
  contextSufficiencyScore: number;    // Standalone clarity (1.0 - contextDebt)
  contextDebtScore: number;           // Unresolved pronoun/anaphoric dependency
  visualSalienceScore: number;        // Aligned shot change or active speaker face
  speechOnsetQuality: number;         // Safe attack room / pre-roll breath
  openingRelevanceGapMs: number;      // Time from clip start until first selected thesis/hook speech
  deadAirPenalty: number;             // Penalty for excessive leading silence/filler
  previousContextPenalty: number;     // Penalty for conversational residue
  totalScore: number;
}

export interface EndPreference {
  completionScore: number;            // Complete grammatical / semantic thought
  payoffScore: number;                // Punchline, thesis payoff, or resolution
  reactionScore: number;              // Bounded secondary speaker reaction value
  acousticLandingScore: number;       // Clean room-tone silence landing
  nextSpeechRisk: number;             // Risk penalty when approaching next utterance
  deadTailPenalty: number;            // Penalty for idle empty silence lingering after speech
  loopFriendlyBonus: number;          // Configurable bonus if narrative seamlessly reconnects to opening
  endMode: EndMode;
  totalScore: number;
}

export interface CanonicalClipBoundary {
  startSec: number;
  endSec: number;
  durationSec: number;
  startConfidence: number;
  endConfidence: number;
  compositeScore: number;
  evidence: BoundaryEvidence;
  durationTargetSec: number;
  durationDeviationSec: number;
  durationFitScore?: number;
  rationale: string;
  startSnappedTo: 'sentence_start' | 'clause_start' | 'acoustic_silence' | 'visual_cut' | 'raw_word';
  endSnappedTo: 'sentence_end' | 'payoff_end' | 'clause_end' | 'acoustic_silence' | 'visual_cut' | 'raw_word';
  candidateType?: BoundaryCandidateType;
  audioFadeInMs?: number;
  audioFadeOutMs?: number;
  clipShape?: ClipShape;
  endMode?: EndMode;
  startPreference?: StartPreference;
  endPreference?: EndPreference;
  openingRelevanceGapMs?: number;
  timeToMeaningfulContentMs?: number;
  deadTailMs?: number;
  boundaryEfficiency?: number;        // Diagnostic: useful_content_duration / clip_duration
  boundaryWasteRatio?: number;        // Diagnostic: dead_tail_duration / clip_duration
}

export interface BoundaryConstraints {
  softMaxDurationSec: number;
  hardMaxDurationSec: number;
  source: 'policy' | 'platform_capability';
}

export interface ClipDurationPolicy {
  targetSec?: number;
  minSec: number;
  maxSec: number;
  hardMaxSec?: number; // Absolute platform ceiling (e.g. YouTube Shorts = 180s, TikTok = creator_info.max_video_post_duration_sec)
  toleranceSec?: number;
  priority: 'hook' | 'story' | 'insight' | 'custom';
}

export interface BoundaryPolicy {
  durationPolicy?: ClipDurationPolicy;
  constraints?: BoundaryConstraints;
  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  softMaxDurationSec?: number;
  hardMaxDurationSec?: number;
  preferredWindowMarginSec?: number;
  preRollBreathMs?: number;
  postRollTailMs?: number;
  speechSafetyMarginMs?: number;
  profile?: BoundaryProfile;
  audioFadeInMs?: number;
  audioFadeOutMs?: number;
  weights?: {
    semanticCompletion?: number;
    payoffCompletion?: number;
    sentenceCompletion?: number;
    acousticLanding?: number;
    speakerTurnAlignment?: number;
    sceneAlignment?: number;
    durationFit?: number;
  };
}

export const DURATION_PROFILE_TARGETS = {
  hookTargetSec: 22,
  storyTargetSec: 55,
} as const;
