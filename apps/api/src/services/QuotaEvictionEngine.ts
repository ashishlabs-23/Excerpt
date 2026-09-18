// ─────────────────────────────────────────────────────────────────────────────
// QuotaEvictionEngine — Artifact-Level Oldest-Eligible Eviction
//
// Eviction unit: clip_artifact (not a whole clip).
// This allows fine-grained reclamation — a captioned video can survive while
// the clean derivative is evicted, and project_json is always preserved.
//
// Artifact Eviction Priority (lower number = evicted first):
//   clean_video     3 — temporary clean render, captioned is the deliverable
//   metadata_json   2 — large analysis blobs, reproducible
//   captioned_video 1 — the primary deliverable; last resort
//   thumbnail       1 — small but still last resort
//   project_json    0 — NEVER evicted (protected in EvictionEligibility)
//
// Within each priority tier: oldest created_at is evicted first (FIFO).
//
// Contract:
//   evictToTarget() → stops immediately once bytesFreed >= deficit
//   → returns blocked=true when all eligible artifacts are exhausted
//     and deficit is not yet recovered (CAPACITY_BLOCKED state)
//   → never deletes via SQL; always calls Storage API then updates DB record
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService } from './storageService';
import {
  STORAGE_TARGET_BYTES,
} from './StoragePolicyConfig';
import {
  ClipArtifactEligibilityRow,
  ClipEligibilityRow,
  EligibilityContext,
  filterEvictableArtifacts,
  assessArtifactEvictionEligibility,
} from './EvictionEligibility';

export interface EvictionReport {
  evictedCount: number;
  bytesFreed: number;
  skippedProtected: number;
  protectionBreakdown: Record<string, number>;
  blocked: boolean;
  blockedReason?: 'INSUFFICIENT_EVICTABLE_CAPACITY';
  mediaEvictedClipIds: string[];
}

// Artifact eviction priority: lower number = evicted FIRST
// project_json is not listed; it is blocked in EvictionEligibility.NEVER_EVICT_ARTIFACT_TYPES
export const ARTIFACT_EVICTION_PRIORITY: Record<string, number> = {
  clean_video:     3,
  metadata_json:   2,
  captioned_video: 1,
  thumbnail:       1,
  // project_json: 0 — never evicted (guarded by EvictionEligibility)
};

const ARTIFACT_BATCH_SIZE = 100;

export class QuotaEvictionEngine {
  private static instance: QuotaEvictionEngine | null = null;
  private db: DatabaseService;
  private storage: StorageService;

  static getInstance(): QuotaEvictionEngine {
    if (!QuotaEvictionEngine.instance) {
      QuotaEvictionEngine.instance = new QuotaEvictionEngine();
    }
    return QuotaEvictionEngine.instance;
  }

  constructor(db?: DatabaseService, storage?: StorageService) {
    this.db = db ?? new DatabaseService();
    this.storage = storage ?? StorageService.getInstance();
  }

