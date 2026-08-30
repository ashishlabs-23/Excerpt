import { MediaArtifact, PerceptionEngineConfig, CostEntry, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { CostLedger, Logger, runWithTimeout } from '@excerpt/shared';

export abstract class BaseEngine<T> {
  public abstract readonly engineName: string;
  public abstract readonly engineVersion: string;
  public abstract readonly isMandatory: boolean;
  protected abstract readonly estimatedCostUsdPerMinute: number;

  constructor(protected logger: Logger, protected costLedger: CostLedger) {}

  public async run(artifact: MediaArtifact, config: PerceptionEngineConfig): Promise<T> {
    const estimatedCost = this.estimateCost(artifact);
    
    // 1. Cost Ledger Budget Check
    // This will throw PipelineError.BudgetExceeded if the ceiling is reached
    this.costLedger.append({
      stage: 'perception',
      provider: this.engineName,
      unit: 'seconds',
      quantity: artifact.durationMs / 1000,
      estimatedCostUsd: estimatedCost
    });

    // 2. Timeout wrapped execution
    try {
      return await runWithTimeout(
        this.executeInference(artifact, config), 
        config.timeoutMs
      );
    } catch (err: any) {
      if (this.isMandatory) {
         if (err instanceof PipelineError && err.code === PipelineErrorCode.Timeout) {
            throw new PipelineError(PipelineErrorCode.PerceptionEngineFailed, `${this.engineName} timed out`);
         }
         throw new PipelineError(PipelineErrorCode.PerceptionEngineFailed, `${this.engineName} failed: ${err.message}`);
      } else {
         // Rethrow generic error for orchestrator to catch and log, but not fail the job
         throw err;
      }
    }
  }

  protected estimateCost(artifact: MediaArtifact): number {
    return (artifact.durationMs / 60000) * this.estimatedCostUsdPerMinute;
  }

  protected abstract executeInference(artifact: MediaArtifact, config: PerceptionEngineConfig): Promise<T>;
}
