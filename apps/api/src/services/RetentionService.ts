import fs from 'fs';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService, StorageObjectMetadata } from './storageService';
import { firebaseDb } from './firebaseService';

// ─────────────────────────────────────────────────────────────────────────────
// Hardened RetentionService (Gen-4 Architectural Specification)
//
// Invariants:
// 1. Single Lifecycle Authority: Supabase jobs & clips are canonical authority.
//    Firebase & local worker workspaces provide supporting evidence.
//    Rule: Active in ANY authority -> PROTECT.
// 2. Explicit Age Source Hierarchy & Contractual Inequality:
//    manifest.verifiedAt / manifest.created_at -> DB record created_at -> S3 LastModified -> UNKNOWN.
//    Contract:
//      artifactTimestamp > retentionCutoff  => PROTECTED (FRESH_ARTIFACT_AGE_POLICY)
//      artifactTimestamp <= retentionCutoff => ELIGIBLE (Subject to canonical reference checks)
//    Unknown age -> PROTECT.
// 3. Content-Addressed sources/* Lifecycle Invariant:
//    Eligible ONLY if: AGE_OK AND NO_ACTIVE_JOB_REF AND NO_UNEXPIRED_CLIP_REF
//                      AND NO_RECLIP_OR_SESSION_REF AND (MANIFEST_VALID OR CONFIRMED_UNMANIFESTED_ORPHAN).
//    ALL TRUE -> EXPIRING -> DELETE.
//    ANY FALSE -> PROTECTED.
//    UNKNOWN -> PROTECTED (Never UNKNOWN -> DELETE).
// 4. Explicit Reconciled Storage Prefixes:
//    'jobs/', 'sources/', 'test_streams/', 'test_verification/' (Never generic bucket cleanups).
// 5. Version-Aware & Idempotent Deletion:
//    Purges versions and delete markers; absent/404 objects treated as successfully DELETED.
// 6. Durable Retry Queue:
//    Primary: Supabase retention_deletion_jobs.
//    Durable fallback: data/retention/retention_retry_queue.json (outside temp/).
// 7. Observable Decision State Machine:
//    DISCOVERED -> ELIGIBLE -> (PROTECTED with audit reason | EXPIRING) -> DELETE_REQUESTED -> DELETED / RETRY.
// ─────────────────────────────────────────────────────────────────────────────

export const RETENTION_HOURS = parseInt(process.env.RETENTION_HOURS ?? '24', 10);
const BATCH_SIZE = 50; // max rows processed per sweep cycle
const LOCK_LEASE_MS = 5 * 60 * 1000; // 5-minute maximum lock hold
const DURABLE_RETRY_FALLBACK = path.resolve(process.cwd(), 'data', 'retention', 'retention_retry_queue.json');
const MAX_RETRY_ATTEMPTS = 3;

export const RECONCILED_STORAGE_PREFIXES = [
  'jobs/',
  'sources/',
  'test_streams/',
  'test_verification/'
] as const;

export type RetentionDecision = 'PROTECTED' | 'EXPIRING' | 'UNKNOWN';
export type RetentionProtectionReason =
  | 'ACTIVE_JOB_REFERENCE'
  | 'ACTIVE_SOURCE_REFERENCE'
  | 'UNEXPIRED_CLIP_REFERENCE'
  | 'ACTIVE_RECLIP_OR_SESSION'
  | 'FRESH_ARTIFACT_AGE_POLICY'
  | 'INCOMPLETE_IDENTITY_UNKNOWN'
  | 'CANONICAL_AUTHORITY_DISAGREEMENT'
  | 'CONCURRENT_ACTIVATION_PREVENTED';

export interface RetentionRetryItem {
  id: string;
  objectKey: string;
  versionId?: string;
  targetType: 'clip' | 'job' | 'source' | 'voiceover' | 'test';
  dbId?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  nextAttemptAt: string;
  status: 'RETRY' | 'DELETED' | 'FAILED';
  lastError?: string;
  requestedAt: string;
}

