# AI Context & Memory Bank

> **Goal**: This file acts as a persistent memory and fast-context initialization point for any AI agent interacting with this repository. It provides an immediate overview of the project's current state, recent focus areas, and the core map of files and components, drastically reducing the token cost of context gathering.

## 🚀 Project Overview: Excerpt
**Excerpt** is an AI-driven Video Viralization Engine designed to ingest long-form content and output high-impact, 9:16 short-form clips. It relies on a multi-stage pipeline utilizing LLMs/VLMs for content reasoning and FFmpeg for precise rendering. 

---

## 📊 Project Status
**Production Readiness**
*   **Infrastructure**: 98%
*   **Generation**: 85%
*   **Voiceover**: 95%
*   **Deployment Architecture**: 
    *   **Frontend**: Web App hosted on Next.js (`http://localhost:3000`).
    *   **Backend**: API and Workers run locally (`http://localhost:8010`), with local queue and local storage fallbacks.
    *   **Database**: Local Queue (`temp/active_queue.json`) & Supabase.
    *   **Storage**: Local static server (`http://localhost:8010/temp/...`) with Backblaze/Firebase cloud support.

**Pending Focus Areas:**
*   **Production Hardening Phase (CURRENT)**: We are in a strict **Feature Freeze**. No new AI features or UI components. Focus is entirely on proving reliability, CI/CD, performance benchmarking, and zero-drift database reconciliation.
*   PV-3 (Consecutive Jobs), PV-4 (Concurrent Jobs), and PV-5 (24-hour Soak).
*   Persisting `LearningEngine` statistics to a database table.

---

## 🧠 Recent Memory & Active Focus (Updated: August 2026)

The development has matured from a Python-scripted prototype into a highly reliable, distributed micro-worker architecture.

### 🛑 CURRENT PHASE: Evidence-Driven Quality Optimization
We have officially completed the infrastructure hardening phase and transitioned into **Clip Quality Optimization**. All future changes to the AI pipeline must be proven via the automated benchmark suite.
1. **Modular Evaluation Pipeline**: Quality is graded across 5 distinct axes: Boundaries, Subtitles, Render Plans, Ranking Reasoning, and Diversity.
2. **Strict Subtitle QA**: Subtitles are penalized for character overflows, high reading speed (CPS), overlapping dialogue, and orphan words.
3. **Immutable Benchmarks**: All benchmark runs are saved to `benchmark-results/production/YYYY-MM-DD/` with git commit hashes and exact dataset hashes.
4. **A/B Promotion Gate**: Experimental pipelines are evaluated against baselines via `ab-evaluator.ts`. Pipelines are only promoted if they increase overall score by >1.0% without degrading any individual component by >2.0%.
5. **Append-Only Arena**: Human feedback is collected immutably via `human_arena` and `human_reviews` tables for future RLHF training.

### 🔒 NON-NEGOTIABLE ARCHITECTURAL INVARIANTS (PERMANENT):
1. **TalkNet Active Speaker MAR Lip Motion Weighting (`unified_crop_planner.py`)**:
   - Lip motion activity (`mar_activity * 3.5`) MUST ALWAYS heavily outweigh face size (`area * 0.5`). Never calculate active face scores based purely on face size, as this causes silent near-camera faces to steal focus from active speakers.
2. **High-Fidelity 1080p Broadcast Quality (`VideoProcessor.ts`)**:
   - Render outputs MUST ALWAYS use `cropWidth = 1080`, `cropHeight = 1920` (Full HD 1080p vertical), `-crf 17` (Visually Lossless), `-preset medium`, `-level 4.2`, and `-maxrate 12M -bufsize 16M`. Draft 720p `-crf 24` ultrafast mode is strictly prohibited for rendered clip outputs.
3. **Instant Dashboard Video Playback Streaming (`video.ts`)**:
   - `resolveLocalClipPath` MUST search both `clips/` and `temp/${jobId}/` candidate directories for local clip files to guarantee native HTTP 206 Partial Content byte-range streaming without triggering 302 redirects that block in HTML5 `<video>` tags.

### August 2026 Updates (V5 3-Release Architecture & Enterprise Scalability):
*   **Enterprise Scalability & Platform Readiness Assessment (`scalability_architectural_evaluation.md` / ADR-008)**: Audited framework readiness for scaling to 100,000+ jobs/day. Awarded **9/10 Enterprise Readiness Index** based on strict micro-worker decoupling (`videoWorker` vs `renderWorker`), deterministic `RenderPlan` contracts, `StageExecutor` error classification, and 10-point empirical `PlaybackValidator` streaming checks.
*   **Excerpt V5 Release Architecture Specification (`v5_release_architecture_specification.md` / ADR-007)**: Structured all future intelligence engineering into **3 Sequential Releases** to maximize clip quality and prevent premature graph abstraction:
    - **Release 1 (Production Clip Engine - Primary Focus)**: **Unified Feature Store (`UnifiedFrame[]`)** + **Director AI** (*Wide, Medium, Close, Punch, Split, Follow, Cut*) + **Dynamic Camera Planner** (Attention Heatmaps) + **Semantic Boundaries** + **Separation of Decision & Planning Layers** + **Pre-Render Strategy Arena & Quality Gate** + **RenderPlan V2**.
    - **Release 2 (Intelligence Layer)**: Scene Graph, Story Graph, Moment Graph, and Multi-Agent Debate Framework.
    - **Release 3 (Learning & Self-Improvement Layer)**: RLHF Reward Models, Interaction Telemetry Vector Store, and Temporal Workflow Engine Migration.
