import { CorrelationId } from './correlation';
import { PipelineErrorCode } from '../errors/PipelineError';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  correlationId: CorrelationId;
  jobId?: string;
  stage?: string;
  event: string;
  level: LogLevel;
  durationMs?: number;
  errorCode?: PipelineErrorCode;
  meta?: Record<string, unknown>;
  timestamp: string; // ISO 8601
}
