import { PipelineContext, RetentionPrediction } from './PipelineContext';

export class RetentionPredictionEngine {
  public predict(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): RetentionPrediction {
    const start = Date.now();
    const category = context.category.category;

    // Get signals from other engines
    const narrativeScore = context.narrative?.[clipId]?.narrative_score ?? 50;
    const curiosityScore = context.curiosity?.[clipId]?.curiosity_score ?? 50;
    const payoffStrength = context.payoff?.[clipId]?.payoff_strength ?? 50;
    const emotionalIntensity = context.emotionIntelligence?.[clipId]?.emotional_intensity ?? 50;
    const arcStrength = context.emotionIntelligence?.[clipId]?.arc_strength ?? 50;

    let retention_score = 50; // default baseline

    // Phase 26: Category-Specific Retention Models
    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma' || category === 'esports') {
      // Sports: Retention is heavily based on Events, Reaction, Celebration, and Replays
      const hasReplay = (context.replaySegments || []).some(
        (r) => r.start >= clipStart && r.end <= clipEnd
      );
      const crowdExcitement = context.crowdTimeline.filter(
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
      // Podcasts: Retention is based on Curiosity, Story (narrative), Reveal, and Payoff
      let podcastScore = (curiosityScore * 0.3) + (narrativeScore * 0.3) + (payoffStrength * 0.4);
      retention_score = podcastScore;

    } else if (category === 'reaction') {
      // Reaction Videos: Retention is based on Face emotion, Shock, Audience empathy
      const facePresence = context.rankingProfile.face ?? 0.3; // proxy for face visibility
      let reactionScore = (emotionalIntensity * 0.5) + (arcStrength * 0.3) + (facePresence * 20);
      retention_score = reactionScore;

    } else if (category === 'tutorial') {
      // Education/Tutorial: Retention based on Question, Explanation, Aha Moment (payoff)
      let eduScore = (curiosityScore * 0.2) + (payoffStrength * 0.5) + (narrativeScore * 0.3);
      retention_score = eduScore;

    } else {
      // Default / Vlog retention model
      retention_score = (narrativeScore * 0.25) + (curiosityScore * 0.25) + (payoffStrength * 0.25) + (emotionalIntensity * 0.25);
    }

    retention_score = Math.min(100, Math.max(0, Math.round(retention_score)));

    // expected completion rate is closely tied to retention score and curiosity gap
    const expected_completion_rate = Math.round(retention_score * 0.8 + curiosityScore * 0.15);
    // rewatch rate is tied to emotional intensity, payoffs, and category
    let expected_rewatch_rate = Math.round(emotionalIntensity * 0.5 + payoffStrength * 0.3);
    if (category === 'reaction' || category === 'football') {
      expected_rewatch_rate += 10; // sports and reaction clips are highly rewatchable
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

export const retentionPredictionEngine = new RetentionPredictionEngine();
