ALTER TABLE jobs ADD COLUMN IF NOT EXISTS generation_mode text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS debug_data jsonb;
NOTIFY pgrst, 'reload schema';
