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
