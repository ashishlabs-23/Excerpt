import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const localConnectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const tablesSql = `
-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.voiceover_feedback CASCADE;
DROP TABLE IF EXISTS public.voiceover_clips CASCADE;
DROP TABLE IF EXISTS public.render_jobs CASCADE;
DROP TABLE IF EXISTS public.clips CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.render_cache CASCADE;

-- Create render_cache table
CREATE TABLE public.render_cache (
    candidate_hash text PRIMARY KEY,
    storage_path text NOT NULL,
    thumbnail_path text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create jobs table
CREATE TABLE public.jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    status text NOT NULL DEFAULT 'pending',
    video_url text NOT NULL,
    title text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    progress integer DEFAULT 0,
    num_clips integer DEFAULT 3,
    transcription text,
    transcription_status text,
    failed_reason text,
    payload jsonb DEFAULT '{}'::jsonb,
    locked_by text,
    locked_at timestamp with time zone,
    job_type text DEFAULT 'clipping'::text,
    current_stage text,
    stage_label text,
    result jsonb,
    performance_metrics jsonb,
    worker_id text,
    debug_data jsonb,
    pipeline_summary jsonb
);

-- Create clips table
CREATE TABLE public.clips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
    video_url text,
    start_time double precision NOT NULL,
    end_time double precision NOT NULL,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    caption text,
    title text,
    thumbnail_url text,
    validation_status text DEFAULT 'passed'::text,
    is_archived boolean DEFAULT false,
    analysis_status text DEFAULT 'completed'::text,
    storage_path text,
    thumbnail_storage_path text,
    generation_key text,
    status text DEFAULT 'pending'::text
);

-- Create render_jobs table
CREATE TABLE public.render_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
    clip_id uuid REFERENCES public.clips(id) ON DELETE CASCADE,
    payload jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    attempt_count integer DEFAULT 0,
    last_error text,
    locked_by text,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create voiceover_clips table
CREATE TABLE public.voiceover_clips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_clip_id uuid REFERENCES public.clips(id) ON DELETE CASCADE,
    user_id uuid,
    status text NOT NULL DEFAULT 'pending'::text,
    provider text NOT NULL,
    voice text NOT NULL,
    narration_text text NOT NULL,
    audio_path text,
    video_path text,
    metadata jsonb DEFAULT '{}'::jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    script_mode text DEFAULT 'custom'::text,
    generation_time_ms integer
);

-- Create voiceover_feedback table
CREATE TABLE public.voiceover_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voiceover_id uuid REFERENCES public.voiceover_clips(id) ON DELETE CASCADE UNIQUE,
    source_clip_id uuid REFERENCES public.clips(id) ON DELETE CASCADE,
    provider text,
    language text,
    style text,
    script_mode text,
    script_length integer,
    audio_duration numeric,
    video_duration numeric,
    generation_time_ms integer,
    play_count integer DEFAULT 0,
    liked boolean DEFAULT false,
    disliked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Recreate functions
CREATE OR REPLACE FUNCTION public.claim_next_job(worker_id_text text)
 RETURNS SETOF public.jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
      AND (
        payload->'retry'->>'next_retry_at' IS NULL
        OR (payload->'retry'->>'next_retry_at')::timestamptz <= now()
      )
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.jobs jobs
  SET
    status = 'processing',
    locked_by = worker_id_text,
    worker_id = worker_id_text,
    locked_at = now(),
    updated_at = now()
  FROM next_job
  WHERE jobs.id = next_job.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_render_job(worker_id_text text)
 RETURNS SETOF public.render_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id
    FROM public.render_jobs
    WHERE status IN ('pending', 'retrying')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.render_jobs rj
  SET
    status = 'rendering',
    locked_by = worker_id_text,
    locked_at = now(),
    updated_at = now(),
    attempt_count = attempt_count + 1
  FROM next_job
  WHERE rj.id = next_job.id
  RETURNING rj.*;
END;
$$;

-- Create system validator schema info table
CREATE TABLE IF NOT EXISTS public.schema_info (
    id serial PRIMARY KEY,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

INSERT INTO public.schema_info (version) VALUES ('v3.0.0');

-- Ensure storage buckets exist
INSERT INTO storage.buckets (id, name, public) VALUES ('clips', 'clips', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true) ON CONFLICT (id) DO NOTHING;
`;

function parseDumpFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    console.log(`Warning: file not found ${filePath}`);
    return [];
  }
  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const outerJson = JSON.parse(rawContent);
    const resultStr = outerJson.result;

    const startIdx = resultStr.indexOf('[');
    const endIdx = resultStr.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      console.log(`Could not find valid JSON array brackets in ${filePath}`);
      return [];
    }
    const jsonStr = resultStr.slice(startIdx, endIdx + 1);
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error(`Failed to parse JSON for ${filePath}:`, err.message);
    return [];
  }
}

