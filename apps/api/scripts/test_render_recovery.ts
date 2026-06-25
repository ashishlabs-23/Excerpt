import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

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

async function run() {
  console.log('🧪 Starting Render Worker Crash Recovery Test...');

  // 1. Create a fake job and clip
  const jobId = `test-crash-${Date.now()}`;
  const clipId = `clip-${Date.now()}`;
  
  await supabase.from('jobs').insert({
    id: jobId,
    user_id: '12345', // Dummy
    video_url: 'https://test.com/video.mp4',
    status: 'completed',
    progress: 100
  });

  await supabase.from('clips').insert({
    id: clipId,
    job_id: jobId,
    status: 'pending',
    generation_key: crypto.randomUUID()
  });

  // 2. Create Render Job
  const { data: renderJob, error: rjError } = await supabase.from('render_jobs').insert({
    job_id: jobId,
    clip_id: clipId,
    status: 'pending',
    payload: {
      videoPath: 'dummy.mp4',
      clipStart: 0,
      clipEnd: 5,
      tempDir: '/tmp'
    }
  }).select().single();

  if (rjError) throw rjError;

  console.log(`✅ Queued render job: ${renderJob.id}`);

  // 3. Spawn first worker
  console.log('🚀 Spawning Worker #1...');
  const worker1 = spawn('npx', ['tsx', 'src/workers/renderWorker.ts'], { cwd: path.resolve(__dirname, '..') });

  worker1.stdout.on('data', (data) => console.log(`[Worker 1] ${data.toString().trim()}`));
  
  // Wait 10 seconds for worker to claim and start
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Assert it claimed
  const { data: check1 } = await supabase.from('render_jobs').select('status, locked_by').eq('id', renderJob.id).single();
  console.log(`Status after 10s: ${check1?.status}, locked by: ${check1?.locked_by}`);

  if (check1?.locked_by) {
    console.log('💥 KILLING Worker #1 mid-render (SIGKILL)...');
    worker1.kill('SIGKILL');
  } else {
    console.error('❌ Worker 1 failed to claim the job in time.');
    worker1.kill();
    process.exit(1);
  }

  // 4. Wait for heartbeat timeout (e.g., 30s) + some padding
  console.log('⏳ Waiting 45s for lock to expire due to missed heartbeats...');
  await new Promise(resolve => setTimeout(resolve, 45000));

  // 5. Spawn second worker
  console.log('🚀 Spawning Worker #2...');
  const worker2 = spawn('npx', ['tsx', 'src/workers/renderWorker.ts'], { cwd: path.resolve(__dirname, '..') });
  worker2.stdout.on('data', (data) => console.log(`[Worker 2] ${data.toString().trim()}`));

  // Wait 15 seconds for recovery
  await new Promise(resolve => setTimeout(resolve, 15000));

  const { data: check2 } = await supabase.from('render_jobs').select('status, locked_by').eq('id', renderJob.id).single();
  console.log(`Status after recovery: ${check2?.status}, locked by: ${check2?.locked_by}`);

  worker2.kill();

  if (check2?.locked_by && check2.locked_by !== check1.locked_by) {
    console.log('✅ RECOVERY SUCCESSFUL! Worker 2 claimed the crashed job.');
    process.exit(0);
  } else {
    console.error('❌ RECOVERY FAILED! Job was not claimed by Worker 2.');
    process.exit(1);
  }
}

run().catch(console.error);
