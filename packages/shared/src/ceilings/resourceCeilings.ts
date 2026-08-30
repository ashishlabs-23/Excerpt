import { PipelineError, PipelineErrorCode, ResourceCeilingConfig } from '@excerpt/clipping-core';

export function assertWithinCeilings(
  config: ResourceCeilingConfig,
  current: { durationMs?: number; sizeBytes?: number }
) {
  if (current.durationMs !== undefined && current.durationMs > config.maxInputDurationMs) {
    throw new PipelineError(
      PipelineErrorCode.ResourceLimitExceeded,
      `Input duration ${current.durationMs}ms exceeds ceiling ${config.maxInputDurationMs}ms`
    );
  }
  
  if (current.sizeBytes !== undefined && current.sizeBytes > config.maxInputSizeBytes) {
    throw new PipelineError(
      PipelineErrorCode.ResourceLimitExceeded,
      `Input size ${current.sizeBytes} bytes exceeds ceiling ${config.maxInputSizeBytes} bytes`
    );
  }
}
