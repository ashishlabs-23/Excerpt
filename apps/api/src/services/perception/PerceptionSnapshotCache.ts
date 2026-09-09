import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { PerceptionSnapshot } from '@excerpt/clipping-core';
import { DatabaseService } from '../supabaseService';
import { unifiedPerceptionEngine } from './UnifiedPerceptionEngine';

interface BuildLockInfo {
  workerId: string;
  expiresAt: number;
  acquiredAt: number;
}

export class PerceptionSnapshotCache {
  private static instance: PerceptionSnapshotCache;
  private memoryCache = new Map<string, { snapshot: PerceptionSnapshot; timestamp: number }>();
  private readonly maxMemoryEntries = 20;
  private db = new DatabaseService();
  private activeLocalBuilds = new Map<string, Promise<PerceptionSnapshot>>();

  private constructor() {}

  public static getInstance(): PerceptionSnapshotCache {
    if (!PerceptionSnapshotCache.instance) {
      PerceptionSnapshotCache.instance = new PerceptionSnapshotCache();
    }
    return PerceptionSnapshotCache.instance;
  }

  private getDiskCachePath(cacheKey: string): string {
    const cacheDir = path.join(process.cwd(), 'temp', 'cache', cacheKey);
    return path.join(cacheDir, 'perception_snapshot.json');
  }

  private getLockFilePath(cacheKey: string): string {
    const cacheDir = path.join(process.cwd(), 'temp', 'cache', cacheKey);
    return path.join(cacheDir, 'perception_snapshot.lock');
  }

