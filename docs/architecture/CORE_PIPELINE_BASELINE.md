# EXCERPT CORE PIPELINE FORENSIC BASELINE
**Document Version:** 1.0.0  
**Phase:** 0 (Forensic Baseline Audit)  
**Verification Date:** September 8, 2026  
**Scope:** Canonical Clip Generation Pipeline (Input → Delivery → Playback → Gallery)

---

## Architecture Overview

The Excerpt core clipping pipeline transforms arbitrary long-form video inputs into high-retention 9:16 vertical clips. The architecture strictly enforces single-ownership boundaries across the execution graph:

```text
INPUT
  ↓
Stage 0: Media Acquisition (IngestionStage / VideoProcessor)
  ↓
Stage 1: Media Validation (ArtifactValidator)
  ↓
Stage 2: Transcription & Acoustic Perception (TranscriptionStage)
  ↓
Stage 3: Unified Multimodal Perception & Scene Understanding (IntelligenceStage)
  ↓
Stage 4: Candidate Generation & Boundary Snapping (CandidateStage / AcousticBoundarySnapper)
  ↓
Stage 5: Editorial Planning & Ranking (PersonaRankingEngine / MultiScaleStoryEngine)
  ↓
Stage 6: Contextual Director & Reframe Planning (SmartReframeEngine)
  ↓
Stage 7: RenderPlan Contract Generation (createRenderPlan)
  ↓
Stage 8: Render Worker & Compositing (renderWorker / VideoProcessor)
  ↓
Stage 9: Delivery & Storage Verification (StorageService / DeliveryValidator)
  ↓
Stage 10: Playback Verification (PlaybackValidator)
  ↓
Stage 11: Gallery & Download Verification (API Gateway / Client Contracts)
  ↓
PLAYABLE CLIP (or Canonical PipelineError)
```

### Key Ownership Invariants
1. **Parent Job Owner:** `videoWorker` exclusively owns parent job state (`jobs` table).
2. **Render Job Owner:** `renderWorker` exclusively owns render task execution (`render_jobs` and `clips` tables).
3. **Voiceover Isolation:** Voiceover is frozen and strictly post-delivery. It never alters core clip generation.
4. **RenderPlan Contract:** `renderPlan.renderJobs.length === acceptedClips.length`. No downstream stage may infer render counts from requested clip counts.

---

## Detailed Stage Audit

### Stage 0: Media Acquisition & Ingestion
- **Owner:** `IngestionStage` (`apps/api/src/workers/stages/IngestionStage.ts`), `VideoProcessor.downloadVideo`, `ensureSourceVideo`
- **Input:**
  - `jobId: string`
  - `videoUrl: string` (YouTube URL, direct HTTP MP4/WebM URL, or local file path)
  - `tempDir: string`, `cacheDir: string`
  - `onProgress?: (progress: number, label: string) => Promise<void>`
- **Output:**
  - `inputPath: string` (guaranteed local MP4 path)
  - `sourceDuration: number` (seconds)
  - `dimensions: { width: number; height: number }`
  - `cachedInputPath: string`
  - `attempts: DownloadAttemptRecord[]`
- **Timeout:** 300,000 ms (5 minutes) bounded by downloader process watchdogs.
- **Retry:** `RotatingProxyProvider` round-robin cooldown; yt-dlp cookie/format fallback strategy cascade (direct, cookies, iOS client, web_creator).
- **Failure Category:** `PipelineErrorCode.DownloadFailed` / `ErrorCategory.DOWNLOAD`
- **Database Writes:** Stage telemetry, progress updates (10% to 40%) in `jobs` table.
- **Artifacts:** `source.mp4` in local temp directory and cache directory.
- **Downstream Contract:** Non-empty, uncorrupted video file on disk readable by FFmpeg and ffprobe.

---

### Stage 1: Media Validation
- **Owner:** `ArtifactValidator` (`packages/clipping-core/src/contracts/ArtifactValidator.ts`), `VideoProcessor.getVideoDuration`
- **Input:**
  - `filePath: string`
  - `originalUrlOrPath: string`
  - `sourceType: 'uploaded_mp4' | 'youtube_url' | 'direct_mp4_url' | 'local'`
  - `jobId: string`
