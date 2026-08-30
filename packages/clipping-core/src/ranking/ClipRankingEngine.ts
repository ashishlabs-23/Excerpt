import { AuditableEvaluation } from '../evaluation/types';
import { RankingProfile, RankingPlan, RenderJob } from './types';

interface ScoredCandidate {
  evaluation: AuditableEvaluation;
  compositeScore: number;
}

export class ClipRankingEngine {
  /**
   * Pure, zero-I/O function producing the canonical RankingPlan.
   */
  static rank(
    evaluations: AuditableEvaluation[],
    profile: RankingProfile,
    requestedClips: number
  ): RankingPlan {
    
    // 1. Calculate raw composite scores based on profile weights
    let scoredCandidates: ScoredCandidate[] = evaluations
      .filter(e => e.judgeDecision.accept) // Only rank accepted clips
      .map(e => ({
        evaluation: e,
        compositeScore: this.calculateCompositeScore(e, profile)
      }));

    // 2. Apply Diversity Penalties (Temporal spacing)
    // Sort descending by initial score to penalize lower-scoring nearby clips
    scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
    scoredCandidates = this.applyDiversityPenalties(scoredCandidates, profile);

    // 3. Final Deterministic Tie-Break Sort
    scoredCandidates.sort((a, b) => {
      const epsilon = 1e-6;
      const scoreDiff = b.compositeScore - a.compositeScore;
      
      // If scores are distinct, use score
      if (Math.abs(scoreDiff) > epsilon) return scoreDiff;

      // Tie-Break 1: Higher confidence wins
      const confDiff = b.evaluation.judgeDecision.confidence - a.evaluation.judgeDecision.confidence;
      if (Math.abs(confDiff) > epsilon) return confDiff;

      // Tie-Break 2: Earlier timestamp wins (ascending)
      return a.evaluation.candidate.startMs - b.evaluation.candidate.startMs;
    });

    // 4. Truncate to requested amount (Invariant 10)
    const finalSelection = scoredCandidates.slice(0, requestedClips);

    // 5. Construct RenderPlan
    const renderJobs: RenderJob[] = finalSelection.map(sc => {
      const c = sc.evaluation.candidate;
      // If JudgeAgent recommended a boundary change that passed constraints in Step 6, use it.
      // Else use the original boundaries.
      const startMs = sc.evaluation.judgeDecision.recommendedBoundaryChanges?.newStartMs ?? c.startMs;
      const endMs = sc.evaluation.judgeDecision.recommendedBoundaryChanges?.newEndMs ?? c.endMs;

      return {
        candidateId: c.candidateId,
        startMs,
        endMs,
        durationMs: endMs - startMs,
        rankingScore: sc.compositeScore
      };
    });

    return {
      profileId: profile.id,
      profileVersion: profile.version,
      renderJobs
    };
  }

  private static calculateCompositeScore(e: AuditableEvaluation, profile: RankingProfile): number {
    const c = e.candidate;
    const w = profile.weights;
    
    // Fallbacks if specific agents didn't provide specific fields: map them logically from available candidate data
    const infoDensity = (c as any).informationDensity ?? 0.8;
    const platformFit = (c as any).platformFit ?? 0.7;
    const novelty = (c as any).novelty ?? 0.6;

    return (
      (c.hook * w.hook) +
      (c.storyCompleteness * w.story) +
      (c.emotion * w.emotion) +
      (c.visualInterest * w.visualInterest) +
      (infoDensity * w.informationDensity) +
      (c.topic * w.topicRelevance) +
      (c.speakerContext * w.speakerQuality) +
      (platformFit * w.platformFit) +
      (novelty * w.novelty)
    );
  }

  private static applyDiversityPenalties(candidates: ScoredCandidate[], profile: RankingProfile): ScoredCandidate[] {
    const penalized = [...candidates];
    
    for (let i = 0; i < penalized.length; i++) {
      for (let j = 0; j < i; j++) {
        const c1 = penalized[i].evaluation.candidate;
        const c2 = penalized[j].evaluation.candidate;
        
        // If start times are within 30 seconds of each other, heavily penalize the lower-ranked one
        if (Math.abs(c1.startMs - c2.startMs) < 30000) {
          penalized[i].compositeScore *= (1.0 - profile.diversity.timeDiversityPenalty);
        }
      }
    }
    
    return penalized;
  }
}
