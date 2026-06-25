-- Migration to create the decoupled voiceover_clips table
-- Do NOT establish foreign keys to jobs or render_jobs to ensure isolation.

CREATE TABLE voiceover_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  provider text NOT NULL,
  voice text NOT NULL,
  narration_text text NOT NULL,
  audio_path text,
  video_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying by the polling worker and gallery
CREATE INDEX idx_voiceover_clips_status ON voiceover_clips(status);
CREATE INDEX idx_voiceover_clips_source_clip_id ON voiceover_clips(source_clip_id);
CREATE INDEX idx_voiceover_clips_user_id ON voiceover_clips(user_id);

-- RLS Policies
ALTER TABLE voiceover_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voiceover clips"
  ON voiceover_clips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voiceover clips"
  ON voiceover_clips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voiceover clips"
  ON voiceover_clips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voiceover clips"
  ON voiceover_clips FOR DELETE
  USING (auth.uid() = user_id);
