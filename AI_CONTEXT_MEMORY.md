# AI Context & Memory Bank

> **Goal**: This file acts as a persistent memory and fast-context initialization point for any AI agent interacting with this repository. It provides an immediate overview of the project's current state, recent focus areas, and the core map of files and components, drastically reducing the token cost of context gathering.

## 🚀 Project Overview: Excerpt
**Excerpt** is an AI-driven Video Viralization Engine designed to ingest long-form content and output high-impact, 9:16 short-form clips. It relies on a multi-stage pipeline utilizing LLMs/VLMs for content reasoning and FFmpeg for precise rendering. 

---

## 📊 Project Status
**Production Readiness**
*   **Infrastructure**: 95%
*   **Generation**: 82%
*   **Voiceover**: 95%

**Pending Focus Areas:**
*   AI quota reliability
*   Concurrent load testing

---

## 🧠 Recent Memory & Active Focus (Updated: June 2026)

The development has matured from a Python-scripted prototype into a highly reliable, distributed micro-worker architecture.

### Recent Fixes & Truth Phase Updates (June 2026):
*   **Database Hardening:** Applied `v5_hardening_part4` migration, adding `debug_data`, `performance_metrics`, and `pipeline_summary` to the `jobs` table to unblock the state machine.
*   **Storage Integration:** Backblaze B2 is now fully integrated using a private bucket approach. `@aws-sdk/s3-request-presigner` is used for secure signed URLs, Object Existence Checks, and Bucket Purging in `storageService.ts`, avoiding Supabase storage quotas.
### Active Working Files:
*   `apps/api/src/workers/videoWorker.ts`
*   `apps/api/src/workers/renderWorker.ts`
*   `apps/api/src/workers/voiceoverWorker.ts`
*   `apps/api/src/services/aiService.ts`
*   `apps/api/src/services/StorageIntegrityMonitor.ts`
*   `apps/api/src/services/ZombieSweeperService.ts`
*   `apps/api/src/services/ScriptGenerationService.ts`
*   `apps/api/src/services/VoiceoverService.ts`
*   `apps/web/src/components/RecentClips.tsx`
*   `apps/web/src/components/CreateVoiceoverModal.tsx`

---

## 🏗 Core Production Architecture

### 1. Root Orchestration & Workers
The previous monolithic `viral_pipeline.py` has been superseded by a robust, TypeScript-driven distributed worker model running in Docker:
*   **`videoWorker.ts`**: Handles heavy analysis, transcription, intelligence scoring, and crop planning.
*   **`renderWorker.ts`**: Dedicated to FFmpeg video manipulation and final clip assembly.
*   **`voiceoverWorker.ts`**: Independent subsystem handling AI voiceover generation and audio-merging.

### 2. Queue Architecture & Database
The queue system has moved away from simple Redis-BullMQ to a resilient, Supabase-backed persistent queue model:

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
*   `raw_analysis`
*   `candidate_moments`
*   `render_plans`
*   `provider` / `latency` / `cache_version`

---

## 🔗 Subsystems & Pipelines

### 1. The Main Video Pipeline
The real production flow resembles this robust sequence:
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
*   `Queue Health Report`
*   `Zombie Recovery Report`
*   `Storage Integrity Report`
*   `Voiceover Truth Test`
*   `Football Crop Scorecard`
*   `Caption Audit`
*   `Thumbnail Audit`

---
*Note for AI Agents: When starting a new task, refer to this file first to understand the boundaries and roles of the system's files. It represents the ultimate ground truth of the production architecture.*
