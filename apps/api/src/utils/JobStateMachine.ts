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
      const result = await db.getSupabase()
        .from('jobs')
        .update(updates)
        .eq('id', jobId)
        .select()
        .single();
        
      if (result.error) {
         console.error(`[JobStateMachine] DB transition error for job ${jobId} to ${status}:`, result.error.message);
         if (result.error.message.includes('schema cache') || result.error.message.includes('column')) {
            console.warn(`[JobStateMachine] Retrying transition to ${status} with sanitized base fields...`);
            const baseUpdates = { status, progress: updates.progress, updated_at: updates.updated_at };
            await db.getSupabase().from('jobs').update(baseUpdates).eq('id', jobId);
            return;
         }
         throw result.error;
      }
      return result.data;
    } catch (err: any) {
      if (err.message?.includes('schema cache') || err.message?.includes('column')) {
         console.warn(`[JobStateMachine] Transition fallback executed for ${status}`);
         const baseUpdates = { status, updated_at: new Date().toISOString() };
         await db.getSupabase().from('jobs').update(baseUpdates).eq('id', jobId);
         return;
      }
      console.error(`[JobStateMachine] Failed to transition job ${jobId} to ${status}:`, err.message);
      throw err;
    }
  }
}
