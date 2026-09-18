// evictionEligibility.test.ts
// Tests for all 6 clip-level protection invariants + artifact-level extensions

import {
  assessEvictionEligibility,
  assessArtifactEvictionEligibility,
  filterEvictableClips,
  filterEvictableArtifacts,
  ClipEligibilityRow,
  ClipArtifactEligibilityRow,
  EligibilityContext,
} from '../services/EvictionEligibility';
import { STORAGE_GRACE_PERIOD_MS } from '../services/StoragePolicyConfig';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeClip(overrides: Partial<ClipEligibilityRow> = {}): ClipEligibilityRow {
  return {
    id: 'clip-1',
    status: 'completed',
    is_pinned: false,
    created_at: new Date(Date.now() - STORAGE_GRACE_PERIOD_MS - 1000).toISOString(), // outside grace
    clip_project_id: null,
    job_id: null,
    expires_at: null,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ClipArtifactEligibilityRow> = {}): ClipArtifactEligibilityRow {
  return {
    id: 'artifact-1',
    clip_id: 'clip-1',
    owner_id: null,
    artifact_type: 'clean_video',
    state: 'available',
    is_pinned: false,
    bytes: 10 * 1024 * 1024,
    created_at: new Date(Date.now() - STORAGE_GRACE_PERIOD_MS - 1000).toISOString(),
    ...overrides,
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

// ─── Clip-Level Tests ────────────────────────────────────────────────────────

describe('assessEvictionEligibility — clip-level', () => {
  it('returns EVICTABLE for a fully eligible clip', () => {
    const verdict = assessEvictionEligibility(makeClip(), makeContext());
    expect(verdict.eligible).toBe(true);
    expect(verdict.reason).toBe('EVICTABLE');
  });

  describe('Invariant 1: PROTECTED_ACTIVE_JOB', () => {
    it('protects clip referenced by an active job', () => {
      const clip = makeClip({ job_id: 'job-active' });
      const ctx = makeContext({ activeJobIds: new Set(['job-active']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_ACTIVE_JOB');
    });

    it('does NOT protect clip when job_id is not in active set', () => {
      const clip = makeClip({ job_id: 'job-completed' });
      const ctx = makeContext({ activeJobIds: new Set(['job-other']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(true);
    });

    it('does NOT protect clip when job_id is null', () => {
      const clip = makeClip({ job_id: null });
      const ctx = makeContext({ activeJobIds: new Set(['job-active']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(true);
    });
  });

  describe('Invariant 2: PROTECTED_PINNED', () => {
    it('protects pinned clips', () => {
      const clip = makeClip({ is_pinned: true });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_PINNED');
    });

    it('allows eviction of non-pinned clip', () => {
      const clip = makeClip({ is_pinned: false });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(true);
    });
  });

  describe('Invariant 3: PROTECTED_PUBLISHED', () => {
    it('protects published clips', () => {
      const clip = makeClip({ status: 'published' });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_PUBLISHED');
    });

    it('allows eviction of completed clips', () => {
      const clip = makeClip({ status: 'completed' });
      expect(assessEvictionEligibility(clip, makeContext()).eligible).toBe(true);
    });

    it('allows eviction of failed clips', () => {
      const clip = makeClip({ status: 'failed' });
      expect(assessEvictionEligibility(clip, makeContext()).eligible).toBe(true);
    });
  });

  describe('Invariant 4: PROTECTED_PENDING_PUBLICATION', () => {
    it('protects clip in pending publication set', () => {
      const clip = makeClip({ id: 'clip-pub' });
      const ctx = makeContext({ pendingPublicationClipIds: new Set(['clip-pub']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_PENDING_PUBLICATION');
    });
  });

  describe('Invariant 5: PROTECTED_GRACE_PERIOD', () => {
    it('protects clip created 1ms ago (within grace period)', () => {
      const clip = makeClip({ created_at: new Date(Date.now() - 1).toISOString() });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_GRACE_PERIOD');
    });

    it('allows eviction of clip created exactly outside grace period (1ms past)', () => {
      const clip = makeClip({
        created_at: new Date(Date.now() - STORAGE_GRACE_PERIOD_MS - 1).toISOString(),
      });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(true);
    });

    it('protects clip with invalid created_at (PROTECTED_UNKNOWN)', () => {
      const clip = makeClip({ created_at: 'not-a-date' });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_UNKNOWN');
    });

    it('protects clip with null created_at (PROTECTED_UNKNOWN)', () => {
      const clip = makeClip({ created_at: null });
      const verdict = assessEvictionEligibility(clip, makeContext());
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_UNKNOWN');
    });
  });

  describe('Invariant 6: PROTECTED_ACTIVE_CLIP_PROJECT', () => {
    it('protects clip linked to an active ClipProject', () => {
      const clip = makeClip({ clip_project_id: 'proj-active' });
      const ctx = makeContext({ activeClipProjectIds: new Set(['proj-active']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(false);
      expect(verdict.reason).toBe('PROTECTED_ACTIVE_CLIP_PROJECT');
    });

    it('allows eviction when ClipProject is NOT active', () => {
      const clip = makeClip({ clip_project_id: 'proj-old' });
      const ctx = makeContext({ activeClipProjectIds: new Set(['proj-current']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(true);
    });

    it('allows eviction when clip_project_id is null', () => {
      const clip = makeClip({ clip_project_id: null });
      const ctx = makeContext({ activeClipProjectIds: new Set(['proj-active']) });
      const verdict = assessEvictionEligibility(clip, ctx);
      expect(verdict.eligible).toBe(true);
    });
  });

  describe('filterEvictableClips()', () => {
    it('returns only evictable clips from a mixed list', () => {
      const clips = [
        makeClip({ id: 'evictable-1' }),
        makeClip({ id: 'pinned', is_pinned: true }),
        makeClip({ id: 'published', status: 'published' }),
        makeClip({ id: 'evictable-2' }),
      ];
      const result = filterEvictableClips(clips, makeContext());
      expect(result.map(r => r.clip.id)).toEqual(['evictable-1', 'evictable-2']);
    });

    it('returns empty array when all clips are protected', () => {
      const clips = [makeClip({ is_pinned: true }), makeClip({ status: 'published' })];
      expect(filterEvictableClips(clips, makeContext())).toHaveLength(0);
    });
  });
});

// ─── Artifact-Level Tests ────────────────────────────────────────────────────

describe('assessArtifactEvictionEligibility — artifact-level', () => {
  it('returns EVICTABLE for a fully eligible artifact', () => {
    const verdict = assessArtifactEvictionEligibility(makeArtifact(), makeClip(), makeContext());
    expect(verdict.eligible).toBe(true);
    expect(verdict.reason).toBe('EVICTABLE');
  });

  it('protects project_json regardless of other conditions', () => {
    const artifact = makeArtifact({ artifact_type: 'project_json' });
    const verdict = assessArtifactEvictionEligibility(artifact, makeClip(), makeContext());
    expect(verdict.eligible).toBe(false);
  });

  it('protects artifact that is already evicted', () => {
    const artifact = makeArtifact({ state: 'evicted' });
    const verdict = assessArtifactEvictionEligibility(artifact, makeClip(), makeContext());
    expect(verdict.eligible).toBe(false);
  });

  it('protects artifact that is in deleting state', () => {
    const artifact = makeArtifact({ state: 'deleting' });
    const verdict = assessArtifactEvictionEligibility(artifact, makeClip(), makeContext());
    expect(verdict.eligible).toBe(false);
  });

  it('protects artifact with is_pinned=true (artifact-level pin)', () => {
    const artifact = makeArtifact({ is_pinned: true });
    const verdict = assessArtifactEvictionEligibility(artifact, makeClip(), makeContext());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('PROTECTED_PINNED');
  });

  it('protects artifact whose parent clip is published', () => {
    const clip = makeClip({ status: 'published' });
    const verdict = assessArtifactEvictionEligibility(makeArtifact(), clip, makeContext());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('PROTECTED_PUBLISHED');
  });

  it('protects clean_video whose parent clip is pinned', () => {
    const clip = makeClip({ is_pinned: true });
    const artifact = makeArtifact({ artifact_type: 'clean_video', is_pinned: false });
    const verdict = assessArtifactEvictionEligibility(artifact, clip, makeContext());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('PROTECTED_PINNED');
  });

  describe('filterEvictableArtifacts() — priority sort', () => {
    const PRIORITY = { clean_video: 3, metadata_json: 2, captioned_video: 1, thumbnail: 1 };

    it('sorts clean_video before captioned_video (lower priority evicted first when number is higher)', () => {
      // Note: higher number in our scheme = lower priority = evicted first
      const pairs = [
        { artifact: makeArtifact({ id: 'cap', artifact_type: 'captioned_video' }), clip: makeClip() },
        { artifact: makeArtifact({ id: 'cln', artifact_type: 'clean_video' }), clip: makeClip() },
      ];
      const result = filterEvictableArtifacts(pairs, makeContext(), PRIORITY);
      expect(result[0].artifact.id).toBe('cln'); // clean_video priority=3 → evicted first
      expect(result[1].artifact.id).toBe('cap');
    });

    it('within same priority tier, evicts oldest first', () => {
      const older = new Date(Date.now() - STORAGE_GRACE_PERIOD_MS - 10000).toISOString();
      const newer = new Date(Date.now() - STORAGE_GRACE_PERIOD_MS - 1000).toISOString();
      const pairs = [
        { artifact: makeArtifact({ id: 'newer', artifact_type: 'metadata_json', created_at: newer }), clip: makeClip() },
        { artifact: makeArtifact({ id: 'older', artifact_type: 'metadata_json', created_at: older }), clip: makeClip() },
      ];
      const result = filterEvictableArtifacts(pairs, makeContext(), PRIORITY);
      expect(result[0].artifact.id).toBe('older');
    });

    it('excludes protected artifacts from result', () => {
      const pairs = [
        { artifact: makeArtifact({ id: 'ok' }), clip: makeClip() },
        { artifact: makeArtifact({ id: 'pinned', is_pinned: true }), clip: makeClip() },
        { artifact: makeArtifact({ id: 'proj', artifact_type: 'project_json' }), clip: makeClip() },
      ];
      const result = filterEvictableArtifacts(pairs, makeContext(), PRIORITY);
      expect(result).toHaveLength(1);
      expect(result[0].artifact.id).toBe('ok');
    });

    it('uses dynamic trait-based priority when no static priority map is passed', () => {
      const pairs = [
        { artifact: makeArtifact({ id: 'cap', artifact_type: 'captioned_video' }), clip: makeClip({ clip_project_id: 'proj-1' }) },
        { artifact: makeArtifact({ id: 'meta', artifact_type: 'metadata_json' }), clip: makeClip({ clip_project_id: 'proj-1' }) },
        { artifact: makeArtifact({ id: 'cln', artifact_type: 'clean_video' }), clip: makeClip({ clip_project_id: 'proj-1' }) },
      ];
      // metadata_json (40) -> clean_video (30) -> captioned_video (10)
      const result = filterEvictableArtifacts(pairs, makeContext());
      expect(result[0].artifact.id).toBe('meta');
      expect(result[1].artifact.id).toBe('cln');
      expect(result[2].artifact.id).toBe('cap');
    });

    it('protects clean_video as non-disposable when clip has no linked clip_project_id', () => {
      // Without clip_project_id, clean_video cannot be deterministically re-rendered,
      // so it is treated with master deliverable protection (score 10 instead of 30)
      const pairs = [
        { artifact: makeArtifact({ id: 'cln-no-proj', artifact_type: 'clean_video' }), clip: makeClip({ clip_project_id: null }) },
        { artifact: makeArtifact({ id: 'thumb', artifact_type: 'thumbnail' }), clip: makeClip() },
      ];
      // thumbnail (score 20) is evicted before non-disposable clean_video (score 10)
      const result = filterEvictableArtifacts(pairs, makeContext());
      expect(result[0].artifact.id).toBe('thumb');
      expect(result[1].artifact.id).toBe('cln-no-proj');
    });

    it('protects current project_json (-1) while allowing superseded version (5)', () => {
      const current = makeArtifact({ id: 'v2-curr', artifact_type: 'project_json', is_current_version: true });
      const superseded = makeArtifact({ id: 'v1-old', artifact_type: 'project_json', is_current_version: false });
      const clip = makeClip();

      const verdictCurrent = assessArtifactEvictionEligibility(current, clip, makeContext());
      expect(verdictCurrent.eligible).toBe(false);

      const verdictOld = assessArtifactEvictionEligibility(superseded, clip, makeContext());
      expect(verdictOld.eligible).toBe(true);
    });
  });
});
