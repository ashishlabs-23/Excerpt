import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function runTests() {
  console.log('--- STARTING RELIABILITY MATRIX ---');
  
  // Test 1: Happy Path
  console.log('\\n[1/6] Happy Path: Injecting test job...');
  const { data: job, error } = await supabase.from('jobs').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'queued'
  }).select().single();
  
  if (error) {
    console.error('Failed to create job', error);
    return;
  }
  
  console.log('Job created:', job.id);
  console.log('Waiting for worker to claim and process...');
  
  let lastStatus = '';
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const { data: current } = await supabase.from('jobs').select('status, progress').eq('id', job.id).single();
    if (current && current.status !== lastStatus) {
      console.log(`-> Status: ${current.status} (Progress: ${current.progress}%)`);
      lastStatus = current.status;
    }
    if (current?.status === 'completed' || current?.status === 'failed') {
      break;
    }
  }
  
  console.log('\\n--- TESTS COMPLETED ---');
}

runTests();
