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
  startSnappedTo: 'sentence_start' | 'clause_start' | 'acoustic_silence' | 'raw_word';
  endSnappedTo: 'sentence_end' | 'payoff_end' | 'clause_end' | 'acoustic_silence' | 'raw_word';
  audioFadeInMs?: number;
  audioFadeOutMs?: number;
}

export interface ClipDurationPolicy {
  targetSec?: number;
  minSec: number;
  maxSec: number;
  toleranceSec?: number;
  priority: 'hook' | 'story' | 'insight' | 'custom';
}

export interface BoundaryPolicy {
  durationPolicy?: ClipDurationPolicy;
  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  preferredWindowMarginSec?: number;
  preRollBreathMs?: number;
  postRollTailMs?: number;
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
