import { PipelineError, PipelineErrorCode } from '../errors/PipelineError';
import { CandidateConstraints, ClipCandidate, ScoredSegment } from './types';
import crypto from 'crypto';

export class CandidateGenerator {
  /**
   * Pure, zero-I/O function. 
   * Transforms ScoredSegments into deduplicated, boundary-checked ClipCandidates.
   * Throws NoViableCandidates if zero segments pass the threshold.
   */
  static generate(segments: ScoredSegment[], constraints: CandidateConstraints): ClipCandidate[] {
    // 1. Filter by hard constraints and threshold
    const viable = segments.filter(seg => 
      seg.durationMs >= constraints.minDurationMs &&
      seg.durationMs <= constraints.maxDurationMs &&
      seg.totalScore >= constraints.acceptanceThreshold
    );

    // 2. Zero-candidate terminal state (Invariant explicitly met)
    if (viable.length === 0) {
      throw new PipelineError(
        PipelineErrorCode.NoViableCandidates, 
        `0 candidates met the threshold of ${constraints.acceptanceThreshold} and duration bounds.`
      );
    }

    // 3. Sort by totalScore descending
    const sorted = [...viable].sort((a, b) => b.totalScore - a.totalScore);

    // 4. Deduplication
    const deduplicated: ScoredSegment[] = [];
    for (const current of sorted) {
      let isDuplicate = false;
      for (const retained of deduplicated) {
        if (this.calculateOverlapPercentage(current, retained) > 0.6) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        deduplicated.push(current);
      }
    }

    // 5. Slice to requestCount
    const finalSelection = deduplicated.slice(0, constraints.requestCount);

    // 6. Map to ClipCandidate structure
    return finalSelection.map((seg, index) => ({
      candidateId: crypto
        .createHash('sha256')
        .update(`${seg.startMs}_${seg.endMs}_${index}`)
        .digest('hex')
        .substring(0, 16),
      startMs: seg.startMs,
      endMs: seg.endMs,
      durationMs: seg.durationMs,
      hook: seg.hookStrength,
      storyCompleteness: seg.narrativeCompleteness,
      speakerContext: seg.speakerDynamics,
      emotion: seg.emotionalPeak,
      visualInterest: seg.visualInterest,
      topic: seg.topicCoherence,
      confidence: seg.totalScore,
      evidence: [], // Populated later if needed
      boundaryHints: { start: 'cut_on_sentence', end: 'cut_on_breath' },
      whySelected: [
        `High total score of ${seg.totalScore.toFixed(2)}`,
        `Hook strength: ${seg.hookStrength.toFixed(2)}`
      ]
    }));
  }

  /**
   * Deterministic, zero-GPU Prosodic & Semantic Saliency Window Discovery.
   * Scans word-level transcripts for speech-rate acceleration (WPM bursts)
   * and high-impact curiosity hook triggers to pre-filter candidate regions.
   */
  static discoverSalientWindows(
    words: Array<{ word: string; start: number; end: number }>,
    options: {
      windowDurationSec?: number;
      stepSec?: number;
      minWordsPerWindow?: number;
    } = {}
  ): Array<{
    startSec: number;
    endSec: number;
    wordCount: number;
    wordsPerMinute: number;
    prosodicSurgeScore: number;
    hookKeywordCount: number;
    saliencyScore: number;
  }> {
    if (!words || words.length === 0) return [];

    const windowDur = options.windowDurationSec ?? 30.0;
    const step = options.stepSec ?? 5.0;
    const minWords = options.minWordsPerWindow ?? 15;

    // Calculate active speech duration (excluding dead-air gaps > 1.5s)
    let activeSpeechDuration = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wordDur = Math.max(0.05, w.end - w.start);
      activeSpeechDuration += wordDur;
      if (i > 0) {
        const gap = w.start - words[i - 1].end;
        if (gap > 0 && gap <= 1.5) {
          activeSpeechDuration += gap;
        }
      }
    }
    const safeActiveDuration = Math.max(1, activeSpeechDuration);
    const baselineWpm = (words.length / safeActiveDuration) * 60;

    const hookKeywords = new Set([
      'why', 'how', 'secret', 'never', 'always', 'mistake', 'truth', 'look',
      'listen', 'stop', 'reason', 'crazy', 'insane', 'proven', 'shocking',
      'imagine', 'nobody', 'everyone', 'biggest', 'worst', 'best', 'watch'
    ]);

    const results: Array<{
      startSec: number;
      endSec: number;
      wordCount: number;
      wordsPerMinute: number;
      prosodicSurgeScore: number;
      hookKeywordCount: number;
      saliencyScore: number;
    }> = [];

    const maxTime = words[words.length - 1].end;
    for (let t = words[0].start; t + windowDur <= maxTime + step; t += step) {
      const windowStart = t;
      const windowEnd = t + windowDur;

      const windowWords = words.filter(w => w.end > windowStart && w.start < windowEnd);
      if (windowWords.length < minWords) continue;

      const actualDuration = Math.max(1, windowWords[windowWords.length - 1].end - windowWords[0].start);
      const wpm = (windowWords.length / actualDuration) * 60;

      // Prosodic surge: speaking rate acceleration above conversational baseline
      const surgeRatio = baselineWpm > 0 ? (wpm - baselineWpm) / baselineWpm : 0;
      const prosodicSurgeScore = Math.min(1.0, Math.max(0.0, surgeRatio * 1.5 + 0.3));

      // Hook keyword triggers in opening clause
      let hookKeywordCount = 0;
      const openingWords = windowWords.slice(0, 10);
      for (const w of openingWords) {
        const clean = (w.word || '').toLowerCase().replace(/[^a-z]/g, '');
        if (hookKeywords.has(clean)) {
          hookKeywordCount++;
        }
      }
      const hookKeywordScore = Math.min(1.0, hookKeywordCount * 0.35);

      // Density score
      const densityScore = Math.min(1.0, windowWords.length / 80);

      // Saliency composite
      const saliencyScore = Number((
        prosodicSurgeScore * 0.40 +
        hookKeywordScore * 0.40 +
        densityScore * 0.20
      ).toFixed(3));

      results.push({
        startSec: Number(windowStart.toFixed(2)),
        endSec: Number(windowEnd.toFixed(2)),
        wordCount: windowWords.length,
        wordsPerMinute: Number(wpm.toFixed(1)),
        prosodicSurgeScore: Number(prosodicSurgeScore.toFixed(2)),
        hookKeywordCount,
        saliencyScore,
      });
    }

    // Sort by saliency descending
    return results.sort((a, b) => b.saliencyScore - a.saliencyScore);
  }

  /**
   * Calculates the temporal overlap percentage of segment A relative to its own duration.
   */
  private static calculateOverlapPercentage(a: ScoredSegment, b: ScoredSegment): number {
    const overlapStart = Math.max(a.startMs, b.startMs);
    const overlapEnd = Math.min(a.endMs, b.endMs);
    
    if (overlapStart >= overlapEnd) return 0.0;
    
    const overlapDuration = overlapEnd - overlapStart;
    return overlapDuration / a.durationMs;
  }
}
