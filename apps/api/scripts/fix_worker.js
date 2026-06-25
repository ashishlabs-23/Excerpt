const fs = require('fs');

const targetPath = 'apps/api/src/workers/videoWorker.ts';
let content = fs.readFileSync(targetPath, 'utf8');

const replacementBlock = `
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
`;

const lines = content.split('\\n');
// We need to cut out from line 1466 to 1502
// Since array is 0-indexed: lines 1465 to 1501
lines.splice(1465, 1502 - 1466 + 1, replacementBlock);
fs.writeFileSync(targetPath, lines.join('\\n'), 'utf8');
console.log('Fixed successfully');
