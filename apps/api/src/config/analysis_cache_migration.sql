-- Sprint 3: Analysis Cache Layer Migration
-- Table: video_analysis_cache
-- Stores full pipeline analysis results keyed by video hash + pipeline version
-- Enables "Generate More Clips" to skip re-analysis on cache hit

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

-- Index for fast lookups by hash
CREATE INDEX IF NOT EXISTS idx_video_analysis_cache_hash ON public.video_analysis_cache (video_hash);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_video_analysis_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_analysis_cache_updated ON public.video_analysis_cache;
CREATE TRIGGER trg_video_analysis_cache_updated
  BEFORE UPDATE ON public.video_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_video_analysis_cache_timestamp();

-- RLS: Disable for now (service-role access only, like clips_archive)
-- WARNING: Enable RLS before production deployment with user-scoped policies
ALTER TABLE public.video_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_full_access"
  ON public.video_analysis_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.video_analysis_cache IS 'Sprint 3: Caches full video analysis results (transcript, tracking, events, emotion, story, candidate moments) to avoid re-running heavy pipelines on repeat generations. Keyed by SHA256 compound hash of video URL + duration + title + channel.';
