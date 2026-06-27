-- ============================================================
-- EXCERPT COMPLETE DATABASE SETUP SCRIPT v3.1 (IDEMPOTENT)
-- Safe to run multiple times — all CREATE ops use IF NOT EXISTS
-- All policies use DROP IF EXISTS before CREATE
-- Project: maldlbmoeorpetllaceg
-- ============================================================

-- ─────────────────────────────────────────
-- STEP 1: BASE TABLES (Core Schema)
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    youtube_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    result JSONB DEFAULT '{}'::jsonb,
    generation_mode TEXT,
    debug_data JSONB,
    locked_by TEXT,
    worker_id TEXT,
    lock_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.clips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    start_time FLOAT,
    end_time FLOAT,
    duration FLOAT,
    storage_path TEXT NOT NULL DEFAULT '',
    public_url TEXT,
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.render_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    locked_by TEXT,
    lock_expires_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    result JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.render_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_hash TEXT NOT NULL UNIQUE,
    clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    render_params JSONB DEFAULT '{}'::jsonb,
    result_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────
-- STEP 2: INDEXES
-- ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON public.jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON public.clips(created_at);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON public.clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON public.clips(user_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON public.render_jobs(status);
CREATE INDEX IF NOT EXISTS idx_render_cache_hash ON public.render_cache(candidate_hash);

-- ─────────────────────────────────────────
-- STEP 3: ROW LEVEL SECURITY (IDEMPOTENT)
-- ─────────────────────────────────────────

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_cache ENABLE ROW LEVEL SECURITY;

-- Jobs policies
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.jobs;
CREATE POLICY "Users can view their own jobs"
  ON public.jobs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own jobs" ON public.jobs;
CREATE POLICY "Users can insert their own jobs"
  ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own jobs" ON public.jobs;
CREATE POLICY "Users can update their own jobs"
  ON public.jobs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access jobs" ON public.jobs;
CREATE POLICY "Service role full access jobs"
  ON public.jobs FOR ALL USING (auth.role() = 'service_role');

-- Clips policies
DROP POLICY IF EXISTS "Users can view their own clips" ON public.clips;
CREATE POLICY "Users can view their own clips"
  ON public.clips FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own clips" ON public.clips;
CREATE POLICY "Users can insert their own clips"
  ON public.clips FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own clips" ON public.clips;
CREATE POLICY "Users can update their own clips"
  ON public.clips FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access clips" ON public.clips;
CREATE POLICY "Service role full access clips"
  ON public.clips FOR ALL USING (auth.role() = 'service_role');

-- Render jobs policies
DROP POLICY IF EXISTS "Service role full access render_jobs" ON public.render_jobs;
CREATE POLICY "Service role full access render_jobs"
  ON public.render_jobs FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own render_jobs" ON public.render_jobs;
CREATE POLICY "Users can view their own render_jobs"
  ON public.render_jobs FOR SELECT USING (auth.uid() = user_id);

-- Render cache policies
DROP POLICY IF EXISTS "Service role full access render_cache" ON public.render_cache;
CREATE POLICY "Service role full access render_cache"
  ON public.render_cache FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- STEP 4: UPDATED_AT TRIGGER
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clips_updated_at ON public.clips;
CREATE TRIGGER update_clips_updated_at
    BEFORE UPDATE ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_render_jobs_updated_at ON public.render_jobs;
CREATE TRIGGER update_render_jobs_updated_at
    BEFORE UPDATE ON public.render_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────
-- STEP 5: QUEUE RPCs (required by API worker)
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_next_job(worker_id_text TEXT)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET
    status = 'processing',
    locked_by = worker_id_text,
    worker_id = worker_id_text,
    lock_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.jobs
    WHERE status = 'queued'
      AND (lock_expires_at IS NULL OR lock_expires_at < NOW())
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_render_job(worker_id_text TEXT)
RETURNS SETOF public.render_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.render_jobs
  SET
    status = 'processing',
    locked_by = worker_id_text,
    lock_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.render_jobs
    WHERE status = 'pending'
      AND (lock_expires_at IS NULL OR lock_expires_at < NOW())
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ─────────────────────────────────────────
-- STEP 6: LEARNING SYSTEM TABLES
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.editorial_corrections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clip_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    story_type TEXT,
    old_start FLOAT NOT NULL,
    old_end FLOAT NOT NULL,
    new_start FLOAT NOT NULL,
    new_end FLOAT NOT NULL,
    editor_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.boundary_failure_dataset (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL,
    story_type TEXT NOT NULL,
    excerpt_start FLOAT NOT NULL,
    excerpt_end FLOAT NOT NULL,
    editor_start FLOAT NOT NULL,
    editor_end FLOAT NOT NULL,
    start_delta FLOAT NOT NULL,
    end_delta FLOAT NOT NULL,
    failure_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    publishability_before FLOAT,
    publishability_after FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.boundary_policy_cache (
    narrative_type TEXT PRIMARY KEY,
    sample_count INT NOT NULL DEFAULT 0,
    avg_pre_context FLOAT NOT NULL DEFAULT 0,
    avg_post_context FLOAT NOT NULL DEFAULT 0,
    avg_start_delta FLOAT NOT NULL DEFAULT 0,
    avg_end_delta FLOAT NOT NULL DEFAULT 0,
    confidence FLOAT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.boundary_tournament (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    narrative_type TEXT NOT NULL,
    boundary_a_source TEXT NOT NULL,
    boundary_b_source TEXT NOT NULL,
    winner TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────
-- STEP 7: POLICY PROMOTION SYSTEM
-- ─────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE policy_stage AS ENUM ('experimental', 'candidate', 'challenger', 'promoted', 'retired');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.policy_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    narrative_type TEXT NOT NULL,
    version_number INT NOT NULL,
    stage policy_stage DEFAULT 'experimental',
    avg_pre_context FLOAT NOT NULL,
    avg_post_context FLOAT NOT NULL,
    sample_count INT DEFAULT 0,
    confidence FLOAT DEFAULT 0.0,
    stability FLOAT DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (narrative_type, version_number)
);

CREATE TABLE IF NOT EXISTS public.policy_matchups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    narrative_type TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    policy_a_id UUID REFERENCES public.policy_versions(id) ON DELETE CASCADE,
    policy_b_id UUID REFERENCES public.policy_versions(id) ON DELETE CASCADE,
    winner UUID REFERENCES public.policy_versions(id) ON DELETE CASCADE,
    is_tie BOOLEAN DEFAULT FALSE,
    confidence FLOAT DEFAULT 1.0,
    editor_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─────────────────────────────────────────
-- STEP 8: EVENT SOURCING & HEARTBEATS
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON public.job_events(job_id);

CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id TEXT NOT NULL UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    hostname TEXT NOT NULL,
    active_job TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen ON public.worker_heartbeats(last_seen);

CREATE TABLE IF NOT EXISTS public.render_worker_heartbeats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id TEXT NOT NULL UNIQUE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL
);

-- ─────────────────────────────────────────
-- STEP 9: BENCHMARKING INFRASTRUCTURE
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clip_scorecards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    story_completeness FLOAT,
    boundary_accuracy FLOAT,
    replay_coverage BOOLEAN,
    reaction_coverage BOOLEAN,
    buildup_coverage BOOLEAN,
    chance_coverage BOOLEAN,
    outcome_coverage BOOLEAN,
    publishability FLOAT,
    editor_score FLOAT,
    editor_agreement FLOAT,
    narrative_strength FLOAT,
    emotion_score FLOAT,
    tension_score FLOAT,
    clip_duration FLOAT,
    cache_hit BOOLEAN,
    generation_mode TEXT,
    render_time_ms INT,
    ffmpeg_time_ms INT,
    runtime_ms INT,
    quality_gate_passed BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clip_scorecards_clip_id ON public.clip_scorecards(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_scorecards_job_id ON public.clip_scorecards(job_id);

CREATE TABLE IF NOT EXISTS public.ground_truth_clips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL,
    story_type TEXT,
    human_start FLOAT NOT NULL,
    human_end FLOAT NOT NULL,
    human_rank INT,
    human_publishable BOOLEAN,
    human_notes TEXT,
    contains_replay BOOLEAN,
    contains_reaction BOOLEAN,
    contains_buildup BOOLEAN,
    contains_outcome BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ground_truth_clips_video_id ON public.ground_truth_clips(video_id);

CREATE TABLE IF NOT EXISTS public.engine_shadow_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    engine_name TEXT NOT NULL,
    runtime_ms INT NOT NULL,
    prediction JSONB DEFAULT '{}'::jsonb,
    confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engine_shadow_results_job_clip ON public.engine_shadow_results(job_id, clip_id);

-- ─────────────────────────────────────────
-- STEP 10: SCHEMA VERSION
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_info (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.schema_info (version) VALUES ('v3.1.0') ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- STEP 11: VOICEOVER SYSTEM
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.voiceover_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL,
    voice TEXT NOT NULL,
    narration_text TEXT NOT NULL,
    audio_path TEXT,
    video_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    script_mode TEXT DEFAULT 'custom',
    generation_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voiceover_clips_status ON public.voiceover_clips(status);
CREATE INDEX IF NOT EXISTS idx_voiceover_clips_source_clip_id ON public.voiceover_clips(source_clip_id);
CREATE INDEX IF NOT EXISTS idx_voiceover_clips_user_id ON public.voiceover_clips(user_id);

ALTER TABLE public.voiceover_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own voiceover clips" ON public.voiceover_clips;
CREATE POLICY "Users can view their own voiceover clips"
  ON public.voiceover_clips FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own voiceover clips" ON public.voiceover_clips;
CREATE POLICY "Users can insert their own voiceover clips"
  ON public.voiceover_clips FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own voiceover clips" ON public.voiceover_clips;
CREATE POLICY "Users can update their own voiceover clips"
  ON public.voiceover_clips FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own voiceover clips" ON public.voiceover_clips;
CREATE POLICY "Users can delete their own voiceover clips"
  ON public.voiceover_clips FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.voiceover_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voiceover_id UUID NOT NULL REFERENCES public.voiceover_clips(id) ON DELETE CASCADE,
    provider TEXT,
    language TEXT,
    style TEXT,
    script_mode TEXT,
    generation_time_ms INTEGER,
    play_count INTEGER DEFAULT 0,
    liked BOOLEAN DEFAULT false,
    disliked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voiceover_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own voiceover feedback" ON public.voiceover_feedback;
CREATE POLICY "Users can view own voiceover feedback"
  ON public.voiceover_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
        AND voiceover_clips.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own voiceover feedback" ON public.voiceover_feedback;
CREATE POLICY "Users can insert own voiceover feedback"
  ON public.voiceover_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
        AND voiceover_clips.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- STEP 12: PRODUCTION HARDENING
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.production_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID,
    clip_id TEXT,
    error_message TEXT,
    stack_trace TEXT,
    component TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.claim_next_voiceover_clip()
RETURNS SETOF public.voiceover_clips
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.voiceover_clips
  SET status = 'processing', updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.voiceover_clips
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ─────────────────────────────────────────
-- STEP 13: LEARNING PLATFORM
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_versions (
    version_id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    description TEXT,
    deployed_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.reward_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    job_id UUID NOT NULL,
    story_builder_version TEXT,
    critic_version TEXT,
    ranking_version TEXT,
    hook_score NUMERIC,
    context_score NUMERIC,
    emotion_score NUMERIC,
    curiosity_score NUMERIC,
    visual_score NUMERIC,
    pacing_metric NUMERIC,
    caption_density NUMERIC,
    watch_time_sec NUMERIC DEFAULT 0,
    completion_rate NUMERIC DEFAULT 0,
    liked BOOLEAN DEFAULT false,
    shared BOOLEAN DEFAULT false,
    replayed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.arena_matches (
    match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    candidate_a_id UUID NOT NULL,
    candidate_b_id UUID NOT NULL,
    winner TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clip_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    clip_id UUID NOT NULL,
    preference_weight NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_embeddings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    preference_vector JSONB DEFAULT '[]'::jsonb,
    model_version TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- STEP 14: JOB STATUS TRANSITION TRIGGER
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_job_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    old_status TEXT;
    new_status TEXT;
BEGIN
    old_status := OLD.status;
    new_status := NEW.status;

    IF old_status = new_status THEN RETURN NEW; END IF;
    IF new_status = 'queued' THEN RETURN NEW; END IF;

    IF old_status = 'queued' AND new_status NOT IN ('processing', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Invalid transition from queued to %', new_status;
    ELSIF old_status = 'processing' AND new_status NOT IN ('detecting_clips', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from processing to %', new_status;
    ELSIF old_status = 'detecting_clips' AND new_status NOT IN ('cutting', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from detecting_clips to %', new_status;
    ELSIF old_status = 'cutting' AND new_status NOT IN ('captioning', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from cutting to %', new_status;
    ELSIF old_status = 'captioning' AND new_status NOT IN ('uploading', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from captioning to %', new_status;
    ELSIF old_status = 'uploading' AND new_status NOT IN ('completed', 'failed', 'dead_letter', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid transition from uploading to %', new_status;
    ELSIF old_status IN ('completed', 'failed', 'dead_letter', 'cancelled') AND new_status NOT IN ('queued') THEN
        RAISE EXCEPTION 'Terminal state % cannot transition to % without resetting to queued', old_status, new_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_status_transition ON public.jobs;
CREATE TRIGGER trigger_job_status_transition
    BEFORE UPDATE OF status ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_job_status_transition();

-- ─────────────────────────────────────────
-- STEP 15: STORAGE BUCKETS CHECK
-- ─────────────────────────────────────────
-- Create 'clips' and 'thumbnails' buckets in the Supabase dashboard:
-- Storage → New Bucket → clips (public: false)
-- Storage → New Bucket → thumbnails (public: true)

-- ─────────────────────────────────────────
-- STEP 16: NOTIFY & VERIFY
-- ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
