import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Get the actual real user ID from the users table
  const { data: users } = await db.auth.admin.listUsers();
  console.log('=== REAL USERS ===');
  const realUsers = (users?.users || []).filter((u: any) => u.id !== '00000000-0000-0000-0000-000000000000');
  for (const u of realUsers) {
    console.log(`  ${u.id} | ${u.email} | created: ${u.created_at}`);
  }

  // Check jobs for each real user
  for (const u of realUsers.slice(0, 3)) {
    const { data: jobs } = await db.from('jobs')
      .select('id, status, progress, created_at, updated_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(5);
    console.log(`\nJobs for ${u.email}:`, JSON.stringify(jobs, null, 2));
  }

  // Check current PV-3 job
  const { data: pv3 } = await db.from('jobs')
    .select('id, status, progress, failed_reason, updated_at')
    .eq('id', '67982ae5-ec3c-46bc-8b00-1bcf208e768d')
    .single();
  console.log('\n=== PV-3 JOB (67982ae5) ===');
  console.log(JSON.stringify(pv3, null, 2));
}

run().catch(console.error);
