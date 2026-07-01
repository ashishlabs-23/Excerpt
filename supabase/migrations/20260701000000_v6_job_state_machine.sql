-- Migration: Excerpt V6 Job State Machine & Transition History

-- 1. Create job_state_history table for transition logging
CREATE TABLE IF NOT EXISTS job_state_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    reason TEXT,
    worker TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_state_history_job_id ON job_state_history(job_id);

-- 2. Enforce State Machine Transitions via Trigger
CREATE OR REPLACE FUNCTION enforce_job_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    old_status TEXT;
    new_status TEXT;
    worker_id_val TEXT;
    error_reason TEXT;
BEGIN
    old_status := OLD.status;
    new_status := NEW.status;

    -- If status hasn't changed, allow it
    IF old_status = new_status THEN
        RETURN NEW;
    END IF;

    -- State machine rules
    IF old_status = 'queued' AND new_status NOT IN ('processing', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Invalid transition from queued to %', new_status;
    ELSIF old_status = 'processing' AND new_status NOT IN ('transcribing', 'detecting_clips', 'recovering', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from processing to %', new_status;
    ELSIF old_status = 'transcribing' AND new_status NOT IN ('detecting_clips', 'recovering', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from transcribing to %', new_status;
    ELSIF old_status = 'recovering' AND new_status NOT IN ('detecting_clips', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from recovering to %', new_status;
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

    -- Attempt to extract worker id and reason
    BEGIN
        worker_id_val := OLD.locked_by;
        error_reason := NULL; 
    EXCEPTION
        WHEN OTHERS THEN
            worker_id_val := 'unknown';
    END;

    -- Log transition
    INSERT INTO job_state_history (job_id, from_state, to_state, worker, reason)
    VALUES (NEW.id, old_status, new_status, worker_id_val, error_reason);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_status_transition ON jobs;
CREATE TRIGGER trigger_job_status_transition
    BEFORE UPDATE OF status ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_job_status_transition();

-- 3. Verification Tests
-- (Can be run manually in psql to test the logic, wrapped in a transaction that rolls back)
/*
BEGIN;
    -- Setup a dummy job
    INSERT INTO jobs (id, status, user_id, video_url) VALUES ('00000000-0000-0000-0000-000000000001', 'queued', '00000000-0000-0000-0000-000000000000', 'test');
    
    -- Test queued -> processing (Should SUCCEED)
    UPDATE jobs SET status = 'processing' WHERE id = '00000000-0000-0000-0000-000000000001';
    
    -- Test processing -> recovering (Should SUCCEED)
    UPDATE jobs SET status = 'recovering' WHERE id = '00000000-0000-0000-0000-000000000001';

    -- Test recovering -> detecting_clips (Should SUCCEED)
    UPDATE jobs SET status = 'detecting_clips' WHERE id = '00000000-0000-0000-0000-000000000001';

    -- Test recovering -> queued (Should FAIL)
    -- UPDATE jobs SET status = 'recovering' WHERE id = '00000000-0000-0000-0000-000000000001'; -- (back to recovering for the test)
    -- UPDATE jobs SET status = 'queued' WHERE id = '00000000-0000-0000-0000-000000000001'; -- Expected to throw Exception

ROLLBACK;
*/
