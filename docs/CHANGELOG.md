---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Changelog

All notable changes to this project will be documented in this file.
We adhere to Semantic Versioning.

## [2.0.0] - 2026-07-06
### Added
- **Infrastructure Freeze Phase Initiated**: Transitioned to operational maturity.
- **Enterprise Operations Architecture**: Added `/api/system/health`, `/api/system/live`, and `/api/system/self-test`.
- **Deployment Verification CI**: Added a deterministic polling workflow (`deploy-verification.yml`) that verifies live commits and dependency health before declaring a deployment successful.
- **Metrics Aggregation**: Created `system_metrics_daily` and `system_events` tables in Supabase for daily telemetry rollups and operational events tracking.
- **Comprehensive Runbooks**: Added `ARCHITECTURE.md`, `OPERATIONS.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, `DISASTER_RECOVERY.md`, `SECURITY.md`, and `API.md`.
- **Dashboard Telemetry**: Integrated `DeploymentMetadataCard` into the Operations Dashboard.

### Changed
- Refactored health checks to prevent overlapping logic. Liveness check is now instantly responsive without querying the database.
- CI workflows split into independent, isolated concerns (`build.yml`, `security.yml`, `production-verification.yml`).
