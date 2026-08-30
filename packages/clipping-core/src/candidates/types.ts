export interface ScoredSegment {
  startMs: number;
  endMs: number;
  durationMs: number;
  
  // AI Scores (0.0 to 1.0)
  hookStrength: number;
  narrativeCompleteness: number;
  emotionalPeak: number;
  informationDensity: number;
  curiosityGap: number;
  visualInterest: number;
  speakerDynamics: number;
  topicCoherence: number;
  standaloneComprehensibility: number;
  ctaValueDensity: number;

  // Composite/Total score
  totalScore: number;
}

export interface ClipCandidate {
  candidateId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  
  // Rationale components
  hook: number;
  storyCompleteness: number;
  speakerContext: number;
  emotion: number;
  visualInterest: number;
  topic: number;
  
  confidence: number;
  evidence: string[]; // text/transcript fragments used as evidence
  boundaryHints: { // precise crop hints
    start: string;
    end: string;
  };
  whySelected: string[]; // explainable reasoning array
}

export interface CandidateConstraints {
  minDurationMs: number;
  maxDurationMs: number;
  acceptanceThreshold: number; // 0.0 to 1.0
  requestCount: number;
}
