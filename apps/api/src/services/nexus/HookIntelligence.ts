import { NexusSignal } from './NexusRegistry';

export class HookIntelligence {
  /**
   * Evaluates the "Hook" (first 5-10 seconds) of a clip locally.
   * Uses transcript density and timing to determine if it's engaging.
   */
  public async getSignal(
    videoPath: string,
    transcript: string,
    segments: any[],
    clipStartTime?: number
  ): Promise<NexusSignal> {
    const hookDuration = 5; // First 5 seconds of the clip
    const clipStart = (typeof clipStartTime === 'number' && Number.isFinite(clipStartTime))
      ? clipStartTime
      : (segments[0]?.start ?? 0);

    const hookSegments = segments.filter(
      s => s.start >= (clipStart - 0.25) && s.start < (clipStart + hookDuration)
    );

    // 1. Calculate Word Velocity (Actual words per second in the hook)
    let totalWords = 0;
    const hookTexts: string[] = [];

    for (const seg of hookSegments) {
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        totalWords += seg.words.length;
        hookTexts.push(seg.text || seg.words.map((w: any) => w.word).join(' '));
      } else if (typeof seg.text === 'string' && seg.text.trim()) {
        const segWords = seg.text.trim().split(/\s+/).filter(Boolean);
        totalWords += segWords.length;
        hookTexts.push(seg.text.trim());
      }
    }

    const hookTextCombined = hookTexts.join(' ');
    const wordsPerSecond = totalWords / hookDuration;

    // 2. Detect Hook Delay (Silence before speech begins)
    const firstWordStart = hookSegments[0]?.start ?? clipStart;
    const leadInDelay = Math.max(0, firstWordStart - clipStart);
    const startDelayPenalty = Math.max(0, (leadInDelay - 0.35) * 1.5); // Penalty for gap > 350ms

    // 3. Hook Intrigue Pattern Analysis
    const hasQuestion = /\?/.test(hookTextCombined);
    const hasIntrigueKeyword = /\b(why|how|what if|never|secret|truth|nobody|everybody|stop|mistake|reason|warning|actually)\b/i.test(hookTextCombined);
    const intrigueBonus = (hasQuestion ? 0.08 : 0) + (hasIntrigueKeyword ? 0.07 : 0);

    // 4. Scoring Logic
    // Standard conversational speed: 2.2 - 3.2 wps is high-energy short-form
    let score = 0.5;
    if (wordsPerSecond >= 2.8) score = 0.85;
    else if (wordsPerSecond >= 2.0) score = 0.70;
    else if (wordsPerSecond >= 1.4) score = 0.55;
    else if (wordsPerSecond > 0) score = 0.35;
    else score = 0.20;

    // Apply bonuses and penalties
    score = score + intrigueBonus - startDelayPenalty;
    score = Math.max(0.1, Math.min(1.0, Number(score.toFixed(3))));

    return {
      score,
      weight: 0.35, // Significant weight for hooks
      reason: `Hook Density: ${wordsPerSecond.toFixed(1)} wps (${totalWords} words). Delay: ${leadInDelay.toFixed(2)}s.${hasQuestion || hasIntrigueKeyword ? ' Intrigue patterns detected.' : ''}`,
      status: 'success',
      fallback_used: false,
    };
  }
}
