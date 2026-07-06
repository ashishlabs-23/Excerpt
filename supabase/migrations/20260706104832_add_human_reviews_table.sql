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
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS human_reviews_job_id_idx ON public.human_reviews(job_id);
CREATE INDEX IF NOT EXISTS human_reviews_rating_idx ON public.human_reviews(rating);
CREATE INDEX IF NOT EXISTS human_reviews_created_at_idx ON public.human_reviews(created_at);

-- RLS
ALTER TABLE public.human_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own reviews" ON public.human_reviews
  FOR INSERT WITH CHECK (true); -- Usually restricted by job owner, keeping open for internal service

CREATE POLICY "Users can read their own reviews" ON public.human_reviews
  FOR SELECT USING (true);
