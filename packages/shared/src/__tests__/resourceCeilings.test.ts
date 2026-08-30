import { assertWithinCeilings } from '../ceilings/resourceCeilings';
import { PipelineErrorCode } from '@excerpt/clipping-core';

describe('Resource Ceilings', () => {
  const config = {
    maxInputDurationMs: 14400000, // 4 hours
    maxInputSizeBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxConcurrentJobsPerTenant: 5,
    maxRenderJobsPerPipeline: 50
  };

  it('T3: oversized input rejected before download', () => {
    // Both under ceilings
    expect(() => assertWithinCeilings(config, {
      durationMs: 3600000,
      sizeBytes: 1024 * 1024
    })).not.toThrow();

    // Duration over ceiling
    expect(() => assertWithinCeilings(config, {
      durationMs: 14400001,
      sizeBytes: 1024 * 1024
    })).toThrowError(expect.objectContaining({ code: PipelineErrorCode.ResourceLimitExceeded }));

    // Size over ceiling
    expect(() => assertWithinCeilings(config, {
      durationMs: 3600000,
      sizeBytes: 5 * 1024 * 1024 * 1024 + 1
    })).toThrowError(expect.objectContaining({ code: PipelineErrorCode.ResourceLimitExceeded }));
  });
});
