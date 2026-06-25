import dotenv from 'dotenv';
dotenv.config();

import { QueueService } from '../src/services/queueService';
import { DatabaseService } from '../src/services/supabaseService';

const TEST_VIDEO = 'https://youtu.be/TScGpotKXm4?si=5-i8wpGg3PE2eyuB';
const NUM_CLIPS = 1;

async function runEndToEnd() {
  console.log('--- STARTING PHASE J: END-TO-END PRODUCTION TEST ---');
  console.log(`Video: ${TEST_VIDEO}`);
  
  const queue = new QueueService();

  try {
    const jobId = await queue.addJob({
      videoUrl: TEST_VIDEO,
      numClips: NUM_CLIPS,
      generationMode: 'quality',
    });

    console.log(`\n✅ Job enqueued successfully.`);
    console.log(`Job ID: ${jobId}`);
  } catch (error) {
    console.error(`❌ Failed to enqueue job:`, error);
  }
}

runEndToEnd();
