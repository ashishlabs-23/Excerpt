import { SportsAdapter } from './SportsAdapter';
import { EventDetector, BoundaryRule } from './BaseAdapter';
import { PipelineContext, DetectedEvent } from '../PipelineContext';

export class FootballGoalDetector implements EventDetector {
  readonly name = 'FootballGoalDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasGoal = /\b(goal|goals|scores|header|volley|penalty|strike|beaten|shot|shoot|net)\b/gi.test(text);
        if (hasGoal) {
          events.push({
            type: 'Goal',
            confidence: 0.90,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'football',
          });
        }
      }
    }
    return events;
  }
}

export class FootballCardDetector implements EventDetector {
  readonly name = 'FootballCardDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasCard = /\b(red card|yellow card|foul|referee|tackle|booked|card)\b/gi.test(text);
        if (hasCard) {
          events.push({
            type: 'Card',
            confidence: 0.80,
            start: Math.max(0, seg.start - 2),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'football',
          });
        }
      }
    }
    return events;
  }
}

export class FootballCelebrationDetector implements EventDetector {
  readonly name = 'FootballCelebrationDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasCelebration = /\b(celebrat|cheer|crowd erupts|wild|jumping|slide|hugging|stadium erupts)\b/gi.test(text);
        if (hasCelebration) {
          events.push({
            type: 'PlayerReaction',
            confidence: 0.85,
            start: seg.start,
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'football',
          });
        }
      }
    }
    return events;
  }
}

export class FootballAdapter extends SportsAdapter {
  readonly category = 'football';

  getDetectors(): EventDetector[] {
    // Combine base sports detectors (crowd surge, optical flow, replay) with football-specific ones
    return [
      ...super.getDetectors(),
      new FootballGoalDetector(),
      new FootballCardDetector(),
      new FootballCelebrationDetector(),
    ];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: 'goal', preRoll: 5, postRoll: 3, includeCelebration: true, includeReplay: true },
      { eventType: 'celebration', preRoll: 2, postRoll: 3, includeCelebration: false, includeReplay: false },
      { eventType: 'red_card', preRoll: 3, postRoll: 3, includeCelebration: true, includeReplay: true },
      { eventType: '*', preRoll: 4, postRoll: 4, includeCelebration: true, includeReplay: true },
    ];
  }
}
