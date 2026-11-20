import { CategoryAdapter, EventDetector, BoundaryRule, ThumbnailPriority } from './BaseAdapter';
import { PipelineContext, DetectedEvent, RankingProfile } from '../PipelineContext';

export class CrowdSurgeDetector implements EventDetector {
  readonly name = 'CrowdSurgeDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.crowdTimeline && context.crowdTimeline.length > 0) {
      let currentEvent: DetectedEvent | null = null;
      for (const score of context.crowdTimeline) {
        if (score.label === 'eruption' || score.label === 'excited') {
          if (!currentEvent) {
            currentEvent = {
              type: 'crowd_surge',
              confidence: Number((score.score / 100).toFixed(2)),
              start: score.timestamp,
              end: score.timestamp + 1,
              signals: { crowd_score: score.score },
              adapter: 'sports',
            };
          } else {
            currentEvent.end = score.timestamp + 1;
            currentEvent.confidence = Math.max(currentEvent.confidence, Number((score.score / 100).toFixed(2)));
            currentEvent.signals.crowd_score = Math.max(currentEvent.signals.crowd_score, score.score);
          }
        } else {
          if (currentEvent) {
            events.push(currentEvent);
            currentEvent = null;
          }
        }
      }
      if (currentEvent) {
        events.push(currentEvent);
      }
    }
    return events;
  }
}

export class OpticalFlowDetector implements EventDetector {
  readonly name = 'OpticalFlowDetector';
  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.visualTimeline && context.visualTimeline.length > 0) {
      let currentEvent: DetectedEvent | null = null;
      for (const pt of context.visualTimeline) {
        if (pt.motion_score >= 0.65) {
          const confidence = Math.min(1.0, Number((pt.motion_score).toFixed(2)));
          if (!currentEvent) {
            currentEvent = {
              type: 'action_event',
              confidence,
              start: pt.second,
              end: pt.second + 1,
              signals: { motion_score: pt.motion_score, gameplay_density: pt.gameplay_density },
              adapter: 'sports',
            };
          } else {
            currentEvent.end = pt.second + 1;
            currentEvent.confidence = Math.max(currentEvent.confidence, confidence);
            currentEvent.signals.motion_score = Math.max(currentEvent.signals.motion_score, pt.motion_score);
          }
        } else {
          if (currentEvent) {
            events.push(currentEvent);
            currentEvent = null;
          }
        }
      }
      if (currentEvent) {
        events.push(currentEvent);
      }
    }
    return events;
  }
}

export class ReplayDetector implements EventDetector {
  readonly name = 'ReplayDetector';
  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    if (context.replaySegments && context.replaySegments.length > 0) {
      for (const segment of context.replaySegments) {
        events.push({
          type: 'replay',
          confidence: segment.importanceBoost,
          start: segment.start,
          end: segment.end,
          signals: { replay_boost: segment.importanceBoost },
          adapter: 'sports',
        });
      }
    }
    return events;
  }
}

/** Backward-compatibility alias */
export const ReplayDetectorStub = ReplayDetector;

export abstract class SportsAdapter extends CategoryAdapter {
  getDetectors(): EventDetector[] {
    return [
      new CrowdSurgeDetector(),
      new OpticalFlowDetector(),
      new ReplayDetector(),
    ];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: '*', preRoll: 5, postRoll: 5, includeCelebration: true, includeReplay: true }
    ];
  }

  getRankingProfile(): RankingProfile {
    return {
      event: 0.40,
      crowd: 0.20,
      commentary: 0.20,
      celebration: 0.15,
      replay: 0.05,
    };
  }

  getThumbnailPriority(): ThumbnailPriority[] {
    return [
      { type: 'action_event', weight: 0.5 },
      { type: 'celebration', weight: 0.3 },
      { type: 'crowd_reaction', weight: 0.2 },
    ];
  }
}
