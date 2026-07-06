import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// Load environment variables
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

import { DatabaseService } from '../services/supabaseService';
import { VideoProcessor } from '../services/videoProcessor';
import { StorageService } from '../services/storageService';
import { CaptionService } from '../services/captionService';
import { JobStateMachine, JobStatus } from '../utils/JobStateMachine';
import { installConsoleLogger, withLogContext } from '../services/logger';
import { ensureSourceVideo } from '../services/download/ensureSourceVideo';

installConsoleLogger();

const db = new DatabaseService();
const processor = new VideoProcessor();
const storage = StorageService.getInstance();
const captionService = new CaptionService();
const workerInstanceId = `render-${os.hostname()}-${crypto.randomUUID()}`;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function claimNextRenderJob() {
  try {
      const workerEnv = (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'));
      const { data, error } = await db.getSupabase()
        .rpc('claim_next_render_job', { 
          worker_id_text: workerInstanceId,
          worker_env_text: workerEnv
        });
    if (error) throw error;
    if (data && data.length > 0) return data[0];
  } catch (err: any) {
    if (err.message?.includes('Could not find the function')) {
      console.warn('[RenderWorker]: RPC claim_next_render_job missing. Make sure to run v5_hardening_part2.sql migration.');
    } else {
      console.error('[RenderWorker]: Error claiming render job:', err.message);
    }
  }
  return null;
}

async function processRenderJob(renderJob: any) {
  return withLogContext({ renderJobId: renderJob.id, jobId: renderJob.job_id }, async () => {
    console.log(`[RenderWorker]: Processing render job ${renderJob.id} for job ${renderJob.job_id}`);
    
    // Heartbeat loop
    let isCancelled = false;
    const heartbeatInterval = setInterval(async () => {
      try {
        await db.getSupabase()
          .from('render_worker_heartbeats')
          .upsert({ worker_id: workerInstanceId, last_heartbeat: new Date().toISOString(), status: 'rendering' });
        
        await db.updateRenderJob(renderJob.id, { locked_at: new Date().toISOString() });
      } catch (e) {
        console.warn('[RenderWorker]: Heartbeat failed', e);
      }
    }, 10000);

    const payload = renderJob.payload;
    const clipId = renderJob.clip_id;
    const { clipStart, clipEnd, clipWords, cropPlan } = payload;
    
    // Path Normalization: Reconstruct absolute paths dynamically
    const tempDir = path.join(process.cwd(), 'temp', renderJob.job_id);
    // Rescue missing ephemeral file (Idempotent architecture helper)
    const { videoPath, telemetry } = await ensureSourceVideo(renderJob.job_id, payload.videoUrl, tempDir);
    console.log(`[RenderWorker]: ensureSourceVideo resolved:`, JSON.stringify(telemetry));
    
    // Check Render Cache (L5)
    const urlToHash = payload.videoUrl || videoPath;
    const hashPayload = `${urlToHash}_${clipStart}_${clipEnd}_${JSON.stringify(cropPlan || {})}`;
    const candidateHash = crypto.createHash('md5').update(hashPayload).digest('hex');
    
    const cachedRender = await db.getRenderCache(candidateHash);
    if (cachedRender) {
      console.log(`[RenderWorker]: ⚡ L5 Cache HIT for clip ${clipId}. Bypassing FFmpeg...`);
      await db.getSupabase().from('clips').update({
        storage_path: cachedRender.storage_path,
        thumbnail_url: cachedRender.thumbnail_path,
        status: 'uploaded'
      }).eq('id', clipId);
      
      await db.updateRenderJob(renderJob.id, { status: 'completed' });
      clearInterval(heartbeatInterval);
      await db.getSupabase().from('render_worker_heartbeats').upsert({ worker_id: workerInstanceId, last_heartbeat: new Date().toISOString(), status: 'idle' });
      return;
    }

    const cropMsStart = Date.now();
    let cropMs = 0;
    let captionMs = 0;
    let uploadMs = 0;

    let outputPath = path.join(tempDir, `clip-${clipId}.mp4`);

    try {
      // 1. Rendering
      const intermediatePath = path.join(tempDir, `cut-${clipId}.mp4`);
      console.log(`[RenderWorker]: Cutting clip ${clipId}...`);
      await processor.processClip(videoPath, intermediatePath, clipStart, clipEnd - clipStart, cropPlan);
      cropMs = Date.now() - cropMsStart;

      if (clipWords && clipWords.length > 0) {
        const assFilePath = path.join(tempDir, `subs-${clipId}.ass`);
        captionService.generateASS(clipWords, assFilePath);
        
        const captionStart = Date.now();
        console.log(`[RenderWorker]: Adding Viral Captions to clip ${clipId}...`);
        await processor.addCaptions(intermediatePath, outputPath, assFilePath);
        captionMs = Date.now() - captionStart;
      } else {
        const fs = require('fs');
        fs.renameSync(intermediatePath, outputPath);
      }

      await db.updateClipStatus(clipId, 'rendered');

      // 2. Thumbnail
      const thumbnailPath = path.join(tempDir, `thumb-${clipId}.jpg`);
      await processor.generateThumbnail(outputPath, thumbnailPath, 1);

      // 3. Upload
      await db.updateClipStatus(clipId, 'uploading');
      await db.updateRenderJob(renderJob.id, { status: 'uploading' });

      const uploadStart = Date.now();
      const storageKey = `jobs/${renderJob.job_id}/${clipId}.mp4`;
      const thumbStorageKey = `jobs/${renderJob.job_id}/${clipId}.jpg`;

      const [videoUrl, thumbUrl] = await Promise.all([
        storage.uploadFile(outputPath, storageKey),
        storage.uploadFile(thumbnailPath, thumbStorageKey)
      ]);
      uploadMs = Date.now() - uploadStart;

      // 4. Update Clip in DB
      await db.getSupabase().from('clips').update({
        storage_path: storageKey,
        thumbnail_url: thumbStorageKey,
        status: 'uploaded'
      }).eq('id', clipId);

      // Save to Render Cache
      await db.setRenderCache({
        candidate_hash: candidateHash,
        storage_path: storageKey,
        thumbnail_path: thumbStorageKey
      });

      // 5. Cleanup
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
        const assPath = path.join(tempDir, `subs-${clipId}.ass`);
        if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
      } catch (err) {
        console.warn(`[RenderWorker]: Cleanup warning:`, err);
      }

      // 6. Complete Verification Gate
      console.log(`[RenderWorker]: Verifying storage for clip ${clipId}...`);
      const videoExists = await storage.checkObjectExists(storageKey);
      const thumbExists = await storage.checkObjectExists(thumbStorageKey);
      
      if (!videoExists || !thumbExists) {
        throw new Error(`Storage verification failed: missing MP4 or thumbnail for clip ${clipId}.`);
      }

      const signedUrl = await storage.createSignedUrl(storageKey);
      if (!signedUrl || !signedUrl.startsWith('http')) {
        throw new Error(`Storage verification failed: Invalid signed URL for clip ${clipId}.`);
      }

      // 7. FFprobe Verification Gate
      console.log(`[RenderWorker]: Running ffprobe to verify streams for clip ${clipId}...`);
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'stream=codec_type',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          signedUrl
        ]);
        const streams = stdout.split('\n').map((s: string) => s.trim()).filter(Boolean);
        if (!streams.includes('video')) {
          throw new Error('ffprobe validation failed: No video stream found.');
        }
        // Notice we don't strictly require audio here if the source didn't have it, 
        // but it is logged. We require video stream as the absolute minimum.
        console.log(`[RenderWorker]: FFprobe streams verified for ${clipId}: ${streams.join(', ')}`);
      } catch (ffErr: any) {
        throw new Error(`Storage verification failed: ffprobe failed on signed URL for clip ${clipId}. ${ffErr.message}`);
      }

      // Atomic Finalization
      await db.updateRenderJob(renderJob.id, { status: 'completed' });
      
      // Save Render Metrics
      await db.saveRenderMetrics({
        job_id: renderJob.job_id,
        clip_id: clipId,
        crop_ms: cropMs,
        caption_ms: captionMs,
        upload_ms: uploadMs,
        total_ms: cropMs + captionMs + uploadMs
      });

      console.log(`[RenderWorker]: Completed render job ${renderJob.id}`);
      await checkParentJobCompletion(renderJob.job_id);
    } catch (err: any) {
      console.error(`[RenderWorker]: Render job failed:`, err);
      await db.updateClipStatus(clipId, 'failed');
      
      if (renderJob.attempt_count >= 3) {
        await db.getSupabase().from('render_dead_letters').insert({
          render_job_id: renderJob.id,
          job_id: renderJob.job_id,
          payload: renderJob.payload,
          final_error: err.message
        });
        await db.updateRenderJob(renderJob.id, { status: 'failed', error: err.message });
        await checkParentJobCompletion(renderJob.job_id);
      } else {
        await db.updateRenderJob(renderJob.id, { status: 'retrying', error: err.message, locked_by: null });
      }

      await db.logProductionFailure({
        job_id: renderJob.job_id,
        clip_id: clipId,
        error_message: err.message,
        stack_trace: err.stack,
        component: 'renderWorker'
      });
    } finally {
      clearInterval(heartbeatInterval);
      await db.getSupabase()
        .from('render_worker_heartbeats')
        .upsert({ worker_id: workerInstanceId, last_heartbeat: new Date().toISOString(), status: 'idle' });
    }
  });
}

