import { 
  ClipCandidate, 
  AgentEvaluation, 
  AgentDebateTrail, 
  JudgeDecision 
} from '@excerpt/clipping-core';
import { Logger, CostLedger } from '@excerpt/shared';
import { AbstractAgent } from './Agent';

// 1. HookAgent
export class HookAgent extends AbstractAgent {
  public readonly name = 'HookAgent';
  protected readonly estimatedCostUsd = 0.001;
  protected readonly timeoutMs = 5000;

  protected async executeInference(candidate: ClipCandidate): Promise<AgentEvaluation> {
    return {
      agentName: this.name,
      score: candidate.hook,
      confidence: 0.9,
      reasoning: `Hook strength evaluated at ${candidate.hook}`,
      risks: [],
      fallbackUsed: false
    };
  }
}

// 2. StoryAgent
export class StoryAgent extends AbstractAgent {
  public readonly name = 'StoryAgent';
  protected readonly estimatedCostUsd = 0.001;
  protected readonly timeoutMs = 5000;

  protected async executeInference(candidate: ClipCandidate): Promise<AgentEvaluation> {
    return {
      agentName: this.name,
      score: candidate.storyCompleteness,
      confidence: 0.85,
      reasoning: `Story completeness evaluated at ${candidate.storyCompleteness}`,
      risks: [],
      fallbackUsed: false
    };
  }
}

// 3. CriticAgent
export class CriticAgent extends AbstractAgent {
  public readonly name = 'CriticAgent';
  protected readonly estimatedCostUsd = 0.0015;
  protected readonly timeoutMs = 5000;

  protected async executeInference(candidate: ClipCandidate): Promise<AgentEvaluation> {
    return {
      agentName: this.name,
      score: 0.8,
      confidence: 0.8,
      reasoning: 'Critic evaluated peer evaluations',
      risks: [],
      fallbackUsed: false
    };
  }

  async evaluateDebate(candidate: ClipCandidate, trail: AgentDebateTrail): Promise<AgentEvaluation> {
    const avgScore = trail.compositeScore;
    return {
      agentName: this.name,
      score: Math.max(0, avgScore - 0.05),
      confidence: 0.85,
      reasoning: `Critic evaluated initial trail with composite score ${avgScore.toFixed(2)}`,
      risks: avgScore < 0.6 ? ['Low retention potential'] : [],
      fallbackUsed: false
    };
  }
}

// 4. JudgeAgent
export class JudgeAgent {
  constructor(private logger: Logger, private costLedger: CostLedger) {}

  async judge(candidate: ClipCandidate, trail: AgentDebateTrail): Promise<JudgeDecision> {
    const evaluations = trail.evaluations;
    const avgScore = evaluations.length > 0 
      ? evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length 
      : 0.5;

    const accept = avgScore >= 0.6;

    return {
      finalScore: avgScore,
      confidence: 0.9,
      accept,
      fallbackUsed: evaluations.some(e => e.fallbackUsed),
      recommendedBoundaryChanges: undefined
    };
  }
}
