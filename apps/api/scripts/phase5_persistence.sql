-- Migration: Phase 5 Intelligence Persistence

-- Table for persisting editorial narratives
CREATE TABLE IF NOT EXISTS narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    situation_id VARCHAR(255) NOT NULL,
    narrative_type VARCHAR(50) NOT NULL,
    narrative_strength FLOAT NOT NULL,
    publishability_score FLOAT NOT NULL,
    confidence FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for persisting emotion profiles
CREATE TABLE IF NOT EXISTS emotion_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    situation_id VARCHAR(255) NOT NULL,
    crowd_eruption FLOAT NOT NULL,
    commentator_excitement FLOAT NOT NULL,
    player_celebration FLOAT NOT NULL,
    bench_reaction FLOAT NOT NULL,
    manager_reaction FLOAT NOT NULL,
    emotion_score FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for persisting tension profiles
CREATE TABLE IF NOT EXISTS tension_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    situation_id VARCHAR(255) NOT NULL,
    start_tension FLOAT NOT NULL,
    peak_tension FLOAT NOT NULL,
    growth_rate FLOAT NOT NULL,
    tension_area FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for persisting story graphs
CREATE TABLE IF NOT EXISTS story_graphs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for persisting boundary policies
CREATE TABLE IF NOT EXISTS boundary_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    narrative_type VARCHAR(50) NOT NULL,
    pre_context FLOAT NOT NULL,
    post_context FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookup by job_id
CREATE INDEX IF NOT EXISTS idx_narratives_job_id ON narratives(job_id);
CREATE INDEX IF NOT EXISTS idx_emotion_profiles_job_id ON emotion_profiles(job_id);
CREATE INDEX IF NOT EXISTS idx_tension_profiles_job_id ON tension_profiles(job_id);
CREATE INDEX IF NOT EXISTS idx_story_graphs_job_id ON story_graphs(job_id);
CREATE INDEX IF NOT EXISTS idx_boundary_policies_job_id ON boundary_policies(job_id);
