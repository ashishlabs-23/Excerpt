// storageCapacityManager.test.ts
// Tests for StorageCapacityManager: reservation rejection, profile estimator, and stale TTL

import { StorageCapacityManager } from '../services/StorageCapacityManager';
import {
  STORAGE_CRITICAL_BYTES,
  STORAGE_QUOTA_BYTES,
  STORAGE_EVICTION_WARNING_BYTES,
  STORAGE_EVICTION_TRIGGER_BYTES,
} from '../services/StoragePolicyConfig';

// ─── Render Profile Estimator ────────────────────────────────────────────────

describe('StorageCapacityManager.estimateRenderBytes()', () => {
  it('returns positive bytes for any positive duration', () => {
    expect(StorageCapacityManager.estimateRenderBytes(60)).toBeGreaterThan(0);
  });

  it('quality mode produces more bytes than draft mode for same duration', () => {
    const draft = StorageCapacityManager.estimateRenderBytes(60, 'draft');
    const quality = StorageCapacityManager.estimateRenderBytes(60, 'quality');
    expect(quality).toBeGreaterThan(draft);
  });

  it('unknown mode falls back to default (8 Mbps baseline)', () => {
    const unknown = StorageCapacityManager.estimateRenderBytes(60, 'unknown-mode');
    const defaultMode = StorageCapacityManager.estimateRenderBytes(60, 'default');
    expect(unknown).toBe(defaultMode);
  });

  it('scales linearly with duration', () => {
    const one = StorageCapacityManager.estimateRenderBytes(60, 'quality');
    const two = StorageCapacityManager.estimateRenderBytes(120, 'quality');
    expect(two).toBe(one * 2);
  });

  it('includes overhead multiplier (result > raw bitrate × duration ÷ 8)', () => {
    // 4 Mbps draft: raw = 500_000 bytes/sec × 60 = 30_000_000 bytes
    const raw = 500_000 * 60;
    const estimated = StorageCapacityManager.estimateRenderBytes(60, 'draft');
    expect(estimated).toBeGreaterThan(raw); // overhead multiplier applied
  });

  it('returns 0 for zero duration', () => {
    expect(StorageCapacityManager.estimateRenderBytes(0)).toBe(0);
  });
});

// ─── requestReservation() — mocked DB ───────────────────────────────────────

