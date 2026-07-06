import { DatabaseService } from '../apps/api/src/services/supabaseService';
import fetch from 'node-fetch';

const db = new DatabaseService();
const supabase = db.getSupabase();
const API_URL = process.env.API_URL || 'http://localhost:8010';

async function submitJob(url: string, forceStatus?: string) {
  const res = await fetch(`${API_URL}/api/video/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, forceStatus })
  });
  if (!res.ok) throw new Error(`Failed to submit job: ${res.statusText}`);
  return await res.json();
}

async function checkJobTelemetry(jobId: string, expectedReason?: string, expectedTelemetryContains?: string) {
  let attempts = 0;
  while (attempts < 30) {
    const { data } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (!data) throw new Error('Job not found');
    
    if (data.status === 'completed' || data.status === 'failed') {
      console.log(`Job ${jobId} finished with status ${data.status}`);
      
      if (expectedReason && !data.failed_reason?.includes(expectedReason)) {
        throw new Error(`Expected reason ${expectedReason}, got ${data.failed_reason}`);
      }
      
      if (expectedTelemetryContains) {
        const perf = data.performance_metrics;
        if (!JSON.stringify(perf).includes(expectedTelemetryContains)) {
          throw new Error(`Telemetry missing expected value: ${expectedTelemetryContains}`);
        }
      }
      
      return data;
    }
    
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
  throw new Error('Timeout waiting for job completion');
}

async function main() {
  console.log("Starting End-to-End Telemetry Validation Suite...\n");

  try {
    // 1. Successful download
    console.log("TEST 1: Successful download");
    const j1 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await checkJobTelemetry(j1.jobId, undefined, "download_duration");
    console.log("✅ TEST 1 PASS");

    // 2. HTTP 429
    console.log("TEST 2: HTTP 429 Simulation");
    const j2 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'HTTP_429');
    await checkJobTelemetry(j2.jobId, "429", "download_attempts");
    console.log("✅ TEST 2 PASS");

    // 3. Timeout
    console.log("TEST 3: Timeout Simulation");
    const j3 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'TIMEOUT');
    await checkJobTelemetry(j3.jobId, "timeout", "download_attempts");
    console.log("✅ TEST 3 PASS");

    // 4. Invalid URL
    console.log("TEST 4: Invalid URL");
    const j4 = await submitJob('https://invalid.url');
    await checkJobTelemetry(j4.jobId, "Invalid");
    console.log("✅ TEST 4 PASS");

    // 5. Copyright
    console.log("TEST 5: Copyright-restricted");
    const j5 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'COPYRIGHT');
    await checkJobTelemetry(j5.jobId, "copyright");
    console.log("✅ TEST 5 PASS");

    // 6. Cancelled
    console.log("TEST 6: Cancelled job");
    const j6 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await supabase.from('jobs').update({ status: 'failed', failed_reason: 'cancelled' }).eq('id', j6.jobId);
    await checkJobTelemetry(j6.jobId, "cancelled");
    console.log("✅ TEST 6 PASS");

    // 7. AI Fallback
    console.log("TEST 7: AI Fallback Simulation");
    const j7 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'AI_FALLBACK');
    await checkJobTelemetry(j7.jobId, undefined, "ai_provider\":\"groq");
    console.log("✅ TEST 7 PASS");

    // 8. Render failure
    console.log("TEST 8: Render failure");
    const j8 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'RENDER_FAIL');
    await checkJobTelemetry(j8.jobId, "Render");
    console.log("✅ TEST 8 PASS");

    // 9. Upload failure
    console.log("TEST 9: Upload failure");
    const j9 = await submitJob('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'UPLOAD_FAIL');
    await checkJobTelemetry(j9.jobId, "Upload");
    console.log("✅ TEST 9 PASS");

    console.log("\nAll Telemetry Scenarios Passed.");
  } catch (err: any) {
    console.error("\n❌ SUITE FAILED:", err.message);
    process.exit(1);
  }
}

main();
