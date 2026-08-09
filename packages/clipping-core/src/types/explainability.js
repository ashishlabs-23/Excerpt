"use strict";
/**
 * Standard explainability metadata model for generated clips.
 * Owned strictly by @excerpt/clipping-core.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClipExplainability = buildClipExplainability;
function buildClipExplainability(params) {
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
