import { PipelineError } from '../errors/PipelineError';

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface MediaValidationReport {
  valid: boolean;
  fatalErrors: PipelineError[];
  warnings: ValidationWarning[];
  metadata: Record<string, any>;
  streams: {
    video: any;
    audio?: any;
  };
  durationMs: number;
  resolution: {
    width: number;
    height: number;
  };
  codec: {
    video: string;
    audio?: string;
  };
  estimatedProcessingCostUsd: number;
}
