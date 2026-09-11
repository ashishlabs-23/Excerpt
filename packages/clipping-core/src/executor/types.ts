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

export interface ProcessExitResult {
  code: number | null;
  signal: string | null;
}

export interface ProcessHandle {
  pid?: number;
  isExited: boolean;
  killTree(signal?: string, gracePeriodMs?: number): Promise<void>;
  waitForExit(): Promise<ProcessExitResult>;
  collectOutput(): Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
}

export interface ProcessRunner {
  spawn(command: string, args: string[], options?: any): ProcessHandle;
}

export interface StageExecutionContext {
  abortSignal: AbortSignal;
  registerProcess: (handle: ProcessHandle) => void;
  processRunner?: ProcessRunner;
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
  processRunner?: ProcessRunner;
  validateInput?: (input: TInput) => boolean | Promise<boolean>;
  execute: (input: TInput, attempt: number, context: StageExecutionContext) => Promise<TOutput>;
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