- **Output:**
  - `MediaArtifact`:
    - `width: number`, `height: number`, `fps: number`
    - `durationSec: number`, `durationMs: number`
    - `videoCodec: string`, `audioCodec: string`
    - `hasVideoStream: boolean`, `hasAudioStream: boolean`, `hasAudio: boolean`
    - `checksumSha256: string`, `fileSizeBytes: number`
- **Timeout:** 15,000 ms (15s) for ffprobe JSON probe.
- **Retry:** None (deterministic inspection).
- **Failure Category:** `PipelineErrorCode.ValidationError` / `UnsupportedMediaType` / `MinimumDurationNotMet`
- **Database Writes:** None.
- **Artifacts:** Validated in-memory `MediaArtifact` record.
- **Downstream Contract:** Artifact has valid video stream, positive duration >= 15s (or valid short duration), supported codecs (h264, hevc, vp9, av1, etc.).

---

### Stage 2: Transcription & Acoustic Perception
- **Owner:** `TranscriptionStage` (`apps/api/src/workers/stages/TranscriptionStage.ts`), `TranscriptionService`
- **Input:**
  - `inputPath: string`
  - `sourceDuration: number`
  - `cachedTranscriptionPath: string`
  - `jobId: string`
  - `db: DatabaseService`
- **Output:**
  - `transcriptionText: string`
  - `segments: TranscriptSegment[]`
  - `words: WordInfo[]` (precise word-level start/end timestamps in seconds)
  - `recoveryMode: boolean`
  - `transcriptionTelemetry: object`
- **Timeout:** 60s per audio chunk / 300s total bounded by StageExecutor.
- **Retry:** Cache hit check (SHA-256 / semantic); provider cascade: Whisper local / Groq Whisper / AssemblyAI.
- **Failure Category:** `PipelineErrorCode.TranscriptionFailed` (or explicit `no_speech` flag for musical/visual content).
- **Database Writes:** Progress update `transcribing` (40% to 55%), cached transcription JSON on disk.
- **Artifacts:** `transcription.json` in job cache directory.
- **Downstream Contract:** Array of word timestamps or explicit empty array with `no_speech` flag for downstream visual/action clipping.

---

### Stage 3: Unified Multimodal Perception & Scene Understanding
- **Owner:** `IntelligenceStage` (`apps/api/src/workers/stages/IntelligenceStage.ts`), `IntelligenceOrchestrator`, `CategoryClassifier`, `SceneCutSnapper`, `CrowdExcitementEngine`
- **Input:**
  - `inputPath: string`, `sourceDuration: number`, `transcriptionText: string`, `segments: any[]`, `words: WordInfo[]`, `pipelineContext: PipelineContext`
- **Output:**
  - `category: CategoryResult` (category, confidence, signals)
  - `sceneCuts: number[]` (visual transition cut points)
  - `eventGraph: EventGraph`
  - `storyGraph: StoryGraph`
  - `isV2PipelineUsed: boolean`
- **Timeout:** 45,000 ms bounded per detector.
- **Retry:** Non-fatal graceful degradation (optional detectors fail open, primary category classifier defaults to 'general').
- **Failure Category:** `PipelineErrorCode.PerceptionEngineFailed`
- **Database Writes:** Stage telemetry in `pipeline_summary`.
- **Artifacts:** In-memory scene cuts, acoustic energy timeline.
- **Downstream Contract:** Populated `PipelineContext` with category weights, acoustic boundaries, and visual scene transition timestamps.

---

### Stage 4: Candidate Generation & Boundary Snapping
- **Owner:** `CandidateStage` (`apps/api/src/workers/stages/CandidateStage.ts`), `CandidateGenerator`, `AcousticBoundarySnapper`, `ContextCoherenceGuard`
- **Input:**
  - `PipelineContext`, `words: WordInfo[]`, `numClips: number`, `sourceDuration: number`, `intent?: string`
