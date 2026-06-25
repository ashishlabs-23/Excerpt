import { CategoryAdapter, EventDetector, BoundaryRule, ThumbnailPriority } from './BaseAdapter';
import { PipelineContext, DetectedEvent, RankingProfile } from '../PipelineContext';
import { fallbackClipService } from '../../fallbackClipService';

export class PodcastEventDetector implements EventDetector {
  readonly name = 'PodcastEventDetector';

  async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const events: DetectedEvent[] = [];
    
    if (context.transcriptSegments && context.transcriptSegments.length > 0) {
      try {
        const clips = fallbackClipService.detectClips({
          segments: context.transcriptSegments,
          videoUrl: videoPath,
          totalDuration: context.duration || 0,
          numClips: 10,
        });

        for (const clip of clips) {
          const score = clip.virality_score || clip.clip_score || 0;
          events.push({
            type: 'key_insight',
            confidence: Number((score / 100).toFixed(2)),
            start: clip.start_time,
            end: clip.end_time,
            signals: {
              transcript_score: score,
              face_focus_score: clip.face_focus_score || 0,
            },
            adapter: 'podcast',
          });
        }
      } catch (err) {
        console.error(`[PodcastEventDetector]: Error running fallbackClipService:`, err);
      }
    }
    
    return events;
  }
}

export class PodcastAdapter extends CategoryAdapter {
  readonly category = 'podcast';

  getDetectors(): EventDetector[] {
    return [new PodcastEventDetector()];
  }

  getClipBoundaryRules(): BoundaryRule[] {
    return [
      { eventType: '*', preRoll: 0.6, postRoll: 0.6, includeCelebration: false, includeReplay: false }
    ];
  }

  getRankingProfile(): RankingProfile {
    return {
      transcript: 0.40,
      hook: 0.30,
      emotion: 0.20,
      visual: 0.10,
    };
  }

  getThumbnailPriority(): ThumbnailPriority[] {
    return [
      { type: 'face', weight: 0.7 },
      { type: 'default', weight: 0.3 },
    ];
  }
}
