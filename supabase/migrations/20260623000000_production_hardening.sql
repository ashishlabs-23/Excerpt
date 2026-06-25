-- Permanent migration for production_failures, claim_next_voiceover_clip, and ownership enforcement

-- 1. Enforce user_id ownership on jobs
-- First delete any orphaned anonymous jobs to prevent constraint violation
DELETE FROM public.jobs WHERE user_id IS NULL;
ALTER TABLE public.jobs ALTER COLUMN user_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS public.production_failures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid,
    clip_id text,
    error_message text,
    stack_trace text,
    component text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.claim_next_voiceover_clip()
RETURNS SETOF voiceover_clips
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  UPDATE voiceover_clips
  SET status = 'processing', updated_at = NOW()
  WHERE id = (
    SELECT id FROM voiceover_clips
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$function$;
