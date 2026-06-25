import fs from 'fs';
import { NEXUS_FEATURES, isMultiModalEnabled } from '../config/features';
import { getRankingWeightsForCategory } from './intelligence/RankingProfiles';
import { PipelineContext } from './intelligence/PipelineContext';

interface RankingWeights {
  original: number;
  audio: number;
  face: number;
  visual: number;
  hook: number;
}

export interface RankableCandidate {
  id: string;
  originalScore: number;
  audioScore: number;
  faceScore: number;
  visualScore: number;
  hookScore: number;
  originalIndex: number;
  satisfactionScore?: number;
  retentionScore?: number;
  emotionArcScore?: number;
  narrativeScore?: number;
  curiosityScore?: number;
  payoffScore?: number;
  gameplayDensity?: number;
  graphicPenalty?: number;
  replayImportance?: number;
  eventImportance?: number;
  // Football Intelligence Ranking
  commentaryHype?: number;
  goalImportance?: number;
  storyCompleteness?: number;
  tension?: number;
  matchImportance?: number;
  ballVisibility?: number;
  narrativeCompleteness?: number;
  publishabilityScore?: number;
  contextCompletenessScore?: number;
}

export function computePublishabilityScore(
  storyScore: number,
  emotionScore: number,
  reactionScore: number,
  importanceScore: number,
  contextCompletenessScore: number,
  noveltyScore: number
): number {
  return (
    (storyScore * 0.25) +
    (emotionScore * 0.20) +
    (reactionScore * 0.20) +
    (importanceScore * 0.15) +
    (contextCompletenessScore * 0.10) +
    (noveltyScore * 0.10)
  );
}

export interface RankingDecision {
  orderedIds: string[];
  scores: Record<string, number>;
  topSegmentId: string;
  topSegmentScore: number;
  scoreBreakdown: {
    original_score: number;
    audio_score: number;
    face_score: number;
    visual_score: number;
    hook_score: number;
    satisfaction_score?: number;
    retention_score?: number;
    gameplay_density?: number;
    graphic_penalty?: number;
  };
  weightsUsed: RankingWeights;
  reasonForSelection: string;
}

export function protectClipBoundaries(
  startSec: number,
  endSec: number,
  context: PipelineContext
): { start: number; end: number } {
  if (!context.visualTimeline || context.visualTimeline.length === 0) {
    return { start: startSec, end: endSec };
  }

  let newStart = startSec;
  let newEnd = endSec;

  const hasEventNearby = (context.wowMoments || []).some(
    (w) => Math.abs(w.timestamp - startSec) < 15.0 || Math.abs(w.timestamp - endSec) < 15.0
  );

  if (hasEventNearby) {
    return { start: startSec, end: endSec };
  }

  const startFrame = context.visualTimeline.find(f => Math.abs(f.second - startSec) < 1.0);
  if (startFrame && startFrame.segment_type === 'graphic') {
    newStart = Math.min(endSec - 5, startSec + 3.0);
  }

  const endFrame = context.visualTimeline.find(f => Math.abs(f.second - endSec) < 1.0);
  if (endFrame && endFrame.segment_type === 'graphic') {
    newEnd = Math.max(newStart + 5, endSec - 3.0);
  }

  return { start: newStart, end: newEnd };
}

export function normalizeRankingWeights(
  source: Partial<RankingWeights> = NEXUS_FEATURES.ranking_weights
): RankingWeights {
  const clamped: RankingWeights = {
    original: Math.min(0.8, Math.max(0.3, source.original ?? 0.45)),
    audio: Math.min(0.4, Math.max(0, source.audio ?? 0.15)),
    face: Math.min(0.35, Math.max(0, source.face ?? 0.15)),
    visual: Math.min(0.35, Math.max(0, source.visual ?? 0.1)),
    hook: Math.min(0.35, Math.max(0, source.hook ?? 0.15)),
  };

  const total =
    clamped.original + clamped.audio + clamped.face + clamped.visual + clamped.hook || 1;

  return {
    original: clamped.original / total,
    audio: clamped.audio / total,
    face: clamped.face / total,
    visual: clamped.visual / total,
    hook: clamped.hook / total,
  };
}

