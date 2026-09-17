---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# ADR-001: Retained Worker & Queue Architecture

## Status
**ACCEPTED** (2026-09-10)

## Context
During initial scaling and concurrency evaluations, introducing an external distributed queue layer (such as Redis-backed BullMQ or Temporal) was evaluated to orchestrate video worker jobs and render tasks.

However, comprehensive empirical soak and concurrency testing (`benchmarks/reports/soak/CONCURRENCY_SOAK_REPORT.md` and `P3_1_CONCURRENCY_SCORECARD.md`) revealed that the existing process worker and database-backed claiming model handled concurrent video transcoding and pipeline stages with minimal queue wait latency.

## Decision
**The current worker/queue architecture is retained.**

The system will continue using its native worker architecture (`videoWorker`, `renderWorker`) and Supabase database-backed claiming semantics rather than adding an external orchestration layer at this time.

## Reason
Existing empirical concurrency testing did not demonstrate a queue bottleneck large enough to justify the operational complexity, hosting cost, and failure modes of maintaining a dedicated Redis/BullMQ or Temporal cluster.

## Alternatives Considered
1. **BullMQ + Redis Cluster**:
   - *Rejected*: Adds stateful infrastructure and serialization overhead without fixing CPU/GPU-bound media encoding bottlenecks.
2. **Temporal Workflow Engine**:
   - *Rejected*: Massive overhead for pipeline graphs whose stages are already linear and checkpointed.

## Future Migration Trigger
A migration to a distributed queue system (such as BullMQ) will be triggered **only when measured production workloads demonstrate queue wait times, task loss, or horizontal multi-node dispatch requirements that the current implementation cannot provide.**

## Consequences
- **Positive**: Zero additional stateful infrastructure dependencies to operate; lower operational surface area.
- **Negative**: Workers run within existing node process limits; multi-node distribution requires explicit worker pool registration.
