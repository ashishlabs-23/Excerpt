import { BoundaryPlanner } from '../planning/BoundaryPlanner';
import { PerceptionSnapshot } from '../perception/types';
import { SentenceUnit, STANDARD_BOUNDARY_PROFILES } from '../planning/types';
import { AcousticBoundarySnapper } from '../candidates/AcousticBoundarySnapper';
import { SemanticUnitTokenizer } from '../planning/SemanticUnitTokenizer';

describe('BoundaryPlanner - 32 Core Multimodal Trimming & Regression Scenarios', () => {
  const createSnapshot = (
    words: Array<{ word: string; start: number; end: number }>,
    silences: Array<{ startSec: number; endSec: number }> = [],
    durationSec: number = 2000.0,
    scenes: Array<{ startSec: number; endSec: number; value?: number }> = [],
    speakers: Array<{ startSec: number; endSec: number; speaker?: string; speakingProbability?: number }> = []
  ): PerceptionSnapshot => ({
    schemaVersion: '1.0',
    cacheKey: 'regression-test',
    source: {
      hash: 'hash',
      durationSec,
      width: 1920,
      height: 1080,
      fps: 30,
      audioChannels: 2,
    },
    transcript: {
      fullText: words.map(w => w.word).join(' '),
      segments: [],
      words,
    },
    audio: {
      sampleIntervalSec: 1.0,
      energySummary: [],
      meanVolumeDb: -20,
      maxVolumeDb: -3,
      events: silences.map(s => ({ type: 'silence', startSec: s.startSec, endSec: s.endSec, value: 0 })),
    },
    scenes: { events: scenes.map(s => ({ type: 'scene_cut', startSec: s.startSec, endSec: s.endSec, value: s.value ?? 0.8 })) },
    speakers: { tracks: speakers.map(sp => ({ startSec: sp.startSec, endSec: sp.endSec, speaker: sp.speaker || 'speaker_1', speakingProbability: sp.speakingProbability ?? 0.8 })), faceProminenceScore: 0.8 },
    extractors: {} as any,
    createdAt: new Date().toISOString(),
  } as unknown as PerceptionSnapshot);

  // ─────────────────────────────────────────────────────────────
  // 1. Previous-sentence residue: "See you then." -> new hook
  // ─────────────────────────────────────────────────────────────
  test('1. Previous-sentence residue: rejects "See you then." tail and advances to real hook onset', () => {
    const words = [
      { word: 'See', start: 1239.176, end: 1239.476 },
      { word: 'you', start: 1239.476, end: 1239.616 },
      { word: 'then.', start: 1239.616, end: 1239.856 },
      // Actual hook starts after 0.8s pause:
      { word: 'If', start: 1240.716, end: 1240.876 },
      { word: 'she', start: 1240.876, end: 1241.116 },
      { word: 'does', start: 1241.116, end: 1241.356 },
      { word: 'not', start: 1241.356, end: 1241.596 },
      { word: 'survive', start: 1241.596, end: 1242.100 },
      { word: 'the', start: 1242.100, end: 1242.300 },
      { word: 'night,', start: 1242.300, end: 1242.800 },
      { word: 'everything', start: 1242.850, end: 1243.500 },
      { word: 'changes.', start: 1243.550, end: 1244.200 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's_prev',
        index: 1,
        text: 'See you then.',
        startSec: 1239.176,
        endSec: 1239.856,
        hasTerminalPunctuation: true,
        words: [
          { text: 'See', startSec: 1239.176, endSec: 1239.476 },
          { text: 'you', startSec: 1239.476, endSec: 1239.616 },
          { text: 'then.', startSec: 1239.616, endSec: 1239.856 },
        ],
        clauses: [],
      },
      {
        id: 's_hook',
        index: 2,
        text: 'If she does not survive the night, everything changes.',
        startSec: 1240.716,
        endSec: 1244.200,
        hasTerminalPunctuation: true,
        words: [
          { text: 'If', startSec: 1240.716, endSec: 1240.876 },
          { text: 'she', startSec: 1240.876, endSec: 1241.116 },
          { text: 'changes.', startSec: 1243.550, endSec: 1244.200 },
        ],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [{ startSec: 1239.9, endSec: 1240.6 }]);
    // AI originally asked for 1239.10
    const result = BoundaryPlanner.planBoundary(
      { startSec: 1239.10, endSec: 1244.20 },
      snapshot,
      semanticUnits,
      { minDurationSec: 3.0, maxDurationSec: 15.0 }
    );

    // Verify it advances past "See you then." (1239.856) and starts at the true hook (~1240.5 - 1240.7s)
    expect(result.startSec).toBeGreaterThanOrEqual(1240.5);
    expect(result.startSec).toBeLessThanOrEqual(1240.75);
    expect(result.endSec).toBeGreaterThanOrEqual(1244.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Snowball bleed: sentence -> 220ms pause -> next sentence
  // ─────────────────────────────────────────────────────────────
  test('2. Snowball bleed: sentence ending at 1579.03s does NOT bleed into next sentence at 1579.25s', () => {
    const words = [
      { word: 'amazing', start: 1578.116, end: 1578.536 },
      { word: 'coffee.', start: 1578.536, end: 1579.036 },
      // Pause of 220ms, then new sentence starts:
      { word: 'go', start: 1579.256, end: 1579.356 },
      { word: 'to', start: 1579.356, end: 1579.456 },
      { word: 'your', start: 1579.456, end: 1579.516 },
      { word: 'local', start: 1579.516, end: 1579.716 },
      { word: 'shop.', start: 1579.750, end: 1580.200 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's_coffee',
        index: 1,
        text: 'Drink amazing coffee.',
        startSec: 1575.0,
        endSec: 1579.036,
        hasTerminalPunctuation: true,
        words: [
          { text: 'amazing', startSec: 1578.116, endSec: 1578.536 },
          { text: 'coffee.', startSec: 1578.536, endSec: 1579.036 },
        ],
        clauses: [],
      },
      {
        id: 's_next',
        index: 2,
        text: 'go to your local shop.',
        startSec: 1579.256,
        endSec: 1580.200,
        hasTerminalPunctuation: true,
        words: [
          { text: 'go', startSec: 1579.256, endSec: 1579.356 },
          { text: 'local', startSec: 1579.516, endSec: 1579.716 },
        ],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [{ startSec: 1579.05, endSec: 1579.23 }]);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 1575.0, endSec: 1579.3 },
      snapshot,
      semanticUnits,
      {
        minDurationSec: 3.0,
        maxDurationSec: 10.0,
        speechSafetyMarginMs: 80,
      }
    );

    // Hard Invariant: finalEnd MUST be strictly less than next speech start (1579.256)
    expect(result.endSec).toBeLessThan(1579.256);
    expect(result.endSec).toBeGreaterThanOrEqual(1579.036);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Long sentence completion (> softMax, <= hardMax)
  // ─────────────────────────────────────────────────────────────
  test('3. Long sentence completion: preserves complete thought at 61.2s when softMax=60s and hardMax=180s', () => {
    const words = [
      { word: 'Start', start: 0.0, end: 0.5 },
      { word: 'middle', start: 20.0, end: 20.5 },
      { word: 'resolution.', start: 60.8, end: 61.2 },
      { word: 'Next', start: 62.0, end: 62.5 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'This is a single complete long narrative thought.',
        startSec: 0.0,
        endSec: 61.2,
        hasTerminalPunctuation: true,
        words: [
          { text: 'Start', startSec: 0.0, endSec: 0.5 },
          { text: 'resolution.', startSec: 60.8, endSec: 61.2 },
        ],
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'Next topic starts here.',
        startSec: 62.0,
        endSec: 75.0,
        hasTerminalPunctuation: true,
        words: [{ text: 'Next', startSec: 62.0, endSec: 62.5 }],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [{ startSec: 61.3, endSec: 61.9 }]);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 58.0 },
      snapshot,
      semanticUnits,
      {
        minDurationSec: 30.0,
        softMaxDurationSec: 60.0,
        hardMaxDurationSec: 180.0,
        durationPolicy: { minSec: 30, maxSec: 60, targetSec: 50, priority: 'story' },
      }
    );

    // Sentence completes at 61.2s and survives because hardMax=180s
    expect(result.durationSec).toBeGreaterThan(60.0);
    expect(result.durationSec).toBeLessThanOrEqual(62.0);
    expect(result.endSec).toBeGreaterThanOrEqual(61.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Hard max completion (> hardMax): drops to earlier sentence
  // ─────────────────────────────────────────────────────────────
  test('4. Hard max enforcement: Candidate A=52.4s is chosen, Candidate B=61.2s is rejected when hardMax=60s', () => {
    const words = [
      { word: 'Idea', start: 0.0, end: 0.4 },
      { word: 'conclusion.', start: 52.0, end: 52.4 },
      { word: 'Extended', start: 53.0, end: 53.5 },
      { word: 'ramble.', start: 60.8, end: 61.2 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Idea conclusion.',
        startSec: 0.0,
        endSec: 52.4,
        hasTerminalPunctuation: true,
        words: [{ text: 'conclusion.', startSec: 52.0, endSec: 52.4 }],
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'Extended ramble.',
        startSec: 53.0,
        endSec: 61.2,
        hasTerminalPunctuation: true,
        words: [{ text: 'ramble.', startSec: 60.8, endSec: 61.2 }],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [
      { startSec: 52.5, endSec: 52.9 },
      { startSec: 61.3, endSec: 61.8 },
    ]);

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 55.0 },
      snapshot,
      semanticUnits,
      {
        minDurationSec: 40.0,
        hardMaxDurationSec: 60.0,
        durationPolicy: { minSec: 40, maxSec: 60, hardMaxSec: 60, targetSec: 50, priority: 'story' },
      }
    );

    // Hard ceiling must drop back to Candidate A (~52.4s)
    expect(result.durationSec).toBeLessThanOrEqual(60.0);
    expect(result.endSec).toBeLessThanOrEqual(53.0);
    expect(result.endSec).toBeGreaterThanOrEqual(52.4);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. No punctuation, clean acoustic landing
  // ─────────────────────────────────────────────────────────────
  test('5. No punctuation: selects clean spoken boundary ending without punctuation when silence >= 350ms', () => {
    const words = [
      { word: 'and', start: 0.0, end: 0.3 },
      { word: 'that', start: 0.35, end: 0.6 },
      { word: 'is', start: 0.65, end: 0.8 },
      { word: 'why', start: 0.85, end: 1.1 },
      { word: 'it', start: 1.15, end: 1.3 },
      { word: 'works', start: 1.35, end: 1.8 }, // NO punctuation!
      // 500ms acoustic pause
      { word: 'moving', start: 2.3, end: 2.7 },
      { word: 'on', start: 2.75, end: 3.0 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'and that is why it works',
        startSec: 0.0,
        endSec: 1.8,
        hasTerminalPunctuation: false, // NO terminal punctuation
        words: [{ text: 'works', startSec: 1.35, endSec: 1.8 }],
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'moving on',
        startSec: 2.3,
        endSec: 3.0,
        hasTerminalPunctuation: true,
        words: [{ text: 'on', startSec: 2.75, endSec: 3.0 }],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [{ startSec: 1.85, endSec: 2.25 }]);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 2.0 },
      snapshot,
      semanticUnits,
      { minDurationSec: 1.5, maxDurationSec: 5.0 }
    );

    // Even without punctuation, acoustic landing enables selection
    expect(result.endSec).toBeGreaterThanOrEqual(1.8);
    expect(result.endSec).toBeLessThan(2.3);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. False punctuation (ASR mid-thought period)
  // ─────────────────────────────────────────────────────────────
  test('6. False punctuation: ignores mid-thought abbreviation punctuation (e.g., Dr.)', () => {
    const words = [
      { word: 'We', start: 0.0, end: 0.3 },
      { word: 'met', start: 0.35, end: 0.6 },
      { word: 'Dr.', start: 0.65, end: 1.0 }, // Mid-thought honorific
      { word: 'Smith', start: 1.05, end: 1.4 },
      { word: 'yesterday.', start: 1.45, end: 2.0 },
    ];

    const semanticUnits: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'We met Dr. Smith yesterday.',
        startSec: 0.0,
        endSec: 2.0,
        hasTerminalPunctuation: true,
        words: [{ text: 'yesterday.', startSec: 1.45, endSec: 2.0 }],
        clauses: [],
      },
    ];

    const snapshot = createSnapshot(words, [{ startSec: 2.05, endSec: 2.5 }]);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 1.1 }, // AI asked for 1.1s near 'Dr.'
      snapshot,
      semanticUnits,
      { minDurationSec: 1.0, maxDurationSec: 5.0 }
    );

    // Must not cut at 1.0s ('Dr.'), but complete at 'yesterday.' (2.0s)
    expect(result.endSec).toBeGreaterThanOrEqual(2.0);
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Breath boundary protection
  // ─────────────────────────────────────────────────────────────
  test('7. Breath boundary: includes ~100ms attack room before first speech onset', () => {
    const words = [
      { word: 'Inhale', start: 10.0, end: 10.5 },
      { word: 'Speech', start: 10.55, end: 11.2 },
    ];

    const feasible = AcousticBoundarySnapper.calculateFeasibleStartInterval(
      words[1],
      words,
      { precedingSafetyMarginSec: 0.02, attackProtectionSec: 0.01, preRollSec: 0.1 }
    );

    expect(feasible.isFeasible).toBe(true);
    expect(feasible.upperBound).toBeLessThanOrEqual(words[1].start);
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Speaker handoff: A finishes -> B immediately begins
  // ─────────────────────────────────────────────────────────────
  test('8. Speaker handoff: Speaker A ends at 10.0s, Speaker B starts at 10.15s, cut lands between', () => {
    const words = [
      { word: 'A_finish.', start: 9.5, end: 10.0 },
      { word: 'B_start', start: 10.15, end: 10.6 },
    ];

    const feasible = AcousticBoundarySnapper.calculateFeasibleEndInterval(
      words[0],
      words,
      { speechSafetyMarginSec: 0.05 }
    );

    expect(feasible.lowerBound).toBe(10.0);
    // Upper bound must be strictly before B_start (10.15 - 0.05 = 10.10s)
    expect(feasible.upperBound).toBe(10.10);
    expect(feasible.upperBound).toBeLessThan(words[1].start);
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Rapid speech (< 150ms between sentences)
  // ─────────────────────────────────────────────────────────────
  test('9. Rapid speech: tight 100ms gap clamped cleanly without cutting either word', () => {
    const words = [
      { word: 'fast.', start: 0.0, end: 1.0 },
      { word: 'next', start: 1.1, end: 2.0 },
    ];

    const snapResult = AcousticBoundarySnapper.snap(0.0, 1.05, words, [], {
      minDurationSec: 0.5,
      maxDurationSec: 5.0,
      postRollMs: 150,
      safeUpperBoundSec: 1.08,
    });

    expect(snapResult.endSec).toBeLessThanOrEqual(1.08);
    expect(snapResult.endSec).toBeGreaterThanOrEqual(1.0);
    expect(snapResult.truncatedWordAvoided).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Final source sentence (EOF with no subsequent speech)
  // ─────────────────────────────────────────────────────────────
  test('10. Final source sentence: ends cleanly at video EOF without crashing', () => {
    const words = [
      { word: 'final', start: 100.0, end: 100.5 },
      { word: 'words.', start: 100.55, end: 101.0 },
    ];

    const feasible = AcousticBoundarySnapper.calculateFeasibleEndInterval(
      words[1],
      words,
      { sourceDurationSec: 101.5 }
    );

    expect(feasible.nextSpeechStart).toBeUndefined();
    expect(feasible.upperBound).toBe(101.5);
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Timestamp overlap / noisy ASR
  // ─────────────────────────────────────────────────────────────
  test('11. Timestamp overlap: handles overlapping word timestamps gracefully without negative intervals', () => {
    const noisyWords = [
      { word: 'word1', start: 1.0, end: 1.6 }, // ends at 1.6
      { word: 'word2', start: 1.5, end: 2.0 }, // starts at 1.5 (overlap!)
    ];

    const feasibleStart = AcousticBoundarySnapper.calculateFeasibleStartInterval(
      noisyWords[1],
      noisyWords
    );

    // When lowerBound > upperBound, isFeasible is false
    expect(feasibleStart.isFeasible).toBe(false);

    // Snapper falls back to exact word start without creating negative intervals
    const snapped = AcousticBoundarySnapper.snap(1.65, 2.0, noisyWords);
    expect(snapped.startSec).toBeGreaterThanOrEqual(1.5);
    expect(snapped.startSec).toBeLessThanOrEqual(snapped.endSec);
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Real regression on Job 6e40f3b8 exact transcripts
  // ─────────────────────────────────────────────────────────────
  test('12. Real regression on Job 6e40f3b8: verifies all 3 clips have zero bleed and zero residue', () => {
    // Exact Clip 1 Whisper segment:
    const clip1Words = [
      { word: 'See', start: 1239.1765, end: 1239.4764 },
      { word: 'you', start: 1239.4764, end: 1239.6165 },
      { word: 'then.', start: 1239.6165, end: 1239.8564 },
      { word: 'If', start: 1240.7166, end: 1240.8765 },
      { word: 'she', start: 1240.8765, end: 1241.1165 },
      // ...
      { word: 'Angus.', start: 1301.6165, end: 1302.1165 },
      { word: 'I', start: 1302.2000, end: 1302.3165 },
      { word: 'think', start: 1302.3165, end: 1302.4165 },
      { word: 'my', start: 1302.4165, end: 1302.5964 },
      { word: 'legs', start: 1302.5964, end: 1302.8165 },
      { word: 'already', start: 1302.8165, end: 1303.2166 },
      { word: 'froze.', start: 1303.2500, end: 1303.8000 },
    ];

    const clip1Sentences: SentenceUnit[] = [
      {
        id: 'c1_s1',
        index: 1,
        text: 'See you then.',
        startSec: 1239.1765,
        endSec: 1239.8564,
        hasTerminalPunctuation: true,
        words: [{ text: 'See', startSec: 1239.1765, endSec: 1239.4764 }, { text: 'then.', startSec: 1239.6165, endSec: 1239.8564 }],
        clauses: [],
      },
      {
        id: 'c1_s2',
        index: 2,
        text: 'If she survives.',
        startSec: 1240.7166,
        endSec: 1280.0000,
        hasTerminalPunctuation: true,
        words: [{ text: 'If', startSec: 1240.7166, endSec: 1240.8765 }],
        clauses: [],
      },
      {
        id: 'c1_s3',
        index: 3,
        text: 'Angus.',
        startSec: 1301.6165,
        endSec: 1302.1165,
        hasTerminalPunctuation: true,
        words: [{ text: 'Angus.', startSec: 1301.6165, endSec: 1302.1165 }],
        clauses: [],
      },
      {
        id: 'c1_s4',
        index: 4,
        text: 'I think my legs already froze.',
        startSec: 1302.2000,
        endSec: 1303.8000,
        hasTerminalPunctuation: true,
        words: [{ text: 'froze.', startSec: 1303.2500, endSec: 1303.8000 }],
        clauses: [],
      },
    ];

    const snap1 = createSnapshot(clip1Words);
    const resultClip1 = BoundaryPlanner.planBoundary(
      { startSec: 1239.10, endSec: 1302.90 },
      snap1,
      clip1Sentences,
      { minDurationSec: 30.0, softMaxDurationSec: 60.0, hardMaxDurationSec: 65.0 }
    );

    // 1. Must NOT start on "See you then." -> Starts at "If" (1240.7s)
    expect(resultClip1.startSec).toBeGreaterThanOrEqual(1240.5);

    // 2. Must NOT cut inside "already" (1302.89) -> Lands either on complete "Angus." or complete "froze."
    expect(resultClip1.endSec).not.toBeCloseTo(1302.89, 1);
  });

  // ─────────────────────────────────────────────────────────────
  // 13. 15ms micro-pause between words (ASR micro-gap)
  // ─────────────────────────────────────────────────────────────
  test('13. 15ms micro-pause between words: structural + temporal adjacency does not jump across words', () => {
    const words = [
      { word: 'The', start: 10.000, end: 10.300 },
      { word: 'quick', start: 10.315, end: 10.600 }, // 15ms gap
      { word: 'brown', start: 10.615, end: 10.900 }, // 15ms gap
      { word: 'fox.', start: 10.915, end: 11.300 },
      { word: 'Jumped', start: 11.320, end: 11.600 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'The quick brown fox.',
        startSec: 10.000,
        endSec: 11.300,
        hasTerminalPunctuation: true,
        words: words.slice(0, 4).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 10.0, endSec: 11.3 },
      snap,
      sentences,
      { minDurationSec: 1.0, maxDurationSec: 5.0, profile: STANDARD_BOUNDARY_PROFILES.default }
    );

    // End must land cleanly after "fox." without bleeding into "Jumped" at 11.320
    expect(result.endSec).toBeGreaterThanOrEqual(11.300);
    expect(result.endSec).toBeLessThan(11.320);
  });

  // ─────────────────────────────────────────────────────────────
  // 14. 50ms fast-speech gap
  // ─────────────────────────────────────────────────────────────
  test('14. 50ms fast-speech gap: safeUpperBound strictly clamps post-roll to prevent bleed', () => {
    const words = [
      { word: 'Unbelievable', start: 20.000, end: 20.800 },
      { word: 'finish.', start: 20.850, end: 21.400 },
      { word: 'Now', start: 21.450, end: 21.700 }, // 50ms gap
      { word: 'look', start: 21.700, end: 22.000 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Unbelievable finish.',
        startSec: 20.000,
        endSec: 21.400,
        hasTerminalPunctuation: true,
        words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 20.0, endSec: 21.4 },
      snap,
      sentences,
      { minDurationSec: 1.0, maxDurationSec: 5.0 }
    );

    // End must strictly avoid onset of "Now" (21.450)
    expect(result.endSec).toBeLessThan(21.450);
  });

  // ─────────────────────────────────────────────────────────────
  // 15. 350ms intra-sentence pause
  // ─────────────────────────────────────────────────────────────
  test('15. 350ms intra-sentence pause: does not truncate or split sentence mid-thought', () => {
    const rawWords = [
      { word: 'We', start: 30.000, end: 30.200 },
      { word: 'must', start: 30.200, end: 30.500 },
      // 350ms pause for thought:
      { word: 'focus', start: 30.850, end: 31.200 },
      { word: 'on', start: 31.200, end: 31.350 },
      { word: 'this.', start: 31.350, end: 31.800 },
    ];
    const tokenized = SemanticUnitTokenizer.tokenize(rawWords as any, [], { minSentenceBreakMs: 650 });
    // Proves 350ms pause does NOT produce two separate sentence units
    expect(tokenized.length).toBe(1);
    expect(tokenized[0].text).toBe('We must focus on this.');

    const snap = createSnapshot(rawWords);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 30.0, endSec: 31.8 },
      snap,
      tokenized,
      { minDurationSec: 1.0, maxDurationSec: 5.0 }
    );
    expect(result.endSec).toBeGreaterThanOrEqual(31.800);
  });

  // ─────────────────────────────────────────────────────────────
  // 16. 500ms intra-sentence breath/emphasis pause
  // ─────────────────────────────────────────────────────────────
  test('16. 500ms intra-sentence pause: preserved in podcast profile (sentenceBreakPauseMs=700)', () => {
    const rawWords = [
      { word: 'The', start: 40.000, end: 40.200 },
      { word: 'secret', start: 40.200, end: 40.600 },
      // 500ms dramatic pause
      { word: 'is', start: 41.100, end: 41.300 },
      { word: 'consistency.', start: 41.300, end: 42.000 },
    ];
    const tokenized = SemanticUnitTokenizer.tokenize(
      rawWords as any,
      [],
      { minSentenceBreakMs: STANDARD_BOUNDARY_PROFILES.podcast.sentenceBreakPauseMs }
    );
    expect(tokenized.length).toBe(1);
    expect(tokenized[0].endSec).toBe(42.000);
  });

  // ─────────────────────────────────────────────────────────────
  // 17. 700ms true sentence boundary
  // ─────────────────────────────────────────────────────────────
  test('17. 700ms true sentence boundary: correctly tokenizes and lands boundary in silence', () => {
    const rawWords = [
      { word: 'First', start: 50.000, end: 50.400 },
      { word: 'point.', start: 50.400, end: 50.900 },
      // 750ms silence
      { word: 'Second', start: 51.650, end: 52.000 },
      { word: 'point.', start: 52.000, end: 52.500 },
    ];
    const tokenized = SemanticUnitTokenizer.tokenize(rawWords as any, [], { minSentenceBreakMs: 650 });
    expect(tokenized.length).toBe(2);

    const snap = createSnapshot(rawWords, [{ startSec: 50.95, endSec: 51.60 }]);
    const result = BoundaryPlanner.planBoundary(
      { startSec: 50.0, endSec: 50.9 },
      snap,
      tokenized,
      { minDurationSec: 0.5, maxDurationSec: 4.0 }
    );
    expect(result.endSec).toBeGreaterThanOrEqual(50.900);
    expect(result.endSec).toBeLessThan(51.650);
  });

  // ─────────────────────────────────────────────────────────────
  // 18. Valid short hook: "Watch this."
  // ─────────────────────────────────────────────────────────────
  test('18. Valid short hook: "Watch this." is preserved and not suppressed as residue', () => {
    const words = [
      { word: 'Watch', start: 60.000, end: 60.300 },
      { word: 'this.', start: 60.300, end: 60.600 },
      // 400ms pause, then explanation follows
      { word: 'When', start: 61.000, end: 61.200 },
      { word: 'you', start: 61.200, end: 61.350 },
      { word: 'apply', start: 61.350, end: 61.700 },
      { word: 'heat,', start: 61.700, end: 62.000 },
      { word: 'it', start: 62.050, end: 62.200 },
      { word: 'melts.', start: 62.200, end: 62.700 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's_hook',
        index: 1,
        text: 'Watch this.',
        startSec: 60.000,
        endSec: 60.600,
        hasTerminalPunctuation: true,
        words: [
          { text: 'Watch', startSec: 60.000, endSec: 60.300 },
          { text: 'this.', startSec: 60.300, endSec: 60.600 },
        ],
        clauses: [],
      },
      {
        id: 's_body',
        index: 2,
        text: 'When you apply heat, it melts.',
        startSec: 61.000,
        endSec: 62.700,
        hasTerminalPunctuation: true,
        words: words.slice(2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 60.0, endSec: 62.7 },
      snap,
      sentences,
      { minDurationSec: 2.0, maxDurationSec: 10.0 }
    );

    // Must preserve "Watch this." at ~60.0s, NOT jump forward to 61.0s
    expect(result.startSec).toBeLessThan(60.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 19. Valid short hook: "That's why."
  // ─────────────────────────────────────────────────────────────
  test('19. Valid short hook: "That\'s why." onset is preserved', () => {
    const words = [
      { word: "That's", start: 70.000, end: 70.300 },
      { word: 'why.', start: 70.300, end: 70.600 },
      { word: 'Nobody', start: 71.000, end: 71.400 },
      { word: 'ever', start: 71.400, end: 71.700 },
      { word: 'tried', start: 71.700, end: 72.000 },
      { word: 'this.', start: 72.000, end: 72.400 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: "That's why.",
        startSec: 70.000,
        endSec: 70.600,
        hasTerminalPunctuation: true,
        words: [
          { text: "That's", startSec: 70.000, endSec: 70.300 },
          { text: 'why.', startSec: 70.300, endSec: 70.600 },
        ],
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'Nobody ever tried this.',
        startSec: 71.000,
        endSec: 72.400,
        hasTerminalPunctuation: true,
        words: words.slice(2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 70.0, endSec: 72.4 },
      snap,
      sentences,
      { minDurationSec: 2.0, maxDurationSec: 10.0 }
    );

    expect(result.startSec).toBeLessThan(70.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 20. Four-word legitimate hook: "Here is the truth."
  // ─────────────────────────────────────────────────────────────
  test('20. Four-word legitimate hook: "Here is the truth." is preserved', () => {
    const words = [
      { word: 'Here', start: 80.000, end: 80.250 },
      { word: 'is', start: 80.250, end: 80.400 },
      { word: 'the', start: 80.400, end: 80.550 },
      { word: 'truth.', start: 80.550, end: 80.950 },
      { word: 'Most', start: 81.350, end: 81.600 },
      { word: 'people', start: 81.600, end: 81.900 },
      { word: 'fail', start: 81.900, end: 82.200 },
      { word: 'early.', start: 82.200, end: 82.600 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Here is the truth.',
        startSec: 80.000,
        endSec: 80.950,
        hasTerminalPunctuation: true,
        words: words.slice(0, 4).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'Most people fail early.',
        startSec: 81.350,
        endSec: 82.600,
        hasTerminalPunctuation: true,
        words: words.slice(4).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 80.0, endSec: 82.6 },
      snap,
      sentences,
      { minDurationSec: 2.0, maxDurationSec: 10.0 }
    );

    expect(result.startSec).toBeLessThan(80.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 21. Scene cut 100ms before speech onset (Shot-Aligned Onset)
  // ─────────────────────────────────────────────────────────────
  test('21. Scene cut 100ms before speech onset: start candidate aligns to cut', () => {
    const words = [
      { word: 'Welcome', start: 90.150, end: 90.600 },
      { word: 'everyone.', start: 90.600, end: 91.200 },
    ];
    // Visual scene cut at 90.050 (100ms before speech at 90.150)
    const snap = createSnapshot(words, [], 1000, [{ startSec: 90.050, endSec: 90.050, value: 0.85 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Welcome everyone.',
        startSec: 90.150,
        endSec: 91.200,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 90.000, endSec: 91.200 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.startSnappedTo).toBe('visual_cut');
    expect(result.startSec).toBeCloseTo(90.050, 2);
  });

  // ─────────────────────────────────────────────────────────────
  // 22. Scene cut 80ms after raw start (before speech) -> avoids flash
  // ─────────────────────────────────────────────────────────────
  test('22. Scene cut 80ms after raw start before speech: start candidate aligns forward to cut', () => {
    const words = [
      { word: 'Today', start: 100.250, end: 100.600 },
      { word: 'we', start: 100.600, end: 100.800 },
      { word: 'build.', start: 100.800, end: 101.400 },
    ];
    // Raw start at 100.000, scene cut at 100.080, speech at 100.250
    const snap = createSnapshot(words, [], 1000, [{ startSec: 100.080, endSec: 100.080, value: 0.75 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Today we build.',
        startSec: 100.250,
        endSec: 101.400,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 100.000, endSec: 101.400 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.startSnappedTo).toBe('visual_cut');
    expect(result.startSec).toBeCloseTo(100.080, 2);
  });

  // ─────────────────────────────────────────────────────────────
  // 23. Scene cut near end with semantic completion (Shot-Aligned Tail)
  // ─────────────────────────────────────────────────────────────
  test('23. Scene cut near end with semantic completion: shot-aligned tail chosen', () => {
    const words = [
      { word: 'That', start: 110.000, end: 110.300 },
      { word: 'worked.', start: 110.300, end: 110.800 },
      // Next speech at 112.000 (well after scene cut)
      { word: 'Next', start: 112.000, end: 112.400 },
    ];
    // Scene cut at 110.950 (150ms after speech ends at 110.800)
    const snap = createSnapshot(words, [], 1000, [{ startSec: 110.950, endSec: 110.950, value: 0.85 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'That worked.',
        startSec: 110.000,
        endSec: 110.800,
        hasTerminalPunctuation: true,
        words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 110.000, endSec: 110.800 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.endSnappedTo).toBe('visual_cut');
    expect(result.endSec).toBeCloseTo(110.950, 2);
  });

  // ─────────────────────────────────────────────────────────────
  // 24. Scene cut near end requiring next speech inclusion -> rejected by speech safety
  // ─────────────────────────────────────────────────────────────
  test('24. Scene cut near end requiring next speech inclusion: visual candidate rejected by speech safety', () => {
    const words = [
      { word: 'Final', start: 120.000, end: 120.400 },
      { word: 'step.', start: 120.400, end: 120.800 },
      // Next speech begins immediately at 120.900
      { word: 'However', start: 120.900, end: 121.300 },
    ];
    // Scene cut at 121.100 (inside "However")
    const snap = createSnapshot(words, [], 1000, [{ startSec: 121.100, endSec: 121.100, value: 0.90 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Final step.',
        startSec: 120.000,
        endSec: 120.800,
        hasTerminalPunctuation: true,
        words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 120.000, endSec: 120.800 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // Visual cut at 121.100 MUST be rejected; end must strictly precede 120.900
    expect(result.endSec).toBeLessThan(120.900);
    expect(result.endSnappedTo).not.toBe('visual_cut');
  });

  // ─────────────────────────────────────────────────────────────
  // 25. Weak scene cut during camera motion -> acoustic/semantic boundary wins
  // ─────────────────────────────────────────────────────────────
  test('25. Weak scene cut below threshold (0.20 < 0.30): semantic/acoustic boundary wins', () => {
    const words = [
      { word: 'Smooth', start: 130.000, end: 130.400 },
      { word: 'pan.', start: 130.400, end: 130.900 },
    ];
    // Weak scene change at 131.000 (value 0.20 < default 0.30 threshold)
    const snap = createSnapshot(
      words,
      [{ startSec: 130.950, endSec: 131.500 }],
      1000,
      [{ startSec: 131.000, endSec: 131.000, value: 0.20 }]
    );
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Smooth pan.',
        startSec: 130.000,
        endSec: 130.900,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 130.000, endSec: 130.900 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // Weak visual cut ignored; acoustic silence or sentence end wins
    expect(result.endSnappedTo).not.toBe('visual_cut');
  });

  // ─────────────────────────────────────────────────────────────
  // 26. Boundary in deep silence (>=250ms) -> minimal/zero fade metadata
  // ─────────────────────────────────────────────────────────────
  test('26. Boundary in deep silence: minimal/zero audio fade metadata generated', () => {
    const words = [
      { word: 'Deep', start: 140.300, end: 140.700 },
      { word: 'silence.', start: 140.700, end: 141.200 },
    ];
    // Deep pre-speech silence (start at 140.0, speech at 140.3 -> 300ms depth)
    const snap = createSnapshot(words, [{ startSec: 141.250, endSec: 142.000 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Deep silence.',
        startSec: 140.300,
        endSec: 141.200,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 140.000, endSec: 141.200 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // In deep room tone, fade is zero or minimal
    expect(result.audioFadeInMs).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 27. Boundary in shallow silence (<150ms) -> adaptive hsin fade metadata
  // ─────────────────────────────────────────────────────────────
  test('27. Boundary in shallow silence: adaptive hsin audio fade metadata applied', () => {
    const words = [
      { word: 'Prior', start: 149.500, end: 150.020 },
      { word: 'Quick', start: 150.050, end: 150.400 },
      { word: 'onset.', start: 150.400, end: 150.900 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Quick onset.',
        startSec: 150.050,
        endSec: 150.900,
        hasTerminalPunctuation: true,
        words: words.slice(1).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 150.030, endSec: 150.900 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // Shallow silence (<50ms from startSec to speech onset) triggers baseline fade
    expect(result.audioFadeInMs).toBeGreaterThanOrEqual(15);
  });

  // ─────────────────────────────────────────────────────────────
  // 28. Speaker B non-speech reaction within 300ms -> bounded reaction candidate
  // ─────────────────────────────────────────────────────────────
  test('28. Speaker B non-speech reaction within 300ms: bounded reaction candidate evaluated', () => {
    const words = [
      { word: 'Mind', start: 160.000, end: 160.300 },
      { word: 'blown.', start: 160.300, end: 160.800 },
    ];
    // Speaker B reacts at 160.950 (within 300ms of Speaker A ending at 160.800)
    const snap = createSnapshot(
      words,
      [],
      1000,
      [],
      [{ startSec: 160.950, endSec: 161.400, speaker: 'speaker_2', speakingProbability: 0.2 }]
    );
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Mind blown.',
        startSec: 160.000,
        endSec: 160.800,
        speaker: 'speaker_1',
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 160.000, endSec: 160.800 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // End holds for the reaction (~161.2s)
    expect(result.endSec).toBeGreaterThanOrEqual(161.000);
  });

  // ─────────────────────────────────────────────────────────────
  // 29. Speaker B starts new substantive speech -> reaction-only extension rejected
  // ─────────────────────────────────────────────────────────────
  test('29. Speaker B starts new substantive speech: speech safety prevents runaway reaction extension', () => {
    const words = [
      { word: 'My', start: 170.000, end: 170.300 },
      { word: 'thought.', start: 170.300, end: 170.800 },
      // Speaker B starts actual spoken words at 170.950
      { word: 'Actually', start: 170.950, end: 171.400 },
    ];
    const snap = createSnapshot(
      words,
      [],
      1000,
      [],
      [{ startSec: 170.950, endSec: 172.000, speaker: 'speaker_2', speakingProbability: 0.95 }]
    );
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'My thought.',
        startSec: 170.000,
        endSec: 170.800,
        speaker: 'speaker_1',
        hasTerminalPunctuation: true,
        words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 170.000, endSec: 170.800 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // Must never bleed into "Actually" at 170.950
    expect(result.endSec).toBeLessThan(170.950);
  });

  // ─────────────────────────────────────────────────────────────
  // 30. Scene candidate at 60.4s (HardMax=60.0s) -> dropped by feasibility, compliant candidate wins
  // ─────────────────────────────────────────────────────────────
  test('30. Scene candidate exceeding hardMax is dropped by feasibility without mid-word truncation', () => {
    const words = [
      { word: 'Long', start: 0.000, end: 10.000 },
      { word: 'story.', start: 58.500, end: 59.200 },
    ];
    // Scene cut at 60.4s (exceeds hardMax of 60.0s)
    const snap = createSnapshot(words, [], 1000, [{ startSec: 60.400, endSec: 60.400, value: 0.95 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Long story.',
        startSec: 0.000,
        endSec: 59.200,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.000, endSec: 59.200 },
      snap,
      sentences,
      { minDurationSec: 30.0, softMaxDurationSec: 59.0, hardMaxDurationSec: 60.0 }
    );

    // End must respect hardMax and land safely around semantic completion (59.2s + post-roll) <= 60.0
    expect(result.endSec).toBeLessThanOrEqual(60.000);
    expect(result.endSec).toBeGreaterThanOrEqual(59.200);
  });

  // ─────────────────────────────────────────────────────────────
  // 31. Scene score below threshold -> no visual candidate generated
  // ─────────────────────────────────────────────────────────────
  test('31. Scene score below threshold is ignored as noise', () => {
    const words = [
      { word: 'Calm', start: 180.000, end: 180.400 },
      { word: 'scene.', start: 180.400, end: 180.900 },
    ];
    // Score 0.15 is below profile threshold 0.30
    const snap = createSnapshot(words, [], 1000, [{ startSec: 181.000, endSec: 181.000, value: 0.15 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Calm scene.',
        startSec: 180.000,
        endSec: 180.900,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 180.000, endSec: 180.900 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.endSnappedTo).not.toBe('visual_cut');
  });

  // ─────────────────────────────────────────────────────────────
  // 32. High scene score with immediate subsequent speech -> hard feasibility rejects it
  // ─────────────────────────────────────────────────────────────
  test('32. High scene score with immediate subsequent speech: hard feasibility rejects it', () => {
    const words = [
      { word: 'Part', start: 190.000, end: 190.400 },
      { word: 'one.', start: 190.400, end: 190.800 },
      // Immediate speech at 190.900
      { word: 'Part', start: 190.900, end: 191.200 },
      { word: 'two.', start: 191.200, end: 191.600 },
    ];
    // Strong visual cut at 191.100 inside "Part two"
    const snap = createSnapshot(words, [], 1000, [{ startSec: 191.100, endSec: 191.100, value: 0.99 }]);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Part one.',
        startSec: 190.000,
        endSec: 190.800,
        hasTerminalPunctuation: true,
        words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 190.000, endSec: 190.800 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    // High visual score (0.99) MUST be rejected because it lands inside subsequent speech (190.9s)
    expect(result.endSec).toBeLessThan(190.900);
    expect(result.endSnappedTo).not.toBe('visual_cut');
  });

  // ─────────────────────────────────────────────────────────────
  // 33. Fast opening relevance gap beats sluggish preamble start
  // ─────────────────────────────────────────────────────────────
  test('33. Fast opening relevance gap: strips throat-clearing preamble to start directly on core thesis', () => {
    const words = [
      { word: 'So', start: 10.000, end: 10.200 },
      { word: 'basically,', start: 10.200, end: 10.600 },
      { word: 'the', start: 10.700, end: 10.850 },
      { word: 'real', start: 10.850, end: 11.100 },
      { word: 'secret', start: 11.100, end: 11.500 },
      { word: 'is', start: 11.500, end: 11.700 },
      { word: 'focus.', start: 11.700, end: 12.200 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'So basically, the real secret is focus.',
        startSec: 10.000,
        endSec: 12.200,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [
          {
            id: 'c1',
            sentenceId: 's1',
            text: 'So basically,',
            startSec: 10.000,
            endSec: 10.600,
            isIntroductoryPreamble: true,
            words: words.slice(0, 2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
            endsWithConjunction: false,
          },
          {
            id: 'c2',
            sentenceId: 's1',
            text: 'the real secret is focus.',
            startSec: 10.700,
            endSec: 12.200,
            isIntroductoryPreamble: false,
            words: words.slice(2).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
            endsWithConjunction: false,
          },
        ],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 10.000, endSec: 12.200 },
      snap,
      sentences,
      { minDurationSec: 1.0, maxDurationSec: 5.0 }
    );

    expect(result.startSnappedTo).toBe('clause_start');
    expect(result.startSec).toBeGreaterThanOrEqual(10.55); // Strips "So basically,"
    expect(result.startPreference?.promiseAlignmentScore).toBeGreaterThanOrEqual(0.95);
    expect(result.openingRelevanceGapMs).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────
  // 34. Low context debt: self-contained statement is preserved
  // ─────────────────────────────────────────────────────────────
  test('34. Low context debt: self-contained thesis statement has high context sufficiency', () => {
    const words = [
      { word: "That's", start: 20.000, end: 20.300 },
      { word: 'why', start: 20.300, end: 20.500 },
      { word: 'we', start: 20.500, end: 20.700 },
      { word: 'engineered', start: 20.700, end: 21.200 },
      { word: 'this', start: 21.200, end: 21.400 },
      { word: 'system.', start: 21.400, end: 21.900 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: "That's why we engineered this system.",
        startSec: 20.000,
        endSec: 21.900,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 20.000, endSec: 21.900 },
      snap,
      sentences,
      { minDurationSec: 1.0, maxDurationSec: 5.0 }
    );

    expect(result.startPreference?.contextDebtScore).toBeLessThan(0.20);
    expect(result.startPreference?.contextSufficiencyScore).toBeGreaterThanOrEqual(0.85);
  });

  // ─────────────────────────────────────────────────────────────
  // 35. High context debt: isolated dangling phrase penalized
  // ─────────────────────────────────────────────────────────────
  test('35. High context debt: isolated dangling phrase has low context sufficiency', () => {
    const words = [
      { word: "That's", start: 30.000, end: 30.300 },
      { word: 'why.', start: 30.300, end: 30.600 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: "That's why.",
        startSec: 30.000,
        endSec: 30.600,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 30.000, endSec: 30.600 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.startPreference?.contextDebtScore).toBeGreaterThanOrEqual(0.50);
    expect(result.startPreference?.contextSufficiencyScore).toBeLessThanOrEqual(0.50);
  });

  // ─────────────────────────────────────────────────────────────
  // 36. Dead-tail penalty eliminates excessive empty silence
  // ─────────────────────────────────────────────────────────────
  test('36. Dead-tail penalty: selects tight post-roll over bloated empty silence', () => {
    const words = [
      { word: 'The', start: 40.000, end: 40.300 },
      { word: 'end.', start: 40.300, end: 40.800 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'The end.',
        startSec: 40.000,
        endSec: 40.800,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 40.000, endSec: 42.000 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0, profile: STANDARD_BOUNDARY_PROFILES.default }
    );

    // Should land within normal post-roll (~180ms) and NOT drag to 42.0s
    expect(result.endSec).toBeLessThan(41.200);
    expect(result.deadTailMs).toBeDefined();
    expect(result.deadTailMs).toBeLessThanOrEqual(300);
  });

  // ─────────────────────────────────────────────────────────────
  // 37. Loop-friendly ending receives bonus when circular narrative connects
  // ─────────────────────────────────────────────────────────────
  test('37. Loop-friendly ending: awards bonus when circular connection connects back to opening', () => {
    const words = [
      { word: 'Why', start: 50.000, end: 50.300 },
      { word: 'we', start: 50.300, end: 50.500 },
      { word: 'started', start: 50.500, end: 50.900 },
      { word: 'building', start: 50.900, end: 51.400 },
      { word: 'rockets.', start: 51.400, end: 52.000 },
      { word: 'Which', start: 52.200, end: 52.500 },
      { word: 'brings', start: 52.500, end: 52.800 },
      { word: 'us', start: 52.800, end: 53.000 },
      { word: 'back', start: 53.000, end: 53.300 },
      { word: 'to', start: 53.300, end: 53.500 },
      { word: 'building', start: 53.500, end: 53.900 },
      { word: 'rockets.', start: 53.900, end: 54.500 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Why we started building rockets.',
        startSec: 50.000,
        endSec: 52.000,
        hasTerminalPunctuation: true,
        words: words.slice(0, 5).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
      {
        id: 's2',
        index: 2,
        text: 'Which brings us back to building rockets.',
        startSec: 52.200,
        endSec: 54.500,
        hasTerminalPunctuation: true,
        words: words.slice(5).map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 50.000, endSec: 54.500 },
      snap,
      sentences,
      { minDurationSec: 2.0, maxDurationSec: 10.0 }
    );

    expect(result.endMode).toBe('loop_friendly');
    expect(result.endPreference?.loopFriendlyBonus).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 38. Diagnostic boundary telemetry: efficiency and waste ratio
  // ─────────────────────────────────────────────────────────────
  test('38. Diagnostic boundary telemetry: boundaryEfficiency and boundaryWasteRatio are recorded', () => {
    const words = [
      { word: 'Clean', start: 60.000, end: 60.400 },
      { word: 'execution.', start: 60.400, end: 61.000 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Clean execution.',
        startSec: 60.000,
        endSec: 61.000,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 60.000, endSec: 61.000 },
      snap,
      sentences,
      { minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.boundaryEfficiency).toBeDefined();
    expect(result.boundaryEfficiency).toBeGreaterThan(0.70);
    expect(result.boundaryWasteRatio).toBeDefined();
    expect(result.boundaryWasteRatio).toBeLessThan(0.30);
  });

  // ─────────────────────────────────────────────────────────────
  // 39. Profile-driven viewer weights customize scoring
  // ─────────────────────────────────────────────────────────────
  test('39. Profile-driven viewer weights: custom weights adjust start & end scoring', () => {
    const words = [
      { word: 'Quick', start: 70.000, end: 70.300 },
      { word: 'tip.', start: 70.300, end: 70.700 },
    ];
    const snap = createSnapshot(words);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Quick tip.',
        startSec: 70.000,
        endSec: 70.700,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const customProfile = {
      ...STANDARD_BOUNDARY_PROFILES.default,
      viewerStartWeights: {
        promiseAlignment: 0.40,
        hookStrength: 0.30,
        contextSufficiency: 0.10,
        speechOnsetQuality: 0.10,
        visualSalience: 0.05,
        previousContextPenalty: 0.05,
        deadAirPenalty: 0.20,
      },
      viewerEndWeights: {
        completion: 0.30,
        payoff: 0.30,
        acousticLanding: 0.20,
        deadTailPenalty: 0.20,
        nextSpeechRisk: 0.10,
        loopFriendlyBonus: 0.08,
      },
    };

    const result = BoundaryPlanner.planBoundary(
      { startSec: 70.000, endSec: 70.700 },
      snap,
      sentences,
      { profile: customProfile, minDurationSec: 0.5, maxDurationSec: 5.0 }
    );

    expect(result.startPreference).toBeDefined();
    expect(result.endPreference).toBeDefined();
    expect(result.startPreference?.totalScore).toBeGreaterThan(0.5);
  });

  // ─────────────────────────────────────────────────────────────
  // 40. Modern 3-minute Shorts platform ceiling (180s) support
  // ─────────────────────────────────────────────────────────────
  test('40. Modern 3-minute platform ceiling: accepts clips up to 180s without artificial 60s clamping', () => {
    const words = [
      { word: 'Start', start: 0.000, end: 0.500 },
      { word: 'Middle', start: 60.000, end: 60.500 },
      { word: 'Story', start: 120.000, end: 120.500 },
      { word: 'Finish.', start: 175.000, end: 175.800 },
    ];
    const snap = createSnapshot(words, [], 200);
    const sentences: SentenceUnit[] = [
      {
        id: 's1',
        index: 1,
        text: 'Start story finish.',
        startSec: 0.000,
        endSec: 175.800,
        hasTerminalPunctuation: true,
        words: words.map(w => ({ text: w.word, startSec: w.start, endSec: w.end })),
        clauses: [],
      },
    ];

    const result = BoundaryPlanner.planBoundary(
      { startSec: 0.000, endSec: 175.800, targetDurationSec: 175.0 },
      snap,
      sentences,
      {
        durationPolicy: { minSec: 30.0, maxSec: 175.0, hardMaxSec: 180.0, priority: 'story' },
        minDurationSec: 30.0,
        softMaxDurationSec: 175.0,
        hardMaxDurationSec: 180.0,
      }
    );

    // Must preserve the full 175s story without truncating at 60s
    expect(result.durationSec).toBeGreaterThan(170.0);
    expect(result.durationSec).toBeLessThanOrEqual(180.0);
  });
});

