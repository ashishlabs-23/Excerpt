# DATABASE_OWNERSHIP.md
# Excerpt — Database Ownership Matrix (DB.1 Hardening Sprint)

**Rule**: The database must win. No application state may exist exclusively in memory.
If the process crashes, the database contains complete recoverable state.

---

## Core Tables

| Table | Owner | Writers | Readers | Notes |
|---|---|---|---|---|
| `jobs` | **Supabase** | `supabaseService.createJob`, `supabaseService.updateJob`, `video.ts (cancel)` | `supabaseService`, `queueService`, `videoWorker`, `video.ts`, `system.ts` | Single source of truth for job lifecycle |
| `clips` | **Supabase** | `supabaseService.saveClips`, `videoWorker` | `supabaseService`, `video.ts`, `database_repair.ts` | `storage_path` column is canonical. `video_url` is always NULL in DB, signed at read time by `video.ts` |

## Supporting Tables

| Table | Owner | Purpose |
|---|---|---|
| `nexus_signals` | Supabase | Viral intelligence signals per job |
| `clip_enhancements` | Supabase | AI-generated title/hook cache keyed by transcript hash |
| `video_analysis_cache` | Supabase | Analysis cache keyed by video fingerprint |
| `generated_clip_memory` | Supabase | Prevents duplicate clips across re-runs of the same video |
| `video_timeline_coverage` | Supabase | Tracks which time segments of a video have been clipped |
| `voiceover_projects` | Supabase | Voiceover studio projects |
| `voiceover_segments` | Supabase | Individual segments within a voiceover project |
| `workspaces` | Supabase | Agency/team workspace definitions |
| `workspace_members` | Supabase | User roles within a workspace |
| `content_calendar` | Supabase | Scheduled clip publication times |
| `ab_test_campaigns` | Supabase | A/B test campaigns |
| `ab_test_variants` | Supabase | Variants within an A/B campaign |
| `human_preference_matchups` | Supabase | Human editorial judgments (Clip A vs Clip B) |

---

## Deleted / Eliminated State Stores (DB.1)

| Store | Type | Status | Reason |
|---|---|---|---|
| `services/jobState.ts` `JOB_STORE` | `Record<string, any>` in process memory | **DELETED** | Diverged from DB on process restart. Race condition source. |
| `temp/local_db.json` | JSON file on disk | **DELETED** | Silent fallback from Supabase errors caused invisible state drift |

---

## Column Ownership Rules

### `clips` table
| Column | Responsibility |
|---|---|
| `storage_path` | The **canonical location** of the clean (uncaptioned) MP4 in Supabase Storage. Written once by `videoWorker`. Never overwritten. |
| `thumbnail_storage_path` | The **canonical location** of the thumbnail JPEG. Written once by `videoWorker`. |
| `video_url` | Always `NULL` in the database. Generated dynamically by `signClip()` in `video.ts` at request time. |
| `thumbnail_url` | Always `NULL` in the database. Generated dynamically by `signClip()` in `video.ts` at request time. |
| `metadata.video_storage_key` | Mirror of `storage_path`. Legacy support. |
| `metadata.video_captioned_storage_key` | Path to the hard-burned subtitle version of the MP4. |

### `jobs` table
| Column | Responsibility |
|---|---|
| `status` | Canonical lifecycle state. Written only by `db.updateJob()`. Never by in-memory cache. |
| `locked_by` | Worker instance ID claiming the job (DB.1 addition). |
| `locked_at` | Timestamp when job was claimed (DB.1 addition). Used for zombie detection. |
| `worker_id` | Durable ID of the worker process (DB.1 addition). |

---

## Enforcement Rules

1. **No application state in memory** — caches allowed, source of truth forbidden
2. **No fallback writes on DB error** — errors must propagate, not silently diverge
3. **No signed URLs stored in DB** — `video_url` and `thumbnail_url` are always NULL
4. **Every clip recoverable from `storage_path`** — if `storage_path` is set, the clip can be regenerated
5. **FK constraint enforced** — `clips.job_id` → `jobs.id` with CASCADE DELETE

---

## Integrity Test Gate

Before any deploy:
```bash
npx tsx apps/api/scripts/test_database_integrity.ts
```
Exit code 0 required. Any failure blocks deployment.
