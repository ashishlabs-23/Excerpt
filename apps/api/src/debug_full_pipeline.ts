import dotenv from 'dotenv';
import path from 'path';
import { processVideoJob } from './workers/videoWorker';
import { DatabaseService } from './services/supabaseService';

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const db = new DatabaseService();
const jobId = 'debug-' + Math.random().toString(36).substring(7);
const videoUrl = 'https://youtu.be/ygXn5nV5qFc?si=V0jTVElPKwZykdk7';
const numClips = 5;

async function runDebug() {
  console.log(`[Debug]: Starting full pipeline test for ${videoUrl}`);
  console.log(`[Debug]: Job ID: ${jobId}`);
  
  try {
    // 1. Initialize job in DB (Supabase is sole source of truth)
    await db.createJob({ id: jobId, status: 'processing', progress: 0, video_url: videoUrl, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    
    // 2. Run the actual worker logic directly
    await processVideoJob(jobId, { videoUrl, numClips });
    
    // 3. Log final status from DB
    const finalState = await db.getJob(jobId);
    console.log('[Debug]: Final Job State:', JSON.stringify(finalState, null, 2));
    
    if (finalState?.status === 'completed') {
      console.log('[Debug]: SUCCESS - Pipeline completed fully.');
    } else {
      console.error(`[Debug]: FAILED - Status is ${finalState?.status}`);
    }
  } catch (error) {
    console.error('[Debug]: Critical error during pipeline execution:');
    console.error(error);
    process.exit(1);
  }
}

runDebug();
