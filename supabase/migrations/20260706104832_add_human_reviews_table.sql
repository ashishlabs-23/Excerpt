-- Create Human Reviews table
CREATE TABLE IF NOT EXISTS public.human_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL,
  clip_id text NOT NULL,
  accepted boolean DEFAULT false,
  edited boolean DEFAULT false,
  deleted boolean DEFAULT false,
  regenerated boolean DEFAULT false,
  rating numeric(3, 1),
  edited_duration_ms integer,
  edited_start_delta numeric(5, 2),
  edited_end_delta numeric(5, 2),
  subtitle_changes boolean DEFAULT false,
  crop_changes boolean DEFAULT false,
  edit_reason text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Quality Arena Preferences Table
CREATE TABLE IF NOT EXISTS public.human_arena (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL,
  candidate_a_id text NOT NULL,
  candidate_b_id text NOT NULL,
  winner_id text NOT NULL,
  time_taken_ms integer,
  reviewer text,
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS human_reviews_job_id_idx ON public.human_reviews(job_id);
CREATE INDEX IF NOT EXISTS human_reviews_rating_idx ON public.human_reviews(rating);
CREATE INDEX IF NOT EXISTS human_reviews_created_at_idx ON public.human_reviews(created_at);

CREATE INDEX IF NOT EXISTS human_arena_job_id_idx ON public.human_arena(job_id);

-- RLS
ALTER TABLE public.human_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own reviews" ON public.human_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read their own reviews" ON public.human_reviews FOR SELECT USING (true);

ALTER TABLE public.human_arena ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own arena votes" ON public.human_arena FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read their own arena votes" ON public.human_arena FOR SELECT USING (true);

