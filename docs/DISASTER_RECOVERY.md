---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Disaster Recovery

This document outlines the Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) for the Excerpt platform, and provides actionable steps to recover the system during severe outages.

## Objectives

| Component  | RTO    | RPO   |
| ---------- | ------ | ----- |
| API        | 15 min | 0     |
| Supabase   | 1 hr   | 5 min |
| B2 Storage | 2 hr   | 0     |
| Dashboard  | 15 min | 0     |

## Recovery Procedures

### Restoring Supabase from Backup
1. Navigate to the Supabase Project Dashboard -> **Database** -> **Backups**.
2. Select the most recent successful Point-in-Time Recovery (PITR) snapshot (typically within the last 5 minutes).
3. Initiate restore.
4. *Note: Running jobs during the 5-minute RPO window may be lost. The API workers will automatically resync state upon reconnection.*

### Recovering B2 Assets
1. B2 is configured with object versioning and cross-region replication (if enabled).
2. If primary bucket is unavailable, update `B2_BUCKET_NAME` and `B2_ENDPOINT` in Render environment variables to point to the replica bucket.
3. Trigger a manual deployment to restart the API.

### Redeploying Render Services
1. If Render experiences a regional outage, switch to the fallback region in the Render Dashboard.
2. Ensure environment variables are synchronized.
3. Click "Manual Deploy" -> "Clear build cache & deploy".

### Re-running Migrations Safely
If a migration fails mid-deployment:
1. Connect via `psql` to Supabase.
2. Inspect the `supabase_migrations.schema_migrations` table to find the stuck migration.
3. Fix the state locally, and re-run `npx supabase db push`.

### Recovering Stuck Queues
1. If jobs are stuck in `processing` (e.g. worker died without failing the job):
2. Update all stuck jobs back to `queued`:
   ```sql
   UPDATE jobs SET status = 'queued', retry_count = retry_count + 1 
   WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '30 minutes';
   ```
3. Workers will automatically claim them on their next poll.
