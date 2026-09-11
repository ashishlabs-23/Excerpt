# INGESTION CONTRACT
# Excerpt — Universal Media Ingestion Subsystem (Step 1)

> **Status**: COMPLETE
> The ingestion subsystem has been fully implemented in `@excerpt/ingestion`, utilizing the contracts in `@excerpt/clipping-core` and the safety baseline from `@excerpt/shared`.

## 1. Canonical Normalization

Every supported input is aggressively normalized into a canonical `MediaArtifact`.
Scattered `if (isYoutube)` logic is strictly forbidden in downstream workers. All workers must code against the `MediaArtifact` contract.

```typescript
export interface MediaArtifact {
  sourceType: 'youtube' | 'direct' | 'local';
  originalUrlOrPath: string;
  localPath: string;
  mimeType: string;
  fileSizeBytes: number;
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  hasAudio: boolean; // Policy flag
  checksumSha256: string;
}
```

## 2. Idempotency Guarantees

Before acquiring any remote or local media, the subsystem resolves its canonical identity (e.g., YouTube Video ID, URL hash).
If the output file already exists, it is instantly probed and checksummed. If valid, the acquisition phase is bypassed entirely.
*This prevents redundant `yt-dlp` invocations on pipeline retries.*

## 3. Strict Audio Policy

- **Video without audio**: Permitted. `hasAudio` is set to `false`. Downstream rendering must synthesize a silent audio track or mux without audio to avoid FFmpeg errors.
- **Audio-only input (no video)**: **REJECTED**. The adapter actively throws `PipelineError.UnsupportedMediaType`. Excerpt generates video clips; podcasts and audio-only workflows are intentionally out of scope for the current architecture.

## 4. YouTube Strategy Engine

The `YouTubeAdapter` invokes the `StrategyRunner` which sequentially cascades through strategies (`android`, `ios`, `mweb`, `web-cookies`, `tv-cookies`) if rate-limited or blocked.
Each strategy execution emits structured telemetry to the `CostLedger` (duration, exit code, bytes downloaded).

**Watchdogs:**
Two watchdogs wrap the `yt-dlp` child process using the Step 0.5 `runWithTimeout` tree-kill utility:
1. **Inactivity**: Aborts if stdout/stderr emits no data for 15 seconds.
2. **Ceiling**: Actively polls `fs.stat` on the growing output file and aborts (`SIGTERM` → `SIGKILL`) if it breaches the `maxSizeBytes` resource ceiling.

## 5. Direct Media Bypass (Invariant 14)

Direct MP4 and WebM URLs are routed to `DirectMediaAdapter`. This adapter utilizes `DownloadUtils.downloadBounded` to stream the payload via HTTP(s) directly to disk, completely bypassing `yt-dlp`. 
It enforces the `maxSizeBytes` ceiling on-the-fly and respects all `fetchSafe` SSRF constraints.

## 6. Success Contract Enforcement

An exit code of `0` from `yt-dlp` or `fetch` is never sufficient to declare success.
The subsystem strictly validates the following before returning a `MediaArtifact`:
1. `fs.stat` confirms the file exists.
2. `sizeBytes > 0`.
3. `Prober.probe` (FFprobe) succeeds within a bounded timeout.
4. `durationMs > 0`.
5. `hasVideoStream === true`.
6. `hasAudioStream === true` OR Audio Policy permits `hasAudio === false`.

## 7. Test Verification

16 independent test cases in `packages/ingestion/src/__tests__/ingestion.test.ts` verify the subsystem, encompassing idempotency, watchdog activation, SSRF rejection, strategy cascading, and audio policy enforcement.
