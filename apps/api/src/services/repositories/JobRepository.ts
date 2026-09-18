import { DatabaseService } from '../supabaseService';
import { firebaseDb, FirestoreJobRecord } from '../firebaseService';

/**
 * JobRepository
 * Canonical authority: PostgreSQL / Supabase
 * Operational fallback: Firestore / Local Active Queue (for offline & disaster recovery)
 */
export class JobRepository {
  private static instance: JobRepository;
  private db: DatabaseService;

  private constructor() {
    this.db = new DatabaseService();
  }

  public static getInstance(): JobRepository {
    if (!JobRepository.instance) {
      JobRepository.instance = new JobRepository();
    }
    return JobRepository.instance;
  }

  /**
   * Fetches a job by ID from the canonical database, with operational fallback.
   */
  public async getJob(jobId: string): Promise<any | null> {
    if (!jobId) return null;

    // 1. Canonical DB
    try {
      const sbJob = await this.db.getJob(jobId);
      if (sbJob) return sbJob;
    } catch {}

    // 2. Operational local/Firestore fallback
    try {
      const fbJob = await firebaseDb.getJob(jobId);
      if (fbJob) return fbJob;
    } catch {}

    return null;
  }

  /**
   * Lists jobs for a user with fallback support.
   */
  public async listJobsForUser(userId: string, limit = 50): Promise<any[]> {
    if (!userId) return [];

    // 1. Try canonical DB
    try {
      const sbJobs = await this.db.getRecentJobs(userId, limit);
      if (sbJobs && sbJobs.length > 0) return sbJobs;
    } catch {}

    // 2. Try operational store
    try {
      const fbJobs = await firebaseDb.listJobsForUser(userId, limit);
      if (fbJobs && fbJobs.length > 0) return fbJobs;
    } catch {}

    return [];
  }

  /**
   * Updates job lifecycle and progress across canonical and operational stores.
   */
  public async updateJob(jobId: string, updates: Record<string, any>): Promise<void> {
    const promises: Promise<any>[] = [];

    // 1. Canonical Store
    promises.push(
      this.db.updateJob(jobId, updates).catch((e) => {
        console.warn(`[JobRepository]: Supabase updateJob warning for ${jobId}:`, e.message);
      })
    );

    // 2. Operational Store
    promises.push(
      firebaseDb.updateJob(jobId, updates as any).catch((e) => {
        console.warn(`[JobRepository]: Firebase updateJob warning for ${jobId}:`, e.message);
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Creates a new job record.
   */
  public async createJob(jobData: { id: string; userId: string; [key: string]: any }): Promise<any> {
    try {
      await firebaseDb.createJob(jobData as any);
    } catch {}

    try {
      await this.db.createJob(jobData.userId, jobData);
    } catch {}

    return jobData;
  }
}

export const jobRepository = JobRepository.getInstance();
