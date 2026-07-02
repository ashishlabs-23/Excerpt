import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runPV2() {
  console.log('🚀 Triggering PV-2 via DB Insert (API equivalent)...');
  
  const testUrl = 'https://youtu.be/jNQXAC9IVRw';
  
  try {
    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      user_id: 'a04e08d1-031e-4a90-9762-4f0dd36a5562',
      youtube_url: testUrl,
      status: 'queued',
      progress: 0,
      generation_mode: 'auto',
      payload: {
        numClips: 2,
        intent: 'viral',
        avoidSimilarClips: 'balanced'
      }
    }).select().single();
    
    if (insertError) {
      console.error('Insert Error:', insertError);
      return;
    }
    
    console.log('✅ Job created in DB. Job ID:', job.id);
    
    const jobId = job.id;
    
    console.log('📊 Monitoring Database for Job Status...');
    let lastStatus = '';
    
    while (true) {
      const { data: jobInfo, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      
      if (error) {
        console.error('DB Error:', error.message);
        break;
      }
      
      if (jobInfo.status !== lastStatus) {
        console.log(`[Job Status Update]: ${lastStatus} ➡️ ${jobInfo.status}`);
        lastStatus = jobInfo.status;
      }
      
      if (jobInfo.status === 'failed') {
        console.error('❌ Job Failed!');
        console.error('Error Message:', jobInfo.error);
        console.error('Failed Reason:', jobInfo.failed_reason);
        console.error('Debug Data:', JSON.stringify(jobInfo.debug_data, null, 2));
        break;
      }
      
      if (jobInfo.status === 'completed') {
        console.log('✅ Job Completed Successfully!');
        console.log('Result:', JSON.stringify(jobInfo.result, null, 2));
        break;
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  }
}

runPV2();
