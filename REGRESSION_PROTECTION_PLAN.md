# Phase C (Cont.): REGRESSION PROTECTION PLAN

To completely immunize Excerpt against the state synchronization risks identified, the following mitigations should be implemented.

## 1. Zombie Job Sweeper (Cron)
**Risk Mitigated**: Worker Crash / Zombie Lock
**Implementation**: 
* Add a `last_heartbeat` timestamp column to `jobs`.
* Worker updates `last_heartbeat` every 10 seconds during `processing`.
* A CRON job (e.g., `apps/api/src/cron/zombieSweeper.ts`) runs every 5 minutes:
  `UPDATE jobs SET status='dead_letter' WHERE status='processing' AND last_heartbeat < NOW() - 5 minutes`

## 2. Distributed State over Local Memory
**Risk Mitigated**: In-Memory vs Database Status Tear
**Implementation**:
* Deprecate the in-memory object `jobStatuses` in `queueService.ts`.
* Since Supabase has Realtime (WebSockets), the API should simply subscribe to the `jobs` row, or poll the DB directly. Do not attempt to merge local memory with DB state in distributed environments.

## 3. Transactional Job Completion
**Risk Mitigated**: Clip Creation vs Job Completion Race Condition
**Implementation**:
* The final step of `videoWorker.ts` should wrap the clip insertion and job status update in a single Supabase RPC transaction.
* If the clip insert fails, the job status is rolled back to `processing` or `failed`.

## 4. Pre-Signed URL Caching Strategy
**Risk Mitigated**: External URL Expiration
**Implementation**:
* If a URL is signed and time-sensitive, the `api/video/upload` endpoint should instantly pipe the stream to a temporary Supabase bucket (`raw-ingest`), and enqueue the Supabase bucket URL instead of the external URL.
