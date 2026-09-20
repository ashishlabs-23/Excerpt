import { PipelineContext, RetentionPrediction, EmotionTimelinePoint } from './PipelineContext';

export class RetentionPredictionEngine {
  /**
   * Evaluates temporal energy distribution across the clip.
   * If >70% of the emotional intensity is concentrated solely in the first 30% of the duration,
   * viewer abandonment mid-clip is high (temporal decay penalty).
   * If energy peaks towards the end (climax/payoff), completion rate increases.
   */
  private computeTemporalDecayModifier(
    clipStart: number,
    clipEnd: number,
    timeline: EmotionTimelinePoint[] = []
  ): { completionMod: number; retentionMod: number } {
    const duration = clipEnd - clipStart;
    if (duration <= 0 || timeline.length === 0) {
      return { completionMod: 0, retentionMod: 0 };
    }

    const clipPoints = timeline.filter(p => p.timestamp >= clipStart && p.timestamp <= clipEnd);
    if (clipPoints.length === 0) {
      return { completionMod: 0, retentionMod: 0 };
    }

    const firstThirdEnd = clipStart + duration * 0.33;
    const finalThirdStart = clipStart + duration * 0.67;

    let earlyMass = 0;
    let lateMass = 0;
    let totalMass = 0;

    for (const pt of clipPoints) {
      const mass = Math.max(1, pt.intensity || 50);
      totalMass += mass;
      if (pt.timestamp <= firstThirdEnd) {
        earlyMass += mass;
      } else if (pt.timestamp >= finalThirdStart) {
        lateMass += mass;
      }
    }

    if (totalMass === 0) return { completionMod: 0, retentionMod: 0 };

    const earlyRatio = earlyMass / totalMass;
    const lateRatio = lateMass / totalMass;

    // Severe front-loading (clickbait / weak body)
    if (earlyRatio >= 0.70) {
      return { completionMod: -12, retentionMod: -8 };
    }

    // Climactic crescendo (energy builds to conclusion)
    if (lateRatio >= 0.45) {
      return { completionMod: +8, retentionMod: +6 };
    }

    return { completionMod: 0, retentionMod: 0 };
  }

  public predict(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): RetentionPrediction {
    const start = Date.now();
    const category = context.category.category;

    // Get signals from other engines with safe defaults
    const narrativeScore = context.narrative?.[clipId]?.narrative_score ?? 50;
    const curiosityScore = context.curiosity?.[clipId]?.curiosity_score ?? 50;
    const payoffStrength = context.payoff?.[clipId]?.payoff_strength ?? 50;
    const emotionalIntensity = context.emotionIntelligence?.[clipId]?.emotional_intensity ?? 50;
    const arcStrength = context.emotionIntelligence?.[clipId]?.arc_strength ?? 50;
    const emotionTimeline = context.emotionIntelligence?.[clipId]?.emotion_timeline ?? [];

    let retention_score = 50; // default baseline

    // 1. Category-Specific Bayesian Prior & Likelihood Fusion
    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma' || category === 'esports') {
      // Sports: Events, Replays, Crowd Eruptions, and Reaction Intensity
      const hasReplay = (context.replaySegments || []).some(
        (r) => r.start >= clipStart && r.end <= clipEnd
      );
      const crowdExcitement = (context.crowdTimeline || []).filter(
        (c) => c.timestamp >= clipStart && c.timestamp <= clipEnd
      );
      const hasCelebration = crowdExcitement.some(c => c.label === 'eruption');

      let sportsScore = 50;
      if (hasReplay) sportsScore += 15;
      if (hasCelebration) sportsScore += 20;
      
      // Match with emotional intensity (reaction)
      sportsScore += (emotionalIntensity - 50) * 0.4;
      retention_score = sportsScore;

    } else if (category === 'podcast' || category === 'interview' || category === 'documentary') {
      // Podcasts: Curiosity (30%), Narrative Structure (30%), Payoff (40%)
      const podcastScore = (curiosityScore * 0.30) + (narrativeScore * 0.30) + (payoffStrength * 0.40);
      retention_score = podcastScore;

      // Cross-signal penalty: High narrative premise but flat emotion
      if (narrativeScore > 75 && emotionalIntensity < 35) {
        retention_score -= 10;
      }

    } else if (category === 'reaction') {
      // Reaction Videos: Face emotion (50%), Arc (30%), Face visibility proxy (20%)
      const facePresence = context.rankingProfile.face ?? 0.3; // proxy for face visibility
      const reactionScore = (emotionalIntensity * 0.50) + (arcStrength * 0.30) + (facePresence * 20);
      retention_score = reactionScore;

    } else if (category === 'tutorial') {
      // Education/Tutorial: Curiosity (20%), Payoff (50%), Narrative (30%)
      const eduScore = (curiosityScore * 0.20) + (payoffStrength * 0.50) + (narrativeScore * 0.30);
      retention_score = eduScore;

    } else {
      // General / Vlog / Entertainment retention model
      retention_score = (narrativeScore * 0.25) + (curiosityScore * 0.25) + (payoffStrength * 0.25) + (emotionalIntensity * 0.25);
    }

    // 2. Hook x Payoff Synergetic Virality Interaction
    // If both Hook (curiosity/narrative) > 70 AND Payoff > 70, apply synergistic bonus
    if (curiosityScore >= 70 && payoffStrength >= 70) {
      retention_score = retention_score * 1.12; // 12% synergetic retention lift
    } else if (curiosityScore > 80 && payoffStrength < 45) {
      // Severe curiosity gap letdown penalty
      retention_score = Math.max(15, retention_score - 20);
    }

    // 3. Temporal Energy Distribution Check
    const temporalMod = this.computeTemporalDecayModifier(clipStart, clipEnd, emotionTimeline);
    retention_score += temporalMod.retentionMod;

    retention_score = Math.min(100, Math.max(0, Math.round(retention_score)));

    // 4. Calibrated Expected Completion Rate
    let expected_completion_rate = Math.round(retention_score * 0.78 + curiosityScore * 0.15 + (payoffStrength >= 65 ? 5 : 0));
    expected_completion_rate += temporalMod.completionMod;
    expected_completion_rate = Math.min(100, Math.max(0, expected_completion_rate));

    // 5. Calibrated Expected Rewatch Rate
    let expected_rewatch_rate = Math.round(emotionalIntensity * 0.45 + payoffStrength * 0.30 + arcStrength * 0.15);
    if (category === 'reaction' || category === 'football' || category === 'basketball') {
      expected_rewatch_rate += 10; // sports & reaction moments have high rewatch propensity
    }
    if (hasCelebrationOrClimax(context, clipStart, clipEnd)) {
      expected_rewatch_rate += 8;
    }
    expected_rewatch_rate = Math.min(100, Math.max(0, expected_rewatch_rate));

    const result: RetentionPrediction = {
      retention_score,
      expected_completion_rate,
      expected_rewatch_rate
    };

    if (!context.retention) {
      context.retention = {};
    }
    context.retention[clipId] = result;

    context.executionTimes['RetentionPredictionEngine'] = (context.executionTimes['RetentionPredictionEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

function hasCelebrationOrClimax(context: PipelineContext, clipStart: number, clipEnd: number): boolean {
  return (context.wowMoments || []).some(w => w.timestamp >= clipStart && w.timestamp <= clipEnd);
}

export const retentionPredictionEngine = new RetentionPredictionEngine();
