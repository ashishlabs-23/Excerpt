---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Runtime Architecture

This document describes the runtime execution model, process boundaries, frontend interaction, and worker orchestration.

---

## 1. Process & Service Topology

```text
[ Browser / Client ]
       │
       │ HTTPS / SSE
       ▼
[ apps/web (Next.js 14) ]
       │
       │ REST / Supabase Client
       ▼
[ apps/api (Node.js / Express) ]
       │
       ├── Background Workers:
       │     ├── videoWorker (Long-running extraction & perception stages)
       │     └── renderWorker (FFmpeg rendering & compositing tasks)
       │
       ├── State Database:
       │     └── Supabase PostgreSQL (Job state, Clips, RLS policies)
       │
       └── Object Storage:
             └── Backblaze B2 (Raw source cache & rendered MP4 delivery)
```

---

## 2. Worker Lifecycle & Process Safety

- **Process Isolation**: FFmpeg and Whisper instances are spawned as child processes with explicit PID tracking.
- **SIGKILL Watchdogs**: If any transcoding or inference operation exceeds its hard stage timeout, process group termination is executed to guarantee zero orphan processes.
- **Graceful Shutdown**: On `SIGTERM`, workers complete the active frame chunk or checkpoint, update job telemetry to `interrupted`, and release database locks before exiting.

---

## 3. Real-Time Client State Synchronization

The frontend (`apps/web`) receives real-time pipeline status via Server-Sent Events (SSE) and Supabase realtime subscriptions:
- `job_progress`: Incremental percentage updates and active stage labels.
- `candidate_ready`: Early notification of detected clip candidates for user preview.
- `clip_completed`: Signed playback URL delivery upon successful validation.
