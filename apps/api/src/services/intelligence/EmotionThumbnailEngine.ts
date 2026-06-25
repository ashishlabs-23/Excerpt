import { DetectedEvent, PipelineContext } from './PipelineContext';
import { isMultiModalEnabled } from '../../config/features';

export class EmotionThumbnailEngine {
  /**
   * Selects the highest impact timestamp for a clip's thumbnail.
   */
  public selectFrame(
    clip: { start_time: number; end_time: number },
    context: PipelineContext
  ): number {
    // If emotion thumbnail feature is disabled, default to the start of the clip
    if (!isMultiModalEnabled('emotion_thumbnail')) {
      return clip.start_time;
    }

    const duration = clip.end_time - clip.start_time;
    if (duration <= 0) return clip.start_time;

    // We evaluate candidate timestamps at 1-second intervals
    let bestTime = clip.start_time;
    let highestScore = -1;

    for (let t = clip.start_time; t <= clip.end_time; t += 1.0) {
      // 1. Emotion Score (from CommentaryEmotionEngine)
      const emotionPt = context.commentaryEmotions.find((p) => Math.abs(p.timestamp - t) <= 1.0);
      const emotionScore = emotionPt ? emotionPt.score : 0.4; // default base

      // 2. Motion/Excitement Score (from CrowdExcitementEngine)
      const crowdPt = context.crowdTimeline.find((p) => Math.abs(p.timestamp - t) <= 1.0);
      const motionScore = crowdPt ? crowdPt.score / 100 : 0.3;

      // 3. Celebration Score (from CelebrationDetector)
      const celEvent = context.events.find(
        (e) => e.type === 'celebration' && t >= e.start && t <= e.end
      );
      const celebrationScore = celEvent ? celEvent.confidence : 0.0;

      // 4. Face Presence (stub base weight)
      const faceScore = 0.5; // default face presence fallback

      // Calculate weighted score
      const score =
        0.35 * emotionScore +
        0.25 * faceScore +
        0.25 * motionScore +
        0.15 * celebrationScore;

      if (score > highestScore) {
        highestScore = score;
        bestTime = t;
      }
    }

    console.log(
      `[EmotionThumbnailEngine]: Selected peak impact thumbnail timestamp ${bestTime.toFixed(1)}s (score: ${highestScore.toFixed(2)})`
    );
    return Number(bestTime.toFixed(2));
  }
}
export const emotionThumbnailEngine = new EmotionThumbnailEngine();
