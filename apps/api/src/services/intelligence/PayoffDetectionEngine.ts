import { PipelineContext, PayoffResult } from './PipelineContext';
import { callOllamaJson } from '../ollamaService';

export interface PayoffAnalysisResult {
  payoffScore: number; // 0 - 100
  isPayoffComplete: boolean;
  resolutionEndSec?: number;
  materialViolation: boolean;
  explanation: string;
  narrativeStage?: 'setup' | 'conflict' | 'climax' | 'resolution' | 'cliffhanger';
}

export interface LLMPayoffEvaluation {
  completeness_score: number; // 0 - 100
  is_promise_delivered: boolean;
  narrative_arc_stage: 'setup' | 'conflict' | 'climax' | 'resolution' | 'cliffhanger';
  missing_element?: string;
  suggested_extension_seconds?: number;
  explanation: string;
}

export class PayoffDetectionEngine {
  private readonly payoffPhrases = [
    'and that is how',
    'turned out that',
    'turns out that',
    'turns out',
    'the result is',
    'the outcome is',
    'realized that',
    'i realized',
    'the lesson is',
    'finally',
    'which means',
    'ultimately',
    'that is why',
    "that's why",
    'i learned',
    'it works because',
    'so now',
    'in the end',
    'the point is',
    'the moral is',
    "here's what happened",
    'here is what happened',
    'the secret turns out',
    'what i discovered',
    'bottom line is',
    'that changed everything',
    'and that made all the difference',
    'which proves that',
    'and boom',
    'the key takeaway'
  ];

  private readonly promiseStarters = [
    'why',
    'how to',
    'the reason',
    'what happens when',
    'if you',
    'the biggest mistake',
    'the secret',
    'nobody tells you',
    'we found out',
    'i discovered',
    'watch what happens',
    'the truth about',
    'here is why',
    "here's why",
    'the one thing'
  ];

  private readonly conflictMarkers = [
    'but',
    'however',
    'suddenly',
    'the problem was',
    'we failed',
    'it went wrong',
    'disaster struck',
    'nobody believed',
    'obstacle',
    'struggling',
    'crisis',
    'danger'
  ];

