# Forensic Trace: `generationMode` End-to-End Audit

## Executive Summary
This document provides the exact end-to-end trace of `generationMode` across the entire Excerpt platform — from UI interaction to FFmpeg command invocation.

**Verdict:** `generationMode` ('draft' | 'quality') is **lost** before reaching the render tier. The renderer never receives the per-job generation mode, and the encoder relies solely on a static environment variable (`process.env.RENDER_MODE`). As a result, Draft and Quality jobs execute identical FFmpeg encoding settings.

---

## 1. Trace by Pipeline Stage

| Stage | File / Symbol | Status | Details |
|---|---|---|---|
| **1. UI State** | [`UploadZone.tsx:65`](file:///c:/Projects/Ashishlabs/Excerpt/apps/web/src/components/UploadZone.tsx#L65) | **Created** | `const [generationMode, setGenerationMode] = useState<'draft' \| 'quality'>('draft')`. Toggled via UI buttons (`'draft'` or `'quality'`). |
| **2. Client Request** | [`UploadZone.tsx:122, 163`](file:///c:/Projects/Ashishlabs/Excerpt/apps/web/src/components/UploadZone.tsx#L122) | **Transmitted** | Sent as JSON field `generationMode` in `POST /api/video/process` or FormData in file uploads. |
| **3. API Ingestion** | [`video.ts:641, 707`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/routes/video.ts#L641) | **Validated** | `const generationMode = (req.body.generationMode as 'draft' \| 'quality') \|\| 'draft'`. Forwarded to `queueService.addJob(...)`. |
| **4. Queue Persistence** | [`queueService.ts:49, 82`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/services/queueService.ts#L49) | **Stored** | Saved in Firestore/Supabase job record under `job.payload.generation_mode` and root `data.generationMode`. |
| **5. Video Worker Ingestion** | [`videoWorker.ts:411-412`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/workers/videoWorker.ts#L411-L412) | **Read & Diverted** | `const userRequestedMode = data.generationMode \|\| 'draft';`<br>`const isDraftMode = forceDraftMode \|\| userRequestedMode === 'draft';`. |
| **6. Variable Collision** | [`videoWorker.ts:350, 415, 1025`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/workers/videoWorker.ts#L350) | **Overridden / Shadowed** | Variable named `generationMode` is typed as `'ai' \| 'heuristic' \| 'recovery'` (representing candidate fallback strategy). Line 415 sets `generationMode = 'ai'`. The user's `'draft' \| 'quality'` mode is shadowed. |
| **7. Render Job Payload** | [`videoWorker.ts:1850-1857`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/workers/videoWorker.ts#L1850-L1857) | **LOST** | When creating render job for `renderWorker`, `payload` includes `{ videoUrl, clipStart, clipEnd, clipWords, cropPlan, jumpCutPlan }`. **`generationMode` is completely omitted.** |
| **8. Render Worker Ingestion** | [`renderWorker.ts:116-120`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/workers/renderWorker.ts#L116-L120) | **Missing** | `const { clipStart, clipEnd, clipWords, cropPlan } = payload;`. `generationMode` is not extracted or known. |
| **9. Encoder Invocation** | [`videoProcessor.ts:111-112`](file:///c:/Projects/Ashishlabs/Excerpt/apps/api/src/services/videoProcessor.ts#L111-L112) | **Default Fallback** | `highQualityEncodeArgs()` takes no parameters and evaluates: `const isDraft = process.env.RENDER_MODE === 'draft'`. In normal development/production, this defaults to Quality preset (`libx264 -preset fast -crf 18`) regardless of what the user chose. |

---

## 2. Root Cause Analysis

1. **Semantic Overloading of `generationMode`**:
   In `videoWorker.ts`, the term `generationMode` is used for two entirely different concepts:
   - User Intent Mode: `'draft' | 'quality'` (speed vs. depth).
   - Candidate Generation Mode: `'ai' | 'heuristic' | 'recovery'` (model vs. rule fallback).
   Because of this collision, `userRequestedMode` was stored in local variable `isDraftMode`, but was never attached to the per-clip render payload or the canonical `RenderPlan`.

2. **Decoupled Architecture between `videoWorker` and `renderWorker`**:
   `renderWorker` is a standalone daemon pulling from the `render_jobs` table. It had no channel to know whether the parent video job was submitted in Draft mode or Quality mode because `videoWorker` did not propagate `generationMode` into `render_jobs.payload`.

3. **Static Environment Variable Reliance**:
   `VideoProcessor.highQualityEncodeArgs` relied on `process.env.RENDER_MODE`. Server environment variables cannot represent dynamic, per-request user choices in a multi-tenant queue.

---

## 3. Propagation Remedy Matrix (Phase 2 & 3 Plan)

| Component | Target Change |
|---|---|
| **Contract** | Canonical type `type GenerationMode = 'draft' \| 'quality'`. Rename candidate fallback variable in `videoWorker.ts` to `candidateSelectionStrategy` to eliminate shadowing. |
| **`videoWorker.ts`** | Include `generationMode: userRequestedMode as GenerationMode` inside `renderJobData.payload`. |
| **`RenderPlan` (`clipping-core`)** | Add `generationMode: GenerationMode` to `RenderPlan` and `RankingRenderJob`. |
| **`renderWorker.ts`** | Extract `const generationMode: GenerationMode = payload.generationMode || 'draft';` and pass to `processor.processClip` / render pipeline. |
| **`VideoProcessor`** | Update `highQualityEncodeArgs(mode?: GenerationMode)` to accept explicit mode, defaulting to `process.env.RENDER_MODE || 'draft'`. |
