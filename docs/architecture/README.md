# Excerpt Architecture Index

This directory contains the authoritative architecture baselines, pipeline lifecycle specifications, and UI interaction contracts for Excerpt.

---

## 🏛️ Architecture Specifications

- [`CLIP_PIPELINE_CURRENT_STATE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/CLIP_PIPELINE_CURRENT_STATE.md)  
  High-level end-to-end architecture of the clip extraction pipeline, BullMQ queue topology, and stage boundaries.
- [`CORE_PIPELINE_BASELINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/CORE_PIPELINE_BASELINE.md)  
  Canonical engineering baseline defining pipeline throughput, StageExecutor interfaces, and deterministic clipping guarantees.
- [`FRONTEND_CURRENT_STATE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/FRONTEND_CURRENT_STATE.md)  
  Next.js frontend architecture, state synchronization, SSE progress listeners, and clip preview playback.
- [`FRONTEND_UI_CONTRACTS.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/FRONTEND_UI_CONTRACTS.md)  
  Component-level interaction contracts and WebSocket/SSE event payloads for real-time video processing updates.
- [`SAFETY_AND_OBSERVABILITY_BASELINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/SAFETY_AND_OBSERVABILITY_BASELINE.md)  
  Structured logging, healthcheck probes, process lifecycle kill guarantees, and error isolation taxonomy.
