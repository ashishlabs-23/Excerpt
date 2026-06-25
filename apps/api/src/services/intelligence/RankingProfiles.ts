import { RankingProfile } from './PipelineContext';

/**
 * Category-specific ranking profiles.
 * Maps specialized multi-modal weights to the existing RankableCandidate schema:
 *   - originalScore -> event / transcript (primary weight)
 *   - audioScore    -> crowd excitement / audio levels
 *   - faceScore     -> celebration pose / face presence
 *   - visualScore   -> replay segments / visual activity
 *   - hookScore     -> commentary emotion / text hook
 */
export const RANKING_PROFILES: Record<string, RankingProfile> = {
  podcast:    { transcript: 0.40, hook: 0.30, emotion: 0.20, visual: 0.10 },
  interview:  { transcript: 0.35, hook: 0.30, emotion: 0.25, visual: 0.10 },
  football:   { event: 0.40, crowd: 0.20, celebration: 0.15, replay: 0.05, commentary: 0.20 },
  cricket:    { event: 0.40, crowd: 0.20, celebration: 0.15, replay: 0.05, commentary: 0.20 },
  basketball: { event: 0.45, crowd: 0.25, celebration: 0.15, replay: 0.00, commentary: 0.15 },
  mma:        { event: 0.50, crowd: 0.15, celebration: 0.00, replay: 0.15, commentary: 0.20 },
  reaction:   { transcript: 0.20, audio: 0.10, face: 0.30, visual: 0.00, emotion: 0.40 }, // maps to hookScore as emotion
  vlog:       { transcript: 0.15, audio: 0.20, face: 0.00, visual: 0.30, emotion: 0.35 },
};

/**
 * Resolves a RankingProfile to a standardized RankingWeights configuration.
 */
export function getRankingWeightsForCategory(category: string): {
  original: number;
  audio: number;
  face: number;
  visual: number;
  hook: number;
} {
  const profile = RANKING_PROFILES[category] || RANKING_PROFILES.podcast;

  const original = profile.event ?? profile.transcript ?? 0.45;
  const audio = profile.crowd ?? profile.audio ?? 0.15;
  const face = profile.celebration ?? profile.face ?? 0.15;
  const visual = profile.replay ?? profile.visual ?? 0.10;
  const hook = profile.commentary ?? profile.emotion ?? 0.15;

  const total = original + audio + face + visual + hook || 1.0;

  return {
    original: original / total,
    audio: audio / total,
    face: face / total,
    visual: visual / total,
    hook: hook / total,
  };
}
