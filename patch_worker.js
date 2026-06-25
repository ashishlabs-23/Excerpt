const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'apps/api/src/workers/videoWorker.ts');
let content = fs.readFileSync(workerPath, 'utf-8');

// The replacement logic:
const startIndexMatches = content.match(/Step 3: FFmpeg Processing/);
const endIndexMatches = content.match(/Step 4: Finalize/);

if (!startIndexMatches || !endIndexMatches) {
  console.error("Could not find boundaries");
  process.exit(1);
}

const startIndex = content.lastIndexOf('//', startIndexMatches.index);
const endIndex = content.lastIndexOf('//', endIndexMatches.index);

const replacement = `// ─── Step 3: Enqueue Render Jobs ──────────────────────────
    const stage11StartedAt = Date.now();
    await db.updateJob(jobId, { progress: 60, status: 'detecting_clips' });
    try { await db.updateJob(jobId, { status: 'detecting_clips', progress: 60 }); } catch {}
    console.log(\`[Worker]: Enqueueing \${clips.length} clips for renderWorker...\`);
    
    const dbClips = [];
    const validationWarnings: string[] = [];

    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex];
      const clipId = clip.id;
      let renderStart = clip.start_time;
      let renderEnd = clip.end_time;
      let duration = renderEnd - renderStart;
      
      const shortSourceFloor = Math.max(1, Number(sourceDuration.toFixed(2)));
      const shortSourceSlack = sourceDuration < 30 ? Math.min(0.75, Math.max(0.25, sourceDuration * 0.08)) : 0;
      const minDuration = sourceDuration < 30 ? Math.max(2, Number((shortSourceFloor - shortSourceSlack).toFixed(2))) : clip.isRecovery ? 10.0 : 15.0;

      if (sourceDuration < 30 && duration >= Math.max(2, Number((sourceDuration * 0.72).toFixed(2))) && duration < shortSourceFloor) {
        renderStart = 0;
        renderEnd = shortSourceFloor;
        duration = renderEnd - renderStart;
      }
      
      if (duration < 14.9 && !clip.isRecovery && sourceDuration >= 30) {
        console.warn(\`[Worker]: HARDWARE LOCK TRIPPED - Clip \${clipIndex + 1} (\${duration.toFixed(1)}s) violated the 15s protocol. Discarding.\`);
        continue;
      }

      if (duration < minDuration) {
        console.warn(\`[Worker]: Clip \${clipIndex + 1} (\${duration.toFixed(1)}s) is too short to render safely. Discarding.\`);
        continue;
      }

      let cropPlan = (clip as any).nexus_metadata?.crop_plan || {};
      
      if (pipelineContext.category.category === 'football' && !isDraftMode) {
        try {
          const orchestrator = IntelligenceOrchestrator.getInstance();
          const payload = { videoPath: inputPath, clipId, start_time: renderStart, end_time: renderEnd, cropPlan };
          const criticRes = await orchestrator.runSingle('ball_visibility_critic', payload, tempDir);
          const repairRes = await orchestrator.runSingle('ball_visibility_repair', { ...payload, critic: criticRes }, tempDir, { ball_visibility_critic: criticRes });
          const reframeRes = await orchestrator.runSingle('reframe_engine', { ...payload, repair: repairRes }, tempDir, { ball_visibility_repair: repairRes });
          const predictiveRes = await orchestrator.runSingle('predictive_crop_engine', { ...payload, reframe: reframeRes }, tempDir, { reframe_engine: reframeRes });

          if (predictiveRes.data?.crop_plan) {
             cropPlan = predictiveRes.data.crop_plan;
          }
        } catch (err: any) {
          console.warn(\`[Worker]: Football Crop Ownership sequence failed for clip \${clipIndex + 1}.\`, err.message);
        }
      }

      // Generate Idempotency Key
      const generationKey = \`\${jobId}_\${renderStart}_\${renderEnd}\`;

      const clipTitle = (clip as any).enhancements?.title || clip.title || \`Viral Fragment #\${clipId.slice(0, 4)}\`;
      const hookText = (clip as any).enhancements?.hook || clip.hook || clip.content;
      const summaryText = (clip as any).enhancements?.description || clip.summary || clip.content;
      const clipScore = clip.clip_score || clip.virality_score;

      // DB.1: Prepare Clip DB record
      const dbClip = {
        id: clipId,
        job_id: jobId,
        status: 'pending',
        generation_key: generationKey,
        title: clipTitle,
        caption: clip.content,
        start_time: renderStart,
        end_time: renderEnd,
        content: clip.content,
        metadata: {
          title: clipTitle,
          hook: hookText,
          summary: summaryText,
          selection_reason: clip.reason,
          virality_score: clip.virality_score,
          clip_score: clipScore,
          score_breakdown: clip.score_breakdown,
          generation_mode: clip.isRecovery ? 'recovery' : generationMode,
          nexus: (clip as any).nexus_metadata,
        },
        validation_status: 'passed',
        analysis_status: 'completed',
        is_archived: false
      };
      
      dbClips.push(dbClip);

      // Create Render Job
      await db.createRenderJob({
        job_id: jobId,
        clip_id: clipId,
        status: 'pending',
        payload: {
          videoPath: inputPath,
          clipStart: renderStart,
          clipEnd: renderEnd,
          clipWords: clipWords,
          tempDir: tempDir,
          cropPlan: cropPlan
        }
      });
    }

    if (dbClips.length === 0) {
      throw new Error('No clips were generated to enqueue.');
    }

    // Save Idempotent Clips
    await db.saveClips(dbClips);
    console.log(\`[Worker]: \${dbClips.length} clips enqueued to render_jobs successfully.\`);

    recordStage(monitor, 'stage_11_persistence', stage11StartedAt, 'success');

    const usedFallbackMode = generationMode !== 'ai';
    const totalExecutionTimeMs = Date.now() - monitor.startedAt;
    const pipelineSummary = {
      modules_run: Array.from(monitor.run),
      modules_skipped: Array.from(monitor.skipped),
      modules_failed: Array.from(monitor.failed),
      total_execution_time_ms: totalExecutionTimeMs,
      validation_warnings: validationWarnings,
    };
    
    // Save to Analysis Cache
    try {
      await cacheService.setCache(videoHash, requiredVersions, {
        rawAnalysis: {
          transcript: transcriptionText,
          segments,
          words,
          category: pipelineContext.category,
        },
        candidateMoments: clips,
        renderPlans: dbClips.map(c => ({
          id: c.id,
          title: c.title,
          start_time: c.start_time,
          end_time: c.end_time,
          cropPlan: c.metadata?.nexus?.crop_plan,
        })),
      });
    } catch (cacheSetErr: any) {
      console.warn('[Worker]: Non-fatal - failed to write to analysis cache:', cacheSetErr.message);
    }

    `;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(workerPath, newContent, 'utf-8');
console.log("Successfully patched videoWorker.ts");
