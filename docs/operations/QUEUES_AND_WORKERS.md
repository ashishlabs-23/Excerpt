---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Queues & Worker Architecture

This document specifies the internal worker dispatch mechanism, task claiming protocols, and concurrency limits.

---

## 1. Concurrency Model

Excerpt uses a decoupled worker process model:

- **`videoWorker`**:
  - Handles Stages 0 through 6 (Ingestion, Transcription, Perception, Candidate Generation, Director, RenderPlan).
  - Default Concurrency: 2 concurrent long-form videos per 4-core worker container.
  - Resource Bound: Bounded memory stream piping ($\le 512\text{ MB}$ RSS per active worker).
- **`renderWorker`**:
  - Handles Stages 7 and 8 (FFmpeg filtergraph rendering, ASS subtitle burn-in, B2 upload).
  - Default Concurrency: 4 concurrent clip renders per GPU/CPU node.
  - Resource Bound: FFmpeg process group restricted to 1 CPU thread per job if running CPU-only.

---

## 2. Worker Lifecycle & Atomic Claiming

1. Worker initiates a polling transaction with `FOR UPDATE SKIP LOCKED`.
2. Job status transitions atomically from `pending` $\to$ `processing`.
3. Heartbeat timestamp updated every 30 seconds.
4. On task completion, status transitions to `completed` and child render jobs are dispatched.
5. On crash or container kill, the un-heartbeated job is released for recovery according to [`docs/contracts/RECOVERY.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RECOVERY.md).
