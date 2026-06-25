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
