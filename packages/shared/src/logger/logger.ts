import { CorrelationId, LogEntry, LogLevel, PipelineErrorCode } from '@excerpt/clipping-core';

export class Logger {
  constructor(private readonly correlationId: CorrelationId, private readonly jobId?: string) {}

  private log(level: LogLevel, event: string, options?: { durationMs?: number; errorCode?: PipelineErrorCode; meta?: Record<string, unknown>; stage?: string }) {
    const entry: LogEntry = {
      correlationId: this.correlationId,
      jobId: this.jobId,
      stage: options?.stage,
      event,
      level,
      durationMs: options?.durationMs,
      errorCode: options?.errorCode,
      meta: options?.meta,
      timestamp: new Date().toISOString()
    };
    
    // In a real app this would go to a structured log drain.
    // For now, we write to stdout so it can be captured by our tests/infrastructure.
    console.log(JSON.stringify(entry));
  }

  info(event: string, options?: Omit<Parameters<Logger['log']>[2], 'errorCode'>) {
    this.log('info', event, options);
  }

  warn(event: string, options?: Parameters<Logger['log']>[2]) {
    this.log('warn', event, options);
  }

  error(event: string, options?: Parameters<Logger['log']>[2]) {
    this.log('error', event, options);
  }

  debug(event: string, options?: Parameters<Logger['log']>[2]) {
    this.log('debug', event, options);
  }
}
