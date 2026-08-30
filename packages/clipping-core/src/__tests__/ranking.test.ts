import { ClipRankingEngine } from '../ranking/ClipRankingEngine';
import { STANDARD_PROFILE, PODCAST_PROFILE, validateProfile } from '../ranking/profiles';
import { AuditableEvaluation } from '../evaluation/types';
import { createCorrelationId } from '../types/correlation';

describe('ClipRankingEngine (Pure Core Component)', () => {
  const mockBaseEvaluation = (id: string, startMs: number, scoreProps: any = {}, confidence = 0.8, accept = true): AuditableEvaluation => {
    return {
      correlationId: createCorrelationId('corr-test'),
      candidateId: id,
      timestamp: '2026-01-01T00:00:00Z',
      candidate: {
        candidateId: id,
        startMs,
        endMs: startMs + 10000,
        durationMs: 10000,
        hook: 0.5,
        storyCompleteness: 0.5,
        emotion: 0.5,
        visualInterest: 0.5,
        topic: 0.5,
        speakerContext: 0.5,
        confidence,
        evidence: [],
        boundaryHints: { start: '', end: '' },
        whySelected: [],
        ...scoreProps
      },
      debateTrail: { evaluations: [], compositeScore: 0.5 },
      judgeDecision: {
        finalScore: 0.5,
        confidence,
        accept,
        fallbackUsed: false
      }
    };
  };

  it('1. requested=5, accepted=2 → exactly 2 render jobs (Invariant 10)', () => {
    const evals = [
      mockBaseEvaluation('c1', 0, {}, 0.9, true), // Accepted
      mockBaseEvaluation('c2', 60000, {}, 0.9, false), // Rejected
      mockBaseEvaluation('c3', 120000, {}, 0.9, true)  // Accepted
    ];

    const plan = ClipRankingEngine.rank(evals, STANDARD_PROFILE, 5);
    
    // Exactly 2 render jobs returned, matching only the accepted ones
    expect(plan.renderJobs).toHaveLength(2);
    expect(plan.renderJobs[0].candidateId).not.toBe('c2');
    expect(plan.renderJobs[1].candidateId).not.toBe('c2');
  });

  it('2. identical composite scores resolve via the deterministic tie-break rule', () => {
    // Two identical candidates, but `c2` has a higher confidence.
    // So c2 should win tie-break 1.
    const evals1 = [
      mockBaseEvaluation('c1', 0, { hook: 0.8 }, 0.5, true),
      mockBaseEvaluation('c2', 60000, { hook: 0.8 }, 0.9, true)
    ];

    const plan1 = ClipRankingEngine.rank(evals1, STANDARD_PROFILE, 5);
    expect(plan1.renderJobs[0].candidateId).toBe('c2');

    // Two identical candidates, exact same confidence.
    // c3 has an earlier start timestamp (0) vs c4 (60000)
    // So c3 should win tie-break 2.
    const evals2 = [
      mockBaseEvaluation('c4', 60000, { hook: 0.8 }, 0.8, true),
      mockBaseEvaluation('c3', 0, { hook: 0.8 }, 0.8, true)
    ];

    const plan2 = ClipRankingEngine.rank(evals2, STANDARD_PROFILE, 5);
    expect(plan2.renderJobs[0].candidateId).toBe('c3');
  });

  it('3. no single weighted metric exceeds the dominance ceiling in the standard profile', () => {
    // Should not throw
    expect(() => validateProfile(STANDARD_PROFILE)).not.toThrow();

    // Create a bad profile that violates the 30% rule
    const BAD_PROFILE = {
      ...STANDARD_PROFILE,
      id: 'bad',
      weights: {
        ...STANDARD_PROFILE.weights,
        hook: 0.80 // 80% weight
      }
    };

    expect(() => validateProfile(BAD_PROFILE)).toThrow(/Dominance ceiling violated/);
  });

  it('4. switching ranking profile changes output without a code deploy', () => {
    // Create candidates that appeal to different profiles
    const evals = [
      mockBaseEvaluation('high-hook', 0, { hook: 1.0, storyCompleteness: 0.2 }, 0.8, true), // Favored by Standard
      mockBaseEvaluation('high-story', 60000, { hook: 0.2, storyCompleteness: 1.0 }, 0.8, true) // Wait, podcast favors InformationDensity. Let's tweak.
    ];

    // Standard profile favors Hook & Story equally (0.2). Wait, let's make it clearer.
    // Podcast profile has infoDensity=0.25, hook=0.15.
    
    // Instead of complex math, just alter the raw numbers so they cleanly invert based on weights
    const c1 = mockBaseEvaluation('c1', 0, { hook: 1.0, visualInterest: 1.0, informationDensity: 0.1 }, 0.8, true);
    const c2 = mockBaseEvaluation('c2', 60000, { hook: 0.1, visualInterest: 0.1, informationDensity: 1.0 }, 0.8, true);

    const standardPlan = ClipRankingEngine.rank([c1, c2], STANDARD_PROFILE, 5);
    const podcastPlan = ClipRankingEngine.rank([c1, c2], PODCAST_PROFILE, 5);

    // Standard profile gives higher weight to visual/hook than info density relative to podcast
    // Just verify the ordering is different because of data-driven profiles
    expect(standardPlan.renderJobs[0].candidateId).not.toBe(podcastPlan.renderJobs[0].candidateId);
  });
});
