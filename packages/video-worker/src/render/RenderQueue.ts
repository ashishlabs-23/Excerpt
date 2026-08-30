import { RenderPlan, RenderPlanValidator, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

// Simulated DB / Redis registry of plans
interface EnqueuedPlan {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  planHash: string;
  artifacts?: { videoUrl: string }; // Mock artifacts returned on completion
}

export class RenderQueue {
  private registry = new Map<string, EnqueuedPlan>();

  constructor(private logger: Logger) {}

  /**
   * Enqueues a RenderPlan securely, enforcing immutability and idempotency.
   */
  async enqueue(plan: RenderPlan, force: boolean = false): Promise<{ enqueued: boolean; artifacts?: { videoUrl: string } }> {
    // 1. Strict Schema Validation
    RenderPlanValidator.validate(plan);

    const registryKey = `${plan.jobId}_${plan.candidateId}`;
    const existing = this.registry.get(registryKey);

    if (existing) {
      // 2. Idempotent Re-Render
      if (existing.planHash === plan.planHash) {
        if (existing.status === 'COMPLETED' && !force) {
          this.logger.info(`Idempotent re-render skipped. Returning cached artifacts for hash: ${plan.planHash}`);
          return { enqueued: false, artifacts: existing.artifacts };
        }
      } else {
        // 3. Immutability Guard
        // A plan exists for this candidate, but the hash changed.
        // RenderPlans are IMMUTABLE. You cannot update them. You must create a new one.
        throw new PipelineError(
          PipelineErrorCode.RenderPlanImmutable,
          `Cannot mutate enqueued RenderPlan for candidate ${plan.candidateId}. Existing hash: ${existing.planHash}, New hash: ${plan.planHash}`
        );
      }
    }

    // 4. Enqueue
    this.registry.set(registryKey, {
      status: 'PENDING',
      planHash: plan.planHash
    });

    this.logger.info(`Enqueued RenderPlan for candidate ${plan.candidateId} with hash ${plan.planHash}`);
    return { enqueued: true };
  }

  // Backdoor for testing
  simulateCompletion(jobId: string, candidateId: string, videoUrl: string) {
    const key = `${jobId}_${candidateId}`;
    const existing = this.registry.get(key);
    if (existing) {
      existing.status = 'COMPLETED';
      existing.artifacts = { videoUrl };
    }
  }
}
