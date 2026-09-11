import fs from 'fs';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService } from './storageService';
import { firebaseDb } from './firebaseService';

// ─────────────────────────────────────────────────────────────────────────────
// RetentionService
//
// Enforces 24-Hour Ephemeral Storage policy across:
// 1. Cloud Storage (Backblaze B2, S3, Supabase Storage, Firebase)
// 2. Database Records (Supabase clips & voiceovers)
// 3. Local Active Queue (temp/active_queue.json)
//
// Invariants:
// - Expiration source of truth: expires_at = created_at + 24 hours
// - Fallback predicate: created_at <= NOW() - 24 hours
// - Storage deleted first, DB/queue records finalized second
// - Safe with multiple workers via advisory file locking & status transitions
// - Idempotent against already-deleted objects
// ─────────────────────────────────────────────────────────────────────────────

export const RETENTION_HOURS = parseInt(process.env.RETENTION_HOURS ?? '24', 10);
const BATCH_SIZE = 50; // max rows processed per sweep cycle
const LOCK_LEASE_MS = 5 * 60 * 1000; // 5-minute maximum lock hold

export interface RetentionTelemetry {
  startedAt: string;
  completedAt: string | null;
  scanned: number;
  expired: number;
  deleted: number;
  alreadyMissing: number;
  failed: number;
  keysRemoved: string[];
  durationMs: number;
  lastError: string | null;
}

export class RetentionService {
  private static instance: RetentionService | null = null;
  private db: DatabaseService;
  private storage: StorageService;
  private isSweepingLocally: boolean = false;
  private static latestTelemetry: RetentionTelemetry | null = null;

  static getInstance(): RetentionService {
    if (!RetentionService.instance) {
      RetentionService.instance = new RetentionService();
    }
    return RetentionService.instance;
  }

  constructor() {
    this.db = new DatabaseService();
    this.storage = StorageService.getInstance();
  }

  public static getLatestTelemetry(): RetentionTelemetry | null {
    return RetentionService.latestTelemetry;
  }

