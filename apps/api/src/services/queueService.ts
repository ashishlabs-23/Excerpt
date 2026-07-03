import crypto from 'crypto';
import { DatabaseService } from './supabaseService';
import { hydrateJobStatusFromDb } from './jobResultMapper';

const db = new DatabaseService();

/**
 * Cloud-First Queue Service
 * Supabase is the SOLE source of truth for all job state.
 * No in-memory caching of job status. If the process crashes,
 * the database contains complete recoverable state.
 */
export class QueueService {
  constructor() {
    console.log('[QueueService]: Cloud-First Supabase Queue initialized');
  }

  async addJob(data: { videoUrl: string; numClips?: number; intent?: string; avoidSimilarClips?: string; userId: string; generationMode?: 'draft' | 'quality' }) {
    if (!data.userId) {
      throw new Error('user_id is required to create a job.');
    }

    const jobId = crypto.randomUUID();
    console.log(`[QueueService]: Adding job ${jobId} to Supabase Cloud Queue for user ${data.userId}`);

    await db.createJob({
      id: jobId,
      video_url: data.videoUrl,
      youtube_url: data.videoUrl,
      num_clips: data.numClips || 3,
      status: 'queued',
      progress: 0,
      user_id: data.userId,
      payload: { 
        intent: data.intent || 'viral',
        avoidSimilarClips: data.avoidSimilarClips || 'balanced',
        generation_mode: data.generationMode || 'draft'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    console.log(`[QueueService]: Job ${jobId} registered in Supabase`);
    return jobId;
  }

  async updateJobStatus(jobId: string, statusUpdate: any) {
    await db.updateJob(jobId, statusUpdate);
  }

  async getJobStatus(jobId: string) {
    const dbJob = await db.getJobWithClips(jobId);
    if (!dbJob) return null;
    return hydrateJobStatusFromDb(dbJob);
  }
}

export const queueService = new QueueService();
