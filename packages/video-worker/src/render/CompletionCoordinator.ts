import { Logger } from '@excerpt/shared';
import { VideoJobStatus } from '@excerpt/clipping-core';

export interface RedisClientLike {
  set(key: string, value: any, ...args: any[]): Promise<any>;
  get(key: string): Promise<string | null>;
  decr(key: string): Promise<number>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export class CompletionCoordinator {
  constructor(private redis: RedisClientLike, private logger: Logger) {}

  /**
   * Initializes the fan-in counter BEFORE any child jobs are enqueued.
   * Invariant 10: N must strictly equal renderPlan.renderJobs.length
   */
  async initializeCounter(jobId: string, expectedCount: number): Promise<void> {
    if (expectedCount <= 0) {
      throw new Error(`Cannot initialize coordinator for ${jobId} with count <= 0`);
    }
    const key = `remaining:${jobId}`;
    await this.redis.set(key, expectedCount);
    // Safety net: expire the key after 24 hours to prevent memory leaks if jobs hard-crash
    await this.redis.expire(key, 86400); 
    this.logger.info(`[Coordinator] Initialized fan-in for ${jobId} expecting ${expectedCount} jobs.`);
  }

  /**
   * Called by a child render worker when it reaches a terminal state (done or failed).
   * Executes an atomic DECR. Only the single invocation that decrements to exactly 0 
   * returns true, granting that worker the lock to finalize the parent job.
   */
  async decrementAndCheckCompletion(jobId: string, childId: string): Promise<boolean> {
    const key = `remaining:${jobId}`;
    
    // Atomic DECR prevents race conditions
    const remaining = await this.redis.decr(key);
    
    this.logger.info(`[Coordinator] Job ${jobId} decremented by child ${childId}. Remaining: ${remaining}`);

    if (remaining === 0) {
      // We are the final job to finish!
      // Cleanup the key
      await this.redis.del(key);
      return true; // Signal caller to trigger parent completion evaluation
    }

    if (remaining < 0) {
      this.logger.error(`[Coordinator] FATAL: Counter for ${jobId} went negative (${remaining})! This indicates a duplicate decrement bug.`);
      return false; // Do nothing, the parent was already triggered when it hit 0
    }

    // remaining > 0, other jobs still rendering
    return false;
  }

  /**
   * Fail-fast signaling. If a child fails and partial delivery isn't allowed,
   * it sets this key. Sibling workers must check it.
   */
  async signalFailFast(jobId: string): Promise<void> {
    await this.redis.set(`cancel:${jobId}`, '1', 'EX', 86400);
  }

  async checkFailFast(jobId: string): Promise<boolean> {
    const isCancelled = await this.redis.get(`cancel:${jobId}`);
    return isCancelled === '1';
  }
}