export function rankClipCandidates(
  candidates: RankableCandidate[],
  previousWinnerId?: string,
  category?: string,
  timelineCoveragePercent?: number
): RankingDecision {
  const weightsUsed = category && isMultiModalEnabled('category_ranking')
    ? getRankingWeightsForCategory(category)
    : normalizeRankingWeights();
  const scores: Record<string, number> = {};

  // Calculate dynamic exploration bonus:
  // - If coverage < 30%: bonus = 20 (0.20)
  // - If coverage < 60%: bonus = 15 (0.15)
  // - If coverage < 80%: bonus = 10 (0.10)
  // - If coverage < 95%: bonus = 5  (0.05)
  // - Otherwise: bonus = 0
  let explorationBonus = 0;
  if (timelineCoveragePercent !== undefined) {
    if (timelineCoveragePercent < 30) {
      explorationBonus = 0.20;
    } else if (timelineCoveragePercent < 60) {
      explorationBonus = 0.15;
    } else if (timelineCoveragePercent < 80) {
      explorationBonus = 0.10;
    } else if (timelineCoveragePercent < 95) {
      explorationBonus = 0.05;
    }
  }

  const ranked = [...candidates]
    .map((candidate) => {
      const isV3 = candidate.satisfactionScore !== undefined;
      let composite = 0;
      
      if (category === 'football') {
        composite = 
          (candidate.commentaryHype ?? 0) * 0.15 +
          (candidate.goalImportance ?? 0) * 0.15 +
          (candidate.narrativeCompleteness ?? 0) * 0.15 +
          (candidate.storyCompleteness ?? 0) * 0.10 +
          (candidate.tension ?? 0) * 0.15 +
          (candidate.matchImportance ?? 0) * 0.10 +
          (candidate.ballVisibility ?? 0) * 0.10 +
          (candidate.retentionScore ?? 0) * 0.10;
      } else {
        composite = isV3
          ? (candidate.satisfactionScore ?? 0) * 0.35 +
            (candidate.retentionScore ?? 0) * 0.25 +
            (candidate.emotionArcScore ?? 0) * 0.10 +
            (candidate.narrativeScore ?? 0) * 0.10 +
            (candidate.curiosityScore ?? 0) * 0.10 +
            (candidate.payoffScore ?? 0) * 0.05 +
            (candidate.visualScore ?? 0) * 0.05
          : candidate.originalScore * weightsUsed.original +
            candidate.audioScore * weightsUsed.audio +
            candidate.faceScore * weightsUsed.face +
            candidate.visualScore * weightsUsed.visual +
            candidate.hookScore * weightsUsed.hook;

        if (candidate.gameplayDensity !== undefined) {
          composite = composite * 0.70 + (candidate.gameplayDensity * 0.30);
        }
        if (candidate.graphicPenalty !== undefined) {
          composite += (candidate.graphicPenalty / 100);
        }
        if (candidate.replayImportance !== undefined) {
          composite += (candidate.replayImportance / 100);
        }
        if (candidate.eventImportance !== undefined) {
          composite += (candidate.eventImportance / 100);
        }
      }

      // Apply dynamic exploration bonus
      composite += explorationBonus;

      composite = Math.min(1.0, Math.max(0.0, composite));
      scores[candidate.id] = Number((composite * 100).toFixed(2));
      
      return {
        ...candidate,
        composite,
      };
    })
    .sort((left, right) => {
      const maxScore = Math.max(left.composite, right.composite, 0.0001);
      const isTie = Math.abs(left.composite - right.composite) < 0.05 * maxScore;

      if (isTie) {
        if (previousWinnerId && left.id === previousWinnerId) {
          return -1;
        }
        if (previousWinnerId && right.id === previousWinnerId) {
          return 1;
        }
        if (right.faceScore !== left.faceScore) {
          return right.faceScore - left.faceScore;
        }
        if (right.hookScore !== left.hookScore) {
          return right.hookScore - left.hookScore;
        }
        return left.originalIndex - right.originalIndex;
      }

      return right.composite - left.composite;
    });

  const winner = ranked[0] || {
    id: 'none',
    composite: 0,
    originalScore: 0,
    audioScore: 0,
    faceScore: 0,
    visualScore: 0,
    hookScore: 0,
    originalIndex: 0,
    gameplayDensity: 0,
    graphicPenalty: 0,
  };
  const runnerUp = ranked[1];
  const tieReason =
    runnerUp &&
    Math.abs(winner.composite - runnerUp.composite) <
      0.05 * Math.max(winner.composite, runnerUp.composite, 0.0001)
      ? 'Tie resolved with hook-score or previous-winner stability.'
      : 'Top composite score won without tie-break intervention.';

  return {
    orderedIds: ranked.map((candidate) => candidate.id),
    scores,
    topSegmentId: winner.id,
    topSegmentScore: Number((winner.composite * 100).toFixed(2)),
    scoreBreakdown: {
      original_score: Number(winner.originalScore.toFixed(4)),
      audio_score: Number(winner.audioScore.toFixed(4)),
      face_score: Number(winner.faceScore.toFixed(4)),
      visual_score: Number(winner.visualScore.toFixed(4)),
      hook_score: Number(winner.hookScore.toFixed(4)),
      satisfaction_score: winner.satisfactionScore !== undefined ? Number(winner.satisfactionScore.toFixed(4)) : undefined,
      retention_score: winner.retentionScore !== undefined ? Number(winner.retentionScore.toFixed(4)) : undefined,
      gameplay_density: winner.gameplayDensity !== undefined ? Number(winner.gameplayDensity.toFixed(4)) : undefined,
      graphic_penalty: winner.graphicPenalty !== undefined ? Number(winner.graphicPenalty.toFixed(4)) : undefined,
    },
    weightsUsed,
    reasonForSelection: tieReason,
  };
}