  /**
   * Advisory lock to prevent multiple workers or concurrent sweeps
   * from corrupting retention states or hammering storage APIs.
   */
  private acquireLock(): boolean {
    if (this.isSweepingLocally) return false;

    const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
    try {
      if (!fs.existsSync(path.dirname(lockPath))) {
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      }

      if (fs.existsSync(lockPath)) {
        const stats = fs.statSync(lockPath);
        const lockAge = Date.now() - stats.mtimeMs;
        if (lockAge < LOCK_LEASE_MS) {
          // Lock still actively held
          return false;
        }
        // Stale lock — overwrite
      }

      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }));
      this.isSweepingLocally = true;
      return true;
    } catch {
      return false;
    }
  }

  private releaseLock(): void {
    this.isSweepingLocally = false;
    const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {}
  }

  /**
   * Main entry point — called by ZombieSweeperService on startup and periodically.
   */
  async run(): Promise<RetentionTelemetry> {
    if (!this.acquireLock()) {
      console.log('[Retention]: Sweep skipped — another retention sweep is currently in progress.');
      return RetentionService.latestTelemetry || {
        startedAt: new Date().toISOString(),
        completedAt: null,
        scanned: 0,
        expired: 0,
        deleted: 0,
        alreadyMissing: 0,
        failed: 0,
        keysRemoved: [],
        durationMs: 0,
        lastError: 'Sweep skipped: lock acquired by concurrent worker',
      };
    }

    const startTime = Date.now();
    const now = new Date();
    const nowIso = now.toISOString();
    const cutoffDate = new Date(now.getTime() - RETENTION_HOURS * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`[Retention]: 🧹 Starting 24h retention sweep (policy: ${RETENTION_HOURS}h, cutoff: ${cutoffIso})`);

    const telemetry: RetentionTelemetry = {
      startedAt: nowIso,
      completedAt: null,
      scanned: 0,
      expired: 0,
      deleted: 0,
      alreadyMissing: 0,
      failed: 0,
      keysRemoved: [],
      durationMs: 0,
      lastError: null,
    };

    try {
      const supabase = this.db.getSupabase();

      // 1. Expire clips in Supabase
      await this.expireSupabaseClips(supabase, nowIso, cutoffIso, telemetry);

      // 2. Expire clips in Local Queue (active_queue.json)
      await this.expireQueueClips(nowIso, cutoffIso, telemetry);

      // 3. Expire Voiceovers in Supabase
      await this.expireVoiceovers(supabase, nowIso, cutoffIso, telemetry);

      telemetry.completedAt = new Date().toISOString();
      telemetry.durationMs = Date.now() - startTime;
      RetentionService.latestTelemetry = telemetry;

      console.log(
        `[Retention]: ✅ 24h retention sweep complete — ` +
        `scanned=${telemetry.scanned} expired=${telemetry.expired} ` +
        `deleted=${telemetry.deleted} missing=${telemetry.alreadyMissing} ` +
        `failed=${telemetry.failed} keysRemoved=${telemetry.keysRemoved.length} (${telemetry.durationMs}ms)`
      );
    } catch (sweepErr: any) {
      telemetry.lastError = sweepErr.message;
      telemetry.completedAt = new Date().toISOString();
      telemetry.durationMs = Date.now() - startTime;
      RetentionService.latestTelemetry = telemetry;
      console.error(`[Retention]: Error during retention sweep:`, sweepErr.message);
    } finally {
      this.releaseLock();
    }

    return telemetry;
  }

  // ─── 1. Supabase Clips ──────────────────────────────────────────────────────

  private async expireSupabaseClips(
    supabase: SupabaseClient,
    nowIso: string,
    cutoffIso: string,
    telemetry: RetentionTelemetry
  ): Promise<void> {
    try {
      // Find clips where expires_at < NOW() OR (expires_at IS NULL AND created_at < cutoff)
      const { data: expiredClips, error } = await supabase
        .from('clips')
        .select('id, storage_path, thumbnail_url, thumbnail_storage_path, metadata, status, created_at, expires_at')
        .or(`expires_at.lt.${nowIso},and(expires_at.is.null,created_at.lt.${cutoffIso})`)
        .limit(BATCH_SIZE);

      if (error) {
        console.warn(`[Retention]: Supabase clips query warning: ${error.message}`);
        return;
      }

      if (!expiredClips || expiredClips.length === 0) {
        return;
      }

      telemetry.scanned += expiredClips.length;
      telemetry.expired += expiredClips.length;
      console.log(`[Retention]: Discovered ${expiredClips.length} expired clip(s) in Supabase.`);

      for (const clip of expiredClips) {
        await this.deleteClip(supabase, clip, telemetry);
      }
    } catch (err: any) {
      console.warn(`[Retention]: Failed to process Supabase expired clips: ${err.message}`);
    }
  }

  private async deleteClip(
    supabase: SupabaseClient,
    clip: any,
    telemetry: RetentionTelemetry
  ): Promise<boolean> {
    const clipId = clip.id;
    const keysToDelete: string[] = [];

    if (clip.storage_path) keysToDelete.push(clip.storage_path);
    if (clip.thumbnail_storage_path) keysToDelete.push(clip.thumbnail_storage_path);
    if (clip.thumbnail_url) keysToDelete.push(clip.thumbnail_url);
    if (clip.metadata?.video_clean_storage_key) keysToDelete.push(clip.metadata.video_clean_storage_key);
    if (clip.metadata?.video_captioned_storage_key) keysToDelete.push(clip.metadata.video_captioned_storage_key);

    console.log(`[Retention]: Purging expired clip id=${clipId} keys=${keysToDelete.length}`);

    // Step 1: Mark status as 'deleting' in DB (claim ownership)
    try {
      await supabase.from('clips').update({ status: 'deleting' }).eq('id', clipId);
    } catch {}

    // Step 2: Delete all physical storage assets (Backblaze B2, Firebase, Supabase Storage, local)
    if (keysToDelete.length > 0) {
      try {
        const { deleted, errors } = await this.storage.deleteObjects(keysToDelete);
        telemetry.keysRemoved.push(...deleted);
        if (errors.length > 0) {
          telemetry.failed += errors.length;
        }
      } catch (err: any) {
        console.error(`[Retention]: Storage deletion failed for clip ${clipId}: ${err.message}`);
        telemetry.failed++;
        return false;
      }
    }

    // Step 3: Delete database record after storage deletion
    const { error: dbError } = await supabase.from('clips').delete().eq('id', clipId);
    if (dbError) {
      console.warn(`[Retention]: Database row deletion warning for ${clipId}: ${dbError.message}`);
      telemetry.failed++;
      return false;
    }

    telemetry.deleted++;
    return true;
  }

  // ─── 2. Local Queue Sweeper ─────────────────────────────────────────────────

  private async expireQueueClips(
    nowIso: string,
    cutoffIso: string,
    telemetry: RetentionTelemetry
  ): Promise<void> {
    try {
      const queue = firebaseDb.readQueue();
      if (!queue.clips || Object.keys(queue.clips).length === 0) return;

      const nowTime = new Date(nowIso).getTime();
      const cutoffTime = new Date(cutoffIso).getTime();

      const expiredClipIds: string[] = [];
      const allKeysToDelete: string[] = [];

      for (const [id, c] of Object.entries(queue.clips)) {
        telemetry.scanned++;
        const clip: any = c;
        const expiresTime = clip.expires_at || clip.expiresAt ? new Date(clip.expires_at || clip.expiresAt).getTime() : null;
        const createdTime = clip.createdAt || clip.created_at ? new Date(clip.createdAt || clip.created_at).getTime() : null;

        const isExpired = (expiresTime !== null && expiresTime <= nowTime) ||
                          (createdTime !== null && createdTime <= cutoffTime);

        if (isExpired) {
          expiredClipIds.push(id);
          telemetry.expired++;

          if (clip.storage_path) allKeysToDelete.push(clip.storage_path);
          if (clip.videoUrl) allKeysToDelete.push(clip.videoUrl);
          if (clip.video_url) allKeysToDelete.push(clip.video_url);
          if (clip.thumbnail_url) allKeysToDelete.push(clip.thumbnail_url);
          if (clip.thumbnailUrl) allKeysToDelete.push(clip.thumbnailUrl);
          if (clip.metadata?.video_clean_storage_key) allKeysToDelete.push(clip.metadata.video_clean_storage_key);
          if (clip.metadata?.video_captioned_storage_key) allKeysToDelete.push(clip.metadata.video_captioned_storage_key);
        }
      }

      if (expiredClipIds.length === 0) return;

      console.log(`[Retention]: Purging ${expiredClipIds.length} expired clip(s) from local active queue...`);

      // 1. Delete physical storage assets
      if (allKeysToDelete.length > 0) {
        const { deleted } = await this.storage.deleteObjects(allKeysToDelete);
        telemetry.keysRemoved.push(...deleted);
      }

      // 2. Remove from active queue
      for (const id of expiredClipIds) {
        delete queue.clips[id];
        telemetry.deleted++;
      }

      // 3. Remove orphaned render jobs
      if (Array.isArray(queue.render_jobs)) {
        queue.render_jobs = queue.render_jobs.filter(
          (rj: any) => !expiredClipIds.includes(rj.clip_id)
        );
      }

      firebaseDb.writeQueue(queue);
      console.log(`[Retention]: Cleaned ${expiredClipIds.length} clip(s) from local active_queue.json`);
    } catch (queueErr: any) {
      console.warn(`[Retention]: Queue cleanup error: ${queueErr.message}`);
    }
  }

  // ─── 3. Voiceovers ──────────────────────────────────────────────────────────

  private async expireVoiceovers(
    supabase: SupabaseClient,
    nowIso: string,
    cutoffIso: string,
    telemetry: RetentionTelemetry
  ): Promise<void> {
    try {
      const { data: expiredVoiceovers, error } = await supabase
        .from('voiceover_clips')
        .select('id, source_clip_id, audio_path, video_path, status, created_at, expires_at')
        .or(`expires_at.lt.${nowIso},and(expires_at.is.null,created_at.lt.${cutoffIso})`)
        .limit(BATCH_SIZE);

      if (error) return;
      if (!expiredVoiceovers || expiredVoiceovers.length === 0) return;

      telemetry.scanned += expiredVoiceovers.length;
      telemetry.expired += expiredVoiceovers.length;

      for (const vo of expiredVoiceovers) {
        const keys: string[] = [];
        if (vo.audio_path) keys.push(vo.audio_path);
        if (vo.video_path) keys.push(vo.video_path);

        if (keys.length > 0) {
          const { deleted } = await this.storage.deleteObjects(keys);
          telemetry.keysRemoved.push(...deleted);
        }

        try {
          await supabase.from('voiceover_feedback').delete().eq('voiceover_id', vo.id);
        } catch {}

        const { error: dbErr } = await supabase.from('voiceover_clips').delete().eq('id', vo.id);
        if (!dbErr) {
          telemetry.deleted++;
        } else {
          telemetry.failed++;
        }
      }
    } catch (err: any) {
      console.warn(`[Retention]: Voiceover retention error: ${err.message}`);
    }
  }
}

export const retentionService = RetentionService.getInstance();