- **Output:**
  - `candidates: CandidateClip[]`
  - `generationMode: 'ai' | 'heuristic' | 'recovery'`
  - `criticFilteredCount: number`
  - `rankedCandidates: any[]`
- **Timeout:** 30,000 ms.
- **Retry:** AI candidate generation with fallback to heuristic boundary detection (`fallbackClipService`).
- **Failure Category:** `PipelineErrorCode.NoViableCandidates`
- **Database Writes:** Progress update `detecting` (55% to 75%).
- **Artifacts:** Candidate range list with metadata.
- **Downstream Contract:** Every candidate has `start_time` and `end_time` snapped to acoustic silence; zero mid-word truncations; `duration >= 15.0s` (or calibrated short-source floor).

---

### Stage 5: Editorial Planning & Ranking
- **Owner:** `PersonaRankingEngine`, `CriticEngine`, `MultiScaleStoryEngine`, `PlanningStage`
- **Input:**
  - `candidates: CandidateClip[]`, platform target (TikTok, Reels, Shorts), narrative arc profiles
- **Output:**
  - Pruned and ranked candidates where `acceptedCount <= generatedCount`
  - Editorial scores: `virality_score`, `hook_score`, `coherence_score`, `retention_score`
- **Timeout:** 15,000 ms.
- **Retry:** Deterministic heuristic ranking fallback.
- **Failure Category:** `PipelineErrorCode.RankingFailed`
- **Database Writes:** DB clip records in `clips` table (status `pending`).
- **Artifacts:** Pruned clip array.
- **Downstream Contract:** Exactly `acceptedClips` passed to RenderPlan. Pruned clips violating duration or coherence are discarded.

---

### Stage 6: Contextual Director & Reframe Planning
- **Owner:** `SmartReframeEngine` (`packages/clipping-core/src/director/SmartReframeEngine.ts`), `ContextualDirectorEngine`
- **Input:**
  - `MediaArtifact`, `PerceptionFrame[]`, target aspect ratio (9:16), framing configuration
- **Output:**
  - `CameraPlan`:
    - `layoutMode: 'single_speaker' | 'two_speaker_split' | 'action_track' | 'cinematic'`
    - `keyframes: CameraKeyframe[]` (timestampMs, cropBox, scale, framingLevel)
    - `transitions: CameraTransition[]`
- **Timeout:** 15,000 ms.
- **Retry:** Center crop fallback if facial/saliency detection is unavailable.
- **Failure Category:** `PipelineErrorCode.PlanningFailed`
- **Database Writes:** Crop plan attached to clip metadata in `clips` table.
- **Artifacts:** In-memory camera trajectory keyframes.
- **Downstream Contract:** Crop box preserves head room, avoids face truncation, stays within source 1920x1080 bounds, respects velocity limits.

---

### Stage 7: RenderPlan Contract Generation
- **Owner:** `createRenderPlan` (`packages/clipping-core/src/contracts/RenderPlan.ts`)
- **Input:**
  - `jobId: string`
  - `requestedClips: number`
  - `acceptedClips: any[]`
- **Output:**
  - `RenderPlan`:
    - `jobId: string`, `requestedClips: number`, `acceptedCandidates: number`
    - `renderJobs: RenderJobPlan[]`
    - `deliveryPolicy: { minSuccessfulClips: number; allowPartialDelivery: boolean }`
- **Timeout:** Synchronous (< 10 ms).
- **Retry:** None.
- **Failure Category:** `PipelineErrorCode.RenderPlanInvalid`
- **Database Writes:** `render_jobs` records in database with status `pending`.
- **Artifacts:** In-memory immutable RenderPlan contract.
- **Downstream Contract:** **CRITICAL INVARIANT:** `renderPlan.renderJobs.length === acceptedClips.length`. Downstream execution cannot schedule more or less renders than accepted.

---

