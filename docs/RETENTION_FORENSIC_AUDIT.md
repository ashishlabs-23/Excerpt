# RETENTION FORENSIC AUDIT: 24-HOUR EPHEMERAL STORAGE LIFECYCLE

**Audit Date**: 2026-09-07  
**Severity**: P0 Incident — Production Data Lifecycle Failure  
**Component**: Storage, Database, Workers, Gallery API  

---

## 1. Executive Summary

The Excerpt dashboard prominently advertises:
> **24-HOUR EPHEMERAL STORAGE**: *clips auto-delete daily from cloud storage — please download clips you want to keep!*

**Forensic finding**: **Clips are NEVER deleted from Backblaze B2 cloud storage, nor are expired clips pruned from the local queue or hidden from the gallery.** 
- S3/B2 bucket inspection revealed clips from as early as **July 7, 2026** (two months old) still physically present in the `excerpt-clips` bucket.
- The local queue (`active_queue.json`) contains clips from **September 1, 2026** (6 days old, >140 hours past creation) which are still served to the user in `/api/video/clips`.
- The product promise of 24-hour ephemeral storage is completely broken end-to-end.

---

## 2. Root Cause Analysis: The Broken Retention Chain

The forensic audit traced every step of the retention lifecycle from upload to deletion:

```
[Clip Created & Uploaded to B2]
         │
         ▼
[expires_at NEVER calculated or stored]  ❌ (Root Cause 1)
         │
         ▼
[RetentionService queries .not('expires_at', 'is', null)]  ❌ (Root Cause 2: Returns 0 clips)
         │
         ▼
[StorageService.deleteObjects() NEVER deletes from B2 / S3]  ❌ (Root Cause 3: this.s3 ignored)
         │
         ▼
[Local Queue active_queue.json NEVER swept for expired items]  ❌ (Root Cause 4: Accumulates indefinitely)
         │
         ▼
[GET /api/video/clips has NO expiration filter]  ❌ (Root Cause 5: Expired clips shown in UI)
```

### Root Cause 1: `expires_at` is Never Set on Clip Creation
- When clips are generated in `videoWorker.ts` and rendered in `renderWorker.ts`, only `created_at` (or `createdAt`) is recorded.
- In `supabaseService.ts` (`saveClips` L151):
  ```typescript
  const clipsWithTime = clips.map(c => ({...c, created_at: new Date().toISOString()}));
  ```
- `expires_at` is never computed (`created_at + 24 hours`), neither in Supabase nor in Firebase/local queue records.

### Root Cause 2: `RetentionService` Exclusively Relies on Non-Existent `expires_at` & Defaults to 30 Days
- In `RetentionService.ts` (L21, L73-74):
  ```typescript
  const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS ?? '30', 10); // 30 days, NOT 24h!
  ...
  .lt('expires_at', new Date().toISOString())
  .not('expires_at', 'is', null)
  ```
- Because no clips have `expires_at` set, this query **always returns 0 rows**.
- Furthermore, `RETENTION_DAYS` defaults to `30`, which violates the 24-hour product contract.

### Root Cause 3: `StorageService.deleteObjects()` Ignores Backblaze B2 / S3
- In `storageService.ts` (L451-468):
  ```typescript
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      await Promise.all(keys.map(k => firebaseBucket.file(k).delete({ ignoreNotFound: true })));
    }

    try {
      await this.getSupabase().storage.from("clips").remove(keys);
    } catch (err: any) { ... }
  }
  ```
- `storageService.ts` imports `DeleteObjectsCommand` from `@aws-sdk/client-s3`, but `this.s3` is **never called** in `deleteObjects()` or `deleteFile()`.
- Even if a cleanup process called `storageService.deleteObjects()`, Backblaze B2 objects are **never touched or deleted**.

### Root Cause 4: Local Queue (`active_queue.json`) Has No Retention Sweeper
- In local/hybrid mode, `firebaseDb.readQueue()` reads from `temp/active_queue.json` (6.4 MB).
- Completed clips remain in `active_queue.json` forever.
- No sweeper inspects `active_queue.json` to purge clips whose `created_at` is older than 24 hours.

