import { DatabaseService } from '../services/supabaseService';

export enum JobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  TRANSCRIBING = 'transcribing',
  RECOVERING = 'recovering',
  DETECTING_CLIPS = 'detecting_clips',
  RENDERING = 'rendering',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
  CANCELLED = 'cancelled'
}

export class JobStateMachine {
  /**
   * Centralized method to transition a parent job's state.
   */
  static async transition(db: DatabaseService, jobId: string, status: JobStatus, additionalUpdates: any = {}) {
    const updates = {
      status,
      ...additionalUpdates,
      updated_at: new Date().toISOString()
    };
    
    console.log(`[JobStateMachine] Job ${jobId} transitioning to ${status}...`);
    try {
      const result = await db.updateJob(jobId, updates);
      return result;
    } catch (err: any) {
      console.warn(`[JobStateMachine] Transition fallback for job ${jobId} to ${status}:`, err.message);
      return updates;
    }
  }
}
