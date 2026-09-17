---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# Excerpt Clip Pipeline Architecture

This document specifies the canonical end-to-end execution stages of the Excerpt video clipping pipeline.

---

## 1. Pipeline Execution Graph

```text
Source Video (URL / Upload)
      │
      ▼
Stage 0: Ingestion & Validation
      │  - Download & SHA256 checksum
      │  - ffprobe container & stream validation
      ▼
Stage 1: Transcription & Acoustic Perception
      │  - Whisper word-level timestamps
      │  - Acoustic energy & pause detection
      ▼
Stage 2: Multimodal Perception & Tracking
      │  - Face detection & active speaker identification
      │  - Frame-by-frame coordinate normalization
      ▼
Stage 3: Candidate Window Generation
      │  - Hook detection, transcript semantic boundaries
      │  - Snapping to silence and keyframe bounds
      ▼
Stage 4: Editorial Ranking & Selection
      │  - Multi-criteria scoring & diversity filtering
      │  - Top-K accepted candidate selection
      ▼
Stage 5: Contextual Director & Reframe Planning
      │  - Feasible crop region solving ($[y_{\min}, y_{\max}]$)
      │  - 4-state camera mode arbitration (HOLD, TRACK, PAN, CUT)
      ▼
Stage 6: Caption & Render Planning
      │  - ASS kinetic subtitle generation
      │  - Invariant: renderJobs.length === acceptedClips.length
      ▼
Stage 7: Transcoding & Compositing
      │  - FFmpeg process tree execution
      │  - Hardware-accelerated or software fallback rendering
      ▼
Stage 8: Delivery & Storage Verification
      │  - Playback verification & stream validation
      │  - Backblaze B2 upload & signed URL generation
      ▼
Playable 9:16 Clip
```

---

## 2. Stage Contracts & Ownership

1. **Ingestion (`apps/api/src/workers/stages/IngestionStage.ts`)**:
   - Validates supported codecs, duration ($15\text{ s}$ to $3\text{ h}$), and integrity.
2. **Director (`packages/clipping-core/src/director/SmartReframeEngine.ts`)**:
   - Enforces $9:16$ portrait framing without cutting faces or obscuring subtitles.
3. **Render Worker (`apps/api/src/workers/renderWorker.ts`)**:
   - Manages FFmpeg process isolation, child process SIGKILL watchdogs, and status updates.

---

## 3. Failure & Retry Model

- Transient errors (network timeouts, download rate limits) trigger exponential backoff retry.
- Deterministic errors (codec unsupported, unrecoverable video corruption, duration $< 15\text{ s}$) fail closed immediately with a typed `PipelineError`.
