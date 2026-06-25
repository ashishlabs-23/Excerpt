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
