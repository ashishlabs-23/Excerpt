/**
 * Standard explainability metadata model for generated clips.
 * Owned strictly by @excerpt/clipping-core.
 */

export interface RankingFactors {
  hookScore: number;       // 0 - 100
  emotionScore: number;    // 0 - 100
  motionScore: number;     // 0 - 100
  storyScore: number;      // 0 - 100
  audioScore: number;      // 0 - 100
  overallScore: number;    // 0 - 100
}

export interface ClipExplainability {
  whySelected: string;
  rankingFactors: RankingFactors;
  confidenceScore: number; // 0.0 - 1.0
  keyThemes?: string[];
  targetAudience?: string;
  viralHooks?: string[];
}

export function buildClipExplainability(params: {
  whySelected: string;
  hookScore?: number;
  emotionScore?: number;
  motionScore?: number;
  storyScore?: number;
  audioScore?: number;
  overallScore?: number;
  confidenceScore?: number;
  keyThemes?: string[];
  targetAudience?: string;
  viralHooks?: string[];
}): ClipExplainability {
  const hook = params.hookScore ?? 75;
  const emotion = params.emotionScore ?? 75;
  const motion = params.motionScore ?? 75;
  const story = params.storyScore ?? 75;
  const audio = params.audioScore ?? 75;
  const overall = params.overallScore ?? Math.round((hook + emotion + motion + story + audio) / 5);

  return {
    whySelected: params.whySelected,
    rankingFactors: {
      hookScore: hook,
      emotionScore: emotion,
      motionScore: motion,
      storyScore: story,
      audioScore: audio,
      overallScore: overall,
    },
    confidenceScore: params.confidenceScore ?? Math.round((overall / 100) * 100) / 100,
    keyThemes: params.keyThemes,
    targetAudience: params.targetAudience,
    viralHooks: params.viralHooks,
  };
}
