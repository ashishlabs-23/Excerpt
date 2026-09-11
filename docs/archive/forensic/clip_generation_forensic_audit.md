# Forensic Audit — Clip Generation Pipeline

## Overview
This forensic audit traces the 24-step execution path of the Excerpt clip generation engine from initial input submission down to dashboard visualization.

---

## Stage Execution Trace

| Step | Stage Name | Owner / Component | Input Contract | Output Contract | Timeout | Error Handling / Failure Mode |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Input Ingestion | `routes/video.ts` | Request body (`videoUrl`, `numClips`, `intent`) | Job record in Supabase (`status: queued`) | 10s | 400 Bad Request if URL validation fails. |
| **2** | URL & Format Detection | `urlSafety.ts` | `videoUrl` string | Sanitized URL or local path | 5s | Throws `PipelineError` if host is forbidden or malformed. |
| **3** | Direct-File Detection | `DownloadEngine.ts` | `safeUrl` | Stream piping to `outputPath` | 60s | Falls back to `yt-dlp` strategies if HTTP stream fails. |
| **4** | yt-dlp Strategy Selection | `StrategyManager.ts` | Media duration | `DownloadStrategy[]` (`android`, `ios`, `mweb`, etc.) | Instant | Selects strategies sorted by historical success rate. |
| **5** | Media Download | `DownloadEngine.ts` | `safeUrl`, `outputPath` | Physical MP4 file in `temp/cache` | 90s (25s inactivity) | Kills stalled process and cascades to next strategy attempt. |
| **6** | Media Probing | `VideoProcessor.ts` | Local file path | Duration, resolution, codec metadata | 30s | Fails fast with `MEDIA_DECODE` error if probing fails. |
| **7** | Audio Extraction | `VideoProcessor.ts` | Local MP4 file | Mono 16kHz MP3 audio file | 5m | Throws `PipelineError` (category: `FFMPEG`). |
| **8** | Transcription | `TranscriptionService` | Audio file | Word-level timestamps & transcript text | 5m | Triggers fallback heuristic speech segmentation if opted in. |
| **9** | Speaker Diarization | `IntelligenceOrchestrator` | Transcript & audio | Speaker assignment per word/sentence | 60s | Optional capability; degrades gracefully if unassigned. |
| **10**| Frame Extraction | `VideoProcessor.ts` | Local MP4 file | PGM/JPG analysis frames at 4fps | 10m | Non-fatal warning; falls back to static rule-of-thirds crop. |
| **11**| Visual Analysis | `BroadcastGraphicsDetector` | Frame directory | On-screen graphics & banner coordinates | 60s | Optional capability; empty results handled safely. |
| **12**| Content Classification | `CategoryClassifier` | Transcript & metadata | `ContentProfile` (Podcast, Sports, Tutorial, etc.) | 10s | Defaults to `podcast` profile on low confidence. |
| **13**| Candidate Generation | `CandidateGenerator` | Story graph & transcript | 20–50 raw candidate moments | 30s | Rejects candidates with incomplete sentences or missing hooks. |
| **14**| Candidate Pruning | `CriticEngine` | Candidate array | Filtered candidate pool | 20s | Removes duplicate or low-score candidates. |
| **15**| Candidate Ranking | `PersonaRankingEngine` | Candidate pool & profile | Ranked candidate list with score breakdowns | 15s | Deterministic scoring across hook, story, emotion, pacing. |
| **16**| Boundary Planning | `SmartBoundaryEngine` | Selected candidate timestamps | Snap-to-word & sentence boundaries | 10s | Snaps start/end to zero-crossing audio or sentence boundaries. |
| **17**| RenderPlan Creation | `clipping-core` | Top N candidate moments | Immutable `RenderPlan` JSON contract | Instant | Guarantees deterministic rendering instructions. |
| **18**| Render Job Creation | `queueService.ts` | `RenderPlan` | Sub-records in `render_jobs` table | 10s | Coupable state-tracked queue items for render workers. |
| **19**| Render Execution | `renderWorker.ts` | `RenderPlan` job payload | 9:16 vertical MP4 video clip | 5m per clip | Validates output size, container, and streams. |
| **20**| Storage Upload | `StorageService` | Rendered clip file | S3/B2 storage path | 60s | Retries upload up to 3 times before failing job. |
| **21**| Delivery Validation | `DeliveryValidator` | `RenderPlan` & DB clips | `DeliveryValidationResult` | 10s | Verifies delivered clip count satisfies delivery policy. |
| **22**| Playback Validation | `PlaybackValidator` | Signed clip URLs | `PlaybackValidationResult` | 10s | Performs HTTP byte-range check to confirm browser usability. |
| **23**| Final Job Transition | `JobStateMachine` | Validation results | Final status (`completed` or `failed`) | Instant | Updates parent job record in Supabase. |
| **24**| Dashboard Result Mapping | `ActiveJobs.tsx` | Supabase job record | React UI card update | Instant | Displays progress, score breakdown, and playback preview. |
