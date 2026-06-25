import { SportsAdapter } from './SportsAdapter';
import { EventDetector, BoundaryRule } from './BaseAdapter';
import { PipelineContext, DetectedEvent } from '../PipelineContext';

export class BasketballEventDetector implements EventDetector {
  readonly name = 'BasketballEventDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasDunk = /\b(dunk|dunks|slam dunk|alley oop|jammed it|dunked)\b/gi.test(text);
        const hasBuzzer = /\b(buzzer beater|buzzer-beater|game winner|clutch shot|wins it at the buzzer)\b/gi.test(text);
        const hasBlock = /\b(block|blocked|blocks|rejection|swat|rejected)\b/gi.test(text);
        
        if (hasBuzzer) {
          events.push({
            type: 'buzzer_beater',
            confidence: 0.95,
            start: Math.max(0, seg.start - 5),
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'basketball',
          });
        } else if (hasDunk) {
          events.push({
            type: 'dunk',
            confidence: 0.85,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'basketball',
          });
        } else if (hasBlock) {
          events.push({
            type: 'block',
            confidence: 0.75,
            start: Math.max(0, seg.start - 2),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'basketball',
          });
        }
      }
    }
    return events;
  }
}

export class BasketballAdapter extends SportsAdapter {
  readonly category = 'basketball';

  getDetectors(): EventDetector[] {
    return [
      ...super.getDetectors(),
      new BasketballEventDetector(),
    ];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: 'buzzer_beater', preRoll: 6, postRoll: 4, includeCelebration: true, includeReplay: true },
      { eventType: 'dunk', preRoll: 4, postRoll: 2, includeCelebration: true, includeReplay: true },
      { eventType: '*', preRoll: 3, postRoll: 3, includeCelebration: true, includeReplay: false },
    ];
  }
}