export interface RetentionTelemetry {
  lastSweep: string;
  startedAt: string;
  completedAt: string | null;
  objectsScanned: number;
  bytesScanned: number;
  eligible: number;
  protected: number;
  deleted: number;
  retrying: number;
  unknown: number;
  keysRemoved: string[];
  protectionBreakdown: Record<string, number>;
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
          return false;
        }
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
   * Main entry point — called on startup and periodically by ZombieSweeperService.
   */
  async run(): Promise<RetentionTelemetry> {
    if (!this.acquireLock()) {
      console.log('[Retention]: Sweep skipped — another retention sweep is currently in progress.');
      return RetentionService.latestTelemetry || {
        lastSweep: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        objectsScanned: 0,
        bytesScanned: 0,
        eligible: 0,
        protected: 0,
        deleted: 0,
        retrying: 0,
        unknown: 0,
        keysRemoved: [],
        protectionBreakdown: {},
        durationMs: 0,
        lastError: 'Sweep skipped: lock acquired by concurrent worker',
      };
    }

    const startTime = Date.now();
    const now = new Date();
    const nowIso = now.toISOString();
    const cutoffDate = new Date(now.getTime() - RETENTION_HOURS * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`[Retention]: 🧹 Starting hardened 24h retention sweep (policy: ${RETENTION_HOURS}h, cutoff: ${cutoffIso})`);

    const telemetry: RetentionTelemetry = {
      lastSweep: nowIso,
      startedAt: nowIso,
      completedAt: null,
      objectsScanned: 0,
      bytesScanned: 0,
      eligible: 0,
      protected: 0,
      deleted: 0,
      retrying: 0,
      unknown: 0,
      keysRemoved: [],
      protectionBreakdown: {},
      durationMs: 0,
      lastError: null,
    };

    try {
      const supabase = this.db.getSupabase();

      // 1. Process Durable Failed Deletion Retry Queue
      await this.processDurableRetryQueue(supabase, telemetry);

      // 2. Expire clips in Supabase (ACTIVE -> EXPIRING -> DELETE_REQUESTED -> DELETED)
      await this.expireSupabaseClips(supabase, nowIso, cutoffIso, telemetry);

      // 3. Expire clips in Local Queue (active_queue.json)
      await this.expireQueueClips(nowIso, cutoffIso, telemetry);

      // 4. Expire Voiceovers in Supabase
      await this.expireVoiceovers(supabase, nowIso, cutoffIso, telemetry);

      // 5. Build Canonical Reference & Workload Graph
      const { activeJobIds, activeSourceHashes } = await this.resolveActiveWorkloads(supabase);
      const referencedSourceHashes = await this.resolveReferencedSourceHashes(supabase, activeSourceHashes);

      // 6. Direct Cloud Storage Reconciliation for explicit production prefixes
      await this.reconcileStorageJobs(telemetry, cutoffDate, activeJobIds);
      await this.reconcileStorageSources(telemetry, cutoffDate, activeSourceHashes, referencedSourceHashes);
      await this.reconcileTestArtifacts(telemetry, cutoffDate);

      telemetry.completedAt = new Date().toISOString();
      telemetry.durationMs = Date.now() - startTime;
      RetentionService.latestTelemetry = telemetry;

      console.log(
        `[Retention]: ✅ Hardened retention sweep complete — ` +
        `scanned=${telemetry.objectsScanned} eligible=${telemetry.eligible} ` +
        `protected=${telemetry.protected} deleted=${telemetry.deleted} ` +
        `retrying=${telemetry.retrying} unknown=${telemetry.unknown} (${telemetry.durationMs}ms)`
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

  private recordProtection(telemetry: RetentionTelemetry, reason: RetentionProtectionReason, count: number = 1): void {
    telemetry.protected += count;
    telemetry.protectionBreakdown[reason] = (telemetry.protectionBreakdown[reason] || 0) + count;
  }

  // ─── 1. Durable Retry Queue (Supabase primary + data/ fallback) ─────────────

  private async enqueueDurableRetry(
    supabase: SupabaseClient,
    type: RetentionRetryItem['targetType'],
    key: string,
    errorMsg: string,
    dbId?: string,
    versionId?: string
  ): Promise<void> {
    const now = Date.now();
    const nextAttempt = new Date(now + 5 * 60 * 1000).toISOString();

    // 1. Try Supabase retention_deletion_jobs
    try {
      const { error } = await supabase
        .from('retention_deletion_jobs')
        .insert({
          object_key: key,
          version_id: versionId || null,
          target_type: type,
          db_id: dbId || null,
          status: 'RETRY',
          attempt_count: 1,
          last_attempt_at: new Date(now).toISOString(),
          next_attempt_at: nextAttempt,
          last_error: errorMsg,
          requested_at: new Date(now).toISOString()
        });

      if (!error) return;
    } catch {}

    // 2. Durable filesystem fallback (outside temp/)
    try {
      const dir = path.dirname(DURABLE_RETRY_FALLBACK);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let items: RetentionRetryItem[] = [];
      if (fs.existsSync(DURABLE_RETRY_FALLBACK)) {
        try { items = JSON.parse(fs.readFileSync(DURABLE_RETRY_FALLBACK, 'utf-8')); } catch {}
      }

      const existing = items.find(i => i.objectKey === key && i.versionId === versionId);
      if (existing) {
        existing.attemptCount++;
        existing.lastAttemptAt = new Date(now).toISOString();
        existing.lastError = errorMsg;
        const delayMs = Math.min(5 * 60 * 1000 * Math.pow(3, existing.attemptCount - 1), 60 * 60 * 1000);
        existing.nextAttemptAt = new Date(now + delayMs).toISOString();
      } else {
        items.push({
          id: `retry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          objectKey: key,
          versionId,
          targetType: type,
          dbId,
          attemptCount: 1,
          lastAttemptAt: new Date(now).toISOString(),
          nextAttemptAt: nextAttempt,
          status: 'RETRY',
          lastError: errorMsg,
          requestedAt: new Date(now).toISOString()
        });
      }

      fs.writeFileSync(DURABLE_RETRY_FALLBACK, JSON.stringify(items, null, 2));
    } catch (fsErr: any) {
      console.warn(`[Retention]: Durable retry queue write failed: ${fsErr.message}`);
    }
  }

  private async processDurableRetryQueue(supabase: SupabaseClient, telemetry: RetentionTelemetry): Promise<void> {
    const nowIso = new Date().toISOString();

    // 1. Process from Supabase if table exists
    try {
      const { data: readyJobs } = await supabase
        .from('retention_deletion_jobs')
        .select('*')
        .eq('status', 'RETRY')
        .lte('next_attempt_at', nowIso)
        .lt('attempt_count', MAX_RETRY_ATTEMPTS)
        .limit(BATCH_SIZE);

      if (readyJobs && readyJobs.length > 0) {
        console.log(`[Retention]: Retrying ${readyJobs.length} durable deletion job(s) from Supabase...`);
        for (const rj of readyJobs) {
          telemetry.retrying++;
          try {
            const { deleted, errors } = rj.version_id
              ? await this.storage.deleteObjectVersions([{ key: rj.object_key, versionId: rj.version_id }])
              : await this.storage.deleteObjects([rj.object_key], { versionAware: true });

            if (errors.length === 0 || deleted.includes(rj.object_key)) {
              await supabase
                .from('retention_deletion_jobs')
                .update({ status: 'DELETED', completed_at: new Date().toISOString() })
                .eq('id', rj.id);
              telemetry.deleted++;
              telemetry.keysRemoved.push(rj.object_key);
            } else {
              const attempts = rj.attempt_count + 1;
              const delayMs = Math.min(5 * 60 * 1000 * Math.pow(3, attempts - 1), 60 * 60 * 1000);
              await supabase
                .from('retention_deletion_jobs')
                .update({
                  attempt_count: attempts,
                  last_attempt_at: new Date().toISOString(),
                  next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
                  last_error: errors.join('; '),
                  status: attempts >= MAX_RETRY_ATTEMPTS ? 'FAILED' : 'RETRY'
                })
                .eq('id', rj.id);
            }
          } catch (err: any) {
            await supabase
              .from('retention_deletion_jobs')
              .update({
                attempt_count: rj.attempt_count + 1,
                last_attempt_at: new Date().toISOString(),
                last_error: err.message
              })
              .eq('id', rj.id);
          }
        }
      }
    } catch {}

    // 2. Process durable fallback file if items exist
    if (fs.existsSync(DURABLE_RETRY_FALLBACK)) {
      try {
        const items: RetentionRetryItem[] = JSON.parse(fs.readFileSync(DURABLE_RETRY_FALLBACK, 'utf-8'));
        const now = Date.now();
        const activeQueue: RetentionRetryItem[] = [];

        for (const item of items) {
          if (item.status !== 'RETRY' || item.attemptCount >= MAX_RETRY_ATTEMPTS) {
            continue;
          }

          if (new Date(item.nextAttemptAt).getTime() > now) {
            activeQueue.push(item);
            continue;
          }

          telemetry.retrying++;
          try {
            const { deleted, errors } = item.versionId
              ? await this.storage.deleteObjectVersions([{ key: item.objectKey, versionId: item.versionId }])
              : await this.storage.deleteObjects([item.objectKey], { versionAware: true });

            if (errors.length === 0 || deleted.includes(item.objectKey)) {
              telemetry.deleted++;
              telemetry.keysRemoved.push(item.objectKey);
            } else {
              item.attemptCount++;
              item.lastAttemptAt = new Date().toISOString();
              item.lastError = errors.join('; ');
              const delayMs = Math.min(5 * 60 * 1000 * Math.pow(3, item.attemptCount - 1), 60 * 60 * 1000);
              item.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
              if (item.attemptCount < MAX_RETRY_ATTEMPTS) {
                activeQueue.push(item);
              }
            }
          } catch (err: any) {
            item.attemptCount++;
            item.lastError = err.message;
            if (item.attemptCount < MAX_RETRY_ATTEMPTS) activeQueue.push(item);
          }
        }

        fs.writeFileSync(DURABLE_RETRY_FALLBACK, JSON.stringify(activeQueue, null, 2));
      } catch {}
    }
  }

  // ─── 2. Canonical Authority & Reference Resolution ──────────────────────────

  /**
   * Resolves all active jobs and claimed content hashes across canonical Supabase authority
   * and supporting evidence (Firebase and local worker workspaces).
   * Invariant: Active in ANY authority -> PROTECT.
   */
  private async resolveActiveWorkloads(supabase: SupabaseClient): Promise<{
    activeJobIds: Set<string>;
    activeSourceHashes: Set<string>;
  }> {
    const activeJobIds = new Set<string>();
    const activeSourceHashes = new Set<string>();

    // 1. Canonical: Supabase active jobs
    try {
      const { data: activeJobs } = await supabase
        .from('jobs')
        .select('id, status, payload, metadata')
        .in('status', ['pending', 'processing', 'downloading', 'transcribing', 'detecting_clips', 'reframing', 'rendering']);

      if (activeJobs) {
        for (const j of activeJobs) {
          activeJobIds.add(j.id);
          const hash = j.payload?.contentHash || j.payload?.source_hash || j.metadata?.contentHash || j.metadata?.source_hash;
          if (hash) activeSourceHashes.add(String(hash).toLowerCase());
        }
      }
    } catch {}

    // 2. Supporting: Local worker workspaces
    const workspaceDirs = [
      path.resolve(process.cwd(), 'temp'),
      path.resolve(process.cwd(), 'temp', 'jobs'),
      path.resolve(process.cwd(), 'apps', 'api', 'temp'),
      path.resolve(process.cwd(), 'apps', 'api', 'temp', 'jobs'),
    ];

    for (const wd of workspaceDirs) {
      if (fs.existsSync(wd)) {
        try {
          const entries = fs.readdirSync(wd);
          for (const ent of entries) {
            const fullP = path.join(wd, ent);
            if (fs.statSync(fullP).isDirectory() && ent.length > 15) {
              activeJobIds.add(ent);
            }
          }
        } catch {}
      }
    }

    // 3. Supporting: Firebase active queue
    try {
      const queue = firebaseDb.readQueue();
      if (queue.jobs) {
        for (const [id, j] of Object.entries(queue.jobs)) {
          const job: any = j;
          if (!['completed', 'failed'].includes(job.status)) {
            activeJobIds.add(id);
            const hash = job.contentHash || job.sourceHash || job.metadata?.contentHash;
            if (hash) activeSourceHashes.add(String(hash).toLowerCase());
          }
        }
      }
    } catch {}

    return { activeJobIds, activeSourceHashes };
  }

  /**
   * Resolves all content hashes referenced by unexpired clips or active sessions.
   */
  private async resolveReferencedSourceHashes(
    supabase: SupabaseClient,
    activeSourceHashes: Set<string>
  ): Promise<Set<string>> {
    const referenced = new Set<string>(activeSourceHashes);

    // 1. Canonical: Supabase unexpired clips
    try {
      const nowIso = new Date().toISOString();
      const { data: clips } = await supabase
        .from('clips')
        .select('id, metadata, storage_path, expires_at')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      if (clips) {
        for (const c of clips) {
          const hash = c.metadata?.contentHash || c.metadata?.source_hash;
          if (hash) referenced.add(String(hash).toLowerCase());
          if (c.storage_path && c.storage_path.includes('sources/')) {
            const parts = c.storage_path.split('/');
            const idx = parts.indexOf('sources');
            if (idx !== -1 && parts[idx + 1]) referenced.add(parts[idx + 1].toLowerCase());
          }
        }
      }
    } catch {}

    // 2. Supporting: active_queue.json clips
    try {
      const queue = firebaseDb.readQueue();
      if (queue.clips) {
        for (const [_, c] of Object.entries(queue.clips)) {
          const clip: any = c;
          const hash = clip.metadata?.contentHash || clip.metadata?.source_hash || clip.source_hash;
          if (hash) referenced.add(String(hash).toLowerCase());
        }
      }
    } catch {}

    return referenced;
  }

  // ─── 3. Direct Storage Reconciliation: jobs/* ───────────────────────────────

  private async reconcileStorageJobs(
    telemetry: RetentionTelemetry,
    cutoffDate: Date,
    activeJobIds: Set<string>
  ): Promise<void> {
    try {
      const jobObjects = await this.storage.listCurrentObjects('jobs/');
      telemetry.objectsScanned += jobObjects.length;
      for (const o of jobObjects) telemetry.bytesScanned += o.size;

      if (jobObjects.length === 0) return;

      const jobGroups = new Map<string, StorageObjectMetadata[]>();
      for (const item of jobObjects) {
        const parts = item.key.split('/');
        if (parts.length >= 2 && parts[0] === 'jobs') {
          const jid = parts[1];
          if (!jobGroups.has(jid)) jobGroups.set(jid, []);
          jobGroups.get(jid)!.push(item);
        }
      }

      for (const [jobId, items] of jobGroups.entries()) {
        // Invariant: Active in ANY authority -> PROTECTED
        if (activeJobIds.has(jobId)) {
          this.recordProtection(telemetry, 'ACTIVE_JOB_REFERENCE', items.length);
          continue;
        }

        // Age determination hierarchy: newest artifact timestamp vs cutoff
        const newestTimestamp = Math.max(...items.map(i => i.lastModified.getTime()));
        if (newestTimestamp > cutoffDate.getTime()) {
          this.recordProtection(telemetry, 'FRESH_ARTIFACT_AGE_POLICY', items.length);
          continue;
        }

        // TOCTOU Race Condition Mitigation: Re-verify canonical authority right before destructive delete
        const isJobConcurrentlyActive = await this.verifyJobActiveImmediate(jobId);
        if (isJobConcurrentlyActive) {
          this.recordProtection(telemetry, 'CONCURRENT_ACTIVATION_PREVENTED', items.length);
          console.warn(`[Retention]: ⚠️ TOCTOU race prevented: Job ${jobId} was activated during sweep. Deletion aborted.`);
          continue;
        }

        // Stale orphaned job confirmed: transition to EXPIRING -> DELETE_REQUESTED
        telemetry.eligible += items.length;
        const keys = items.map(i => i.key);
        console.log(`[Retention]: Purging stale orphaned job ${jobId} (${keys.length} files)`);

        const { deleted, errors } = await this.storage.deleteObjects(keys, { versionAware: true });
        telemetry.keysRemoved.push(...deleted);
        telemetry.deleted += deleted.length;

        if (errors.length > 0) {
          const supabase = this.db.getSupabase();
          for (const failedKey of keys.filter(k => !deleted.includes(k))) {
            await this.enqueueDurableRetry(supabase, 'job', failedKey, errors.join('; '), jobId);
          }
        }

        // Prune local temp directory if still present
        const localCandidates = [
          path.resolve(process.cwd(), 'temp', 'jobs', jobId),
          path.resolve(process.cwd(), 'apps', 'api', 'temp', 'jobs', jobId),
        ];
        for (const lc of localCandidates) {
          if (fs.existsSync(lc)) {
            try { fs.rmSync(lc, { recursive: true, force: true }); } catch {}
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Retention]: reconcileStorageJobs warning: ${err.message}`);
    }
  }

  // ─── 4. Direct Storage Reconciliation: sources/* ────────────────────────────

  private async reconcileStorageSources(
    telemetry: RetentionTelemetry,
    cutoffDate: Date,
    activeSourceHashes: Set<string>,
    referencedSourceHashes: Set<string>
  ): Promise<void> {
    try {
      const sourceObjects = await this.storage.listCurrentObjects('sources/');
      telemetry.objectsScanned += sourceObjects.length;
      for (const o of sourceObjects) telemetry.bytesScanned += o.size;

      if (sourceObjects.length === 0) return;

      const sourceGroups = new Map<string, StorageObjectMetadata[]>();
      for (const item of sourceObjects) {
        const parts = item.key.split('/');
        if (parts.length >= 2 && parts[0] === 'sources') {
          const hash = parts[1].toLowerCase();
          if (!sourceGroups.has(hash)) sourceGroups.set(hash, []);
          sourceGroups.get(hash)!.push(item);
        }
      }

      for (const [contentHash, items] of sourceGroups.entries()) {
        // Reference Protection Check
        if (activeSourceHashes.has(contentHash)) {
          this.recordProtection(telemetry, 'ACTIVE_SOURCE_REFERENCE', items.length);
          continue;
        }

        if (referencedSourceHashes.has(contentHash)) {
          this.recordProtection(telemetry, 'UNEXPIRED_CLIP_REFERENCE', items.length);
          continue;
        }

        // Age Source Hierarchy:
        // 1. Manifest timestamp if present
        // 2. S3 LastModified timestamp
        // 3. Fallback: Unknown -> PROTECT
        const manifestItem = items.find(i => i.key.endsWith('/manifest.json'));
        let effectiveTimestamp: number | null = null;

        if (manifestItem) {
          effectiveTimestamp = manifestItem.lastModified.getTime();
        } else {
          // Unmanifested artifact (e.g. 214f...): explicit orphan classification
          effectiveTimestamp = Math.max(...items.map(i => i.lastModified.getTime()));
        }

        if (effectiveTimestamp === null || isNaN(effectiveTimestamp)) {
          telemetry.unknown += items.length;
          this.recordProtection(telemetry, 'INCOMPLETE_IDENTITY_UNKNOWN', items.length);
          continue;
        }

        if (effectiveTimestamp > cutoffDate.getTime()) {
          this.recordProtection(telemetry, 'FRESH_ARTIFACT_AGE_POLICY', items.length);
          continue;
        }

        // TOCTOU Race Condition Mitigation: Re-verify canonical authority right before destructive delete
        const isSourceConcurrentlyReferenced = await this.verifySourceReferencedImmediate(contentHash);
        if (isSourceConcurrentlyReferenced) {
          this.recordProtection(telemetry, 'CONCURRENT_ACTIVATION_PREVENTED', items.length);
          console.warn(`[Retention]: ⚠️ TOCTOU race prevented: Source ${contentHash.substring(0, 12)} became referenced during sweep. Deletion aborted.`);
          continue;
        }

        // ALL 4 CONDITIONS SATISFIED -> EXPIRING -> DELETE_REQUESTED
        telemetry.eligible += items.length;
        const keys = items.map(i => i.key);
        console.log(`[Retention]: Purging unreferenced source ${contentHash.substring(0, 12)}... (${keys.length} items, refcount=0)`);

        const { deleted, errors } = await this.storage.deleteObjects(keys, { versionAware: true });
        telemetry.keysRemoved.push(...deleted);
        telemetry.deleted += deleted.length;

        if (errors.length > 0) {
          const supabase = this.db.getSupabase();
          for (const failedKey of keys.filter(k => !deleted.includes(k))) {
            await this.enqueueDurableRetry(supabase, 'source', failedKey, errors.join('; '));
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Retention]: reconcileStorageSources warning: ${err.message}`);
    }
  }

  public async verifyJobActiveImmediate(jobId: string): Promise<boolean> {
    try {
      const localCandidates = [
        path.resolve(process.cwd(), 'temp', jobId),
        path.resolve(process.cwd(), 'apps', 'api', 'temp', jobId),
        path.resolve(process.cwd(), 'temp', 'jobs', jobId),
        path.resolve(process.cwd(), 'apps', 'api', 'temp', 'jobs', jobId),
      ];
      for (const lc of localCandidates) {
        if (fs.existsSync(lc)) return true;
      }

      const supabase = this.db.getSupabase();
      const { data: job } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('id', jobId)
        .maybeSingle();

      if (job && !['completed', 'failed', 'cancelled'].includes(job.status)) {
        return true;
      }
    } catch {}
    return false;
  }

  public async verifySourceReferencedImmediate(contentHash: string): Promise<boolean> {
    try {
      const hashLower = contentHash.toLowerCase();
      const supabase = this.db.getSupabase();
      const nowIso = new Date().toISOString();

      const { data: activeJobs } = await supabase
        .from('jobs')
        .select('id, status, payload, metadata')
        .in('status', ['pending', 'processing', 'downloading', 'transcribing', 'detecting_clips', 'reframing', 'rendering'])
        .limit(20);

      if (activeJobs && activeJobs.some(j => {
        const h = j.payload?.contentHash || j.payload?.source_hash || j.metadata?.contentHash || j.metadata?.source_hash;
        return h && String(h).toLowerCase() === hashLower;
      })) {
        return true;
      }

      const { count } = await supabase
        .from('clips')
        .select('id', { count: 'exact', head: true })
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .filter('metadata->>source_hash', 'eq', hashLower);

      if (count && count > 0) return true;
    } catch {}
    return false;
  }

  // ─── 5. Direct Storage Reconciliation: test_* ───────────────────────────────

  private async reconcileTestArtifacts(telemetry: RetentionTelemetry, cutoffDate: Date): Promise<void> {
    for (const testPrefix of ['test_streams/', 'test_verification/'] as const) {
      try {
        const objects = await this.storage.listCurrentObjects(testPrefix);
        telemetry.objectsScanned += objects.length;
        for (const o of objects) telemetry.bytesScanned += o.size;

        const expired = objects.filter(o => o.lastModified.getTime() <= cutoffDate.getTime());
        const fresh = objects.filter(o => o.lastModified.getTime() > cutoffDate.getTime());

        if (fresh.length > 0) {
          this.recordProtection(telemetry, 'FRESH_ARTIFACT_AGE_POLICY', fresh.length);
        }

        if (expired.length > 0) {
          telemetry.eligible += expired.length;
          const keys = expired.map(o => o.key);
          const { deleted } = await this.storage.deleteObjects(keys, { versionAware: true });
          telemetry.keysRemoved.push(...deleted);
          telemetry.deleted += deleted.length;
        }
      } catch {}
    }
  }

  // ─── 6. Database Records Expiration ─────────────────────────────────────────

  private async expireSupabaseClips(
    supabase: SupabaseClient,
    nowIso: string,
    cutoffIso: string,
    telemetry: RetentionTelemetry
  ): Promise<void> {
    try {
      const { data: expiredClips, error } = await supabase
        .from('clips')
        .select('id, storage_path, thumbnail_url, thumbnail_storage_path, metadata, status, created_at, expires_at')
        .or(`expires_at.lt.${nowIso},and(expires_at.is.null,created_at.lt.${cutoffIso})`)
        .limit(BATCH_SIZE);

      if (error || !expiredClips || expiredClips.length === 0) return;

      telemetry.objectsScanned += expiredClips.length;
      telemetry.eligible += expiredClips.length;

      for (const clip of expiredClips) {
        await this.deleteClip(supabase, clip, telemetry);
      }
    } catch (err: any) {
      console.warn(`[Retention]: Supabase clips expiration error: ${err.message}`);
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

    // State machine: mark as EXPIRING in DB
    try {
      await supabase.from('clips').update({ status: 'expiring' }).eq('id', clipId);
    } catch {}

    // Physical storage deletion
    if (keysToDelete.length > 0) {
      try {
        const { deleted, errors } = await this.storage.deleteObjects(keysToDelete, { versionAware: true });
        telemetry.keysRemoved.push(...deleted);
        if (errors.length > 0) {
          for (const fk of keysToDelete.filter(k => !deleted.includes(k))) {
            await this.enqueueDurableRetry(supabase, 'clip', fk, errors.join('; '), clipId);
          }
        }
      } catch (err: any) {
        for (const fk of keysToDelete) {
          await this.enqueueDurableRetry(supabase, 'clip', fk, err.message, clipId);
        }
      }
    }

    // Database row deletion finalized second
    const { error: dbError } = await supabase.from('clips').delete().eq('id', clipId);
    if (!dbError) {
      telemetry.deleted++;
      return true;
    }

    return false;
  }

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
        telemetry.objectsScanned++;
        const clip: any = c;
        const expiresTime = clip.expires_at || clip.expiresAt ? new Date(clip.expires_at || clip.expiresAt).getTime() : null;
        const createdTime = clip.createdAt || clip.created_at ? new Date(clip.createdAt || clip.created_at).getTime() : null;

        const isExpired = (expiresTime !== null && expiresTime <= nowTime) ||
                          (createdTime !== null && createdTime <= cutoffTime);

        if (isExpired) {
          expiredClipIds.push(id);
          telemetry.eligible++;

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

      if (allKeysToDelete.length > 0) {
        const { deleted } = await this.storage.deleteObjects(allKeysToDelete, { versionAware: true });
        telemetry.keysRemoved.push(...deleted);
      }

      for (const id of expiredClipIds) {
        delete queue.clips[id];
        telemetry.deleted++;
      }

      if (Array.isArray(queue.render_jobs)) {
        queue.render_jobs = queue.render_jobs.filter((rj: any) => !expiredClipIds.includes(rj.clip_id));
      }

      firebaseDb.writeQueue(queue);
    } catch {}
  }

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

      if (error || !expiredVoiceovers || expiredVoiceovers.length === 0) return;

      telemetry.objectsScanned += expiredVoiceovers.length;
      telemetry.eligible += expiredVoiceovers.length;

      for (const vo of expiredVoiceovers) {
        const keys: string[] = [];
        if (vo.audio_path) keys.push(vo.audio_path);
        if (vo.video_path) keys.push(vo.video_path);

        if (keys.length > 0) {
          const { deleted } = await this.storage.deleteObjects(keys, { versionAware: true });
          telemetry.keysRemoved.push(...deleted);
        }

        try { await supabase.from('voiceover_feedback').delete().eq('voiceover_id', vo.id); } catch {}
        const { error: dbErr } = await supabase.from('voiceover_clips').delete().eq('id', vo.id);
        if (!dbErr) telemetry.deleted++;
      }
    } catch {}
  }
}

export const retentionService = RetentionService.getInstance();
