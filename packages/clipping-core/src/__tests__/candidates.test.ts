import { CandidateGenerator } from '../candidates/CandidateGenerator';
import { ScoredSegment, CandidateConstraints } from '../candidates/types';
import { PipelineErrorCode } from '../errors/PipelineError';

describe('CandidateGenerator (Pure Core Component)', () => {
  
  const baseSegment: ScoredSegment = {
    startMs: 0,
    endMs: 10000,
    durationMs: 10000,
    hookStrength: 0.8,
    narrativeCompleteness: 0.8,
    emotionalPeak: 0.8,
    informationDensity: 0.8,
    curiosityGap: 0.8,
    visualInterest: 0.8,
    speakerDynamics: 0.8,
    topicCoherence: 0.8,
    standaloneComprehensibility: 0.8,
    ctaValueDensity: 0.8,
    totalScore: 0.8
  };

  const defaultConstraints: CandidateConstraints = {
    minDurationMs: 5000,
    maxDurationMs: 60000,
    acceptanceThreshold: 0.5,
    requestCount: 5
  };

  beforeAll(() => {
    // Assert no I/O calls are made by poisoning fetch and HTTP modules
    global.fetch = jest.fn(() => {
      throw new Error('I/O violation: fetch called in pure component');
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('1. is a pure function: same input produces identical output (no I/O)', () => {
    const segments = [{ ...baseSegment }];
    
    const output1 = CandidateGenerator.generate(segments, defaultConstraints);
    const output2 = CandidateGenerator.generate(segments, defaultConstraints);

    // Override the random ID to compare purely structural output
    const normalize = (res: any[]) => res.map(r => ({ ...r, candidateId: 'static' }));

    expect(normalize(output1)).toEqual(normalize(output2));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('2. overlap-threshold deduplication removes >60% overlapping segments, keeping highest score', () => {
    const segments = [
      { ...baseSegment, startMs: 0, endMs: 10000, totalScore: 0.9 }, // Winner
      { ...baseSegment, startMs: 2000, endMs: 11000, totalScore: 0.7 }, // 80% overlap -> Should be dropped
      { ...baseSegment, startMs: 10000, endMs: 20000, totalScore: 0.8 }, // 0% overlap -> Kept
      { ...baseSegment, startMs: 15000, endMs: 25000, totalScore: 0.85 } // 50% overlap with previous -> Kept
    ];

    const results = CandidateGenerator.generate(segments, defaultConstraints);

    expect(results).toHaveLength(3);
    // Highest score (0.9) at start 0 should be first
    expect(results[0].startMs).toBe(0);
    // The second candidate (0.85) at start 15000
    expect(results[1].startMs).toBe(15000);
    // The third candidate (0.8) at start 10000
    expect(results[2].startMs).toBe(10000);
  });

  it('3. zero scored segments meeting threshold triggers NoViableCandidates', () => {
    // Both segments fail threshold (0.5)
    const segments = [
      { ...baseSegment, totalScore: 0.4 },
      { ...baseSegment, totalScore: 0.2 }
    ];

    expect(() => CandidateGenerator.generate(segments, defaultConstraints))
      .toThrow(expect.objectContaining({ code: PipelineErrorCode.NoViableCandidates }));
  });

  it('4. requestedClips != acceptedClips is preserved (Invariant 9)', () => {
    // Request 5, but only 2 clear the threshold
    const segments = [
      { ...baseSegment, startMs: 0, endMs: 10000, totalScore: 0.9 }, // Pass
      { ...baseSegment, startMs: 10000, endMs: 20000, totalScore: 0.8 }, // Pass
      { ...baseSegment, startMs: 20000, endMs: 30000, totalScore: 0.4 }, // Fail
      { ...baseSegment, startMs: 30000, endMs: 40000, totalScore: 0.3 }  // Fail
    ];

    const results = CandidateGenerator.generate(segments, { ...defaultConstraints, requestCount: 5 });

    // Exactly 2 candidates returned
    expect(results).toHaveLength(2);
  });
});
