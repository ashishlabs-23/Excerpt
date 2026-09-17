---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Operational Runbooks

Standard Operating Procedures (SOP) for on-call engineers responding to production alerts, job stalls, storage flushes, and disaster recovery.

---

## 1. Stuck / Stalled Job Remediation

### Symptoms
A parent job remains in `processing` state for $> 30\text{ minutes}$ with no heartbeat update in Supabase.

### Triage & Resolution
1. Query stalled jobs in PostgreSQL:
   ```sql
   SELECT id, status, updated_at FROM jobs 
   WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '30 minutes';
   ```
2. Inspect worker logs for the specific `jobId` to identify hanging subprocesses:
   ```bash
   grep "job_id_here" /var/log/excerpt/api.log
   ```
3. Mark stalled jobs as `failed:timeout` or trigger automatic retry:
   ```sql
   UPDATE jobs SET status = 'failed:timeout', error_message = 'Job heartbeat expired' 
   WHERE id = 'job_id_here';
   ```

---

## 2. Disk Space Emergency Flush

### Symptoms
Alert fires indicating NVMe scratch disk usage $> 85\%$.

### Triage & Resolution
1. Check scratch space usage:
   ```bash
   df -h /tmp/excerpt
   ```
2. Manually trigger cache cleanup for files older than 24 hours:
   ```bash
   find apps/api/temp/ -type f -mtime +1 -delete
   ```
3. Run an emergency retention dry run to verify candidate deletions:
   ```bash
   npm run sweep:retention
   ```

---

## 3. Database Recovery & Migration Rollback

### Point-in-Time Recovery (PITR)
1. Restore database snapshot via Supabase Console to target recovery timestamp.
2. Verify table integrity:
   ```sql
   SELECT count(*) FROM jobs;
   SELECT count(*) FROM clips;
   ```
3. Reapply migrations if needed:
   ```bash
   npx supabase db push
   ```
