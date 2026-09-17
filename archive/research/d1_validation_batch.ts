import dotenv from 'dotenv';
dotenv.config();

import { QueueService } from '../src/services/queueService';
import { DatabaseService } from '../src/services/supabaseService';

const TEST_VIDEO = 'https://youtu.be/TScGpotKXm4?si=5-i8wpGg3PE2eyuB';
const NUM_CLIPS = 50;

async function runD1Batch() {
  console.log('--- STARTING PHASE D1 VALIDATION BATCH ---');
  console.log(`Video: ${TEST_VIDEO}`);
  console.log(`Requested Clips: ${NUM_CLIPS} (Generating candidates)`);
  
  const queue = new QueueService();
  const db = new DatabaseService();

  try {
    const jobId = await queue.addJob({
      videoUrl: TEST_VIDEO,
      numClips: NUM_CLIPS,
      generationMode: 'quality', // We want full AI analysis
    });

    console.log(`\n✅ Job enqueued successfully.`);
    console.log(`Job ID: ${jobId}`);
    console.log(`\nPlease start the worker with D1_VALIDATION=true to process this job:`);
    console.log(`$env:D1_VALIDATION="true"; npx tsx apps/api/src/workers/videoWorker.ts`);
    console.log(`\nAfter it finishes, check the database for the results.`);

  } catch (error) {
    console.error(`❌ Failed to enqueue job:`, error);
  }
}

runD1Batch();
