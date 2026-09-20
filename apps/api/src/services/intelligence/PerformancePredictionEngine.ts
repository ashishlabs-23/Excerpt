import { PipelineContext } from './PipelineContext';

export interface PerformancePredictionResult {
  virality_index: number; // 0 - 100
  virality_tier: 'top_1%' | 'top_5%' | 'top_20%' | 'standard';
  editorial_score: number;
  acoustic_score: number;
  visual_score: number;
  retention_score: number;
  expected_completion_rate: number;
  expected_rewatch_rate: number;
  platform_fit: {
    tiktok: number; // 0 - 100
    youtube_shorts: number; // 0 - 100
    instagram_reels: number; // 0 - 100
  };
  key_drivers: string[];
  recommendations: string[];
}

export class PerformancePredictionEngine {
  private readonly archetypeMultipliers: Record<string, number> = {
    'Massive Mistake': 1.12,
    'Contrarian Truth': 1.10,
    'Transformation Story': 1.08,
    'Counter-Intuitive Hack': 1.10,
    'Relatable Confession': 1.06,
    'Unresolved Mystery / Infinite Loop': 1.14,
    'Standard Discussion': 0.95,
  };

  /**
   * Computes comprehensive composite performance prediction and virality index for a clip candidate.
   */
  public predict(
    clipId: string,
    clipStart: number,
    clipEnd: number,
    context: PipelineContext
  ): PerformancePredictionResult {
    const start = Date.now();
    const durationSec = Math.max(1, clipEnd - clipStart);

    // 1. Editorial Component (Curiosity + Payoff + Narrative)
    const curiosity = context.curiosity?.[clipId]?.curiosity_score ?? 60;
    const payoff = context.payoff?.[clipId]?.payoff_strength ?? 60;
    const narrative = context.narrative?.[clipId]?.narrative_score ?? 60;
    const editorialScore = Math.round(curiosity * 0.40 + payoff * 0.35 + narrative * 0.25);

    // 2. Acoustic Component (Speaking Rate + Emotion Intensity)
    const emotionIntel = context.emotionIntelligence?.[clipId];
    const emotionalIntensity = emotionIntel?.emotional_intensity ?? 60;

    const clipWords = (context.transcriptSegments || [])
      .filter((s) => s.start >= clipStart && s.end <= clipEnd)
      .flatMap((s) => (s.text || '').trim().split(/\s+/))
      .filter(Boolean);

    const wpm = (clipWords.length / durationSec) * 60;
    // Ideal short-form speaking rate: 130 - 170 WPM
    let paceScore = 80;
    if (wpm >= 130 && wpm <= 170) {
      paceScore = 95;
    } else if (wpm < 100) {
      paceScore = Math.max(40, 80 - (100 - wpm));
    } else if (wpm > 200) {
      paceScore = Math.max(50, 80 - (wpm - 200) * 0.5);
    }

    const acousticScore = Math.round(paceScore * 0.55 + emotionalIntensity * 0.45);

    // 3. Visual & Dynamic Component
    const hasWowMoment = (context.wowMoments || []).some(
      (w) => w.timestamp >= clipStart && w.timestamp <= clipEnd
    );
    let visualScore = 70;
    if (hasWowMoment) visualScore += 20;
    const cat = context.category?.category;
    if (cat && (cat === 'football' || cat === 'basketball' || cat === 'esports' || cat === 'mma' || cat === 'cricket')) {
      visualScore = Math.min(100, visualScore + 10);
    }

    // 4. Retention Prediction Component
    const retentionData = context.retention?.[clipId];
    const retentionScore = retentionData?.retention_score ?? 65;
    const expectedCompletionRate = retentionData?.expected_completion_rate ?? 65;
    const expectedRewatchRate = retentionData?.expected_rewatch_rate ?? 15;

    // 5. Viral Archetype Weight
    const patternName = context.viralPatterns?.[clipId]?.pattern || 'Standard Discussion';
    const multiplier = this.archetypeMultipliers[patternName] ?? 1.0;

    // 6. Composite Virality Index (0 - 100)
    const baseComposite =
      editorialScore * 0.35 +
      retentionScore * 0.30 +
      acousticScore * 0.20 +
      visualScore * 0.15;

    const viralityIndex = Math.min(100, Math.max(10, Math.round(baseComposite * multiplier)));

    // 7. Virality Tier Assignment
    let viralityTier: PerformancePredictionResult['virality_tier'] = 'standard';
    if (viralityIndex >= 90) {
      viralityTier = 'top_1%';
    } else if (viralityIndex >= 80) {
      viralityTier = 'top_5%';
    } else if (viralityIndex >= 70) {
      viralityTier = 'top_20%';
    }

    // 8. Platform Fit Scores
    const tiktok = Math.min(100, Math.round(curiosity * 0.45 + emotionalIntensity * 0.35 + visualScore * 0.20));
    const youtubeShorts = Math.min(100, Math.round(editorialScore * 0.45 + retentionScore * 0.35 + acousticScore * 0.20));
    const instagramReels = Math.min(100, Math.round(visualScore * 0.40 + emotionalIntensity * 0.30 + editorialScore * 0.30));

    // 9. Key Drivers & Editorial Recommendations
    const keyDrivers: string[] = [];
    const recommendations: string[] = [];

    if (curiosity > 75) keyDrivers.push(`High opening curiosity hook (${curiosity}/100)`);
    if (payoff > 75) keyDrivers.push(`Satisfying narrative conclusion and promise delivery (${payoff}/100)`);
    if (hasWowMoment) keyDrivers.push('Includes peak engagement visual/event highlight');
    if (multiplier > 1.05) keyDrivers.push(`Matches viral storytelling archetype: '${patternName}'`);

    if (curiosity < 65) recommendations.push('Consider trimming earlier into the primary hook sentence.');
    if (payoff < 60) recommendations.push('Extend concluding boundary by 2-3s to fully resolve the core message.');
    if (wpm < 110) recommendations.push('Apply micro-jumpcuts or pace acceleration to increase viewer retention.');

    const result: PerformancePredictionResult = {
      virality_index: viralityIndex,
      virality_tier: viralityTier,
      editorial_score: editorialScore,
      acoustic_score: acousticScore,
      visual_score: visualScore,
      retention_score: retentionScore,
      expected_completion_rate: expectedCompletionRate,
      expected_rewatch_rate: expectedRewatchRate,
      platform_fit: {
        tiktok,
        youtube_shorts: youtubeShorts,
        instagram_reels: instagramReels,
      },
      key_drivers: keyDrivers,
      recommendations: recommendations,
    };

    if (!context.performancePrediction) {
      context.performancePrediction = {};
    }
    context.performancePrediction[clipId] = result;

    context.executionTimes['PerformancePredictionEngine'] =
      (context.executionTimes['PerformancePredictionEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const performancePredictionEngine = new PerformancePredictionEngine();
