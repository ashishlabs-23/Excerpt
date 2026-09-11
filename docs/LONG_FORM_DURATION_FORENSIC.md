# Long-Form Duration Forensic Trace: Root Cause Analysis of 15–22s Bias

## 1. Executive Summary

Prior to this intervention, the Excerpt clipping pipeline consistently produced clips strictly clustered around 15–22 seconds, even when users requested longer clips (e.g. 40–60s). This forensic document traces the complete duration lifecycle from HTTP ingestion to final render execution to isolate and document every stage where duration drift, artificial ceilings, or heuristic bias were introduced.

---

## 2. End-to-End Duration Lifecycle Trace

```text
[POST /generate-clips]
       ↓ (1. Route Layer)
[BullMQ: videoQueue]
       ↓ (2. Queue Layer)
[videoWorker.ts]
       ↓ (3. Worker Orchestration)
   ┌───┴────────────────────────────┐
   ↓                                ↓
[aiService.ts (LLM)]     [fallbackClipService.ts]
   └───┬────────────────────────────┘
       ↓ (4. Candidate Generation)
[EditorialPlan / Ranking / Pruning]
       ↓ (5. Scoring & Pruning)
[BoundaryPlanner.ts]
       ↓ (6. Boundary Resolution)
[RenderPlan / renderWorker.ts]
       ↓ (7. Media Execution)
[Decoded MP4 Output]
```

---

## 3. Forensic Root Cause Analysis by Layer

### Layer 1: HTTP API Route & Request Contract
- **File**: `apps/api/src/routes/video.ts`
- **Defect**: The route accepted `url` and optional legacy fields, but did not accept or validate `targetDuration`, `minDuration`, `maxDuration`, or `durationPolicy`.
- **Impact**: Any incoming duration requirement from clients or API consumers was discarded at the gateway, leaving downstream stages to rely entirely on internal defaults.

### Layer 2: Job Queue Payload Propagation
- **File**: `apps/api/src/services/queueService.ts`
- **Defect**: `queueService.addVideoJob` payload was strictly typed without duration parameters. Even when passed in tests or ad-hoc scripts, the duration parameters were not serialized into `jobRecord.payload`.
- **Impact**: The worker received jobs with undefined duration intent, causing it to fall back to hardcoded default targets.

### Layer 3: Fallback Candidate Windowing & Heuristic Penalty
- **File**: `apps/api/src/services/fallbackClipService.ts`
- **Defect**:
  1. Hardcoded window definitions: Candidates were generated with fixed windows of 15s, 20s, 25s, and 30s.
  2. `thinContentPenalty`: If candidate duration was $\ge 28\text{s}$ and total words were $< 55$ words, a severe penalty of `0.20` was deducted from the score:
     ```ts
     // Legacy flawed heuristic
     if (duration >= 28 && words.length < 55) {
       thinContentPenalty = 0.20;
     }
     ```
- **Impact**: Longer windows were systematically suppressed and pruned away because spoken dialog in dramatic or natural pauses often has fewer than 2 words per second. Even when 40–60s content existed, the fallback generator either never created a 40–60s window or heavily penalized it before ranking.

### Layer 4: LLM Prompting & Few-Shot Anchoring
- **File**: `apps/api/src/services/aiService.ts`
- **Defect**:
  1. The few-shot JSON example embedded in the system prompt demonstrated an output range of `12.4s` to `31.8s` (duration: **19.4s**).
  2. The prompt instructed the model to aggressively "tighten" boundaries to focus on the hook.
  3. No explicit duration policy bounds (`minSec`, `maxSec`, `targetSec`) were provided to the model.
- **Impact**: Large Language Models anchor heavily on concrete few-shot examples. The 19.4s example acted as a strong implicit target, training the model to suggest ~18–22s clips regardless of user intent.

### Layer 5: Worker Editorial Clamping (`22.0s` Ceiling)
- **File**: `apps/api/src/workers/videoWorker.ts`
- **Defect**: The worker contained an explicit hard ceiling when generating hook-adjusted variants:
  ```ts
  // Legacy hard-coded ceiling
  const editorialDuration = rawEnd - rawStart;
  const targetDuration = Math.min(editorialDuration, 22.0);
  ```
- **Impact**: Any semantic candidate of 40s, 50s, or 60s that survived the LLM was clamped down to a maximum target duration of `22.0s` before reaching the boundary planner.

### Layer 6: Boundary Planning Semantic Disconnect
- **File**: `packages/clipping-core/src/planning/BoundaryPlanner.ts`
- **Defect**:
  1. The boundary planner used an artificial narrow search window centered on `targetDur ± (margin * 1.5)` (around 6 seconds), excluding valid complete thoughts and payoffs situated elsewhere within the requested 40–60s range (e.g. at 57s).
  2. There was no canonical `ClipDurationPolicy` shared across the boundary planner and upstream stages.

---

## 4. Architectural Resolution

1. **Canonical Contract**:
   Created `ClipDurationPolicy`:
   ```ts
   export interface ClipDurationPolicy {
     targetSec?: number;
     minSec: number;
     maxSec: number;
     toleranceSec?: number;
     priority: 'hook' | 'story' | 'insight' | 'custom';
   }
   ```
2. **Unified Pipeline Propagation**:
   `POST /generate-clips` $\to$ `jobRecord.payload.durationPolicy` $\to$ `videoWorker.ts` $\to$ `BoundaryPlanner.ts` $\to$ `RenderPlan`.
3. **Removal of Hardcoded Ceilings**:
   Eliminated `Math.min(editorialDuration, 22.0)` and replaced with policy-driven bounds.
4. **Soft Duration Fit with Editorial Precedence**:
   Duration fit is strictly scored as a soft preference:
   $$\text{durationFit} = 1.0 - \min\left(1.0, \frac{|\text{actualDuration} - \text{targetDuration}|}{\text{targetDuration}}\right)$$
   Semantic thought completion, payoff resolution, and acoustic silence take absolute precedence over artificial duration matching.