  /**
   * Attempts to acquire an atomic build lease for a given cacheKey.
   * Prevents concurrent cache stampedes across workers and threads.
   * TTL default: 90 seconds.
   */
  public async acquireBuildLease(
    cacheKey: string,
    workerId: string = `worker-${process.pid}-${os.hostname()}`,
    ttlMs: number = 90_000
  ): Promise<boolean> {
    const lockPath = this.getLockFilePath(cacheKey);
    const lockDir = path.dirname(lockPath);
    if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });

    const now = Date.now();
    const lockInfo: BuildLockInfo = {
      workerId,
      expiresAt: now + ttlMs,
      acquiredAt: now,
    };

    // If lock exists, check if expired
    if (fs.existsSync(lockPath)) {
      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const existing: BuildLockInfo = JSON.parse(raw);
        if (existing.expiresAt && existing.expiresAt > now) {
          // Lock is still active and valid
          return false;
        }
        console.warn(`[PerceptionCache]: Stale build lease expired for ${cacheKey.slice(0, 10)} (worker: ${existing.workerId}). Reclaiming.`);
      } catch {
        // Corrupt lock file, reclaim safely
      }
    }

    // Atomic acquisition via write
    try {
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), { flag: 'w' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases an acquired build lease.
   */
  public async releaseBuildLease(cacheKey: string, workerId?: string): Promise<void> {
    const lockPath = this.getLockFilePath(cacheKey);
    if (!fs.existsSync(lockPath)) return;

    try {
      if (workerId) {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const existing: BuildLockInfo = JSON.parse(raw);
        if (existing.workerId !== workerId) {
          return; // Owned by another worker
        }
      }
      fs.unlinkSync(lockPath);
    } catch {}
  }

  /**
   * Waits for a concurrently running perception build to complete.
   * Polling frequency: 400ms, timeout: max 120s.
   */
  public async waitForBuildCompletion(cacheKey: string, maxWaitMs: number = 120_000): Promise<PerceptionSnapshot | null> {
    const startTime = Date.now();
    const pollIntervalMs = 400;

    console.log(`[PerceptionCache]: ⏳ Waiting for concurrent perception build to complete on ${cacheKey.slice(0, 10)}...`);

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      // Check if snapshot has been published
      const snapshot = await this.get(cacheKey);
      if (snapshot) {
        console.log(`[PerceptionCache]: 🎯 Concurrent build completed! Received published snapshot for ${cacheKey.slice(0, 10)}`);
        return snapshot;
      }

      // Check if lock still exists
      const lockPath = this.getLockFilePath(cacheKey);
      if (!fs.existsSync(lockPath)) {
        // Lock released; check snapshot one last time
        const finalCheck = await this.get(cacheKey);
        if (finalCheck) return finalCheck;
        // Lock gone but no snapshot: builder failed or crashed
        console.warn(`[PerceptionCache]: Build lock released without published snapshot for ${cacheKey.slice(0, 10)}. Entering fallback.`);
        break;
      }
    }

    return null;
  }

  /**
   * Single-Flight orchestrator: ensures exactly ONE build executes across concurrent requests.
   * If cache hit -> returns snapshot immediately.
   * If cache miss -> elects 1 active builder, other callers wait and consume published snapshot.
   */
  public async getOrBuild(
    cacheKey: string,
    buildFn: () => Promise<PerceptionSnapshot>,
    workerId: string = `worker-${process.pid}-${os.hostname()}`
  ): Promise<PerceptionSnapshot> {
    // 1. Check existing cache
    const existing = await this.get(cacheKey);
    if (existing) {
      return existing;
    }

    // 2. Intra-process Promise deduplication
    const inFlight = this.activeLocalBuilds.get(cacheKey);
    if (inFlight) {
      console.log(`[PerceptionCache]: ⚡ Joining in-flight local perception build for ${cacheKey.slice(0, 10)}`);
      return inFlight;
    }

    // 3. Inter-process distributed lease acquisition
    const acquired = await this.acquireBuildLease(cacheKey, workerId);
    if (!acquired) {
      // Another worker is actively building this snapshot -> wait for publication
      const published = await this.waitForBuildCompletion(cacheKey);
      if (published) {
        return published;
      }
      // If wait timed out or builder crashed, retry acquiring lease once
      const retryAcquired = await this.acquireBuildLease(cacheKey, workerId);
      if (!retryAcquired) {
        // Fallback: build locally
        console.warn(`[PerceptionCache]: Lease retry failed for ${cacheKey.slice(0, 10)}. Building locally as fallback.`);
        return buildFn();
      }
    }

    // 4. We are the elected builder -> Execute build with active heartbeat and publish
    console.log(`[PerceptionCache]: 👑 Elected active builder for ${cacheKey.slice(0, 10)} (worker: ${workerId})`);
    const buildPromise = (async () => {
      // Heartbeat: renew lease every 30s with fresh 90s TTL to prevent premature expiration on long videos
      const heartbeatInterval = setInterval(() => {
        try {
          const lockPath = this.getLockFilePath(cacheKey);
          if (fs.existsSync(lockPath)) {
            const raw = fs.readFileSync(lockPath, 'utf8');
            const existing: BuildLockInfo = JSON.parse(raw);
            if (existing.workerId === workerId) {
              existing.expiresAt = Date.now() + 90_000;
              fs.writeFileSync(lockPath, JSON.stringify(existing, null, 2), 'utf8');
            }
          }
        } catch {}
      }, 30_000);

      try {
        const snapshot = await buildFn();
        await this.set(cacheKey, snapshot);
        return snapshot;
      } finally {
        clearInterval(heartbeatInterval);
        await this.releaseBuildLease(cacheKey, workerId);
        this.activeLocalBuilds.delete(cacheKey);
      }
    })();

    this.activeLocalBuilds.set(cacheKey, buildPromise);
    return buildPromise;
  }

  /**
   * Retrieves a cached PerceptionSnapshot.
   * Checks Memory -> L1 Disk -> DB Metadata Index.
   * Performs strict validation against the current extractor manifest & checksum.
   */
  public async get(cacheKey: string): Promise<PerceptionSnapshot | null> {
    if (!cacheKey) return null;

    // 1. Memory Cache
    const inMem = this.memoryCache.get(cacheKey);
    if (inMem && this.isSnapshotValid(inMem.snapshot, cacheKey)) {
      console.log(`[PerceptionCache]: ⚡ Memory Cache HIT for ${cacheKey.slice(0, 10)}`);
      return inMem.snapshot;
    }

    // 2. L1 Disk Cache
    const diskPath = this.getDiskCachePath(cacheKey);
    if (fs.existsSync(diskPath)) {
      try {
        const raw = fs.readFileSync(diskPath, 'utf8');
        const parsed: PerceptionSnapshot = JSON.parse(raw);
        if (this.isSnapshotValid(parsed, cacheKey)) {
          console.log(`[PerceptionCache]: 🗄️ L1 Disk Cache HIT for ${cacheKey.slice(0, 10)}`);
          this.setMemory(cacheKey, parsed);
          return parsed;
        } else {
          console.log(`[PerceptionCache]: Invalid or corrupt snapshot at ${cacheKey.slice(0, 10)}. Invalidating.`);
          try { fs.unlinkSync(diskPath); } catch {}
        }
      } catch (err: any) {
        console.warn(`[PerceptionCache]: Failed to read disk cache (${err.message}). Invalidating.`);
        try { fs.unlinkSync(diskPath); } catch {}
      }
    }

    // 3. Database Metadata Index Check
    try {
      const { data, error } = await this.db.getSupabase()
        .from('video_analysis_cache')
        .select('raw_analysis')
        .eq('video_hash', cacheKey)
        .maybeSingle();

      if (!error && data?.raw_analysis?.perception_snapshot) {
        const dbSnapshot = data.raw_analysis.perception_snapshot as PerceptionSnapshot;
        if (this.isSnapshotValid(dbSnapshot, cacheKey)) {
          console.log(`[PerceptionCache]: ☁️ Database Cache HIT for ${cacheKey.slice(0, 10)}`);
          await this.set(cacheKey, dbSnapshot, false);
          return dbSnapshot;
        }
      }
    } catch {}

    return null;
  }

  /**
   * Persists a PerceptionSnapshot:
   * - L1 Local Disk (Atomic write via temp file)
   * - In-Memory Cache
   * - Database (lightweight manifest & index)
   */
  public async set(
    cacheKey: string,
    snapshot: PerceptionSnapshot,
    persistToDb = true
  ): Promise<void> {
    if (!cacheKey || !snapshot) return;

    // Attach checksum if not present
    if (!snapshot.checksum) {
      snapshot.checksum = unifiedPerceptionEngine.computeSnapshotChecksum(snapshot);
    }

    // 1. Memory
    this.setMemory(cacheKey, snapshot);

    // 2. L1 Disk (Atomic write via temp file)
    const diskPath = this.getDiskCachePath(cacheKey);
    const dir = path.dirname(diskPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tempFile = `${diskPath}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tempFile, diskPath);
      const fileSizeKb = (fs.statSync(diskPath).size / 1024).toFixed(1);
      console.log(`[PerceptionCache]: 💾 Persisted compact snapshot to disk (${fileSizeKb} KB) at ${diskPath}`);
    } catch (err: any) {
      console.warn(`[PerceptionCache]: Failed to write disk cache (${err.message})`);
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
    }

    // 3. Database: Lightweight index record
    if (persistToDb) {
      try {
        await this.db.getSupabase()
          .from('video_analysis_cache')
          .upsert({
            video_hash: cacheKey,
            pipeline_versions: {
              analysis_version: '3.1',
              ranking_version: '2.1',
              render_version: '1.7',
            },
            checksum: snapshot.checksum || snapshot.source.hash,
            raw_analysis: {
              perception_manifest: snapshot.extractors,
              source: snapshot.source,
              events_count: {
                audio: snapshot.audio?.events?.length ?? 0,
                scenes: snapshot.scenes?.events?.length ?? 0,
                speakers: snapshot.speakers?.tracks?.length ?? 0,
              },
              created_at: snapshot.createdAt,
            },
            created_at: new Date().toISOString(),
          }, { onConflict: 'video_hash' });
      } catch (dbErr: any) {
        console.warn(`[PerceptionCache]: Non-fatal database metadata persistence warning: ${dbErr.message}`);
      }
    }
  }

  private isSnapshotValid(snapshot: PerceptionSnapshot, cacheKey: string): boolean {
    if (!snapshot || snapshot.schemaVersion !== '2.0' || snapshot.cacheKey !== cacheKey) {
      return false;
    }

    // Integrity Checksum Validation (if present)
    if (snapshot.checksum) {
      const expectedChecksum = unifiedPerceptionEngine.computeSnapshotChecksum(snapshot);
      if (snapshot.checksum !== expectedChecksum) {
        console.warn(`[PerceptionCache]: ⚠️ Snapshot checksum mismatch! Detected corrupt snapshot artifact.`);
        return false;
      }
    }

    // Compare with current extractor manifest & config
    const currentManifest = unifiedPerceptionEngine.manifest;
    if (
      snapshot.extractors?.ffmpegVersion !== currentManifest.ffmpegVersion ||
      snapshot.extractors?.perceptionSchemaVersion !== currentManifest.perceptionSchemaVersion ||
      snapshot.extractors?.transcriptionModel !== currentManifest.transcriptionModel
    ) {
      return false;
    }

    return true;
  }

  private setMemory(cacheKey: string, snapshot: PerceptionSnapshot): void {
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(cacheKey, { snapshot, timestamp: Date.now() });
  }

  public invalidate(cacheKey: string): void {
    this.memoryCache.delete(cacheKey);
    const diskPath = this.getDiskCachePath(cacheKey);
    if (fs.existsSync(diskPath)) {
      try { fs.unlinkSync(diskPath); } catch {}
    }
    const lockPath = this.getLockFilePath(cacheKey);
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
}

export const perceptionSnapshotCache = PerceptionSnapshotCache.getInstance();
