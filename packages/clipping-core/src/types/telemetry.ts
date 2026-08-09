/**
 * Standard structured telemetry schema and collector for clipping pipeline stages.
 * Owned strictly by @excerpt/clipping-core.
 */

import { ErrorCategory } from './errorTaxonomy';

export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'retrying';

export interface StageTelemetry {
  stage: string;
  start: string; // ISO 8601 string
  end?: string;  // ISO 8601 string
  durationMs?: number;
  memoryMb?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  gpuUtilPercent?: number;
  status: StageStatus;
  error?: {
    category: ErrorCategory;
    summary: string;
    message: string;
    stack?: string;
  };
  artifacts?: Array<{
    name: string;
    path?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
  metadata?: Record<string, any>;
}

export interface TelemetryCollector {
  startStage(stageName: string, metadata?: Record<string, any>): StageTelemetry;
  endStageSuccess(stageName: string, artifacts?: StageTelemetry['artifacts'], metadata?: Record<string, any>): StageTelemetry;
  endStageError(stageName: string, error: unknown, metadata?: Record<string, any>): StageTelemetry;
  getHistory(): StageTelemetry[];
}

export class DefaultTelemetryCollector implements TelemetryCollector {
  private stages: Map<string, StageTelemetry> = new Map();
  private history: StageTelemetry[] = [];

  startStage(stageName: string, metadata?: Record<string, any>): StageTelemetry {
    const memory = process.memoryUsage();
    const telemetry: StageTelemetry = {
      stage: stageName,
      start: new Date().toISOString(),
      status: 'running',
      memoryMb: {
        rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
        heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      },
      metadata,
    };
    this.stages.set(stageName, telemetry);
    return telemetry;
  }

  endStageSuccess(stageName: string, artifacts?: StageTelemetry['artifacts'], metadata?: Record<string, any>): StageTelemetry {
    const current = this.stages.get(stageName) || this.startStage(stageName);
    const endTime = new Date();
    const startTime = new Date(current.start);
    const memory = process.memoryUsage();

    current.end = endTime.toISOString();
    current.durationMs = endTime.getTime() - startTime.getTime();
    current.status = 'success';
    current.artifacts = artifacts;
    current.memoryMb = {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
    };
    if (metadata) {
      current.metadata = { ...current.metadata, ...metadata };
    }

    this.history.push({ ...current });
    this.stages.delete(stageName);
    return current;
  }

  endStageError(stageName: string, error: unknown, metadata?: Record<string, any>): StageTelemetry {
    const current = this.stages.get(stageName) || this.startStage(stageName);
    const endTime = new Date();
    const startTime = new Date(current.start);
    const memory = process.memoryUsage();

    const errObj = error instanceof Error ? error : new Error(String(error));

    current.end = endTime.toISOString();
    current.durationMs = endTime.getTime() - startTime.getTime();
    current.status = 'failed';
    current.error = {
      category: (errObj as any).category || ErrorCategory.UNKNOWN,
      summary: errObj.message,
      message: errObj.message,
      stack: errObj.stack,
    };
    current.memoryMb = {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
    };
    if (metadata) {
      current.metadata = { ...current.metadata, ...metadata };
    }

    this.history.push({ ...current });
    this.stages.delete(stageName);
    return current;
  }

  getHistory(): StageTelemetry[] {
    return [...this.history];
  }
}
