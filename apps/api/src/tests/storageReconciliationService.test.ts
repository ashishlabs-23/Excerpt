// storageReconciliationService.test.ts
// Tests for StorageReconciliationService:
//   1. physical = manifest (zero drift, zero discrepancies)
//   2. physical > manifest (size drift — actual larger than DB)
//   3. physical < manifest (size drift — actual smaller than DB)
//   4. orphan storage object (object exists in storage, DB row missing)
//   5. ghost DB artifact (DB row marked available, object missing from storage)
//   6. pagination (multi-page storage listings consolidated cleanly)
//   7. missing metadata (missing storage_path or null/NaN bytes)
//   8. duplicate / key collision (multiple DB artifacts sharing same storage path)
//   9. non-destructive size calibration
//  10. non-destructive ghost reconciliation

import { StorageReconciliationService } from '../services/StorageReconciliationService';

function buildMockStorage(objects: Array<{ key: string; size: number; lastModified?: Date }>) {
  return {
    listCurrentObjects: jest.fn().mockResolvedValue(
      objects.map(o => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified ?? new Date('2026-09-01T00:00:00Z'),
      }))
    ),
  };
}

function buildMockSupabase(artifacts: any[]) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'clip_artifacts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation((col: string, val: string) => {
              if (col === 'state') {
                return Promise.resolve({ data: artifacts, error: null });
              }
              return {
                eq: jest.fn().mockResolvedValue({ data: artifacts, error: null }),
              };
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('StorageReconciliationService', () => {
  let reconciliationService: StorageReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auditInventory()', () => {
    it('reports 0 drift and 0 discrepancies when physical storage perfectly matches manifest', async () => {
      const mockStorage = buildMockStorage([
        { key: 'clips/clip-1.mp4', size: 10 * 1024 * 1024 },
        { key: 'clips/clip-2.mp4', size: 20 * 1024 * 1024 },
      ]);
      const mockDb = { getSupabase: () => null } as any;
      reconciliationService = new StorageReconciliationService(mockDb, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-1', clip_id: 'c1', storage_path: 'clips/clip-1.mp4', bytes: 10 * 1024 * 1024, state: 'available' },
        { id: 'art-2', clip_id: 'c2', storage_path: 'clips/clip-2.mp4', bytes: 20 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.driftBytes).toBe(0);
      expect(report.physicalUsageBytes).toBe(30 * 1024 * 1024);
      expect(report.manifestUsageBytes).toBe(30 * 1024 * 1024);
      expect(report.discrepancies.length).toBe(0);
      expect(report.summary.sizeDriftCount).toBe(0);
      expect(report.summary.orphanCount).toBe(0);
      expect(report.summary.ghostCount).toBe(0);
    });

    it('detects physical > manifest size drift (actual file is larger than DB record)', async () => {
      // Storage: 25 MB, DB: 20 MB -> +5 MB drift
      const mockStorage = buildMockStorage([
        { key: 'clips/clip-1.mp4', size: 25 * 1024 * 1024 },
      ]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-1', clip_id: 'c1', storage_path: 'clips/clip-1.mp4', bytes: 20 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.driftBytes).toBe(5 * 1024 * 1024);
      expect(report.summary.sizeDriftCount).toBe(1);
      expect(report.discrepancies[0].type).toBe('SIZE_DRIFT');
      expect(report.discrepancies[0].manifestBytes).toBe(20 * 1024 * 1024);
      expect(report.discrepancies[0].physicalBytes).toBe(25 * 1024 * 1024);
    });

    it('detects physical < manifest size drift (actual file is smaller than DB record)', async () => {
      // Storage: 15 MB, DB: 20 MB -> -5 MB drift
      const mockStorage = buildMockStorage([
        { key: 'clips/clip-1.mp4', size: 15 * 1024 * 1024 },
      ]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-1', clip_id: 'c1', storage_path: 'clips/clip-1.mp4', bytes: 20 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.driftBytes).toBe(-5 * 1024 * 1024);
      expect(report.summary.sizeDriftCount).toBe(1);
      expect(report.discrepancies[0].type).toBe('SIZE_DRIFT');
      expect(report.discrepancies[0].manifestBytes).toBe(20 * 1024 * 1024);
      expect(report.discrepancies[0].physicalBytes).toBe(15 * 1024 * 1024);
    });

    it('detects orphan storage objects (file in storage, DB row missing)', async () => {
      const mockStorage = buildMockStorage([
        { key: 'clips/known.mp4', size: 10 * 1024 * 1024 },
        { key: 'clips/untracked_orphan.mp4', size: 50 * 1024 * 1024 },
      ]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-known', clip_id: 'c1', storage_path: 'clips/known.mp4', bytes: 10 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.summary.orphanCount).toBe(1);
      const orphan = report.discrepancies.find(d => d.type === 'ORPHAN_OBJECT');
      expect(orphan).toBeDefined();
      expect(orphan?.storageKey).toBe('clips/untracked_orphan.mp4');
      expect(orphan?.physicalBytes).toBe(50 * 1024 * 1024);
    });

    it('detects ghost DB artifacts (DB says available, storage file missing)', async () => {
      const mockStorage = buildMockStorage([
        // Empty physical storage
      ]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-ghost', clip_id: 'c1', storage_path: 'clips/deleted_file.mp4', bytes: 15 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.summary.ghostCount).toBe(1);
      const ghost = report.discrepancies.find(d => d.type === 'GHOST_ARTIFACT');
      expect(ghost).toBeDefined();
      expect(ghost?.id).toBe('art-ghost');
      expect(ghost?.storageKey).toBe('clips/deleted_file.mp4');
    });

    it('handles multi-page paginated storage inventory cleanly', async () => {
      // Simulate 3 pages of objects consolidated by listCurrentObjects
      const pagedObjects = Array.from({ length: 15 }, (_, i) => ({
        key: `clips/video_${i}.mp4`,
        size: 2 * 1024 * 1024, // 2 MB each
      }));
      const mockStorage = buildMockStorage(pagedObjects);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const dbArtifacts = pagedObjects.map((obj, i) => ({
        id: `art-${i}`,
        clip_id: `c-${i}`,
        storage_path: obj.key,
        bytes: obj.size,
        state: 'available',
      }));
      const mockSb = buildMockSupabase(dbArtifacts);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.physicalObjectCount).toBe(15);
      expect(report.manifestArtifactCount).toBe(15);
      expect(report.physicalUsageBytes).toBe(30 * 1024 * 1024);
      expect(report.manifestUsageBytes).toBe(30 * 1024 * 1024);
      expect(report.driftBytes).toBe(0);
      expect(report.discrepancies.length).toBe(0);
    });

    it('detects missing metadata (empty storage_path or null/NaN bytes)', async () => {
      const mockStorage = buildMockStorage([]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-no-path', clip_id: 'c1', storage_path: '', bytes: 1000, state: 'available' },
        { id: 'art-nan-bytes', clip_id: 'c2', storage_path: 'clips/valid.mp4', bytes: NaN, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.summary.missingMetadataCount).toBe(2);
      expect(report.discrepancies.every(d => d.type === 'METADATA_INCOMPLETE')).toBe(true);
    });

    it('detects duplicate key collisions in manifest (multiple DB rows pointing to same path)', async () => {
      const mockStorage = buildMockStorage([
        { key: 'clips/shared.mp4', size: 10 * 1024 * 1024 },
      ]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const mockSb = buildMockSupabase([
        { id: 'art-first', clip_id: 'c1', storage_path: 'clips/shared.mp4', bytes: 10 * 1024 * 1024, state: 'available' },
        { id: 'art-second', clip_id: 'c2', storage_path: 'clips/shared.mp4', bytes: 10 * 1024 * 1024, state: 'available' },
      ]);

      const report = await reconciliationService.auditInventory(mockSb as any);

      expect(report.summary.keyCollisionCount).toBe(1);
      const collision = report.discrepancies.find(d => d.type === 'KEY_COLLISION');
      expect(collision?.storageKey).toBe('clips/shared.mp4');
      expect(collision?.id).toBe('art-second');
    });
  });

  describe('calibrateSizeDrift()', () => {
    it('updates DB artifact bytes to match physical storage size non-destructively', async () => {
      const mockStorage = buildMockStorage([]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const mockSb = {
        from: jest.fn().mockReturnValue({ update: updateMock }),
      };

      const discrepancies: any[] = [
        { id: 'art-1', type: 'SIZE_DRIFT', physicalBytes: 25 * 1024 * 1024 },
        { id: 'art-2', type: 'ORPHAN_OBJECT', physicalBytes: 50 * 1024 * 1024 }, // Should not be touched by size calibration
      ];

      const calibrated = await reconciliationService.calibrateSizeDrift(discrepancies, mockSb as any);

      expect(calibrated).toBe(1);
      expect(updateMock).toHaveBeenCalledWith({ bytes: 25 * 1024 * 1024 });
    });
  });

  describe('reconcileGhosts()', () => {
    it('marks ghost artifacts as evicted in DB so they stop generating ghost errors', async () => {
      const mockStorage = buildMockStorage([]);
      reconciliationService = new StorageReconciliationService({} as any, mockStorage as any);

      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const mockSb = {
        from: jest.fn().mockReturnValue({ update: updateMock }),
      };

      const discrepancies: any[] = [
        { id: 'art-ghost-1', type: 'GHOST_ARTIFACT' },
        { id: 'art-other', type: 'SIZE_DRIFT' },
      ];

      const reconciled = await reconciliationService.reconcileGhosts(discrepancies, mockSb as any);

      expect(reconciled).toBe(1);
      expect(updateMock).toHaveBeenCalledWith({ state: 'evicted' });
    });
  });
});
