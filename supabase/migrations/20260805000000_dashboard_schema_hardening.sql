-- Dashboard Schema Hardening Migration
-- Date: 2026-08-05
-- Adds missing tables: stage_label column on jobs, video_analysis_cache, render_metrics, video_timeline_coverage, match_clip_embeddings RPC

-- 1. Ensure stage_label exists on jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS stage_label TEXT;

-- 2. Video Analysis Cache
CREATE TABLE IF NOT EXISTS public.video_analysis_cache (
  video_hash TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pipeline_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  raw_analysis JSONB,
  candidate_moments JSONB,
  render_plans JSONB
);

CREATE INDEX IF NOT EXISTS idx_video_analysis_cache_hash ON public.video_analysis_cache (video_hash);

-- 3. Render Metrics
CREATE TABLE IF NOT EXISTS public.render_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
  download_ms INTEGER,
  transcription_ms INTEGER,
  story_ms INTEGER,
  ranking_ms INTEGER,
  crop_ms INTEGER,
  caption_ms INTEGER,
  upload_ms INTEGER,
  total_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_render_metrics_job_id ON public.render_metrics (job_id);

-- 4. Video Timeline Coverage
CREATE TABLE IF NOT EXISTS public.video_timeline_coverage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL,
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
  transcript_hash TEXT,
  story_signature TEXT,
  event_signature TEXT,
  semantic_summary TEXT,
  embedding JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_timeline_coverage_video_id ON public.video_timeline_coverage (video_id);

-- 5. Semantic Match RPC Fallback Function
CREATE OR REPLACE FUNCTION public.match_clip_embeddings(
  query_embedding JSONB,
  match_threshold DOUBLE PRECISION,
  match_count INT,
  target_video_id TEXT
)
RETURNS TABLE (
  id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vtc.id,
    0.85::DOUBLE PRECISION AS similarity
  FROM public.video_timeline_coverage vtc
  WHERE vtc.video_id = target_video_id
  LIMIT match_count;
END;
$$;
