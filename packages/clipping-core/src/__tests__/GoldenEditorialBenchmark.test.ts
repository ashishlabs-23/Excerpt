import { CandidateGenerator } from '../candidates/CandidateGenerator';
import { ClipRankingEngine } from '../ranking/ClipRankingEngine';
import { BoundaryPlanner } from '../planning/BoundaryPlanner';
import { PerceptionSnapshot } from '../perception/types';
import { SentenceUnit, STANDARD_BOUNDARY_PROFILES } from '../planning/types';
import { SemanticUnitTokenizer } from '../planning/SemanticUnitTokenizer';

describe('Golden Editorial Benchmark - End-to-End Quality Invariants Across Core Genres', () => {
  const createSnapshot = (
    words: Array<{ word: string; start: number; end: number }>,
    silences: Array<{ startSec: number; endSec: number }> = [],
    durationSec = 300.0,
    scenes: Array<{ startSec: number; endSec: number }> = [],
    speakers: Array<{ startSec: number; endSec: number; speaker: string }> = []
  ): PerceptionSnapshot => ({
    schemaVersion: '1.0',
    cacheKey: 'golden-benchmark',
    source: {
      hash: 'golden-hash',
      durationSec,
      width: 1920,
      height: 1080,
      fps: 30,
      audioChannels: 2,
    },
    transcript: {
      fullText: words.map((w) => w.word).join(' '),
      segments: [],
      words,
    },
    audio: {
      sampleIntervalSec: 1.0,
      energySummary: [],
      meanVolumeDb: -18,
      maxVolumeDb: -1,
      events: silences.map((s) => ({ type: 'silence', startSec: s.startSec, endSec: s.endSec, value: 0 })),
    },
    scenes: { events: scenes.map((s) => ({ type: 'scene_cut', startSec: s.startSec, endSec: s.endSec, value: 0.8 })) },
    speakers: {
      tracks: speakers.map((sp) => ({ startSec: sp.startSec, endSec: sp.endSec, speaker: sp.speaker, speakingProbability: 0.9 })),
      faceProminenceScore: 0.85,
    },
    extractors: {} as any,
    createdAt: new Date().toISOString(),
  } as unknown as PerceptionSnapshot);

  // Helper to test Zero Mid-Word Cuts
  const assertZeroMidWordCuts = (startSec: number, endSec: number, words: Array<{ word: string; start: number; end: number }>) => {
    for (const w of words) {
      // Start cannot be strictly inside a word: w.start < startSec < w.end
      const startCutInside = startSec > w.start + 0.02 && startSec < w.end - 0.02;
      expect(startCutInside).toBe(false);

      // End cannot be strictly inside a word: w.start < endSec < w.end
      const endCutInside = endSec > w.start + 0.02 && endSec < w.end - 0.02;
      expect(endCutInside).toBe(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // GENRE 1: TECH PODCAST & BUSINESS LESSON
  // ──────────────────────────────────────────────────────────────────────────
  describe('Genre 1: Tech / Business Masterclass', () => {
    const rawWords = [
      { word: 'So', start: 10.0, end: 10.2 },
      { word: 'the', start: 10.2, end: 10.3 },
      { word: 'biggest', start: 10.3, end: 10.7 },
      { word: 'mistake', start: 10.7, end: 11.2 },
      { word: 'startup', start: 11.2, end: 11.6 },
      { word: 'founders', start: 11.6, end: 12.1 },
      { word: 'make', start: 12.1, end: 12.4 },
      { word: 'is', start: 12.4, end: 12.6 },
      { word: 'optimizing', start: 12.6, end: 13.2 },
      { word: 'for', start: 13.2, end: 13.4 },
      { word: 'hype.', start: 13.4, end: 13.9 },
      // Speech body with natural pacing
      { word: 'They', start: 14.5, end: 14.8 },
      { word: 'spend', start: 14.8, end: 15.1 },
      { word: 'months', start: 15.1, end: 15.5 },
      { word: 'building', start: 15.5, end: 15.9 },
      { word: 'features', start: 15.9, end: 16.4 },
      { word: 'nobody', start: 16.4, end: 16.8 },
      { word: 'wants,', start: 16.8, end: 17.3 },
      { word: 'and', start: 17.6, end: 17.8 },
      { word: 'that', start: 17.8, end: 18.0 },
      { word: 'is', start: 18.0, end: 18.2 },
      { word: 'why', start: 18.2, end: 18.5 },
      { word: 'retention', start: 18.5, end: 19.1 },
      { word: 'always', start: 19.1, end: 19.5 },
      { word: 'beats', start: 19.5, end: 19.8 },
      { word: 'acquisition.', start: 19.8, end: 20.6 },
      // Next unrelated sentence after silence
      { word: 'Let', start: 22.0, end: 22.2 },
      { word: 'us', start: 22.2, end: 22.4 },
      { word: 'move', start: 22.4, end: 22.7 },
      { word: 'on.', start: 22.7, end: 23.0 },
    ];

    const silences = [
      { startSec: 13.95, endSec: 14.45 },
      { startSec: 20.65, endSec: 21.95 },
    ];

    test('achieves zero mid-word cuts, captures high hook keyword density, and lands on breath pause', () => {
      // 1. Candidate Generation Feature Extraction
      const salientWindows = CandidateGenerator.discoverSalientWindows(rawWords, {
        windowDurationSec: 15.0,
        stepSec: 2.0,
        minWordsPerWindow: 8,
      });
      expect(salientWindows.length).toBeGreaterThan(0);
      const topSalient = salientWindows[0];
      expect(topSalient.hookKeywordCount).toBeGreaterThan(0); // 'biggest', 'mistake', 'why', 'nobody'

      // 2. Tokenize into semantic units
      const semanticUnits = SemanticUnitTokenizer.tokenize(rawWords);
      const snapshot = createSnapshot(rawWords, silences, 30.0);

      // 3. Boundary Planning - Canonical Authority
      const planned = BoundaryPlanner.planBoundary(
        { startSec: 10.0, endSec: 21.0, targetDurationSec: 12.0 },
        snapshot,
        semanticUnits,
        {
          profile: STANDARD_BOUNDARY_PROFILES.podcast,
          minDurationSec: 5.0,
          maxDurationSec: 25.0,
        }
      );

      // Invariant Verifications
      expect(planned.startSec).toBeLessThanOrEqual(10.05); // Clean thesis opening
      expect(planned.endSec).toBeGreaterThanOrEqual(20.5); // Completed payoff
      expect(planned.endSec).toBeLessThan(22.0); // Zero speech bleed into next topic
      assertZeroMidWordCuts(planned.startSec, planned.endSec, rawWords);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GENRE 2: 2-SPEAKER HIGH-STAKES INTERVIEW
  // ──────────────────────────────────────────────────────────────────────────
  describe('Genre 2: 2-Speaker High-Stakes Interview', () => {
    const rawWords = [
      // Host Question
      { word: 'Did', start: 50.0, end: 50.2 },
      { word: 'you', start: 50.2, end: 50.4 },
      { word: 'ever', start: 50.4, end: 50.7 },
      { word: 'regret', start: 50.7, end: 51.1 },
      { word: 'selling', start: 51.1, end: 51.5 },
      { word: 'the', start: 51.5, end: 51.7 },
      { word: 'company?', start: 51.7, end: 52.3 },
      // Guest Honest Admission
      { word: 'Every', start: 53.0, end: 53.3 },
      { word: 'single', start: 53.3, end: 53.7 },
      { word: 'day', start: 53.7, end: 54.0 },
      { word: 'for', start: 54.0, end: 54.2 },
      { word: 'three', start: 54.2, end: 54.6 },
      { word: 'years.', start: 54.6, end: 55.2 },
      { word: 'It', start: 55.8, end: 56.0 },
      { word: 'felt', start: 56.0, end: 56.3 },
      { word: 'like', start: 56.3, end: 56.5 },
      { word: 'losing', start: 56.5, end: 57.0 },
      { word: 'part', start: 57.0, end: 57.3 },
      { word: 'of', start: 57.3, end: 57.5 },
      { word: 'my', start: 57.5, end: 57.8 },
      { word: 'soul.', start: 57.8, end: 58.4 },
      // Next question by host
      { word: 'What', start: 60.0, end: 60.2 },
      { word: 'helped', start: 60.2, end: 60.5 },
      { word: 'you', start: 60.5, end: 60.7 },
      { word: 'recover?', start: 60.7, end: 61.3 },
    ];

    const silences = [
      { startSec: 52.35, endSec: 52.95 },
      { startSec: 55.25, endSec: 55.75 },
      { startSec: 58.45, endSec: 59.95 },
    ];

    const speakers = [
      { startSec: 50.0, endSec: 52.4, speaker: 'host' },
      { startSec: 53.0, endSec: 58.5, speaker: 'guest' },
      { startSec: 60.0, endSec: 61.5, speaker: 'host' },
    ];

    test('preserves Question+Answer context arc without bleeding into host follow-up', () => {
      const semanticUnits = SemanticUnitTokenizer.tokenize(rawWords);
      const snapshot = createSnapshot(rawWords, silences, 100.0, [], speakers);

      const planned = BoundaryPlanner.planBoundary(
        { startSec: 50.0, endSec: 58.5, targetDurationSec: 10.0 },
        snapshot,
        semanticUnits,
        {
          profile: STANDARD_BOUNDARY_PROFILES.podcast,
          minDurationSec: 4.0,
          maxDurationSec: 15.0,
        }
      );

      expect(planned.startSec).toBeLessThanOrEqual(50.1); // Starts at host question
      expect(planned.endSec).toBeGreaterThanOrEqual(58.3); // Completes guest admission ("my soul.")
      expect(planned.endSec).toBeLessThan(60.0); // Zero speech bleed into next host question
      assertZeroMidWordCuts(planned.startSec, planned.endSec, rawWords);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GENRE 3: SPORTS & ACTION CLIMAX
  // ──────────────────────────────────────────────────────────────────────────
  describe('Genre 3: Sports Climax & Commentary Eruption', () => {
    const rawWords = [
      { word: 'Messi', start: 80.0, end: 80.4 },
      { word: 'takes', start: 80.4, end: 80.7 },
      { word: 'it', start: 80.7, end: 80.9 },
      { word: 'past', start: 80.9, end: 81.2 },
      { word: 'two', start: 81.2, end: 81.5 },
      { word: 'defenders!', start: 81.5, end: 82.2 },
      { word: 'He', start: 82.5, end: 82.7 },
      { word: 'shoots!', start: 82.7, end: 83.3 },
      { word: 'GOAL!', start: 83.5, end: 84.8 },
      { word: 'Unbelievable', start: 85.2, end: 86.0 },
      { word: 'scenes', start: 86.0, end: 86.4 },
      { word: 'in', start: 86.4, end: 86.6 },
      { word: 'stoppage', start: 86.6, end: 87.1 },
      { word: 'time!', start: 87.1, end: 87.8 },
      // Post-celebration calm
      { word: 'Back', start: 91.0, end: 91.3 },
      { word: 'to', start: 91.3, end: 91.5 },
      { word: 'the', start: 91.5, end: 91.7 },
      { word: 'center', start: 91.7, end: 92.1 },
      { word: 'circle.', start: 92.1, end: 92.6 },
    ];

    const silences = [
      { startSec: 87.85, endSec: 90.95 },
    ];

    test('preserves entire celebration & commentary climax without truncation', () => {
      const semanticUnits = SemanticUnitTokenizer.tokenize(rawWords);
      const snapshot = createSnapshot(rawWords, silences, 120.0);

      const planned = BoundaryPlanner.planBoundary(
        { startSec: 80.0, endSec: 88.0, targetDurationSec: 9.0 },
        snapshot,
        semanticUnits,
        {
          profile: STANDARD_BOUNDARY_PROFILES.sports,
          minDurationSec: 5.0,
          maxDurationSec: 20.0,
        }
      );

      expect(planned.startSec).toBeLessThanOrEqual(80.1);
      expect(planned.endSec).toBeGreaterThanOrEqual(87.7); // Fully captures "stoppage time!"
      expect(planned.endSec).toBeLessThan(91.0); // Ends before reset to center circle
      assertZeroMidWordCuts(planned.startSec, planned.endSec, rawWords);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GENRE 4: TECHNICAL EXPLAINER / TUTORIAL
  // ──────────────────────────────────────────────────────────────────────────
  describe('Genre 4: Technical Explainer / Tutorial', () => {
    const rawWords = [
      { word: 'Here', start: 120.0, end: 120.2 },
      { word: 'is', start: 120.2, end: 120.4 },
      { word: 'how', start: 120.4, end: 120.6 },
      { word: 'to', start: 120.6, end: 120.8 },
      { word: 'fix', start: 120.8, end: 121.1 },
      { word: 'the', start: 121.1, end: 121.3 },
      { word: 'memory', start: 121.3, end: 121.8 },
      { word: 'leak.', start: 121.8, end: 122.3 },
      { word: 'Wrap', start: 123.0, end: 123.4 },
      { word: 'your', start: 123.4, end: 123.7 },
      { word: 'listener', start: 123.7, end: 124.3 },
      { word: 'inside', start: 124.3, end: 124.7 },
      { word: 'a', start: 124.7, end: 124.8 },
      { word: 'clean-up', start: 124.8, end: 125.4 },
      { word: 'effect,', start: 125.4, end: 126.0 },
      { word: 'and', start: 126.4, end: 126.6 },
      { word: 'your', start: 126.6, end: 126.9 },
      { word: 'leaks', start: 126.9, end: 127.3 },
      { word: 'will', start: 127.3, end: 127.6 },
      { word: 'disappear', start: 127.6, end: 128.2 },
      { word: 'completely.', start: 128.2, end: 128.9 },
      // Unrelated next topic
      { word: 'Next,', start: 131.0, end: 131.4 },
      { word: 'let', start: 131.4, end: 131.6 },
      { word: 'us', start: 131.6, end: 131.8 },
      { word: 'discuss', start: 131.8, end: 132.3 },
      { word: 'caching.', start: 132.3, end: 132.9 },
    ];

    const silences = [
      { startSec: 122.35, endSec: 122.95 },
      { startSec: 128.95, endSec: 130.95 },
    ];

    test('rejects dangling pronouns and completes actionable tutorial resolution', () => {
      const semanticUnits = SemanticUnitTokenizer.tokenize(rawWords);
      const snapshot = createSnapshot(rawWords, silences, 200.0);

      const planned = BoundaryPlanner.planBoundary(
        { startSec: 120.0, endSec: 129.0, targetDurationSec: 10.0 },
        snapshot,
        semanticUnits,
        {
          profile: STANDARD_BOUNDARY_PROFILES.tutorial,
          minDurationSec: 5.0,
          maxDurationSec: 20.0,
        }
      );

      expect(planned.startSec).toBeLessThanOrEqual(120.1); // Thesis statement ("Here is how to fix...")
      expect(planned.endSec).toBeGreaterThanOrEqual(128.8); // Complete resolution ("...disappear completely.")
      expect(planned.endSec).toBeLessThan(131.0); // Clean stop before "Next, let us discuss..."
      assertZeroMidWordCuts(planned.startSec, planned.endSec, rawWords);
    });
  });
});
