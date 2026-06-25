import { supabase } from '../supabaseService';
import { boundaryFailureAnalyzer } from './BoundaryFailureAnalyzer';

export interface BoundaryAdjustment {
  jobId: string;
  clipId: string;
  narrativeType: string;
  predictedStart: number;
  predictedEnd: number;
  editorAdjustedStart: number;
  editorAdjustedEnd: number;
  editorFeedbackType?: string;
  publishabilityBefore?: number;
  publishabilityAfter?: number;
  editorId?: string;
}

export class BoundaryFailureEngine {
  /**
   * Logs a boundary adjustment to Supabase asynchronously.
   * Logs raw corrections to `editorial_corrections`, analyzes them, and updates datasets.
   */
  public async logAdjustment(data: BoundaryAdjustment): Promise<void> {
    const db = supabase();
    
    try {
      // 1. Log Raw Correction
      const { error: correctionError } = await db.from('editorial_corrections').insert({
        clip_id: data.clipId,
        video_id: data.jobId,
        story_type: data.narrativeType,
        old_start: data.predictedStart,
        old_end: data.predictedEnd,
        new_start: data.editorAdjustedStart,
        new_end: data.editorAdjustedEnd,
        editor_id: data.editorId || 'anonymous'
      });

      if (correctionError) {
        console.error('[BoundaryFailureEngine]: Failed to log editorial_correction:', correctionError);
        return;
      }

      // 2. Analyze the failure
      const analysis = boundaryFailureAnalyzer.analyze(
        data.predictedStart,
        data.predictedEnd,
        data.editorAdjustedStart,
        data.editorAdjustedEnd,
        data.narrativeType,
        data.editorFeedbackType
      );

      // 3. Log to Boundary Failure Dataset
      const { error: datasetError } = await db.from('boundary_failure_dataset').insert({
        video_id: data.jobId,
        story_type: data.narrativeType,
        excerpt_start: data.predictedStart,
        excerpt_end: data.predictedEnd,
        editor_start: data.editorAdjustedStart,
        editor_end: data.editorAdjustedEnd,
        start_delta: analysis.start_delta,
        end_delta: analysis.end_delta,
        failure_type: analysis.failure_type,
        severity: analysis.severity,
        publishability_before: data.publishabilityBefore || null,
        publishability_after: data.publishabilityAfter || null
      });

      if (datasetError) {
        console.error('[BoundaryFailureEngine]: Failed to log boundary_failure_dataset:', datasetError);
        return;
      }

      // 4. Update the policy cache aggregate (Triggered automatically via DB trigger or upserted here)
      // Since calculating aggregates on every insert might be slow, we'll do an upsert or let a cron handle it.
      // For now, let's just trigger a recompute for that narrative type:
      await this.recomputePolicy(data.narrativeType, db);

    } catch (e) {
      console.error('[BoundaryFailureEngine]: Unexpected error logging adjustment:', e);
    }
  }

  /**
   * Recomputes the avg_pre_context and avg_post_context for a narrative type
   */
  private async recomputePolicy(narrativeType: string, db: any): Promise<void> {
    try {
      const { data, error } = await db.from('boundary_failure_dataset')
        .select('start_delta, end_delta')
        .eq('story_type', narrativeType);

      if (error || !data || data.length === 0) return;

      const sampleCount = data.length;
      const sumStartDelta = data.reduce((acc: number, row: any) => acc + row.start_delta, 0);
      const sumEndDelta = data.reduce((acc: number, row: any) => acc + row.end_delta, 0);

      const avgStartDelta = sumStartDelta / sampleCount;
      const avgEndDelta = sumEndDelta / sampleCount;

      // Base heuristic paddings to add to
      let basePre = 5;
      let basePost = 5;

      switch (narrativeType) {
        case 'LateWinner':
        case 'Comeback':
           basePre = 15; basePost = 12; break;
        case 'GoalkeeperMasterclass':
           basePre = 8; basePost = 5; break;
        case 'CrowdEruption':
           basePre = 6; basePost = 18; break;
        case 'TacticalMasterclass':
           basePre = 20; basePost = 8; break;
        case 'LastMinuteHeartbreak':
           basePre = 12; basePost = 15; break;
      }

      const avgPreContext = basePre + avgStartDelta;
      const avgPostContext = basePost + avgEndDelta;
      
      const confidence = Math.min(1.0, sampleCount / 100);

      await db.from('boundary_policy_cache').upsert({
        narrative_type: narrativeType,
        sample_count: sampleCount,
        avg_pre_context: avgPreContext,
        avg_post_context: avgPostContext,
        avg_start_delta: avgStartDelta,
        avg_end_delta: avgEndDelta,
        confidence,
        updated_at: new Date().toISOString()
      }, { onConflict: 'narrative_type' });

    } catch (e) {
      console.error('[BoundaryFailureEngine]: Failed to recompute policy:', e);
    }
  }

  public async logEditorFeedback(jobId: string, clipId: string, feedbackType: string, comment: string): Promise<void> {
    const db = supabase();
    try {
      await db.from('editor_feedback').insert({
        job_id: jobId,
        clip_id: clipId,
        feedback_type: feedbackType,
        comment
      });
    } catch (e) {
      console.error('[BoundaryFailureEngine]: Error logging editor feedback', e);
    }
  }
}

export const boundaryFailureEngine = new BoundaryFailureEngine();
