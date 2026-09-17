---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Archive Ledger

This index catalogs historical investigations, audits, milestone reports, and superseded architectural documents retained for institutional knowledge.

> [!WARNING]
> **ARCHIVE POLICY: NON-AUTHORITATIVE**  
> Archived documents are never authoritative. They reflect historical state, root-cause forensics, and design milestones. Active contracts live under [`docs/contracts/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/) and active architecture lives under [`docs/architecture/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/).

---

## 🔍 Forensic Investigations (`docs/archive/forensic/`)

| Document | Date | Reason Retained | Related Code / Architecture | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`CAPTION_SYNC_HARDENING_FORENSIC.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/CAPTION_SYNC_HARDENING_FORENSIC.md) | 2026-09 | Forensic investigation of word-level Whisper timestamp drift, silences, and drift compensation. | `packages/clipping-core/src/caption/` | **Archived Reference** |
| [`LONG_FORM_DURATION_FORENSIC.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/LONG_FORM_DURATION_FORENSIC.md) | 2026-09 | Forensic root cause of duration divergence in long-form video transcoding and frame-accuracy. | `apps/api/src/workers/videoWorker.ts` | **Archived Reference** |
| [`clip_generation_forensic_audit.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/clip_generation_forensic_audit.md) | 2026-07 | Comprehensive root-cause audit of clipping pipeline bottlenecks, process lifecycle leaks, and memory thrashing. | `apps/api/src/workers/videoWorker.ts`, `clipping-core` | **Archived Reference** |
| [`RETENTION_FORENSIC_AUDIT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/RETENTION_FORENSIC_AUDIT.md) | 2026-07 | Forensic analysis of user retention, editor preference loop, and active learning queues. | `apps/web/src/components/editor/PairwiseReview.tsx` | **Archived Reference** |
| [`generationMode_trace.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/generationMode_trace.md) | 2026-07 | Trace analysis across generation modes and execution paths through the pipeline. | `packages/clipping-core/src/job/types.ts` | **Archived Reference** |

---

## 🏆 Historical Milestone Reports (`docs/archive/historical/`)

| Document | Date | Reason Retained | Related Code / Architecture | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`END_TO_END_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/END_TO_END_ACCEPTANCE_REPORT.md) | 2026-06 | Historical end-to-end acceptance test run validating baseline pipeline generation. | `apps/api/src/tests/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md) | 2026-06 | Frontend clip generation workflow acceptance test outcomes and state transition validation. | `apps/web/src/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md) | 2026-06 | Initial frontend UI latency, interaction benchmarks, and render profiling. | `apps/web/src/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_STATE_COVERAGE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_STATE_COVERAGE.md) | 2026-06 | State machine coverage analysis for clip generation modals and progress components. | `apps/web/src/` | **Archived Milestone** |
| [`PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/PERFORMANCE_REPORT.md) | 2026-06 | Early system-wide throughput and latency baseline measurements. | `apps/api/` | **Archived Milestone** |

---

## 📦 Superseded Contracts & Specifications (`docs/archive/superseded/`)

| Document | Date | Reason Retained | Superseded By | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`COORDINATOR_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/COORDINATOR_CONTRACT.md) | 2026-07 | Early monolithic coordinator specification before queue isolation. | [`docs/architecture/PIPELINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/PIPELINE.md) | **Superseded** |
| [`UNDERSTANDING_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/UNDERSTANDING_CONTRACT.md) | 2026-07 | Multi-model video understanding contract superseded by canonical Perception contract. | [`docs/contracts/PERCEPTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/PERCEPTION.md) | **Superseded** |
| [`V5_7_REWARD_MODEL_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/V5_7_REWARD_MODEL_CONTRACT.md) | 2026-07 | Early pairwise preference heuristic weights replaced by standard Ranking contract. | [`docs/contracts/RANKING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RANKING.md) | **Superseded** |
| [`EVALUATION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/EVALUATION_CONTRACT.md) | 2026-07 | Redundant evaluation interface superseded by Validation contract and Testing gates. | [`docs/contracts/VALIDATION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/VALIDATION.md) | **Superseded** |
