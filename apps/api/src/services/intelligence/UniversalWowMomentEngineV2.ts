import { PipelineContext, WowMomentV2, DetectedEvent } from './PipelineContext';

export class UniversalWowMomentEngineV2 {
  public generate(context: PipelineContext): WowMomentV2[] {
    const start = Date.now();
    const wowMoments: WowMomentV2[] = [];
    const category = context.category.category;

    const fullText = (context.transcriptSegments || []).map(s => s.text).join(' ').toLowerCase();

    // 1. Process V2 adapter-detected events
    for (const event of context.events) {
      let wow_type = 'surprise';
      let wow_reason = `Wow moment detected from event: ${event.type}`;
      let multiplier = 1.0;

      const type = event.type.toLowerCase();
      
      // Sports wow classification
      if (['goal', 'six', 'four', 'dunk', 'buzzer_beater'].includes(type)) {
        wow_type = 'achievement';
        wow_reason = `Highlight achievement: ${event.type} moment.`;
        multiplier = 1.25;
      } else if (['knockout', 'wicket', 'submission'].includes(type)) {
        wow_type = 'shock';
        wow_reason = `High-impact play: ${event.type}.`;
        multiplier = 1.3;
      } else if (type === 'celebration') {
        wow_type = 'celebration';
        wow_reason = `High-energy post-event celebration.`;
        multiplier = 1.15;
      }

      // Add commentary emotion boost
      const nearbyEmotion = context.commentaryEmotions.filter(
        (e) => Math.abs(e.timestamp - ((event.start + event.end) / 2)) <= 5.0
      );
      let emotionalBoost = 0;
      if (nearbyEmotion.some((e) => e.level === 'historic_moment')) {
        emotionalBoost += 20;
      } else if (nearbyEmotion.some((e) => e.level === 'very_excited')) {
        emotionalBoost += 10;
      }

      const rawScore = event.confidence * 100;
      const wow_score = Math.min(100, Math.round(rawScore * multiplier + emotionalBoost));

      wowMoments.push({
        wow_type,
        wow_score,
        wow_reason,
        timestamp: Number(((event.start + event.end) / 2).toFixed(2))
      });
    }

    // 2. Creator / Business / Interview transcript-based wow moment checks if events are sparse
    if (wowMoments.length === 0 && context.transcriptSegments) {
      // Creator checks: secrets, mistakes, revelations
      const creatorSignals = [
        { phrase: 'secret', type: 'reveal', reason: 'Creator shared a hidden secret.' },
        { phrase: 'mistake', type: 'mistake', reason: 'Creator detailed a major mistake.' },
        { phrase: 'revelation', type: 'reveal', reason: 'Creator shared a significant revelation.' }
      ];

      // Business checks: revenue jumps, failures, lessons
      const businessSignals = [
        { phrase: 'revenue', type: 'revenue_jump', reason: 'Business milestone or revenue trend.' },
        { phrase: 'failed', type: 'failure', reason: 'Critical business or personal failure lesson.' },
        { phrase: 'lesson', type: 'lesson', reason: 'A central actionable business insight.' }
      ];

      // Interview checks: emotional admissions, shocking stories
      const interviewSignals = [
        { phrase: 'admit', type: 'emotional_admission', reason: 'Guest shared an honest, emotional admission.' },
        { phrase: 'shocking', type: 'shocking_story', reason: 'Guest shared a dramatic, shocking story.' },
        { phrase: 'honest', type: 'emotional_admission', reason: 'Guest gave an intensely transparent response.' }
      ];

      const allSignals = [...creatorSignals, ...businessSignals, ...interviewSignals];

      for (const segment of context.transcriptSegments) {
        const text = segment.text.toLowerCase();
        for (const sig of allSignals) {
          if (text.includes(sig.phrase)) {
            wowMoments.push({
              wow_type: sig.type,
              wow_score: 82,
              wow_reason: sig.reason,
              timestamp: Number(((segment.start + segment.end) / 2).toFixed(2))
            });
            break; // limit one wow per segment
          }
        }
      }
    }

    // Sort descending by score
    wowMoments.sort((a, b) => b.wow_score - a.wow_score);

    context.wowMomentsV2 = wowMoments;
    context.executionTimes['UniversalWowMomentEngineV2'] = Date.now() - start;

    return wowMoments;
  }
}

export const universalWowMomentEngineV2 = new UniversalWowMomentEngineV2();
