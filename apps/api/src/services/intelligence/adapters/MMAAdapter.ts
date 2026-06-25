import { SportsAdapter } from './SportsAdapter';
import { EventDetector, BoundaryRule } from './BaseAdapter';
import { PipelineContext, DetectedEvent } from '../PipelineContext';

export class MMAEventDetector implements EventDetector {
  readonly name = 'MMAEventDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasKnockout = /\b(knockout|ko|tko|knocked out|out cold|asleep|chin|canvas)\b/gi.test(text);
        const hasKnockdown = /\b(knockdown|wobbled|dropped|rocked|staggered|hurt him)\b/gi.test(text);
        const hasSubmission = /\b(submission|tap out|tapped|choke|guillotine|rear naked choke|armbar)\b/gi.test(text);
        const hasStoppage = /\b(referee stoppage|stops the fight|stops it|referee steps in|fight is over)\b/gi.test(text);

        if (hasKnockout) {
          events.push({
            type: 'knockout',
            confidence: 0.95,
            start: Math.max(0, seg.start - 6),
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'mma',
          });
        } else if (hasSubmission) {
          events.push({
            type: 'submission',
            confidence: 0.90,
            start: Math.max(0, seg.start - 5),
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'mma',
          });
        } else if (hasKnockdown) {
          events.push({
            type: 'knockdown',
            confidence: 0.80,
            start: Math.max(0, seg.start - 4),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'mma',
          });
        } else if (hasStoppage) {
          events.push({
            type: 'referee_stoppage',
            confidence: 0.85,
            start: Math.max(0, seg.start - 3),
            end: seg.end + 3,
            signals: { transcript_hit: 1.0 },
            adapter: 'mma',
          });
        }
      }
    }
    return events;
  }
}

export class MMAAdapter extends SportsAdapter {
  readonly category = 'mma';

  getDetectors(): EventDetector[] {
    return [
      ...super.getDetectors(),
      new MMAEventDetector(),
    ];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: 'knockout', preRoll: 8, postRoll: 5, includeCelebration: false, includeReplay: true },
      { eventType: 'submission', preRoll: 7, postRoll: 4, includeCelebration: true, includeReplay: true },
      { eventType: '*', preRoll: 5, postRoll: 3, includeCelebration: true, includeReplay: true },
    ];
  }
}
