-- 1. Enable RLS on the 4 tables
ALTER TABLE public.nexus_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_enhancements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voiceover_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voiceover_provider_metrics ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS nexus_signals_owner_policy ON public.nexus_signals;
DROP POLICY IF EXISTS clip_enhancements_auth_policy ON public.clip_enhancements;
DROP POLICY IF EXISTS voiceover_scripts_owner_policy ON public.voiceover_scripts;
DROP POLICY IF EXISTS voiceover_provider_metrics_auth_policy ON public.voiceover_provider_metrics;

-- 3. Create RLS Policies
-- nexus_signals: Allow read/write if the user owns the corresponding job
CREATE POLICY nexus_signals_owner_policy ON public.nexus_signals
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.jobs WHERE public.jobs.id = job_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.jobs WHERE public.jobs.id = job_id
    )
  );

-- voiceover_scripts: Allow read/write if the user owns the corresponding segment
CREATE POLICY voiceover_scripts_owner_policy ON public.voiceover_scripts
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.voiceover_segments WHERE public.voiceover_segments.id = segment_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.voiceover_segments WHERE public.voiceover_segments.id = segment_id
    )
  );

-- clip_enhancements: Global read/write for all authenticated users
CREATE POLICY clip_enhancements_auth_policy ON public.clip_enhancements
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- voiceover_provider_metrics: Allow insert/read to all authenticated users
CREATE POLICY voiceover_provider_metrics_auth_policy ON public.voiceover_provider_metrics
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
