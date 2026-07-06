import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // All clips - check what's in DB
  const { data: allClips } = await db
    .from('clips')
    .select('id, job_id, status, storage_path, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('=== ALL CLIPS IN DB ===');
  console.log(JSON.stringify(allClips, null, 2));

  // Active render_jobs
  const { data: renders } = await db
    .from('render_jobs')
    .select('id, job_id, status, error, attempt_count, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log('\n=== RECENT RENDER JOBS ===');
  console.log(JSON.stringify(renders, null, 2));

  // Check the new PV-3 job progress
  const { data: newJob } = await db
    .from('jobs')
    .select('id, status, progress, failed_reason, updated_at')
    .eq('id', '67982ae5-ec3c-46bc-8b00-1bcf208e768d')
    .single();
  console.log('\n=== NEW PV-3 JOB ===');
  console.log(JSON.stringify(newJob, null, 2));
}

run().catch(console.error);
