-- DB.1 Migration: Database Hardening Sprint
-- Run against your Supabase project via the SQL Editor.
-- All changes are safe to run multiple times (IF NOT EXISTS / DO NOTHING guards).

-- ============================================================
-- 1. clips: Add dedicated storage path columns
-- ============================================================
ALTER TABLE clips ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT;

-- Backfill storage_path from existing video_url values that are relative paths
-- (i.e. the ones we already migrated from signed URLs in the P0 fix)
UPDATE clips
SET storage_path = video_url
WHERE video_url IS NOT NULL
  AND video_url NOT LIKE 'https://%'
  AND storage_path IS NULL;

UPDATE clips
SET thumbnail_storage_path = thumbnail_url
WHERE thumbnail_url IS NOT NULL
  AND thumbnail_url NOT LIKE 'https://%'
  AND thumbnail_storage_path IS NULL;

-- Null out video_url and thumbnail_url so DB never stores generated URLs permanently
-- Only null them for rows where we now have the storage_path populated
UPDATE clips
SET video_url = NULL
WHERE storage_path IS NOT NULL
  AND video_url IS NOT NULL
  AND video_url NOT LIKE 'https://%';

UPDATE clips
SET thumbnail_url = NULL
WHERE thumbnail_storage_path IS NOT NULL
  AND thumbnail_url IS NOT NULL
  AND thumbnail_url NOT LIKE 'https://%';

-- ============================================================
-- 2. jobs: Add worker coordination columns
-- ============================================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- ============================================================
-- 3. Ensure audit timestamps exist on all core tables
-- ============================================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 4. NOT NULL constraints on critical columns
-- ============================================================
-- (Run only after verifying no NULLs exist via test_database_integrity.ts)
-- ALTER TABLE jobs ALTER COLUMN status SET NOT NULL;
-- ALTER TABLE clips ALTER COLUMN job_id SET NOT NULL;

-- ============================================================
-- 5. Foreign key: clips.job_id → jobs.id
-- ============================================================
-- Check if FK already exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'clips_job_id_fkey'
      AND table_name = 'clips'
  ) THEN
    ALTER TABLE clips
      ADD CONSTRAINT clips_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;
