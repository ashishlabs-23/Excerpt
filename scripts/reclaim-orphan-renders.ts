import * as fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8');
for (const l of env.split('\n')) {
  const m = l.match(/^([^#=]+)=(.*)/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Force-reclaim render_jobs stuck in 'rendering' for > 10 minutes regardless of cutoff
async function reclaimOrphans() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  // Use explicit IDs we know are stuck
  const stuckIds = [
    'babb8e83-042a-4cb8-abe6-9a9753e7aaf6',
    '793e3779-744f-4dc2-ac20-77248eba468d'
  ];
  
  const { data: orphans } = await db
    .from('render_jobs')
    .select('id, job_id, status, attempt_count, updated_at')
    .in('id', stuckIds);

  console.log('Stuck render jobs:', JSON.stringify(orphans, null, 2));

  for (const rj of (orphans || [])) {
    if (rj.attempt_count >= 3) {
      await db.from('render_jobs').update({ 
        status: 'failed', 
        error: 'Orphaned after container restart - exceeded max attempts', 
        locked_by: null 
      }).eq('id', rj.id);
      console.log(`  ${rj.id} → FAILED (max attempts)`);
    } else {
      await db.from('render_jobs').update({ 
        status: 'queued', 
        locked_by: null, 
        locked_at: null 
      }).eq('id', rj.id);
      console.log(`  ${rj.id} → re-queued`);
    }
  }
}

reclaimOrphans().catch(console.error);
