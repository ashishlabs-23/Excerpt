/**
 * ClipProject.ts — Canonical non-destructive editable project model for @excerpt/clipping-core.
 *
 * Implements the 3-state architectural invariant:
 *   1. SOURCE:   Immutable source video media.
 *   2. PROJECT:  Editable decision & styling state (ClipProject).
 *   3. ARTIFACT: Derived rendered media (ClipBundle).
 */

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

export interface ClipProject {
  id: string;
  jobId: string;
  sourceMediaId: string;
  version: number;

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
    viralityRationale?: string;
    selectedPosterTimestamp?: number;
  };

  createdAt: string;
  updatedAt: string;
}

/**
 * Factory for creating a canonical initial ClipProject.
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

  return {
    id: params.id,
    jobId: params.jobId,
    sourceMediaId: params.sourceMediaId,
    version: 1,
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
      suggestedTitles: params.titles || ['Viral Moment'],
      description: params.description || '',
      hashtags: params.hashtags || ['#shorts', '#viral'],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates a word token in a ClipProject non-destructively without altering video timing.
 */
export function updateProjectTranscriptWord(
  project: ClipProject,
  tokenId: string,
  newWord: string
): ClipProject {
  const updatedWords = project.transcript.words.map(w =>
    w.id === tokenId ? { ...w, word: newWord } : w
  );

  return {
    ...project,
    version: project.version + 1,
    updatedAt: new Date().toISOString(),
    transcript: {
      ...project.transcript,
      words: updatedWords,
    },
  };
}
