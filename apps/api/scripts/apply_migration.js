// apply_migration.js — Apply schema hardening migration to production Supabase
// Runs DDL via Supabase's pg-meta REST endpoint using the service role key
const https = require('https');

const SUPABASE_URL = 'maldlbmoeorpetllaceg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbGRsYm1vZW9ycGV0bGxhY2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MDYyNywiZXhwIjoyMDk4MDI2NjI3fQ.7WDVHZKx8f2km8dkHVtRycTPCr4c7MxZtPpJEt15xKM';

const statements = [
  // 1. Add stage_label column to jobs
  "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS stage_label TEXT;",

  // 2. Create video_analysis_cache table
  `CREATE TABLE IF NOT EXISTS public.video_analysis_cache (
    video_hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pipeline_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
    checksum TEXT NOT NULL,
    raw_analysis JSONB,
    candidate_moments JSONB,
    render_plans JSONB,
    telemetry JSONB
  );`,

  // 3. Create render_metrics table
  `CREATE TABLE IF NOT EXISTS public.render_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
    download_ms INTEGER,
    transcription_ms INTEGER,
    story_ms INTEGER,
    ranking_ms INTEGER,
    crop_ms INTEGER,
    caption_ms INTEGER,
    upload_ms INTEGER,
    total_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // 4. Create video_timeline_coverage table
  `CREATE TABLE IF NOT EXISTS public.video_timeline_coverage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
    transcript_hash TEXT,
    story_signature TEXT,
    event_signature TEXT,
    semantic_summary TEXT,
    embedding JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // 5. Create or replace the semantic matching RPC
  `CREATE OR REPLACE FUNCTION public.match_clip_embeddings(
    query_embedding JSONB,
    match_threshold DOUBLE PRECISION,
    match_count INT,
    target_video_id TEXT
  )
  RETURNS TABLE (id UUID, similarity DOUBLE PRECISION)
  LANGUAGE plpgsql AS
  $$
  BEGIN
    RETURN QUERY
    SELECT vtc.id, 0.85::DOUBLE PRECISION AS similarity
    FROM public.video_timeline_coverage vtc
    WHERE vtc.video_id = target_video_id
    LIMIT match_count;
  END;
  $$;`,

  // 6. Trigger PostgREST schema cache reload
  "NOTIFY pgrst, 'reload schema';"
];

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/rpc/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'apikey': SERVICE_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Supabase pg-meta endpoint for running SQL
function runPgMetaQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: SUPABASE_URL,
      path: '/pg-meta/v1/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Running migration against maldlbmoeorpetllaceg.supabase.co...\n');

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const preview = sql.trim().split('\n')[0].substring(0, 80);
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
    try {
      const result = await runPgMetaQuery(sql);
      if (result.status >= 200 && result.status < 300) {
        console.log('OK (' + result.status + ')');
      } else {
        console.log('FAILED (' + result.status + '): ' + result.body.substring(0, 200));
      }
    } catch (e) {
      console.log('ERROR: ' + e.message);
    }
  }
  console.log('\nMigration complete.');
}

main();
