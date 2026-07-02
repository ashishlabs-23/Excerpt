import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
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
`;

async function patch() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  // if exec_sql doesn't exist, we can't run arbitrary sql from the JS client easily
  console.log("Result:", error || "Success");
}

patch();
