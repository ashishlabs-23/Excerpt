import { ErrorCategory, PipelineError, TimeoutType } from '../types/errorTaxonomy';

export type StageHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface StageHealth {
  stage: string;
  status: StageHealthStatus;
  successRate: number;
  avgLatencyMs: number;
  lastError?: string;
  lastUpdated: string;
}

export interface StageExecutionOptions<TInput, TOutput> {
  stage: string;
  component: string;
  provider?: string;
  timeoutMs?: number;
  timeoutType?: TimeoutType;
  maxRetries?: number;
  retryDelayMs?: number;
  jobId?: string;
  clipId?: string;
  validateInput?: (input: TInput) => boolean | Promise<boolean>;
  execute: (input: TInput, attempt: number) => Promise<TOutput>;
  validateOutput?: (output: TOutput) => boolean | Promise<boolean>;
  onTelemetry?: (metrics: StageExecutionTelemetry) => void | Promise<void>;
}

export interface StageExecutionTelemetry {
  stage: string;
  component: string;
  provider?: string;
  jobId?: string;
  clipId?: string;
  status: 'success' | 'failed';
  durationMs: number;
  attempt: number;
  memoryDeltaMb: number;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  suggestedFix?: string;
  timestamp: string;
}
