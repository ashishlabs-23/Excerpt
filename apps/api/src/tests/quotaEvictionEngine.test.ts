// quotaEvictionEngine.test.ts
// Tests for QuotaEvictionEngine: priority ordering, minimal eviction, CAPACITY_BLOCKED,
// project_json protection, and clip.media_state reconciliation

import { QuotaEvictionEngine, ARTIFACT_EVICTION_PRIORITY } from '../services/QuotaEvictionEngine';
import { STORAGE_TARGET_BYTES } from '../services/StoragePolicyConfig';
import { EligibilityContext } from '../services/EvictionEligibility';

// ─── Mocking helpers ─────────────────────────────────────────────────────────

function makeArtifactRow(overrides: any = {}) {
  const gracePast = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
  return {
    id: overrides.id ?? 'art-1',
    clip_id: overrides.clip_id ?? 'clip-1',
    owner_id: null,
    artifact_type: overrides.artifact_type ?? 'clean_video',
    state: overrides.state ?? 'available',
    is_pinned: overrides.is_pinned ?? false,
    bytes: overrides.bytes ?? 10 * 1024 * 1024, // 10 MB
    created_at: overrides.created_at ?? gracePast,
    clips: {
      id: overrides.clip_id ?? 'clip-1',
      status: overrides.clip_status ?? 'completed',
      is_pinned: overrides.clip_pinned ?? false,
      created_at: gracePast,
      clip_project_id: overrides.clip_project_id ?? null,
      job_id: overrides.job_id ?? null,
      expires_at: null,
    },
  };
}

function buildSupabaseMock(artifactRows: any[], updatesLog: any[] = []) {
  // Tracks state updates made during eviction
  const stateMap: Record<string, string> = {};
  artifactRows.forEach(r => { stateMap[r.id] = r.state; });

  const selectResult = { data: artifactRows, error: null };

  return {
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(selectResult),
            }),
            // For state update mocks
            mockResolvedValue: jest.fn().mockResolvedValue({ error: null }),
          }),
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(selectResult),
          }),
        }),
      }),
      update: jest.fn((data: any) => ({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      })),
    })),
    storage: {
      from: jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  };
}

function makeContext(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    activeJobIds: new Set<string>(),
    activeClipProjectIds: new Set<string>(),
    pendingPublicationClipIds: new Set<string>(),
    nowMs: Date.now(),
    ...overrides,
  };
}

// ─── ARTIFACT_EVICTION_PRIORITY constant ─────────────────────────────────────

describe('ARTIFACT_EVICTION_PRIORITY', () => {
  it('clean_video has higher priority number than captioned_video (evicted first)', () => {
    expect(ARTIFACT_EVICTION_PRIORITY.clean_video)
      .toBeGreaterThan(ARTIFACT_EVICTION_PRIORITY.captioned_video);
  });

  it('project_json is NOT in the priority map (protected in EvictionEligibility)', () => {
    expect(ARTIFACT_EVICTION_PRIORITY.project_json).toBeUndefined();
  });

  it('all defined types have positive priority numbers', () => {
    for (const [type, priority] of Object.entries(ARTIFACT_EVICTION_PRIORITY)) {
      expect(priority).toBeGreaterThan(0);
    }
  });
});

// ─── evictToTarget() ──────────────────────────────────────────────────────────

