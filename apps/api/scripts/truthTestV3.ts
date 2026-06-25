import { queueService } from '../src/services/queueService';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const urls = [
  'https://www.youtube.com/watch?v=wpcKyur-kbI',
  'https://www.youtube.com/watch?v=SrCBJYoMoro',
  'https://www.youtube.com/watch?v=wz1r_VJaJZw',
  'https://www.youtube.com/watch?v=YFsZ3qUFoI4',
  'https://www.youtube.com/watch?v=A_k3nXtMw-8',
  'https://www.youtube.com/watch?v=uQpQJ4VSrt0',
  'https://www.youtube.com/watch?v=uLIC1syY4A0',
  'https://www.youtube.com/watch?v=NrsiQzDTxeA',
  'https://www.youtube.com/watch?v=89M0Fxm_AZE',
  'https://www.youtube.com/watch?v=d8us-RuhsEw'
];

async function run() {
  console.log('Starting Truth Test V3...');
  const userId = '1b249a0f-5d78-4612-bba6-80d8df83bbf6';

  for (const url of urls) {
    try {
      const jobId = await queueService.addJob({
        videoUrl: url,
        numClips: 2,
        intent: 'viral',
        avoidSimilarClips: 'balanced',
        generationMode: 'draft',
        userId: userId
      });
      console.log(`Queued ${url} -> Job ID: ${jobId}`);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Failed to queue ${url}:`, e);
    }
  }
  
  console.log('All 10 jobs queued. Dispatch browser subagent to monitor.');
  process.exit(0);
}

run();
