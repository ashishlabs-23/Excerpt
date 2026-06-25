import { processVideoJob } from './workers/videoWorker';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function run() {
  const videoUrl = 'https://youtu.be/zRtGL0-5rg4?si=r6DObzKzMUgeJ3k3';
  const jobId = require('crypto').randomUUID();
  
  console.log(`Starting test pipeline for ${videoUrl}`);
  try {
    const result = await processVideoJob(jobId, { videoUrl, numClips: 3 });
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("Pipeline Error:", e.message);
  }
}

run();
