-- v8_job_state_machine_sweeper_fix.sql
CREATE OR REPLACE FUNCTION enforce_job_status_transition()
RETURNS trigger AS $$
DECLARE
    old_status TEXT := OLD.status;
    new_status TEXT := NEW.status;
    worker_id_val TEXT;
    error_reason TEXT;
BEGIN
    -- Only validate if status is actually changing
    IF old_status = new_status THEN
        RETURN NEW;
    END IF;

    -- Define strict transition rules
    IF old_status = 'queued' AND new_status NOT IN ('processing', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from queued to %', new_status;
    
    ELSIF old_status = 'processing' AND new_status NOT IN ('transcribing', 'recovering', 'completed', 'failed', 'dead_letter', 'cancelled', 'queued') THEN
        RAISE EXCEPTION 'Invalid transition from processing to %', new_status;
        
    ELSIF old_status = 'transcribing' AND new_status NOT IN ('detecting_clips', 'recovering', 'completed', 'failed', 'dead_letter', 'cancelled', 'queued') THEN
        RAISE EXCEPTION 'Invalid transition from transcribing to %', new_status;
        
    ELSIF old_status = 'detecting_clips' AND new_status NOT IN ('rendering', 'recovering', 'completed', 'failed', 'dead_letter', 'cancelled', 'queued') THEN
        RAISE EXCEPTION 'Invalid transition from detecting_clips to %', new_status;
        
    ELSIF old_status = 'rendering' AND new_status NOT IN ('uploading', 'recovering', 'completed', 'failed', 'dead_letter', 'cancelled', 'queued') THEN
        RAISE EXCEPTION 'Invalid transition from rendering to %', new_status;
        
    ELSIF old_status = 'uploading' AND new_status NOT IN ('completed', 'failed', 'dead_letter', 'cancelled', 'queued') THEN
        RAISE EXCEPTION 'Invalid transition from uploading to %', new_status;
        
    ELSIF old_status = 'recovering' AND new_status NOT IN ('queued', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from recovering to %', new_status;

    -- terminal states shouldn't transition to active states
    ELSIF old_status IN ('completed', 'failed', 'dead_letter', 'cancelled') AND new_status NOT IN ('queued') THEN
        RAISE EXCEPTION 'Terminal state % cannot transition to % without resetting to queued', old_status, new_status;
    END IF;


    -- Extract metadata safely
    BEGIN
        worker_id_val := NEW.locked_by;
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

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS trigger_job_status_transition ON jobs;
CREATE TRIGGER trigger_job_status_transition
    BEFORE UPDATE OF status ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_job_status_transition();
