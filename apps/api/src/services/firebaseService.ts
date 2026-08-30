import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let isInitialized = false;

export function initFirebaseAdmin(): typeof admin {
  if (isInitialized || admin.apps.length > 0) {
    return admin;
  }

  // 1. Check for service account JSON file
  const serviceAccountPaths = [
    path.join(__dirname, '..', '..', 'firebase-service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
    path.join(process.cwd(), 'apps', 'api', 'firebase-service-account.json'),
  ];

  const serviceAccountPath = serviceAccountPaths.find(p => fs.existsSync(p));
  if (serviceAccountPath) {
    try {
      const saContent = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(saContent),
        projectId: saContent.project_id || 'excerpt-d0ab8',
      });
      isInitialized = true;
      console.log(`[Firebase Admin]: Initialized with service account from ${serviceAccountPath}`);
      return admin;
    } catch (err: any) {
      console.warn(`[Firebase Admin]: Failed to parse service account JSON from ${serviceAccountPath}:`, err.message);
    }
  }

  // 2. Check for environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'excerpt-d0ab8';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Graceful fallback for local development & mock environments
    admin.initializeApp({
      projectId,
    });
  }

  isInitialized = true;
  return admin;
}

export function getFirestoreDb(): admin.firestore.Firestore {
  initFirebaseAdmin();
  return admin.firestore();
}

export function getFirebaseAuthAdmin(): admin.auth.Auth {
  initFirebaseAdmin();
  return admin.auth();
}

