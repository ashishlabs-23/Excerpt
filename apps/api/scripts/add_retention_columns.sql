-- Add expires_at column and index to clips table for 24-hour ephemeral retention
ALTER TABLE clips ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill expires_at for existing clips where expires_at IS NULL (created_at + 24 hours)
UPDATE clips
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL AND created_at IS NOT NULL;

-- Index for fast retention sweeper scans and gallery filtering
CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON clips(expires_at);
