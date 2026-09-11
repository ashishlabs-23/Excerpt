# COORDINATOR CONTRACT
# Excerpt — Render Completion Coordinator (Step 10.5)

> **Status**: COMPLETE
> The completion orchestration engine has been successfully isolated in `@excerpt/video-worker`. It eliminates all polling and race conditions from the parent-child fan-in process using atomic locks and decrements.

## 1. Zero-Race Fan-In Coordination

We do not poll the database to check if `status === COMPLETED` for all children.
Instead, when a parent job is initialized, the `RenderCompletionCoordinator` reads `renderPlan.renderJobs.length` and explicitly sets an atomic counter (`remaining:{jobId}`).

When a child render job hits a terminal state (done/failed), it blindly executes a mathematical `DECR` on that key. **Exactly one** child job will pull that counter down to `0`. That exact thread is the only one authorized to trigger the parent completion sequence. This entirely eliminates the classic concurrent race condition where two completing jobs read the database simultaneously and both attempt to finalize the parent.

## 2. Idempotency Guard (SETNX)

Webhooks and message queues guarantee *at-least-once* delivery, which means a child job could theoretically report it finished twice. If it decremented the counter twice, it would corrupt the math and trigger the parent completion prematurely.

The coordinator uses an atomic `SETNX` (Set If Not Exists) lock on an `idempotencyKey` formatted as `processed:{renderJobId}:{status}`. The first webhook acquires the lock and proceeds to decrement. The duplicate webhook fails to acquire the lock and silently drops, protecting the counter.

## 3. Crash Recovery Sweeps

If the atomic counter hits `0`, but the worker process dies to an OOM crash literally a microsecond before executing the `onAllJobsCompleted` callback, the completion signal is lost.
The `reconcileSweep()` method is a periodic cron that guards against this exact failure mode. It safely checks actual database states against the remaining counter. If the math detects a hung completion state, it forces the completion sequence, making the fan-in process bulletproof.

## 4. Test Verification

3 explicit edge-cases in `coordinator.test.ts` continuously assert the locking mechanism:
1. **Concurrency**: Triggered 50 child job completions simultaneously (`Promise.all`). The atomic decrement accurately isolated the final call and triggered the completion callback exactly `1` time.
2. **Idempotency**: Fired the same completion webhook for `rjob-1` twice sequentially. Asserted the `SETNX` lock blocked the second invocation, protecting the counter from double-counting.
3. **Crash Resilience**: Simulated a scenario where 4 out of 5 jobs finished, but a webhook dropped. Triggered the `reconcileSweep` and proved it correctly deduced the desync and forced the parent completion check.
