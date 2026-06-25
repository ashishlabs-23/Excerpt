-- Create clip_feedback table to track telemetry and Arena performance
CREATE TABLE IF NOT EXISTS clip_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  watch_time_sec numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0.0,
  liked boolean DEFAULT false,
  shared boolean DEFAULT false,
  replayed boolean DEFAULT false,
  arena_wins integer DEFAULT 0,
  arena_losses integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create user_preferences to map users to dynamically shifting Persona Rankings
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_pacing numeric DEFAULT 50.0, -- 0-100 scale (Loose -> Tight)
  preferred_context_weight numeric DEFAULT 50.0,
  preferred_emotion_weight numeric DEFAULT 50.0,
  historical_weights jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE clip_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own clip feedback"
  ON clip_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own clip feedback"
  ON clip_feedback FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);
