// ─────────────────────────────────────────────────────────────────────────────
// EvictionEligibility — Excerpt Quota Eviction Protection Classifier
//
// A pure-function module that classifies a clip as PROTECTED or EVICTABLE.
// Decoupled from deletion logic so it can be tested independently.
//
// Protection invariants (ANY true → PROTECTED):
//   1. ACTIVE_JOB          — clip is referenced by an active render/processing job
//   2. PINNED              — clip.is_pinned = true (creator has explicitly pinned it)
//   3. PUBLISHED           — clip.status = 'published'
//   4. PENDING_PUBLICATION — clip is referenced by a pending publication plan
//   5. GRACE_PERIOD        — within STORAGE_GRACE_PERIOD_MS of clip.created_at
//   6. ACTIVE_CLIP_PROJECT — clip.clip_project_id references an active ClipProject
//
// All false → EVICTABLE
// Any unknown → PROTECTED (never unknown → delete)
// ─────────────────────────────────────────────────────────────────────────────

import { STORAGE_GRACE_PERIOD_MS } from './StoragePolicyConfig';

export type EligibilityReason =
  | 'PROTECTED_ACTIVE_JOB'
  | 'PROTECTED_PINNED'
  | 'PROTECTED_PUBLISHED'
  | 'PROTECTED_PENDING_PUBLICATION'
  | 'PROTECTED_GRACE_PERIOD'
  | 'PROTECTED_ACTIVE_CLIP_PROJECT'
  | 'PROTECTED_UNKNOWN'
  | 'EVICTABLE';

export interface EligibilityVerdict {
  eligible: boolean;
  reason: EligibilityReason;
}

export interface ClipEligibilityRow {
  id: string;
  status: string | null;
  is_pinned: boolean;
  created_at: string | null;
  clip_project_id: string | null;
  job_id: string | null;
  expires_at?: string | null;
}

export interface EligibilityContext {
  /** Set of job IDs currently active in the processing pipeline */
  activeJobIds: Set<string>;
  /** Set of clip_project_ids whose ClipProjects are currently active */
  activeClipProjectIds: Set<string>;
  /** Set of clip IDs that are referenced by pending publication plans */
  pendingPublicationClipIds: Set<string>;
  /** Current timestamp in ms (injectable for testing) */
  nowMs?: number;
}

/**
 * Assesses whether a clip is eligible for quota eviction.
 *
 * This is the single enforcement point for all protection invariants.
 * It must be called before any eviction deletion attempt.
 */
export function assessEvictionEligibility(
  clip: ClipEligibilityRow,
  context: EligibilityContext
): EligibilityVerdict {
  const nowMs = context.nowMs ?? Date.now();

  // Guard: unknown state → PROTECTED
  if (!clip.id || !clip.created_at) {
    return { eligible: false, reason: 'PROTECTED_UNKNOWN' };
  }

  // 1. Active job reference
  if (clip.job_id && context.activeJobIds.has(clip.job_id)) {
    return { eligible: false, reason: 'PROTECTED_ACTIVE_JOB' };
  }

  // 2. Pinned by creator
  if (clip.is_pinned === true) {
    return { eligible: false, reason: 'PROTECTED_PINNED' };
  }

  // 3. Published
  if (clip.status === 'published') {
    return { eligible: false, reason: 'PROTECTED_PUBLISHED' };
  }

  // 4. Pending publication
  if (context.pendingPublicationClipIds.has(clip.id)) {
    return { eligible: false, reason: 'PROTECTED_PENDING_PUBLICATION' };
  }

  // 5. Creation grace period
  try {
    const createdMs = new Date(clip.created_at).getTime();
    if (isNaN(createdMs)) {
      return { eligible: false, reason: 'PROTECTED_UNKNOWN' };
    }
    if (nowMs - createdMs < STORAGE_GRACE_PERIOD_MS) {
      return { eligible: false, reason: 'PROTECTED_GRACE_PERIOD' };
    }
  } catch {
    return { eligible: false, reason: 'PROTECTED_UNKNOWN' };
  }

  // 6. Active ClipProject reference
  if (
    clip.clip_project_id &&
    context.activeClipProjectIds.has(clip.clip_project_id)
  ) {
    return { eligible: false, reason: 'PROTECTED_ACTIVE_CLIP_PROJECT' };
  }

  return { eligible: true, reason: 'EVICTABLE' };
}

