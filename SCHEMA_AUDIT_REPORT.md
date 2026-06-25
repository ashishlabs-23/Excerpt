# SCHEMA AUDIT REPORT

```json
{
  "tables": {
    "jobs": "ERROR: Could not find the table 'public.jobs' in the schema cache",
    "clips": "ERROR: Could not find the table 'public.clips' in the schema cache",
    "render_jobs": "ERROR: Could not find the table 'public.render_jobs' in the schema cache",
    "render_cache": "ERROR: Could not find the table 'public.render_cache' in the schema cache",
    "worker_heartbeats": "ERROR: Could not find the table 'public.worker_heartbeats' in the schema cache"
  },
  "columns": {
    "jobs.debug_data": "MISSING OR ERROR",
    "jobs.generation_mode": "MISSING OR ERROR"
  },
  "rpcs": {
    "claim_next_job": "MISSING",
    "claim_next_render_job": "MISSING"
  }
}
```
