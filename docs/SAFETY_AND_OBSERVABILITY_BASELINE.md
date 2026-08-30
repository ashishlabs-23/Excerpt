# SAFETY AND OBSERVABILITY BASELINE
# Excerpt — Cross-Cutting Step 0.5

> **Status**: COMPLETE
> All shared infrastructure components required for safe operation of the Excerpt pipeline have been implemented in `@excerpt/clipping-core` and `@excerpt/shared`.

## 1. Correlation ID

Every parent job is assigned a `CorrelationId`.
This is defined as a branded type in `clipping-core/src/types/correlation.ts` to prevent accidental string assignments:
```typescript
export type CorrelationId = string & { readonly __brand: unique symbol };
```

## 2. Structured Logging

Implemented in `packages/shared/src/logger/logger.ts`.
The `Logger` class requires a `CorrelationId` upon instantiation.

**Contract:**
```typescript
interface LogEntry {
  correlationId: CorrelationId;
  jobId?: string;
  stage?: string;
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  durationMs?: number;
  errorCode?: PipelineErrorCode;
  meta?: Record<string, unknown>;
  timestamp: string; // ISO 8601
}
```

## 3. SSRF / URL Safety Guard

Implemented in `packages/shared/src/ssrf/ssrfGuard.ts` and `fetchSafe.ts`.

- Rejects `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, and IPv6 equivalents.
- Enforces HTTP/HTTPS scheme.
- Validates DNS resolution *before* every HTTP fetch.
- `fetchSafe` actively validates the URL on every redirect hop to prevent DNS rebinding or post-redirect SSRF.

## 4. Resource Ceilings

Implemented in `packages/shared/src/ceilings/resourceCeilings.ts`.

Enforces boundaries on input duration and file size before heavy operations commence. Throws `PipelineError(RESOURCE_LIMIT_EXCEEDED)` if limits are breached.

## 5. Cost / Budget Tracking

Implemented in `packages/shared/src/cost/costLedger.ts`.

`createCostLedger(jobId, maxBudgetUsd)` returns a ledger manager that throws `PipelineError(BUDGET_EXCEEDED)` if new expenses exceed the predefined tenant budget, halting the pipeline safely.

## 6. Timeout-with-Kill

Implemented in `packages/shared/src/timeout/runWithTimeout.ts`.

Wraps any Promise with a strict timeout. If a `childProcess` is provided, the utility guarantees resource cleanup by invoking `tree-kill(pid, 'SIGTERM')` and escalating to `SIGKILL`. This permanently eliminates zombie FFmpeg and yt-dlp instances.

## 7. Next Steps

With the safety baseline fully implemented, the pipeline is ready for **Phase 1: Universal Media Ingestion and Normalization**.
