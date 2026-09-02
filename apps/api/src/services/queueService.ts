import crypto from 'crypto';
import { firebaseDb } from './firebaseService';
import { DatabaseService } from './supabaseService';
import { hydrateJobStatusFromDb } from './jobResultMapper';

const supabaseDb = new DatabaseService();

/**
 * Hybrid Queue Service
 * Primary Queue Engine: Supabase PostgreSQL (polled directly by videoWorker/renderWorker)
 * Primary UI/Realtime: Firestore / Firebase (for instant real-time client subscriptions)
 */
export class QueueService {
  constructor() {
    console.log('[QueueService]: Resilient Firestore+Supabase Queue initialized');
  }

  async addJob(data: { 
    videoUrl: string; 
    numClips?: number; 
    intent?: string; 
    avoidSimilarClips?: string; 
    userId: string; 
    generationMode?: 'draft' | 'quality' 
  }) {
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

    let firestoreCreated = false;

    // 1. Write to Firestore (UI subscription & client document state)
    try {
      await firebaseDb.createJob(jobRecord);
      firestoreCreated = true;
      console.log(`[QueueService]: Job ${jobId} written to Firestore`);
    } catch (fbErr: any) {
      console.warn(`[QueueService]: Firestore write non-fatal warning: ${fbErr.message}`);
    }

    // 2. Queue in Supabase (worker execution queue polled by videoWorker, with graceful local fallback)
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
      console.log(`[QueueService]: Job ${jobId} queued in Supabase worker queue`);
    } catch (sbErr: any) {
      console.warn(`[QueueService]: Supabase queue insertion failed (non-fatal, local/Firestore queue active): ${sbErr.message}`);
      
      // If neither Firestore nor Supabase succeeded, then fail
      if (!firestoreCreated) {
        throw new Error(`Failed to queue job in processing engine: ${sbErr.message}`);
      }
    }

    return jobId;
  }

  async updateJobStatus(jobId: string, statusUpdate: any) {
    const errors: string[] = [];

    // Update Firestore
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
      errors.push(`Firestore: ${fbErr.message}`);
    }

    // Mirror to Supabase
    try {
      await supabaseDb.updateJob(jobId, statusUpdate);
    } catch (sbErr: any) {
      console.warn(`[QueueService]: Supabase update failed: ${sbErr.message}`);
      errors.push(`Supabase: ${sbErr.message}`);
    }

    if (errors.length === 2) {
      console.error(`[QueueService]: Critical: both Firestore and Supabase failed to update job ${jobId}`);
    }
  }

  async getJobStatus(jobId: string) {
    // 1. Try Supabase first (source of truth for active worker progress & clip records)
    try {
      const dbJob = await supabaseDb.getJobWithClips(jobId);
      if (dbJob) return hydrateJobStatusFromDb(dbJob);
    } catch (sbErr: any) {
      console.warn(`[QueueService]: Supabase getJobWithClips failed: ${sbErr.message}`);
    }

    // 2. Fall back to Firestore
    try {
      const firestoreJob = await firebaseDb.getJob(jobId);
      if (firestoreJob) {
        return hydrateJobStatusFromDb(firestoreJob as any);
      }
    } catch (fbErr: any) {
      console.warn(`[QueueService]: Firestore getJob failed: ${fbErr.message}`);
    }

    return null;
  }
}

export const queueService = new QueueService();
