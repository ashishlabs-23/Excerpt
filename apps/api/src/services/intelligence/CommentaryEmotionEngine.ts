import { EmotionPoint, PipelineContext } from './PipelineContext';
import { isMultiModalEnabled } from '../../config/features';

export class CommentaryEmotionEngine {
  /**
   * Analyzes the commentary emotion levels across the video timeline.
   */
  public async analyze(videoPath: string, context: PipelineContext): Promise<EmotionPoint[]> {
    const start = Date.now();

    if (!isMultiModalEnabled('commentary_engine')) {
      console.log(`[CommentaryEmotionEngine]: Commentary Emotion Engine disabled via feature flag.`);
      context.executionTimes['CommentaryEmotionEngine'] = Date.now() - start;
      return [];
    }

    const segments = context.transcriptSegments;
    if (!segments || segments.length === 0) {
      console.log(`[CommentaryEmotionEngine]: No transcript segments available. Skipping analysis.`);
      context.executionTimes['CommentaryEmotionEngine'] = Date.now() - start;
      return [];
    }

    console.log(`[CommentaryEmotionEngine]: Analyzing commentary emotion for ${segments.length} segments...`);

    // 1. Calculate speaking rates for all segments to compute z-scores
    const speakingRates = segments.map((seg) => {
      const words = seg.text.trim().split(/\s+/).filter(Boolean).length;
      const duration = Math.max(0.5, seg.end - seg.start);
      return { words, duration, rate: words / duration };
    });

    const rates = speakingRates.map((r) => r.rate);
    const meanRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const varianceRate = rates.reduce((sum, r) => sum + Math.pow(r - meanRate, 2), 0) / rates.length;
    const stdDevRate = Math.sqrt(varianceRate) || 1.0;

    const points: EmotionPoint[] = [];

    // Emotional keywords
    const EMOTIONAL_REGEX = /\b(unbelievable|magnificent|terrible|extraordinary|incredible|brilliant|sensational|amazing|crazy|genius|impossible|magic|legendary|historic|oh my|yes|no|my god|absolute|perfect)\b/gi;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const rateInfo = speakingRates[i];

      // a. Speaking rate z-score mapped to 0-1
      const zScore = (rateInfo.rate - meanRate) / stdDevRate;
      // Map z-score through a sigmoid-like function to clamp to 0-1
      const speakingRateScore = 1 / (1 + Math.exp(-zScore));

      // b. Volume spike & pitch variance proxy from crowdTimeline
      let maxVolumeScore = 0.5;
      let pitchVarianceScore = 0.5;

      const segmentCrowdScores = context.crowdTimeline.filter(
        (pt) => pt.timestamp >= seg.start && pt.timestamp <= seg.end
      );

      if (segmentCrowdScores.length > 0) {
        // Volume spike = max score normalized
        const maxScore = Math.max(...segmentCrowdScores.map((pt) => pt.score));
        maxVolumeScore = maxScore / 100;

        // Pitch variance proxy = stdDev of volume scores in this segment
        const avgScore = segmentCrowdScores.reduce((sum, pt) => sum + pt.score, 0) / segmentCrowdScores.length;
        const scoreVar = segmentCrowdScores.reduce((sum, pt) => sum + Math.pow(pt.score - avgScore, 2), 0) / segmentCrowdScores.length;
        const scoreStdDev = Math.sqrt(scoreVar);
        // Normalize: stdDev of 15+ indicates high voice modulation
        pitchVarianceScore = Math.min(1.0, scoreStdDev / 15);
      }

      // c. Keyword hit & exclamation bonus
      let keywordScore = 0;
      const cleanText = seg.text.trim();
      if (cleanText.includes('!')) {
        keywordScore += 0.4;
      }
      
      const emotionalHits = cleanText.match(EMOTIONAL_REGEX);
      if (emotionalHits) {
        keywordScore += Math.min(0.6, emotionalHits.length * 0.2);
      }

      // d. Combine scores
      const emotionScore = Number((
        0.35 * pitchVarianceScore +
        0.30 * speakingRateScore +
        0.25 * maxVolumeScore +
        0.10 * keywordScore
      ).toFixed(4));

      // e. Determine level label
      let level: EmotionPoint['level'] = 'calm';
      if (emotionScore >= 0.85) {
        level = 'historic_moment';
      } else if (emotionScore >= 0.70) {
        level = 'very_excited';
      } else if (emotionScore >= 0.50) {
        level = 'excited';
      }

      // We align point timestamp with the center of the segment
      const centerTimestamp = Number(((seg.start + seg.end) / 2).toFixed(2));

      points.push({
        timestamp: centerTimestamp,
        score: emotionScore,
        level,
        pitch_variance: Number(pitchVarianceScore.toFixed(4)),
        speaking_rate: Number(rateInfo.rate.toFixed(2)),
      });
    }

    context.commentaryEmotions = points;

    const durationMs = Date.now() - start;
    context.executionTimes['CommentaryEmotionEngine'] = durationMs;
    console.log(`[CommentaryEmotionEngine]: Completed analysis in ${durationMs}ms.`);

    return points;
  }
}
