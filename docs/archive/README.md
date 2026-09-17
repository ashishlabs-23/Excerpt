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

## 🏆 Historical Milestones, Acceptance & Research (`docs/archive/historical/`)

| Document | Date | Reason Retained | Related Domain | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`CAPTION_SYNC_ACCEPTANCE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/CAPTION_SYNC_ACCEPTANCE.md) | 2026-09 | Detailed acceptance sign-off for Whisper word-level timing synchronization. | Testing | **Archived Acceptance** |
| [`LONG_FORM_ACCEPTANCE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/LONG_FORM_ACCEPTANCE.md) | 2026-09 | Detailed acceptance sign-off for long-form video transcode duration. | Testing | **Archived Acceptance** |
| [`BENCHMARKING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/BENCHMARKING.md) | 2026-09 | Early benchmark methodology specification. | Testing | **Archived Reference** |
| [`FRAMING_RESEARCH.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRAMING_RESEARCH.md) | 2026-09 | Research on AutoFlip, Feasible Crop Regions, and 4-state camera arbitration. | Research | **Archived Research** |
| [`EXTERNAL_DEPENDENCIES.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/EXTERNAL_DEPENDENCIES.md) | 2026-09 | Audit of external dependencies (FFmpeg, yt-dlp, Whisper, Supabase). | Research | **Archived Research** |
| [`REPOSITORY_DEPENDENCIES.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/REPOSITORY_DEPENDENCIES.md) | 2026-09 | Internal package coupling audit. | Research | **Archived Research** |
| [`BACKUP_AND_RECOVERY.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/BACKUP_AND_RECOVERY.md) | 2026-09 | Early backup topology notes (consolidated into operational runbooks). | Operations | **Archived Reference** |
| [`QUEUES_AND_WORKERS.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/QUEUES_AND_WORKERS.md) | 2026-09 | Worker dispatch notes (consolidated into architecture and runbooks). | Operations | **Archived Reference** |
| [`TECHNICAL_DEBT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/TECHNICAL_DEBT.md) | 2026-09 | Historical Post-P0 technical debt ledger. | Operations | **Archived Reference** |
| [`END_TO_END_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/END_TO_END_ACCEPTANCE_REPORT.md) | 2026-06 | Historical end-to-end acceptance test run validating baseline pipeline generation. | Testing | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md) | 2026-06 | Frontend clip generation workflow acceptance test outcomes. | Frontend | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md) | 2026-06 | Initial frontend UI latency, interaction benchmarks, and render profiling. | Frontend | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_STATE_COVERAGE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/FRONTEND_CLIP_GEN_STATE_COVERAGE.md) | 2026-06 | State machine coverage analysis for clip generation modals. | Frontend | **Archived Milestone** |
| [`PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/historical/PERFORMANCE_REPORT.md) | 2026-06 | Early system-wide throughput and latency baseline measurements. | Testing | **Archived Milestone** |

---

## 📦 Superseded Contracts & Specifications (`docs/archive/superseded/`)

| Document | Date | Reason Retained | Superseded By | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`COORDINATOR_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/COORDINATOR_CONTRACT.md) | 2026-07 | Early monolithic coordinator specification before queue isolation. | [`docs/architecture/PIPELINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/PIPELINE.md) | **Superseded** |
| [`UNDERSTANDING_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/UNDERSTANDING_CONTRACT.md) | 2026-07 | Multi-model video understanding contract superseded by canonical Perception contract. | [`docs/contracts/PERCEPTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/PERCEPTION.md) | **Superseded** |
| [`V5_7_REWARD_MODEL_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/V5_7_REWARD_MODEL_CONTRACT.md) | 2026-07 | Early pairwise preference heuristic weights replaced by standard Ranking contract. | [`docs/contracts/RANKING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RANKING.md) | **Superseded** |
| [`EVALUATION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/EVALUATION_CONTRACT.md) | 2026-07 | Redundant evaluation interface superseded by Validation contract and Testing gates. | [`docs/contracts/VALIDATION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/VALIDATION.md) | **Superseded** |
