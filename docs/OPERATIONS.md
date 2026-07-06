---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Operational Guidelines

This document outlines the standard operating procedures, retention policies, and freeze policies for the Excerpt platform.

## Infrastructure Freeze Policy

As of v2.0, the infrastructure is considered **operationally mature**. We operate under a "freeze" model, meaning changes to the underlying infrastructure (CI/CD, worker orchestration, database structure) must fall into specific categories.

### Emergency Changes (Allowed anytime)
- Security vulnerability patches
- Production outages (P0/P1 incidents)
- Data integrity or corruption issues

### Planned Releases (Scheduled)
- New product features (clip generation tweaks, editing UI)
- Planned refactoring
- Dependency upgrades

## Data Retention Policy

The platform handles significant amounts of large media files and telemetry. To prevent runaway costs, retention policies are strictly enforced:

- **Job Telemetry:** 90 days
- **Worker Logs (Render):** 30 days
- **Metrics Rollups:** 2 years
- **System Events:** 1 year
- **Temporary Artifacts (Disk):** 24 hours (cleanup cron job)
- **Generated Clips (B2):** 30 days

## Dashboard Operations

The primary interface for monitoring the system is the **Operations Dashboard** (`/dashboard`).

- **Pipeline Health:** Real-time state of the job queue.
- **Queue Pressure:** Tracks processing backlog.
- **System Alerts:** Surfaces critical errors from Supabase logs.
- **Deployment Metadata:** Verifies the active commit and API versions.
- **Trend Charts:** (Added in v2) View historical success rates, restarts, and AI fallbacks over a 7-day and 30-day window.
