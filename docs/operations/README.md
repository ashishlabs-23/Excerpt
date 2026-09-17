---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Operations & Production Index

This directory contains the operational runbooks, retention specifications, monitoring configurations, and worker architectures for running Excerpt in production.

---

## 🛠️ Operations Specifications

| Document | Focus | Scope |
| :--- | :--- | :--- |
| [`RETENTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RETENTION.md) | Storage Retention & Reconciliation | Frozen `RetentionService` contract, B2 version purge, TOCTOU safety |
| [`RUNBOOKS.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RUNBOOKS.md) | Incident Response Runbooks | Remediation for stalled jobs, disk saturation, and transcode crashes |
| [`MONITORING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/MONITORING.md) | Metrics & Probes | Winston structured logging, liveness/readiness probes, error alerts |
| [`QUEUES_AND_WORKERS.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/QUEUES_AND_WORKERS.md) | Worker Concurrency & Claiming | Atomic database task claiming, heartbeat intervals, process limits |
| [`BACKUP_AND_RECOVERY.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/BACKUP_AND_RECOVERY.md) | Disaster Recovery & Backups | PostgreSQL PITR, object store durability, and recovery drills |
| [`TECHNICAL_DEBT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/TECHNICAL_DEBT.md) | Engineering Debt Register | Prioritized technical debt ledger, impact analysis, scheduled cleanup |
