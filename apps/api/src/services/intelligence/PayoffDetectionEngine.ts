import { PipelineContext, PayoffResult } from './PipelineContext';

export class PayoffDetectionEngine {
  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): PayoffResult {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    if (clipSegments.length === 0) {
      return { payoff_strength: 50 };
    }

    const duration = clipEnd - clipStart;
    const fullText = clipSegments.map((s) => s.text).join(' ').toLowerCase();

    // Look for payoff signals primarily in the second half of the clip
    const payoffSegments = clipSegments.filter(s => s.start > clipStart + duration * 0.5);
    const payoffText = payoffSegments.map(s => s.text).join(' ').toLowerCase();

    const payoffPhrases = [
      'and that is how',
      'turned out that',
      'the result is',
      'realized that',
      'the lesson is',
      'finally',
      'which means',
      'ultimately',
      'that is why',
      'i learned',
      'it works because'
    ];

    let payoff_strength = 50; // default baseline

    for (const phrase of payoffPhrases) {
      if (payoffText.includes(phrase)) {
        payoff_strength += 15;
      } else if (fullText.includes(phrase)) {
        payoff_strength += 5;
      }
    }

    // Check if sports adaptors produced a goal or wow moment during this window
    const hasWowMoment = (context.wowMoments || []).some(
      (w) => w.timestamp >= clipStart && w.timestamp <= clipEnd
    );
    if (hasWowMoment) {
      payoff_strength += 25;
    }

    // Limit ranges
    payoff_strength = Math.min(100, Math.max(0, payoff_strength));

    // Rule enforcement: High curiosity + low payoff = penalize payoff score
    const curiosity = (context.curiosity?.[clipId]?.curiosity_score) ?? 50;
    if (curiosity > 75 && payoff_strength < 55) {
      payoff_strength = Math.max(10, payoff_strength - 30);
    }

    const result: PayoffResult = { payoff_strength };

    if (!context.payoff) {
      context.payoff = {};
    }
    context.payoff[clipId] = result;

    context.executionTimes['PayoffDetectionEngine'] = (context.executionTimes['PayoffDetectionEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const payoffDetectionEngine = new PayoffDetectionEngine();