export interface FirestoreJobRecord {
  id: string;
  userId: string;
  videoUrl?: string;
  status: string;
  progress?: number;
  stage?: string;
  error?: string | null;
  requestedClips?: number;
  acceptedCandidates?: number;
  finalVideoUrl?: string;
  renderJobs?: any[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface FirestoreClipRecord {
  id: string;
  jobId: string;
  userId: string;
  rank: number;
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  score: number;
  title?: string;
  summary?: string;
  aspectRatio?: string;
  createdAt: string;
}

export class FirebaseDatabaseService {
  private inMemoryJobs = new Map<string, any>();
  private inMemoryClips = new Map<string, any>();

  private get db(): admin.firestore.Firestore {
    return getFirestoreDb();
  }

  private getQueueFilePath(): string {
    const dir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'active_queue.json');
  }

  readQueue(): { jobs: Record<string, any>; clips: Record<string, any>; render_jobs: Record<string, any> } {
    try {
      const p = this.getQueueFilePath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
    return { jobs: {}, clips: {}, render_jobs: {} };
  }

  writeQueue(data: { jobs: Record<string, any>; clips: Record<string, any>; render_jobs: Record<string, any> }): void {
    try {
      const p = this.getQueueFilePath();
      const tmp = `${p}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, p);
      } catch {
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
        try { fs.unlinkSync(tmp); } catch {}
      }
    } catch {}
  }

  async createJob(job: Partial<FirestoreJobRecord> & { id: string; userId: string }): Promise<FirestoreJobRecord> {
    const now = new Date().toISOString();
    const fullJob: Record<string, any> = {
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      ...job,
    };

    const cleanJob: Record<string, any> = {};
    for (const [k, v] of Object.entries(fullJob)) {
      if (v !== undefined) cleanJob[k] = v;
    }

    this.inMemoryJobs.set(job.id, cleanJob);
    const queue = this.readQueue();
    queue.jobs[job.id] = cleanJob;
    this.writeQueue(queue);

    try {
      await this.db.collection('jobs').doc(job.id).set(cleanJob, { merge: true });
    } catch {}

    return cleanJob as FirestoreJobRecord;
  }

  async updateJob(jobId: string, updates: Partial<FirestoreJobRecord>): Promise<void> {
    const now = new Date().toISOString();
    const cleanUpdates: Record<string, any> = { updatedAt: now };
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) cleanUpdates[k] = v;
    }

    const current = this.inMemoryJobs.get(jobId) || {};
    const updated = { ...current, ...cleanUpdates };
    this.inMemoryJobs.set(jobId, updated);

    const queue = this.readQueue();
    if (queue.jobs[jobId]) {
      queue.jobs[jobId] = { ...queue.jobs[jobId], ...cleanUpdates };
      this.writeQueue(queue);
    }

    try {
      await this.db.collection('jobs').doc(jobId).set(cleanUpdates, { merge: true });
    } catch {}
  }

  async getJob(jobId: string): Promise<FirestoreJobRecord | null> {
    try {
      const doc = await this.db.collection('jobs').doc(jobId).get();
      if (doc.exists) return doc.data() as FirestoreJobRecord;
    } catch {}

    const queue = this.readQueue();
    if (queue.jobs[jobId]) return queue.jobs[jobId] as FirestoreJobRecord;

    return (this.inMemoryJobs.get(jobId) as FirestoreJobRecord) || null;
  }

  async listJobsForUser(userId: string, limitCount = 50): Promise<FirestoreJobRecord[]> {
    try {
      const snapshot = await this.db.collection('jobs')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();

      if (snapshot && !snapshot.empty) {
        return snapshot.docs.map(d => d.data() as FirestoreJobRecord);
      }
    } catch {}

    const queue = this.readQueue();
    const allJobs = { ...Object.fromEntries(this.inMemoryJobs), ...queue.jobs };

    const jobs = Object.values(allJobs)
      .filter((j: any) => j.userId === userId || j.user_id === userId)
      .sort((a: any, b: any) => new Date(b.createdAt || b.created_at).getTime() - new Date(a.createdAt || a.created_at).getTime())
      .slice(0, limitCount);

    return jobs as FirestoreJobRecord[];
  }

  async saveClips(clips: FirestoreClipRecord[]): Promise<void> {
    const queue = this.readQueue();
    for (const clip of clips) {
      this.inMemoryClips.set(clip.id, clip);
      queue.clips[clip.id] = clip;
    }
    this.writeQueue(queue);

    try {
      const batch = this.db.batch();
      for (const clip of clips) {
        const ref = this.db.collection('clips').doc(clip.id);
        batch.set(ref, clip, { merge: true });
      }
      await batch.commit();
    } catch {}
  }

  async getClipsForJob(jobId: string): Promise<FirestoreClipRecord[]> {
    try {
      const snapshot = await this.db.collection('clips')
        .where('jobId', '==', jobId)
        .orderBy('rank', 'asc')
        .get();

      if (snapshot && !snapshot.empty) {
        return snapshot.docs.map(d => d.data() as FirestoreClipRecord);
      }
    } catch {}

    const queue = this.readQueue();
    const allClips = { ...Object.fromEntries(this.inMemoryClips), ...queue.clips };

    const clips = Object.values(allClips)
      .filter((c: any) => c.jobId === jobId || c.job_id === jobId)
      .sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0));

    return clips as FirestoreClipRecord[];
  }

  async getClip(clipId: string): Promise<FirestoreClipRecord | null> {
    try {
      const doc = await this.db.collection('clips').doc(clipId).get();
      if (doc.exists) return doc.data() as FirestoreClipRecord;
    } catch {}

    const queue = this.readQueue();
    if (queue.clips[clipId]) return queue.clips[clipId] as FirestoreClipRecord;

    return (this.inMemoryClips.get(clipId) as FirestoreClipRecord) || null;
  }

  async getNextQueuedJob(): Promise<FirestoreJobRecord | null> {
    try {
      const snapshot = await this.db.collection('jobs')
        .where('status', '==', 'queued')
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get();

      if (snapshot && !snapshot.empty) {
        const doc = snapshot.docs[0];
        const job = doc.data() as FirestoreJobRecord;
        await this.updateJob(doc.id, { status: 'processing' });
        return { ...job, id: doc.id, status: 'processing' };
      }
    } catch {}

    const queue = this.readQueue();
    for (const [id, job] of Object.entries(queue.jobs)) {
      if (job.status === 'queued') {
        const updated = { ...job, id, status: 'processing', updatedAt: new Date().toISOString() };
        queue.jobs[id] = updated;
        this.writeQueue(queue);
        this.inMemoryJobs.set(id, updated);
        return updated as FirestoreJobRecord;
      }
    }

    return null;
  }

  async registerUserDevice(userId: string, fcmToken: string, platform = 'web'): Promise<void> {
    await this.db.collection('users').doc(userId).set({
      fcmToken,
      platform,
      lastActiveAt: new Date().toISOString(),
    }, { merge: true });
  }

  async sendJobCompletionNotification(userId: string, jobTitle: string, clipCount: number, jobId: string): Promise<void> {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (!fcmToken) return;

      const admin = initFirebaseAdmin();
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '🎬 Excerpt: Clips Ready!',
          body: `Generated ${clipCount} viral clips for "${jobTitle || 'Your Video'}".`,
        },
        data: {
          jobId,
          url: `/dashboard?jobId=${jobId}`,
        },
        webpush: {
          fcmOptions: {
            link: `/dashboard?jobId=${jobId}`,
          },
        },
      });
      console.log(`[FCM]: Push notification sent to user ${userId} for job ${jobId}`);
    } catch (err: any) {
      console.warn(`[FCM]: Failed to send notification to user ${userId}:`, err.message);
    }
  }

  async recordCost(userId: string, costData: { jobId: string; stage: string; estimatedCostUsd: number; provider: string }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.collection('cost_ledgers').add({
      userId,
      ...costData,
      createdAt: now,
    });
  }
}

export const firebaseDb = new FirebaseDatabaseService();