### Root Cause 5: Gallery API (`/api/video/clips`) Lacks Expiration Guard
- In `apps/api/src/routes/video.ts` (L872-949):
  - Step 1 reads from `firebaseDb.readQueue()`.
  - Step 2 reads from `firebaseDb.listJobsForUser()`.
  - Step 3 reads from Supabase `clips`.
  - **Zero checks** are performed against `created_at + 24h` or `expires_at`.
- Expired clips remain visible and playable in the dashboard indefinitely.

### Root Cause 6: Fragmented Cleanup Schedulers
- Two separate, conflicting cleanup mechanisms exist:
  1. `ZombieSweeperService.ts` runs `RetentionService` once every 60 sweeps (~1 hour), but queries `.not('expires_at', 'is', null)`.
  2. `videoWorker.ts` runs `db.purgeOldClips(24)` on a 24-hour `setInterval()`, but when using `SUPABASE_ANON_KEY` without service role, Supabase RLS limits or fails the batch delete, and it delegates to `storageService.deleteObjects()`, which does not delete from B2.

---

## 3. Storage Audit Evidence

Direct inspection of Backblaze B2 bucket (`excerpt-clips`):
- Bucket contains videos and thumbnails dating back to **July 2026**.
- Examples of orphaned, un-deleted artifacts:
  - `jobs/0d76455e-576e-4a01-b729-45241b588175/89d9c709-d6c6-4c7a-987e-ff96481b6da8.mp4` (Created 2026-07-07)
  - `jobs/0b748366-77a3-4e4a-b644-57f2047cce6e/0868c4ee-2d82-4c53-b231-288a99d4f940.mp4` (Created 2026-07-31)
  - `jobs/05609708-8a97-4219-8e48-526d7793c27a/c7d1b520-c4c8-4a6d-b1b0-4be61be484d6.mp4` (Created 2026-08-31)
- Total size of uncleaned media in B2 exceeds gigabytes of abandoned storage.

---

## 4. Policy Definition & Specification

- **Product Contract**: 24-Hour Ephemeral Storage.
- **Canonical Expiration Formula**:
  $$\text{expires\_at} = \text{created\_at} + 24\text{ hours}$$
- **Two Distinct Guarantees**:
  1. **Immediate Logical Expiration**: `GET /api/video/clips` and `GET /api/video/jobs` must never return clips where $\text{now} \ge \text{expires\_at}$ (or $\text{now} - \text{created\_at} \ge 24\text{h}$).
  2. **Deterministic Physical Deletion**: Storage objects (B2 MP4, thumbnail, captions) must be deleted via S3 `DeleteObjectsCommand`, followed by database/queue record finalization.

---

## 5. Ponytail Minimal Diff Resolution Plan

In accordance with the Ponytail principle (reuse existing services, minimal diff, eliminate dead abstractions):

1. **StorageService**:
   - Add B2/S3 deletion to `deleteObjects()` using `DeleteObjectsCommand`. Support batches up to 1000 keys per S3 API spec. Handle 404/not found idempotently.
2. **Canonical Expiration & RetentionService**:
   - Align `RetentionService` policy strictly to 24 hours (`RETENTION_HOURS = 24`).
   - Query both `expires_at < NOW()` AND fallback `created_at < NOW() - 24h` so both backfilled and legacy clips are swept.
   - Sweep `active_queue.json` in addition to Supabase/Firestore.
   - Set `expires_at = created_at + 24h` on all newly created/upserted clips.
3. **Gallery / API Defense-in-Depth**:
   - Filter out clips where `expires_at <= NOW()` (or `created_at <= NOW() - 24h`) in `/api/video/clips`.
4. **Single Deterministic Scheduler**:
   - Keep `RetentionService` invoked through `ZombieSweeperService`, running on initial boot and hourly, with multi-worker claim safety.
5. **Observability & Telemetry**:
   - Log structured cleanup summary with scanned, expired, deleted, B2 keys removed, and errors.
