-- Alter voiceover_clips to support script_mode and tracking generation duration.
ALTER TABLE voiceover_clips
ADD COLUMN IF NOT EXISTS script_mode text DEFAULT 'custom';

ALTER TABLE voiceover_clips
ADD COLUMN IF NOT EXISTS generation_time_ms integer;
