export interface WordInfo {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionResult {
  text: string;
  segments: any[];
  words?: WordInfo[];
}

export type StoryType =
  | 'goal'
  | 'funny_moment'
  | 'debate'
  | 'tutorial'
  | 'reveal'
  | 'reaction'
  | 'challenge'
  | 'failure'
  | 'comeback'
  | 'celebration'
  | 'question'
  | 'prediction'
  | 'argument'
  | 'unknown';

export interface MultiDimensionalScore {
  hook: number;
  context: number;
  emotion: number;
  curiosity: number;
  resolution: number;
  visual: number;
  audio: number;
  retention: number;
  shareability: number;
}

export interface CandidateRange {
  start: number;
  end: number;
  reasoning: string;
}

export interface StoryArc {
  id: string;
  title: string;
  type: StoryType;
  confidence: number;
  context_required: boolean;
  boundaries: {
    hook_start: number;
    climax: number;
    resolution: number;
  };
  inferred_emotions: string[];
  candidate_ranges: CandidateRange[];
  scores: MultiDimensionalScore;
  eventIds: string[];
}

export interface ClipCandidate {
  start_time: number;
  end_time: number;
  hook: string;
  payoff: string;
  emotion: string;
  curiosity_gap: string;
  visual_importance: number;
  confidence: number;
  summary: string;
}
