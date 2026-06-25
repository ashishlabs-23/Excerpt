require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function runAudit() {
  const { data: jobs } = await supabase.from('jobs').select('id, user_id');
  const jobMap = {};
  jobs.forEach(j => jobMap[j.id] = j.user_id);
  
  const { data: clips } = await supabase.from('clips').select('id, job_id, created_at').order('created_at', { ascending: false });
  
  console.log(`Total jobs: ${jobs.length}`);
  console.log(`Total clips: ${clips.length}`);
  
  const clipsWithUserId = clips.map(c => ({
    clip_id: c.id,
    job_id: c.job_id,
    user_id: jobMap[c.job_id] || 'MISSING_JOB'
  }));
  
  const userCounts = {};
  clipsWithUserId.forEach(c => {
    userCounts[c.user_id] = (userCounts[c.user_id] || 0) + 1;
  });
  
  console.log("Clips per user_id:", userCounts);
}

runAudit().catch(console.error);
