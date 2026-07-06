import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const realUserId = 'a04e08d1-031e-4a90-9762-4f0dd36a5562'; // manuashi2018@gmail.com
const completedJobIds = [
  '158351a5-d258-45fa-9ed8-1ecab95782d0',
  '49fd25ff-c585-4509-bff7-4262a02dc060',
  'd621efdc-735f-46c0-91a9-7a4a061e5553',
  'f85f0726-8ec1-4eef-bba5-9bdfa519a756'
];

async function run() {
  // Check clips for completed jobs
  const { data: clips } = await db
    .from('clips')
    .select('id, job_id, status, environment, storage_path, is_archived, created_at')
    .in('job_id', completedJobIds)
    .order('created_at', { ascending: false });

  console.log(`Found ${clips?.length || 0} clips for real user's completed jobs:`);
  console.log(JSON.stringify(clips, null, 2));

  // Also check what environment value was set
  const envVals = [...new Set((clips || []).map((c: any) => c.environment))];
  console.log('\nDistinct environment values:', envVals);
  
  // Check archived
  const archived = (clips || []).filter((c: any) => c.is_archived);
  console.log('Archived clips:', archived.length);
  
  // Check what environment the API currently expects
  console.log('\nWORKER_ENV env var:', process.env.WORKER_ENV);
  console.log('NODE_ENV:', process.env.NODE_ENV);
}

run().catch(console.error);
