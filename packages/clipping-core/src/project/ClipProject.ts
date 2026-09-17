/**
 * ClipProject.ts — Canonical non-destructive editable project model for @excerpt/clipping-core.
 *
 * Implements the 3-state architectural invariant:
 *   1. SOURCE:   Immutable source video media.
 *   2. PROJECT:  Editable decision & styling state (ClipProject) with immutable version lineage.
 *   3. ARTIFACT: Derived rendered media (ClipBundle).
 */

import crypto from 'crypto';
import { CompositionPlan } from '../composition/CompositionPlan';
import { HookPlan } from './HookPlan';

export interface TranscriptWordToken {
  id: string;
  word: string;
  start: number;
  end: number;
  confidence: number;
  isExcluded?: boolean;
}

export type CaptionPresetStyle =
  | 'hormozi'
  | 'mrbeast'
  | 'submagic'
  | 'minimalist'
  | 'tiktok'
  | 'neon';

export type ProjectEditState = 'draft' | 'reviewed' | 'approved' | 'published';

export interface ClipProject {
  id: string;
  projectId: string;
  jobId: string;
  sourceMediaId: string;
  version: number;
  parentVersion: number | null;
  contentHash: string;
  editState: ProjectEditState;

  timing: {
    startTime: number;
    endTime: number;
    inPoint: number;
    outPoint: number;
    duration: number;
  };

  composition: CompositionPlan;

  transcript: {
    words: TranscriptWordToken[];
    stylePreset: CaptionPresetStyle;
    customColors?: {
      primary: string;
      highlight: string;
      outline: string;
    };
    position: 'bottom' | 'middle' | 'top';
  };

  hook: HookPlan;

  packaging: {
    suggestedTitles: string[];
    description: string;
    hashtags: string[];
    selectedPosterTimestamp?: number;
  };

  createdAt: string;
  updatedAt: string;
}

export function computeProjectContentHash(project: Partial<ClipProject>): string {
  const canonical = {
    id: project.id,
    jobId: project.jobId,
    sourceMediaId: project.sourceMediaId,
    version: project.version,
    parentVersion: project.parentVersion ?? null,
    timing: project.timing,
    composition: project.composition,
    transcript: project.transcript,
    hook: project.hook,
    packaging: project.packaging,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

/**
 * Factory for creating a canonical initial ClipProject (Version 1).
 */
export function createClipProject(params: {
  id: string;
  jobId: string;
  sourceMediaId: string;
  startTime: number;
  endTime: number;
  composition: CompositionPlan;
  words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
  hook?: Partial<HookPlan>;
  titles?: string[];
  description?: string;
  hashtags?: string[];
}): ClipProject {
  const duration = Math.max(0, params.endTime - params.startTime);
  const now = new Date().toISOString();
  const projectId = `proj_${params.id}`;

  const words: TranscriptWordToken[] = (params.words || []).map((w, index) => ({
    id: `token_${index}_${Math.round(w.start * 1000)}`,
    word: w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence ?? 0.95,
  }));

  const hook: HookPlan = {
    sourceWindow: {
      start: params.startTime,
      end: Math.min(params.startTime + 3.0, params.endTime),
    },
    headline: params.hook?.headline || (params.titles?.[0] || ''),
    punchIn: params.hook?.punchIn || {
      enabled: true,
      fromScale: 1.15,
      toScale: 1.0,
      durationMs: 400,
    },
    openingMode: params.hook?.openingMode || 'claim',
  };

  const candidate: Omit<ClipProject, 'contentHash'> = {
    id: params.id,
    projectId,
    jobId: params.jobId,
    sourceMediaId: params.sourceMediaId,
    version: 1,
    parentVersion: null,
    editState: 'draft',
    timing: {
      startTime: params.startTime,
      endTime: params.endTime,
      inPoint: 0,
      outPoint: duration,
      duration,
    },
    composition: params.composition,
    transcript: {
      words,
      stylePreset: 'submagic',
      position: 'bottom',
    },
    hook,
    packaging: {
      suggestedTitles: params.titles || ['Moment Highlight'],
      description: params.description || '',
      hashtags: params.hashtags || ['#shorts'],
    },
    createdAt: now,
    updatedAt: now,
  };

  const contentHash = computeProjectContentHash(candidate);
  return {
    ...candidate,
    contentHash,
  };
}

/**
 * Derives the next immutable version of a ClipProject.
 *
 * NOTE: Operates in O(1) time for in-memory token and metadata updates.
 * Persistence complexity depends on the storage backend and serialization strategy.
 */
export function deriveNextProjectVersion(
  currentProject: ClipProject,
  changes: {
    words?: TranscriptWordToken[];
    composition?: CompositionPlan;
    hook?: HookPlan;
    suggestedTitles?: string[];
    description?: string;
    hashtags?: string[];
    editState?: ProjectEditState;
  }
): ClipProject {
  const nextVersion = currentProject.version + 1;
  const now = new Date().toISOString();

  const nextTranscript = changes.words
    ? { ...currentProject.transcript, words: changes.words }
    : currentProject.transcript;

  const nextPackaging = {
    ...currentProject.packaging,
    ...(changes.suggestedTitles ? { suggestedTitles: changes.suggestedTitles } : {}),
    ...(changes.description !== undefined ? { description: changes.description } : {}),
    ...(changes.hashtags ? { hashtags: changes.hashtags } : {}),
  };

  const candidate: Omit<ClipProject, 'contentHash'> = {
    ...currentProject,
    version: nextVersion,
    parentVersion: currentProject.version,
    composition: changes.composition || currentProject.composition,
    hook: changes.hook || currentProject.hook,
    transcript: nextTranscript,
    packaging: nextPackaging,
    editState: changes.editState || currentProject.editState,
    updatedAt: now,
  };

  const contentHash = computeProjectContentHash(candidate);
  return {
    ...candidate,
    contentHash,
  };
}

/**
 * Updates a word token in a ClipProject non-destructively without altering video timing.
 *
 * NOTE: O(1) in-memory token lookup & update; persistence complexity depends on the storage/versioning strategy.
 */
export function updateProjectTranscriptWord(
  project: ClipProject,
  tokenId: string,
  newWord: string
): ClipProject {
  const updatedWords = project.transcript.words.map(w =>
    w.id === tokenId ? { ...w, word: newWord } : w
  );

  return deriveNextProjectVersion(project, { words: updatedWords });
}
