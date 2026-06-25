import dotenv from 'dotenv';
import path from 'path';
import { processVideoJob } from '../src/workers/videoWorker';
import { updateJobStatus, getJobStatus } from '../src/services/jobState';
import { IntelligenceOrchestrator } from '../src/services/nexus/IntelligenceOrchestrator';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const URLs = [
  'https://www.youtube.com/live/X7158uQk1yI', // Full match
  'https://youtu.be/mxTJRptlBlk', // Highlights
  'https://youtu.be/gjvOfgTz6cc', // Goals
  'https://youtu.be/1nORGVL0Ito', // Counterattack
  'https://youtu.be/3DGztcamZWA'  // VAR
];

async function runBenchmark() {
  for (const videoUrl of URLs) {
    const jobId = 'bench-' + Math.random().toString(36).substring(7);
    console.log(`[Benchmark]: Starting full pipeline test for ${videoUrl} with JOB ID ${jobId}`);
    try {
      await updateJobStatus(jobId, { status: 'processing', progress: 0 });
      await processVideoJob(jobId, { videoUrl, numClips: 3 });
      const finalState = await getJobStatus(jobId);
      console.log(`[Benchmark]: Finished ${jobId} with status ${finalState?.status}`);
    } catch (error) {
      console.error(`[Benchmark]: Error on ${jobId}`, error);
    }
  }
}

runBenchmark().then(() => {
  console.log("All benchmarks complete.");
  process.exit(0);
});