function formatSrtTimestamp(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(
    3,
    '0'
  )}`;
}

export function correctSpelling(text: string): string {
  return text
    .replace(/\bTudor\s+Ford\b/gi, 'TUDN')
    .replace(/\bTeebo\s+Sports\b/gi, 'Tigo Sports')
    .replace(/\bselección\s+bélgica\b/gi, 'selección belga')
    .replace(/\bselecci\s+b\b/gi, 'selección belga')
    .replace(/\bselecci\s+nacional\b/gi, 'selección nacional')
    .replace(/\bselecci\b/gi, 'selección')
    .replace(/\bTudor\b/gi, 'TUDN')
    .replace(/\bFord\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSrtFromSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  clipStart: number,
  clipEnd: number
) {
  const subtitleLines = segments
    .filter((segment) => segment.end > clipStart && segment.start < clipEnd)
    .map((segment, index) => {
      const start = Math.max(0, segment.start - clipStart);
      const end = Math.min(clipEnd - clipStart, segment.end - clipStart);
      const cleanText = correctSpelling(segment.text);

      return `${index + 1}
${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}
${cleanText.trim()}
`;
    });

  return subtitleLines.join('\n').trim();
}

export function validateGeneratedFile(filePath?: string | null) {
  if (!filePath) {
    return { exists: false, size: 0 };
  }

  try {
    const stats = fs.statSync(filePath);
    return {
      exists: stats.isFile(),
      size: stats.size,
    };
  } catch {
    return {
      exists: false,
      size: 0,
    };
  }
}

/**
 * Snaps raw AI timestamps to the nearest transcript segment boundaries.
 * Prevents mid-sentence cuts and adds breathable padding.
 */
export function snapToSegmentBoundary(
  rawStartMs: number,
  rawEndMs: number,
  segments: Array<{ start_ms: number; end_ms: number; text: string }>,
  paddingMs: number = 600
): { startMs: number; endMs: number } {
  if (segments.length === 0) {
    return { startMs: rawStartMs, endMs: rawEndMs };
  }

  // Find segment whose start is closest to rawStart
  const startSeg = segments.reduce((prev, curr) =>
    Math.abs(curr.start_ms - rawStartMs) < Math.abs(prev.start_ms - rawStartMs) ? curr : prev
  );

  // Find segment whose end is closest to rawEnd
  const endSeg = segments.reduce((prev, curr) =>
    Math.abs(curr.end_ms - rawEndMs) < Math.abs(prev.end_ms - rawEndMs) ? curr : prev
  );

  return {
    startMs: Math.max(0, startSeg.start_ms - paddingMs),
    endMs: endSeg.end_ms + paddingMs,
  };
}