describe('StorageCapacityManager.requestReservation()', () => {
  function makeManager(physicalUsage: number, rpcResult: any) {
    // Inject a mock DB and storage
    const mockSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: rpcResult, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const mockDb = { getSupabase: () => mockSupabase } as any;
    const mockStorage = {
      listCurrentObjects: jest.fn().mockResolvedValue(
        Array.from({ length: 1 }, (_, i) => ({ size: physicalUsage }))
      ),
    } as any;

    const manager = new StorageCapacityManager(mockDb, mockStorage);
    return { manager, mockSupabase };
  }

  it('returns canProceed=false with CRITICAL_PRESSURE when usage is at CRITICAL threshold', async () => {
    const { manager } = makeManager(STORAGE_CRITICAL_BYTES, { granted: false, reason: 'INSUFFICIENT_HEADROOM' });
    const result = await manager.requestReservation(1024, 'job-1', 'worker-1');
    // Physical usage at CRITICAL → fast-rejects before RPC
    expect(result.canProceed).toBe(false);
    expect(result.reason).toBe('CRITICAL_PRESSURE');
  });

  it('returns canProceed=false when RPC denies (INSUFFICIENT_HEADROOM)', async () => {
    const { manager } = makeManager(
      STORAGE_EVICTION_TRIGGER_BYTES, // at EVICTION but not CRITICAL
      { granted: false, reason: 'INSUFFICIENT_HEADROOM', effective_bytes: STORAGE_CRITICAL_BYTES + 1 }
    );
    const result = await manager.requestReservation(
      StorageCapacityManager.estimateRenderBytes(120, 'quality'),
      'job-2',
      'worker-1'
    );
    expect(result.canProceed).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_HEADROOM');
  });

  it('returns canProceed=true and reservationId when RPC grants', async () => {
    const { manager } = makeManager(
      STORAGE_EVICTION_WARNING_BYTES - 1, // NORMAL pressure
      { granted: true, reservation_id: 'res-abc-123' }
    );
    const result = await manager.requestReservation(1024 * 1024 * 50, 'job-3', 'worker-1');
    expect(result.canProceed).toBe(true);
    expect(result.reservationId).toBe('res-abc-123');
  });

  it('fails open (canProceed=true) when RPC throws a connectivity error', async () => {
    const mockDb = {
      getSupabase: () => ({
        rpc: jest.fn().mockRejectedValue(new Error('connection timeout')),
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any;
    const mockStorage = {
      listCurrentObjects: jest.fn().mockResolvedValue([{ size: 1024 * 1024 * 100 }]), // 100 MB, NORMAL
    } as any;
    const manager = new StorageCapacityManager(mockDb, mockStorage);
    const result = await manager.requestReservation(1024 * 1024, 'job-4', 'worker-1');
    expect(result.canProceed).toBe(true); // Fail-open: don't block renders on DB connectivity issues
  });
});

// ─── getCapacityReport() ──────────────────────────────────────────────────────

describe('StorageCapacityManager.getCapacityReport()', () => {
  function makeManagerWithUsage(physicalUsage: number) {
    const mockDb = {
      getSupabase: () => ({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any;
    const mockStorage = {
      listCurrentObjects: jest.fn().mockResolvedValue([{ size: physicalUsage }]),
    } as any;
    return new StorageCapacityManager(mockDb, mockStorage);
  }

  it('reports NORMAL pressure at 50% usage', async () => {
    const manager = makeManagerWithUsage(Math.floor(STORAGE_QUOTA_BYTES * 0.5));
    const report = await manager.getCapacityReport();
    expect(report.pressureLevel).toBe('NORMAL');
    expect(report.canAcceptRender).toBe(true);
    expect(report.percentUsed).toBe(50);
  });

  it('reports WARNING pressure at 80% usage', async () => {
    const manager = makeManagerWithUsage(Math.floor(STORAGE_QUOTA_BYTES * 0.80));
    const report = await manager.getCapacityReport();
    expect(report.pressureLevel).toBe('WARNING');
    expect(report.canAcceptRender).toBe(true);
  });

  it('reports EVICTION pressure at 90% usage', async () => {
    const manager = makeManagerWithUsage(Math.floor(STORAGE_QUOTA_BYTES * 0.90));
    const report = await manager.getCapacityReport();
    expect(report.pressureLevel).toBe('EVICTION');
    expect(report.canAcceptRender).toBe(true); // Still allowed to render; eviction triggers separately
  });

  it('reports CRITICAL and blocks renders at 96% usage', async () => {
    const manager = makeManagerWithUsage(Math.floor(STORAGE_QUOTA_BYTES * 0.96));
    const report = await manager.getCapacityReport();
    expect(report.pressureLevel).toBe('CRITICAL');
    expect(report.canAcceptRender).toBe(false);
  });

  it('includes quotaBytes in report', async () => {
    const manager = makeManagerWithUsage(100 * 1024 * 1024);
    const report = await manager.getCapacityReport();
    expect(report.quotaBytes).toBe(STORAGE_QUOTA_BYTES);
  });

  it('gracefully handles storage read failure (returns 0 usage)', async () => {
    const mockDb = {
      getSupabase: () => ({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any;
    const mockStorage = {
      listCurrentObjects: jest.fn().mockRejectedValue(new Error('S3 timeout')),
    } as any;
    const manager = new StorageCapacityManager(mockDb, mockStorage);
    const report = await manager.getCapacityReport();
    expect(report.pressureLevel).toBe('NORMAL'); // 0 bytes → NORMAL
  });
});

// ─── settleReservation() ──────────────────────────────────────────────────────

describe('StorageCapacityManager.settleReservation()', () => {
  it('returns success=true when RPC accepts the settled byte size', async () => {
    const mockSupabase = {
      rpc: jest.fn().mockResolvedValue({
        data: { success: true, reservation_id: 'res-1', settled_bytes: 100 * 1024 * 1024, delta_bytes: 20 * 1024 * 1024 },
        error: null,
      }),
      from: jest.fn(),
    };
    const mockDb = { getSupabase: () => mockSupabase } as any;
    const mockStorage = { listCurrentObjects: jest.fn().mockResolvedValue([{ size: 500 * 1024 * 1024 }]) } as any;
    const manager = new StorageCapacityManager(mockDb, mockStorage);

    const result = await manager.settleReservation('res-1', 100 * 1024 * 1024);

    expect(result.success).toBe(true);
    expect(result.settledBytes).toBe(100 * 1024 * 1024);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('settle_storage_reservation', expect.objectContaining({
      p_reservation_id: 'res-1',
      p_actual_bytes: 100 * 1024 * 1024,
    }));
  });

  it('returns success=false with SETTLE_OVER_CAPACITY when delta exceeds admission ceiling', async () => {
    const mockSupabase = {
      rpc: jest.fn().mockResolvedValue({
        data: { success: false, reason: 'SETTLE_OVER_CAPACITY', delta_bytes: 50 * 1024 * 1024 },
        error: null,
      }),
      from: jest.fn(),
    };
    const mockDb = { getSupabase: () => mockSupabase } as any;
    const mockStorage = { listCurrentObjects: jest.fn().mockResolvedValue([{ size: 850 * 1024 * 1024 }]) } as any;
    const manager = new StorageCapacityManager(mockDb, mockStorage);

    const result = await manager.settleReservation('res-over', 120 * 1024 * 1024);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('SETTLE_OVER_CAPACITY');
  });

  it('fails open when RPC throws a network error', async () => {
    const mockSupabase = {
      rpc: jest.fn().mockRejectedValue(new Error('RPC connection dropped')),
      from: jest.fn(),
    };
    const mockDb = { getSupabase: () => mockSupabase } as any;
    const mockStorage = { listCurrentObjects: jest.fn().mockResolvedValue([]) } as any;
    const manager = new StorageCapacityManager(mockDb, mockStorage);

    const result = await manager.settleReservation('res-net', 50 * 1024 * 1024);

    expect(result.success).toBe(true); // Fail-open
    expect(result.settledBytes).toBe(50 * 1024 * 1024);
  });
});

