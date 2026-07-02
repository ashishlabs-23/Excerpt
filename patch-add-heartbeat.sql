-- Add heartbeat_at column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;
