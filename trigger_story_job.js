
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the shared .env file
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function triggerStoryJob() {
  const videoUrl = 'https://youtu.be/o7s3wsoJOdU';
  const numClips = 3; // We want 3 parts (approx 3 minutes total story)
  
  console.log(`[Trigger]: 🚀 Initializing Storyteller Mode for: ${videoUrl}`);
  
  const { data, error } = await supabase
    .from('jobs')
    .insert([
      {
        video_url: videoUrl,
        num_clips: numClips,
        status: 'queued',
        payload: {
          intent: 'storyteller',
          description: 'Narrative Focus: Genius Engineer Reborned As Blacksmith',
          series_naming: 'Part X'
        }
      }
    ])
    .select();

  if (error) {
    console.error('[Trigger]: ❌ Failed to queue story job:', error.message);
    return;
  }

  console.log(`[Trigger]: ✅ Storyteller Job queued successfully! ID: ${data[0].id}`);
  console.log(`[Trigger]: 📡 Worker will now pick up the sequence. Check logs for "Narrative Sequence Decode".`);
}

triggerStoryJob();
