import { ClipCandidate, AgentEvaluation, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger, CostLedger, runWithTimeout } from '@excerpt/shared';

export abstract class AbstractAgent {
  public abstract readonly name: string;
  protected abstract readonly estimatedCostUsd: number;
  protected abstract readonly timeoutMs: number;

  constructor(protected logger: Logger, protected costLedger: CostLedger) {}

  /**
   * Orchestrates the agent call. Wraps in timeout and budget ceilings.
   * If an exception occurs, explicitly triggers the rule-based fallback rather than failing the candidate.
   */
  public async evaluate(candidate: ClipCandidate): Promise<AgentEvaluation> {
    try {
      this.costLedger.append({
        stage: 'evaluation',
        provider: this.name,
        unit: 'calls',
        quantity: 1,
        estimatedCostUsd: this.estimatedCostUsd
      });

      return await runWithTimeout(this.executeInference(candidate), this.timeoutMs);
    } catch (err: any) {
      this.logger.warn(`[${this.name}] Failed or timed out (${err.message}). Using fallback scoring.`);
      return this.generateFallback(candidate, err.message);
    }
  }

  protected abstract executeInference(candidate: ClipCandidate): Promise<AgentEvaluation>;

  /**
   * Rule-based fallback score calculated from raw signals, preventing agent failures from crashing the job.
   */
  protected generateFallback(candidate: ClipCandidate, errorMsg: string): AgentEvaluation {
    let fallbackScore = 0.5;
    
    if (this.name === 'HookAgent') fallbackScore = candidate.hook;
    else if (this.name === 'StoryAgent') fallbackScore = candidate.storyCompleteness;
    else if (this.name === 'EmotionAgent') fallbackScore = candidate.emotion;
    else if (this.name === 'ViralityAgent') fallbackScore = (candidate.hook + candidate.emotion) / 2;
    
    return {
      agentName: this.name,
      score: fallbackScore,
      confidence: 0.3,
      reasoning: `Rule-based fallback due to LLM failure: ${errorMsg}`,
      risks: ['LLM Evaluation Failed'],
      fallbackUsed: true
    };
  }
}
