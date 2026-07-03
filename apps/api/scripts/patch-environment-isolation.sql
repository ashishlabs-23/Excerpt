-- Migration: Environment Isolation & Path Normalization
-- Adds WORKER_ENV scoping to jobs, render_jobs, and clips
-- Adds structural checks to prevent absolute path leaks

-- 1. Add environment column to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'production';

-- 2. Add environment column to render_jobs
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'production';

-- 3. Add environment column to clips
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'production';

-- 4. Apply CHECK constraints for valid environments
-- Drop them first if they exist so we can re-run safely
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS chk_jobs_environment;
ALTER TABLE public.jobs ADD CONSTRAINT chk_jobs_environment
  CHECK (environment IN ('development', 'staging', 'production'));

ALTER TABLE public.render_jobs DROP CONSTRAINT IF EXISTS chk_render_jobs_environment;
ALTER TABLE public.render_jobs ADD CONSTRAINT chk_render_jobs_environment
  CHECK (environment IN ('development', 'staging', 'production'));

ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS chk_clips_environment;
ALTER TABLE public.clips ADD CONSTRAINT chk_clips_environment
  CHECK (environment IN ('development', 'staging', 'production'));

-- 5. Apply CHECK constraint for absolute paths in render_jobs
-- First, clean up any existing rows that contain the old absolute paths
UPDATE public.render_jobs
SET payload = payload - 'videoPath' - 'tempDir'
WHERE payload ? 'videoPath' OR payload ? 'tempDir';

-- Now we ensure the payload does NOT contain a videoPath or tempDir that starts with C:\ or /
ALTER TABLE public.render_jobs DROP CONSTRAINT IF EXISTS chk_render_jobs_no_absolute_paths;
ALTER TABLE public.render_jobs ADD CONSTRAINT chk_render_jobs_no_absolute_paths
  CHECK (
    (payload->>'videoPath' IS NULL OR payload->>'videoPath' !~ '^[A-Za-z]:\\|^\/') AND
    (payload->>'tempDir' IS NULL OR payload->>'tempDir' !~ '^[A-Za-z]:\\|^\/')
  );

-- 6. Update `claim_next_job` to filter by environment
CREATE OR REPLACE FUNCTION public.claim_next_job(worker_id_text text, worker_env_text text)
RETURNS setof public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
      AND environment = worker_env_text
      AND (
        payload->'retry'->>'next_retry_at' IS NULL
        OR (payload->'retry'->>'next_retry_at')::timestamptz <= now()
      )
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.jobs jobs
  SET
    status = 'processing',
    locked_by = worker_id_text,
    locked_at = now(),
    updated_at = now()
  FROM next_job
  WHERE jobs.id = next_job.id
  RETURNING jobs.*;
END;
$$;

-- 7. Update `claim_next_render_job` to filter by environment
CREATE OR REPLACE FUNCTION public.claim_next_render_job(worker_id_text text, worker_env_text text)
RETURNS setof public.render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.render_jobs
    WHERE status IN ('pending', 'retrying')
      AND environment = worker_env_text
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.render_jobs rj
  SET
    status = 'rendering',
    locked_by = worker_id_text,
    locked_at = now(),
    updated_at = now(),
    attempt_count = attempt_count + 1
  FROM next_job
  WHERE rj.id = next_job.id
  RETURNING rj.*;
END;
$$;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.claim_next_job(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_render_job(text, text) TO service_role;
