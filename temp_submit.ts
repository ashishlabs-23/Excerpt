import { queueService } from './apps/api/src/services/queueService';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  try {
    const videoUrl = 'https://youtu.be/fJrctBM0poE?si=Wi7haLVKCA8Ul-Xi';
    console.log('Submitting fresh generation job for:', videoUrl);
    
    // We get a dummy user_id or omit it (schema allows null user_id)
    const jobId = await queueService.addJob({
      videoUrl,
      numClips: 3,
      intent: 'viral',
      generationMode: 'quality',
    });
    console.log('Job submitted successfully. Job ID:', jobId);
    process.exit(0);
  } catch (err) {
    console.error('Error submitting job:', err);
    process.exit(1);
  }
}

run();
