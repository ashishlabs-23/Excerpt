-- Update the Trigger Function (No enum modification needed, status is just a TEXT column)
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

    -- Parent Job Orchestration State Machine rules
    IF old_status = 'queued' AND new_status NOT IN ('processing', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Invalid transition from queued to %', new_status;
    ELSIF old_status = 'processing' AND new_status NOT IN ('transcribing', 'detecting_clips', 'recovering', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from processing to %', new_status;
    ELSIF old_status = 'transcribing' AND new_status NOT IN ('detecting_clips', 'recovering', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from transcribing to %', new_status;
    ELSIF old_status = 'recovering' AND new_status NOT IN ('detecting_clips', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from recovering to %', new_status;
    ELSIF old_status = 'detecting_clips' AND new_status NOT IN ('rendering', 'completed', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from detecting_clips to %', new_status;
    ELSIF old_status = 'rendering' AND new_status NOT IN ('completed', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from rendering to %', new_status;
    
    -- Keep these just in case any old jobs are in these states temporarily
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
