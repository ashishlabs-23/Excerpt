const dotenv = require('dotenv');
const path = require('path');

// Load environment variables IMMEDIATELY
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Register ts-node for CJS imports of TS files
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});

// Now we can require our workers/services
const { processVideoJob } = require('./workers/videoWorker');
const { updateJobStatus, getJobStatus } = require('./services/jobState');
const { DatabaseService, supabase } = require('./services/supabaseService');

const videoUrl = process.env.YOUTUBE_URL || 'https://www.youtube.com/watch?v=9AY_Jpm_42Y';
const numClips = 5;

const db = new DatabaseService();

async function runDebug() {
  console.log(`[Debug]: Starting full pipeline test for ${videoUrl}`);
  
  try {
    // 1. Try Supabase Job Creation (with fallback)
    let realJobId;
    try {
      console.log('[Debug]: Creating new job record in Supabase...');
      const jobData = {
        status: 'pending',
        videoUrl: videoUrl,
        numClips: numClips,
        createdAt: new Date().toISOString()
      };
      const job = await db.createJob(jobData);
      realJobId = job.id;
      console.log(`[Debug]: Created job in Supabase with ID: ${realJobId}`);
    } catch (e) {
      console.warn(`[Debug]: Supabase job creation failed (${e.message}). Falling back to local state.`);
      realJobId = 'local-' + Date.now();
      // Ensure local state is initialized
      await updateJobStatus(realJobId, { status: 'pending', progress: 0, videoUrl });
    }

    // Update status to 'processing'
    await updateJobStatus(realJobId, { status: 'processing', progress: 0 });

    // Update status to 'processing'
    await updateJobStatus(realJobId, { status: 'processing', progress: 0 });
    
    // 2. Run the actual worker logic directly
    await processVideoJob(realJobId, { videoUrl, numClips });
    
    // 3. Log final status
    const finalState = await getJobStatus(realJobId);
    console.log('[Debug]: Final Job State:', JSON.stringify(finalState, null, 2));
    
    if (finalState?.status === 'completed') {
      console.log('[Debug]: SUCCESS - Pipeline completed fully.');
      process.exit(0);
    } else {
      console.error(`[Debug]: FAILED - Status is ${finalState?.status}`);
      if (finalState?.failedReason) {
        console.error(`[Debug]: Reason: ${finalState.failedReason}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('[Debug]: Critical error during pipeline execution:');
    console.error(error);
    process.exit(1);
  }
}

runDebug();
