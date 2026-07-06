import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Inspect the payload of a failed render_job to see if videoUrl is present
  const { data } = await db
    .from('render_jobs')
    .select('id, job_id, payload, status, error')
    .in('id', [
      '05dd1f82-acc6-4c76-b20d-0543232d8e8e', // known failed job
      '231aaa7c-09fd-4e5f-94f5-da1885d32784'
    ]);
  console.log('=== RENDER JOB PAYLOADS ===');
  for (const rj of (data || [])) {
    console.log(`\n--- render_job ${rj.id} ---`);
    console.log('payload keys:', Object.keys(rj.payload || {}));
    console.log('payload.videoUrl:', rj.payload?.videoUrl);
    console.log('payload.clipStart:', rj.payload?.clipStart);
    console.log('payload.clipEnd:', rj.payload?.clipEnd);
  }
}

run().catch(console.error);
