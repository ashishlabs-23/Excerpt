-- Add attempt_count to render_jobs to prevent claim RPC from failing
ALTER TABLE public.render_jobs 
ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0;
