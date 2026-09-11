import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import pLimit from 'p-limit';

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
import { VideoProcessor, getBinaryPath } from '../services/videoProcessor';
import { StorageService } from '../services/storageService';
import { CaptionService } from '../services/captionService';
import { JobStateMachine, JobStatus } from '../utils/JobStateMachine';
import { installConsoleLogger, withLogContext } from '../services/logger';
import { ensureSourceVideo } from '../services/download/ensureSourceVideo';
import { GenerativeVisualEngine } from '../services/intelligence/GenerativeVisualEngine';

import { firebaseDb } from '../services/firebaseService';
import { JobFinalizerService } from '../services/render/JobFinalizerService';

const PHASE_E_BROLL_ENABLED = process.env.ENABLE_PHASE_E_BROLL === 'true';
const generativeVisualEngine = new GenerativeVisualEngine();

installConsoleLogger();

const db = new DatabaseService();
const processor = new VideoProcessor();
const storage = StorageService.getInstance();
const captionService = new CaptionService();
const workerInstanceId = `render-${os.hostname()}-${crypto.randomUUID()}`;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function claimNextRenderJob() {
  const workerEnv = (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'));
  
  // 1. Fast local / Firebase Queue Claim
  try {
    const localRenderJob = firebaseDb.claimRenderJob(workerInstanceId);
    if (localRenderJob) {
      console.log(`[RenderWorker]: ⚡ Claimed local render job ${localRenderJob.id} for job ${localRenderJob.job_id}`);
      return localRenderJob;
    }
  } catch {}

  // 2. Try Supabase RPC stored procedure (atomic — no TOCTOU race)
  try {
    const { data, error } = await db.getSupabase()
      .rpc('claim_next_render_job', { 
        worker_id_text: workerInstanceId,
        worker_env_text: workerEnv
      });
    if (!error && data && data.length > 0) return data[0];
  } catch (err: any) {}

  // Direct-table fallback removed: the RPC above is atomic and owns claim logic.
  // A non-atomic SELECT+UPDATE fallback creates a TOCTOU duplicate-ownership race.
  // If the RPC is unavailable, return null and let the poller retry.
  return null;
}

export async function processRenderJob(renderJob: any) {
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
    const hookText: string = payload.hookText || '';
    const generationMode = (payload.generationMode as 'draft' | 'quality') || (payload.generation_mode as 'draft' | 'quality') || (process.env.RENDER_MODE === 'draft' ? 'draft' : 'quality');
    
    // Path Normalization: Reconstruct absolute paths dynamically
    const tempDir = path.join(process.cwd(), 'temp', renderJob.job_id);
    // Rescue missing ephemeral file using immutable source artifact
    const { videoPath, telemetry } = await ensureSourceVideo(
      renderJob.job_id,
      payload.sourceStorageKey || payload.videoUrl,
      tempDir,
      payload.contentHash
    );
    console.log(`[RenderWorker]: ensureSourceVideo resolved:`, JSON.stringify(telemetry));
    
    // Check Render Cache (L5)
    const urlToHash = payload.videoUrl || videoPath;
    const hashPayload = `${urlToHash}_${clipStart}_${clipEnd}_${JSON.stringify(cropPlan || {})}`;
    const candidateHash = crypto.createHash('md5').update(hashPayload).digest('hex');
    
    const cachedRender = process.env.BYPASS_RENDER_CACHE === 'true' ? null : await db.getRenderCache(candidateHash);
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

      // P4.4 Event-driven render fan-in
      try {
        const fanIn = await db.checkAndFinalizeRenderFanIn(renderJob.job_id);
        if (fanIn.claimed) {
          await JobFinalizerService.finalizeJob(db, renderJob.job_id);
        }
      } catch (fanInErr: any) {
        console.warn(`[RenderWorker]: Fan-in check error: ${fanInErr.message}`);
      }
      return;
    }

    const cropMsStart = Date.now();
    let cropMs = 0;
    let captionMs = 0;
    let uploadMs = 0;

    let outputPath = path.join(tempDir, `clip-${clipId}.mp4`);
    const cleanOutputPath = path.join(tempDir, `clip-${clipId}-clean.mp4`);
    const assFilePath = path.join(tempDir, `subs-${clipId}.ass`);

    try {
      // 1. Single-Pass High-Speed Render with Burned Captions
      let hasCaptions = false;
      const wordsToCaption = clipWords;

      const clipDurationSec = clipEnd - clipStart;
      const actualRenderedDurationSec = clipDurationSec;

      if (wordsToCaption && wordsToCaption.length > 0) {
        try {
          fs.mkdirSync(path.dirname(assFilePath), { recursive: true });

          // 1. Sort raw words strictly ascending by source start timestamp
          const sortedRawWords = [...wordsToCaption]
            .filter((w: any) => typeof w.start === 'number' && typeof w.end === 'number' && (w.word || w.text) && String(w.word || w.text).trim().length > 0)
            .sort((a: any, b: any) => a.start - b.start);

          // Contract: clipWords carry source-media timestamps (wordsAreAbsolute: true).
          // Fallback to auto-detection if flag is missing:
          const explicitAbsolute = (renderJob.payload as any)?.wordsAreAbsolute;
          const wordsLookAbsolute = (clipStart > 0.5 && sortedRawWords.some((w: any) => Number(w.start) >= clipStart * 0.5)) ||
            sortedRawWords.some((w: any) => Number(w.start) >= clipDurationSec);
          const wordsAreAbsolute: boolean = explicitAbsolute !== undefined ? explicitAbsolute === true : (clipStart > 0.5 ? wordsLookAbsolute : true);

          // 3. Canonical Word Intersection: retain only if word.end > clipStart AND word.start < clipEnd
          const relativeWords: any[] = [];
          for (const w of sortedRawWords) {
            const rawStart = Number(w.start);
            const rawEnd = Number(w.end);
            const wordText = String(w.word || w.text).trim();

            if (wordsAreAbsolute) {
              if (rawEnd > clipStart && rawStart < clipEnd) {
                const relativeStart = Math.max(0, Number((rawStart - clipStart).toFixed(3)));
                const relativeEnd = Math.min(clipDurationSec, Number((rawEnd - clipStart).toFixed(3)));
                if (relativeEnd > relativeStart) {
                  relativeWords.push({ ...w, word: wordText, start: relativeStart, end: relativeEnd });
                }
              }
            } else {
              // Legacy path: words already 0-relative
              if (rawEnd > 0 && rawStart < clipDurationSec) {
                const relativeStart = Math.max(0, Number(rawStart.toFixed(3)));
                const relativeEnd = Math.min(clipDurationSec, Number(rawEnd.toFixed(3)));
                if (relativeEnd > relativeStart) {
                  relativeWords.push({ ...w, word: wordText, start: relativeStart, end: relativeEnd });
                }
              }
            }
          }

          // Invariant: strictly chronological relative words
          relativeWords.sort((a, b) => a.start - b.start);

          if (relativeWords.length > 0) {
            const requestedStyle = (renderJob.payload as any)?.caption_style
              || (renderJob.payload as any)?.caption_preset
              || 'submagic';
            captionService.generateASS(relativeWords, assFilePath, requestedStyle, clipDurationSec);
            hasCaptions = true;
          }
        } catch (capGenErr: any) {
          console.warn(`[RenderWorker]: Caption script generation failed (${capGenErr.message}), proceeding without captions.`);
        }
      }

      let renderedClips: { videoPath: string; startSec: number; durationSec: number; layout?: string }[] = [];
      let bRollDir: string | undefined;

      // ── Phase E: Contextual B-Roll Preparation (Gate: ENABLE_PHASE_E_BROLL=true) ──
      if (PHASE_E_BROLL_ENABLED) {
        try {
          // Contract: all clipWords carry source-media timestamps (wordsAreAbsolute: true per payload contract).
          const wordsAreAbsoluteForBRoll: boolean = (renderJob.payload as any)?.wordsAreAbsolute === true;
          const relWordsForBRoll = (clipWords || []).map((w: any) => ({
            word: w.word || '',
            start: wordsAreAbsoluteForBRoll ? Math.max(0, (w.start ?? 0) - clipStart) : Math.max(0, w.start ?? 0),
            end: wordsAreAbsoluteForBRoll ? Math.max(0, (w.end ?? 0) - clipStart) : Math.max(0, w.end ?? 0),
          }));

          const bRollMoments = generativeVisualEngine.planBRollMoments(
            relWordsForBRoll,
            0,
            clipDurationSec
          );

          if (bRollMoments.length > 0) {
            bRollDir = path.join(tempDir, `broll-${clipId}`);
            const synthesisLimit = pLimit(2);
            renderedClips = await Promise.all(
              bRollMoments.map((moment) =>
                synthesisLimit(async () => {
                  const bRollPath = await generativeVisualEngine.generateLocalBRollClip(moment, bRollDir!);
                  return { videoPath: bRollPath, startSec: moment.startSec, durationSec: moment.durationSec, layout: moment.layout };
                })
              )
            );
            console.log(`[RenderWorker]: Phase E — ${renderedClips.length} B-Roll clips prepared for unified render.`);
          }
        } catch (phaseEErr: any) {
          console.warn(`[RenderWorker]: Phase E non-fatal B-Roll prep warning: ${phaseEErr.message}`);
        }
      }

      console.log(`[RenderWorker]: Executing clean base render (${generationMode}) for clip ${clipId}...`);
      const renderStart = Date.now();
      await processor.renderSinglePassClip({
        inputPath: videoPath,
        outputPath: cleanOutputPath,
        start: clipStart,
        duration: clipDurationSec,
        cropPlan,
        subtitlePath: undefined, // Pristine clean clip for studio editor & clean downloads
        bRollClips: renderedClips.length > 0 ? renderedClips : undefined,
        hookText: (PHASE_E_BROLL_ENABLED && hookText) ? hookText : undefined,
        totalDurationSec: actualRenderedDurationSec,
        generationMode,
      });
      cropMs = Date.now() - renderStart;

      if (hasCaptions && fs.existsSync(assFilePath)) {
        console.log(`[RenderWorker]: Burning styled captions onto clip ${clipId}...`);
        const capStart = Date.now();
        await processor.burnInSubtitles(cleanOutputPath, outputPath, assFilePath);
        captionMs = Date.now() - capStart;
      } else {
        fs.copyFileSync(cleanOutputPath, outputPath);
        captionMs = 0;
      }

      if (bRollDir) {
        try { fs.rmSync(bRollDir, { recursive: true, force: true }); } catch {}
      }

      // 2. Local FFprobe Stream Verification Gate (Verifies local MP4 health before upload)
      console.log(`[RenderWorker]: Running local ffprobe stream check for clip ${clipId}...`);
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      const ffprobeBin = getBinaryPath('ffprobe');
      try {
        const { stdout } = await execFileAsync(ffprobeBin, [
          '-v', 'error',
          '-show_entries', 'stream=codec_type',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          outputPath
        ]);
        const streams = stdout.split('\n').map((s: string) => s.trim()).filter(Boolean);
        if (!streams.includes('video')) {
          throw new Error('Local stream check failed: No video stream detected in rendered clip.');
        }
        console.log(`[RenderWorker]: Local FFprobe verified for ${clipId}: [${streams.join(', ')}]`);
      } catch (ffErr: any) {
        throw new Error(`Clip validation failed: ffprobe error on ${outputPath}: ${ffErr.message}`);
      }

      await db.updateClipStatus(clipId, 'rendered');

      // 3. Thumbnail Generation
      const thumbnailPath = path.join(tempDir, `thumb-${clipId}.jpg`);
      await processor.generateThumbnail(outputPath, thumbnailPath, 1);

      // 4. Upload Assets to Storage
      await db.updateClipStatus(clipId, 'uploading');
      await db.updateRenderJob(renderJob.id, { status: 'uploading' });

      const uploadStart = Date.now();
      const storageKey = `jobs/${renderJob.job_id}/${clipId}.mp4`;
      const cleanStorageKey = `jobs/${renderJob.job_id}/${clipId}-clean.mp4`;
      const thumbStorageKey = `jobs/${renderJob.job_id}/${clipId}.jpg`;

      const uploadTasks: [Promise<string>, Promise<string | undefined>, Promise<string>] = [
        storage.uploadFile(outputPath, storageKey),
        fs.existsSync(cleanOutputPath)
          ? storage.uploadFile(cleanOutputPath, cleanStorageKey)
          : Promise.resolve(undefined),
        storage.uploadFile(thumbnailPath, thumbStorageKey)
      ];

      const [videoUrl, cleanVideoUrl, thumbUrl] = await Promise.all(uploadTasks);
      uploadMs = Date.now() - uploadStart;

      // 5. Update Clip in Local Queue & DB
      try {
        const queue = firebaseDb.readQueue();
        if (queue.clips && queue.clips[clipId]) {
          queue.clips[clipId] = {
            ...queue.clips[clipId],
            storage_path: storageKey,
            video_url: videoUrl,
            thumbnail_url: thumbUrl,
            status: 'uploaded',
            metadata: {
              ...(queue.clips[clipId].metadata || {}),
              ...(cleanVideoUrl ? {
                video_clean_storage_key: cleanStorageKey,
                video_clean_url: cleanVideoUrl,
              } : {}),
              video_captioned_storage_key: storageKey,
              video_captioned_url: videoUrl,
            },
            updated_at: new Date().toISOString(),
          };
          firebaseDb.writeQueue(queue);
        }
      } catch {}

      try {
        const { data: existingClip } = await db.getSupabase().from('clips').select('metadata').eq('id', clipId).single();
        const mergedMeta = {
          ...(existingClip?.metadata || {}),
          video_clean_storage_key: cleanStorageKey,
          video_clean_url: cleanVideoUrl,
          video_captioned_storage_key: storageKey,
          video_captioned_url: videoUrl,
        };
        const { data: updatedClipData, error: clipUpdateErr } = await db.getSupabase().from('clips').update({
          storage_path: storageKey,
          video_url: videoUrl,
          thumbnail_url: thumbUrl,
          status: 'uploaded',
          metadata: mergedMeta,
        }).eq('id', clipId).select();

        console.log(`[RenderWorker]: Clip DB Update Result for ${clipId}:`, {
          success: Boolean(updatedClipData && updatedClipData.length > 0),
          count: updatedClipData?.length || 0,
          error: clipUpdateErr?.message || null,
          storageKey,
          cleanStorageKey,
        });
      } catch (dbErr: any) {
        console.warn(`[RenderWorker]: Clip Supabase update fallback:`, dbErr.message);
      }

      // Save to Render Cache
      try {
        await db.setRenderCache({
          candidate_hash: candidateHash,
          storage_path: storageKey,
          thumbnail_path: thumbStorageKey
        });
      } catch {}

      // 6. Cleanup Local Temp Files (Eager unlinking to prevent disk leaks)
      try {
        if (fs.existsSync(cleanOutputPath)) fs.unlinkSync(cleanOutputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
        if (fs.existsSync(assFilePath)) fs.unlinkSync(assFilePath);
      } catch (err) {
        console.warn(`[RenderWorker]: Cleanup warning:`, err);
      }

      // Atomic Finalization
      await db.updateClipStatus(clipId, 'uploaded');
      await db.updateRenderJob(renderJob.id, { status: 'completed', clip_id: clipId });
      
      // Save Render Metrics
      await db.saveRenderMetrics({
        job_id: renderJob.job_id,
        clip_id: clipId,
        crop_ms: cropMs,
        caption_ms: captionMs,
        upload_ms: uploadMs,
        total_ms: cropMs + captionMs + uploadMs
      });

      // P4.4 Event-driven render fan-in
      try {
        const fanIn = await db.checkAndFinalizeRenderFanIn(renderJob.job_id);
        if (fanIn.claimed) {
          await JobFinalizerService.finalizeJob(db, renderJob.job_id);
        }
      } catch (fanInErr: any) {
        console.warn(`[RenderWorker]: Fan-in check error: ${fanInErr.message}`);
      }

      // 7. Cleanup Job Temp Directory ONLY if ALL render jobs for this job are done
      try {
        let hasPending = false;
        try {
          const localJobs = firebaseDb.getRenderJobsForJob(renderJob.job_id);
          hasPending = localJobs.some((j: any) =>
            ['pending', 'queued', 'rendering', 'uploading'].includes(j.status) && j.id !== renderJob.id
          );
        } catch {}

        if (!hasPending) {
          try {
            const { data: pendingJobs, error } = await db.getSupabase()
              .from('render_jobs')
              .select('id')
              .eq('job_id', renderJob.job_id)
              .in('status', ['pending', 'queued', 'rendering']);

            if (!error && pendingJobs && pendingJobs.length > 0) {
              hasPending = true;
            }
          } catch {}
        }

        if (!hasPending) {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`[RenderWorker]: 🧹 Cleaned up job temp directory: ${tempDir}`);
          }
        } else {
          console.log(`[RenderWorker]: ⏳ Preserving ${tempDir}; sibling render jobs still active for job ${renderJob.job_id}`);
        }
      } catch (cleanErr: any) {
        console.warn(`[RenderWorker]: Job temp cleanup warning: ${cleanErr.message}`);
      }

      console.log(`[RenderWorker]: Completed render job ${renderJob.id}`);
    } catch (err: any) {
      console.error(`[RenderWorker]: Render job failed:`, err);
      await db.updateClipStatus(clipId, 'failed');
      
      if (renderJob.attempt_count >= 3) {
        try {
          await db.getSupabase().from('render_dead_letters').insert({
            render_job_id: renderJob.id,
            job_id: renderJob.job_id,
            payload: renderJob.payload,
            final_error: err.message
          });
        } catch {}
        await db.updateRenderJob(renderJob.id, { status: 'failed', error: err.message });
        try {
          const fanIn = await db.checkAndFinalizeRenderFanIn(renderJob.job_id);
          if (fanIn.claimed) {
            await JobFinalizerService.finalizeJob(db, renderJob.job_id);
          }
        } catch (fanInErr: any) {
          console.warn(`[RenderWorker]: Fan-in check error on failure: ${fanInErr.message}`);
        }
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
      try {
        await db.getSupabase()
          .from('render_worker_heartbeats')
          .upsert({ worker_id: workerInstanceId, last_heartbeat: new Date().toISOString(), status: 'idle' });
      } catch {}
    }
  });
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

if (require.main === module) {
  startPolling();
}
