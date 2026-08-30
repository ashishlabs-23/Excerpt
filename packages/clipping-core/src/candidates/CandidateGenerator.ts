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
      candidateId: crypto.randomUUID(),
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
