-- Excerpt Human Preference & Telemetry Database Schema

CREATE TABLE IF NOT EXISTS human_preferences (
    id SERIAL PRIMARY KEY,
    matchup_uuid VARCHAR(255) NOT NULL,
    video_type VARCHAR(50) NOT NULL,            -- e.g. 'football', 'basketball', 'podcast'
    platform VARCHAR(50) NOT NULL,              -- e.g. 'tiktok', 'shorts', 'reels'
    clip_duration DECIMAL(5,2) NOT NULL,
    caption_style VARCHAR(50) NOT NULL,         -- e.g. 'neon', 'submagic'
    editor_strategy VARCHAR(50) NOT NULL,       -- e.g. 'emotion_first', 'story_first'
    winner_clip_id VARCHAR(255) NOT NULL,
    loser_clip_id VARCHAR(255) NOT NULL,
    winner_reason VARCHAR(100) NOT NULL,        -- 'better_crop', 'better_caption', 'better_story', 'better_pacing', 'better_hook'
    editor_user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_training_samples (
    id SERIAL PRIMARY KEY,
    matchup_uuid VARCHAR(255) NOT NULL,
    chosen_features JSONB NOT NULL,             -- Fused metrics of the winning clip
    rejected_features JSONB NOT NULL,           -- Fused metrics of the losing clip
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_telemetry (
    id SERIAL PRIMARY KEY,
    job_uuid VARCHAR(255) NOT NULL,
    render_time_ms INT NOT NULL,
    gpu_memory_used_mb INT NOT NULL,
    failure_rate DECIMAL(5,2) DEFAULT 0.0,
    crop_repair_count INT DEFAULT 0,
    caption_repair_count INT DEFAULT 0,
    critic_score DECIMAL(5,2) NOT NULL,
    candidate_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
