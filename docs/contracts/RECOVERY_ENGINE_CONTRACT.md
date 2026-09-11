# RECOVERY ENGINE CONTRACT
# Excerpt — Pipeline Failure and Recovery Engine (Step 13)

> **Status**: COMPLETE
> The final error-handling tier. Implements true resumability (skipping redundant stage execution), Circuit Breakers for 3rd-party dependencies, and Dead-Letter alerting for exhausted pipelines.

## 1. True Resumability (Idempotent Restarts)

When a job fails during transcription and is retried, we do **not** re-download the 5GB source video.
The `StageDispatcher` wraps all pipeline phases. Before it invokes a phase, it introspects the `JobContext`. If a checksummed artifact for that specific stage already exists (e.g. `artifacts.ingestionPath`), it immediately skips execution and returns the cached path. This ties directly into the idempotency logic built in Step 1 and the deterministic hashes from Step 10.

## 2. Provider Circuit Breakers

A localized outage at Whisper or Groq must not cause a localized retry-storm that takes down the Excerpt worker nodes.
The `CircuitBreaker` class manages state for external providers (`CLOSED`, `OPEN`, `HALF_OPEN`).
- If an LLM provider breaches the `failureThreshold` inside the tracking window, the circuit trips to `OPEN`.
- Subsequent concurrent jobs attempting to call that provider instantly throw `PipelineError.CircuitOpen` without executing network requests.
- After a `cooldownMs` timer, the circuit shifts to `HALF_OPEN`. The next job tests the waters—if it succeeds, the circuit closes; if it fails, it instantly re-opens.

## 3. Failure Classification

Not all failures warrant a retry. `FailureClassification.ts` maps all 17 distinct failure domains to `isRetryable` and `isRecoverable` profiles.
- `AUTH` or `INGESTION` (Corrupt video) are `nonRetryable` and instantly fail the job permanently.
- `RATE_LIMIT` or `DATABASE` deadlocks are transient, `retryable`, and `recoverable`.

## 4. Dead-Letter Queue (DLQ) & Alerting

When a `retryable` job exhausts its maximum `retries` budget, it does not sit silently in the `failed` column.
The `DeadLetterAlerting` system forces its status to `dead_letter` and natively invokes an alert hook (simulated webhook/PagerDuty execution). This guarantees an engineer's eyes on jobs that couldn't automatically recover.

## 5. Test Verification

4 explicit edge-cases in `recovery.test.ts` continuously assert the engine:
1. **Resumability**: Verified that feeding a populated `JobContext` to the `StageDispatcher` natively bypasses `INGESTION` and `TRANSCRIPTION` and jumps cleanly to the missing `PERCEPTION` stage.
2. **Circuit Trip**: Flooded a simulated provider with errors. Verified the state machine tripped to `OPEN` and short-circuited the 4th request instantly.
3. **Circuit Recovery**: Tested the time-travel boundaries. Verified the circuit transitions to `HALF_OPEN` after cooldown, and cleanly recovers to `CLOSED` on a simulated successful test ping.
4. **DLQ Alert**: Exhausted the retry counter and asserted the status explicitly locked to `dead_letter`, triggering the mock webhook payload.
