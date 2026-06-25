import { DetectedEvent, PipelineContext, WowMoment, WowType } from './PipelineContext';
import { isMultiModalEnabled } from '../../config/features';

export class WowMomentEngine {
  /**
   * Translates adapter-specific events into universal WowMoments.
   */
  public generateWowMoments(context: PipelineContext): WowMoment[] {
    const start = Date.now();

    if (!isMultiModalEnabled('event_engine')) {
      return [];
    }

    const wowMoments: WowMoment[] = [];

    for (const event of context.events) {
      const wowType = this.mapToWowType(event.type);
      const baseScore = event.confidence * 100;

      // Apply modifiers based on other available signals in context
      let bonus = 0;

      // 1. Crowd excitement bonus: if there is an eruption/excitement around the event, boost it
      const nearbyCrowd = context.crowdTimeline.filter(
        (c) => c.timestamp >= event.start && c.timestamp <= event.end
      );
      if (nearbyCrowd.some((c) => c.label === 'eruption')) {
        bonus += 15;
      } else if (nearbyCrowd.some((c) => c.label === 'excited')) {
        bonus += 8;
      }

      // 2. Commentary emotion bonus: if the commentator is very excited/historic, boost it
      const nearbyEmotion = context.commentaryEmotions.filter(
        (e) => Math.abs(e.timestamp - ((event.start + event.end) / 2)) <= 5.0
      );
      if (nearbyEmotion.some((e) => e.level === 'historic_moment')) {
        bonus += 15;
      } else if (nearbyEmotion.some((e) => e.level === 'very_excited')) {
        bonus += 8;
      }

      const finalScore = Math.min(100, Math.max(0, Math.round(baseScore + bonus)));

      wowMoments.push({
        wow_type: wowType,
        score: finalScore,
        source_event: event,
        timestamp: Number(((event.start + event.end) / 2).toFixed(2)),
      });
    }

    // Sort by wow score descending
    wowMoments.sort((a, b) => b.score - a.score);
    context.wowMoments = wowMoments;

    context.executionTimes['WowMomentEngine'] = Date.now() - start;
    console.log(`[WowMomentEngine]: Generated ${wowMoments.length} universal Wow Moments.`);
    return wowMoments;
  }

  /**
   * Maps adapter-specific event types into universal WowTypes.
   */
  private mapToWowType(eventType: string): WowType {
    const type = eventType.toLowerCase();
    switch (type) {
      case 'goal':
      case 'six':
      case 'four':
      case 'dunk':
      case 'buzzer_beater':
        return 'achievement';
      
      case 'knockout':
      case 'wicket':
      case 'submission':
      case 'referee_stoppage':
        return 'shock';
      
      case 'celebration':
      case 'century':
        return 'celebration';
      
      case 'red_card':
      case 'fight':
      case 'conflict':
        return 'conflict';
      
      case 'appeal':
      case 'reaction_peak':
      default:
        return 'surprise';
    }
  }
}
export const wowMomentEngine = new WowMomentEngine();
