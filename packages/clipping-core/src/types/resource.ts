export interface ResourceCeilingConfig {
  maxInputDurationMs: number;
  maxInputSizeBytes: number;
  maxConcurrentJobsPerTenant: number;
  maxRenderJobsPerPipeline: number;
}

export interface CostEntry {
  jobId: string;
  stage: string;
  provider: string;
  unit: 'seconds' | 'bytes' | 'tokens' | 'requests';
  quantity: number;
  estimatedCostUsd: number;
}

export interface CostLedger {
  jobId: string;
  maxBudgetUsd: number;
  entries: CostEntry[];
  totalCostUsd: number;
  append(entry: any): void;
}
