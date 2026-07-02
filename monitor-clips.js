import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function monitor() {
  console.log('Starting monitoring for the latest job...');
  
  // Find the latest job
  const { data: jobs, error: jobErr } = await supabase
    .from('jobs')
    .select('id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (jobErr || !jobs || jobs.length === 0) {
    console.error('Failed to fetch latest job:', jobErr?.message || 'No jobs found');
    return;
  }

  const job = jobs[0];
  console.log(`Monitoring Job ID: ${job.id} (Status: ${job.status})`);

  let lastCompletedCount = -1;

  const interval = setInterval(async () => {
    const { data: clips, error: clipsErr } = await supabase
      .from('clips')
      .select('id, status')
      .eq('job_id', job.id);

    if (clipsErr) {
      console.error('Error fetching clips:', clipsErr.message);
      return;
    }

    const total = clips.length;
    const completed = clips.filter(c => c.status === 'uploaded').length;
    const rendering = clips.filter(c => c.status === 'rendering').length;
    const processing = clips.filter(c => c.status === 'processing').length;
    const queued = clips.filter(c => c.status === 'queued' || c.status === 'pending').length;

    if (completed !== lastCompletedCount) {
      console.log(`[Job ${job.id}] Clips: ${total} total | ${completed} uploaded | ${rendering} rendering | ${processing} processing | ${queued} queued`);
      lastCompletedCount = completed;
    }

    if (total >= 20 && completed === total) {
      console.log(`🎉 All ${total} clips generated successfully!`);
      clearInterval(interval);
      process.exit(0);
    }
    
    // Also check if job status changed
    const { data: currentJob } = await supabase.from('jobs').select('status').eq('id', job.id).single();
    if (currentJob && currentJob.status === 'failed') {
      console.error(`❌ Job failed!`);
      clearInterval(interval);
      process.exit(1);
    }
  }, 10000);
}

monitor().catch(console.error);
