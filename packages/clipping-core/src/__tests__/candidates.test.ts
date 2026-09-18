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

  it('5. discoverSalientWindows detects high-velocity prosodic spikes and hook triggers', () => {
    const words = [
      // 0-10s: Slow opening
      { word: 'Hello', start: 0.1, end: 0.8 },
      { word: 'welcome', start: 1.0, end: 1.8 },
      { word: 'everyone.', start: 2.0, end: 2.9 },
      // 10-30s: Fast, high-energy hook with key trigger words
      { word: 'Why', start: 10.0, end: 10.3 },
      { word: 'does', start: 10.4, end: 10.6 },
      { word: 'nobody', start: 10.7, end: 11.0 },
      { word: 'know', start: 11.1, end: 11.3 },
      { word: 'the', start: 11.4, end: 11.5 },
      { word: 'secret', start: 11.6, end: 12.0 },
      { word: 'behind', start: 12.1, end: 12.4 },
      { word: 'this', start: 12.5, end: 12.7 },
      { word: 'crazy', start: 12.8, end: 13.2 },
      { word: 'mistake', start: 13.3, end: 13.8 },
      { word: 'that', start: 13.9, end: 14.1 },
      { word: 'destroys', start: 14.2, end: 14.7 },
      { word: 'everything', start: 14.8, end: 15.3 },
      { word: 'you', start: 15.4, end: 15.6 },
      { word: 'built?', start: 15.7, end: 16.2 },
      { word: 'Listen', start: 16.5, end: 16.9 },
      { word: 'closely', start: 17.0, end: 17.4 },
      { word: 'because', start: 17.5, end: 17.8 },
      { word: 'I', start: 17.9, end: 18.0 },
      { word: 'will', start: 18.1, end: 18.3 },
      { word: 'show', start: 18.4, end: 18.7 },
      { word: 'you', start: 18.8, end: 19.0 },
      { word: 'how', start: 19.1, end: 19.4 },
      { word: 'to', start: 19.5, end: 19.6 },
      { word: 'fix', start: 19.7, end: 20.0 },
      { word: 'it', start: 20.1, end: 20.3 },
      { word: 'today.', start: 20.4, end: 21.0 },
    ];

    const salient = CandidateGenerator.discoverSalientWindows(words, {
      windowDurationSec: 20.0,
      stepSec: 5.0,
      minWordsPerWindow: 5,
    });

    expect(salient.length).toBeGreaterThan(0);
    // Top window should capture the high-density hook window (10s+)
    expect(salient[0].hookKeywordCount).toBeGreaterThanOrEqual(2);
    expect(salient[0].wordsPerMinute).toBeGreaterThan(50);
    expect(salient[0].saliencyScore).toBeGreaterThan(0.4);
  });
});
