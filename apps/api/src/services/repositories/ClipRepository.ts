import { DatabaseService } from '../supabaseService';
import { firebaseDb, FirestoreClipRecord } from '../firebaseService';

/**
 * Helper to determine if a clip has expired under the 24-hour retention window.
 */
function isClipExpired(c: any): boolean {
  if (!c) return false;
  const now = Date.now();
  const exp = c.expires_at || c.expiresAt;
  if (exp) {
    return new Date(exp).getTime() <= now;
  }
  const created = c.created_at || c.createdAt;
  if (created) {
    return (now - new Date(created).getTime()) >= 24 * 60 * 60 * 1000;
  }
  return false;
}

/**
 * ClipRepository
 * Canonical authority: PostgreSQL / Supabase
 * Operational fallback: Firestore / Local Active Queue (for offline & disaster recovery)
 */
export class ClipRepository {
  private static instance: ClipRepository;
  private db: DatabaseService;

  private constructor() {
    this.db = new DatabaseService();
  }

  public static getInstance(): ClipRepository {
    if (!ClipRepository.instance) {
      ClipRepository.instance = new ClipRepository();
    }
    return ClipRepository.instance;
  }

  /**
   * Fetches a clip by ID, filtering out expired clips under the 24h retention policy.
   */
  public async getClip(clipId: string): Promise<any | null> {
    if (!clipId) return null;

    let clip: any = null;

    // 1. Check Canonical Supabase
    try {
      const sbClip = await this.db.getClip(clipId);
      if (sbClip) clip = sbClip;
    } catch {}

    // 2. Fallback to Operational Queue
    if (!clip) {
      try {
        const fbClip = await firebaseDb.getClip(clipId);
        if (fbClip) {
          clip = {
            ...fbClip,
            id: fbClip.id || clipId,
            job_id: fbClip.jobId || fbClip.job_id,
            user_id: fbClip.userId || fbClip.user_id,
            video_url: fbClip.videoUrl || fbClip.video_url,
          };
        }
      } catch {}
    }

    if (clip && isClipExpired(clip)) {
      console.log(`[ClipRepository]: Clip ${clipId} is expired under 24h retention policy.`);
      return null;
    }

    return clip;
  }

  /**
   * Lists unexpired clips for a user with fallback.
   */
  public async listClipsForUser(userId: string, limit = 50): Promise<any[]> {
    let clips: any[] = [];

    try {
      clips = (await this.db.getRecentClips(userId)) || [];
    } catch {}

    if (!clips || clips.length === 0) {
      try {
        clips = await firebaseDb.listAllClips(limit);
      } catch {}
    }

    return (clips || []).filter((c) => !isClipExpired(c));
  }

  /**
   * Saves clips across canonical and operational stores.
   */
  public async saveClips(clips: any[]): Promise<void> {
    if (!clips || clips.length === 0) return;

    const promises: Promise<any>[] = [];

    // 1. Canonical Store
    promises.push(
      this.db.saveClips(clips).catch((e) => {
        console.warn('[ClipRepository]: Supabase saveClips warning:', e.message);
      })
    );

    // 2. Operational Store
    promises.push(
      firebaseDb.saveClips(clips as FirestoreClipRecord[]).catch((e) => {
        console.warn('[ClipRepository]: Firebase saveClips warning:', e.message);
      })
    );

    await Promise.allSettled(promises);
  }
}

export const clipRepository = ClipRepository.getInstance();
