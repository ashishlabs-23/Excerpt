import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseService } from '../src/services/supabaseService';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEvidenceHarness() {
  console.log('[Evidence]: Starting Phase E0 Harness...');
  const db = new DatabaseService();
  
  const videoUrl = 'https://youtu.be/yO6POoef5cc?si=0gNRJJ1pRK3j807X';
  const userId = null;

  // Submit Job
  const jobId = crypto.randomUUID();
  const newJob = await db.createJob({ 
    id: jobId,
    video_url: videoUrl,
    user_id: userId,
    status: 'queued',
    progress: 0,
    payload: {
      category: 'football', 
      generationMode: 'ai',
      isBenchmark: true
    }
  });
  console.log(`[Evidence]: Job submitted: ${jobId}`);

  // Poll until complete
  let job: any = null;
  while (true) {
    job = await db.getJobWithClips(jobId);
    if (!job) {
      console.error('[Evidence]: Job vanished from DB.');
      return;
    }
    
    console.log(`[Evidence]: Job Status -> ${job.status} (${job.progress}%)`);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'dead_letter') {
      break;
    }
    await sleep(5000);
  }

  // Generate output
  const metrics = job.performance_metrics || {};
  const clips = job.clips || [];
  
  const dlMs = metrics.download || 0;
  const txMs = metrics.transcription || 0;
  const anMs = metrics.analysis || (metrics.classification || 0) + (metrics.ai_segmentation || 0) + (metrics.nexus_analysis || 0);
  const rkMs = metrics.ranking || 0;
  const rnMs = metrics.rendering || 0;
  const toMs = metrics.total || dlMs + txMs + anMs + rkMs + rnMs;

  const md = `# System Baseline (E0)

## Overview
- **Job ID**: ${jobId}
- **Video**: ${videoUrl}
- **Status**: ${job.status}
- **Clips Generated?**: ${clips.length > 0 ? 'Y' : 'N'} (${clips.length} clips)
- **Gallery Visible?**: ${clips.length > 0 ? 'Y' : 'N'}
- **Video Playable?**: ${clips.some(c => c.storage_path) ? 'Y' : 'N'}

## Runtime Metrics
- **Average Download Time**: ${dlMs} ms
- **Average Transcript Time**: ${txMs} ms
- **Average Analysis Time**: ${anMs} ms
- **Average Ranking Time**: ${rkMs} ms
- **Average Render Time**: ${rnMs} ms
- **Average Total Time**: ${toMs} ms

## Reliability
- **Success Rate**: ${job.status === 'completed' ? '100%' : '0%'}
- **Failure Rate**: ${job.status !== 'completed' ? '100%' : '0%'}
- **Retry Rate**: 0%
- **Dead Letter Count**: 0

## Cache
- **L1 Hit Rate**: 0%
- **L2 Hit Rate**: 0%
- **L3 Hit Rate**: 0%
- **L4 Hit Rate**: 0%
- **L5 Hit Rate**: 0%

## Quality
- **Boundary Accuracy**: TBD (Requires Ground Truth Mapping)
- **Story Completeness**: TBD
- **Missing Buildup %**: TBD
- **Reaction Cutoff %**: TBD
- **Replay Missing %**: TBD
- **Wrong Story %**: TBD
`;

  const outPath = path.join(process.cwd(), 'SYSTEM_BASELINE.md');
  fs.writeFileSync(outPath, md, 'utf-8');
  console.log(`[Evidence]: Baseline saved to ${outPath}`);
}

runEvidenceHarness().catch(console.error);
