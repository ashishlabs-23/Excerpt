# CLIP_PIPELINE_CURRENT_STATE.md
# Excerpt — Clip-Generation Pipeline Architecture Audit
# Step 0 · Greenfield Baseline · **Rev 2**

> **Status**: GREENFIELD — No code exists as of 2026-08-11.
> This document IS the canonical architectural definition for the Excerpt
> clip-generation pipeline. Every invariant listed here is a hard contract
> that all future implementation must satisfy.
>
> **Rev 2** (2026-08-11): Incorporates architecture review — 7 new invariants,
> 7 new violation definitions, 5 new contracts, 5 new tests, 2 new status
> values, full fan-in coordination spec, resumability model, zero-candidate
> edge case, SIGKILL enforcement, idempotent child IDs, SSRF guard, and
> observability contract. See §22 for full revision history.

---

## Table of Contents

1. [Monorepo Layout](#1-monorepo-layout)
2. [Canonical Pipeline Graph (A)](#2-canonical-pipeline-graph-a)
3. [Worker Ownership (B)](#3-worker-ownership-b)
4. [State Machine (C)](#4-state-machine-c)
5. [Download Path (D)](#5-download-path-d)
6. [Transcription Path (E)](#6-transcription-path-e)
7. [Perception Path (F)](#7-perception-path-f)
8. [Candidate-Generation Path (G)](#8-candidate-generation-path-g)
9. [Ranking Path (H)](#9-ranking-path-h)
10. [RenderPlan Path (I)](#10-renderplan-path-i)
11. [Render Path (J)](#11-render-path-j)
12. [Delivery Validation Path (K)](#12-delivery-validation-path-k)
13. [Playback Validation Path (L)](#13-playback-validation-path-l)
14. [Persistence Path (M)](#14-persistence-path-m)
15. [Architectural Invariants (Reference)](#15-architectural-invariants-reference)
16. [Confirmed Architecture](#16-confirmed-architecture)
17. [Violations](#17-violations)
18. [Missing Contracts](#18-missing-contracts)
19. [Missing Tests](#19-missing-tests)
20. [Highest-Risk Failure Points](#20-highest-risk-failure-points)
21. [Recommended Implementation Order](#21-recommended-implementation-order)
22. [Revision History](#22-revision-history)

---

## 1. Monorepo Layout

```
excerpt/
├── packages/
│   ├── clipping-core/          # Pure deterministic logic (no I/O)
│   │   ├── src/
│   │   │   ├── RenderPlan.ts
│   │   │   ├── PipelineError.ts
│   │   │   ├── DeliveryValidator.ts
│   │   │   ├── PlaybackValidator.ts
│   │   │   ├── CandidateGenerator.ts
│   │   │   ├── ClipRanker.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared/                 # Cross-worker utilities (I/O-capable)
│       ├── src/
│       │   ├── killOnTimeout.ts    # C-18: enforced timeout wrapper
│       │   ├── logger.ts           # C-19: structured logger + correlation ID
│       │   └── metrics.ts          # C-19: per-stage latency/failure metrics
│       └── package.json
│
├── apps/
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── queues/         # BullMQ constants (C-14)
│       │   └── ssrfGuard.ts    # C-20: SSRF deny-list
│       └── package.json
│
├── workers/
│   ├── videoWorker/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── download.ts
│   │   │   ├── transcribe.ts
│   │   │   ├── perceive.ts
│   │   │   ├── plan.ts
│   │   │   └── stageDispatcher.ts  # C-21: resumeFrom check
│   │   └── package.json
│   │
│   └── renderWorker/
│       ├── src/
│       │   ├── index.ts
│       │   ├── render.ts
│       │   ├── upload.ts
│       │   └── completionCoordinator.ts  # C-17: atomic Redis DECR
│       └── package.json
│
├── docs/
│   └── CLIP_PIPELINE_CURRENT_STATE.md
│
└── package.json
```

---

## 2. Canonical Pipeline Graph (A)

```
[Client Request]
       │
       ▼
  ┌─────────┐
  │   API   │  Validates input, SSRF-guards inputUrl (C-20),
  │ Gateway │  checks file-size/duration ceiling (Inv-20),
  └────┬────┘  enqueues parent job, returns jobId
       │  BullMQ: video-jobs queue
       ▼
  ┌─────────────┐
  │ videoWorker │  OWNS parent job lifecycle
  │             │
  │  stageDispatcher ──► checks resumeFrom (Inv-17, C-21)
  │                          skips already-persisted stages
  │  1. Download  ──── D
  │  2. Transcribe ──── E
  │  3. Perceive   ──── F
  │  4. Generate   ──── G  zero candidates → failed:no_viable_clips (Inv-18)
  │  5. Rank       ──── H
  │  6. Plan       ──── I  deterministic child IDs (Inv-21)
  │                          zero rankedClips → failed:no_viable_clips
  │  → enqueues N child jobs (N = renderPlan.renderJobs.length, no fallback)
  └──────┬──────┘
         │  BullMQ: render-jobs queue  (N ≥ 1 always)
         ▼
  ┌──────────────┐
  │ renderWorker │  Renders ONE clip per invocation
  │              │
  │  7. Render   ──── J  (killOnTimeout — SIGKILL, Inv-22)
  │  8. Upload
  │  9. DeliveryValidator  ── K
  │ 10. PlaybackValidator  ── L
  │ 11. Persist result     ── M
  │              │
  │  NEVER mutates parent job.status (Inv-3)
  │  On done/failed: DECR remaining:{jobId} in Redis (C-17)
  │    if DECR → 0: trigger parent completion check (exactly once, Inv-16)
  └──────────────┘
         │  All N child jobs complete (fan-in via atomic counter)
         ▼
  videoWorker (triggered by completionCoordinator)
  → all succeeded   → failed:delivery_validation? → failed:playback_validation?
                    → completed (all artifacts usable, Inv-8)
  → any failed      → completed:partial (some clips rendered, Inv-3b)
                      or failed:render (zero clips rendered)
```

---

## 3. Worker Ownership (B)

| Concern | Owner | Notes |
|---|---|---|
| Parent job creation | `apps/api` | Writes initial DB record |
| SSRF guard | `apps/api → ssrfGuard.ts` | Inv-19; blocks before any HTTP fetch |
| File-size/duration ceiling | `apps/api` | Inv-20; checked before job is accepted |
| Parent job status mutation | `videoWorker` ONLY | Inv-2, 3 |
| Stage dispatcher / resumeFrom | `videoWorker → stageDispatcher` | Inv-17, C-21 |
| Child job creation (render jobs) | `videoWorker` | Deterministic IDs (Inv-21) |
| Child job execution | `renderWorker` | Reads from render-jobs queue |
| Child job status mutation | `renderWorker` ONLY for child | Never touches parent |
| Fan-in completion trigger | `renderWorker → completionCoordinator` | C-17; atomic DECR |
| Pure clipping logic | `@excerpt/clipping-core` | No I/O |
| RenderPlan construction | `videoWorker → clipping-core` | Inv-4 |
| Delivery validation | `clipping-core → DeliveryValidator` | Inv-5 |
| Playback validation | `clipping-core → PlaybackValidator` | Inv-6 |
| Error taxonomy | `clipping-core → PipelineError` | Inv-7 |
| Timeout execution wrapper | `packages/shared → killOnTimeout` | C-18, Inv-22 |
| Structured logging | `packages/shared → logger` | C-19 |
| Metrics | `packages/shared → metrics` | C-19 |
| Download | `videoWorker` | SSRF-safe; Inv-14 bypass for direct |
| Transcription | `videoWorker` | External AI call |
| Perception | `videoWorker` | External AI call |
| Candidate generation | `videoWorker → clipping-core` | Pure |
| Ranking | `videoWorker → clipping-core` | Pure |
| Artifact storage | `renderWorker` | Upload after render |

---

## 4. State Machine (C)

### Parent Job States

```
         [created]
             │
             ▼
        [downloading]
             │
      success│   failure
             │       └──► [failed:download]
             ▼
       [transcribing]
             │
      success│   failure
             │       └──► [failed:transcription]
             ▼
        [perceiving]
             │
      success│   failure
             │       └──► [failed:perception]
             ▼
     [generating_candidates]
             │
      success│   failure            zero candidates
             │       └──► [failed:candidate_generation]
             │       └──► [failed:no_viable_clips]   ◄── Inv-18
             ▼
         [ranking]
             │
      success│   failure            zero ranked
             │       └──► [failed:ranking]
             │       └──► [failed:no_viable_clips]   ◄── Inv-18 (second gate)
             ▼
         [planning]
             │
      success│   failure
             │       └──► [failed:planning]
             ▼
      [rendering]   ← N ≥ 1 child jobs dispatched
             │
    all OK   │   some fail (fail-fast)    all fail
             │       └──► [completed:partial]         └──► [failed:render]
             ▼
  [validating_delivery]
             │
      success│   failure
             │       └──► [failed:delivery_validation]
             ▼
  [validating_playback]
             │
      success│   failure
             │       └──► [failed:playback_validation]
             ▼
        [completed]  ← ALL artifacts verified usable (Inv-8)
```

### Partial Failure Semantics (Rev 2 — Issue 3)

| Scenario | Behavior | Terminal Status |
|---|---|---|
| All N render jobs succeed | Validate all → `completed` | `completed` |
| K of N succeed (K ≥ 1), fail-fast triggered | Siblings cancelled; keep K artifacts | `completed:partial` |
| 0 of N succeed | No artifacts | `failed:render` |

> [!IMPORTANT]
> **Fail-fast is the default.** When any render job fails, `completionCoordinator`
> signals sibling cancellation via a `cancel:{jobId}` Redis key. Render workers
> check this key at each processing checkpoint and abort cleanly if set.
>
> **`completed:partial` is a distinct terminal state.** A client polling
> `status === 'completed'` gets the full-delivery guarantee (Inv-8).
> A client polling `status === 'completed:partial'` receives only the
> successfully rendered clips — the contract is explicitly partial.

### State Mutation Rules

| Rule | Description |
|---|---|
| **R1** | Only `videoWorker` mutates parent `job.status` |
| **R2** | `renderWorker` MUST NOT touch parent `job.status` |
| **R3** | `completed` requires ALL artifacts verified usable |
| **R3b** | `completed:partial` requires ≥ 1 verified artifact; explicitly partial |
| **R4** | Download failure → `failed:download`; NEVER stuck (Inv-12) |
| **R5** | Each transition persisted atomically |
| **R6** | No state skipped unless stageDispatcher confirms artifact already exists |
| **R7** | No `|| 3` or numeric fallback for expected render count (Inv-11) |
| **R8** | Zero accepted candidates → `failed:no_viable_clips`; NEVER `completed` (Inv-18) |
| **R9** | Fan-in triggered by `DECR remaining:{jobId} == 0` only (Inv-16) |

### Child Job (renderWorker) States

```
[queued] → [rendering] → [uploading] → [validating] → [done]
                 │                              └──► [failed]
                 ▼
         checks cancel:{jobId}
         if set → [cancelled]
```

### Resumability (Rev 2 — Issue 2)

```
On any retry (automatic or user-triggered):

stageDispatcher checks, for each stage:
  if job.rawFilePath exists and is valid → skip download
  if job.transcriptPath exists           → skip transcription
  if job.perceptionPath exists           → skip perception
  (candidate generation is pure; always re-run)

This prevents re-billing AI calls for bugs in later stages.
Governed by C-21 (resumeFrom) and tested by T-22.
```

---

## 5. Download Path (D)

| Field | Value |
|---|---|
| **Owner** | `videoWorker` |
| **Input** | `job.data.inputUrl` (SSRF-guarded, C-20) or `job.data.directMediaPath` |
| **Pre-flight** | File-size ceiling checked before fetch begins (Inv-20) |
| **Output** | Local raw video path → `job.data.rawFilePath` |
| **DB Writes** | `job.status = downloading` → `rawFilePath` set → `job.status = transcribing` |
| **External Deps** | `yt-dlp` (YouTube), HTTP fetch (direct URLs), filesystem |
| **Timeout** | `killOnTimeout` wrapper (C-18); hard-bounded; SIGKILL on expiry (Inv-22) |
| **Retry Behavior** | Max 2 retries with exponential backoff; transient errors only |
| **Failure Behavior** | `PipelineError.DownloadFailed`; `job.status = failed:download`; never hangs (Inv-12) |
| **Canonical Error** | `PipelineError.DownloadFailed` |
| **Test Coverage** | **NONE** (greenfield) |

### Direct Media Bypass (Invariant 14)

```typescript
if (job.data.directMediaPath) {
  // Bypass ALL YouTube-specific extraction; no yt-dlp
  rawFilePath = job.data.directMediaPath;
} else {
  // SSRF guard runs here (C-20) — already checked by API but verified again
  assertSsrfSafe(job.data.inputUrl);
  rawFilePath = await killOnTimeout(
    ytDlpDownload(job.data.inputUrl),
    MAX_DOWNLOAD_MS,
    ytDlpProcess  // must be passed for SIGKILL (Inv-22)
  );
}
```

---

## 6. Transcription Path (E)

| Field | Value |
|---|---|
| **Owner** | `videoWorker` |
| **Input** | `rawFilePath` |
| **Skipped if** | `job.transcriptPath` already set (resumeFrom, Inv-17) |
| **Output** | `TranscriptResult` |
| **DB Writes** | `job.status = transcribing` → `transcriptPath` → `job.status = perceiving` |
| **External Deps** | Speech-to-text AI |
| **Timeout** | `killOnTimeout` (C-18) |
| **Retry Behavior** | 2 retries on 5xx |
| **Failure Behavior** | `PipelineError.TranscriptionFailed` → `failed:transcription` |
| **Canonical Error** | `PipelineError.TranscriptionFailed` |
| **Test Coverage** | **NONE** |

---

## 7. Perception Path (F)

| Field | Value |
|---|---|
| **Owner** | `videoWorker` |
| **Input** | `rawFilePath`, `TranscriptResult` |
| **Skipped if** | `job.perceptionPath` already set (resumeFrom, Inv-17) |
| **Output** | `PerceptionResult` |
| **DB Writes** | `job.status = perceiving` → `perceptionPath` → `job.status = generating_candidates` |
| **External Deps** | Vision/audio AI |
| **Timeout** | `killOnTimeout` (C-18) |
| **Failure Behavior** | `PipelineError.PerceptionFailed` → `failed:perception` |
| **Canonical Error** | `PipelineError.PerceptionFailed` |
| **Test Coverage** | **NONE** |

---

## 8. Candidate-Generation Path (G)

| Field | Value |
|---|---|
| **Owner** | `@excerpt/clipping-core → CandidateGenerator` |
| **Input** | `TranscriptResult`, `PerceptionResult`, `job.data.requestedClips` |
| **Output** | `CandidateClip[]` (may be empty) |
| **DB Writes** | NONE (pure) |
| **External Deps** | NONE |
| **Zero-candidate gate** | If `candidates.length === 0` → throw `PipelineError.NoViableClips` (Inv-18) |
| **Canonical Error** | `PipelineError.NoViableClips` \| `PipelineError.CandidateGenerationFailed` |
| **Test Coverage** | **NONE** |

### Invariant 9 & 18 — Requested ≠ Accepted; Zero = Hard Failure

```typescript
const accepted = candidates.filter(c => c.score >= ACCEPTANCE_THRESHOLD);

if (accepted.length === 0) {
  // NEVER mark completed with zero clips
  throw new PipelineError(PipelineErrorCode.NoViableClips,
    'No candidates met the acceptance threshold',
    { requestedClips: job.data.requestedClips, totalCandidates: candidates.length });
}
// accepted.length may still be < requestedClips — this is correct
```

---

## 9. Ranking Path (H)

| Field | Value |
|---|---|
| **Owner** | `@excerpt/clipping-core → ClipRanker` |
| **Input** | `CandidateClip[]`, `job.data.rankingCriteria` |
| **Output** | `RankedClip[]` (sorted, filtered) |
| **Zero-candidate gate** | If output is empty → `PipelineError.NoViableClips` (second gate, Inv-18) |
| **DB Writes** | NONE (pure) |
| **External Deps** | NONE |
| **Canonical Error** | `PipelineError.RankingFailed` \| `PipelineError.NoViableClips` |
| **Test Coverage** | **NONE** |

---

## 10. RenderPlan Path (I)

| Field | Value |
|---|---|
| **Owner** | `@excerpt/clipping-core → RenderPlan` |
| **Input** | `RankedClip[]` (always non-empty — Inv-18 gates above), `job.data.outputSpec` |
| **Output** | `RenderPlan` |
| **DB Writes** | `renderPlan` stored; `job.status = rendering`; N child jobs enqueued |
| **External Deps** | BullMQ queue |
| **Idempotency** | Child job IDs are deterministic (Inv-21); BullMQ rejects duplicates on retry |
| **Failure Behavior** | `PipelineError.PlanningFailed` → `failed:planning` |
| **Canonical Error** | `PipelineError.PlanningFailed` |
| **Test Coverage** | **NONE** |

### RenderPlan Contract (Invariant 4)

```typescript
interface RenderPlan {
  jobId: string;
  version: string;                  // semver; must be bumped on schema change
  renderJobs: RenderJob[];          // length = expected render count; always ≥ 1
  outputSpec: OutputSpec;
  rawFilePath: string;
  transcriptPath: string;
}

interface RenderJob {
  // Deterministic ID — safe to re-enqueue on videoWorker crash (Inv-21)
  id: string;                       // `${jobId}:clip:${clipIndex}`
  clipIndex: number;
  startMs: number;
  endMs: number;
  score: number;
  outputPath: string;               // tenant-scoped S3 path (§16 security)
}
```

### Invariants 10, 11, 21

```typescript
// Deterministic child job ID (Inv-21)
renderJob.id = `${parentJobId}:clip:${clipIndex}`;

// Correct expected count (Inv-10)
const expectedRenderJobs = renderPlan.renderJobs.length;

// Forbidden — magic fallback (Inv-11)
const expectedRenderJobs = renderPlan.renderJobs.length || 3; // ← VIOLATION
```

---

## 11. Render Path (J)

| Field | Value |
|---|---|
| **Owner** | `renderWorker` |
| **Input** | `RenderJob`, `rawFilePath`, `OutputSpec` |
| **Output** | Rendered clip at `RenderJob.outputPath` |
| **DB Writes** | Child job: `rendering` → `uploading` → `done` / `failed` |
| **External Deps** | FFmpeg, artifact storage |
| **Timeout** | `killOnTimeout` with explicit SIGKILL on FFmpeg process (C-18, Inv-22) |
| **Sibling cancellation** | Checks `cancel:{parentJobId}` Redis key at each checkpoint |
| **Retry Behavior** | 1 retry on transient FFmpeg failure |
| **Failure Behavior** | `PipelineError.RenderFailed`; child `failed`; `completionCoordinator` updates parent |
| **Canonical Error** | `PipelineError.RenderFailed` |
| **Test Coverage** | **NONE** |

### Invariant 3 — renderWorker MUST NOT Mutate Parent Job

```typescript
// FORBIDDEN in renderWorker
await db.jobs.update(parentJobId, { status: 'completed' }); // ← VIOLATION V-01

// CORRECT
await db.childJobs.update(childJobId, { status: 'done' });
await completionCoordinator.decrement(parentJobId, totalExpected);
// completionCoordinator handles parent transition if DECR → 0
```

### Fan-in Coordination (C-17 — Rev 2 Issue 1)

```typescript
// completionCoordinator.ts — Redis atomic decrement
async function decrement(parentJobId: string, total: number): Promise<void> {
  const remaining = await redis.decr(`remaining:${parentJobId}`);

  if (remaining === 0) {
    // Exactly ONE invocation reaches here, even with concurrent completions
    await triggerParentCompletion(parentJobId);
  } else if (remaining < 0) {
    // Should never happen — signals a bug (extra decrements)
    logger.error('remaining counter went negative', { parentJobId, remaining });
  }
  // remaining > 0: other jobs still in flight — do nothing
}

// On job creation (videoWorker, after enqueuing N render jobs):
await redis.set(`remaining:${parentJobId}`, N);
```

> [!IMPORTANT]
> `remaining:{jobId}` is initialised to **N** (= `renderPlan.renderJobs.length`) by
> `videoWorker` AFTER all N child jobs are successfully enqueued. The key must NOT
> be set before all jobs are in the queue, otherwise an early completion could
> decrement to 0 before all siblings exist.

---

## 12. Delivery Validation Path (K)

| Field | Value |
|---|---|
| **Owner** | `@excerpt/clipping-core → DeliveryValidator` (Inv-5) |
| **Input** | Rendered artifact path, `OutputSpec`, `RenderJob` |
| **Output** | `DeliveryValidationResult` |
| **DB Writes** | NONE (pure) |
| **External Deps** | Filesystem probe |
| **Canonical Error** | `PipelineError.DeliveryFailed` |
| **Test Coverage** | **NONE** |

```typescript
interface DeliveryValidationResult {
  valid: boolean;
  filePath: string;
  fileSizeBytes: number;
  checksumMd5: string;
  errors: PipelineError[];
}

class DeliveryValidator {
  static validate(filePath: string, spec: OutputSpec): DeliveryValidationResult;
}
```

---

## 13. Playback Validation Path (L)

| Field | Value |
|---|---|
| **Owner** | `@excerpt/clipping-core → PlaybackValidator` (Inv-6) |
| **Input** | `DeliveryValidationResult` (must be valid), artifact path |
| **Output** | `PlaybackValidationResult` |
| **DB Writes** | NONE (pure) |
| **External Deps** | `ffprobe` |
| **Timeout** | 30 s via `killOnTimeout` (C-18) |
| **Canonical Error** | `PipelineError.PlaybackValidationFailed` |
| **Test Coverage** | **NONE** |

```typescript
interface PlaybackValidationResult {
  playable: boolean;
  durationMs: number;
  codec: string;
  resolution: { width: number; height: number };
  errors: PipelineError[];
}

class PlaybackValidator {
  static validate(filePath: string, expectedSpec: OutputSpec): Promise<PlaybackValidationResult>;
}
```

---

## 14. Persistence Path (M)

| Field | Value |
|---|---|
| **Owner** | Each stage's owner (decentralised) |
| **Pattern** | Atomic DB write per state transition |
| **DB Technology** | PostgreSQL + Prisma |
| **Job Queue State** | Redis (BullMQ) |
| **Artifact Storage** | S3-compatible; paths are tenant-scoped (§16 security) |
| **Timeout** | All DB writes bounded via `killOnTimeout` (C-18, Inv-22) |
| **Retry Behavior** | 3 retries with backoff |
| **Failure Behavior** | `PipelineError.PersistenceFailed` |
| **Canonical Error** | `PipelineError.PersistenceFailed` |
| **Test Coverage** | **NONE** |

### Completed Job Must Have Usable Artifacts (Invariant 8)

```typescript
// videoWorker — triggered by completionCoordinator when remaining → 0
const childJobs = await db.childJobs.findMany({ where: { parentJobId } });
const failed = childJobs.filter(cj => cj.status === 'failed');
const succeeded = childJobs.filter(
  cj => cj.deliveryValidation.valid && cj.playbackValidation.playable
);

if (succeeded.length === 0) {
  await db.jobs.update(parentJobId, { status: 'failed:render' });
} else if (failed.length > 0) {
  await db.jobs.update(parentJobId, { status: 'completed:partial',
    artifacts: succeeded.map(cj => cj.artifact) });
} else {
  // All verified usable
  await db.jobs.update(parentJobId, { status: 'completed',
    artifacts: succeeded.map(cj => cj.artifact) });
}
```

---

## 15. Architectural Invariants (Reference)

### Original Invariants (Rev 1)

| # | Invariant | Owner | Risk if violated |
|---|---|---|---|
| 1 | `clipping-core` owns pure deterministic logic only | `packages/clipping-core` | Business logic polluted by I/O; untestable |
| 2 | `videoWorker` is sole owner of parent jobs | `workers/videoWorker` | Race conditions on job status |
| 3 | `renderWorker` MUST NEVER mutate parent `job.status` | `workers/renderWorker` | Corrupted job state |
| 4 | `RenderPlan` is canonical contract between planning and rendering | `packages/clipping-core` | Breaking changes go undetected |
| 5 | `DeliveryValidator` owns delivery validation | `packages/clipping-core` | Inconsistent delivery checks |
| 6 | `PlaybackValidator` owns playback validation | `packages/clipping-core` | Silently unplayable artifacts |
| 7 | `PipelineError` is canonical error taxonomy | `packages/clipping-core` | Inconsistent error handling |
| 8 | Completed job must have usable artifacts | `videoWorker` | Job marked complete with broken clips |
| 9 | `requestedClips != acceptedClips` | `clipping-core` | Padding with low-quality clips |
| 10 | `expectedRenderJobs = RenderPlan.renderJobs.length` | `videoWorker` | Wrong completion count |
| 11 | No magic fallback (`\|\| 3`) for completion count | `videoWorker` | Silent skip or infinite processing |
| 12 | Download failure must never become infinite `processing` state | `videoWorker` | Job stuck forever |
| 13 | Every external operation must have bounded execution | All workers | Zombie jobs, resource exhaustion |
| 14 | Direct media inputs must bypass YouTube-specific extraction | `videoWorker` | Incorrect processing |
| 15 | Frontend is NOT part of this phase | N/A | Scope creep |

### Rev 2 Invariants

| # | Invariant | Owner | Risk if violated |
|---|---|---|---|
| 16 | Fan-in triggered ONLY by `DECR remaining:{jobId} === 0` | `renderWorker → completionCoordinator` | Dual parent completion or missed completion |
| 17 | Stage dispatcher checks existing artifact before invoking each stage | `videoWorker → stageDispatcher` | Re-billing AI for already-completed stages on retry |
| 18 | Zero accepted candidates → `failed:no_viable_clips`; NEVER `completed` | `clipping-core` / `videoWorker` | Silent delivery of zero clips to user |
| 19 | `inputUrl` must pass SSRF guard before any HTTP fetch | `apps/api` | Internal network access via crafted URL |
| 20 | File-size and duration ceiling checked before download begins | `apps/api` | Resource exhaustion via oversized input |
| 21 | Child job IDs are deterministic: `${parentJobId}:clip:${clipIndex}` | `videoWorker` | Double-rendering on videoWorker crash + retry |
| 22 | Every timeout MUST `SIGKILL` the child process, not just reject the Promise | `packages/shared → killOnTimeout` | Zombie FFmpeg/yt-dlp processes consuming CPU/memory |

---

## 16. Confirmed Architecture

### Stack

| Layer | Technology |
|---|---|
| Monorepo | npm/pnpm workspaces |
| Language | TypeScript (strict mode) |
| Job Queue | BullMQ (Redis-backed) |
| Fan-in coordination | Redis atomic `DECR` (not BullMQ FlowProducer) |
| Database | PostgreSQL + Prisma ORM |
| Artifact Storage | S3-compatible; tenant-scoped paths |
| Video Processing | FFmpeg (via `killOnTimeout` wrapper) |
| Media Probing | `ffprobe` (via `killOnTimeout` wrapper) |
| Download | `yt-dlp` (YouTube), direct HTTP (non-YT), SSRF-guarded |
| Logging | Structured JSON; correlation ID per job (C-19) |
| Metrics | Per-stage latency + failure rate (C-19) |

### Package Graph

```
@excerpt/clipping-core     ← no I/O deps
       ↑
@excerpt/shared            ← killOnTimeout, logger, metrics (I/O-capable)
       ↑
  apps/api                 ← depends on clipping-core, shared
       ↑
  videoWorker              ← depends on clipping-core, shared
       ↑
  renderWorker             ← depends on clipping-core, shared
```

### Queue Topology

```
Redis
  ├── bull:video-jobs         (videoWorker consumes)
  ├── bull:render-jobs        (renderWorker consumes)
  └── remaining:{jobId}       (atomic DECR counter per parent job)
  └── cancel:{jobId}          (fail-fast signal; sibling cancellation)
```

### BullMQ Configuration Requirements

```typescript
// Both workers MUST configure these to prevent zombie jobs
const workerOptions = {
  lockDuration: 30_000,       // ms; must be > killOnTimeout ceiling
  stalledInterval: 15_000,    // ms; reclaim stalled jobs
  maxStalledCount: 2,         // retry limit for stalled jobs
};
```

### VideoJob Schema (Rev 2)

```typescript
interface VideoJob {
  id: string;
  userId: string;             // Rev 2 — tenant identity (§16 security)
  tenantId: string;           // Rev 2 — tenant scoping
  correlationId: string;      // Rev 2 — threaded through all log events (C-19)
  status: VideoJobStatus;
  inputUrl?: string;          // SSRF-guarded (Inv-19)
  directMediaPath?: string;
  requestedClips: number;
  rankingCriteria: RankingCriteria;
  outputSpec: OutputSpec;
  // Resumable stage artifacts (C-21, Inv-17)
  resumeFrom?: VideoJobStatus;
  rawFilePath?: string;
  transcriptPath?: string;
  perceptionPath?: string;
  renderPlan?: RenderPlan;
  childJobIds: string[];
  artifacts: ArtifactRecord[];
  error?: PipelineError;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

type VideoJobStatus =
  | 'created'
  | 'downloading'
  | 'transcribing'
  | 'perceiving'
  | 'generating_candidates'
  | 'ranking'
  | 'planning'
  | 'rendering'
  | 'validating_delivery'
  | 'validating_playback'
  | 'completed'
  | 'completed:partial'           // Rev 2 — some clips rendered
  | 'failed:download'
  | 'failed:transcription'
  | 'failed:perception'
  | 'failed:candidate_generation'
  | 'failed:no_viable_clips'      // Rev 2 — zero clips passed threshold
  | 'failed:ranking'
  | 'failed:planning'
  | 'failed:render'
  | 'failed:delivery_validation'
  | 'failed:playback_validation'
  | 'failed:artifact_unusable'
  | 'failed:persistence';
```

### Security — S3 Path Scoping

```
s3://{bucket}/{tenantId}/{userId}/{jobId}/{clipIndex}.mp4
```
Paths are not guessable across tenants. Presigned URLs expire in ≤ 1 hour.

### Security — Input Ceilings (Inv-20)

| Limit | Value (configurable) | Enforced by |
|---|---|---|
| Max `inputUrl` content-length | 5 GB | `apps/api` before job creation |
| Max declared duration | 4 hours | `apps/api` before job creation |
| SSRF deny-list | RFC 1918, link-local, loopback | `apps/api → ssrfGuard.ts` |

---

## 17. Violations

> **Current status**: GREENFIELD — no code violations yet.
> Patterns below MUST NOT appear in any implementation.

### Rev 1 Violations

| ID | Violation Pattern | Invariant | Severity |
|---|---|---|---|
| V-01 | `renderWorker` writing to parent `job.status` | Inv-3 | CRITICAL |
| V-02 | `\|\| 3` or numeric literal fallback for render job count | Inv-11 | CRITICAL |
| V-03 | `clipping-core` importing from `apps/api` or `workers/*` | Inv-1 | HIGH |
| V-04 | Download failure → job stays in `processing`/`downloading` permanently | Inv-12 | CRITICAL |
| V-05 | Direct media path routed through `yt-dlp` extraction | Inv-14 | HIGH |
| V-06 | External call without a timeout | Inv-13 | HIGH |
| V-07 | `job.status = completed` without checking artifact usability | Inv-8 | CRITICAL |
| V-08 | `requestedClips` used directly as `acceptedClips` count | Inv-9 | HIGH |
| V-09 | `expectedRenderJobs` computed from anything except `renderPlan.renderJobs.length` | Inv-10 | CRITICAL |
| V-10 | `PipelineError` subclass defined outside `packages/clipping-core` | Inv-7 | MEDIUM |
| V-11 | `DeliveryValidator` logic duplicated outside `packages/clipping-core` | Inv-5 | MEDIUM |
| V-12 | `PlaybackValidator` logic duplicated outside `packages/clipping-core` | Inv-6 | MEDIUM |
| V-13 | `RenderPlan` schema changed without bumping `version` field | Inv-4 | HIGH |
| V-14 | Frontend code added during Steps 0–N of backend hardening | Inv-15 | LOW |

### Rev 2 Violations

| ID | Violation Pattern | Invariant | Severity |
|---|---|---|---|
| V-15 | Fan-in via polling (`WHERE status=done COUNT(*)`) instead of atomic `DECR` | Inv-16 | CRITICAL |
| V-16 | `Promise.race` timeout that does NOT call `child_process.kill(pid, 'SIGKILL')` | Inv-22 | HIGH |
| V-17 | Non-deterministic child job IDs (e.g., `uuid()`) | Inv-21 | HIGH |
| V-18 | Zero accepted candidates → job marked `completed` or `failed:candidate_generation` | Inv-18 | CRITICAL |
| V-19 | HTTP fetch of `inputUrl` without SSRF guard | Inv-19 | CRITICAL |
| V-20 | Retry re-runs stages that already have persisted artifacts | Inv-17 | HIGH |
| V-21 | Download begins without checking file-size/duration ceiling | Inv-20 | HIGH |

---

## 18. Missing Contracts

### Rev 1 Contracts

| ID | Contract | Owner Package | Priority |
|---|---|---|---|
| C-01 | `RenderPlan` + `RenderJob` TypeScript interface | `clipping-core` | P0 |
| C-02 | `PipelineError` class + `PipelineErrorCode` enum | `clipping-core` | P0 |
| C-03 | `DeliveryValidationResult` interface | `clipping-core` | P0 |
| C-04 | `PlaybackValidationResult` interface | `clipping-core` | P0 |
| C-05 | `VideoJobStatus` union type | `clipping-core` | P0 |
| C-06 | `VideoJob` schema (DB model + runtime type) | `apps/api` | P0 |
| C-07 | `TranscriptResult` interface | `clipping-core` | P0 |
| C-08 | `PerceptionResult` interface | `clipping-core` | P0 |
| C-09 | `CandidateClip` interface | `clipping-core` | P0 |
| C-10 | `RankedClip` interface | `clipping-core` | P0 |
| C-11 | `OutputSpec` interface | `clipping-core` | P0 |
| C-12 | `RankingCriteria` interface | `clipping-core` | P0 |
| C-13 | `ArtifactRecord` interface | `clipping-core` | P1 |
| C-14 | BullMQ queue name constants (no string literals) | `apps/api` | P1 |
| C-15 | Worker concurrency config schema | `workers/*` | P1 |
| C-16 | Timeout constants (per operation type) | `clipping-core` | P0 |

### Rev 2 Contracts

| ID | Contract | Owner Package | Priority | Notes |
|---|---|---|---|---|
| C-17 | `RenderCompletionCoordinator` — atomic Redis `DECR` + parent trigger | `renderWorker` | P0 | See §11 |
| C-18 | `killOnTimeout<T>(promise, ms, childProcess)` — enforced SIGKILL wrapper | `packages/shared` | P0 | See Inv-22 |
| C-19 | Structured logger + `correlationId` threading + per-stage metrics | `packages/shared` | P0 | Required from day 1 |
| C-20 | SSRF guard — deny-list checked before any outbound HTTP | `apps/api` | P0 | RFC 1918, link-local, loopback |
| C-21 | `resumeFrom` field in `VideoJob` + `stageDispatcher` skip logic | `videoWorker` | P1 | See §4 Resumability |

---

## 19. Missing Tests

### Rev 1 Tests

| ID | Test | Target | Priority |
|---|---|---|---|
| T-01 | `CandidateGenerator` — all selection edge cases | `clipping-core` | P0 |
| T-02 | `ClipRanker` — ranking stability, threshold behavior | `clipping-core` | P0 |
| T-03 | `RenderPlan` — schema validation, version bump detection | `clipping-core` | P0 |
| T-04 | `PipelineError` — error code coverage, serialization | `clipping-core` | P0 |
| T-05 | `DeliveryValidator` — valid, missing, zero-byte file | `clipping-core` | P0 |
| T-06 | `PlaybackValidator` — valid, corrupt, wrong codec | `clipping-core` | P0 |
| T-07 | `videoWorker` — state machine transitions (happy path) | `videoWorker` | P0 |
| T-08 | `videoWorker` — download failure → `failed:download` (not stuck) | `videoWorker` | P0 |
| T-09 | `videoWorker` — direct media bypass (yt-dlp NOT called) | `videoWorker` | P0 |
| T-10 | `videoWorker` — `expectedRenderJobs = renderPlan.renderJobs.length` | `videoWorker` | P0 |
| T-11 | `videoWorker` — `requestedClips > acceptedClips` does not error | `videoWorker` | P1 |
| T-12 | `videoWorker` — parent NOT completed if any artifact unusable | `videoWorker` | P0 |
| T-13 | `renderWorker` — does NOT mutate parent job status | `renderWorker` | P0 |
| T-14 | `renderWorker` — timeout enforced on FFmpeg call | `renderWorker` | P0 |
| T-15 | Integration: full happy path (mock AI services) | `workers/*` | P1 |
| T-16 | Integration: partial render failure → parent `failed:render` | `workers/*` | P1 |
| T-17 | Timeout: all external calls abort within defined bounds | All | P0 |

### Rev 2 Tests

| ID | Test | Target | Priority | Notes |
|---|---|---|---|---|
| T-18 | Concurrent child completions trigger exactly ONE parent transition | `completionCoordinator` | P0 | Simulate N concurrent `DECR` calls; assert parent updated once |
| T-19 | Duplicate child job IDs rejected — BullMQ idempotent re-enqueue | `videoWorker` | P0 | Simulate videoWorker crash + retry |
| T-20 | Zero accepted candidates → `failed:no_viable_clips` (not `completed`) | `videoWorker` + `clipping-core` | P0 | Both gates tested |
| T-21 | SSRF attempt (`http://169.254.169.254/`) → blocked before HTTP fetch | `apps/api` | P0 | Also test RFC 1918 ranges |
| T-22 | Retry after perception failure → download + transcription skipped | `videoWorker → stageDispatcher` | P1 | Verify AI not re-called for persisted stages |

---

## 20. Highest-Risk Failure Points

| Rank | Risk | Stage | Consequence | Mitigation |
|---|---|---|---|---|
| 🔴 1 | Download failure leaves job in `processing` forever | Download | Zombie jobs; resource exhaustion | Inv-12; killOnTimeout; T-08 |
| 🔴 2 | Fan-in race — two render completions both see "not done" or both trigger parent | Render (fan-in) | Missed completion OR dual transition | Inv-16; C-17; atomic DECR; T-18 |
| 🔴 3 | `renderWorker` accidentally mutates parent `job.status` | Render | Corrupted completion state | Inv-3; lint rule; T-13 |
| 🔴 4 | `completed` set without verifying artifact usability | Persistence | Broken clips delivered silently | Inv-8; T-12 |
| 🔴 5 | Zero candidates → vacuous `completed` | Candidate gen | Zero clips delivered, status = completed | Inv-18; T-20 |
| 🟠 6 | Magic `\|\| 3` fallback for render job count | Planning | Silent skip or premature completion | Inv-11; T-10 |
| 🟠 7 | `Promise.race` timeout without SIGKILL | All | Zombie FFmpeg/yt-dlp processes | Inv-22; C-18; T-17 |
| 🟠 8 | SSRF via crafted `inputUrl` | Download | Internal network access | Inv-19; C-20; T-21 |
| 🟠 9 | Direct media routed through yt-dlp | Download | Extraction errors | Inv-14; T-09 |
| 🟠 10 | Non-deterministic child IDs → double-render on crash | Planning | Duplicate output files, incorrect count | Inv-21; T-19 |
| 🟡 11 | Retry re-bills AI transcription/perception | Transcription, Perception | Cost explosion | Inv-17; C-21; T-22 |
| 🟡 12 | `RenderPlan` schema changed without version bump | Planning | Incompatible plan at renderWorker | C-01 version; T-03 |

---

## 21. Recommended Implementation Order

```
PHASE 1 — Foundation  (packages/clipping-core + packages/shared)
═════════════════════════════════════════════════════════════════
Step 1.1  Define all P0 contracts (C-01 through C-12, C-16)
          Add: PipelineErrorCode.NoViableClips
          Tests: T-03, T-04

Step 1.2  Implement killOnTimeout<T>() with SIGKILL enforcement (C-18)
          Tests: T-17
          NOTE: This is the most cross-cutting utility — all workers depend on it.

Step 1.3  Implement structured logger + correlationId (C-19)
          Tests: verify correlationId threads through mock stages

Step 1.4  Implement PipelineError taxonomy
          Tests: T-04

Step 1.5  Implement DeliveryValidator
          Tests: T-05

Step 1.6  Implement PlaybackValidator
          Tests: T-06

Step 1.7  Implement CandidateGenerator (with zero-candidate gate, Inv-18)
          Tests: T-01, T-20 (zero-candidate branch)

Step 1.8  Implement ClipRanker (with zero-candidate gate)
          Tests: T-02

Step 1.9  Implement RenderPlan builder (deterministic IDs, Inv-21)
          Tests: T-03, T-19

PHASE 2 — API Gateway  (apps/api)
══════════════════════════════════
Step 2.1  Implement SSRF guard (C-20)
          Tests: T-21

Step 2.2  Input ceiling validation (Inv-20) + VideoJob schema (C-06)
          Add: userId, tenantId, correlationId, resumeFrom fields

Step 2.3  BullMQ queue constants (C-14)

Step 2.4  Job creation endpoint + job status query endpoint

PHASE 3 — videoWorker
══════════════════════
Step 3.1  stageDispatcher with resumeFrom logic (C-21, Inv-17)
          Tests: T-22

Step 3.2  State machine scaffolding
          Tests: T-07

Step 3.3  Download stage (direct-media bypass + killOnTimeout)
          Tests: T-08, T-09, T-17

Step 3.4  Transcription + Perception stages
          Tests: T-17

Step 3.5  Candidate generation + ranking (zero-candidate gates)
          Tests: T-11, T-20

Step 3.6  RenderPlan creation + deterministic child job dispatch
          Set remaining:{jobId} AFTER all child jobs enqueued (Inv-16)
          Tests: T-10, T-12, T-19

PHASE 4 — renderWorker
═══════════════════════
Step 4.1  Render stage (killOnTimeout + SIGKILL, Inv-22)
          Check cancel:{jobId} at each checkpoint (fail-fast)
          Tests: T-13, T-14

Step 4.2  Artifact upload (tenant-scoped S3 path)

Step 4.3  DeliveryValidator + PlaybackValidator integration

Step 4.4  completionCoordinator — atomic DECR (C-17)
          Tests: T-18

PHASE 5 — Integration & Hardening
══════════════════════════════════
Step 5.1  Integration: full happy path               (T-15)
Step 5.2  Integration: partial render failure         (T-16)
Step 5.3  Chaos / timeout + SIGKILL verification      (T-17)
Step 5.4  Concurrency limits + BullMQ stalledInterval (C-15)
Step 5.5  Load test & resource ceiling validation

PHASE 6 — (Future) Temporal migration
PHASE 7 — (Future) Additional AI models
PHASE 8 — (Future) Frontend integration
```

---

## 22. Revision History

### Rev 1 — 2026-08-11 (Initial)
- Initial greenfield baseline from Step 0 audit
- 15 invariants, 14 violations, 16 contracts, 17 tests

### Rev 2 — 2026-08-11 (Architecture Review)
Incorporated 8 gaps from architecture review:

| Issue | Change | Sections affected |
|---|---|---|
| 1. Fan-in hand-waved | Added `RenderCompletionCoordinator` (C-17), atomic Redis DECR, Inv-16, T-18 | §2, §4, §11, §16, §18, §19, §20 |
| 2. No resumability | Added `resumeFrom`, `stageDispatcher`, Inv-17, C-21, T-22 | §2, §3, §4, §5–§7, §16, §18, §19 |
| 3. Partial failure undefined | Added `completed:partial`, fail-fast + sibling cancellation, `cancel:{jobId}` | §2, §4, §11, §14, §16 |
| 4. Timeout not enforced | Added `killOnTimeout<T>()` (C-18, Inv-22), `packages/shared` package, V-16 | §2, §3, §5–§13, §15, §16, §17 |
| 5. No child job dedupe | Added deterministic ID `${jobId}:clip:${clipIndex}` (Inv-21, V-17, T-19) | §2, §10, §15, §17, §19 |
| 6. Security gaps | Added SSRF guard (Inv-19, C-20, V-19, T-21), file-size ceiling (Inv-20, V-21), `userId`/`tenantId`/`correlationId` on `VideoJob` | §2, §3, §5, §15, §16, §17, §18, §19 |
| 7. Zero-candidate undefined | Added `failed:no_viable_clips` status, Inv-18, V-18, T-20, second gate in ranking | §4, §8, §9, §10, §15, §16, §17, §19 |
| 8. Observability absent | Added C-19 (structured log + correlationId + metrics), `packages/shared` logger | §2, §3, §15, §16, §18 |

---

*End of CLIP_PIPELINE_CURRENT_STATE.md — Step 0 Audit · Rev 2*
*Status: COMPLETE. Ready for Phase 1 implementation.*
