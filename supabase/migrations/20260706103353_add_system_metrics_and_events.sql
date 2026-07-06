-- Enable pg_cron if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS system_metrics_daily (
    date DATE PRIMARY KEY,
    jobs_processed INT DEFAULT 0,
    jobs_successful INT DEFAULT 0,
    jobs_failed INT DEFAULT 0,
    success_rate FLOAT DEFAULT 0.0,
    avg_processing_ms INT DEFAULT 0,
    p95_processing_ms INT DEFAULT 0,
    avg_download_ms INT DEFAULT 0,
    avg_transcription_ms INT DEFAULT 0,
    avg_render_ms INT DEFAULT 0,
    avg_upload_ms INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    worker_restarts INT DEFAULT 0,
    ai_provider_fallbacks INT DEFAULT 0,
    storage_cleanup_failures INT DEFAULT 0,
    download_failures INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    event_type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events (event_type);

-- Function to aggregate daily metrics from the jobs table (and others if needed)
CREATE OR REPLACE FUNCTION aggregate_daily_system_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    target_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    INSERT INTO system_metrics_daily (
        date,
        jobs_processed,
        jobs_successful,
        jobs_failed,
        success_rate,
        avg_processing_ms,
        retry_count
    )
    SELECT 
        target_date,
        COUNT(id),
        COUNT(id) FILTER (WHERE status = 'completed'),
        COUNT(id) FILTER (WHERE status IN ('failed', 'dead_letter', 'cancelled')),
        COALESCE((COUNT(id) FILTER (WHERE status = 'completed')::FLOAT / NULLIF(COUNT(id), 0)) * 100, 0),
        COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) FILTER (WHERE status = 'completed'), 0),
        COALESCE(SUM(retry_count), 0)
    FROM jobs
    WHERE DATE(created_at) = target_date
    ON CONFLICT (date) DO UPDATE SET
        jobs_processed = EXCLUDED.jobs_processed,
        jobs_successful = EXCLUDED.jobs_successful,
        jobs_failed = EXCLUDED.jobs_failed,
        success_rate = EXCLUDED.success_rate,
        avg_processing_ms = EXCLUDED.avg_processing_ms,
        retry_count = EXCLUDED.retry_count;
END;
$$;

-- Schedule the aggregation to run daily at 1 AM using pg_cron
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Safely unschedule if it exists, then schedule
        PERFORM cron.unschedule('aggregate_daily_metrics');
        PERFORM cron.schedule('aggregate_daily_metrics', '0 1 * * *', 'SELECT aggregate_daily_system_metrics()');
    END IF;
END $$;
