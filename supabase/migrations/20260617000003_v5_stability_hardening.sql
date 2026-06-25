-- Migration: Excerpt V5 Stability Hardening

-- 1. Create job_events table for event sourcing
CREATE TABLE IF NOT EXISTS job_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);

-- 2. Create worker_heartbeats table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id TEXT NOT NULL UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    hostname TEXT NOT NULL,
    active_job TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen ON worker_heartbeats(last_seen);

-- 3. Add distributed locking columns to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP WITH TIME ZONE;

-- 4. Apply NOT NULL constraints and defaults
-- We use DO blocks to safely alter columns in case constraints already exist
DO $$
BEGIN
    -- jobs status NOT NULL
    ALTER TABLE jobs ALTER COLUMN status SET NOT NULL;
    
    -- jobs progress DEFAULT 0 and NOT NULL
    ALTER TABLE jobs ALTER COLUMN progress SET DEFAULT 0;
    ALTER TABLE jobs ALTER COLUMN progress SET NOT NULL;
    
    -- clips constraints
    ALTER TABLE clips ALTER COLUMN job_id SET NOT NULL;
    ALTER TABLE clips ALTER COLUMN storage_path SET NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);

-- 6. Enforce State Machine Transitions via Trigger
CREATE OR REPLACE FUNCTION enforce_job_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    old_status TEXT;
    new_status TEXT;
BEGIN
    old_status := OLD.status;
    new_status := NEW.status;

    -- If status hasn't changed, allow it
    IF old_status = new_status THEN
        RETURN NEW;
    END IF;

    -- Allow any state to be reset back to 'queued' (retries, resets)
    IF new_status = 'queued' THEN
        RETURN NEW;
    END IF;

    -- State machine rules
    IF old_status = 'queued' AND new_status NOT IN ('processing', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Invalid transition from queued to %', new_status;
    ELSIF old_status = 'processing' AND new_status NOT IN ('detecting_clips', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from processing to %', new_status;
    ELSIF old_status = 'detecting_clips' AND new_status NOT IN ('cutting', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from detecting_clips to %', new_status;
    ELSIF old_status = 'cutting' AND new_status NOT IN ('captioning', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from cutting to %', new_status;
    ELSIF old_status = 'captioning' AND new_status NOT IN ('uploading', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from captioning to %', new_status;
    ELSIF old_status = 'uploading' AND new_status NOT IN ('completed', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from uploading to %', new_status;
    ELSIF old_status IN ('completed', 'failed', 'dead_letter', 'cancelled') AND new_status NOT IN ('queued') THEN
        RAISE EXCEPTION 'Terminal state % cannot transition to % without resetting to queued', old_status, new_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_status_transition ON jobs;
CREATE TRIGGER trigger_job_status_transition
    BEFORE UPDATE OF status ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_job_status_transition();
