-- Create editorial_corrections table
CREATE TABLE IF NOT EXISTS editorial_corrections (
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

-- Create boundary_failure_dataset table
CREATE TABLE IF NOT EXISTS boundary_failure_dataset (
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

-- Create boundary_policy_cache table
CREATE TABLE IF NOT EXISTS boundary_policy_cache (
    narrative_type TEXT PRIMARY KEY,
    sample_count INT NOT NULL DEFAULT 0,
    avg_pre_context FLOAT NOT NULL DEFAULT 0,
    avg_post_context FLOAT NOT NULL DEFAULT 0,
    avg_start_delta FLOAT NOT NULL DEFAULT 0,
    avg_end_delta FLOAT NOT NULL DEFAULT 0,
    confidence FLOAT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Create boundary_tournament table
CREATE TABLE IF NOT EXISTS boundary_tournament (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    narrative_type TEXT NOT NULL,
    boundary_a_source TEXT NOT NULL, -- e.g., 'ai_learned', 'legacy'
    boundary_b_source TEXT NOT NULL, -- e.g., 'ai_default', 'human'
    winner TEXT NOT NULL, -- 'A', 'B', or 'TIE'
    confidence FLOAT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Migration: Policy Promotion System

CREATE TYPE policy_stage AS ENUM ('experimental', 'candidate', 'challenger', 'promoted', 'retired');

CREATE TABLE IF NOT EXISTS policy_versions (
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

CREATE TABLE IF NOT EXISTS policy_matchups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    narrative_type TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    
    policy_a_id UUID REFERENCES policy_versions(id) ON DELETE CASCADE,
    policy_b_id UUID REFERENCES policy_versions(id) ON DELETE CASCADE,
    
    winner UUID REFERENCES policy_versions(id) ON DELETE CASCADE, -- null means tie
    is_tie BOOLEAN DEFAULT FALSE,
    
    confidence FLOAT DEFAULT 1.0,
    editor_id TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Deprecate the old cache table in favor of policy_versions
-- We don't necessarily drop it here to prevent breaking older code, but new code will use policy_versions.
-- Migration: Excerpt V5 Stability Hardening

-- 1. Create job_events table for event sourcing
CREATE TABLE IF NOT EXISTS job_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);

-- 2. Create worker_heartbeats table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id TEXT NOT NULL UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    hostname TEXT NOT NULL,
    active_job TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen ON worker_heartbeats(last_seen);

-- 3. Add distributed locking columns to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP WITH TIME ZONE;

-- 4. Apply NOT NULL constraints and defaults
-- We use DO blocks to safely alter columns in case constraints already exist
DO $$
BEGIN
    -- jobs status NOT NULL
    ALTER TABLE jobs ALTER COLUMN status SET NOT NULL;
    
    -- jobs progress DEFAULT 0 and NOT NULL
    ALTER TABLE jobs ALTER COLUMN progress SET DEFAULT 0;
    ALTER TABLE jobs ALTER COLUMN progress SET NOT NULL;
    
    -- clips constraints
    ALTER TABLE clips ALTER COLUMN job_id SET NOT NULL;
    ALTER TABLE clips ALTER COLUMN storage_path SET NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);

-- 6. Enforce State Machine Transitions via Trigger
CREATE OR REPLACE FUNCTION enforce_job_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    old_status TEXT;
    new_status TEXT;
BEGIN
    old_status := OLD.status;
    new_status := NEW.status;

    -- If status hasn't changed, allow it
    IF old_status = new_status THEN
        RETURN NEW;
    END IF;

    -- Allow any state to be reset back to 'queued' (retries, resets)
    IF new_status = 'queued' THEN
        RETURN NEW;
    END IF;

    -- State machine rules
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

DROP TRIGGER IF EXISTS trigger_job_status_transition ON jobs;
CREATE TRIGGER trigger_job_status_transition
    BEFORE UPDATE OF status ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_job_status_transition();
-- Migration: Phase A - Benchmarking Infrastructure & Scorecards

-- 1. clip_scorecards
CREATE TABLE IF NOT EXISTS clip_scorecards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clip_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    
    -- Coverage & Accuracy
    story_completeness FLOAT,
    boundary_accuracy FLOAT,
    replay_coverage BOOLEAN,
    reaction_coverage BOOLEAN,
    buildup_coverage BOOLEAN,
    chance_coverage BOOLEAN,
    outcome_coverage BOOLEAN,
    
    -- Subjective Quality
    publishability FLOAT,
    editor_score FLOAT,
    editor_agreement FLOAT,
    narrative_strength FLOAT,
    emotion_score FLOAT,
    tension_score FLOAT,
    
    -- Technical Metrics
    clip_duration FLOAT,
    cache_hit BOOLEAN,
    generation_mode TEXT,
    render_time_ms INT,
    ffmpeg_time_ms INT,
    runtime_ms INT,
    quality_gate_passed BOOLEAN,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clip_scorecards_clip_id ON clip_scorecards(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_scorecards_job_id ON clip_scorecards(job_id);

-- 2. ground_truth_clips
CREATE TABLE IF NOT EXISTS ground_truth_clips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL,
    story_type TEXT, -- e.g., 'Late Winner', 'Counter Attack'
    
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

CREATE INDEX IF NOT EXISTS idx_ground_truth_clips_video_id ON ground_truth_clips(video_id);

-- 3. engine_shadow_results
CREATE TABLE IF NOT EXISTS engine_shadow_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    engine_name TEXT NOT NULL,
    
    runtime_ms INT NOT NULL,
    prediction JSONB DEFAULT '{}'::jsonb,
    confidence FLOAT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engine_shadow_results_job_clip ON engine_shadow_results(job_id, clip_id);
CREATE INDEX IF NOT EXISTS idx_engine_shadow_results_engine ON engine_shadow_results(engine_name);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS generation_mode text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS debug_data jsonb;
NOTIFY pgrst, 'reload schema';
CREATE TABLE IF NOT EXISTS schema_info (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_info (version) VALUES ('v3.0.0') ON CONFLICT DO NOTHING;
-- Migration: Create render_worker_heartbeats

CREATE TABLE IF NOT EXISTS render_worker_heartbeats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_id TEXT NOT NULL UNIQUE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_render_worker_heartbeats_last_heartbeat ON render_worker_heartbeats(last_heartbeat);

-- Allow upsert by making worker_id unique
-- (already done via UNIQUE constraint above)

NOTIFY pgrst, 'reload schema';
-- Migration to create the decoupled voiceover_clips table
-- Do NOT establish foreign keys to jobs or render_jobs to ensure isolation.

CREATE TABLE voiceover_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  provider text NOT NULL,
  voice text NOT NULL,
  narration_text text NOT NULL,
  audio_path text,
  video_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying by the polling worker and gallery
CREATE INDEX idx_voiceover_clips_status ON voiceover_clips(status);
CREATE INDEX idx_voiceover_clips_source_clip_id ON voiceover_clips(source_clip_id);
CREATE INDEX idx_voiceover_clips_user_id ON voiceover_clips(user_id);

-- RLS Policies
ALTER TABLE voiceover_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voiceover clips"
  ON voiceover_clips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voiceover clips"
  ON voiceover_clips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voiceover clips"
  ON voiceover_clips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voiceover clips"
  ON voiceover_clips FOR DELETE
  USING (auth.uid() = user_id);
-- Alter voiceover_clips to support script_mode and tracking generation duration.
ALTER TABLE voiceover_clips
ADD COLUMN IF NOT EXISTS script_mode text DEFAULT 'custom';

ALTER TABLE voiceover_clips
ADD COLUMN IF NOT EXISTS generation_time_ms integer;
-- Create voiceover_feedback table for future analytics and learning loop.
CREATE TABLE IF NOT EXISTS voiceover_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voiceover_id uuid NOT NULL REFERENCES voiceover_clips(id) ON DELETE CASCADE,
  provider text,
  language text,
  style text,
  script_mode text,
  generation_time_ms integer,
  play_count integer DEFAULT 0,
  liked boolean DEFAULT false,
  disliked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE voiceover_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voiceover feedback"
  ON voiceover_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own voiceover feedback"
  ON voiceover_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own voiceover feedback"
  ON voiceover_feedback FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );
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
-- Create clip_feedback table to track telemetry and Arena performance
CREATE TABLE IF NOT EXISTS clip_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  watch_time_sec numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0.0,
  liked boolean DEFAULT false,
  shared boolean DEFAULT false,
  replayed boolean DEFAULT false,
  arena_wins integer DEFAULT 0,
  arena_losses integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create user_preferences to map users to dynamically shifting Persona Rankings
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_pacing numeric DEFAULT 50.0, -- 0-100 scale (Loose -> Tight)
  preferred_context_weight numeric DEFAULT 50.0,
  preferred_emotion_weight numeric DEFAULT 50.0,
  historical_weights jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE clip_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own clip feedback"
  ON clip_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own clip feedback"
  ON clip_feedback FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);
-- Drop the initial naive reward tables
DROP TABLE IF EXISTS clip_feedback CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

-- 1. Model Versions (Experiment Manager)
CREATE TABLE IF NOT EXISTS model_versions (
  version_id text PRIMARY KEY,
  module text NOT NULL, -- e.g., 'StoryBuilder', 'Reward', 'Ranking'
  description text,
  deployed_at timestamptz DEFAULT now(),
  status text DEFAULT 'active'
);

-- 2. Reward Features Dataset (Replaces clip_feedback)
CREATE TABLE IF NOT EXISTS reward_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  
  -- The Experiment Context
  story_builder_version text,
  critic_version text,
  ranking_version text,
  
  -- The Dense Feature Vector (Normalized 0-1)
  hook_score numeric,
  context_score numeric,
  emotion_score numeric,
  curiosity_score numeric,
  visual_score numeric,
  pacing_metric numeric,
  caption_density numeric,
  
  -- Derived Rewards
  watch_time_sec numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0,
  liked boolean DEFAULT false,
  shared boolean DEFAULT false,
  replayed boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now()
);

-- 3. Arena Matches Dataset
CREATE TABLE IF NOT EXISTS arena_matches (
  match_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  
  candidate_a_id uuid NOT NULL,
  candidate_b_id uuid NOT NULL,
  
  -- winner can be candidate_a_id, candidate_b_id, or 'tie'
  winner text,
  
  created_at timestamptz DEFAULT now()
);

-- 4. Clip Preferences (The Offline Training target)
CREATE TABLE IF NOT EXISTS clip_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  clip_id uuid NOT NULL,
  preference_weight numeric, -- Derived from likes, shares, arena wins
  created_at timestamptz DEFAULT now()
);

-- 5. User Embeddings (The Personalization target)
CREATE TABLE IF NOT EXISTS user_embeddings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_vector jsonb DEFAULT '[]'::jsonb, -- Array of floats representing high-dimensional preference
  model_version text,
  updated_at timestamptz DEFAULT now()
);
