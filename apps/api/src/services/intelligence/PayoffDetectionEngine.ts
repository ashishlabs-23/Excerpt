import { PipelineContext, PayoffResult } from './PipelineContext';

export interface PayoffAnalysisResult {
  payoffScore: number; // 0 - 100
  isPayoffComplete: boolean;
  resolutionEndSec?: number;
  materialViolation: boolean;
  explanation: string;
}

export class PayoffDetectionEngine {
  private readonly payoffPhrases = [
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
    'it works because',
    'so now',
    'in the end',
    'the point is',
  ];

  /**
   * Evaluates whether a candidate window satisfies its narrative payoff contract.
   * Detects if an opening promise is resolved, and searches forward for missing resolution.
   */
  public analyzePayoffWords(
    words: Array<{ word: string; start: number; end: number }>,
    startSec: number,
    endSec: number,
    maxAllowedDurationSec: number = 60
  ): PayoffAnalysisResult {
    if (words.length === 0) {
      return {
        payoffScore: 50,
        isPayoffComplete: true,
        materialViolation: false,
        explanation: 'No transcript words available for payoff evaluation.',
      };
    }

    const clipWords = words.filter(w => w.start >= startSec - 0.2 && w.end <= endSec + 0.2);
    if (clipWords.length === 0) {
      return {
        payoffScore: 50,
        isPayoffComplete: true,
        materialViolation: false,
        explanation: 'Empty clip window.',
      };
    }

    const duration = endSec - startSec;
    const openingWords = clipWords.filter(w => w.start <= startSec + Math.min(duration * 0.35, 6.0));
    // The second half of the clip contains the resolution
    const endingWords = clipWords.filter(w => w.start >= startSec + duration * 0.45);

    const openingText = openingWords.map(w => w.word.toLowerCase()).join(' ');
    const endingText = endingWords.map(w => w.word.toLowerCase()).join(' ');

    // 1. Detect if hook opens an explicit narrative promise / curious setup
    const promiseStarters = [
      'why', 'how to', 'the reason', 'what happens when', 'if you',
      'the biggest mistake', 'the secret', 'nobody tells you', 'we found out'
    ];
    const hasExplicitPromise = promiseStarters.some(p => openingText.includes(p));

    // 2. Detect payoff resolution in ending
    const hasPayoffPhrase = this.payoffPhrases.some(phrase => endingText.includes(phrase));

    // Check if ending terminates abruptly on an unfinished thought (trailing preposition / conjunction)
    const trailingStoppers = ['because', 'and', 'but', 'so', 'if', 'when', 'which', 'that', 'with', 'like'];
    const lastWordRaw = clipWords[clipWords.length - 1]?.word || '';
    const lastWordClean = lastWordRaw.toLowerCase().replace(/[^a-z]/g, '');
    const endsOnIncompleteWord = trailingStoppers.includes(lastWordClean);
    const endsWithSentencePunctuation = /[.!?]$/.test(lastWordRaw);

    // Incomplete if it ends on a trailing stopper OR opens an explicit promise that is never resolved and has no terminal punctuation
    const isPayoffMissing = endsOnIncompleteWord || (hasExplicitPromise && !hasPayoffPhrase && !endsWithSentencePunctuation);

    if (isPayoffMissing) {
      // Ending is cut off mid-thought! Search forward beyond endSec for the natural resolution boundary
      const subsequentWords = words.filter(w => w.start >= endSec && w.start <= startSec + maxAllowedDurationSec);
      let foundResolutionEnd: number | undefined;

      for (let i = 0; i < subsequentWords.length; i++) {
        const testWindow = subsequentWords.slice(0, i + 1).map(w => w.word.toLowerCase()).join(' ');
        const matchesPayoff = this.payoffPhrases.some(p => testWindow.includes(p));
        // Also look for natural punctuation/sentence pauses
        const isSentenceEnd = subsequentWords[i].word.endsWith('.') || subsequentWords[i].word.endsWith('!');
        if (matchesPayoff || isSentenceEnd) {
          foundResolutionEnd = Number(subsequentWords[i].end.toFixed(2));
          break;
        }
      }

      const canExtend = foundResolutionEnd !== undefined && (foundResolutionEnd - startSec) <= maxAllowedDurationSec;

      return {
        payoffScore: hasExplicitPromise ? 32 : 44, // Substantially penalized for cut-off narrative
        isPayoffComplete: false,
        resolutionEndSec: canExtend ? foundResolutionEnd : undefined,
        materialViolation: !canExtend, // Cannot be extended to resolution within budget
        explanation: endsOnIncompleteWord
          ? `Clip terminates abruptly on trailing word '${lastWordClean}'.`
          : `Hook opened promise '${openingText.slice(0, 30)}...' but ended before delivering payoff.`,
      };
    }

    let payoffScore = 72; // Good standard complete story
    let explanation = 'Clip delivers a coherent thought and natural narrative conclusion.';

    if (hasPayoffPhrase) {
      payoffScore += 22;
      explanation = 'Ending explicitly resolves the narrative premise with high payoff.';
    }

    return {
      payoffScore: Math.min(100, Math.max(10, payoffScore)),
      isPayoffComplete: true,
      materialViolation: false,
      explanation,
    };
  }
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
