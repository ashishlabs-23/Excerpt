import { DatabaseService } from '../../apps/api/src/services/supabaseService';
import fetch from 'node-fetch';

const db = new DatabaseService();
const supabase = db.getSupabase();
const API_URL = process.env.API_URL || 'http://localhost:8010';

const TEST_URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
];

async function submitJob(url: string) {
  const res = await fetch(`${API_URL}/api/video/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error(`Failed to submit job: ${res.statusText}`);
  return await res.json();
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
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error(`Job timed out after ${timeoutMinutes} minutes`);
}

async function main() {
  console.log("=== PV-4: 10 Concurrent Jobs Soak Test ===");
  const TOTAL_JOBS = 10;
  const jobPromises: Promise<boolean>[] = [];
  
  console.log(`Submitting ${TOTAL_JOBS} jobs concurrently...`);
  
  for (let i = 1; i <= TOTAL_JOBS; i++) {
    const url = `${TEST_URLS[0]}&pv4=${i}_${Date.now()}`;
    
    // We wrap each job in its own promise execution chain
    const p = (async () => {
      try {
        const { jobId } = await submitJob(url);
        console.log(`[Job ${i}] ID: ${jobId} submitted. Waiting...`);
        await waitForJobCompletion(jobId);
        console.log(`[Job ${i}] ✅ SUCCESS`);
        return true;
      } catch (err: any) {
        console.error(`[Job ${i}] ❌ ERROR: ${err.message}`);
        return false;
      }
    })();
    
    jobPromises.push(p);
  }
  
  const results = await Promise.all(jobPromises);
  const successes = results.filter(r => r).length;
  
  console.log("\n=== PV-4 Complete ===");
  console.log(`Success Rate: ${successes}/${TOTAL_JOBS} (${((successes/TOTAL_JOBS)*100).toFixed(1)}%)`);
  if (successes < TOTAL_JOBS) {
    process.exit(1);
  }
}

main().catch(console.error);
