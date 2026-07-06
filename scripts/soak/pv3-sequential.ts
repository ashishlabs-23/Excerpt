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

async function waitForJobCompletion(jobId: string, timeoutMinutes: number = 10) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.from('jobs').select('status, failed_reason').eq('id', jobId).single();
    if (data) {
      if (data.status === 'completed') return true;
      if (data.status === 'failed') throw new Error(`Job failed: ${data.failed_reason}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Job timed out after ${timeoutMinutes} minutes`);
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
