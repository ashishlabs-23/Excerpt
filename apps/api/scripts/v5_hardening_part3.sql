-- V5 Hardening Migration Part 3: Render Cache (V5.8)

CREATE TABLE IF NOT EXISTS public.render_cache (
  candidate_hash text PRIMARY KEY,
  storage_path text NOT NULL,
  thumbnail_path text,
  created_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_render_cache_hash ON public.render_cache (candidate_hash);
