# EXCERPT — POST-P0 TECHNICAL DEBT LEDGER
*Target Milestone: Post-P0 Hardening Architecture Modernization*
*Date: September 2026*

This document tracks technical debt explicitly deferred out of the P0 Clip Pipeline Hardening milestone to preserve focus on the single-pass FFmpeg consolidation and end-to-end `generationMode` propagation contract.

---

## 1. VideoWorker Decomposition
- **Current State**: `apps/api/src/workers/videoWorker.ts` exceeds 1,400 lines and mixes orchestration, DB persistence, heuristic fallback candidate generation, Director camera cuts, render job dispatch, and error recovery.
- **Risk**: High cognitive load, high risk of unintended regressions when modifying stage logic, and duplication with modular worker stages in `apps/api/src/workers/stages/`.
- **Target Architecture**:
  - Break `videoWorker` down into pure, isolated stage handlers:
    1. `IngestionHandler`: Acquisition, media validation, format probe.
    2. `PerceptionHandler`: Scene detect, face tracking, Whisper transcription.
    3. `EditorialHandler`: Multi-scale story engine, celebration detector, context coherence guard.
    4. `DirectorHandler`: Dynamic 9:16 reframing, multi-speaker framing, motion smoothing.
    5. `DispatchHandler`: Canonical `RenderPlan` instantiation and render queue dispatch.
  - VideoWorker itself becomes a slim state machine runner (~150 lines).

---

## 2. Event-Driven Queue Transition
- **Current State**: Multiple background workers (`videoWorker`, `renderWorker`, `voiceoverWorker`) continuously poll Supabase Postgres tables (`clipping_jobs`, `render_jobs`) with `setInterval` queries.
- **Risk**: Database query overhead at scale, contention during peak loads, and delayed job pick-up compared to real-time events.
- **Target Architecture**:
  - Replace DB polling with an event-driven queueing substrate (e.g., BullMQ with Redis, or Supabase Realtime CDC / pg_notify).
  - Explicit job acknowledgment, dead-letter queues, backoff retries, and distributed rate limiting.

---

## 3. Cloud YouTube Acquisition & PO-Token Architecture
- **Current State**: Acquisition uses a local/cloud fallback ladder (`android`, `ios`, `mweb`, `web-cookies`, `tv-cookies`).
- **External Shift**: As documented in `docs/EXTERNAL_DEPENDENCY_RESEARCH.md`, YouTube enforces Proof of Origin (PO) tokens (BotGuard / Web Player Config). Cloud datacenter IPs are aggressively challenged with HTTP 429 and `Sign in to confirm you're not a bot`.
- **Target Architecture**:
  - Implement external PO-token provider service (`yt-dlp-getpot-wpc` or lightweight headless browser sidecar).
  - Separate GVS (Google Video Server stream URL generation) vs Web Player contexts.
  - Support proxy rotation and cookie pool management with health tracking.

---

## 4. Long-Video Transcription Optimization
- **Current State**: Full audio from hour-long source videos is sent to local Whisper CPU fallback when external transcription APIs fail or timeout, blocking execution threads.
- **Risk**: CPU saturation on host machines, memory spikes, and multi-minute transcription latencies.
- **Target Architecture**:
  - Pre-filter audio with Voice Activity Detection (Silero VAD) to strip dead silence.
  - Chunk audio into 3-5 minute parallel windows with overlapping context for stitching.
  - Stream transcription segments progressively to enable early candidate generation before the full video completes.
