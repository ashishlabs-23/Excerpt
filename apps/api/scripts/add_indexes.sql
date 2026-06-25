-- SQL migration script to optimize database performance by indexing foreign keys
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
