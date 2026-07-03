ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_url TEXT;
NOTIFY pgrst, 'reload schema';
