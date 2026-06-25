import { NexusSignal } from './NexusRegistry';

export class HookIntelligence {
  /**
   * Evaluates the "Hook" (first 5-10 seconds) of a clip locally.
   * Uses transcript density and timing to determine if it's engaging.
   */
  public async getSignal(
    videoPath: string,
    transcript: string,
    segments: any[]
  ): Promise<NexusSignal> {
    const hookDuration = 5; // First 5 seconds
    const hookSegments = segments.filter(s => s.start < hookDuration);
    
    // 1. Calculate Word Velocity (Words per second in the hook)
    const totalWords = hookSegments.length;
    const wordsPerSecond = totalWords / hookDuration;
    
    // 2. Detect Hook Delay (Silence at the start)
    const firstWordStart = segments[0]?.start || 0;
    const startDelayPenalty = Math.max(0, (firstWordStart - 0.2) * 2); // Penalty for gap > 200ms

    // 3. Scoring Logic
    // High energy = 2.5+ words/sec (ideal for viral hooks)
    let score = 0.5;
    
    if (wordsPerSecond > 2.8) score = 0.9;
    else if (wordsPerSecond > 2.2) score = 0.7;
    else if (wordsPerSecond < 1.5) score = 0.3;
    
    // Apply start delay penalty
    score = Math.max(0.1, score - startDelayPenalty);

    return {
      score,
      weight: 0.35, // Significant weight for hooks
      reason: `Hook Density: ${wordsPerSecond.toFixed(1)} wps. Start Delay: ${firstWordStart.toFixed(1)}s.`,
      status: 'success',
      fallback_used: false,
    };
  }
}
