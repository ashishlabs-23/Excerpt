import { AuditableEvaluation } from '../evaluation/types';

export interface RankingWeights {
  hook: number;
  story: number;
  emotion: number;
  visualInterest: number;
  informationDensity: number;
  topicRelevance: number;
  speakerQuality: number;
  platformFit: number;
  novelty: number;
}

export interface DiversityConfig {
  timeDiversityPenalty: number;
  topicDiversityPenalty: number;
}

export interface RankingProfile {
  id: string;
  version: string;
  description: string;
  weights: RankingWeights;
  diversity: DiversityConfig;
}

export interface RenderJob {
  candidateId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  rankingScore: number;
}

export interface RankingPlan {
  profileId: string;
  profileVersion: string;
  renderJobs: RenderJob[];
}
