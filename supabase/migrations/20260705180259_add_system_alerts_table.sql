-- System Alerts table to support ACKNOWLEDGED/RESOLVED states and operational history
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_code text NOT NULL, -- e.g. WORKER_CRASH_LOOP, HIGH_QUEUE_PRESSURE
  severity text NOT NULL, -- error, warning, info
  message text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED
  acknowledged_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Index for querying open alerts quickly
CREATE INDEX IF NOT EXISTS idx_system_alerts_state ON public.system_alerts (state) WHERE state = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_system_alerts_alert_code ON public.system_alerts (alert_code);

-- RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" 
ON public.system_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON public.system_alerts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" 
ON public.system_alerts FOR UPDATE TO authenticated USING (true);
