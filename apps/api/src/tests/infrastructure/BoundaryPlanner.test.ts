import {
  BoundaryPlanner,
  SemanticUnitTokenizer,
  PerceptionSnapshot,
  WordUnit,
} from '@excerpt/clipping-core';
import { validateClipBoundary } from '../../services/pipelineUtils';

describe('Canonical Boundary Planner & Editorial Correctness', () => {
  // Synthetic sample transcript with word-level timestamps
  const sampleWords = [
    // Sentence 1: "So basically, I never thought this would actually work." (0.0s - 3.8s)
    { word: 'So', start: 0.12, end: 0.35 },
    { word: 'basically,', start: 0.40, end: 0.95 },
    { word: 'I', start: 1.10, end: 1.25 },
    { word: 'never', start: 1.30, end: 1.65 },
    { word: 'thought', start: 1.70, end: 2.10 },
    { word: 'this', start: 2.15, end: 2.40 },
    { word: 'would', start: 2.45, end: 2.75 },
    { word: 'actually', start: 2.80, end: 3.25 },
    { word: 'work.', start: 3.30, end: 3.80 },

    // Silence pause between 3.80s and 4.50s (700ms silence)

    // Sentence 2: "We tested it across ten thousand active users." (4.5s - 8.2s)
    { word: 'We', start: 4.50, end: 4.70 },
    { word: 'tested', start: 4.75, end: 5.15 },
    { word: 'it', start: 5.20, end: 5.35 },
    { word: 'across', start: 5.40, end: 5.80 },
    { word: 'ten', start: 5.85, end: 6.10 },
    { word: 'thousand', start: 6.15, end: 6.65 },
    { word: 'active', start: 6.70, end: 7.20 },
    { word: 'users.', start: 7.25, end: 8.20 },

    // Silence pause between 8.20s and 8.90s (700ms silence)

    // Sentence 3: "And that is why the database melted completely." (8.9s - 13.2s) [Payoff]
    { word: 'And', start: 8.90, end: 9.15 },
    { word: 'that', start: 9.20, end: 9.45 },
    { word: 'is', start: 9.50, end: 9.65 },
    { word: 'why', start: 9.70, end: 9.95 },
    { word: 'the', start: 10.00, end: 10.15 },
    { word: 'database', start: 10.20, end: 10.85 },
    { word: 'melted', start: 10.90, end: 11.45 },
    { word: 'completely.', start: 11.50, end: 13.20 },

    // Silence pause between 13.20s and 14.10s (900ms silence)

    // Sentence 4: "Next week we are launching version two." (14.1s - 17.5s)
    { word: 'Next', start: 14.10, end: 14.45 },
    { word: 'week', start: 14.50, end: 14.85 },
    { word: 'we', start: 14.90, end: 15.10 },
    { word: 'are', start: 15.15, end: 15.30 },
    { word: 'launching', start: 15.35, end: 16.10 },
    { word: 'version', start: 16.15, end: 16.70 },
    { word: 'two.', start: 16.75, end: 17.50 },
  ];

  const mockSnapshot: PerceptionSnapshot = {
    schemaVersion: '1.0',
    cacheKey: 'test_cache_key',
    source: {
      hash: 'hash123',
      durationSec: 30.0,
      width: 1920,
      height: 1080,
      fps: 30,
      audioChannels: 2,
    },
    transcript: {
      fullText: sampleWords.map(w => w.word).join(' '),
      segments: [
        { text: 'So basically, I never thought this would actually work.', start: 0.12, end: 3.80, speaker: 'spk_1' },
        { text: 'We tested it across ten thousand active users.', start: 4.50, end: 8.20, speaker: 'spk_1' },
        { text: 'And that is why the database melted completely.', start: 8.90, end: 13.20, speaker: 'spk_1' },
        { text: 'Next week we are launching version two.', start: 14.10, end: 17.50, speaker: 'spk_1' },
      ],
      words: sampleWords,
    },
    audio: {
      sampleIntervalSec: 1.0,
      energySummary: [0.5, 0.6, 0.7, 0.4, 0.8, 0.9, 0.7, 0.8, 0.9, 0.8, 0.9, 0.9, 0.2, 0.1, 0.7, 0.8, 0.8, 0.2],
      meanVolumeDb: -18,
      maxVolumeDb: -1.2,
      events: [
        { type: 'silence', startSec: 3.85, endSec: 4.45, durationSec: 0.6, value: -35 },
        { type: 'silence', startSec: 8.25, endSec: 8.85, durationSec: 0.6, value: -35 },
        { type: 'silence', startSec: 13.25, endSec: 14.05, durationSec: 0.8, value: -35 },
        { type: 'silence', startSec: 17.55, endSec: 19.00, durationSec: 1.45, value: -35 },
      ],
    },
    scenes: {
      events: [
        { startSec: 13.30, endSec: 13.35, score: 0.85 }, // Visual cut right after Sentence 3
      ],
    },
    speakers: {
      tracks: [
        { speakerId: 'spk_1', startSec: 0, endSec: 18, centerX: 0.5, centerY: 0.35, speakingProbability: 0.9, confidence: 0.95 },
      ],
      faceProminenceScore: 85,
    },
    extractors: {} as any,
    createdAt: new Date().toISOString(),
  };

  test('Pillar 1: SemanticUnitTokenizer builds document -> sentence -> clause hierarchy', () => {
    const units = SemanticUnitTokenizer.tokenize(sampleWords, mockSnapshot.transcript.segments);
    expect(units.length).toBe(4);
    
    // Check Sentence 1
    const s1 = units[0];
    expect(s1.text).toContain('I never thought');
    expect(s1.hasTerminalPunctuation).toBe(true);
    expect(s1.clauses.length).toBeGreaterThanOrEqual(2);
    
    // First clause is introductory preamble "So basically,"
    expect(s1.clauses[0].isIntroductoryPreamble).toBe(true);
    expect(s1.clauses[0].text).toContain('So basically');
    
    // Second clause is the core hook
    expect(s1.clauses[1].isIntroductoryPreamble).toBe(false);
    expect(s1.clauses[1].text).toContain('I never thought');
  });

  test('Pillar 2: Preambles are stripped to start on the core thesis clause', () => {
    const units = SemanticUnitTokenizer.tokenize(sampleWords, mockSnapshot.transcript.segments);
    const boundary = BoundaryPlanner.planBoundary(
      { startSec: 0.0, endSec: 13.5, targetDurationSec: 12.0 },
      mockSnapshot,
      units,
      { targetDurationSec: 12.0 }
    );

    // Should start at clause 2 ("I never thought...") around 1.1s (minus breath room), NOT 0.0s
    expect(boundary.startSnappedTo).toBe('clause_start');
    expect(boundary.startSec).toBeGreaterThanOrEqual(0.9);
    expect(boundary.startSec).toBeLessThanOrEqual(1.15);
  });

  test('Pillar 3: Soft duration window prefers complete thought (13.2s) over forced 15.0s cutoff', () => {
    const units = SemanticUnitTokenizer.tokenize(sampleWords, mockSnapshot.transcript.segments);
    
    // Request a 15.0s clip starting around sentence 1 core (1.1s)
    // If clamped to 15.0s, end would be 16.1s (cutting mid-sentence into "launching version two")
    const boundary = BoundaryPlanner.planBoundary(
      { startSec: 1.1, endSec: 16.1, targetDurationSec: 15.0 },
      mockSnapshot,
      units,
      {
        targetDurationSec: 15.0,
        preferredWindowMarginSec: 4.0, // Preferred window: 11s to 19s
      }
    );

    // Planner MUST select the payoff ending of Sentence 3 ("...melted completely.") at ~13.2s-13.5s
    // rather than cutting Sentence 4 in half at 16.1s
    expect(boundary.endSec).toBeGreaterThanOrEqual(13.2);
    expect(boundary.endSec).toBeLessThan(14.1); // Did not cut into Sentence 4
    expect(boundary.endSnappedTo).toBe('payoff_end');
    expect(boundary.evidence.sentenceBoundary).toBe(1.0);
    expect(boundary.evidence.payoffBoundary).toBe(1.0);
  });

  test('Pillar 4: Zero-Truncation Guard ensures cuts never land mid-word', () => {
    const units = SemanticUnitTokenizer.tokenize(sampleWords, mockSnapshot.transcript.segments);
    
    // Inject intentionally corrupted raw timestamps cutting right inside words
    // "tested" is [4.75, 5.15] -> test 4.90
    // "database" is [10.20, 10.85] -> test 10.50
    const boundary = BoundaryPlanner.planBoundary(
      { startSec: 4.90, endSec: 10.50, targetDurationSec: 6.0 },
      mockSnapshot,
      units,
      { targetDurationSec: 6.0, minDurationSec: 2.0 }
    );

    // Verify boundary start is NOT inside any word
    for (const w of sampleWords) {
      const startInside = boundary.startSec > w.start && boundary.startSec < w.end;
      const endInside = boundary.endSec > w.start && boundary.endSec < w.end;
      expect(startInside).toBe(false);
      expect(endInside).toBe(false);
    }
  });

  test('Pillar 5: Real audio silence landing applies breath and reverberation padding', () => {
    const units = SemanticUnitTokenizer.tokenize(sampleWords, mockSnapshot.transcript.segments);
    
    // Boundary ending at Sentence 2 (8.2s) where silence is [8.25s, 8.85s]
    const boundary = BoundaryPlanner.planBoundary(
      { startSec: 4.5, endSec: 8.2, targetDurationSec: 4.0 },
      mockSnapshot,
      units,
      { targetDurationSec: 4.0, minDurationSec: 2.0 }
    );

    // End must land cleanly in the succeeding silence interval
    expect(boundary.endSec).toBeGreaterThanOrEqual(8.2);
    expect(boundary.endSec).toBeLessThanOrEqual(8.85);
    expect(boundary.evidence.acousticBoundary).toBeGreaterThanOrEqual(0.8);
  });

  test('Pillar 6: Downstream Immutability Invariant — validateClipBoundary does not mutate timestamps', () => {
    const canonicalStart = 1.05;
    const canonicalEnd = 13.35;
    
    const contextWithGraphics: any = {
      visualTimeline: [
        { second: 1.0, segment_type: 'graphic' },
        { second: 13.0, segment_type: 'graphic' },
      ],
      wowMoments: [],
    };

    const validation = validateClipBoundary(canonicalStart, canonicalEnd, contextWithGraphics);
    
    // Assert strictly: Timestamps are immutable
    expect(validation.start).toBe(canonicalStart);
    expect(validation.end).toBe(canonicalEnd);
    expect(validation.hasGraphicViolation).toBe(true);
    expect(validation.graphicPenalty).toBe(20);
  });
});
