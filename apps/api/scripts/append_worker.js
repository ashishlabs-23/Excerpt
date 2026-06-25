const fs = require('fs');
const targetPath = 'apps/api/src/workers/videoWorker_fixed.ts';

const ending = `
    // ─── Step 4: Finalize ───────────────────────────────────────────
    await db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result: processedClips,
      recoveryMode: usedFallbackMode,
      generationMode,
      recoveryReason,
      totalExecutionTimeMs,
    });
    
    // Save clips to DB
    try {
      if (processedClips.length > 0) {
        const dbClips = processedClips.map((c: any) => ({
          id: c.id,
          job_id: c.job_id,
          video_url: c.video_url,
          thumbnail_url: c.thumbnail_url,
          title: c.title,
          caption: c.caption,
          start_time: c.start_time,
          end_time: c.end_time,
          content: c.content,
          metadata: c.metadata,
          validation_status: c.validation_status || 'passed',
          analysis_status: c.analysis_status || 'completed',
          is_archived: false,
        }));
        await db.saveClips(dbClips);
        console.log(\`[Worker]: \${processedClips.length} clips successfully saved to Supabase\`);

        for (const clip of processedClips) {
          try {
            const crypto = require('crypto');
            await memoryService.recordClipCoverage({
              video_id: videoUrl,
              start_time: clip.start_time,
              end_time: clip.end_time,
              clip_id: clip.id,
              transcript_hash: crypto.createHash('sha256').update(clip.caption || '').digest('hex'),
              story_signature: clip.metadata?.nexus?.story_signature || 'viral_moment',
              event_signature: clip.metadata?.nexus?.event_signature || 'moment',
              semantic_summary: clip.metadata?.description || clip.caption,
              embedding: clip.temp_embedding || null
            });
          } catch (memErr: any) {
            console.warn(\`[Worker]: Primary timeline coverage write failed for clip \${clip.id} (likely UUID constraint): \${memErr.message}. Retrying with omitted clip_id.\`);
            try {
              const crypto = require('crypto');
              await memoryService.recordClipCoverage({
                video_id: videoUrl,
                start_time: clip.start_time,
                end_time: clip.end_time,
                transcript_hash: crypto.createHash('sha256').update(clip.caption || '').digest('hex'),
                story_signature: clip.metadata?.nexus?.story_signature || 'viral_moment',
                event_signature: clip.metadata?.nexus?.event_signature || 'moment',
                semantic_summary: clip.metadata?.description || clip.caption,
                embedding: clip.temp_embedding || null
              });
            } catch (retryErr: any) {
              console.warn(\`[Worker]: Fallback timeline coverage write failed: \${retryErr.message}\`);
            }
          }
        }
      }
    } catch (dbError: any) {
      console.error(\`[Worker]: CRITICAL - Failed to save clips to DB: \${dbError.message}\`);
      throw dbError;
    }

    try {
      await db.updateJob(jobId, {
        debug_data: debugData,
        pipeline_summary: pipelineSummary,
        performance_metrics: { total: totalExecutionTimeMs },
      });
    } catch (telemetryErr: any) {
      console.warn(\`[Worker]: Telemetry persistence failed (non-fatal): \${telemetryErr.message}\`);
    }

    return {
      status: 'completed',
      progress: 100,
      result: processedClips,
      recoveryMode: usedFallbackMode,
      generationMode,
      recoveryReason,
      debug_data: debugData,
      pipeline_summary: pipelineSummary,
      totalExecutionTimeMs,
    };
  } catch (error: any) {
    const isCancel = error.message === 'Job was cancelled by the user.';
    const terminalStatus = isCancel ? 'cancelled' : 'failed';
    console.error(\`[Worker]: ❌ Job \${jobId} \${isCancel ? 'CANCELLED' : 'FAILED'}:\`, error.message);
    const totalExecutionTimeMs = Date.now() - monitor.startedAt;
    const performanceMetrics = {
      download: monitor.stages.stage_0_input?.execution_time_ms || 0,
      transcription: monitor.stages.stage_1_transcript?.execution_time_ms || 0,
      classification: monitor.stages.stage_1_5?.execution_time_ms || 0,
      ai_segmentation: monitor.stages.stage_3_segment_generation?.execution_time_ms || 0,
      nexus_analysis: monitor.stages.stage_2_to_12_nexus_modules?.execution_time_ms || 0,
      ranking: monitor.stages.stage_6_ranking?.execution_time_ms || 0,
      total: totalExecutionTimeMs,
    };
    const pipelineSummary = {
      modules_run: Array.from(monitor.run),
      modules_skipped: Array.from(monitor.skipped),
      modules_failed: Array.from(new Set([...Array.from(monitor.failed), 'pipeline_failure'])),
      total_execution_time_ms: totalExecutionTimeMs,
      output_files: [],
    };
    const debugDataError: any = {
      summary: pipelineSummary,
      error: error.message,
    };

    await db.updateJob(jobId, {
      status: terminalStatus,
      failedReason: error.message,
      retryable: !isCancel && error.retryable !== false,
      totalExecutionTimeMs,
    });

    try {
      await db.updateJob(jobId, {
        failed_reason: error.message,
        performance_metrics: performanceMetrics,
        debug_data: debugDataError,
        pipeline_summary: pipelineSummary,
      });
    } catch (dbError: any) {
      console.warn(\`[Worker]: Failed to update job telemetry in DB: \${dbError.message}\`);
    }

    return {
      status: terminalStatus,
      failedReason: error.message,
      retryable: !isCancel && error.retryable !== false,
      totalExecutionTimeMs,
    };
  } finally {
    clearInterval(heartbeatInterval);
    if (tempDir) {
      try { const fs = require('fs'); fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }

    if (uploadedSourcePathToCleanup) {
      try { const fs = require('fs'); fs.rmSync(uploadedSourcePathToCleanup, { force: true }); } catch {}
    }
  }
});

let isPolling = false;
let stopRequested = false;

async function processClaimedJobWithRetries(job: any) {
  let payload =
    job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
      ? { ...job.payload }
      : {};
  const initialRetryPayload =
    payload.retry && typeof payload.retry === 'object' && !Array.isArray(payload.retry)
      ? payload.retry
      : {};

  const initialAttempt = Number(initialRetryPayload.attempt || 0);
  const configuredMaxAttempts = Number(initialRetryPayload.maxAttempts || JOB_MAX_ATTEMPTS);
  let attempt = Number.isFinite(initialAttempt) ? Math.max(0, initialAttempt) : 0;
  const maxAttempts = Number.isFinite(configuredMaxAttempts)
    ? Math.max(1, configuredMaxAttempts)
    : JOB_MAX_ATTEMPTS;
  let lastResult: any = null;

  while (attempt < maxAttempts && !stopRequested) {
    const currentRetryPayload =
      payload.retry && typeof payload.retry === 'object' && !Array.isArray(payload.retry)
        ? payload.retry
        : {};
    attempt += 1;
    const attemptPayload = {
      ...payload,
      retry: {
        ...currentRetryPayload,
        attempt,
        maxAttempts,
        last_started_at: new Date().toISOString(),
      },
    };

    const jobData = {
      videoUrl: job.video_url || job.url,
      numClips: job.num_clips || 3,
      ...payload,
      attempt,
      maxAttempts,
    };

    try {
      await db.updateJob(job.id, {
        status: 'processing',
        progress: Math.max(0, Number(job.progress || 0)),
        payload: attemptPayload,
      });
    } catch (dbError) {
      console.warn(\`[Worker]: Failed to persist retry attempt \${attempt}/\${maxAttempts}:\`, dbError);
    }

    console.log(\`[Worker]: Attempt \${attempt}/\${maxAttempts} starting for job \${job.id}\`);
    
    if (job.job_type === 'voiceover' || job.payload?.job_type === 'voiceover') {
      try {
        await processVoiceoverJob(job);
        lastResult = { status: 'completed' };
      } catch (err: any) {
        lastResult = { status: 'failed', failedReason: err.message, retryable: true };
      }
    } else {
      lastResult = await processVideoJob(job.id, jobData);
    }

    if (lastResult?.status === 'completed') {
      return lastResult;
    }

    const retryable = lastResult?.retryable !== false;
    const failedReason = lastResult?.failedReason || 'Job failed before completion.';

    if (!retryable || attempt >= maxAttempts || stopRequested) {
      const terminalStatus = lastResult?.status === 'cancelled'
        ? 'cancelled'
        : (retryable && attempt >= maxAttempts ? 'dead_letter' : 'failed');
        
      const terminalPayload = {
        ...payload,
        retry: {
          ...currentRetryPayload,
          attempt,
          maxAttempts,
          dead_letter: terminalStatus === 'dead_letter',
          exhausted_at: new Date().toISOString(),
          last_error: failedReason,
        },
      };

      try {
        await db.updateJob(job.id, {
          status: terminalStatus,
          failed_reason: failedReason,
          payload: terminalPayload,
        });
      } catch (dbError) {
        console.warn(\`[Worker]: Failed to persist terminal retry state for \${job.id}:\`, dbError);
      }

      return { ...lastResult, status: terminalStatus, failedReason };
    }

    const retryDelayMs = getRetryDelayMs(attempt);
    const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();
    payload = {
      ...payload,
      retry: {
        ...currentRetryPayload,
        attempt,
        maxAttempts,
        next_retry_at: nextRetryAt,
        last_error: failedReason,
      },
    };

    try {
      await db.updateJob(job.id, {
        status: 'retrying',
        failed_reason: failedReason,
        payload,
      });
    } catch (dbError) {
      console.warn(\`[Worker]: Failed to persist retry backoff for \${job.id}:\`, dbError);
    }

    console.warn(\`[Worker]: Job \${job.id} failed attempt \${attempt}/\${maxAttempts}. Retrying in \${retryDelayMs}ms.\`);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await sleep(retryDelayMs);
  }

  return lastResult;
}

let activeWorkers = 0;
const MAX_CONCURRENT_WORKERS = 5;

const pollForJobs = async (workerId: number) => {
  console.log(\`[Worker-\${workerId}]: 🟢 Polling started.\`);
  while (!stopRequested) {
    try {
      const job = await db.getNextQueuedJob();
      
      if (job) {
        console.log(\`[Worker-\${workerId}]: ⚡ Processing Job \${job.id}\`);
        const result = await processClaimedJobWithRetries(job);
        if (result?.status === 'completed') {
          console.log(\`[Worker-\${workerId}]: ✅ Job \${job.id} finished.\`);
        } else {
          console.warn(\`[Worker-\${workerId}]: Job \${job.id} ended with status \${result?.status || 'unknown'}.\`);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (err: any) {
      console.error(\`[Worker-\${workerId}]: ❌ Error:\`, err.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  console.log(\`[Worker-\${workerId}]: 🛑 Stopped.\`);
};

export const startWorker = async () => {
  if (isPolling) {
    console.log('[Worker]: Neural Worker already running.');
    return;
  }

  isPolling = true;
  console.log(\`[Worker]: 🚀 Gen-4 Cloud-Polling Worker Starting with Concurrency \${MAX_CONCURRENT_WORKERS}...\`);

  // Start the stale job reclamation sweeper periodically (every 5 minutes)
  const sweeperInterval = setInterval(async () => {
    try {
      console.log('[Worker Sweeper]: Checking for stalled/orphaned jobs...');
      const reclaimedIds = await db.reclaimOrphanedJobs();
      if (reclaimedIds.length > 0) {
        console.log(\`[Worker Sweeper]: Reclaimed \${reclaimedIds.length} orphaned jobs:\`, reclaimedIds);
      }
    } catch (err: any) {
      console.error('[Worker Sweeper]: Sweeper loop encountered error:', err.message);
    }
  }, 5 * 60000);

  // Start concurrent polling loops
  const workerPromises = Array.from({ length: MAX_CONCURRENT_WORKERS }, (_, i) => pollForJobs(i + 1));
  
  // Wait for all to stop if stopRequested
  await Promise.all(workerPromises);
  
  clearInterval(sweeperInterval);
  isPolling = false;
  console.log(\`[Worker]: 🛑 All workers stopped.\`);
};

export const stopWorker = () => {
  stopRequested = true;
};

// Start if run directly
if (require.main === module) {
  startWorker().catch(err => {
    console.error('[Worker]: Fatal startup error:', err);
    process.exit(1);
  });
}
`;

fs.appendFileSync(targetPath, ending, 'utf8');
console.log('Appended to fixed file');