  /**
   * Fast-path deterministic narrative arc classifier.
   * Classifies clip stage across setup -> conflict -> climax -> resolution.
   */
  public classifyNarrativeStage(text: string): 'setup' | 'conflict' | 'climax' | 'resolution' | 'cliffhanger' {
    const lower = text.toLowerCase();
    const hasPayoff = this.payoffPhrases.some(p => lower.includes(p));
    const hasConflict = this.conflictMarkers.some(c => lower.includes(c));
    const hasPromise = this.promiseStarters.some(p => lower.includes(p));

    if (hasPayoff) {
      return 'resolution';
    }
    if (hasConflict && (lower.includes('boom') || lower.includes('insane') || lower.includes('won') || lower.includes('score'))) {
      return 'climax';
    }
    if (hasConflict) {
      return 'conflict';
    }
    if (hasPromise) {
      return 'setup';
    }
    return 'resolution';
  }

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
        narrativeStage: 'resolution'
      };
    }

    const clipWords = words.filter(w => w.start >= startSec - 0.2 && w.end <= endSec + 0.2);
    if (clipWords.length === 0) {
      return {
        payoffScore: 50,
        isPayoffComplete: true,
        materialViolation: false,
        explanation: 'Empty clip window.',
        narrativeStage: 'resolution'
      };
    }

    const duration = endSec - startSec;
    const openingWords = clipWords.filter(w => w.start <= startSec + Math.min(duration * 0.35, 6.0));
    // The second half of the clip contains the resolution
    const endingWords = clipWords.filter(w => w.start >= startSec + duration * 0.45);

    const openingText = openingWords.map(w => w.word.toLowerCase()).join(' ');
    const endingText = endingWords.map(w => w.word.toLowerCase()).join(' ');
    const fullText = clipWords.map(w => w.word.toLowerCase()).join(' ');

    // 1. Detect if hook opens an explicit narrative promise / curious setup
    const hasExplicitPromise = this.promiseStarters.some(p => openingText.includes(p));

    // 2. Detect payoff resolution in ending
    const hasPayoffPhrase = this.payoffPhrases.some(phrase => endingText.includes(phrase));

    // Check if ending terminates abruptly on an unfinished thought (trailing preposition / conjunction)
    const trailingStoppers = ['because', 'and', 'but', 'so', 'if', 'when', 'which', 'that', 'with', 'like', 'or', 'while', 'as'];
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
        narrativeStage: 'cliffhanger'
      };
    }

    let payoffScore = 72; // Good standard complete story
    let explanation = 'Clip delivers a coherent thought and natural narrative conclusion.';

    if (hasPayoffPhrase) {
      payoffScore += 22;
      explanation = 'Ending explicitly resolves the narrative premise with high payoff.';
    } else if (endsWithSentencePunctuation) {
      payoffScore += 6;
    }

    const narrativeStage = this.classifyNarrativeStage(fullText);

    return {
      payoffScore: Math.min(100, Math.max(10, payoffScore)),
      isPayoffComplete: true,
      materialViolation: false,
      explanation,
      narrativeStage
    };
  }

  /**
   * Async LLM-backed semantic payoff evaluation.
   * Evaluates if opening curiosity / promise is delivered in the ending.
   * Falls back seamlessly to deterministic scoring if Ollama is unavailable.
   */
  public async analyzePayoffWithLLM(
    openingText: string,
    endingText: string,
    fullText: string = ''
  ): Promise<LLMPayoffEvaluation> {
    const heuristicStage = this.classifyNarrativeStage(fullText || `${openingText} ${endingText}`);
    const hasPayoff = this.payoffPhrases.some(p => (endingText || fullText).toLowerCase().includes(p));

    const fallback: LLMPayoffEvaluation = {
      completeness_score: hasPayoff ? 90 : 75,
      is_promise_delivered: hasPayoff || !this.promiseStarters.some(p => openingText.toLowerCase().includes(p)),
      narrative_arc_stage: heuristicStage,
      explanation: hasPayoff ? 'Payoff explicitly delivered in conclusion.' : 'Heuristic semantic completion.'
    };

    const prompt = `You are an expert video editor. Analyze this short-form video clip narrative.
Opening setup: "${openingText}"
Ending conclusion: "${endingText}"
Full transcript: "${fullText.slice(0, 300)}"

Respond in pure JSON with this exact schema:
{
  "completeness_score": number (0 to 100),
  "is_promise_delivered": boolean,
  "narrative_arc_stage": "setup" | "conflict" | "climax" | "resolution" | "cliffhanger",
  "missing_element": string (optional, what is missing if incomplete),
  "suggested_extension_seconds": number (0 if complete),
  "explanation": string (concise editorial reason)
}`;

    try {
      const result = await callOllamaJson<LLMPayoffEvaluation>({
        systemPrompt: 'You are an editorial video intelligence assistant. Always respond with strict JSON.',
        userPrompt: prompt,
        fallback,
        timeoutMs: 8000,
        retries: 1
      });
      return result;
    } catch {
      return fallback;
    }
  }

  /**
   * Pipeline Context analyzer entry point.
   */
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
    const payoffSegments = clipSegments.filter(s => s.start > clipStart + duration * 0.45);
    const payoffText = payoffSegments.map(s => s.text).join(' ').toLowerCase();
    const openingSegments = clipSegments.filter(s => s.start <= clipStart + Math.min(duration * 0.35, 6.0));
    const openingText = openingSegments.map(s => s.text).join(' ').toLowerCase();

    let payoff_strength = 50; // default baseline

    for (const phrase of this.payoffPhrases) {
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

    // Promise detection: if opening promises something that is delivered, boost
    const hasPromise = this.promiseStarters.some(p => openingText.includes(p));
    const hasDelivery = this.payoffPhrases.some(p => payoffText.includes(p));
    if (hasPromise && hasDelivery) {
      payoff_strength += 10;
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