  /**
   * Evicts the minimum set of eligible artifacts required to bring
   * storage usage below STORAGE_TARGET_BYTES.
   *
   * @param currentUsageBytes — current measured physical usage (passed in to avoid double-read)
   * @param context — eligibility context (active jobs, clip projects, pending publications)
   */
  async evictToTarget(
    supabase: SupabaseClient,
    currentUsageBytes: number,
    context: EligibilityContext,
    ownerId?: string
  ): Promise<EvictionReport> {
    const report: EvictionReport = {
      evictedCount: 0,
      bytesFreed: 0,
      skippedProtected: 0,
      protectionBreakdown: {},
      blocked: false,
      mediaEvictedClipIds: [],
    };

    const deficit = currentUsageBytes - STORAGE_TARGET_BYTES;
    if (deficit <= 0) return report; // Already at target, nothing to do

    console.warn(
      `[QuotaEvictionEngine]: ⚠️ Eviction required — deficit=${(deficit / (1024 * 1024)).toFixed(1)} MB ` +
      `(usage=${(currentUsageBytes / (1024 * 1024)).toFixed(1)} MB, ` +
      `target=${(STORAGE_TARGET_BYTES / (1024 * 1024)).toFixed(1)} MB)`
    );

    // Load candidate artifacts + their parent clips (ordered by eviction priority then age)
    const pairs = await this.loadCandidateArtifacts(supabase, ownerId);

    if (pairs.length === 0) {
      report.blocked = true;
      report.blockedReason = 'INSUFFICIENT_EVICTABLE_CAPACITY';
      console.error('[QuotaEvictionEngine]: 🚫 CAPACITY_BLOCKED — no candidate artifacts found');
      return report;
    }

    const evictable = filterEvictableArtifacts(pairs, context, ARTIFACT_EVICTION_PRIORITY);

    // Count and record skipped protected artifacts
    const skipped = pairs.length - evictable.length;
    report.skippedProtected = skipped;

    for (const { artifact, verdict: _ } of evictable) {
      if (report.bytesFreed >= deficit) {
        console.log(
          `[QuotaEvictionEngine]: ✅ Target recovered — freed=${(report.bytesFreed / (1024 * 1024)).toFixed(1)} MB`
        );
        break;
      }

      const evicted = await this.evictArtifact(supabase, artifact, context);
      if (evicted) {
        report.evictedCount++;
        report.bytesFreed += artifact.bytes;
        if (!report.mediaEvictedClipIds.includes(artifact.clip_id)) {
          report.mediaEvictedClipIds.push(artifact.clip_id);
        }
      }
    }

    // Check if we exhausted all eligible artifacts without reaching target
    if (report.bytesFreed < deficit) {
      report.blocked = true;
      report.blockedReason = 'INSUFFICIENT_EVICTABLE_CAPACITY';
      console.error(
        `[QuotaEvictionEngine]: 🚫 CAPACITY_BLOCKED — evicted ${report.evictedCount} artifacts ` +
        `(${(report.bytesFreed / (1024 * 1024)).toFixed(1)} MB) but deficit of ` +
        `${(deficit / (1024 * 1024)).toFixed(1)} MB not satisfied. ` +
        `Render jobs will be storage_deferred until capacity is freed manually.`
      );
    }

    // Update clip.media_state for all affected clips
    if (report.mediaEvictedClipIds.length > 0) {
      await this.reconcileClipMediaState(supabase, report.mediaEvictedClipIds);
    }

    return report;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /**
   * Loads clip_artifacts + parent clip rows for eviction assessment.
   * Filters by owner_id if tenant isolation is active.
   */
  private async loadCandidateArtifacts(
    supabase: SupabaseClient,
    ownerId?: string
  ): Promise<Array<{ artifact: ClipArtifactEligibilityRow; clip: ClipEligibilityRow }>> {
    try {
      let query = supabase
        .from('clip_artifacts')
        .select(`
          id, clip_id, owner_id, artifact_type, state, is_pinned, bytes, created_at,
          clips!inner(id, status, is_pinned, created_at, clip_project_id, job_id, expires_at)
        `)
        .eq('state', 'available')
        .eq('is_pinned', false);

      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }

      const { data: artifacts, error } = await query
        .order('created_at', { ascending: true })
        .limit(ARTIFACT_BATCH_SIZE);

      if (error || !artifacts) return [];

      return artifacts.map((a: any) => ({
        artifact: {
          id: a.id,
          clip_id: a.clip_id,
          owner_id: a.owner_id,
          artifact_type: a.artifact_type,
          state: a.state,
          is_pinned: a.is_pinned,
          bytes: a.bytes,
          created_at: a.created_at,
        } as ClipArtifactEligibilityRow,
        clip: {
          id: a.clips.id,
          status: a.clips.status,
          is_pinned: a.clips.is_pinned,
          created_at: a.clips.created_at,
          clip_project_id: a.clips.clip_project_id,
          job_id: a.clips.job_id,
          expires_at: a.clips.expires_at,
        } as ClipEligibilityRow,
      }));
    } catch (err: any) {
      console.warn(`[QuotaEvictionEngine]: loadCandidateArtifacts error: ${err.message}`);
      return [];
    }
  }

