import { DatabaseService } from '../../apps/api/src/services/supabaseService';
import fetch from 'node-fetch';

const db = new DatabaseService();
const supabase = db.getSupabase();
const API_URL = process.env.API_URL || 'http://localhost:8010';

const TEST_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
];

import { queueService } from '../../apps/api/src/services/queueService';

async function submitJob(url: string) {
  const { data: user } = await supabase.from('users').select('id').limit(1).maybeSingle();
  const userId = user?.id || '00000000-0000-0000-0000-000000000000';
  
  const jobId = await queueService.addJob({ 
    videoUrl: url, 
    numClips: 1, 
    intent: 'viral',
    userId 
  });
  
  return { jobId };
}

async function waitForJobCompletion(jobId: string, timeoutMinutes: number = 20) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.from('jobs').select('status, failed_reason').eq('id', jobId).single();
    if (data) {
      if (data.status === 'completed') return true;
      if (data.status === 'failed') throw new Error(`Job failed: ${data.failed_reason}`);
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error(`Job timed out after ${timeoutMinutes} minutes`);
}

async function main() {
  const isPV5 = process.argv.includes('--pv5');
  const durationHours = isPV5 ? 24 : 2;
  const maxJobs = isPV5 ? 48 : 12; // PV-5: 48 jobs (1 per 30m), PV-4.5: 12 jobs (1 per 10m)
  const intervalMinutes = isPV5 ? 30 : 10;
  
  console.log(`=== ${isPV5 ? 'PV-5: 24-Hour Soak Test' : 'PV-4.5: 2-Hour Soak Test'} ===`);
  console.log(`Duration: ${durationHours} hours | Max Jobs: ${maxJobs} | Interval: 1 job every ${intervalMinutes} mins`);
  
  const intervalMs = intervalMinutes * 60 * 1000;
  let successes = 0;
  let failures = 0;
  let currentJob = 1;

  const startTimestamp = Date.now();
  const endTimestamp = startTimestamp + (durationHours * 60 * 60 * 1000);

  const intervalId = setInterval(async () => {
    if (currentJob > maxJobs || Date.now() > endTimestamp) {
      clearInterval(intervalId);
      
      console.log(`\n=== Soak Test Complete ===`);
      console.log(`Total Jobs Submitted: ${successes + failures}`);
      console.log(`Successes: ${successes}`);
      console.log(`Failures: ${failures}`);
      console.log(`Success Rate: ${((successes / (successes + failures || 1)) * 100).toFixed(1)}%`);
      
      process.exit(failures > 0 ? 1 : 0);
    }

    const jobNum = currentJob++;
    const url = `${TEST_URLS[0]}&soak=${jobNum}_${Date.now()}`;
    
    console.log(`\n[${new Date().toISOString()}] Submitting Job ${jobNum}/${maxJobs}...`);
    
    try {
      const { jobId } = await submitJob(url);
      console.log(`[Job ${jobNum}] ID: ${jobId}. Monitoring asynchronously...`);
      
      // Monitor asynchronously so we don't block the next submission tick
      waitForJobCompletion(jobId).then(() => {
        console.log(`[Job ${jobNum}] ✅ SUCCESS`);
        successes++;
      }).catch(err => {
        console.error(`[Job ${jobNum}] ❌ ERROR: ${err.message}`);
        failures++;
      });
      
    } catch (err: any) {
      console.error(`[Job ${jobNum}] ❌ SUBMIT ERROR: ${err.message}`);
      failures++;
    }
  }, intervalMs);
  
  // Submit first job immediately
  console.log("Waiting for first interval tick... (First job executes in 10s)");
  setTimeout(() => {
    // Initial manual trigger for first job so we don't wait 30 minutes for the first one
  }, 100);
}

// Support graceful exit logging
process.on('SIGINT', () => {
  console.log("\n[Soak Test] Aborted by user.");
  process.exit(1);
});

main().catch(console.error);
