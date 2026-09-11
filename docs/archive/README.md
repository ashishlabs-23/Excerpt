# Excerpt Archive Ledger

This index catalogs historical investigations, audits, milestone reports, and superseded architectural documents retained for institutional knowledge.

> **Retention Principle**: Delete documentation only when its information is fully represented by current code/tests and it has no historical, operational, or architectural value.

---

## 🔍 Forensic Investigations (`docs/archive/forensic/`)

| Document | Date | Reason Retained | Related Code / Architecture | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`clip_generation_forensic_audit.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/clip_generation_forensic_audit.md) | 2026-07 | Comprehensive root-cause audit of clipping pipeline bottlenecks, process lifecycle leaks, and memory thrashing. | `apps/api/src/workers/videoWorker.ts`, `clipping-core` | **Archived Reference** |
| [`RETENTION_FORENSIC_AUDIT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/RETENTION_FORENSIC_AUDIT.md) | 2026-07 | Forensic analysis of user retention, editor preference loop, and active learning queues. | `apps/web/src/components/editor/PairwiseReview.tsx` | **Archived Reference** |
| [`generationMode_trace.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/generationMode_trace.md) | 2026-07 | Trace analysis across generation modes and execution paths through the pipeline. | `packages/clipping-core/src/job/types.ts` | **Archived Reference** |

---

## 🏆 Milestone Reports (`docs/archive/milestones/`)

| Document | Date | Reason Retained | Related Code / Architecture | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`END_TO_END_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/milestones/END_TO_END_ACCEPTANCE_REPORT.md) | 2026-06 | Historical end-to-end acceptance test run validating baseline pipeline generation. | `apps/api/src/tests/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/milestones/FRONTEND_CLIP_GEN_ACCEPTANCE_REPORT.md) | 2026-06 | Frontend clip generation workflow acceptance test outcomes and state transition validation. | `apps/web/src/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/milestones/FRONTEND_CLIP_GEN_PERFORMANCE_REPORT.md) | 2026-06 | Initial frontend UI latency, interaction benchmarks, and render profiling. | `apps/web/src/` | **Archived Milestone** |
| [`FRONTEND_CLIP_GEN_STATE_COVERAGE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/milestones/FRONTEND_CLIP_GEN_STATE_COVERAGE.md) | 2026-06 | State machine coverage analysis for clip generation modals and progress components. | `apps/web/src/` | **Archived Milestone** |
| [`PERFORMANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/milestones/PERFORMANCE_REPORT.md) | 2026-06 | Early system-wide throughput and latency baseline measurements. | `apps/api/` | **Archived Milestone** |

---

## 📦 Superseded Documents (`docs/archive/superseded/`)

| Document | Date | Reason Retained | Related Code / Architecture | Status |
| :--- | :--- | :--- | :--- | :--- |
| *(None currently)* | — | Revisions that have been completely superseded by newer active specifications will be logged here. | — | — |
