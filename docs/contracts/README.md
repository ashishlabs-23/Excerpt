---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# Excerpt Canonical Stage Contracts

This directory contains the canonical stage contracts for the Excerpt clipping pipeline.

> [!IMPORTANT]
> **Contract Policy**: Stage contracts define **what each subsystem guarantees**. They explain invariants, operational rules, domain rationale, or failure boundary conditions that cannot be expressed via TypeScript types alone. Do not put benchmark results here.

---

## 📋 Canonical Stage Contracts Matrix

```text
Perception → Candidate Generation → Ranking → Director
   → Caption Plan → Render Plan → Render Engine → Delivery → Validation → Recovery
```

| Stage / Area | Contract Document | Corresponding Code / Interfaces | Key Invariant / Boundary Guarantee |
| :--- | :--- | :--- | :--- |
| **Ingestion** | [`INGESTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/INGESTION.md) | `packages/clipping-core/src/ingestion` | Shared immutable source artifact caching, Content-hash (SHA256) verification. |
| **Perception** | [`PERCEPTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/PERCEPTION.md) | `packages/clipping-core/src/perception` | Memory-piped frame streaming, strict PTS alignment, bounded RSS, normalized coordinates. |
| **Candidate Gen** | [`CANDIDATE_GENERATION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/CANDIDATE_GENERATION.md) | `packages/clipping-core/src/candidate-generation` | Bounded candidate window generation, minimum hook criteria, non-overlapping windows. |
| **Ranking** | [`RANKING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RANKING.md) | `packages/clipping-core/src/ranking` | Multi-criteria scoring, editorial safety guards, diversity deduplication, top-K selection. |
| **Director** | [`DIRECTOR.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/DIRECTOR.md) | `packages/clipping-core/src/director` | Dynamic crop trajectory, Feasible Crop Region $[y_{\min}, y_{\max}]$, $\ge 5\%$ headroom, lower $22\%$ subtitle clearance, 4-state camera arbitration (`HOLD`, `TRACK`, `PAN`, `CUT`). |
| **Caption Plan** | [`CAPTION_PLAN.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/CAPTION_PLAN.md) | `packages/clipping-core/src/captions` | Word-level timing synchronization, subtitle line bounding, kinetic style tags. |
| **Render Plan** | [`RENDER_PLAN.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RENDER_PLAN.md) | `packages/clipping-core/src/render-plan` | `renderJobs.length === acceptedCandidates.length`, filtergraph immutability. |
| **Render Engine** | [`RENDER_ENGINE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RENDER_ENGINE.md) | `apps/api/src/workers/renderWorker.ts` | Process tree killing, event-driven async fan-in, hardware acceleration fallbacks. |
| **Delivery** | [`DELIVERY.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/DELIVERY.md) | `packages/clipping-core/src/delivery` | Final package checksumming, multi-destination upload guarantees. |
| **Validation** | [`VALIDATION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/VALIDATION.md) | `packages/clipping-core/src/validation` | Output video audio-sync integrity, format checks, stream sanity validations. |
| **Recovery** | [`RECOVERY.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RECOVERY.md) | `packages/clipping-core/src/recovery` | Crash-recovery idempotency, checkpoint resume semantics. |

---

> [!NOTE]
> Superseded contracts (`COORDINATOR_CONTRACT.md`, `UNDERSTANDING_CONTRACT.md`, `V5_7_REWARD_MODEL_CONTRACT.md`, `EVALUATION_CONTRACT.md`) have been archived to [`docs/archive/superseded/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/superseded/).
