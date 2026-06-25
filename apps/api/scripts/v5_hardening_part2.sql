-- V5 Hardening Migration Part 2: Idempotency, Render Queue, Metrics, and Benchmark

-- 1. Idempotency and Clip State Machine (V5.3.1, V5.3.2)
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS generation_key text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clips_generation_key ON public.clips (generation_key) WHERE generation_key IS NOT NULL;

-- 2. Runtime Metrics (V5.3.3)
CREATE TABLE IF NOT EXISTS public.render_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  clip_id uuid REFERENCES public.clips(id) ON DELETE SET NULL,
  download_ms integer,
  transcription_ms integer,
  story_ms integer,
  ranking_ms integer,
  crop_ms integer,
  caption_ms integer,
  upload_ms integer,
  total_ms integer,
  created_at timestamptz DEFAULT now()
);

-- 3. Production Failures (V5.3.4)
CREATE TABLE IF NOT EXISTS public.production_failures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  failure_type text NOT NULL,
  stacktrace text,
  worker text,
  stage text,
  video_url text,
  created_at timestamptz DEFAULT now()
);

-- 4. Render Queue (V5.4.1)
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  clip_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending',
  attempt_count integer DEFAULT 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_queue ON public.render_jobs (status, created_at) WHERE status IN ('pending', 'retrying');

-- 5. Render Dead Letters (V5.4.2)
CREATE TABLE IF NOT EXISTS public.render_dead_letters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  render_job_id uuid,
  job_id uuid,
  payload jsonb,
  final_error text,
  created_at timestamptz DEFAULT now()
);

-- 6. Render Worker Heartbeats (V5.4.3)
CREATE TABLE IF NOT EXISTS public.render_worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_heartbeat timestamptz DEFAULT now(),
  status text DEFAULT 'active'
);

-- 7. Benchmark Suite (V5.6)
CREATE TABLE IF NOT EXISTS public.benchmark_videos (
  video_id text PRIMARY KEY,
  url text NOT NULL,
  competition text,
  duration numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_boundaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text REFERENCES public.benchmark_videos(video_id) ON DELETE CASCADE,
  human_start numeric NOT NULL,
  human_end numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text REFERENCES public.benchmark_videos(video_id) ON DELETE CASCADE,
  editor_rank integer,
  excerpt_rank integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_judgements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text REFERENCES public.benchmark_videos(video_id) ON DELETE CASCADE,
  publishable boolean,
  story_complete boolean,
  emotion_score numeric,
  created_at timestamptz DEFAULT now()
);

-- RPC for acquiring render jobs
CREATE OR REPLACE FUNCTION public.claim_next_render_job(worker_id_text text)
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