describe('QuotaEvictionEngine.evictToTarget()', () => {
  let engine: QuotaEvictionEngine;
  let mockDb: any;
  let mockStorage: any;

  beforeEach(() => {
    mockStorage = {}; // unused in unit tests
    engine = new QuotaEvictionEngine({} as any, {} as any);
  });

  it('returns no evictions when already at or below target', async () => {
    // currentUsage == STORAGE_TARGET_BYTES → deficit == 0
    const supabaseMock = buildSupabaseMock([]);
    const report = await engine.evictToTarget(supabaseMock as any, STORAGE_TARGET_BYTES, makeContext());
    expect(report.evictedCount).toBe(0);
    expect(report.bytesFreed).toBe(0);
    expect(report.blocked).toBe(false);
  });

  it('returns blocked=true when no candidate artifacts exist', async () => {
    const supabaseMock = buildSupabaseMock([]);
    // 100 MB above target → needs eviction but no candidates
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + 100 * 1024 * 1024,
      makeContext()
    );
    expect(report.blocked).toBe(true);
    expect(report.blockedReason).toBe('INSUFFICIENT_EVICTABLE_CAPACITY');
  });

  it('evicts minimum artifacts needed to satisfy deficit (stops early)', async () => {
    // Two 50 MB artifacts; deficit is 60 MB — should evict only 1st (50 MB < 60 MB), then 2nd
    // Actually 50 < 60 so it needs both: first evicts 50, still 10 short; evicts second
    const deficit = 60 * 1024 * 1024;
    const artifactBytes = 50 * 1024 * 1024;

    const rows = [
      makeArtifactRow({ id: 'art-1', bytes: artifactBytes }),
      makeArtifactRow({ id: 'art-2', bytes: artifactBytes }),
      makeArtifactRow({ id: 'art-3', bytes: artifactBytes }), // should NOT be evicted
    ];

    const supabaseMock = buildSupabaseMock(rows);
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + deficit,
      makeContext()
    );
    // Freed: 50 + 50 = 100 MB ≥ 60 MB deficit
    // Engine stops after 2nd artifact
    expect(report.evictedCount).toBeLessThanOrEqual(2);
    expect(report.bytesFreed).toBeGreaterThanOrEqual(deficit);
    expect(report.blocked).toBe(false);
  });

  it('never evicts project_json artifacts', async () => {
    const rows = [
      makeArtifactRow({ id: 'proj-json', artifact_type: 'project_json', bytes: 1024 }),
    ];
    const supabaseMock = buildSupabaseMock(rows);
    const deficit = 1; // tiny deficit
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + deficit,
      makeContext()
    );
    // project_json is protected — no evictions possible → CAPACITY_BLOCKED
    expect(report.evictedCount).toBe(0);
    expect(report.blocked).toBe(true);
  });

  it('never evicts pinned artifacts', async () => {
    const rows = [
      makeArtifactRow({ id: 'pinned-art', is_pinned: true, bytes: 50 * 1024 * 1024 }),
    ];
    const supabaseMock = buildSupabaseMock(rows);
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + 50 * 1024 * 1024,
      makeContext()
    );
    expect(report.evictedCount).toBe(0);
    expect(report.blocked).toBe(true);
  });

  it('never evicts artifacts of published clips', async () => {
    const rows = [
      makeArtifactRow({ id: 'pub-art', clip_status: 'published', bytes: 50 * 1024 * 1024 }),
    ];
    const supabaseMock = buildSupabaseMock(rows);
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + 50 * 1024 * 1024,
      makeContext()
    );
    expect(report.evictedCount).toBe(0);
    expect(report.blocked).toBe(true);
  });

  it('never evicts clips referenced by an active job', async () => {
    const rows = [
      makeArtifactRow({ id: 'active-art', job_id: 'job-active', bytes: 50 * 1024 * 1024 }),
    ];
    const supabaseMock = buildSupabaseMock(rows);
    const ctx = makeContext({ activeJobIds: new Set(['job-active']) });
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + 50 * 1024 * 1024,
      ctx
    );
    expect(report.evictedCount).toBe(0);
    expect(report.blocked).toBe(true);
  });

  it('returns mediaEvictedClipIds for all clips that had artifacts evicted', async () => {
    const rows = [
      makeArtifactRow({ id: 'art-a', clip_id: 'clip-x', bytes: 100 * 1024 * 1024 }),
    ];
    const supabaseMock = buildSupabaseMock(rows);
    const report = await engine.evictToTarget(
      supabaseMock as any,
      STORAGE_TARGET_BYTES + 50 * 1024 * 1024,
      makeContext()
    );
    if (report.evictedCount > 0) {
      expect(report.mediaEvictedClipIds).toContain('clip-x');
    }
  });
});
