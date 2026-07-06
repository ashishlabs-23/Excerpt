import { DatabaseService } from '../../apps/api/src/services/supabaseService';
import fetch from 'node-fetch';

process.env.WORKER_ENV = 'production';
const db = new DatabaseService();
const supabase = db.getSupabase();
const API_URL = process.env.API_URL || 'http://localhost:8010';

const TEST_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Placeholder test URL
  // We can just reuse the same URL for soak tests, but we append a dummy query parameter to avoid caching issues sometimes, 
  // though Excerpt should handle identical URLs fine if we want them as separate jobs.
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

const STALL_THRESHOLD_MS = 5 * 60 * 1000;   // Fail if NO progress for 5 minutes
const ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000; // Hard ceiling: 30 minutes total

async function waitForJobCompletion(jobId: string) {
  const absoluteStart = Date.now();
  let lastProgress = -1;
  let lastProgressTime = Date.now();

  while (true) {
    const { data } = await supabase
      .from('jobs')
      .select('status, progress, failed_reason')
      .eq('id', jobId)
      .single();

    if (data) {
      const { status, progress, failed_reason } = data;

      // Terminal states
      if (status === 'completed') return true;
      if (status === 'failed') throw new Error(`Job failed: ${failed_reason}`);

      // Track progress advances
      if (progress !== lastProgress) {
        lastProgress = progress;
        lastProgressTime = Date.now();
        console.log(`  [${jobId.slice(0,8)}] Status: ${status} | Progress: ${progress}%`);
      }

      // Stall detection: no progress for STALL_THRESHOLD_MS
      const stallMs = Date.now() - lastProgressTime;
      if (stallMs > STALL_THRESHOLD_MS) {
        throw new Error(`Job stalled at ${progress}% (status: ${status}) for ${Math.round(stallMs/1000)}s with no progress`);
      }

      // Absolute ceiling
      if (Date.now() - absoluteStart > ABSOLUTE_TIMEOUT_MS) {
        throw new Error(`Job exceeded absolute 30-minute ceiling at ${progress}% (${status})`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s
  }
}


async function main() {
  console.log("=== PV-3: 20 Sequential Jobs Soak Test ===");
  const TOTAL_JOBS = 20;
  let successes = 0;
  
  for (let i = 1; i <= TOTAL_JOBS; i++) {
    const url = `${TEST_URLS[0]}&pv3=${i}_${Date.now()}`;
    console.log(`\n[Job ${i}/${TOTAL_JOBS}] Submitting...`);
    
    try {
      const { jobId } = await submitJob(url);
      console.log(`[Job ${i}/${TOTAL_JOBS}] ID: ${jobId} | Waiting for completion...`);
      
      await waitForJobCompletion(jobId);
      console.log(`[Job ${i}/${TOTAL_JOBS}] ✅ SUCCESS`);
      successes++;
      
    } catch (err: any) {
      console.error(`[Job ${i}/${TOTAL_JOBS}] ❌ ERROR: ${err.message}`);
      // Break on first failure during strict sequential testing, or keep going? 
      // The user wants objective evidence, let's keep going to gather error rate.
    }
    
    // Give workers a tiny breather between sequential jobs
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("\n=== PV-3 Complete ===");
  console.log(`Success Rate: ${successes}/${TOTAL_JOBS} (${((successes/TOTAL_JOBS)*100).toFixed(1)}%)`);
  if (successes < TOTAL_JOBS) {
    process.exit(1);
  }
}

main().catch(console.error);
