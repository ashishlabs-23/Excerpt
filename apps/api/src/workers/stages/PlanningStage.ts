import crypto from 'crypto';
import { DatabaseService } from '../../services/supabaseService';
import { MicroJumpCutter } from '../../services/intelligence/MicroJumpCutter';
import { PipelineStage, StageResult } from './types';

export interface PlanningInput {
  jobId: string;
  videoUrl: string;
  clips: any[];
  sourceDuration: number;
  words: any[];
  generationMode: string;
  db: DatabaseService;
}

export interface PlanningOutput {
  dbClips: any[];
  pendingRenderJobs: any[];
  enqueuedCount: number;
}

export class PlanningStage implements PipelineStage<PlanningInput, PlanningOutput> {
  readonly name = 'stage_11_planning_and_persistence';
  private jumpCutter = new MicroJumpCutter();

  async execute(input: PlanningInput): Promise<StageResult<PlanningOutput>> {
    const startedAt = Date.now();
    const {
      jobId,
      videoUrl,
      clips,
      sourceDuration,
      words,
      generationMode,
      db,
    } = input;

    try {
      const dbClips: any[] = [];
      const pendingRenderJobs: any[] = [];

      for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
        const clip = clips[clipIndex];
        const clipId = clip.id;
        let renderStart = clip.start_time;
        let renderEnd = clip.end_time;
        let duration = renderEnd - renderStart;

        const shortSourceFloor = Math.max(1, Number(sourceDuration.toFixed(2)));
        const shortSourceSlack = sourceDuration < 30 ? Math.min(0.75, Math.max(0.25, sourceDuration * 0.08)) : 0;
        const minDuration = sourceDuration < 30
          ? Math.max(2, Number((shortSourceFloor - shortSourceSlack).toFixed(2)))
          : clip.isRecovery ? 10.0 : 15.0;

        if (sourceDuration < 30 && duration >= Math.max(2, Number((sourceDuration * 0.72).toFixed(2))) && duration < shortSourceFloor) {
          renderStart = 0;
          renderEnd = shortSourceFloor;
          duration = renderEnd - renderStart;
        }

        if (duration < 14.9 && !clip.isRecovery && sourceDuration >= 30) {
          console.warn(`[PlanningStage]: HARDWARE LOCK TRIPPED - Clip ${clipIndex + 1} (${duration.toFixed(1)}s) violated the 15s protocol. Discarding.`);
          continue;
        }

        if (duration < minDuration) {
          console.warn(`[PlanningStage]: Clip ${clipIndex + 1} (${duration.toFixed(1)}s) is too short to render safely. Discarding.`);
          continue;
        }

        const cropPlan = (clip as any).nexus_metadata?.crop_plan || {};

        // Compute render cache hash
        const hashPayload = `${videoUrl}_${renderStart}_${renderEnd}_${JSON.stringify(cropPlan || {})}`;
        const candidateHash = crypto.createHash('md5').update(hashPayload).digest('hex');
        const generationKey = candidateHash;

        const clipTitle = (clip as any).enhancements?.title || clip.title || `Viral Fragment #${clipId.slice(0, 4)}`;
        const hookText = (clip as any).enhancements?.hook || clip.hook || clip.content;
        const summaryText = (clip as any).enhancements?.description || clip.summary || clip.content;
        const clipScore = clip.clip_score || clip.virality_score;

        // Extract words matching this clip's time range
        const rawClipWords = (clip as any).words || (words || []).filter(
          (w: any) => typeof w.start === 'number' && typeof w.end === 'number' && w.start >= (renderStart - 0.25) && w.end <= (renderEnd + 0.25)
        );
        (clip as any).words = rawClipWords;

        // Plan micro jump-cuts to eliminate pauses
        let jumpCutPlan: any = null;
        if (rawClipWords && rawClipWords.length > 0) {
          try {
            const plan = this.jumpCutter.planJumpCuts(rawClipWords, renderStart, renderEnd);
            jumpCutPlan = {
              time_saved_sec: plan.timeSavedSec,
              total_new_duration_sec: plan.totalNewDurationSec,
              total_original_duration_sec: plan.totalOriginalDurationSec,
              edl_segments: plan.edlSegments,
              retimed_words: plan.retimedWords,
            };
            if (plan.timeSavedSec > 0) {
              console.log(`[PlanningStage]: MicroJumpCutter saved ${plan.timeSavedSec.toFixed(2)}s dead-air across ${plan.edlSegments.length} speech segments for clip ${clipIndex + 1}.`);
            }
          } catch (jcErr: any) {
            console.warn(`[PlanningStage]: MicroJumpCutter skipped for clip ${clipIndex + 1}: ${jcErr.message}`);
          }
        }
        (clip as any).jump_cut_plan = jumpCutPlan;

        const dbClip: any = {
          id: clipId,
          job_id: jobId,
          status: 'pending',
          environment: (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')),
          title: clipTitle,
          start_time: renderStart,
          end_time: renderEnd,
          storage_path: '',
          thumbnail_url: '',
          metadata: {
            title: clipTitle,
            hook: hookText,
            summary: summaryText,
            generation_key: generationKey,
            selection_reason: clip.reason,
            virality_score: clip.virality_score,
            clip_score: clipScore,
            score_breakdown: clip.score_breakdown,
            generation_mode: generationMode,
            nexus: (clip as any).nexus_metadata,
            scale_type: (clip as any).scale_type,
            recommended_platform: (clip as any).recommended_platform,
            coherence_guard: (clip as any).coherence_guard,
            scene_cut_snapped: (clip as any).scene_cut_snapped,
            jump_cut_plan: jumpCutPlan,
            words: rawClipWords,
          },
        };
        (dbClip as any).words = rawClipWords;

        // Check L5 cache
        const cachedRender = await db.getRenderCache(candidateHash);
        try {
          const { data: existingClip } = await db.getSupabase().from('clips').select('id').eq('metadata->>generation_key', candidateHash).maybeSingle();
          if (existingClip) {
            dbClip.id = existingClip.id;
          }
        } catch {}

        if (cachedRender) {
          console.log(`[PlanningStage]: ⚡ L5 Cache HIT for clip ${clipId}. Bypassing render queue.`);
          dbClip.status = 'uploaded';
          dbClip.storage_path = cachedRender.storage_path;
          dbClip.thumbnail_url = cachedRender.thumbnail_path;
          dbClips.push(dbClip);
          continue;
        }

        dbClips.push(dbClip);

        const renderJobData = {
          job_id: jobId,
          clip_id: dbClip.id,
          status: 'pending',
          environment: (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')),
          payload: {
            videoUrl: videoUrl,
            clipStart: renderStart,
            clipEnd: renderEnd,
            clipWords: rawClipWords,
            cropPlan: cropPlan,
            jumpCutPlan: jumpCutPlan,
          },
        };

        pendingRenderJobs.push(renderJobData);
      }

      if (dbClips.length === 0) {
        throw new Error('No clips were generated to enqueue.');
      }

      (dbClips as any)._pendingRenderJobs = pendingRenderJobs;

      // Persist clips to Supabase
      await Promise.race([
        db.saveClips(dbClips),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PERSISTENCE_TIMEOUT')), 30000)),
      ]);

      return {
        success: true,
        data: {
          dbClips,
          pendingRenderJobs,
          enqueuedCount: pendingRenderJobs.length,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
