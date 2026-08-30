import { RenderQueue } from '../render/RenderQueue';
import { RenderPlan } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

describe('RenderQueue (Immutability & Idempotency)', () => {

  let queue: RenderQueue;
  let mockLogger: Logger;

  const validPlan: RenderPlan = {
    jobId: 'job-1',
    schemaVersion: '1.0.0',
    candidateId: 'cand-1',
    sourceArtifact: {} as any,
    duration: 10000,
    cameraPlan: {} as any,
    captionPlan: {} as any,
    audioPlan: {} as any,
    thumbnailPlan: {} as any,
    expectedArtifacts: {} as any,
    deliveryPolicy: {} as any,
    renderJobs: [],
    planHash: 'hash-A'
  };

  beforeEach(() => {
    mockLogger = new Logger('corr-1' as any);
    queue = new RenderQueue(mockLogger);
  });

  it('1. mutating an already-enqueued plan is rejected (Immutability Guard)', async () => {
    // Initial enqueue
    await queue.enqueue(validPlan);

    // Attempt to mutate it (same jobId/candidateId, but different hash)
    const mutatedPlan = { ...validPlan, planHash: 'hash-B' };

    try {
      await queue.enqueue(mutatedPlan);
      fail('Should have thrown RenderPlanImmutable');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineError);
      expect(e.code).toBe(PipelineErrorCode.RenderPlanImmutable);
      expect(e.message).toContain('Cannot mutate enqueued RenderPlan');
    }
  });

  it('2. resubmitting an identical planHash with existing valid artifacts reuses them instead of re-rendering', async () => {
    // Initial enqueue
    await queue.enqueue(validPlan);

    // Simulate worker completing it
    queue.simulateCompletion('job-1', 'cand-1', 's3://video.mp4');

    // Resubmit exact same plan
    const result = await queue.enqueue(validPlan);
    
    // Should NOT enqueue again, should return cached artifacts
    expect(result.enqueued).toBe(false);
    expect(result.artifacts?.videoUrl).toBe('s3://video.mp4');
  });

});
