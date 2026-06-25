import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Projects/Ashishlabs/Excerpt/.env' });

const supabaseUrl = process.env.SUPABASE_URL || 'https://toaswvjvmphyltwkxvga.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const baseUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://www.youtube.com/watch?v=PT2_F-1esPk',
  'https://www.youtube.com/watch?v=L_jWHffIx5E',
  'https://www.youtube.com/watch?v=V-_O7nl0Ii0',
  'https://www.youtube.com/watch?v=09R8_2nJtjg',
  'https://www.youtube.com/watch?v=YQHsXMglC9A',
  'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
  'https://www.youtube.com/watch?v=RgKAFK5djSk',
];
const testUrls = [...baseUrls, ...baseUrls, ...baseUrls];

async function run10Videos() {
  const jobIds = [];
  for (const url of testUrls) {
    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      video_url: url,
      status: 'queued'
    }).select().single();
    if (!error && job) {
      jobIds.push(job.id);
      console.log(`Queued job ${job.id} for ${url}`);
    } else {
      console.error(`Error queuing ${url}:`, error);
    }
  }

  console.log(`Submitted ${jobIds.length} jobs. Monitoring...`);

  // Monitor loop
  while (true) {
    const { data: jobs } = await supabase.from('jobs').select('id, status, progress').in('id', jobIds);
    let completed = 0;
    let failed = 0;
    
    console.log('--- STATUS UPDATE ---');
    for (const job of jobs || []) {
      console.log(`${job.id}: ${job.status} (${job.progress}%)`);
      if (job.status === 'completed') completed++;
      if (job.status === 'failed') failed++;
    }

    if (completed + failed === jobIds.length) {
      console.log(`DONE. Completed: ${completed}, Failed: ${failed}`);
      break;
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
}

run10Videos();
