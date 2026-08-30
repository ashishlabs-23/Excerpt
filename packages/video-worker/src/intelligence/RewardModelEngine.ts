import { Logger } from '@excerpt/shared';
import { RewardSignal, RewardValidator } from '@excerpt/clipping-core';
import { killOnTimeout } from '@excerpt/shared'; // Mocked timeout wrapper

export class RewardModelEngine {
  private readonly MODEL_VERSION = 'v5.7.0';
  private readonly TIMEOUT_MS = 15000;

  constructor(private logger: Logger) {}

  /**
   * Generates a neutral fallback reward if the model fails or times out (RM-3)
   */
  private generateFallback(jobId: string, candidateId: string): RewardSignal {
    this.logger.warn(`[RewardModel] Falling back to neutral 0.5 reward for candidate ${candidateId}`);
    return {
      jobId,
      candidateId,
      dimensions: {
        retentionProbability: 0.5,
        viralityScore: 0.5,
        pacingQuality: 0.5
      },
      compositeReward: 0.5,
      modelSchemaVersion: this.MODEL_VERSION,
      isFallback: true
    };
  }

  /**
   * Executes the I/O bound LLM call to score a candidate.
   * Enforces RM-2 (I/O Isolation) and RM-3 (Timeout Fallback).
   */
  async evaluateCandidate(
    jobId: string, 
    candidateId: string, 
    candidatePayload: any, 
    llmCallMock: () => Promise<Partial<RewardSignal>>
  ): Promise<RewardSignal> {
    
    try {
      this.logger.info(`[RewardModel] Evaluating candidate ${candidateId}...`);

      // RM-3: Bounded execution
      const rawResult = await this.killOnTimeoutWrapper(
        llmCallMock(),
        this.TIMEOUT_MS
      );

      const signal: RewardSignal = {
        jobId,
        candidateId,
        dimensions: {
          retentionProbability: rawResult.dimensions?.retentionProbability ?? 0.5,
          viralityScore: rawResult.dimensions?.viralityScore ?? 0.5,
          pacingQuality: rawResult.dimensions?.pacingQuality ?? 0.5
        },
        compositeReward: rawResult.compositeReward ?? 0.5,
        modelSchemaVersion: this.MODEL_VERSION,
        isFallback: false
      };

      // RM-1 & RM-4: Pure logic bounds validation
      RewardValidator.validateSignal(signal);

      return signal;

    } catch (e: any) {
      this.logger.error(`[RewardModel] Execution failed for ${candidateId}: ${e.message}`);
      // RM-3: Graceful degradation, NEVER fail the pipeline
      return this.generateFallback(jobId, candidateId);
    }
  }

  // Simulates packages/shared/killOnTimeout
  private async killOnTimeoutWrapper<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Execution timed out'));
      }, timeoutMs);

      promise.then((res) => {
        clearTimeout(timer);
        resolve(res);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