  /**
   * Evicts a single artifact with state machine transitions:
   *   1. Immediate pre-deletion TOCTOU re-check
   *   2. State -> 'deleting' (optimistic lock)
   *   3. Storage API remove (batched/idempotent)
   *   4. State -> 'evicted' + evicted_at
   * Returns true if successfully evicted.
   */
  private async evictArtifact(
    supabase: SupabaseClient,
    artifact: ClipArtifactEligibilityRow,
    context: EligibilityContext
  ): Promise<boolean> {
    try {
      // 0. Immediate pre-deletion TOCTOU re-check:
      // Creator may have pinned, published, or re-rendered between scan and execution
      try {
        const { data: freshClip } = await supabase
          .from('clips')
          .select('id, status, is_pinned, created_at, clip_project_id, job_id, expires_at')
          .eq('id', artifact.clip_id)
          .single();

        const { data: freshArtifact } = await supabase
          .from('clip_artifacts')
          .select('id, clip_id, owner_id, artifact_type, state, is_pinned, bytes, created_at')
          .eq('id', artifact.id)
          .single();

        if (freshClip && freshArtifact) {
          const recheckVerdict = assessArtifactEvictionEligibility(
            freshArtifact,
            freshClip,
            context
          );
          if (!recheckVerdict.eligible) {
            console.log(
              `[QuotaEvictionEngine]: 🛑 TOCTOU re-check protected artifact ${artifact.id} ` +
              `(reason=${recheckVerdict.reason}). Aborting deletion.`
            );
            return false;
          }
        }
      } catch (checkErr: any) {
        // Safe fallback: if re-check query fails, abort destructive step
        console.warn(`[QuotaEvictionEngine]: TOCTOU re-check error for ${artifact.id}: ${checkErr.message}`);
      }

      // 1. Optimistic lock: mark state='deleting'
      const { error: lockErr } = await supabase
        .from('clip_artifacts')
        .update({ state: 'deleting' })
        .eq('id', artifact.id)
        .eq('state', 'available');

      if (lockErr) {
        console.warn(`[QuotaEvictionEngine]: Could not lock artifact ${artifact.id}: ${lockErr.message}`);
        return false;
      }

      // 2. Delete via Storage API (never raw SQL DELETE on storage.objects)
      const { error: storageErr } = await supabase.storage
        .from('clips')
        .remove([artifact.id]);

      // 404 / not found is treated as successfully evicted (idempotent)
      const evictedSuccessfully = !storageErr ||
        storageErr.message?.toLowerCase().includes('not found') ||
        storageErr.message?.toLowerCase().includes('404');

      if (!evictedSuccessfully) {
        // Rollback lock
        await supabase
          .from('clip_artifacts')
          .update({ state: 'available' })
          .eq('id', artifact.id);
        console.warn(`[QuotaEvictionEngine]: Storage deletion failed for ${artifact.id}: ${storageErr?.message}`);
        return false;
      }

      // 3. Finalize eviction in DB
      await supabase
        .from('clip_artifacts')
        .update({ state: 'evicted', evicted_at: new Date().toISOString() })
        .eq('id', artifact.id);

      console.log(
        `[QuotaEvictionEngine]: Evicted artifact ${artifact.id} ` +
        `(type=${artifact.artifact_type}, clip=${artifact.clip_id}, ` +
        `bytes=${(artifact.bytes / (1024 * 1024)).toFixed(1)} MB)`
      );
      return true;

    } catch (err: any) {
      console.warn(`[QuotaEvictionEngine]: evictArtifact error for ${artifact.id}: ${err.message}`);
      return false;
    }
  }

  /**
   * After eviction, recalculates and updates clips.media_state for each affected clip:
   *   - all artifacts available → 'available'
   *   - some artifacts evicted  → 'partially_evicted'
   *   - all artifacts evicted   → 'evicted'
   */
  private async reconcileClipMediaState(
    supabase: SupabaseClient,
    clipIds: string[]
  ): Promise<void> {
    for (const clipId of clipIds) {
      try {
        const { data: artifacts } = await supabase
          .from('clip_artifacts')
          .select('state')
          .eq('clip_id', clipId);

        if (!artifacts || artifacts.length === 0) continue;

        const states = artifacts.map((a: any) => a.state);
        const allEvicted = states.every((s: string) => s === 'evicted' || s === 'deleted');
        const anyEvicted = states.some((s: string) => s === 'evicted' || s === 'deleted');

        const mediaState = allEvicted ? 'evicted' : anyEvicted ? 'partially_evicted' : 'available';

        await supabase
          .from('clips')
          .update({ media_state: mediaState })
          .eq('id', clipId);
      } catch (err: any) {
        console.warn(`[QuotaEvictionEngine]: reconcileClipMediaState error for clip ${clipId}: ${err.message}`);
      }
    }
  }
}

export const quotaEvictionEngine = QuotaEvictionEngine.getInstance();
