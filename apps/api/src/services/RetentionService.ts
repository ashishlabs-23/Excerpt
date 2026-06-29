import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService } from './storageService';

// ─────────────────────────────────────────────────────────────────────────────
// RetentionService
//
// Deletes expired clips and voiceovers from storage and the database.
// Runs inside the existing maintenance cycle (ZombieSweeperService).
//
// Deletion order (storage-first, DB-second):
//   Clip:      MP4 → Thumbnail → DB row
//   Voiceover: MP3 → MP4 → Feedback rows → DB row
//
// If any storage deletion fails, the DB row is preserved and the failure
// is logged. The next maintenance cycle will retry.
//
// RETENTION_DAYS env var controls expiry duration (default: 30).
// ─────────────────────────────────────────────────────────────────────────────

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS ?? '30', 10);
const BATCH_SIZE = 50; // max rows processed per run

interface RetentionSummary {
  scanned:      number;
  expired:      number;
  deleted:      number;
  failures:     number;
  bytesFreed:   number; // best-effort; 0 when size unknown
}

export class RetentionService {
  private db: DatabaseService;
  private storage: StorageService;

  constructor() {
    this.db      = new DatabaseService();
    this.storage = StorageService.getInstance();
  }

  /** Entry point — called by ZombieSweeperService once per hour. */
  async run(): Promise<void> {
    const supabase = this.db.getSupabase();
    console.log(`[Retention]: Starting retention sweep (policy: ${RETENTION_DAYS} days)`);

    const clipSummary      = await this.expireClips(supabase);
    const voiceoverSummary = await this.expireVoiceovers(supabase);

    const total: RetentionSummary = {
      scanned:    clipSummary.scanned    + voiceoverSummary.scanned,
      expired:    clipSummary.expired    + voiceoverSummary.expired,
      deleted:    clipSummary.deleted    + voiceoverSummary.deleted,
      failures:   clipSummary.failures   + voiceoverSummary.failures,
      bytesFreed: clipSummary.bytesFreed + voiceoverSummary.bytesFreed,
    };

    console.log(
      `[Retention]: Summary — ` +
      `scanned=${total.scanned} expired=${total.expired} ` +
      `deleted=${total.deleted} failures=${total.failures} ` +
      `bytesFreed=${this.formatBytes(total.bytesFreed)}`
    );
  }

  // ─── Clips ─────────────────────────────────────────────────────────────────

