import { PipelineContext, RetentionPrediction, EmotionTimelinePoint, RetentionCurvePoint } from './PipelineContext';

export class RetentionPredictionEngine {
  /**
   * Generates a second-by-second simulated retention curve R(t) from t=0 to t=duration.
   */
  private simulateRetentionCurve(
    clipStart: number,
    clipEnd: number,
    curiosityScore: number,
    hookVelocity: number,
    emotionalIntensity: number,
    payoffStrength: number,
    context: PipelineContext
  ): { curve: RetentionCurvePoint[]; scrollStopRate: number; dropOffRisk: 'low' | 'medium' | 'high' } {
    const duration = Math.max(3, Math.round(clipEnd - clipStart));
    const curve: RetentionCurvePoint[] = [];

    // 1. Initial 3-second scroll stop survival probability (0 to 100)
    // Strong hook velocity and high curiosity reduce instant swipe-away
    const initialHazard = Math.max(0.08, 0.45 - (hookVelocity * 0.0028) - (curiosityScore * 0.0015));
    const scrollStopRate = Math.min(98, Math.max(40, Math.round(100 * (1 - initialHazard))));

    let currentRetention = 100;
    curve.push({ second: 0, percentage: 100 });

    const wowTimes: number[] = (context.wowMoments || []).map(w => w.timestamp);
    const audioSpikes: number[] = (context.vig?.audio || []).filter(a => (a.energy || 0) > 0.75).map(a => a.time);

    for (let s = 1; s <= duration; s++) {
      const currentSecTimestamp = clipStart + s;
      const progress = s / duration;

      let secondHazard = 0.015; // baseline decay per second

      // First 3 seconds (The Scroll Barrier)
      if (s <= 3) {
        secondHazard = initialHazard / 3.0;
      } else if (progress <= 0.65) {
        // Mid-roll decay (modulated by narrative and pacing)
        secondHazard = 0.012 - (emotionalIntensity * 0.00006);
      } else {
        // Climax approach: if payoff is strong, retention stabilizes or even spikes
        const climaxShield = (payoffStrength / 100) * 0.012;
        secondHazard = Math.max(0.002, 0.014 - climaxShield);
      }

      // Check if there's a Wow Moment or Audio Energy Spike in this second
      const hasWow = wowTimes.some((t: number) => Math.abs(t - currentSecTimestamp) <= 1.0);
      const hasSpike = audioSpikes.some((t: number) => Math.abs(t - currentSecTimestamp) <= 1.0);

      if (hasWow || hasSpike) {
        // Re-engagement boost cancels decay for this second
        secondHazard = -0.005;
      }

      currentRetention = Math.max(15, Math.min(100, currentRetention * (1 - secondHazard)));
      curve.push({
        second: s,
        percentage: Math.round(currentRetention)
      });
    }

    const finalRetention = curve[curve.length - 1]?.percentage || 50;
    const dropOffRisk: 'low' | 'medium' | 'high' =
      finalRetention >= 65 ? 'low' : finalRetention >= 40 ? 'medium' : 'high';

    return { curve, scrollStopRate, dropOffRisk };
  }

  /**
   * Calculates how cleanly the ending loops back to the start (seamless repetition).
   */
  private computeLoopability(clipStart: number, clipEnd: number, context: PipelineContext): number {
    const segments = context.transcriptSegments || [];
    const firstSeg = segments.find(s => s.start >= clipStart);
    const lastSeg = segments.filter(s => s.end <= clipEnd).pop();

    if (!firstSeg || !lastSeg) return 50;

    let score = 55;
    const endText = lastSeg.text.trim().toLowerCase();
    const startText = firstSeg.text.trim().toLowerCase();

    // Incomplete trailing sentences or connecting conjunctions prompt loop restarts
    const loopStarters = ['and that is why', 'which is why', 'so that explains', 'the reason is', 'because'];
    if (loopStarters.some(ls => endText.startsWith(ls) || endText.endsWith(ls))) {
      score += 25;
    }

    // Question at end that gets answered at beginning
    if (endText.includes('?') && !startText.includes('?')) {
      score += 20;
    }

    // Audio energy continuity: if ending audio energy matches start audio energy smoothly
    const audioNodes = context.vig?.audio || [];
    const startAudio = audioNodes.find(a => Math.abs(a.time - clipStart) <= 1.0);
    const endAudio = audioNodes.find(a => Math.abs(a.time - clipEnd) <= 1.0);
    if (startAudio && endAudio && Math.abs((startAudio.energy || 0) - (endAudio.energy || 0)) < 0.2) {
      score += 10;
    }

    return Math.min(100, Math.max(20, score));
  }

