-- Neural Voiceover Studio Schema Migration

-- 1. Voiceover Projects
CREATE TABLE IF NOT EXISTS voiceover_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_job_id UUID,
  source_url TEXT NOT NULL,
  source_duration FLOAT,
  title TEXT NOT NULL DEFAULT 'Untitled Voiceover',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vo_projects_user ON voiceover_projects(user_id);

-- 2. Voiceover Segments (clip definitions)
CREATE TABLE IF NOT EXISTS voiceover_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES voiceover_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  narration_text TEXT NOT NULL,
  priority INT DEFAULT 1,
  clip_type TEXT DEFAULT 'narration',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vo_segments_project ON voiceover_segments(project_id);

-- 3. Voiceover Scripts (AI-polished versions)
CREATE TABLE IF NOT EXISTS voiceover_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES voiceover_segments(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  polished_text TEXT,
  quality_notes TEXT,
  ai_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Voiceover Jobs (links to main jobs table)
CREATE TABLE IF NOT EXISTS voiceover_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES voiceover_projects(id),
  main_job_id UUID NOT NULL,
  user_id UUID NOT NULL,
  voice_config JSONB NOT NULL DEFAULT '{}',
  stage TEXT DEFAULT 'V0',
  quality_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vo_jobs_project ON voiceover_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_vo_jobs_main ON voiceover_jobs(main_job_id);

-- 5. Voice Provider Metrics (adaptive provider selection)
CREATE TABLE IF NOT EXISTS voiceover_provider_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms INT,
  chars_billed INT,
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vo_provider_metrics ON voiceover_provider_metrics(provider, created_at);