async function checkParentJobCompletion(jobId: string) {
  try {
    const { data: renderJobs } = await db.getSupabase()
      .from('render_jobs')
      .select('status')
      .eq('job_id', jobId);

    if (!renderJobs || renderJobs.length === 0) return;

    const allCompletedOrFailed = renderJobs.every(rj => 
      rj.status === 'completed' || rj.status === 'failed' || rj.status === 'dead_letter'
    );

    if (allCompletedOrFailed) {
      console.log(`[RenderWorker]: All render jobs for parent job ${jobId} are terminal. Marking parent as completed.`);
      await JobStateMachine.transition(db, jobId, JobStatus.COMPLETED, { progress: 100 });
    }
  } catch (err) {
    console.warn(`[RenderWorker]: Failed to check/update parent job completion for ${jobId}:`, err);
  }
}

async function startPolling() {
  console.log(`[RenderWorker]: Started rendering worker ${workerInstanceId}. Waiting for render jobs...`);
  
  // Initial heartbeat
  await db.getSupabase()
    .from('render_worker_heartbeats')
    .upsert({ worker_id: workerInstanceId, last_heartbeat: new Date().toISOString(), status: 'idle' });

  let loops = 0;
  while (true) {
    try {
      if (loops % 30 === 0) {
        const reclaimed = await db.reclaimOrphanedRenderJobs(10 * 60000);
        if (reclaimed.length > 0) {
          console.log(`[RenderWorker]: 🧹 Sweeper reclaimed ${reclaimed.length} orphaned render jobs.`);
        }
      }
      loops++;

      const renderJob = await claimNextRenderJob();
      if (renderJob) {
        await processRenderJob(renderJob);
      } else {
        await sleep(2000);
      }
    } catch (err: any) {
      console.error('[RenderWorker]: Polling loop error:', err.message);
      await sleep(5000);
    }
  }
}

startPolling();