*   **Excerpt V5/V6 8-Layer Multimodal Intelligence Specification (`v5_8layer_multimodal_intelligence_specification.md` / ADR-006)**: Master architectural vision organizing intelligence into 8 Reusable AI Layers (*Perception -> Unified Feature Store -> Understanding -> Decision -> Multi-Agent Debate -> Planning -> Rendering -> Validation -> Learning*).
*   **Excerpt V3 Architecture Specification (`v3_architecture_specification.md`)**: Consolidated package ownership under `@excerpt/clipping-core`. Established strict Worker Isolation: `videoWorker.ts` exclusively owns `jobs` state machine transitions, delivery validation, and completion authority, while `renderWorker.ts` is isolated to `render_jobs` and `clips` updates.
*   **Canonical `StageExecutor` & Failure Taxonomy**: Decoupled AI and FFmpeg processing into a unified execution contract (`@excerpt/clipping-core`) enforcing 14 canonical `ErrorCategory` types, guaranteed timeout boundaries, heap memory measurement, jittered backoff retries, and non-destructive `JobAttempt` telemetry.
*   **Deterministic `RenderPlan` & Candidate Pruning Contract**: Eliminated primitive clip counts and magic numbers (`|| 3`) by enforcing the invariant $expected = acceptedCandidates$ (`renderPlan.renderJobs.length`), decoupling pipeline completion from user-requested counts.
*   **AI-Driven Vertical Framing & Rule-of-Thirds Composition (`VideoProcessor.ts`)**:
    - **Neutral Zoom (`zoomFactor = 1.0`)**: Eliminated compound double-zooming ($4096 \times 2304$) that chopped off foreheads, chins, and ears.
    - **720p RGB Color Frame Extraction**: Upgraded frame extraction from 640px `.pgm` grayscale to **720p `.jpg` RGB color images**, enabling MediaPipe BlazeFace/FaceMesh to achieve ~99% precision.
    - **Eye-Line Headroom ($EYE\_LINE\_RATIO = 0.25$)**: Aligned vertical crop Y offset to place human eyes ~30% down from top with 25% headroom margin.
    - **Rule-of-Thirds Fallback**: Set fallback horizontal crop offset to 35% (`maxOffset * 0.35`) for Rule-of-Thirds framing when zero faces are detected.
*   **10-Point Playback Health Verification**: Replaced basic `completed` flags with a strict empirical 10-point playback health check (`DeliveryValidator` & `PlaybackValidator`). The pipeline programmatically asserts DB artifacts, signed URLs, HTTP 206 Partial Content byte-range streaming, `video/mp4` MIME types, and `ftyp` MP4 header bytes before finalizing a clip.
*   **HTML5 Video Streaming Fix**: Resolved CORS restrictions on the web dashboard by removing `crossOrigin="anonymous"` from video tags and implementing native byte-range fallback routing (`streamClipResponse`) for local and S3 redirected playback.

### Recent Fixes & Pipeline Refactoring (July 2026):
*   **Database Trigger State Machine (`enforce_job_status_transition`)**: Enforced a strict semantic lifecycle in PostgreSQL. Solved the 10% media download stall where jobs were erroneously trying to bypass strict transition logic.
*   **Option B Queue Architecture**: Completely rewrote the internal worker retry mechanism (`videoWorker.ts`). Jobs no longer bounce back to `queued` upon transient failures (like HTTP 429s). Instead, they remain in the `processing` state, holding their lock while retrying internally. This ensures the database accurately reflects the semantic lifecycle of the job.
*   **JobAttempt Telemetry**: Implemented detailed telemetry arrays inside the job payload. The `attempts` array records the exact `startedAt`, `completedAt`, `durationMs`, `success`, and `error` for every retry iteration without blindly overwriting previous failures. Added `successfulAttempt` property to clearly identify which retry resolved the issue.
*   **Zero Data-Loss Persistence**: Telemetry updates are now flushed to Supabase immediately after an attempt fails or succeeds, *before* the jittered exponential backoff sleep. If the Render container crashes during a backoff window, exact progress is preserved.
*   **Schema Cache & NOT NULL Fixes**: Solved catastrophic job submission failures by migrating missing columns (`num_clips`, `video_url`) into the cloud database and modifying `queueService.ts` to supply both `video_url` and `youtube_url` to satisfy strict Postgres `NOT NULL` constraints.

