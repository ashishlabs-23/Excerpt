import crypto from 'crypto';
import { firebaseDb } from './firebaseService';
import { DatabaseService } from './supabaseService';
import { hydrateJobStatusFromDb } from './jobResultMapper';

const supabaseDb = new DatabaseService();

/**
 * Hybrid Queue Service
 * Primary: Firestore (Firebase) — always available with our credentials
 * Fallback: Supabase (when available) then local JSON
 */
export class QueueService {
  constructor() {
    console.log('[QueueService]: Hybrid Firestore+Supabase Queue initialized');
  }

  async addJob(data: { videoUrl: string; numClips?: number; intent?: string; avoidSimilarClips?: string; userId: string; generationMode?: 'draft' | 'quality' }) {
    if (!data.userId) {
      throw new Error('user_id is required to create a job.');
    }

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const workerEnv = process.env.WORKER_ENV || 'development';

    const jobRecord = {
      id: jobId,
      userId: data.userId,
      user_id: data.userId,
      videoUrl: data.videoUrl,
      video_url: data.videoUrl,
      youtube_url: data.videoUrl,
      numClips: data.numClips || 3,
      num_clips: data.numClips || 3,
      status: 'queued' as const,
      environment: workerEnv,
      progress: 0,
      payload: {
        intent: data.intent || 'viral',
        avoidSimilarClips: data.avoidSimilarClips || 'balanced',
        generation_mode: data.generationMode || 'draft',
      },
      createdAt: now,
      updatedAt: now,
      created_at: now,
      updated_at: now,
    };

    // 1. Write to Firestore (primary — always available)
    try {
      await firebaseDb.createJob(jobRecord);
      console.log(`[QueueService]: Job ${jobId} written to Firestore`);
    } catch (fbErr: any) {
      console.warn(`[QueueService]: Firestore write failed: ${fbErr.message}`);
    }

    // 2. Mirror to Supabase (secondary — may be unreachable)
    try {
      await supabaseDb.createJob({
        id: jobId,
        video_url: data.videoUrl,
        youtube_url: data.videoUrl,
        num_clips: data.numClips || 3,
        status: 'queued',
        environment: workerEnv,
        progress: 0,
        user_id: data.userId,
        payload: {
          intent: data.intent || 'viral',
          avoidSimilarClips: data.avoidSimilarClips || 'balanced',
          generation_mode: data.generationMode || 'draft',
        },
        created_at: now,
        updated_at: now,
      });
      console.log(`[QueueService]: Job ${jobId} mirrored to Supabase`);
    } catch (sbErr: any) {
      // Supabase unavailable — Firestore is source of truth
      console.warn(`[QueueService]: Supabase mirror failed (non-fatal): ${sbErr.message}`);
    }

    return jobId;
  }

  async updateJobStatus(jobId: string, statusUpdate: any) {
    // Update Firestore first
    try {
      await firebaseDb.updateJob(jobId, {
        ...statusUpdate,
        status: statusUpdate.status,
        progress: statusUpdate.progress,
        stage: statusUpdate.stage,
        updatedAt: new Date().toISOString(),
      });
    } catch (fbErr: any) {
      console.warn(`[QueueService]: Firestore update failed: ${fbErr.message}`);
    }

    // Mirror to Supabase
    try {
      await supabaseDb.updateJob(jobId, statusUpdate);
    } catch {
      // Non-fatal
    }
  }

  async getJobStatus(jobId: string) {
    // Try Firestore first
    try {
      const firestoreJob = await firebaseDb.getJob(jobId);
      if (firestoreJob) {
        return hydrateJobStatusFromDb(firestoreJob as any);
      }
    } catch (fbErr: any) {
      console.warn(`[QueueService]: Firestore getJob failed: ${fbErr.message}`);
    }

    // Fall back to Supabase
    try {
      const dbJob = await supabaseDb.getJobWithClips(jobId);
      if (dbJob) return hydrateJobStatusFromDb(dbJob);
    } catch {
      // Ignore
    }

    return null;
  }
}

export const queueService = new QueueService();
