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

const DEFAULT_VIDEOS = [
  { length: '10m', url: 'https://www.youtube.com/watch?v=10min_match' },
  { length: '20m', url: 'https://www.youtube.com/watch?v=20min_match' },
  { length: '30m', url: 'https://www.youtube.com/watch?v=30min_match' }
];

async function runTest() {
  console.log('🚀 Starting Generation Truth Test V2 (Reality Test)\n');

  const jobs = [];

  for (const video of DEFAULT_VIDEOS) {
    const jobId = `reality-test-${video.length}-${Date.now()}`;
    
    // Insert job
    const { data: job, error } = await supabase.from('jobs').insert({
      id: jobId,
      user_id: 'excerpt-reality-tester',
      video_url: video.url,
      status: 'queued',
      progress: 0,
      payload: { intent: 'highlights', generation_mode: 'ai' }
    }).select().single();

    if (error) {
      console.error(`❌ Failed to queue ${video.length} video: ${error.message}`);
      continue;
    }

    console.log(`✅ Queued ${video.length} video: ${jobId}`);
    jobs.push({ length: video.length, id: jobId, startTime: Date.now() });
  }

  console.log('\n⏳ Polling for results... (This may take a while)\n');

  let allDone = false;
  while (!allDone) {
    allDone = true;
    for (const job of jobs) {
      const { data: currentJob } = await supabase.from('jobs').select('status, progress, performance_metrics').eq('id', job.id).single();
      
      if (!currentJob) continue;

      if (currentJob.status !== 'completed' && currentJob.status !== 'failed' && currentJob.status !== 'dead_letter') {
        allDone = false;
      } else {
        if (!(job as any).reported) {
          const totalTime = ((Date.now() - job.startTime) / 1000).toFixed(1);
          console.log(`\n========================================`);
          console.log(`📹 [${job.length}] Test Completed`);
          console.log(`ID: ${job.id}`);
          console.log(`Status: ${currentJob.status}`);
          console.log(`Total Pipeline Time: ${totalTime}s`);
          console.log(`Metrics:`, currentJob.performance_metrics);
          console.log(`========================================\n`);
          (job as any).reported = true;
        }
      }
    }
    
    if (!allDone) {
      await new Promise(r => setTimeout(r, 15000)); // Poll every 15s
    }
  }

  console.log('🎉 Generation Truth Test V2 Completed!');
}

runTest().catch(console.error);
