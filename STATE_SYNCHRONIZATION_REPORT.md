# Phase C: STATE SYNCHRONIZATION REPORT

This audit maps the flow of state across the API, Worker, Database, and Gallery, identifying points of potential divergence and data loss.

## The State Lifecycle

1. **Submission**: API creates job in DB `status='queued'` and mirrors to in-memory `jobState`.
2. **Polling**: Worker grabs job from Supabase by updating `status='processing'` (optimistic locking).
3. **Execution**: Worker updates both Memory and DB incrementally (`transcribing`, `detecting_clips`, `cutting`).
4. **Completion**: Worker updates DB with `status='completed'`, and inserts rows into `clips` table.
5. **Consumption**: Gallery (`/api/video/clips`) fetches directly from `clips` table.

## Identified Divergence Risks

### Risk 1: Worker Crash / Zombie Lock
* **Scenario**: Worker pulls a job and sets `status='processing'`. The worker process crashes (OOM, FFmpeg segfault, or manual kill) before reaching `completed` or `failed`.
* **Consequence**: The job remains stuck in `processing` in the database indefinitely.
* **Severity**: `High` (Job hangs, user sees perpetual loading).

### Risk 2: In-Memory vs. Database Status Tear
* **Scenario**: The API `queueService.ts` maintains an in-memory `jobState`. If the API and Worker run in separate Node processes (as they often do in production), `queueService.updateJobStatus` only updates memory in *its own process*, not the other. 
* **Consequence**: `getJobStatus()` has complex merge logic trying to prefer DB terminal states over Memory, but if the API memory state is stale, race conditions could cause the API to report incorrect progress percentages.
* **Severity**: `Medium` (UI glitch, resolves on completion).

### Risk 3: Clip Creation vs. Job Completion Race Condition
* **Scenario**: Worker successfully generates 3 MP4s and writes 3 rows to `clips`. It then crashes right before updating the job to `status='completed'`.
* **Consequence**: The gallery will display the 3 clips (because it queries `clips` table directly), but the Job dashboard will show the job as `processing` or `failed`.
* **Severity**: `Medium` (Data inconsistency).

### Risk 4: External URL Expiration
* **Scenario**: A job is submitted with a signed or temporary URL (e.g., from an S3 bucket with a 1-hour expiration). The queue backs up, and the worker doesn't pick it up until 2 hours later.
* **Consequence**: `ytdlp` or native fetch fails with a 403.
* **Severity**: `Low` (Recovers via user retry, but bad UX).