/**
 * Batch-assesses a list of clips, returning only the eligible ones
 * along with their individual verdicts for audit logging.
 */
export function filterEvictableClips(
  clips: ClipEligibilityRow[],
  context: EligibilityContext
): Array<{ clip: ClipEligibilityRow; verdict: EligibilityVerdict }> {
  return clips
    .map(clip => ({ clip, verdict: assessEvictionEligibility(clip, context) }))
    .filter(({ verdict }) => verdict.eligible);
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact-Level Eligibility & Reproducibility Policy
// A clip_artifact row is independently classifiable for eviction.
// The containing clip's invariants still apply — the artifact check is additive.
// ─────────────────────────────────────────────────────────────────────────────

export type ArtifactRole =
  | 'master_deliverable'   // captioned_video: the finished deliverable for publish
  | 'clean_derivative'    // clean_video: rendered clean video without burned-in captions
  | 'analysis_metadata'   // metadata_json: perception/transcription analysis blobs
  | 'editorial_project'   // project_json: canonical ClipProject edit state
  | 'preview_thumbnail';  // thumbnail: web preview image

export type ArtifactReproducibility =
  | 'deterministic_render'    // can be re-rendered deterministically from project + source
  | 'expensive_ai'           // generated via expensive model inference
  | 'irreproducible_source'   // raw uploaded source media
  | 'reproducible_metadata'; // fast/cheap to recompute

export type ArtifactRegenerationCost = 'low' | 'medium' | 'high' | 'infinite';

export interface ArtifactPolicyTraits {
  role: ArtifactRole;
  reproducibility: ArtifactReproducibility;
  regenerationCost: ArtifactRegenerationCost;
  userVisible: boolean;
  isCurrentVersion?: boolean; // For project_json: current version is strictly protected
}

export interface ClipArtifactEligibilityRow {
  id: string;
  clip_id: string;
  owner_id: string | null;
  artifact_type: string;
  state: string;        // 'available' | 'deleting' | 'deleted' | 'evicted'
  is_pinned: boolean;
  bytes: number;
  created_at: string | null;
  is_current_version?: boolean; // Defaults to true if omitted
  traits?: Partial<ArtifactPolicyTraits>;
}

/**
 * Returns canonical policy traits for a given artifact type.
 */
export function getArtifactPolicyTraits(
  artifactType: string,
  overrides?: Partial<ArtifactPolicyTraits>
): ArtifactPolicyTraits {
  const baseTraits: Record<string, ArtifactPolicyTraits> = {
    clean_video: {
      role: 'clean_derivative',
      reproducibility: 'deterministic_render',
      regenerationCost: 'low',
      userVisible: true,
    },
    metadata_json: {
      role: 'analysis_metadata',
      reproducibility: 'reproducible_metadata',
      regenerationCost: 'low',
      userVisible: false,
    },
    captioned_video: {
      role: 'master_deliverable',
      reproducibility: 'deterministic_render',
      regenerationCost: 'medium',
      userVisible: true,
    },
    thumbnail: {
      role: 'preview_thumbnail',
      reproducibility: 'deterministic_render',
      regenerationCost: 'low',
      userVisible: true,
    },
    project_json: {
      role: 'editorial_project',
      reproducibility: 'expensive_ai',
      regenerationCost: 'high',
      userVisible: false,
      isCurrentVersion: true,
    },
  };

  const defaultTrait: ArtifactPolicyTraits = {
    role: 'analysis_metadata',
    reproducibility: 'reproducible_metadata',
    regenerationCost: 'low',
    userVisible: false,
  };

  return {
    ...(baseTraits[artifactType] ?? defaultTrait),
    ...overrides,
  };
}

/**
 * Computes dynamic eviction priority score (higher score = evicted earlier).
 *
 * Policy:
 *   - current project_json: -1 (NEVER evicted)
 *   - reproducible + non-user-visible + cheap (analysis_metadata): 40 (evicted first)
 *   - clean_derivative (reproducible clean_video): 30 (evicted before master deliverable)
 *   - preview_thumbnail: 20
 *   - master_deliverable (captioned_video): 10 (last resort)
 *   - historical superseded project_json: 5 (eligible under metadata retention)
 */
export function computeArtifactEvictionScore(
  artifact: ClipArtifactEligibilityRow,
  clip?: ClipEligibilityRow
): number {
  const traits = getArtifactPolicyTraits(artifact.artifact_type, {
    isCurrentVersion: artifact.is_current_version ?? true,
    ...artifact.traits,
  });

  // Current project version is strictly protected
  if (traits.role === 'editorial_project' && traits.isCurrentVersion) {
    return -1;
  }

  // Non-disposable clean video safeguard:
  // If clean_video has NO clip_project linked, it cannot be deterministically re-rendered.
  // Elevate its retention protection to master deliverable level (score = 10) instead of derivative (30).
  if (traits.role === 'clean_derivative' && clip && !clip.clip_project_id) {
    return 10;
  }

  // Reproducible + non-user-visible + cheap metadata (evicted first)
  if (!traits.userVisible && traits.regenerationCost === 'low') {
    return 40;
  }

  // Clean derivative (when deterministically regenerable from project + source)
  if (traits.role === 'clean_derivative') {
    return 30;
  }

  // Thumbnail preview
  if (traits.role === 'preview_thumbnail') {
    return 20;
  }

  // Master deliverable (primary output; keep until forced)
  if (traits.role === 'master_deliverable') {
    return 10;
  }

  // Historical/superseded project versions
  if (traits.role === 'editorial_project' && !traits.isCurrentVersion) {
    return 5;
  }

  return 10;
}

/**
 * Assesses whether a specific clip artifact is eligible for quota eviction.
 *
 * Applies the 6 clip-level protection invariants PLUS:
 *   7. PROTECTED_PROJECT_CURRENT — current version of project_json is NEVER evicted
 *   8. NOT_AVAILABLE            — artifact is already deleted/evicted/deleting
 *   9. PROTECTED_PINNED         — artifact-level or clip-level pin
 */
export function assessArtifactEvictionEligibility(
  artifact: ClipArtifactEligibilityRow,
  clip: ClipEligibilityRow,
  context: EligibilityContext
): EligibilityVerdict {
  // Guard: artifact already gone
  if (artifact.state !== 'available') {
    return { eligible: false, reason: 'PROTECTED_UNKNOWN' };
  }

  // 7. Current project_json is strictly protected
  const isCurrentProject = artifact.artifact_type === 'project_json' &&
    (artifact.is_current_version !== false);
  if (isCurrentProject) {
    return { eligible: false, reason: 'PROTECTED_UNKNOWN' };
  }

  // 8. Artifact-level pin overrides clip-level
  if (artifact.is_pinned) {
    return { eligible: false, reason: 'PROTECTED_PINNED' };
  }

  // Apply all clip-level invariants — the artifact inherits the clip's protection
  return assessEvictionEligibility(clip, context);
}

/**
 * Batch-assesses a list of artifact+clip pairs, returning only evictable ones
 * sorted by eviction priority (higher score evicted first, then oldest first).
 */
export function filterEvictableArtifacts(
  pairs: Array<{ artifact: ClipArtifactEligibilityRow; clip: ClipEligibilityRow }>,
  context: EligibilityContext,
  artifactPriority?: Record<string, number>
): Array<{ artifact: ClipArtifactEligibilityRow; clip: ClipEligibilityRow; verdict: EligibilityVerdict }> {
  return pairs
    .map(({ artifact, clip }) => ({
      artifact,
      clip,
      verdict: assessArtifactEvictionEligibility(artifact, clip, context),
    }))
    .filter(({ verdict }) => verdict.eligible)
    .sort((a, b) => {
      const scoreA = artifactPriority
        ? (artifactPriority[a.artifact.artifact_type] ?? 0)
        : computeArtifactEvictionScore(a.artifact, a.clip);
      const scoreB = artifactPriority
        ? (artifactPriority[b.artifact.artifact_type] ?? 0)
        : computeArtifactEvictionScore(b.artifact, b.clip);

      if (scoreA !== scoreB) return scoreB - scoreA; // higher score = evicted first

      // Tie-break: oldest first (FIFO)
      const ta = a.artifact.created_at ? new Date(a.artifact.created_at).getTime() : 0;
      const tb = b.artifact.created_at ? new Date(b.artifact.created_at).getTime() : 0;
      return ta - tb;
    });
}

