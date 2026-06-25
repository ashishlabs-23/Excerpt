-- V5 Hardening Part 4: Telemetry Schema Protections
-- Evidence Mode found that missing telemetry columns crash the state machine
-- This ensures telemetry can be safely written.

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS debug_data JSONB;

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS performance_metrics JSONB;

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS pipeline_summary JSONB;

-- Initialize empty values for existing rows
UPDATE jobs
SET debug_data='{}'::jsonb
WHERE debug_data IS NULL;

UPDATE jobs
SET performance_metrics='{}'::jsonb
WHERE performance_metrics IS NULL;

UPDATE jobs
SET pipeline_summary='{}'::jsonb
WHERE pipeline_summary IS NULL;
