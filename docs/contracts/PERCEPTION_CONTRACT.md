# PERCEPTION CONTRACT
# Excerpt — V5.1 Unified Perception Engine (Step 3)

> **Status**: COMPLETE
> The perception subsystem has been implemented in `@excerpt/perception`. It orchestrates asynchronous AI models, perfectly aligns their distinct temporal outputs into a standard 10hz stream, and manages failures defensively.

## 1. TemporalPerceptionStream & Alignment

All downstream candidate intelligence, clipping, and rendering stages rely on a unified `TemporalPerceptionStream`. Instead of disparate JSON payloads from different models, everything is temporally locked.

```typescript
export interface PerceptionFrame {
  timestampMs: number;
  durationMs: number;
  
  // Signals (excerpt):
  transcriptWords: PerceptionSignal<any[]>;
  speaker: PerceptionSignal<{ id: string; confidence: number }>;
  objects: PerceptionSignal<any[]>;
}
```

The `TemporalAligner` mathematically synchronizes asynchronous outputs (e.g., WhisperX per-word boundaries, Pyannote 1-second chunks, YOLO 30fps boxes) into fixed 100ms `PerceptionFrame` intervals.

## 2. Mandatory vs Optional Signals

AI models are strictly classified into two categories within the `PerceptionOrchestrator`:
- **MANDATORY**: `WhisperX` (Transcript) & `Pyannote` (Diarization). If these fail, the `PerceptionEngineFailed` pipeline error is thrown, halting the job.
- **OPTIONAL**: `YOLO`, `SAM2`, `OCR`, etc. If these fail, they do not crash the job. The error is logged, the `PerceptionSignal.available` flag is set to `false`, and the overall `completeness` score (0.0–1.0) is lowered. Candidate generation models downstream can choose to read this completeness score to adjust their heuristics.

## 3. Version-Aware Caching

The subsystem utilizes `PerceptionCache`.
- **Cache Key Generation**: `hash(mediaArtifact.checksum, engineName, engineVersion, config)`.
- Bumping a model version (e.g., Pyannote v3.0 -> v3.1) implicitly regenerates a new cache key. This guarantees cache invalidation on model upgrades without silent staleness, strictly enforcing that the cache is never keyed on just the checksum alone.

## 4. Safety Baseline Integration

Every `BaseEngine` invocation strictly wraps its execution in the Step 0.5 `runWithTimeout` function.
Additionally, prior to executing, it integrates with `CostLedger` via `estimateCost(artifact)`. If a tenant's budget limit is hit, `PipelineErrorCode.BudgetExceeded` halts the engine immediately before costly GPU inference runs.

## 5. Test Verification

6 explicit edge-cases in `perception.test.ts` continuously assert these guarantees:
1. Temporal mapping across diverse frame rates.
2. Optional engine failures returning cleanly and lowering `completeness`.
3. Mandatory engine failures successfully halting the job.
4. Identical checksum cache hits successfully bypassing inference.
5. Version bumps successfully missing cache and executing inference.
6. Budget ceilings throwing correctly.
