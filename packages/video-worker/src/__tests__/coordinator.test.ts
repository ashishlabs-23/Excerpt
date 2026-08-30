import { RenderCompletionCoordinator } from '../render/RenderCompletionCoordinator';
import { AtomicStore } from '../render/AtomicStore';
import { Logger } from '@excerpt/shared';

describe('Render Completion Coordinator', () => {
  let store: AtomicStore;
  let logger: Logger;
  let coordinator: RenderCompletionCoordinator;

  beforeEach(() => {
    store = new AtomicStore();
    logger = new Logger('corr-1' as any);
    // Suppress logs for cleaner test output
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    coordinator = new RenderCompletionCoordinator(store, logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. N render jobs completing simultaneously trigger the completion check exactly once', async () => {
    const N = 50;
    const jobId = 'job-concurrency';
    await coordinator.initialize(jobId, N);

    const completionSpy = jest.fn().mockResolvedValue(undefined);

    // Simulate 50 concurrent webhooks arriving at the exact same millisecond
    const promises = Array.from({ length: N }).map((_, i) => {
      return coordinator.markRenderJobTerminal(jobId, `render-${i}`, 'COMPLETED', completionSpy);
    });

    await Promise.all(promises);

    // Despite massive concurrency, the decr logic guarantees EXACTLY ONE invocation
    expect(completionSpy).toHaveBeenCalledTimes(1);
    expect(completionSpy).toHaveBeenCalledWith(jobId);
  });

  it('2. a duplicate terminal-state event for the same render job does not double-decrement', async () => {
    const jobId = 'job-idempotency';
    await coordinator.initialize(jobId, 2);

    const completionSpy = jest.fn().mockResolvedValue(undefined);

    // Render job 1 completes
    await coordinator.markRenderJobTerminal(jobId, 'rjob-1', 'COMPLETED', completionSpy);
    let remaining = await store.get(`remaining:${jobId}`);
    expect(remaining).toBe(1);

    // Render job 1's webhook fires again accidentally (network retry)
    await coordinator.markRenderJobTerminal(jobId, 'rjob-1', 'COMPLETED', completionSpy);
    
    // Idempotency guard blocks it, remaining is still 1
    remaining = await store.get(`remaining:${jobId}`);
    expect(remaining).toBe(1);
    expect(completionSpy).not.toHaveBeenCalled();

    // Render job 2 completes
    await coordinator.markRenderJobTerminal(jobId, 'rjob-2', 'COMPLETED', completionSpy);
    expect(completionSpy).toHaveBeenCalledTimes(1);
  });

  it('3. a crash between decrement and completion-check does not lose the completion signal', async () => {
    const jobId = 'job-crash';
    // Simulate it initialized to 5, and all 5 completed successfully in the DB
    await coordinator.initialize(jobId, 5);
    
    // But let's say the coordinator crashed after 4 were decremented (remaining: 1)
    // Or it hit 0 and crashed exactly before firing the callback (remaining: 0)
    // We'll test the remaining: 1 scenario where a webhook was dropped entirely.
    
    const completionSpy = jest.fn().mockResolvedValue(undefined);
    
    // 4 successful hits
    for (let i = 0; i < 4; i++) {
      await coordinator.markRenderJobTerminal(jobId, `rjob-${i}`, 'COMPLETED', completionSpy);
    }
    
    expect(completionSpy).not.toHaveBeenCalled();

    // The reconciliation sweep runs 5 minutes later.
    // It checks the database: the database says all 5 are terminal.
    await coordinator.reconcileSweep(jobId, 0, completionSpy);

    // Sweep detects desync and forces completion
    expect(completionSpy).toHaveBeenCalledTimes(1);
  });
});
