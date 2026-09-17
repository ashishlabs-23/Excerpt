---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# ADR-002: Supabase Persistence and State Coordination

## Status
**ACCEPTED** (2026-08-20)

## Context
Excerpt requires durable state tracking for parent jobs, child clip render tasks, user accounts, and billing quotas. Workers must claim tasks concurrently without race conditions (TOCTOU) or split-brain job processing.

## Decision
Use PostgreSQL (via Supabase) as the canonical system of record for job states, clip records, and worker coordination.

Worker coordination utilizes database transactions and row-level locking (`FOR UPDATE SKIP LOCKED`) for atomic task claiming.

## Alternatives Considered
- Direct Redis memory locks: Lack durability across container restarts.
- DynamoDB / NoSQL: Less expressive query semantics for complex foreign-key relational models (jobs $\to$ clips $\to$ renders $\to$ retention logs).

## Consequences
- **Positive**: Strict ACID guarantees, row-level security (RLS) out of the box for frontend queries, instant auditability.
- **Negative**: Requires careful indexing on job status and worker assignment columns to prevent lock contention under high volume.
