import { SportsAdapter } from './SportsAdapter';
import { EventDetector, BoundaryRule } from './BaseAdapter';
import { PipelineContext, DetectedEvent } from '../PipelineContext';

export class CricketBoundaryDetector implements EventDetector {
  readonly name = 'CricketBoundaryDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasSix = /\b(six|sixes|maximum|out of the ground|over the rope|massive hit|huge hit)\b/gi.test(text);
        const hasFour = /\b(four|fours|boundary|boundaries|to the fence|races away|crack)\b/gi.test(text);
        if (hasSix) {
          events.push({
            type: 'six',
            confidence: 0.95,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0, is_six: 1.0 },
            adapter: 'cricket',
          });
        } else if (hasFour) {
          events.push({
            type: 'four',
            confidence: 0.85,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0, is_four: 1.0 },
            adapter: 'cricket',
          });
        }
      }
    }
    return events;
  }
}

export class CricketWicketDetector implements EventDetector {
  readonly name = 'CricketWicketDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasWicket = /\b(wicket|wickets|bowled|caught|lbw|run out|stumped|clean bowled|dismissed|got him|appeal|howzat)\b/gi.test(text);
        if (hasWicket) {
          events.push({
            type: 'wicket',
            confidence: 0.90,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'cricket',
          });
        }
      }
    }
    return events;
  }
}

export class CricketCenturyDetector implements EventDetector {
  readonly name = 'CricketCenturyDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasCentury = /\b(century|hundred|fifty|half.century|milestone|raise the bat)\b/gi.test(text);
        if (hasCentury) {
          events.push({
            type: 'century',
            confidence: 0.90,
            start: Math.max(0, seg.start - 2),
            end: seg.end + 4,
            signals: { transcript_hit: 1.0 },
            adapter: 'cricket',
          });
        }
      }
    }
    return events;
  }
}

export class CricketAdapter extends SportsAdapter {
  readonly category = 'cricket';

  getDetectors(): EventDetector[] {
    return [
      ...super.getDetectors(),
      new CricketBoundaryDetector(),
      new CricketWicketDetector(),
      new CricketCenturyDetector(),
    ];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: 'six', preRoll: 4, postRoll: 3, includeCelebration: true, includeReplay: false },
      { eventType: 'four', preRoll: 4, postRoll: 3, includeCelebration: true, includeReplay: false },
      { eventType: 'wicket', preRoll: 3, postRoll: 5, includeCelebration: true, includeReplay: true },
      { eventType: 'century', preRoll: 2, postRoll: 6, includeCelebration: true, includeReplay: false },
      { eventType: '*', preRoll: 4, postRoll: 4, includeCelebration: true, includeReplay: false },
    ];
  }
}