async function run() {
  const client = new Client({ connectionString: localConnectionString });
  await client.connect();
  console.log('Connected to local database.');

  console.log('Recreating tables and functions...');
  await client.query(tablesSql);
  console.log('Tables and functions recreated.');

  // Load datasets
  const jobsData = parseDumpFile('C:/Users/Ashish/.gemini/antigravity-ide/brain/1b0768ac-7d32-49d8-a292-1c51004f245a/.system_generated/steps/490/output.txt');
  const clipsData = parseDumpFile('C:/Users/Ashish/.gemini/antigravity-ide/brain/1b0768ac-7d32-49d8-a292-1c51004f245a/.system_generated/steps/492/output.txt');
  const renderJobsData = parseDumpFile('C:/Users/Ashish/.gemini/antigravity-ide/brain/1b0768ac-7d32-49d8-a292-1c51004f245a/.system_generated/steps/500/output.txt');
  const renderCacheData = parseDumpFile('C:/Users/Ashish/.gemini/antigravity-ide/brain/1b0768ac-7d32-49d8-a292-1c51004f245a/.system_generated/steps/504/output.txt');
  const voiceoverClipsData = parseDumpFile('C:/Users/Ashish/.gemini/antigravity-ide/brain/1b0768ac-7d32-49d8-a292-1c51004f245a/.system_generated/steps/494/output.txt');

  console.log(`Loaded from dumps:\n- jobs: ${jobsData.length}\n- clips: ${clipsData.length}\n- render_jobs: ${renderJobsData.length}\n- render_cache: ${renderCacheData.length}\n- voiceover_clips: ${voiceoverClipsData.length}`);

  // Insert jobs
  console.log('Inserting jobs...');
  for (const job of jobsData) {
    await client.query(
      `INSERT INTO public.jobs (
        id, user_id, status, video_url, title, created_at, updated_at, progress, num_clips, 
        transcription, transcription_status, failed_reason, payload, locked_by, locked_at, 
        job_type, current_stage, stage_label, result, performance_metrics, worker_id, 
        debug_data, pipeline_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        job.id, job.user_id, job.status, job.video_url, job.title, job.created_at, job.updated_at, job.progress, job.num_clips,
        job.transcription, job.transcription_status, job.failed_reason, typeof job.payload === 'object' ? JSON.stringify(job.payload) : job.payload,
        job.locked_by, job.locked_at, job.job_type, job.current_stage, job.stage_label,
        typeof job.result === 'object' ? JSON.stringify(job.result) : job.result,
        typeof job.performance_metrics === 'object' ? JSON.stringify(job.performance_metrics) : job.performance_metrics,
        job.worker_id,
        typeof job.debug_data === 'object' ? JSON.stringify(job.debug_data) : job.debug_data,
        typeof job.pipeline_summary === 'object' ? JSON.stringify(job.pipeline_summary) : job.pipeline_summary
      ]
    );
  }

  // Insert clips
  console.log('Inserting clips...');
  for (const clip of clipsData) {
    await client.query(
      `INSERT INTO public.clips (
        id, job_id, video_url, start_time, end_time, content, metadata, created_at, 
        caption, title, thumbnail_url, validation_status, is_archived, analysis_status, 
        storage_path, thumbnail_storage_path, generation_key, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        clip.id, clip.job_id, clip.video_url, clip.start_time, clip.end_time, clip.content,
        typeof clip.metadata === 'object' ? JSON.stringify(clip.metadata) : clip.metadata,
        clip.created_at, clip.caption, clip.title, clip.thumbnail_url, clip.validation_status,
        clip.is_archived, clip.analysis_status, clip.storage_path, clip.thumbnail_storage_path,
        clip.generation_key, clip.status
      ]
    );
  }

  // Insert render_jobs
  console.log('Inserting render_jobs...');
  const clipIds = new Set(clipsData.map(c => c.id));
  for (const rj of renderJobsData) {
    const validClipId = clipIds.has(rj.clip_id) ? rj.clip_id : null;
    await client.query(
      `INSERT INTO public.render_jobs (
        id, job_id, clip_id, payload, status, attempt_count, last_error, locked_by, locked_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        rj.id, rj.job_id, validClipId,
        typeof rj.payload === 'object' ? JSON.stringify(rj.payload) : rj.payload,
        rj.status, rj.attempt_count, rj.last_error, rj.locked_by, rj.locked_at, rj.created_at, rj.updated_at
      ]
    );
  }

  // Insert render_cache
  console.log('Inserting render_cache...');
  for (const rc of renderCacheData) {
    await client.query(
      `INSERT INTO public.render_cache (
        candidate_hash, storage_path, thumbnail_path, created_at
      ) VALUES ($1, $2, $3, $4)`,
      [rc.candidate_hash, rc.storage_path, rc.thumbnail_path, rc.created_at]
    );
  }

  // Insert voiceover_clips
  console.log('Inserting voiceover_clips...');
  for (const vc of voiceoverClipsData) {
    if (!clipIds.has(vc.source_clip_id)) {
      console.log(`Skipping voiceover_clip ${vc.id} because source clip ${vc.source_clip_id} is not present.`);
      continue;
    }
    await client.query(
      `INSERT INTO public.voiceover_clips (
        id, source_clip_id, user_id, status, provider, voice, narration_text, audio_path, video_path, 
        metadata, error_message, created_at, updated_at, script_mode, generation_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        vc.id, vc.source_clip_id, vc.user_id, vc.status, vc.provider, vc.voice, vc.narration_text, vc.audio_path, vc.video_path,
        typeof vc.metadata === 'object' ? JSON.stringify(vc.metadata) : vc.metadata,
        vc.error_message, vc.created_at, vc.updated_at, vc.script_mode, vc.generation_time_ms
      ]
    );
  }

  console.log('Database synchronization completed successfully!');
  await client.end();
}

run().catch(async (err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
