-- V5 Hardening Migration: State Machine, Event Sourcing, and Locking

-- 1. Create job_events table for event sourcing
CREATE TABLE IF NOT EXISTS public.job_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON public.job_events (job_id);

-- 2. Add locking and worker tracking columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS failed_reason text,
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;

-- 3. Enforce strict state transitions on jobs
-- Allowed transitions:
-- queued -> processing
-- processing -> transcribing
-- processing -> detecting_clips
-- transcribing -> detecting_clips
-- detecting_clips -> ranking
-- detecting_clips -> rendering
-- ranking -> rendering
-- rendering -> uploading
-- uploading -> completed
-- ANY -> failed
-- ANY -> cancelled
-- (We use a trigger to enforce this logic)

CREATE OR REPLACE FUNCTION public.check_job_state_transition()
RETURNS trigger AS $$
BEGIN
  -- If status hasn't changed, allow the update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow transition to failed or cancelled from anywhere
  IF NEW.status IN ('failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Validate specific transitions
  IF OLD.status = 'queued' AND NEW.status = 'processing' THEN
    RETURN NEW;
  ELSIF OLD.status = 'processing' AND NEW.status IN ('transcribing', 'detecting_clips', 'recovering') THEN
    RETURN NEW;
  ELSIF OLD.status = 'transcribing' AND NEW.status IN ('detecting_clips', 'recovering') THEN
    RETURN NEW;
  ELSIF OLD.status = 'detecting_clips' AND NEW.status IN ('ranking', 'rendering', 'recovering') THEN
    RETURN NEW;
  ELSIF OLD.status = 'recovering' AND NEW.status IN ('ranking', 'rendering', 'detecting_clips') THEN
    RETURN NEW;
  ELSIF OLD.status = 'ranking' AND NEW.status = 'rendering' THEN
    RETURN NEW;
  ELSIF OLD.status = 'rendering' AND NEW.status = 'uploading' THEN
    RETURN NEW;
  ELSIF OLD.status = 'uploading' AND NEW.status = 'completed' THEN
    RETURN NEW;
  ELSIF OLD.status IN ('processing', 'detecting_clips', 'transcribing', 'recovering') AND NEW.status = 'queued' THEN
    -- Recovery / Reclaiming orphaned jobs
    RETURN NEW;
  END IF;

  -- If we get here, the transition is invalid
  RAISE EXCEPTION 'Invalid job state transition from % to %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_job_state_transition ON public.jobs;
CREATE TRIGGER enforce_job_state_transition
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_state_transition();

-- 4. Create queue claim function
CREATE INDEX IF NOT EXISTS idx_jobs_queue_claim
  ON public.jobs (status, created_at)
  WHERE status IN ('queued', 'retrying');

CREATE INDEX IF NOT EXISTS idx_jobs_locked_at
  ON public.jobs (locked_at)
  WHERE locked_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_next_job(worker_id_text text)
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
    worker_id = worker_id_text,
    locked_at = now(),
    updated_at = now()
  FROM next_job
  WHERE jobs.id = next_job.id
  RETURNING jobs.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_job(text) TO service_role;
