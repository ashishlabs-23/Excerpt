// ─────────────────────────────────────────────────────────────────────────────
// StorageReconciliationService — Inventory vs Manifest Discrepancy Auditing
//
// Reconciles ground truth between:
//   1. Physical Storage Inventory (storage.objects / S3 listing)
//   2. Application DB Manifest (clip_artifacts, clips)
//
// Read/audit/repair-oriented:
//   - Detects size drift (DB says 19 MB, storage says 21 MB)
//   - Detects orphaned objects (file in storage, DB row missing)
//   - Detects ghost artifacts / missing objects (DB says available, storage file missing)
//   - Detects metadata anomalies (missing storage_path, key collisions)
//   - Calibrates reconciled physical usage to supply to StorageCapacityManager
//   - Periodic / scheduled audit — never blocks the render request path
//   - Does NOT delete objects itself — leaves deletion to the controlled engines
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService } from './storageService';

export interface DiscrepancyRecord {
  id?: string;
  storageKey: string;
  type:
    | 'SIZE_DRIFT'
    | 'ORPHAN_OBJECT'
    | 'GHOST_ARTIFACT'
    | 'MISSING_OBJECT'
    | 'METADATA_INCOMPLETE'
    | 'KEY_COLLISION';
  manifestBytes?: number;
  physicalBytes?: number;
  details?: string;
}

export interface ReconciliationReport {
  reconciledAt: string;
  physicalUsageBytes: number;
  manifestUsageBytes: number;
  driftBytes: number;
  physicalObjectCount: number;
  manifestArtifactCount: number;
  discrepancies: DiscrepancyRecord[];
  summary: {
    sizeDriftCount: number;
    orphanCount: number;
    ghostCount: number;
    missingMetadataCount: number;
    keyCollisionCount: number;
  };
}

export class StorageReconciliationService {
  private static instance: StorageReconciliationService | null = null;
  private db: DatabaseService;
  private storage: StorageService;

  static getInstance(): StorageReconciliationService {
    if (!StorageReconciliationService.instance) {
      StorageReconciliationService.instance = new StorageReconciliationService();
    }
    return StorageReconciliationService.instance;
  }

  constructor(db?: DatabaseService, storage?: StorageService) {
    this.db = db ?? new DatabaseService();
    this.storage = storage ?? StorageService.getInstance();
  }

