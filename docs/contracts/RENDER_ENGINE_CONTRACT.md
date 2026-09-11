# RENDER ENGINE CONTRACT
# Excerpt — Production Render Engine (Step 11)

> **Status**: COMPLETE
> The Production Render Engine has been successfully isolated in `@excerpt/video-worker`. This layer is brutally defensive against I/O hangs, storage crashes, and idempotency leaks.

## 1. Architectural Purity (Invariant 3)

The `RenderWorker` does not make decisions. It does not rank. It does not select candidates. It does not update the parent `job.status`.
Its entire lifecycle is: 
1. Claim job.
2. Preflight disk.
3. Isolate temp dir.
4. Run FFmpeg with a hard timeout.
5. Notify the Step 10.5 `RenderCompletionCoordinator`.

## 2. Idempotent Job IDs

If a worker crashes immediately after an enqueue, `BullMQ` will retry the dispatch. If we used random UUIDs for render jobs, the worker would blindly render the identical 3GB clip twice.
We engineered deterministic Job IDs using the format:
`${jobId}:clip:${clipIndex}:${renderPlan.planHash.slice(0,8)}`.
The `RenderWorker` validates this ID against the active queue. Duplicate pushes instantly abort, preventing duplicate massive FFmpeg renders.

## 3. Storage Preflight Check

FFmpeg crashing a worker node because the disk filled up mid-render is unacceptable.
Before a single CPU cycle is spent on encoding, the `DiskManager` runs a `preflightCheck`. It multiplies the target duration by the target bitrate and applies a 1.5x safety multiplier. If the disk cannot hold the theoretical maximum output, it throws `PipelineError.InsufficientStorage` before spawning the child process.

## 4. Aggressive Resource Teardown

FFmpeg is spawned using `child_process`. We do not rely on JS `Promises` to abandon the await. We attach a hard `setTimeout`. If it trips, we explicitly fire `.kill('SIGKILL')` to the actual OS Process ID.
Temp directories are strictly isolated per-job and mathematically guaranteed to be deleted in a `finally` block, whether the render succeeds, throws a validation error, or suffers a hard SIGKILL timeout.

## 5. Test Verification

5 explicit edge-cases in `renderWorker.test.ts` continuously assert the engine:
1. **Idempotency**: Proved that pushing a duplicate job ID short-circuits the worker completely.
2. **Storage Preflight**: Mocked the disk space to 1 byte, requested a render, and asserted the system threw `InsufficientStorage` *before* FFmpeg was executed.
3. **Happy Path Cleanup**: Verified that the temporary directory is aggressively removed on success.
4. **Failure Path Cleanup**: Forced an explicit crash inside the FFmpeg process, and verified the `finally` block still completely purged the orphaned directory.
5. **Timeout Kill**: Created an infinitely hanging node script, wrapped it in our `executeWithTimeout`, and verified it successfully sent the SIGKILL to the OS process tree.
