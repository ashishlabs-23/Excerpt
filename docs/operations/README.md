---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Operations & Production Index

This directory contains the operational runbooks, retention specifications, and monitoring configurations for running Excerpt in production.

---

## 🛠️ Operations Specifications

| Document | Focus | Scope |
| :--- | :--- | :--- |
| [`RETENTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RETENTION.md) | Storage Retention & Reconciliation | Frozen `RetentionService` contract, B2 version purge, TOCTOU safety |
| [`MONITORING.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/MONITORING.md) | Metrics & Probes | Winston structured logging, liveness/readiness probes, error alerts |
| [`RUNBOOKS.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RUNBOOKS.md) | Incident Response Runbooks | Remediation for stalled jobs, disk saturation, and disaster recovery |
