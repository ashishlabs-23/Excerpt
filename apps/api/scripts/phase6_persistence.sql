-- Migration: Phase 6 Persistence

-- Table for tracking editor boundary adjustments
CREATE TABLE IF NOT EXISTS boundary_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    clip_id VARCHAR(255) NOT NULL,
    narrative_type VARCHAR(50) NOT NULL,
    predicted_start FLOAT NOT NULL,
    predicted_end FLOAT NOT NULL,
    editor_adjusted_start FLOAT NOT NULL,
    editor_adjusted_end FLOAT NOT NULL,
    start_error FLOAT NOT NULL,
    end_error FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking generic UI editor feedback (thumbs up, too late, wrong story, etc)
CREATE TABLE IF NOT EXISTS editor_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    clip_id VARCHAR(255) NOT NULL,
    feedback_type VARCHAR(50) NOT NULL, -- e.g., 'PERFECT', 'START_TOO_LATE', 'MISSING_REPLAY'
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_boundary_failures_clip_id ON boundary_failures(clip_id);
CREATE INDEX IF NOT EXISTS idx_boundary_failures_narrative ON boundary_failures(narrative_type);
CREATE INDEX IF NOT EXISTS idx_editor_feedback_clip_id ON editor_feedback(clip_id);
