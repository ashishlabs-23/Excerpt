import { DatabaseService } from '../supabaseService';
import { firebaseDb } from '../firebaseService';
import { DeliveryValidator, createRenderPlan, RenderPlan } from '@excerpt/clipping-core';
import { JobStateMachine, JobStatus } from '../../utils/JobStateMachine';

export class JobFinalizerService {
  /**
   * Finalizes a job once all render jobs reach a terminal state.
   * Atomically transitions: READY_FOR_DELIVERY_VALIDATION -> FINALIZING -> COMPLETED / FAILED.
   */
  static async finalizeJob(db: DatabaseService, jobId: string, options: { force?: boolean } = {}): Promise<void> {
    console.log(`[JobFinalizer]: 🏁 Initiating fan-in delivery validation & finalization for job ${jobId}...`);

    // 1. Claim finalizing state
    const job = await db.getJob(jobId);
    if (!job) {
      console.warn(`[JobFinalizer]: Job ${jobId} not found.`);
      return;
    }

    if (!options.force && (job.status === 'completed' || job.status === 'failed')) {
      console.log(`[JobFinalizer]: Job ${jobId} already reached terminal state ${job.status}. Skipping.`);
      return;
    }

    await JobStateMachine.transition(db, jobId, JobStatus.FINALIZING, {
      progress: 95,
      stage_label: 'Validating delivery and finalizing clips',
    });

    // 2. Fetch clips for the job
    let finalClips: any[] = [];
    try {
      const fbClips = await firebaseDb.getClipsForJob(jobId);
      if (fbClips && fbClips.length > 0) finalClips = fbClips;
    } catch {}

    if (finalClips.length === 0) {
      try {
        const { data: dbClips } = await db.getSupabase()
          .from('clips')
          .select('*')
          .eq('job_id', jobId);
        if (dbClips) finalClips = dbClips;
      } catch {}
    }

    // 3. Reconstruct render plan from job payload or create standard plan
    const payload = job.payload || {};
    const renderPlan = payload.renderPlan || createRenderPlan({
      jobId,
      requestedClips: finalClips.length,
      acceptedClips: finalClips.map((c: any) => ({ id: c.id })),
    });

    // 4. Delivery Validation Stage
    const artifactChecks = (finalClips || []).map((c: any) => ({
      clipId: c.id,
      videoUrl: c.storage_path || c.video_url || '',
      isPlayable: c.status === 'uploaded' || Boolean(c.storage_path),
      storageVerified: Boolean(c.storage_path && c.status === 'uploaded'),
    }));

    const deliveryReport = DeliveryValidator.validate(renderPlan as any, artifactChecks);
    console.log(`[JobFinalizer]: Delivery Validation Report for ${jobId} -> Pass: ${deliveryReport.pass} (${deliveryReport.playable}/${deliveryReport.scheduled} playable)`);

    // 5. Final State Transition
    if (!deliveryReport.pass) {
      const failureReason = deliveryReport.reason || 'Delivery validation failed.';
      await db.updateJob(jobId, {
        status: 'failed',
        progress: 100,
        result: finalClips,
        error: failureReason,
        failed_reason: failureReason,
      });
      console.error(`[JobFinalizer]: ❌ Job ${jobId} failed delivery validation: ${failureReason}`);
    } else {
      const isPartial = deliveryReport.playable < deliveryReport.scheduled;
      const finalStatus = isPartial ? 'completed:partial' : 'completed';

      await db.updateJob(jobId, {
        status: finalStatus,
        progress: 100,
        result: finalClips,
        delivery_report: deliveryReport,
      });
      console.log(`[JobFinalizer]: ✅ Job ${jobId} successfully finalized as ${finalStatus}!`);
    }

    // Clean up temporary job folder once delivery validation and finalization is finished
    const tempDir = require('path').join(process.cwd(), 'temp', jobId);
    try {
      const fs = require('fs');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
