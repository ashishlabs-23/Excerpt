import { 
  ClipCandidate, 
  CorrelationId, 
  AgentDebateTrail, 
  AuditableEvaluation,
  CandidateConstraints
} from '@excerpt/clipping-core';
import { Logger, CostLedger } from '@excerpt/shared';
import { HookAgent, StoryAgent, CriticAgent, JudgeAgent } from './Agents';
import { EvaluationStore } from './EvaluationStore';

export class MultiAgentOrchestrator {
  private hook: HookAgent;
  private story: StoryAgent;
  private critic: CriticAgent;
  private judge: JudgeAgent;

  constructor(
    private logger: Logger, 
    private costLedger: CostLedger, 
    private store: EvaluationStore
  ) {
    this.hook = new HookAgent(logger, costLedger);
    this.story = new StoryAgent(logger, costLedger);
    this.critic = new CriticAgent(logger, costLedger);
    this.judge = new JudgeAgent(logger, costLedger);
  }

  async evaluateCandidates(
    candidates: ClipCandidate[], 
    correlationId: CorrelationId,
    constraints: CandidateConstraints
  ): Promise<AuditableEvaluation[]> {
    const results: AuditableEvaluation[] = [];

    for (const candidate of candidates) {
      // 1. Parallel Independent Agents
      const evals = await Promise.all([
        this.hook.evaluate(candidate),
        this.story.evaluate(candidate)
      ]);

      const initialTrail: AgentDebateTrail = {
        evaluations: evals,
        compositeScore: evals.reduce((sum, e) => sum + e.score, 0) / evals.length
      };

      // 2. Critic Agent evaluates the trail
      const criticEval = await this.critic.evaluateDebate(candidate, initialTrail);
      initialTrail.evaluations.push(criticEval);
      initialTrail.compositeScore = initialTrail.evaluations.reduce((sum, e) => sum + e.score, 0) / initialTrail.evaluations.length;

      // 3. Judge Agent makes final decision
      const judgeDecision = await this.judge.judge(candidate, initialTrail);

      // 4. Hard Constraints Guardrail
      // Do not allow an LLM to override hard media constraints (min/max duration)
      if (judgeDecision.recommendedBoundaryChanges) {
        const proposedDuration = judgeDecision.recommendedBoundaryChanges.newEndMs - judgeDecision.recommendedBoundaryChanges.newStartMs;
        if (proposedDuration < constraints.minDurationMs || proposedDuration > constraints.maxDurationMs) {
          this.logger.warn(`Rejecting Judge boundary recommendation (Duration ${proposedDuration}ms outside bounds)`);
          judgeDecision.recommendedBoundaryChanges = undefined; // Reject recommendation
        }
      }

      // 5. Persistence
      const auditable: AuditableEvaluation = {
        correlationId,
        candidateId: candidate.candidateId,
        candidate,
        debateTrail: initialTrail,
        judgeDecision,
        timestamp: new Date().toISOString()
      };

      await this.store.save(auditable);
      results.push(auditable);
    }

    return results;
  }
}
