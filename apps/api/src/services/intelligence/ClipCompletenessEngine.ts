import { PipelineContext, CompletenessResult } from './PipelineContext';

export class ClipCompletenessEngine {
  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): CompletenessResult {
    const start = Date.now();
    const category = context.category.category;
    let completeness_score = 70; // baseline default

    const narrative = context.narrative?.[clipId];
    const payoff = context.payoff?.[clipId];

    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma' || category === 'esports') {
      // Sports Completeness: requires Build-up, Event, Reaction, Celebration
      // 1. Build-up (prior to event)
      // 2. Event (WowMoment present)
      // 3. Reaction / Celebration
      const hasEvent = (context.wowMoments || []).some(
        (w) => w.timestamp >= clipStart && w.timestamp <= clipEnd
      );
      const crowdTimeline = context.crowdTimeline.filter(
        (c) => c.timestamp >= clipStart && c.timestamp <= clipEnd
      );
      const hasReaction = crowdTimeline.some(c => c.label === 'excited' || c.label === 'eruption');

      if (hasEvent && hasReaction) {
        completeness_score = 95;
      } else if (hasEvent) {
        completeness_score = 80;
      } else {
        completeness_score = 50; // no wow/event in a sports clip makes it feel incomplete
      }
    } else {
      // Talk categories completeness: setup, context, reveal, payoff
      if (narrative && payoff) {
        const hasSetup = narrative.setup_start !== undefined;
        const hasPayoff = payoff.payoff_strength > 60;
        const hasReveal = narrative.reveal_start !== undefined;

        if (hasSetup && hasReveal && hasPayoff) {
          completeness_score = 98;
        } else if (hasSetup && hasPayoff) {
          completeness_score = 85;
        } else if (hasPayoff) {
          completeness_score = 75;
        } else {
          completeness_score = 45; // starts in middle or ends before payoff
        }
      }
    }

    completeness_score = Math.min(100, Math.max(0, completeness_score));

    const result: CompletenessResult = { completeness_score };

    if (!context.completeness) {
      context.completeness = {};
    }
    context.completeness[clipId] = result;

    context.executionTimes['ClipCompletenessEngine'] = (context.executionTimes['ClipCompletenessEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const clipCompletenessEngine = new ClipCompletenessEngine();