### Stage 8: Render Worker & Compositing
- **Owner:** `renderWorker.ts` (`apps/api/src/workers/renderWorker.ts`), `VideoProcessor.processClip`, `KineticCaptionGenerator`
- **Input:**
  - `render_jobs` database row, source video, crop plan, jump cut plan, caption styles
- **Output:**
  - Rendered 1080x1920 MP4 file and JPEG thumbnail on local disk
- **Timeout:** 600,000 ms (10 minutes) per render job watchdog.
- **Retry:** Up to 3 attempts with exponential backoff; failures moved to `render_dead_letters`.
- **Failure Category:** `PipelineErrorCode.RenderFailed`
- **Database Writes:**
  - `render_jobs` table: `rendering` → `completed` or `failed`
  - `clips` table: `rendering` → `uploaded` (storage_path, thumbnail_path) or `failed`
- **Artifacts:** `clip_<id>.mp4`, `thumb_<id>.jpg`
- **Downstream Contract:** Rendered file on disk conforms to 1080x1920, h264/aac, non-zero bytes, playable duration.

---

### Stage 9: Delivery & Storage Verification
- **Owner:** `StorageService` (`apps/api/src/services/storageService.ts`), `DeliveryValidator` (`packages/clipping-core/src/evaluation/DeliveryValidator.ts`)
- **Input:**
  - `RenderPlan`, `ArtifactCheck[]` (clipId, videoUrl, isPlayable, storageVerified)
- **Output:**
  - `DeliveryValidationReport`:
    - `scheduled: number`, `rendered: number`, `uploaded: number`, `verified: number`, `playable: number`
    - `pass: boolean` (`playable >= minSuccessfulClips`)
    - `reason?: string`
- **Timeout:** 60,000 ms.
- **Retry:** 3 retries with backoff on cloud upload.
- **Failure Category:** `PipelineErrorCode.DeliveryFailed`
- **Database Writes:** Final `delivery_report` written into `jobs.pipeline_summary`.
- **Artifacts:** Cloud storage objects in Backblaze B2 or verified local storage URLs.
- **Downstream Contract:** `DeliveryValidationReport.pass === true`.

---

### Stage 10: Playback Verification
- **Owner:** `PlaybackValidator` (`packages/clipping-core/src/evaluation/PlaybackValidator.ts`)
- **Input:**
  - `clipId: string`, HTTP response statusCode, `contentType`, `contentRange`, `contentLength`, `byteBuffer` (first 64KB)
- **Output:**
  - `PlaybackHealthReport`:
    - `artifactExists: boolean`
    - `signedUrlValid: boolean`
    - `rangeSupported: boolean` (HTTP 206)
    - `mimeCorrect: boolean` (`video/mp4`)
    - `metadataLoaded: boolean` (`ftyp` or `moov` atom header)
    - `durationParsed: boolean`
    - `playbackSuccessful: boolean`
- **Timeout:** 10,000 ms per clip probe.
- **Retry:** 2 retries on network glitch.
- **Failure Category:** `PipelineErrorCode.PlaybackValidationFailed`
- **Database Writes:** Clip playback diagnostic report in database.
- **Artifacts:** None.
- **Downstream Contract:** Clip can be streamed and seeked in browser video player.

---

### Stage 11: Gallery & Download Verification
- **Owner:** Production API endpoints (`/api/jobs/:id`, `/api/clips/:id/download`), Next.js Web Frontend
- **Input:** `jobId: string`, `clipId: string`
- **Output:**
  - Job status `completed` in `/api/jobs/:id`
  - Completed clip entries in `clips` array with valid streaming URL and thumbnail URL
  - Download endpoint `/api/clips/:id/download` returns HTTP 200/206 with `video/mp4` and valid binary byte stream
- **Timeout:** 5,000 ms.
- **Retry:** None.
- **Failure Category:** `PipelineErrorCode.ArtifactUnusable`
- **Database Writes:** Final transition `JobStateMachine.transition(db, jobId, JobStatus.COMPLETED)`.
- **Artifacts:** Client-consumable API responses.
- **Downstream Contract:** Completed clip is immediately playable in web UI and downloadable as an MP4 file.
