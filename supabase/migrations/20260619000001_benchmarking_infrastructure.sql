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
