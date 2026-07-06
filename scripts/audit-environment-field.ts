import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // What environment values are actually in the clips table?
  const { data: envDistinct } = await db
    .from('clips')
    .select('environment')
    .not('environment', 'is', null)
    .limit(200);

  const counts: Record<string, number> = {};
  for (const r of (envDistinct || [])) {
    counts[r.environment] = (counts[r.environment] || 0) + 1;
  }
  console.log('=== CLIP ENVIRONMENT VALUES IN DB ===');
  console.log(JSON.stringify(counts, null, 2));

  // What does the production API server report its WORKER_ENV as?
  // Check the production environment from the render_jobs table instead
  const { data: renderEnvs } = await db
    .from('render_jobs')
    .select('environment')
    .not('environment', 'is', null)
    .limit(50);
  const renderCounts: Record<string, number> = {};
  for (const r of (renderEnvs || [])) {
    renderCounts[r.environment] = (renderCounts[r.environment] || 0) + 1;
  }
  console.log('\n=== RENDER_JOB ENVIRONMENT VALUES IN DB ===');
  console.log(JSON.stringify(renderCounts, null, 2));

  // Cross: clips with real user job_ids — what environment are they?
  const realJobIds = [
    '158351a5-d258-45fa-9ed8-1ecab95782d0',
    '49fd25ff-c585-4509-bff7-4262a02dc060',
    'd621efdc-735f-46c0-91a9-7a4a061e5553',
    'f85f0726-8ec1-4eef-bba5-9bdfa519a756',
    '7b0c836c-10fd-435f-ba32-5337c562e305',
    '65730e77-98f3-481a-a0ee-d109dc8d0fef',
    'c953be16-f2f7-4486-94eb-debc7b42cd83',
  ];
  const { data: realClips } = await db
    .from('clips')
    .select('id, job_id, environment, status, created_at')
    .in('job_id', realJobIds)
    .order('created_at', { ascending: false });
  console.log('\n=== CLIPS FROM REAL USER COMPLETED JOBS ===');
  console.log(`Count: ${realClips?.length || 0}`);
  if (realClips?.length) {
    console.log(JSON.stringify(realClips.map((c: any) => ({
      id: c.id.slice(0,8),
      job: c.job_id.slice(0,8),
      env: c.environment,
      status: c.status,
    })), null, 2));
  }
}

run().catch(console.error);