  /**
   * Performs an audit comparison between physical object storage and the DB manifest.
   * Can be scoped by ownerId if tenant isolation is requested.
   */
  async auditInventory(
    supabase?: SupabaseClient,
    ownerId?: string
  ): Promise<ReconciliationReport> {
    const sb = supabase ?? this.db.getSupabase();

    // 1. Fetch physical objects from storage (handles pagination internally in storageService)
    const physicalObjects = await this.storage.listCurrentObjects();
    const physicalMap = new Map<string, { size: number; lastModified: Date }>();
    let physicalUsageBytes = 0;

    for (const obj of physicalObjects) {
      const normalizedKey = (obj.key || '').replace(/^\/+/, '');
      if (normalizedKey) {
        physicalMap.set(normalizedKey, { size: obj.size, lastModified: obj.lastModified });
        physicalUsageBytes += obj.size;
      }
    }

    // 2. Fetch available artifacts from DB manifest
    let query = sb
      .from('clip_artifacts')
      .select('id, clip_id, owner_id, artifact_type, storage_path, bytes, state')
      .eq('state', 'available');

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    const { data: dbArtifacts, error } = await query;

    if (error) {
      console.warn(`[StorageReconciliation]: Failed to read clip_artifacts: ${error.message}`);
    }

    const artifacts = dbArtifacts || [];
    let manifestUsageBytes = 0;
    const discrepancies: DiscrepancyRecord[] = [];
    const matchedStorageKeys = new Set<string>();
    const seenStorageKeys = new Map<string, string>(); // storageKey -> artifactId (for collision detection)

    // 3. Compare DB manifest against physical storage
    for (const art of artifacts) {
      const bytes = typeof art.bytes === 'number' && !isNaN(art.bytes) ? art.bytes : null;
      manifestUsageBytes += (bytes || 0);

      const storageKey = (art.storage_path || '').replace(/^\/+/, '');

      // Check for missing metadata
      if (!storageKey || bytes === null) {
        discrepancies.push({
          id: art.id,
          storageKey: storageKey || 'unknown',
          type: 'METADATA_INCOMPLETE',
          manifestBytes: bytes ?? 0,
          physicalBytes: 0,
          details: `Artifact ${art.id} is missing essential metadata (path="${art.storage_path}", bytes=${art.bytes}).`,
        });
        continue;
      }

      // Check for key collisions in manifest
      if (seenStorageKeys.has(storageKey)) {
        discrepancies.push({
          id: art.id,
          storageKey,
          type: 'KEY_COLLISION',
          manifestBytes: bytes,
          physicalBytes: physicalMap.get(storageKey)?.size ?? 0,
          details: `Storage key ${storageKey} is referenced by multiple active artifacts: ${seenStorageKeys.get(storageKey)} and ${art.id}`,
        });
      } else {
        seenStorageKeys.set(storageKey, art.id);
      }

      const physical = physicalMap.get(storageKey);
      if (!physical) {
        // DB says available, but physical storage object is missing!
        discrepancies.push({
          id: art.id,
          storageKey,
          type: 'GHOST_ARTIFACT',
          manifestBytes: bytes,
          physicalBytes: 0,
          details: `Artifact ${art.id} is marked available in DB but object is missing from storage.`,
        });
      } else {
        matchedStorageKeys.add(storageKey);
        // Check for size drift
        if (bytes !== physical.size) {
          discrepancies.push({
            id: art.id,
            storageKey,
            type: 'SIZE_DRIFT',
            manifestBytes: bytes,
            physicalBytes: physical.size,
            details: `Size drift: DB manifest=${bytes} bytes, Storage actual=${physical.size} bytes`,
          });
        }
      }
    }

    // 4. Identify orphaned physical objects (under managed prefixes like 'clips/')
    for (const [key, obj] of physicalMap.entries()) {
      if (key.startsWith('clips/') && !matchedStorageKeys.has(key)) {
        discrepancies.push({
          storageKey: key,
          type: 'ORPHAN_OBJECT',
          physicalBytes: obj.size,
          details: `Storage object ${key} (${obj.size} bytes) has no active DB artifact record.`,
        });
      }
    }

    const driftBytes = physicalUsageBytes - manifestUsageBytes;
    const sizeDriftCount = discrepancies.filter(d => d.type === 'SIZE_DRIFT').length;
    const orphanCount = discrepancies.filter(d => d.type === 'ORPHAN_OBJECT').length;
    const ghostCount = discrepancies.filter(d => d.type === 'GHOST_ARTIFACT').length;
    const missingMetadataCount = discrepancies.filter(d => d.type === 'METADATA_INCOMPLETE').length;
    const keyCollisionCount = discrepancies.filter(d => d.type === 'KEY_COLLISION').length;

    console.log(
      `[StorageReconciliation]: Audit complete — Physical=${(physicalUsageBytes / (1024 * 1024)).toFixed(1)} MB ` +
      `(${physicalMap.size} objs), Manifest=${(manifestUsageBytes / (1024 * 1024)).toFixed(1)} MB ` +
      `(${artifacts.length} arts), Drift=${(driftBytes / (1024 * 1024)).toFixed(1)} MB, ` +
      `Findings: drift=${sizeDriftCount}, orphans=${orphanCount}, ghosts=${ghostCount}, ` +
      `badMeta=${missingMetadataCount}, collisions=${keyCollisionCount}`
    );

    return {
      reconciledAt: new Date().toISOString(),
      physicalUsageBytes,
      manifestUsageBytes,
      driftBytes,
      physicalObjectCount: physicalMap.size,
      manifestArtifactCount: artifacts.length,
      discrepancies,
      summary: {
        sizeDriftCount,
        orphanCount,
        ghostCount,
        missingMetadataCount,
        keyCollisionCount,
      },
    };
  }

  /**
   * Non-destructive calibration: updates DB artifact byte sizes to match actual storage reality.
   * Safe because the physical file actually exists and was measured.
   */
  async calibrateSizeDrift(
    discrepancies: DiscrepancyRecord[],
    supabase?: SupabaseClient
  ): Promise<number> {
    const sb = supabase ?? this.db.getSupabase();
    let updated = 0;

    for (const disc of discrepancies) {
      if (disc.type === 'SIZE_DRIFT' && disc.id && disc.physicalBytes !== undefined) {
        const { error } = await sb
          .from('clip_artifacts')
          .update({ bytes: disc.physicalBytes })
          .eq('id', disc.id);

        if (!error) updated++;
      }
    }

    return updated;
  }

  /**
   * Non-destructive ghost repair: flags artifacts absent from storage as 'missing' or 'evicted'.
   * Safe because the file is already gone from physical store.
   */
  async reconcileGhosts(
    discrepancies: DiscrepancyRecord[],
    supabase?: SupabaseClient
  ): Promise<number> {
    const sb = supabase ?? this.db.getSupabase();
    let reconciled = 0;

    for (const disc of discrepancies) {
      if (disc.type === 'GHOST_ARTIFACT' && disc.id) {
        const { error } = await sb
          .from('clip_artifacts')
          .update({ state: 'evicted' })
          .eq('id', disc.id);

        if (!error) reconciled++;
      }
    }

    return reconciled;
  }
}

export const storageReconciliationService = StorageReconciliationService.getInstance();
