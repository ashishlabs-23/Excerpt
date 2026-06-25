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