  public predict(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): RetentionPrediction {
    const start = Date.now();
    const category = context.category.category;

    // Signals from context
    const narrativeScore = context.narrative?.[clipId]?.narrative_score ?? 50;
    const curiosityScore = context.curiosity?.[clipId]?.curiosity_score ?? 50;
    const hookVelocity = context.curiosity?.[clipId]?.hook_velocity_index ?? 50;
    const payoffStrength = context.payoff?.[clipId]?.payoff_strength ?? 50;
    const emotionalIntensity = context.emotionIntelligence?.[clipId]?.emotional_intensity ?? 50;
    const arcStrength = context.emotionIntelligence?.[clipId]?.arc_strength ?? 50;

    let retention_score = 50;

    // Category-specific retention model
    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma' || category === 'esports') {
      const hasReplay = (context.replaySegments || []).some(r => r.start >= clipStart && r.end <= clipEnd);
      const crowdExcitement = (context.crowdTimeline || []).filter(c => c.timestamp >= clipStart && c.timestamp <= clipEnd);
      const hasCelebration = crowdExcitement.some(c => c.label === 'eruption');

      let sportsScore = 52 + (hookVelocity * 0.20);
      if (hasReplay) sportsScore += 12;
      if (hasCelebration) sportsScore += 18;
      sportsScore += (emotionalIntensity - 50) * 0.35;
      retention_score = sportsScore;
    } else if (category === 'podcast' || category === 'interview' || category === 'documentary') {
      retention_score = (hookVelocity * 0.25) + (curiosityScore * 0.25) + (narrativeScore * 0.20) + (payoffStrength * 0.30);
      if (narrativeScore > 75 && emotionalIntensity < 35) {
        retention_score -= 8;
      }
    } else if (category === 'reaction') {
      retention_score = (emotionalIntensity * 0.45) + (hookVelocity * 0.25) + (arcStrength * 0.30);
    } else {
      retention_score = (hookVelocity * 0.30) + (curiosityScore * 0.20) + (payoffStrength * 0.25) + (emotionalIntensity * 0.25);
    }

    // Synergistic Hook x Payoff Bonus
    if (curiosityScore >= 70 && payoffStrength >= 70) {
      retention_score *= 1.12;
    } else if (curiosityScore > 80 && payoffStrength < 45) {
      retention_score = Math.max(20, retention_score - 18);
    }

    retention_score = Math.min(100, Math.max(15, Math.round(retention_score)));

    // Second-by-Second Simulation
    const { curve, scrollStopRate, dropOffRisk } = this.simulateRetentionCurve(
      clipStart,
      clipEnd,
      curiosityScore,
      hookVelocity,
      emotionalIntensity,
      payoffStrength,
      context
    );

    const loopability_quotient = this.computeLoopability(clipStart, clipEnd, context);

    // Calibrate Expected Completion Rate from simulated final curve percentage
    const finalPct = curve[curve.length - 1]?.percentage || 50;
    const expected_completion_rate = Math.min(100, Math.max(10, Math.round(finalPct * 0.85 + payoffStrength * 0.15)));

    // Calibrate Rewatch Rate
    let expected_rewatch_rate = Math.round(emotionalIntensity * 0.35 + loopability_quotient * 0.35 + payoffStrength * 0.20);
    if (category === 'reaction' || category === 'esports' || category === 'football') {
      expected_rewatch_rate += 8;
    }
    expected_rewatch_rate = Math.min(100, Math.max(10, expected_rewatch_rate));

    const result: RetentionPrediction = {
      retention_score,
      expected_completion_rate,
      expected_rewatch_rate,
      scroll_stop_rate: scrollStopRate,
      loopability_quotient,
      drop_off_risk: dropOffRisk,
      retention_curve: curve
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
