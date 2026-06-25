-- Create voiceover_feedback table for future analytics and learning loop.
CREATE TABLE IF NOT EXISTS voiceover_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voiceover_id uuid NOT NULL REFERENCES voiceover_clips(id) ON DELETE CASCADE,
  provider text,
  language text,
  style text,
  script_mode text,
  generation_time_ms integer,
  play_count integer DEFAULT 0,
  liked boolean DEFAULT false,
  disliked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE voiceover_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voiceover feedback"
  ON voiceover_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own voiceover feedback"
  ON voiceover_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own voiceover feedback"
  ON voiceover_feedback FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM voiceover_clips
      WHERE voiceover_clips.id = voiceover_feedback.voiceover_id
      AND voiceover_clips.user_id = auth.uid()
    )
  );
