import { PipelineContext, UnifiedEmotionResult, EmotionTimelinePoint } from './PipelineContext';

export class EmotionIntelligenceEngine {
  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): UnifiedEmotionResult {
    const start = Date.now();
    const duration = clipEnd - clipStart;

    // Retrieve commentary emotions during the clip window
    const commentary = (context.commentaryEmotions || []).filter(
      (e) => e.timestamp >= clipStart && e.timestamp <= clipEnd
    );

    const timeline: EmotionTimelinePoint[] = [];
    const stepSize = Math.max(1, duration / 5);

    // Build timeline points based on transcript markers and commentary emotion
    for (let t = clipStart; t <= clipEnd; t += stepSize) {
      const timeOffset = t;
      const commentaryPoint = commentary.find(
        (c) => Math.abs(c.timestamp - timeOffset) <= stepSize
      );

      // Emotion mappings based on audio variance & keywords
      let emotion = 'tension';
      let intensity = 50;

      if (commentaryPoint) {
        if (commentaryPoint.level === 'historic_moment') {
          emotion = 'shock';
          intensity = 95;
        } else if (commentaryPoint.level === 'very_excited') {
          emotion = 'excitement';
          intensity = 85;
        } else if (commentaryPoint.level === 'excited') {
          emotion = 'joy';
          intensity = 75;
        }
      }

      timeline.push({
        timestamp: Number(timeOffset.toFixed(2)),
        emotion,
        intensity
      });
    }

    // Keyword based emotion adjustment
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );
    const fullText = clipSegments.map(s => s.text).join(' ').toLowerCase();

    const emotionKeywords: Record<string, string[]> = {
      shock: ['unbelievable', 'wow', 'crazy', 'disbelief', 'shock', 'never expected'],
      joy: ['happy', 'glad', 'celebrate', 'amazing', 'great', 'awesome'],
      anger: ['hate', 'angry', 'mad', 'frustrated', 'ridiculous', 'worst'],
      fear: ['afraid', 'scared', 'worry', 'terrible', 'scary', 'fear'],
      disbelief: ['no way', 'impossible', 'cannot believe', 'fake', 'lie'],
      excitement: ['hyped', 'excited', 'thrilled', 'lets go', 'boom'],
      pride: ['proud', 'honored', 'accomplished', 'achieved', 'my best'],
      sadness: ['sad', 'crying', 'depressed', 'hurt', 'unhappy', 'lost'],
      tension: ['tense', 'nervous', 'anxious', 'worried', 'stress']
    };

    let dominant_emotion = 'tension';
    let maxCount = 0;

    for (const [emo, keywords] of Object.entries(emotionKeywords)) {
      const count = keywords.filter(kw => fullText.includes(kw)).length;
      if (count > maxCount) {
        maxCount = count;
        dominant_emotion = emo;
      }
    }

    // Emotional Arc tracking: verify changes in emotional states over time
    const emotionsOverTime = timeline.map(pt => pt.emotion);
    const uniqueEmotions = Array.from(new Set(emotionsOverTime));
    let arc_strength = 50; // default baseline

    if (uniqueEmotions.length > 1) {
      arc_strength += uniqueEmotions.length * 10;
    }

    // Check specific transitions: Calm -> Shock, Doubt -> Confidence, Failure -> Success, Fear -> Relief
    const startsCalmTense = emotionsOverTime[0] === 'tension';
    const endsExcitedJoyShock = ['excitement', 'joy', 'shock'].includes(emotionsOverTime[emotionsOverTime.length - 1]);
    if (startsCalmTense && endsExcitedJoyShock) {
      arc_strength += 20; // High emotional swing boost
    }

    arc_strength = Math.min(100, Math.max(0, arc_strength));

    // Intensity: average of timeline points + count multiplier
    let emotional_intensity = Math.round(timeline.reduce((sum, pt) => sum + pt.intensity, 0) / timeline.length);
    if (maxCount > 0) {
      emotional_intensity = Math.min(100, emotional_intensity + maxCount * 5);
    }

    const result: UnifiedEmotionResult = {
      dominant_emotion,
      emotional_intensity,
      emotion_timeline: timeline,
      arc_strength
    };

    if (!context.emotionIntelligence) {
      context.emotionIntelligence = {};
    }
    context.emotionIntelligence[clipId] = result;

    context.executionTimes['EmotionIntelligenceEngine'] = (context.executionTimes['EmotionIntelligenceEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const emotionIntelligenceEngine = new EmotionIntelligenceEngine();
