const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

require('dotenv').config({ path: 'c:/Projects/Ashishlabs/Excerpt/.env' });

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runJob(videoUrl, runName) {
  console.log(`\n--- Starting ${runName} ---`);
  const jobId = crypto.randomUUID();
  const startTime = Date.now();

  const { error } = await supabase.from('jobs').insert({
    id: jobId,
    video_url: videoUrl,
    num_clips: 3,
    status: 'queued',
    progress: 0,
    payload: { 
      intent: 'viral',
      avoidSimilarClips: 'balanced',
      generation_mode: 'draft'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  if (error) {
    console.error(`Failed to insert job: ${error.message}`);
    return;
  }

  console.log(`Job ${jobId} inserted. Waiting for completion...`);

  let status = 'queued';
  while (status !== 'completed' && status !== 'failed') {
    await new Promise(r => setTimeout(r, 2000));
    const { data: jobData } = await supabase.from('jobs').select('status, progress, error_message').eq('id', jobId).single();
    if (jobData) {
      if (jobData.status !== status) {
        status = jobData.status;
        console.log(`[${runName}] Status changed to: ${status} (Progress: ${jobData.progress}%)`);
      }
      if (status === 'failed') {
        console.log(`[${runName}] Job Failed! Error: ${jobData.error_message}`);
      }
    }
  }

  const runtimeMs = Date.now() - startTime;
  
  // Fetch clips
  const { data: clips } = await supabase.from('clips').select('*').eq('job_id', jobId);
  
  // Fetch cache entry for this video
  const { data: cacheEntries } = await supabase.from('video_analysis_cache').select('telemetry').eq('video_url', videoUrl).order('created_at', { ascending: false }).limit(1);
  const telemetry = cacheEntries && cacheEntries.length > 0 ? cacheEntries[0].telemetry : null;

  console.log(`\n[${runName}] RESULTS:`);
  console.log(`Success: ${status === 'completed'}`);
  console.log(`Runtime: ${(runtimeMs / 1000).toFixed(2)}s`);
  console.log(`Clips generated: ${clips ? clips.length : 0}`);
  
  if (telemetry) {
    console.log(`Cache Hit: ${telemetry.cache_hit}`);
    console.log(`AI Provider Used: ${telemetry.provider_used || 'N/A'}`);
    console.log(`AI Latency: ${telemetry.provider_latency_ms || 0}ms`);
  } else {
    console.log(`Cache Data: Not Found`);
  }
}

async function main() {
  const url = "https://youtu.be/fJrctBM0poE";
  
  await runJob(url, "Test A - Run 1");
  await runJob(url, "Test A - Run 2 (Cache Test)");
  await runJob(url, "Test A - Run 3");
  
  console.log("\n--- Starting Test C (Concurrent Mixed Content) ---");
  const urls = [
    "https://youtu.be/fJrctBM0poE", // Football
    "https://youtu.be/gMpe2eC660s", // Podcast / Talking head maybe? (Let's just submit 3 distinct jobs)
    "https://youtu.be/jNQXAC9IVRw"  // Me at the zoo (Short)
  ];
  
  await Promise.all([
    runJob(urls[0], "Test C - Job 1 (Football)"),
    runJob(urls[1], "Test C - Job 2"),
    runJob(urls[2], "Test C - Job 3")
  ]);
  
  console.log("\n--- All Tests Finished ---");
}

main().catch(console.error);
