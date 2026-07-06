---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Operational Runbook

This runbook describes standard procedures for responding to alerts, anomalies, and operational incidents.

## Incident: Stuck Queue
**Symptom**: Jobs remain in `queued` state, or `processing` jobs haven't updated in 30+ minutes.
**Action**:
1. Check Render logs for the `excerpt-api` worker to see if it's caught in a crash loop.
2. If the worker is running fine but not picking up jobs, restart the worker container manually in Render.
3. If jobs are stuck in `processing`, run the recovery query (see DISASTER_RECOVERY.md).

## Incident: Worker Crash Loop
**Symptom**: The worker restarts more than 5 times in 2 minutes (caught by WorkerManager).
**Action**:
1. The manager will stop attempting to restart the worker.
2. Check `stderr` logs in Render to identify the missing dependency or syntax error.
3. Roll back the deployment via Render dashboard if caused by a recent release.

## Incident: AI Provider Outage
**Symptom**: `ai_provider_fallbacks` metric spikes, or jobs fail during the "Analyze" phase.
**Action**:
1. Check the status page of the primary AI provider (e.g. Groq).
2. The system should automatically fallback to secondary providers. If the fallback is also failing, you can pause incoming traffic by disabling the upload zone via a feature flag (if implemented).

## Incident: High Storage Cleanup Failures
**Symptom**: `storage_cleanup_failures` metric rises, indicating `temp/` disk space may fill up.
**Action**:
1. SSH / shell into the Render container (if supported, or use a script).
2. Manually clear the `/temp` directory.
3. Check permissions on the worker process.
