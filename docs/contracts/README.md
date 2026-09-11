# Excerpt Canonical Stage Contracts

This directory contains the canonical stage contracts for the Excerpt clipping pipeline.

> **Contract Policy**: Stage contracts are retained in Markdown **only** when they explain invariants, operational rules, domain rationale, or failure boundary conditions that cannot be expressed via TypeScript types alone.

---

## 📋 Active Stage Contracts Matrix

| Stage / Area | Contract Document | Corresponding Code / Interfaces | Key Invariant / Boundary Guarantee |
| :--- | :--- | :--- | :--- |
| **Ingestion** | [`INGESTION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/INGESTION_CONTRACT.md) | `packages/clipping-core/.../ingestion` | Shared immutable source artifact caching, Content-hash verification. |
| **Perception** | [`PERCEPTION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/PERCEPTION_CONTRACT.md) | `packages/clipping-core/.../perception` | Zero-disk memory-piped frame streaming, strict PTS alignment, bounded RSS. |
| **Understanding** | [`UNDERSTANDING_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/UNDERSTANDING_CONTRACT.md) | `packages/clipping-core/.../understanding` | Multi-modal semantic context fusion and transcript chunk alignment. |
| **Candidate Gen** | [`CANDIDATE_GENERATION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/CANDIDATE_GENERATION_CONTRACT.md) | `packages/clipping-core/.../candidate-generation` | Bounded candidate window generation, minimum hook criteria, non-overlapping windows. |
| **Evaluation** | [`EVALUATION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/EVALUATION_CONTRACT.md) | `packages/clipping-core/.../evaluation` | Multi-criteria scoring, editorial safety guards, minimum engagement floor. |
| **Ranking** | [`RANKING_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RANKING_CONTRACT.md) | `packages/clipping-core/.../ranking` | Bradley-Terry tournament ranking, diversity deduplication, top-K selection. |
| **Reward Model** | [`V5_7_REWARD_MODEL_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/V5_7_REWARD_MODEL_CONTRACT.md) | `apps/api/scripts/reward_model.py` | V5.7 weights, feature vector normalization, pairwise training protocol. |
| **Director** | [`DIRECTOR_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/DIRECTOR_CONTRACT.md) | `packages/clipping-core/.../director` | Dynamic crop target trajectory, speaker active-camera tracking, 9:16 framing. |
| **Caption Plan** | [`CAPTION_PLAN_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/CAPTION_PLAN_CONTRACT.md) | `packages/clipping-core/.../captions` | Word-level timing synchronization, subtitle line bounding, kinetic style tags. |
| **Render Plan** | [`RENDER_PLAN_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RENDER_PLAN_CONTRACT.md) | `packages/clipping-core/.../render-plan` | `renderJobs.length === acceptedCandidates.length`, filtergraph immutability. |
| **Render Engine** | [`RENDER_ENGINE_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RENDER_ENGINE_CONTRACT.md) | `apps/api/src/workers/renderWorker.ts` | Process tree killing, event-driven async fan-in, hardware acceleration fallbacks. |
| **Validation** | [`VALIDATION_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/VALIDATION_CONTRACT.md) | `packages/clipping-core/.../validation` | Output video audio-sync integrity, format checks, stream sanity validations. |
| **Delivery** | [`DELIVERY_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/DELIVERY_CONTRACT.md) | `packages/clipping-core/.../delivery` | Final package checksumming, multi-destination upload guarantees. |
| **Coordinator** | [`COORDINATOR_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/COORDINATOR_CONTRACT.md) | `packages/clipping-core/.../executor` | Stage transition rules, partial-failure boundaries, heartbeat timeouts. |
| **Recovery** | [`RECOVERY_ENGINE_CONTRACT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/RECOVERY_ENGINE_CONTRACT.md) | `packages/clipping-core/.../recovery` | Crash-recovery idempotency, checkpoint resume semantics. |