  private async expireClips(supabase: SupabaseClient): Promise<RetentionSummary> {
    const summary: RetentionSummary = { scanned: 0, expired: 0, deleted: 0, failures: 0, bytesFreed: 0 };

    const { data: expiredClips, error } = await supabase
      .from('clips')
      .select('id, storage_path, thumbnail_url, metadata, status')
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`[Retention]: Failed to query expired clips: ${error.message}`);
      return summary;
    }

    summary.scanned = expiredClips?.length ?? 0;
    if (!expiredClips || expiredClips.length === 0) return summary;

    summary.expired = expiredClips.length;
    console.log(`[Retention]: Found ${expiredClips.length} expired clip(s).`);

    for (const clip of expiredClips) {
      const result = await this.deleteClip(supabase, clip);
      if (result.success) {
        summary.deleted++;
        summary.bytesFreed += result.bytesFreed;
      } else {
        summary.failures++;
      }
    }

    return summary;
  }

  private async deleteClip(
    supabase: SupabaseClient,
    clip: { id: string; storage_path: string | null; thumbnail_url: string | null; metadata: any, status: string }
  ): Promise<{ success: boolean; bytesFreed: number }> {
    const clipId    = clip.id;
    const mp4Key    = clip.storage_path;
    const thumbKey  = this.extractStorageKey(clip.thumbnail_url);
    const captionedKey: string | null = clip.metadata?.video_captioned_storage_key ?? null;

    console.log(`[Retention]: Processing clip clip_id=${clipId} storage=${mp4Key ?? 'none'} expires_at=expired`);

    // 0. Mark as deleting first (safe recovery if storage fails)
    if (clip.status !== 'deleting') {
      const { error: updateErr } = await supabase.from('clips').update({ status: 'deleting' }).eq('id', clipId);
      if (updateErr) {
        console.error(`[Retention]: Failed to mark clip ${clipId} as deleting: ${updateErr.message}`);
        return { success: false, bytesFreed: 0 };
      }
    }

    // 1. Delete MP4 (primary asset) — fail fast if this fails
    if (mp4Key) {
      const ok = await this.storage.deleteFile(mp4Key);
      if (!ok) {
        console.error(`[Retention]: result=failure clip_id=${clipId} asset=mp4 storage=${mp4Key}`);
        return { success: false, bytesFreed: 0 };
      }
      console.log(`[Retention]: result=success clip_id=${clipId} asset=mp4 storage=${mp4Key}`);
    }

    // 2. Delete thumbnail (best-effort — don't block DB deletion if this fails)
    if (thumbKey) {
      const ok = await this.storage.deleteFile(thumbKey);
      console.log(`[Retention]: result=${ok ? 'success' : 'failure'} clip_id=${clipId} asset=thumbnail storage=${thumbKey}`);
    }

    // 3. Delete captioned version if separate key exists
    if (captionedKey && captionedKey !== mp4Key) {
      const ok = await this.storage.deleteFile(captionedKey);
      console.log(`[Retention]: result=${ok ? 'success' : 'failure'} clip_id=${clipId} asset=captioned storage=${captionedKey}`);
    }

    // 4. Delete DB row (only after primary storage deletion succeeded)
    const { error: dbError } = await supabase.from('clips').delete().eq('id', clipId);
    if (dbError) {
      console.error(`[Retention]: result=failure clip_id=${clipId} asset=db_row reason=${dbError.message}`);
      return { success: false, bytesFreed: 0 };
    }

    console.log(`[Retention]: result=success clip_id=${clipId} asset=db_row`);
    return { success: true, bytesFreed: 0 }; // byte size not tracked (would need HEAD request)
  }

  // ─── Voiceovers ────────────────────────────────────────────────────────────

  private async expireVoiceovers(supabase: SupabaseClient): Promise<RetentionSummary> {
    const summary: RetentionSummary = { scanned: 0, expired: 0, deleted: 0, failures: 0, bytesFreed: 0 };

    const { data: expiredVoiceovers, error } = await supabase
      .from('voiceover_clips')
      .select('id, source_clip_id, audio_path, video_path, status')
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`[Retention]: Failed to query expired voiceovers: ${error.message}`);
      return summary;
    }

    summary.scanned = expiredVoiceovers?.length ?? 0;
    if (!expiredVoiceovers || expiredVoiceovers.length === 0) return summary;

    summary.expired = expiredVoiceovers.length;
    console.log(`[Retention]: Found ${expiredVoiceovers.length} expired voiceover(s).`);

    for (const vo of expiredVoiceovers) {
      const result = await this.deleteVoiceover(supabase, vo);
      if (result.success) {
        summary.deleted++;
        summary.bytesFreed += result.bytesFreed;
      } else {
        summary.failures++;
      }
    }

    return summary;
  }

  private async deleteVoiceover(
    supabase: SupabaseClient,
    vo: { id: string; source_clip_id: string | null; audio_path: string | null; video_path: string | null, status: string }
  ): Promise<{ success: boolean; bytesFreed: number }> {
    const voId    = vo.id;
    const clipId  = vo.source_clip_id;

    // Reconstruct storage keys from the known key patterns:
    //   voiceovers_audio/{clip_id}/{vo_id}.mp3
    //   voiceovers/{clip_id}/{vo_id}.mp4
    // audio_path/video_path may be full public URLs — extract key from path if needed
    const mp3Key = this.extractStorageKey(vo.audio_path) ?? (clipId ? `voiceovers_audio/${clipId}/${voId}.mp3` : null);
    const mp4Key = this.extractStorageKey(vo.video_path) ?? (clipId ? `voiceovers/${clipId}/${voId}.mp4` : null);

    console.log(`[Retention]: Processing voiceover voiceover_id=${voId} storage_mp3=${mp3Key ?? 'none'} expires_at=expired`);

    // 0. Mark as deleting first
    if (vo.status !== 'deleting') {
      const { error: updateErr } = await supabase.from('voiceover_clips').update({ status: 'deleting' }).eq('id', voId);
      if (updateErr) {
        console.error(`[Retention]: Failed to mark voiceover ${voId} as deleting: ${updateErr.message}`);
        return { success: false, bytesFreed: 0 };
      }
    }

    // 1. Delete MP3
    if (mp3Key) {
      const ok = await this.storage.deleteFile(mp3Key);
      if (!ok) {
        console.error(`[Retention]: result=failure voiceover_id=${voId} asset=mp3 storage=${mp3Key}`);
        return { success: false, bytesFreed: 0 };
      }
      console.log(`[Retention]: result=success voiceover_id=${voId} asset=mp3 storage=${mp3Key}`);
    }

    // 2. Delete MP4 (best-effort after MP3 succeeds)
    if (mp4Key) {
      const ok = await this.storage.deleteFile(mp4Key);
      console.log(`[Retention]: result=${ok ? 'success' : 'failure'} voiceover_id=${voId} asset=mp4 storage=${mp4Key}`);
    }

    // 3. Delete feedback rows first (FK constraint)
    const { error: feedbackErr } = await supabase
      .from('voiceover_feedback')
      .delete()
      .eq('voiceover_id', voId);

    if (feedbackErr) {
      console.warn(`[Retention]: Failed to delete feedback for voiceover_id=${voId}: ${feedbackErr.message}`);
      // Non-fatal — proceed to delete voiceover row
    }

    // 4. Delete DB row (only after primary storage deletion succeeded)
    const { error: dbError } = await supabase.from('voiceover_clips').delete().eq('id', voId);
    if (dbError) {
      console.error(`[Retention]: result=failure voiceover_id=${voId} asset=db_row reason=${dbError.message}`);
      return { success: false, bytesFreed: 0 };
    }

    console.log(`[Retention]: result=success voiceover_id=${voId} asset=db_row`);
    return { success: true, bytesFreed: 0 };
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Extracts the storage key from either:
   *   - A full public URL: https://bucket.s3.region.backblazeb2.com/voiceovers/...
   *   - A Supabase signed URL
   *   - An already-clean key like voiceovers/clip123/vo456.mp4
   * Returns null if the input is null or cannot be parsed.
   */
  private extractStorageKey(urlOrKey: string | null): string | null {
    if (!urlOrKey) return null;
    // If it looks like a storage key already (no scheme), return as-is
    if (!urlOrKey.startsWith('http')) return urlOrKey;
    try {
      const url = new URL(urlOrKey);
      // Strip leading slash from pathname
      return url.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return 'unknown';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
}
