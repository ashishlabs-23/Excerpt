import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Setup env
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];
const foundEnv = envPaths.find((p) => {
  const fs = require('fs');
  return fs.existsSync(p);
});
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkStarvation() {
  console.log('🔍 Excerpt Queue Starvation Audit');
  let hasWarnings = false;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // 1. Check AI Pipeline Jobs
  const { data: processingJobs, error: err1 } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'processing');
  
  if (err1) throw err1;

  const { data: queuedJobs, error: err2 } = await supabase
    .from('jobs')
    .select('id, created_at')
    .eq('status', 'queued')
    .lt('created_at', fiveMinutesAgo);

  if (err2) throw err2;

  if (queuedJobs && queuedJobs.length > 0 && processingJobs?.length === 0) {
    console.warn(`[WARNING] AI Pipeline Starvation Detected!`);
    console.warn(`- ${queuedJobs.length} jobs have been queued for > 5 minutes.`);
    console.warn(`- There are 0 currently processing jobs.`);
    console.warn(`- This indicates the videoWorkers might be offline, crashed, or failing to claim.`);
    hasWarnings = true;
  } else {
    console.log(`✅ AI Pipeline Queue is healthy. (${queuedJobs?.length} queued > 5m, ${processingJobs?.length} processing)`);
  }

  // 2. Check Render Jobs
  const { data: pendingRenders, error: err3 } = await supabase
    .from('render_jobs')
    .select('id, created_at')
    .eq('status', 'pending')
    .lt('created_at', fiveMinutesAgo);

  if (err3) throw err3;

  if (pendingRenders && pendingRenders.length > 0) {
    console.warn(`[WARNING] Render Queue Starvation Detected!`);
    console.warn(`- ${pendingRenders.length} render jobs have been pending for > 5 minutes.`);
    console.warn(`- This indicates the renderWorkers are overloaded, offline, or crashing.`);
    hasWarnings = true;
  } else {
    console.log(`✅ Render Queue is healthy. (${pendingRenders?.length} pending > 5m)`);
  }

  if (hasWarnings) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

checkStarvation().catch(console.error);
