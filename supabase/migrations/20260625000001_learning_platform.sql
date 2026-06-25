-- Drop the initial naive reward tables
DROP TABLE IF EXISTS clip_feedback CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

-- 1. Model Versions (Experiment Manager)
CREATE TABLE IF NOT EXISTS model_versions (
  version_id text PRIMARY KEY,
  module text NOT NULL, -- e.g., 'StoryBuilder', 'Reward', 'Ranking'
  description text,
  deployed_at timestamptz DEFAULT now(),
  status text DEFAULT 'active'
);

-- 2. Reward Features Dataset (Replaces clip_feedback)
CREATE TABLE IF NOT EXISTS reward_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  
  -- The Experiment Context
  story_builder_version text,
  critic_version text,
  ranking_version text,
  
  -- The Dense Feature Vector (Normalized 0-1)
  hook_score numeric,
  context_score numeric,
  emotion_score numeric,
  curiosity_score numeric,
  visual_score numeric,
  pacing_metric numeric,
  caption_density numeric,
  
  -- Derived Rewards
  watch_time_sec numeric DEFAULT 0,
  completion_rate numeric DEFAULT 0,
  liked boolean DEFAULT false,
  shared boolean DEFAULT false,
  replayed boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now()
);

-- 3. Arena Matches Dataset
CREATE TABLE IF NOT EXISTS arena_matches (
  match_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  
  candidate_a_id uuid NOT NULL,
  candidate_b_id uuid NOT NULL,
  
  -- winner can be candidate_a_id, candidate_b_id, or 'tie'
  winner text,
  
  created_at timestamptz DEFAULT now()
);

-- 4. Clip Preferences (The Offline Training target)
CREATE TABLE IF NOT EXISTS clip_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  clip_id uuid NOT NULL,
  preference_weight numeric, -- Derived from likes, shares, arena wins
  created_at timestamptz DEFAULT now()
);

-- 5. User Embeddings (The Personalization target)
CREATE TABLE IF NOT EXISTS user_embeddings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_vector jsonb DEFAULT '[]'::jsonb, -- Array of floats representing high-dimensional preference
  model_version text,
  updated_at timestamptz DEFAULT now()
);
