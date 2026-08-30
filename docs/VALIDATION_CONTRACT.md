# VALIDATION CONTRACT
# Excerpt — Media Validation and Normalization Subsystem (Step 2)

> **Status**: COMPLETE
> The validation subsystem has been implemented in `@excerpt/ingestion/src/validation` (acting as the bridge after acquisition). It guarantees deterministic validation, robust corruption handling, and explicit error taxonomy.

## 1. MediaValidationReport

The `MediaValidator` consumes a `MediaArtifact` and unconditionally outputs a `MediaValidationReport`.
This structure completely categorizes the health of the artifact:
```typescript
export interface MediaValidationReport {
  valid: boolean;                       // true if fatalErrors.length === 0
  fatalErrors: PipelineError[];
  warnings: ValidationWarning[];
  metadata: Record<string, any>;        // Raw ffprobe format data
  streams: { video: any; audio?: any };
  durationMs: number;
  resolution: { width: number; height: number };
  codec: { video: string; audio?: string };
  estimatedProcessingCostUsd: number;
}
```

## 2. Fatal vs Warning Taxonomy

Issues are explicitly classified by the `ValidationRules` engine:

**FATAL ERRORS** (Pipeline halts immediately):
- `MinimumDurationNotMet`: Video duration < 5000ms.
- `ValidationError`: Duration is 0 or unreadable.
- `ValidationError`: Missing expected streams (e.g., audioCodec is undefined when `hasAudio === true`).
- `ValidationError`: Unsupported video codec (must be `h264`, `vp9`, `av1`, or `hevc`).
- `ValidationError`: Deep corruption detected (e.g., malformed moov atoms).

**WARNINGS** (Pipeline proceeds, warnings bubbled to telemetry/render):
- `VFR_DETECTED`: Video uses Variable Frame Rate (`avg_frame_rate !== r_frame_rate`). 
- `NON_STANDARD_ASPECT_RATIO`: Resolution is not `16:9` or `9:16`.

## 3. Adversarial / Corruption Defenses

Standard `ffprobe` calls can hang or crash when fed maliciously crafted MP4 files or files truncated mid-packet.
The `MediaValidator` implements a `deepProbe()` specifically defending against this:
- **`runWithTimeout` enforcement**: Wraps the probe in a strict 30-second kill-tree mechanism. If the parser hangs traversing a cyclic atom loop, it is killed with `SIGKILL`.
- **`-count_packets`**: Forces the parser to sequentially read through the file headers rather than just reading surface metadata.
- **Graceful degradation**: Crash/error outputs from `ffprobe` are strictly caught and coerced into `fatalErrors` rather than crashing the worker Node.js process.

## 4. Cost Ledger Estimation

As part of the normalization step, the validator implements `estimateCost(artifact)`.
It calculates an estimated processing cost (e.g., $0.005 base + $0.01 / min) based on the exact decoded duration. 
This value is surfaced in the `MediaValidationReport` and is meant to be instantly appended to the Step 0.5 `CostLedger` to halt execution *before* expensive transcription/AI perception begins if the user budget is already exhausted.

## 5. Test Verification

8 explicit edge-cases in `validation.test.ts` continuously assert these guarantees:
1. Multi-resolution parsing (360p through 4K).
2. Frame rate detection (Constant vs VFR warnings).
3. Audio policy compatibility (Silent validation).
4. Corrupted/truncated file detection via timeout.
5. Adversarial atom failure (caught gracefully).
6. WebM/VP9 compatibility.
7. Long video cost calculation.
8. Sub-minimum duration rejection (`MinimumDurationNotMet`).