### Active Working Files:
*   `apps/api/src/workers/videoWorker.ts`
*   `apps/api/src/services/queueService.ts`
*   `apps/api/src/services/download/DownloadEngine.ts`
*   `supabase/migrations/20260703000000_v9_retry_trigger.sql` (and recent patches)
*   `apps/api/src/workers/renderWorker.ts`
*   `apps/api/src/services/supabaseService.ts`

---

## 🏗 Core Production Architecture

### 1. Root Orchestration & Workers
The previous monolithic `viral_pipeline.py` has been superseded by a robust, TypeScript-driven distributed worker model running in Docker on Render:
*   **`videoWorker.ts`**: Handles heavy analysis, transcription, intelligence scoring, and crop planning. Manages jittered exponential backoff and tracks granular retry telemetry.
*   **`renderWorker.ts`**: Dedicated to FFmpeg video manipulation and final clip assembly.
*   **`voiceoverWorker.ts`**: Independent subsystem handling AI voiceover generation and audio-merging.

### 2. Queue Architecture & Database
The queue system relies on a resilient, Supabase-backed persistent queue model:

**Current Database Tables:**
*   `jobs` (Primary analysis/clip generation queue)
*   `render_jobs` (Dedicated rendering queue)
*   `clips` (Generated short-form assets)
*   `voiceover_clips` (Generated audio/video voiceover assets)
*   `voiceover_feedback` (User feedback dataset for future RLHF/training)
*   `video_analysis_cache` (High-efficiency caching layer)
*   `render_cache`

### 3. Reliability Layer
We have built core infrastructure to ensure production resilience without manual intervention:
*   **ZombieSweeperService**: Reclaims dead or stalled jobs.
*   **StorageIntegrityMonitor**: Verifies S3/Supabase storage health.
*   **Heartbeat Monitor**: Tracks worker vitality.
*   **AI Health Check**: Verifies LLM API status before triggering heavy jobs.
*   **Queue Health Audit**: Prevents bottlenecking.

### 4. AI Provider Stack (Multi-Key Rotation)
To prevent quota exhaustion and ensure reliability, the AI layer implements an automated fallback and rotation system:
```text
Gemini Pool (Primary)
       ↓
     Retry
       ↓
Groq (Secondary / Fast)
       ↓
     Retry
       ↓
Ollama (Local Fallback)
       ↓
Analysis Cache
```

### 5. Analysis Cache (`video_analysis_cache`)
One of the most important optimization systems. Before hitting external APIs, the system checks the cache for:
*   `raw_analysis`, `candidate_moments`, `render_plans`
*   `provider` / `latency` / `cache_version`

---

## 🔗 Subsystems & Pipelines

### 1. The Main Video Pipeline
The real production flow resembles this robust sequence:
```text
queued -> processing -> (Retry 1..Max) -> completed/failed
```
**Internal Pipeline:**
```text
YouTube Download -> Audio Verification -> Transcription
      ↓
AI Health Check -> Category Detection -> Story Detection
      ↓
Football Intelligence -> Ranking -> Crop Planner
      ↓
Caption Generation -> Thumbnail Engine -> Render
      ↓
Upload -> Storage Verification -> Dashboard
```

### 2. The Voiceover Pipeline
An entirely independent subsystem designed for rapid audio variation:
```text
Dashboard Clip -> Create Voiceover (Custom/AI/Transcript)
      ↓
TTS (Google/OpenAI/ElevenLabs)
      ↓
FFmpeg Audio Replacement
      ↓
Upload (voiceover_clips table)
      ↓
Voiceover Gallery
```

---

## 🧪 Generation Truth Tests & Verification
The following documents are now part of the project's strict verification process. Refer to these logs to understand systemic health:
*   `Generation Truth Test V3`
*   `PV-1` & `PV-2` Production Operational Validation (Render Cloud)
*   `Queue Health Report`
*   `Zombie Recovery Report`
*   `Storage Integrity Report`
*   `Voiceover Truth Test`

---
## 🐛 Production Issues & Resolutions (July 2026)
1. **[RESOLVED] State Machine Transition Error**: Jobs were stalling at 10-16% due to an `Invalid transition from processing to recovering` or `queued`. Fixed by implementing Option B: keeping jobs in `processing` and tracking retry mechanics internally within the worker (`JobAttempt` telemetry).
2. **[RESOLVED] Schema Column `NOT NULL` Violations**: Fixed database schema mismatches where the remote Supabase cache rejected jobs missing `youtube_url` and `num_clips`. Corrected both the Supabase schema and `queueService.ts` insertion payloads.

## 🚀 Recent Session Summary (August 2026)
* **Local Launch**: The frontend and backend API (`apps/api`) were successfully launched locally. The API runs on port 3001 and successfully connects to the Supabase database.
* **Clip Generation Pipeline**: Reviewed the codebase related to video clip generation, particularly `apps/api/src/workers/videoWorker.ts` and `apps/api/src/services/video/VideoProcessor.ts`. The pipeline's logic (download, analyze, generate render plans, and execute FFmpeg commands) appears intact.

---
*Note for AI Agents: When starting a new task, refer to this file first to understand the boundaries and roles of the system's files. It represents the ultimate ground truth of the production architecture.*
