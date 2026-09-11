import { BoundaryPlanner } from '../planning/BoundaryPlanner';
import { PerceptionSnapshot } from '../perception/types';
import { SentenceUnit } from '../planning/types';

describe('BoundaryPlanner - Canonical Duration Policy & Editorial Priority', () => {
  const mockSnapshot: PerceptionSnapshot = {
    schemaVersion: '1.0',
    cacheKey: 'test-cache-key',
    source: {
      hash: 'test-hash',
      durationSec: 120.0,
      width: 1920,
      height: 1080,
      fps: 30,
      audioChannels: 2,
    },
    transcript: {
      fullText: 'Hello world. Let me tell you about what happened.',
      segments: [],
      words: [
        { word: 'Hello', start: 0.0, end: 0.4, confidence: 0.99 },
        { word: 'world', start: 0.4, end: 0.8, confidence: 0.99 },
      ],
    },
    audio: {
      sampleIntervalSec: 1.0,
      energySummary: [],
      meanVolumeDb: -20,
      maxVolumeDb: -3,
      events: [
        { type: 'silence', startSec: 42.1, endSec: 42.6, value: 0 },
        { type: 'silence', startSec: 48.6, endSec: 49.1, value: 0 },
        { type: 'silence', startSec: 57.2, endSec: 57.8, value: 0 },
      ],
    },
    scenes: { events: [] },
    speakers: { tracks: [], faceProminenceScore: 0.8 },
    extractors: {} as any,
    createdAt: new Date().toISOString(),
  } as unknown as PerceptionSnapshot;

  test('40-60s range: preserves complete thought at ~48.5s over arbitrary cut at 50s', () => {
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'Let me tell you about what happened.',
        startSec: 0.0,
        endSec: 4.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c1',
            sentenceId: 's1',
            text: 'Let me tell you',
            startSec: 0.0,
            endSec: 4.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
      {
        id: 's2',
        index: 1,
        text: 'And that is why the whole experiment worked.',
        startSec: 4.5,
        endSec: 48.5,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c2',
            sentenceId: 's2',
            text: 'And that is why the whole experiment worked.',
            startSec: 4.5,
            endSec: 48.5,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
      {
        id: 's3',
        index: 2,
        text: 'Moving on to another completely unrelated topic next year.',
        startSec: 49.5,
        endSec: 75.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c3',
            sentenceId: 's3',
            text: 'Moving on to another topic.',
            startSec: 49.5,
            endSec: 75.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: {
          minSec: 40,
          maxSec: 60,
          targetSec: 50,
          priority: 'story',
        },
      }
    );

    // It should pick the complete thought ending around 48.5s (with post-roll or silence snap)
    expect(result.durationSec).toBeGreaterThanOrEqual(40.0);
    expect(result.durationSec).toBeLessThanOrEqual(60.0);
    expect(result.endSnappedTo).toBe('payoff_end');
    expect(result.durationFitScore).toBeGreaterThan(0.5);
    // Should NOT cut into the next sentence at 75s or arbitrarily at 50.0s
    expect(result.endSec).toBeLessThan(49.5);
  });

  test('40-60s range: selects payoff at 57s over cutting early at 50s', () => {
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'We started the journey with nothing in our pockets.',
        startSec: 0.0,
        endSec: 10.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c1',
            sentenceId: 's1',
            text: 'We started',
            startSec: 0.0,
            endSec: 10.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
      {
        id: 's2',
        index: 1,
        text: 'We faced enormous challenges along the road.',
        startSec: 10.5,
        endSec: 49.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c2',
            sentenceId: 's2',
            text: 'We faced challenges',
            startSec: 10.5,
            endSec: 49.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
      {
        id: 's3',
        index: 2,
        text: 'And that changed everything for us.',
        startSec: 49.5,
        endSec: 57.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c3',
            sentenceId: 's3',
            text: 'And that changed everything for us.',
            startSec: 49.5,
            endSec: 57.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: {
          minSec: 40,
          maxSec: 60,
          targetSec: 50,
          priority: 'story',
        },
      }
    );

    // Result should include the payoff at 57s rather than truncating at 49s or 50s
    expect(result.durationSec).toBeGreaterThanOrEqual(55.0);
    expect(result.durationSec).toBeLessThanOrEqual(60.0);
    expect(result.endSnappedTo).toBe('payoff_end');
  });

  test('15s target: plans short hook clip within bounds', () => {
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'This is the most incredible discovery of the decade.',
        startSec: 0.0,
        endSec: 14.5,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c1',
            sentenceId: 's1',
            text: 'This is discovery',
            startSec: 0.0,
            endSec: 14.5,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
      {
        id: 's2',
        index: 1,
        text: 'Now let us break down each component.',
        startSec: 15.0,
        endSec: 35.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [
          {
            id: 'c2',
            sentenceId: 's2',
            text: 'Now let us break down',
            startSec: 15.0,
            endSec: 35.0,
            isIntroductoryPreamble: false,
            endsWithConjunction: false,
            words: [],
          },
        ],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 15.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: {
          minSec: 10,
          maxSec: 20,
          targetSec: 15,
          priority: 'hook',
        },
      }
    );

    expect(result.durationSec).toBeGreaterThanOrEqual(10.0);
    expect(result.durationSec).toBeLessThanOrEqual(20.0);
    expect(result.durationFitScore).toBeGreaterThan(0.8);
  });

  test('upper-bound enforcement: natural payoff at 58.5s is accepted, but payoff exceeding max=60s is strictly rejected/capped', () => {
    // Case 1: Payoff at 58.5s with target 50s, max 60s -> Accepted
    const semanticUnitsInBounds: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'The beginning of our epic journey.',
        startSec: 0.0,
        endSec: 10.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c1', sentenceId: 's1', text: 'The beginning', startSec: 0.0, endSec: 10.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
      {
        id: 's2',
        index: 1,
        text: 'And that is why the whole mission succeeded.',
        startSec: 10.5,
        endSec: 58.5,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c2', sentenceId: 's2', text: 'And that is why', startSec: 10.5, endSec: 58.5, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
    ];

    const resultInBounds = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnitsInBounds,
      {
        durationPolicy: { minSec: 40, maxSec: 60, targetSec: 50, priority: 'story' },
      }
    );
    expect(resultInBounds.durationSec).toBeLessThanOrEqual(60.0);
    expect(resultInBounds.durationSec).toBeGreaterThanOrEqual(58.0);
    expect(resultInBounds.endSnappedTo).toBe('payoff_end');

    // Case 2: Payoff at 64.0s with max 60.0s -> Must NOT exceed 60.0s
    const semanticUnitsExceedingMax: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'The beginning of our epic journey.',
        startSec: 0.0,
        endSec: 45.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c1', sentenceId: 's1', text: 'The beginning', startSec: 0.0, endSec: 45.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
      {
        id: 's2',
        index: 1,
        text: 'And that changed everything in the end after a long time.',
        startSec: 45.5,
        endSec: 64.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c2', sentenceId: 's2', text: 'And that changed everything', startSec: 45.5, endSec: 64.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
    ];

    const resultExceeding = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnitsExceedingMax,
      {
        durationPolicy: { minSec: 40, maxSec: 60, targetSec: 50, priority: 'story' },
      }
    );
    // Hard ceiling must be respected!
    expect(resultExceeding.durationSec).toBeLessThanOrEqual(60.0);
    // Picks the valid sentence at 45.0s instead of blowing past 60s
    expect(resultExceeding.endSec).toBeLessThanOrEqual(46.0);
  });

  test('no unrelated padding: complete thought at 48s with target=50s does not pad with unrelated next sentence', () => {
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'This was the most critical discovery.',
        startSec: 0.0,
        endSec: 48.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c1', sentenceId: 's1', text: 'This was discovery', startSec: 0.0, endSec: 48.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
      {
        id: 's2',
        index: 1,
        text: 'Switching gears entirely to stock market analysis for next quarter.',
        startSec: 49.5,
        endSec: 65.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c2', sentenceId: 's2', text: 'Switching gears', startSec: 49.5, endSec: 65.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: { minSec: 40, maxSec: 60, targetSec: 50, priority: 'story' },
      }
    );

    // Thought ending at 48.0s is preserved, never pads into sentence 2
    expect(result.durationSec).toBeGreaterThanOrEqual(40.0);
    expect(result.durationSec).toBeLessThan(49.0);
    expect(result.endSec).toBeLessThan(49.5);
  });

  test('strict hard ceiling clamp: post-roll tail or silence never leaks duration past maxSec', () => {
    // Sentence ends at 59.85s, maxSec is 60.0s. Normal post-roll (+0.3s) would produce 60.15s.
    // BoundaryPlanner MUST clamp finalizedEnd to finalizedStart + maxSec.
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'Sentence spanning near boundary.',
        startSec: 0.0,
        endSec: 59.85,
        hasTerminalPunctuation: true,
        words: [
          { text: 'boundary', startSec: 59.0, endSec: 59.85 },
        ],
        clauses: [{ id: 'c1', sentenceId: 's1', text: 'Sentence', startSec: 0.0, endSec: 59.85, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 60.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: { minSec: 40, maxSec: 60, targetSec: 50, priority: 'story' },
        postRollTailMs: 500, // 0.5s post-roll would normally push end to 60.35s
      }
    );

    // Must be strictly <= 60.000s under all circumstances!
    expect(result.durationSec).toBeLessThanOrEqual(60.0);
    expect(result.endSec - result.startSec).toBeLessThanOrEqual(60.0);
  });

  test('non-English prosodic landing: detects payoff ending via terminal punctuation + acoustic silence', () => {
    // Spanish sentence with no English keywords, but terminal punctuation + pause
    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 0,
        text: 'Empezamos el viaje sin recursos.',
        startSec: 0.0,
        endSec: 10.0,
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c1', sentenceId: 's1', text: 'Empezamos', startSec: 0.0, endSec: 10.0, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
      {
        id: 's2',
        index: 1,
        text: 'Al final logramos conquistar todas nuestras metas!',
        startSec: 10.5,
        endSec: 48.5, // Followed by mock silence at 48.6s
        hasTerminalPunctuation: true,
        words: [],
        clauses: [{ id: 'c2', sentenceId: 's2', text: 'Al final', startSec: 10.5, endSec: 48.5, isIntroductoryPreamble: false, endsWithConjunction: false, words: [] }],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 50.0 },
      mockSnapshot,
      semanticUnits,
      {
        durationPolicy: { minSec: 40, maxSec: 60, targetSec: 50, priority: 'story' },
      }
    );

    // Even with zero English payoff keywords, the prosodic landing marks this as payoff_end
    expect(result.endSnappedTo).toBe('payoff_end');
    expect(result.evidence.payoffBoundary).toBeGreaterThanOrEqual(0.8);
    expect(result.durationSec).toBeGreaterThanOrEqual(40.0);
    expect(result.durationSec).toBeLessThanOrEqual(60.0);
  });
});
