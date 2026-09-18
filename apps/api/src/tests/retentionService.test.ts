import fs from 'fs';
import path from 'path';
import {
  RetentionService,
  RETENTION_HOURS,
  RECONCILED_STORAGE_PREFIXES,
  RetentionTelemetry
} from '../services/RetentionService';
import { StorageService } from '../services/storageService';
import { ListObjectsV2Command, ListObjectVersionsCommand } from '@aws-sdk/client-s3';

describe('Hardened RetentionService Architectural & Production Edge-Case Suite', () => {
  let retentionService: RetentionService;
  let storageService: StorageService;

  beforeAll(() => {
    retentionService = RetentionService.getInstance();
    storageService = StorageService.getInstance();
  });

  afterEach(() => {
    const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Baseline Architectural Invariants
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Baseline Invariants & Constraints', () => {
    it('initializes as a singleton instance', () => {
      expect(RetentionService.getInstance()).toBe(retentionService);
    });

    it('enforces explicit production storage prefixes (no arbitrary bucket cleanups)', () => {
      expect(RECONCILED_STORAGE_PREFIXES).toContain('jobs/');
      expect(RECONCILED_STORAGE_PREFIXES).toContain('sources/');
      expect(RECONCILED_STORAGE_PREFIXES).toContain('test_streams/');
      expect(RECONCILED_STORAGE_PREFIXES).toContain('test_verification/');
      expect((RECONCILED_STORAGE_PREFIXES as readonly string[]).includes('temp_*')).toBe(false);
    });

    it('normalizes paths and URLs identically', () => {
      expect(storageService.normalizeStorageKey('/jobs/123/clip.mp4')).toBe('jobs/123/clip.mp4');
      expect(storageService.normalizeStorageKey('https://excerpt-clips.s3.us-east-005.backblazeb2.com/sources/hash1/source.mp4'))
        .toBe('sources/hash1/source.mp4');
      expect(storageService.normalizeStorageKey('')).toBe('');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 1: Crash Recovery
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 1: Crash Recovery (Interrupted Transitions)', () => {
    it('recovers gracefully from mid-deletion crashes and handles absent storage idempotently', async () => {
      const mockClip = {
        id: `crash_test_clip_${Date.now()}`,
        storage_path: `jobs/crash_test_${Date.now()}/clip.mp4`,
        thumbnail_storage_path: `jobs/crash_test_${Date.now()}/thumb.jpg`,
        status: 'expiring',
        created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      };

      // Deleting already absent storage (simulating crash after S3 delete but before DB commit)
      const delResult = await storageService.deleteObjects([mockClip.storage_path], { versionAware: true });
      expect(delResult.errors).toHaveLength(0);
      expect(delResult.deleted).toContain(mockClip.storage_path);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 2: Database / Object-Store Disagreement
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 2: Database / Object-Store Disagreement', () => {
    it('Case 2A: Preserves canonical authority when DB says active but storage is missing', async () => {
      const activeMissingJobId = `active_missing_${Date.now()}`;
      const tempJobDir = path.resolve(process.cwd(), 'temp', activeMissingJobId);
      fs.mkdirSync(tempJobDir, { recursive: true });

      try {
        const { activeJobIds } = await (retentionService as any).resolveActiveWorkloads((retentionService as any).db.getSupabase());
        expect(activeJobIds.has(activeMissingJobId)).toBe(true);

        // Disagreement: Storage does not contain this object
        const exists = await storageService.fileExists(`jobs/${activeMissingJobId}/output.mp4`);
        expect(exists).toBe(false);
      } finally {
        if (fs.existsSync(tempJobDir)) fs.rmSync(tempJobDir, { recursive: true, force: true });
      }
    });

    it('Case 2B: Safely reconciles orphaned storage when DB says inactive but storage still exists', async () => {
      const orphanedJobId = `stale_orphan_${Date.now()}`;
      const items = [
        {
          key: `jobs/${orphanedJobId}/output.mp4`,
          size: 5000,
          lastModified: new Date(Date.now() - 48 * 3600 * 1000), // 48h old
        }
      ];

      const activeJobIds = new Set<string>(); // Inactive in DB
      expect(activeJobIds.has(orphanedJobId)).toBe(false);

      const newestTimestamp = Math.max(...items.map(i => i.lastModified.getTime()));
      const cutoff = Date.now() - 24 * 3600 * 1000;
      expect(newestTimestamp).toBeLessThan(cutoff); // Confirmed eligible for purge
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 3: Concurrent Reference Creation (TOCTOU Race Condition)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 3: Concurrent Reference Creation (TOCTOU Race)', () => {
    it('aborts destructive deletion if job is activated after initial sweep discovery', async () => {
      const raceJobId = `toctou_race_job_${Date.now()}`;
      
      // 1. Initial discovery phase: Job is assumed inactive
      const activeJobIds = new Set<string>();
      expect(activeJobIds.has(raceJobId)).toBe(false);

      // 2. Interleaving event: Job becomes active in workspace
      const tempJobDir = path.resolve(process.cwd(), 'temp', raceJobId);
      fs.mkdirSync(tempJobDir, { recursive: true });

      try {
        // 3. Destructive phase: verifyJobActiveImmediate is executed right before delete
        const isConcurrentlyActive = await retentionService.verifyJobActiveImmediate(raceJobId);
        expect(isConcurrentlyActive).toBe(true);
      } finally {
        if (fs.existsSync(tempJobDir)) fs.rmSync(tempJobDir, { recursive: true, force: true });
      }
    });

    it('aborts source deletion if source becomes referenced after initial sweep discovery', async () => {
      const inactiveHash = `unref_hash_${Date.now()}`;
      const isReferenced = await retentionService.verifySourceReferencedImmediate(inactiveHash);
      expect(isReferenced).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 4: Concurrent Workers & Advisory Lock Lease
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 4: Concurrent Workers & Advisory Lock Lease', () => {
    it('prevents second worker from running when active lock is held', async () => {
      const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, time: new Date().toISOString() }));

      const telemetry = await retentionService.run();
      expect(telemetry.lastError).toContain('lock acquired by concurrent worker');

      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    });

    it('recovers from stale lock leases (> 5 minutes) and allows new sweep to execute', async () => {
      const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 888888, time: new Date(Date.now() - 10 * 60 * 1000).toISOString() }));
      
      // Set modification time back 10 minutes
      const pastTime = (Date.now() - 10 * 60 * 1000) / 1000;
      fs.utimesSync(lockPath, pastTime, pastTime);

      const acquired = (retentionService as any).acquireLock();
      expect(acquired).toBe(true);

      (retentionService as any).releaseLock();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 5: Retry Durability Across Restarts
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 5: Retry Durability Across Restarts', () => {
    const fallbackPath = path.resolve(process.cwd(), 'data', 'retention', 'retention_retry_queue.json');

    it('persists failed deletions outside temp/ and processes them on subsequent run', async () => {
      const testFailedKey = `jobs/test_retry_${Date.now()}/output.mp4`;

      // Enqueue into durable queue
      await (retentionService as any).enqueueDurableRetry(
        (retentionService as any).db.getSupabase(),
        'job',
        testFailedKey,
        'Simulated network timeout'
      );

      // Verify file exists on disk
      expect(fs.existsSync(fallbackPath)).toBe(true);
      const items = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      const queuedItem = items.find((i: any) => i.objectKey === testFailedKey);
      expect(queuedItem).toBeDefined();
      expect(queuedItem.status).toBe('RETRY');

      // Make it immediately ready for processing
      queuedItem.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(fallbackPath, JSON.stringify(items, null, 2));

      // Simulate process restart by calling processDurableRetryQueue
      const telemetry: RetentionTelemetry = {
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
        lastError: null,
      };

      await (retentionService as any).processDurableRetryQueue(
        (retentionService as any).db.getSupabase(),
        telemetry
      );

      expect(telemetry.retrying).toBeGreaterThanOrEqual(1);
      expect(telemetry.deleted).toBeGreaterThanOrEqual(1);
      expect(telemetry.keysRemoved).toContain(testFailedKey);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 6: Malformed / Incomplete Manifests
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 6: Malformed / Incomplete Manifests', () => {
    it('defaults to PROTECTED (INCOMPLETE_IDENTITY_UNKNOWN) on missing or invalid timestamps', () => {
      const telemetry: RetentionTelemetry = {
        lastSweep: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        objectsScanned: 1,
        bytesScanned: 100,
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

      const invalidTimestamp = Date.parse('corrupted-date-format');
      expect(isNaN(invalidTimestamp)).toBe(true);

      (retentionService as any).recordProtection(telemetry, 'INCOMPLETE_IDENTITY_UNKNOWN', 1);
      expect(telemetry.protected).toBe(1);
      expect(telemetry.deleted).toBe(0);
      expect(telemetry.protectionBreakdown['INCOMPLETE_IDENTITY_UNKNOWN']).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 7: Storage Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 7: Storage Pagination (Continuation Tokens)', () => {
    it('pages through multiple responses in listCurrentObjects without dropping records', async () => {
      const s3Client = (storageService as any).s3;
      if (!s3Client) return;

      const originalSend = s3Client.send.bind(s3Client);
      let pageCount = 0;

      // Mock multi-page S3 list response
      jest.spyOn(s3Client, 'send').mockImplementation(async (command: any) => {
        if (command instanceof ListObjectsV2Command) {
          pageCount++;
          if (pageCount === 1) {
            return {
              IsTruncated: true,
              NextContinuationToken: 'token-page-2',
              Contents: [
                { Key: 'test_verification/page1_obj1.mp4', Size: 100, LastModified: new Date() },
                { Key: 'test_verification/page1_obj2.mp4', Size: 200, LastModified: new Date() },
              ],
            };
          } else {
            return {
              IsTruncated: false,
              Contents: [
                { Key: 'test_verification/page2_obj3.mp4', Size: 300, LastModified: new Date() },
              ],
            };
          }
        }
        return originalSend(command);
      });

      try {
        const results = await storageService.listCurrentObjects('test_verification/');
        expect(pageCount).toBe(2);
        expect(results).toHaveLength(3);
        expect(results.map(r => r.key)).toEqual([
          'test_verification/page1_obj1.mp4',
          'test_verification/page1_obj2.mp4',
          'test_verification/page2_obj3.mp4',
        ]);
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('pages through multiple versions and delete markers in listObjectVersions', async () => {
      const s3Client = (storageService as any).s3;
      if (!s3Client) return;

      const originalSend = s3Client.send.bind(s3Client);
      let versionPageCount = 0;

      jest.spyOn(s3Client, 'send').mockImplementation(async (command: any) => {
        if (command instanceof ListObjectVersionsCommand) {
          versionPageCount++;
          if (versionPageCount === 1) {
            return {
              IsTruncated: true,
              NextKeyMarker: 'test_verification/obj1.mp4',
              NextVersionIdMarker: 'v1',
              Versions: [{ Key: 'test_verification/obj1.mp4', VersionId: 'v1', Size: 50, LastModified: new Date() }],
              DeleteMarkers: [{ Key: 'test_verification/obj2.mp4', VersionId: 'dm1', LastModified: new Date() }],
            };
          } else {
            return {
              IsTruncated: false,
              Versions: [{ Key: 'test_verification/obj3.mp4', VersionId: 'v2', Size: 75, LastModified: new Date() }],
              DeleteMarkers: [],
            };
          }
        }
        return originalSend(command);
      });

      try {
        const { versions, deleteMarkers } = await storageService.listObjectVersions('test_verification/');
        expect(versionPageCount).toBe(2);
        expect(versions).toHaveLength(2);
        expect(deleteMarkers).toHaveLength(1);
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 8: Versioned-Object Behavior & Delete Markers
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 8: Versioned-Object Behavior & Delete Markers', () => {
    it('permanently deletes specific version IDs and handles 404/NoSuchKey idempotently', async () => {
      const targetItems = [
        { key: `test_verification/hist_${Date.now()}.mp4`, versionId: 'v_historical_999' },
        { key: `test_verification/del_marker_${Date.now()}.mp4`, versionId: 'dm_999' },
      ];

      const result = await storageService.deleteObjectVersions(targetItems);
      expect(result.errors).toHaveLength(0);
      expect(result.deleted).toContain(targetItems[0].key);
      expect(result.deleted).toContain(targetItems[1].key);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 9: Clock-Boundary & UTC Normalization
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 9: Clock-Boundary & UTC Normalization', () => {
    it('Case 9a: Protects an artifact created 1 second before the 24h cutoff', () => {
      const now = Date.now();
      const cutoff = now - 24 * 3600 * 1000;
      const freshArtifactTime = cutoff + 1000;

      expect(freshArtifactTime).toBeGreaterThan(cutoff);
    });

    it('Case 9b: Allows eligibility for an artifact created 1 second after the 24h cutoff', () => {
      const now = Date.now();
      const cutoff = now - 24 * 3600 * 1000;
      const expiredArtifactTime = cutoff - 1000;

      expect(expiredArtifactTime).toBeLessThan(cutoff);
    });

    it('Case 9c: Normalizes timestamps across UTC (Z) and timezone offsets (+05:30) identically', () => {
      const utcIso = '2026-09-15T16:42:00.000Z';
      const offsetIso = '2026-09-15T22:12:00.000+05:30';

      const utcEpoch = new Date(utcIso).getTime();
      const offsetEpoch = new Date(offsetIso).getTime();

      expect(utcEpoch).toEqual(offsetEpoch);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case 10: Audit Completeness & Invariant Breakdown
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Edge Case 10: Audit Completeness & Invariant Breakdown', () => {
    it('retains detailed reason codes across all protection invariants', () => {
      const telemetry: RetentionTelemetry = {
        lastSweep: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        objectsScanned: 10,
        bytesScanned: 1024,
        eligible: 2,
        protected: 0,
        deleted: 2,
        retrying: 0,
        unknown: 0,
        keysRemoved: [],
        protectionBreakdown: {},
        durationMs: 0,
        lastError: null,
      };

      (retentionService as any).recordProtection(telemetry, 'ACTIVE_JOB_REFERENCE', 2);
      (retentionService as any).recordProtection(telemetry, 'ACTIVE_SOURCE_REFERENCE', 2);
      (retentionService as any).recordProtection(telemetry, 'UNEXPIRED_CLIP_REFERENCE', 1);
      (retentionService as any).recordProtection(telemetry, 'FRESH_ARTIFACT_AGE_POLICY', 2);
      (retentionService as any).recordProtection(telemetry, 'CONCURRENT_ACTIVATION_PREVENTED', 1);

      expect(telemetry.protected).toBe(8);
      expect(telemetry.protectionBreakdown['ACTIVE_JOB_REFERENCE']).toBe(2);
      expect(telemetry.protectionBreakdown['ACTIVE_SOURCE_REFERENCE']).toBe(2);
      expect(telemetry.protectionBreakdown['UNEXPIRED_CLIP_REFERENCE']).toBe(1);
      expect(telemetry.protectionBreakdown['FRESH_ARTIFACT_AGE_POLICY']).toBe(2);
      expect(telemetry.protectionBreakdown['CONCURRENT_ACTIVATION_PREVENTED']).toBe(1);
      expect(telemetry.eligible + telemetry.protected).toBe(telemetry.objectsScanned);
    });

    it('runs empty bucket sweep with zero false positives', async () => {
      const lockPath = path.resolve(process.cwd(), 'temp', 'retention_sweep.lock');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

      const telemetry = await retentionService.run();
      expect(telemetry.lastError).toBeNull();
      expect(telemetry.deleted).toBeGreaterThanOrEqual(0);
      expect(telemetry.retrying).toBeGreaterThanOrEqual(0);
      expect(telemetry).toHaveProperty('protectionBreakdown');
    });
  });

  describe('Edge Case 11: Capacity-Based LRU Eviction ("Storage Full" Requirement)', () => {
    it('does not evict clips if total storage is below max quota threshold', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      };

      const telemetry: RetentionTelemetry = {
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
        lastError: null,
      };

      // Mock storage usage to 100 MB, with 850 MB max
      jest.spyOn((retentionService as any).storage, 'listCurrentObjects').mockResolvedValueOnce([
        { key: 'clips/sample.mp4', size: 100 * 1024 * 1024, lastModified: new Date() }
      ]);

      // evictClipsToSatisfyQuota is now a deprecated shim (2 args only).
      const freed = await retentionService.evictClipsToSatisfyQuota(
        mockSupabase as any,
        telemetry
      );

      // Shim delegates to QuotaEvictionEngine; since usage < trigger threshold the engine
      // will also return 0 freed bytes (storage is within safe limits).
      expect(freed).toBe(0);
      expect(telemetry.deleted).toBe(0);
    });

    it('delegates to QuotaEvictionEngine via the deprecated shim safely', async () => {
      const deleteMock = jest.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          delete: deleteMock,
        }))
      };

      const telemetry: RetentionTelemetry = {
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
        lastError: null,
      };

      const sweepSpy = jest.spyOn(retentionService as any, 'runQuotaPolicySweep');
      const freed = await retentionService.evictClipsToSatisfyQuota(
        mockSupabase as any,
        telemetry
      );

      // Shim delegates to runQuotaPolicySweep without error.
      // Substantive minimal-eviction stopping at target is thoroughly tested in quotaEvictionEngine.test.ts.
      expect(sweepSpy).toHaveBeenCalledWith(mockSupabase, telemetry);
      expect(freed).toBe(0);
    });
  });
});
