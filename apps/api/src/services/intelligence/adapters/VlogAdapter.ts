import { CategoryAdapter, EventDetector, BoundaryRule, ThumbnailPriority } from './BaseAdapter';
import { PipelineContext, DetectedEvent, RankingProfile } from '../PipelineContext';

export class VlogEventDetector implements EventDetector {
  readonly name = 'VlogEventDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.transcriptSegments) {
      for (const seg of context.transcriptSegments) {
        const text = seg.text.toLowerCase();
        const hasLaughter = /\b(haha|hahaha|lol|laughter|laughing|giggle|funny|joke)\b/gi.test(text);
        const hasReaction = /\b(oh my god|omg|wow|no way|unbelievable|look at this|shocked|crazy)\b/gi.test(text);
        const hasMusicDrop = /\b(beat drop|music|song|drop|intro|outro|background)\b/gi.test(text);

        if (hasReaction) {
          events.push({
            type: 'reaction_peak',
            confidence: 0.85,
            start: Math.max(0, seg.start - 1),
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'vlog',
          });
        } else if (hasLaughter) {
          events.push({
            type: 'laughter',
            confidence: 0.80,
            start: seg.start,
            end: seg.end + 1,
            signals: { transcript_hit: 1.0 },
            adapter: 'vlog',
          });
        } else if (hasMusicDrop) {
          events.push({
            type: 'music_drop',
            confidence: 0.75,
            start: seg.start,
            end: seg.end + 2,
            signals: { transcript_hit: 1.0 },
            adapter: 'vlog',
          });
        }
      }
    }
    return events;
  }
}

export class VlogAdapter extends CategoryAdapter {
  readonly category = 'vlog';

  getDetectors(): EventDetector[] {
    return [new VlogEventDetector()];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: 'reaction_peak', preRoll: 2, postRoll: 2, includeCelebration: false, includeReplay: false },
      { eventType: 'laughter', preRoll: 1, postRoll: 2, includeCelebration: false, includeReplay: false },
      { eventType: '*', preRoll: 1.5, postRoll: 1.5, includeCelebration: false, includeReplay: false },
    ];
  }

  getRankingProfile(): RankingProfile {
    return {
      emotion: 0.35,
      visual: 0.30,
      audio: 0.20,
      transcript: 0.15,
    };
  }

  getThumbnailPriority(): ThumbnailPriority[] {
    return [
      { type: 'face', weight: 0.8 },
      { type: 'default', weight: 0.2 },
    ];
  }
}
