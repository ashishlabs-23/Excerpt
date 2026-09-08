import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from '../src/services/supabaseService';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

async function monitor() {
  const query = '1a8ce';
  const db = new DatabaseService();
  const supabase = db.getSupabase();

  console.log(`[Monitor]: Looking for job with ID starting with "${query}"...`);

  // 1. Search in 'jobs'
  const { data: jobs, error: errJobs } = await supabase
    .from('jobs')
    .select('*')
    .ilike('id', `${query}%`);

  if (jobs && jobs.length > 0) {
    console.log(`\nFound ${jobs.length} matching job(s) in 'jobs' table:`);
    for (const j of jobs) {
      console.log('JOB DETAILS:', JSON.stringify(j, null, 2));

      // Check render_jobs
      const { data: rJobs } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('job_id', j.id);
      console.log(`\nRENDER JOBS (${rJobs?.length || 0}):`, JSON.stringify(rJobs, null, 2));

      // Check clips
      const { data: clips } = await supabase
        .from('clips')
        .select('*')
        .eq('job_id', j.id);
      console.log(`\nCLIPS (${clips?.length || 0}):`, JSON.stringify(clips, null, 2));
    }
    return;
  }

  // 2. Search in 'clipping_jobs'
  const { data: cJobs, error: errCJobs } = await supabase
    .from('clipping_jobs')
    .select('*')
    .ilike('id', `${query}%`);

  if (cJobs && cJobs.length > 0) {
    console.log(`\nFound ${cJobs.length} matching job(s) in 'clipping_jobs' table:`);
    for (const j of cJobs) {
      console.log('CLIPPING JOB DETAILS:', JSON.stringify(j, null, 2));
      const { data: rJobs } = await supabase.from('render_jobs').select('*').eq('job_id', j.id);
      console.log(`\nRENDER JOBS (${rJobs?.length || 0}):`, JSON.stringify(rJobs, null, 2));
      const { data: clips } = await supabase.from('clips').select('*').eq('job_id', j.id);
      console.log(`\nCLIPS (${clips?.length || 0}):`, JSON.stringify(clips, null, 2));
    }
    return;
  }

  // 3. Fallback: print top 5 most recent jobs in 'jobs'
  console.log(`\nNo job found starting with "${query}". Recent jobs in 'jobs':`);
  const { data: recentJobs } = await supabase
    .from('jobs')
    .select('id, status, progress, video_url, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(recentJobs, null, 2));

  // 4. Also check top 5 in 'clipping_jobs'
  console.log(`\nRecent jobs in 'clipping_jobs':`);
  const { data: recentCJobs } = await supabase
    .from('clipping_jobs')
    .select('id, status, progress, video_url, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(recentCJobs, null, 2));
}

monitor().catch(err => {
  console.error('[Monitor Error]:', err.message);
  process.exit(1);
});
