import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load from root .env
config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const REAL_USER_ID = '42b14a82-8ab3-424d-bee7-a4475074a987';
const VIDEO_URL = 'https://youtu.be/r8SvHZxALQs?si=2Vbk1oS1O55eK-da';

async function generateVideo() {
  console.log(`Injecting job for video: ${VIDEO_URL}`);

  const { data: job, error } = await supabase.from('jobs').insert({
    user_id: REAL_USER_ID,
    video_url: VIDEO_URL,
    status: 'queued'
  }).select().single();

  if (error) {
    console.error('Error inserting job:', error);
  } else {
    console.log(`Successfully queued job ID: ${job.id}`);
  }
}

generateVideo();
