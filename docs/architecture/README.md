---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Canonical Architecture Index

This directory contains the authoritative architecture specifications, execution baselines, and deployment topology for Excerpt.

---

## 🏛️ Architecture Specifications

| Specification | Focus | Key Topics |
| :--- | :--- | :--- |
| [`SYSTEM_OVERVIEW.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/SYSTEM_OVERVIEW.md) | High-Level Architecture | Probabilistic vs Deterministic realms, monorepo layout, system boundaries |
| [`PIPELINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/PIPELINE.md) | Pipeline Execution Graph | Ingestion $\to$ Delivery stages, error handling, worker ownership |
| [`DATA_FLOW.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/DATA_FLOW.md) | Entity Transformations | Schema progressions, coordinate normalization invariant |
| [`RUNTIME_ARCHITECTURE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/RUNTIME_ARCHITECTURE.md) | Process & Runtime Model | Worker lifecycles, SIGKILL watchdogs, real-time SSE sync |
| [`STORAGE_ARCHITECTURE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/STORAGE_ARCHITECTURE.md) | Storage & Object Topology | NVMe scratch, SHA256 content-addressing, Backblaze B2 layout |
| [`DEPLOYMENT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/DEPLOYMENT.md) | Infrastructure & Containers | Render, Docker, FFmpeg dependencies, Supabase migrations |

---

> [!NOTE]
> Historical greenfield baselines and audits have been archived in [`docs/archive/historical/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/).
