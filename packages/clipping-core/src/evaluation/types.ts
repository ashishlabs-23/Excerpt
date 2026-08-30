import { CorrelationId } from '../types/correlation';
import { ClipCandidate } from '../candidates/types';

export interface AgentEvaluation {
  agentName: string;
  score: number; // 0.0 to 1.0
  confidence: number; // 0.0 to 1.0
  reasoning: string;
  risks: string[];
  recommendedChanges?: {
    startOffsetMs?: number;
    endOffsetMs?: number;
    reason: string;
  };
  fallbackUsed: boolean; // True if LLM failed/timed-out and rule-based fallback was applied
}

export interface AgentDebateTrail {
  evaluations: AgentEvaluation[];
  compositeScore: number;
}

export interface JudgeDecision {
  finalScore: number;
  confidence: number;
  accept: boolean;
  recommendedBoundaryChanges?: {
    newStartMs: number;
    newEndMs: number;
    reason: string;
  };
  fallbackUsed: boolean;
}

export interface AuditableEvaluation {
  correlationId: CorrelationId;
  candidateId: string;
  candidate: ClipCandidate;
  debateTrail: AgentDebateTrail;
  judgeDecision: JudgeDecision;
  timestamp: string;
}
