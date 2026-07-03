ALTER TABLE jobs ADD COLUMN IF NOT EXISTS num_clips INTEGER DEFAULT 3;
-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
