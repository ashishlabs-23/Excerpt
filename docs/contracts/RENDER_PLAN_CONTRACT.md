# RENDER PLAN CONTRACT
# Excerpt — Canonical RenderPlan (Step 10)

> **Status**: COMPLETE
> The Canonical RenderPlan has been deployed. It forms the absolute, mathematically hashed bridge between the Planning tier and the Render tier.

## 1. Absolute Immutability Guard

Once a `RenderPlan` is enqueued into the `RenderQueue`, it is strictly immutable. 
If an attempt is made to enqueue a plan for the same `candidateId` but with a different `planHash` (indicating the plan was altered in-place), the queue explicitly rejects the operation and throws a `PipelineError.RenderPlanImmutable`. You cannot "update" an enqueued render job. You must version bump or create a new candidate branch.

## 2. Idempotent Caching

Video rendering is the most expensive operation in the pipeline.
The `RenderPlanHasher` generates a stable `sha256` hash of the entire plan JSON (excluding the hash field itself). 
If the `RenderQueue` receives a payload with a `planHash` that is already marked as `COMPLETED`, it instantly intercepts the request. Rather than spinning up a new rendering worker, it returns the cached S3 URLs of the previously rendered artifacts. 
- *Configurable*: This can be bypassed by passing `force = true` if a fresh render is explicitly required.

## 3. Strict Schema Validation

Before any hash is computed or any queue is touched, the `RenderPlanValidator` rigorously checks the shape of the plan.
- If a required field (e.g., `captionPlan` or `deliveryPolicy`) is missing, the validator throws `PipelineError.RenderPlanInvalid`, explicitly naming the missing field in the error message for instantaneous debugging.
- The validator enforces the `schemaVersion`. If the interface drifts without a manual version bump in the payload (e.g., `1.0.0` vs `1.1.0`), the enqueue is rejected.

## 4. Test Verification

4 explicit edge-cases have been verified across `@excerpt/clipping-core` and `@excerpt/video-worker`:
1. **Schema Rejection**: Successfully proved the validator throws an explicit error when `captionPlan` is deleted from the payload.
2. **Version Enforcement**: Successfully proved the validator throws an error if the `schemaVersion` is bumped improperly.
3. **Immutability Protection**: Successfully proved the `RenderQueue` throws an error if it detects a hash collision on a candidate ID.
4. **Idempotent Return**: Successfully proved the `RenderQueue` returns a cached S3 artifact rather than re-enqueueing a job if the `planHash` matches a `COMPLETED` record.
