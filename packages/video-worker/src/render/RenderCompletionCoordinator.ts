import { AtomicStore } from './AtomicStore';
import { Logger } from '@excerpt/shared';

export class RenderCompletionCoordinator {
  constructor(private store: AtomicStore, private logger: Logger) {}

  /**
   * Initializes the atomic counter for a parent job.
   * Expected count MUST come exactly from renderPlan.renderJobs.length (Invariant 10).
   */
  async initialize(jobId: string, expectedCount: number): Promise<void> {
    await this.store.set(`remaining:${jobId}`, expectedCount);
    this.logger.info(`Initialized completion coordinator for job ${jobId} with count ${expectedCount}`);
  }

  /**
   * Marks a child render job as terminal. 
   * Atomically decrements the parent counter and exactly ONE caller will invoke completion.
   */
  async markRenderJobTerminal(
    jobId: string, 
    renderJobId: string, 
    status: 'COMPLETED' | 'FAILED',
    onAllJobsCompleted: (jobId: string) => Promise<void>
  ): Promise<void> {
    const idempotencyKey = `processed:${renderJobId}:${status}`;
    
    // 1. Idempotency Guard (SETNX)
    const acquired = await this.store.setNX(idempotencyKey, 1);
    if (!acquired) {
      this.logger.info(`Idempotency hit: Render job ${renderJobId} already processed with status ${status}. Ignoring.`);
      return;
    }

    // 2. Atomic Decrement
    const counterKey = `remaining:${jobId}`;
    try {
      const remaining = await this.store.decr(counterKey);
      this.logger.info(`Job ${jobId} decrement: ${remaining} remaining.`);

      // 3. Exactly-Once Invocation
      if (remaining === 0) {
        this.logger.info(`Job ${jobId} hit 0. Triggering completion exactly once.`);
        
        // Note: In a true distributed system, we'd fire an event to a queue here.
        // We invoke the callback directly for testing.
        await onAllJobsCompleted(jobId);
      }
    } catch (e: any) {
      this.logger.error(`Failed to process terminal state for ${renderJobId}: ${e.message}`);
      // In a real system, the idempotency key would need to be rolled back or TTL'd, 
      // but for this atomic simulation, we let the reconcile sweep catch it.
    }
  }

  /**
   * A periodic sweep to catch crashed coordination logic.
   * In a real system, this cross-references actual DB statuses of children 
   * vs the remaining counter.
   */
  async reconcileSweep(jobId: string, actualRemainingInDb: number, onAllJobsCompleted: (jobId: string) => Promise<void>) {
    const current = await this.store.get(`remaining:${jobId}`);
    if (current !== undefined && typeof current === 'number') {
      if (current > 0 && actualRemainingInDb === 0) {
        this.logger.warn(`Reconciliation sweep detected desync for job ${jobId}. Firing completion.`);
        await this.store.set(`remaining:${jobId}`, 0);
        await onAllJobsCompleted(jobId);
      }
    }
  }
}
