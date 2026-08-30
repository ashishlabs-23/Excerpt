import { CostEntry, CostLedger, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

export { CostLedger, CostEntry };

export class LedgerManager implements CostLedger {
  public entries: CostEntry[] = [];
  public totalCostUsd = 0;

  constructor(public readonly jobId: string, public readonly maxBudgetUsd: number) {}

  append(entry: Omit<CostEntry, 'jobId'>) {
    if (this.totalCostUsd >= this.maxBudgetUsd) {
      throw new PipelineError(
        PipelineErrorCode.BudgetExceeded,
        `Cannot append cost: Budget of $${this.maxBudgetUsd} already exceeded ($${this.totalCostUsd} used)`
      );
    }
    
    const fullEntry: CostEntry = { ...entry, jobId: this.jobId };
    this.entries.push(fullEntry);
    this.totalCostUsd += entry.estimatedCostUsd;
  }
}

export function createCostLedger(jobId: string, maxBudgetUsd: number): LedgerManager {
  return new LedgerManager(jobId, maxBudgetUsd);
}
