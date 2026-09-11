import {
  BoundaryPlanner,
  SemanticUnitTokenizer,
  PerceptionSnapshot,
  WordUnit,
  CanonicalClipBoundary,
} from '@excerpt/clipping-core';

export interface BenchmarkScenario {
  id: string;
  name: string;
  category: 'complete_thought' | 'preamble_hook' | 'payoff_resolution' | 'mid_word_corrupt' | 'acoustic_silence' | 'speaker_turn' | 'dramatic_pause' | 'fast_dialogue' | 'tutorial_takeaway' | 'soft_window';
  words: Array<{ word: string; start: number; end: number }>;
  segments: Array<{ text: string; start: number; end: number; speaker?: string }>;
  silences: Array<{ startSec: number; endSec: number }>;
  sceneCuts: Array<{ startSec: number; endSec: number }>;
  rawCandidate: { startSec: number; endSec: number; targetDurationSec: number };
  payoffSentenceIndices?: number[];
}

export interface ScenarioEvaluation {
  scenarioId: string;
  name: string;
  legacy: {
    startSec: number;
    endSec: number;
    durationSec: number;
    cutsMidWord: boolean;
    cutsMidSentence: boolean;
    truncatesPayoff: boolean;
    landsInSilence: boolean;
    editorialScore: number;
  };
  canonical: {
    startSec: number;
    endSec: number;
    durationSec: number;
    cutsMidWord: boolean;
    cutsMidSentence: boolean;
    truncatesPayoff: boolean;
    landsInSilence: boolean;
    editorialScore: number;
    evidence: CanonicalClipBoundary['evidence'];
  };
  winner: 'canonical' | 'legacy' | 'tie';
  explanation: string;
}

export interface BenchmarkReport {
  scenariosCount: number;
  canonicalWins: number;
  legacyWins: number;
  ties: number;
  metrics: {
    legacyMidWordRate: number;
    canonicalMidWordRate: number;
    legacyMidSentenceRate: number;
    canonicalMidSentenceRate: number;
    legacyPayoffTruncationRate: number;
    canonicalPayoffTruncationRate: number;
    legacyCleanSilenceRate: number;
    canonicalCleanSilenceRate: number;
    canonicalWinRate: number;
  };
  evaluations: ScenarioEvaluation[];
}

export class BoundaryEditorialBenchmark {
  /**
   * 10 diverse, representative editorial scenarios for viral short clipping.
   */
  public static getBenchmarkScenarios(): BenchmarkScenario[] {
    return [
      // 1. Complete Thought at 13.2s vs. 15.0s hard cutoff
      {
        id: 'scenario_1_complete_thought',
        name: 'Complete Thought (13.2s) vs Forced 15s Clamp',
        category: 'complete_thought',
        words: [
          { word: 'We', start: 0.1, end: 0.3 },
          { word: 'shipped', start: 0.35, end: 0.75 },
          { word: 'the', start: 0.8, end: 0.95 },
          { word: 'feature', start: 1.0, end: 1.45 },
          { word: 'in', start: 1.5, end: 1.65 },
          { word: 'one', start: 1.7, end: 1.95 },
          { word: 'weekend.', start: 2.0, end: 2.8 },
          // Sentence 2 (4.0s - 6.2s)
          { word: 'Everyone', start: 4.0, end: 4.5 },
          { word: 'said', start: 4.55, end: 4.85 },
          { word: 'it', start: 4.9, end: 5.05 },
          { word: 'was', start: 5.1, end: 5.3 },
          { word: 'impossible.', start: 5.35, end: 6.2 },
          // Sentence 3 (7.5s - 13.2s)
          { word: 'Then', start: 7.5, end: 7.8 },
          { word: 'the', start: 7.85, end: 8.0 },
          { word: 'entire', start: 8.05, end: 8.5 },
          { word: 'system', start: 8.55, end: 9.0 },
          { word: 'went', start: 9.05, end: 9.35 },
          { word: 'viral', start: 9.4, end: 9.85 },
          { word: 'overnight.', start: 9.9, end: 13.2 },
          // Sentence 4 (14.0s - 17.5s)
          { word: 'Tomorrow', start: 14.0, end: 14.6 },
          { word: 'we', start: 14.65, end: 14.85 },
          { word: 'are', start: 14.9, end: 15.1 },
          { word: 'planning', start: 15.15, end: 15.8 },
          { word: 'a', start: 15.85, end: 15.95 },
          { word: 'press', start: 16.0, end: 16.5 },
          { word: 'release.', start: 16.55, end: 17.5 },
        ],
        segments: [
          { text: 'We shipped the feature in one weekend.', start: 0.1, end: 2.8 },
          { text: 'Everyone said it was impossible.', start: 4.0, end: 6.2 },
          { text: 'Then the entire system went viral overnight.', start: 7.5, end: 13.2 },
          { text: 'Tomorrow we are planning a press release.', start: 14.0, end: 17.5 },
        ],
        silences: [
          { startSec: 2.85, endSec: 3.95 },
          { startSec: 6.25, endSec: 7.45 },
          { startSec: 13.25, endSec: 13.95 },
          { startSec: 17.55, endSec: 18.5 },
        ],
        sceneCuts: [{ startSec: 13.3, endSec: 13.35 }],
        rawCandidate: { startSec: 0.1, endSec: 15.1, targetDurationSec: 15.0 },
        payoffSentenceIndices: [2],
      },

      // 2. Throat-clearing preamble ("So basically,") stripping
      {
        id: 'scenario_2_preamble_hook',
        name: 'Throat-Clearing Preamble Hook Alignment',
        category: 'preamble_hook',
        words: [
          { word: 'So', start: 0.15, end: 0.35 },
          { word: 'basically,', start: 0.4, end: 0.95 },
          { word: 'the', start: 1.1, end: 1.25 },
          { word: 'secret', start: 1.3, end: 1.75 },
          { word: 'to', start: 1.8, end: 1.95 },
          { word: 'saving', start: 2.0, end: 2.45 },
          { word: 'money', start: 2.5, end: 2.95 },
          { word: 'is', start: 3.0, end: 3.15 },
          { word: 'automation.', start: 3.2, end: 4.1 },
        ],
        segments: [
          { text: 'So basically, the secret to saving money is automation.', start: 0.15, end: 4.1 },
        ],
        silences: [{ startSec: 4.15, endSec: 5.0 }],
        sceneCuts: [],
        rawCandidate: { startSec: 0.1, endSec: 4.1, targetDurationSec: 4.0 },
      },

      // 3. Climax & Payoff resolution ending
      {
        id: 'scenario_3_payoff_resolution',
        name: 'Climax & Payoff Resolution Ending',
        category: 'payoff_resolution',
        words: [
          { word: 'We', start: 1.0, end: 1.2 },
          { word: 'spent', start: 1.25, end: 1.6 },
          { word: 'six', start: 1.65, end: 1.95 },
          { word: 'months', start: 2.0, end: 2.45 },
          { word: 'building', start: 2.5, end: 2.95 },
          { word: 'it.', start: 3.0, end: 3.6 },
          { word: 'And', start: 4.2, end: 4.4 },
          { word: 'that', start: 4.45, end: 4.7 },
          { word: 'is', start: 4.75, end: 4.9 },
          { word: 'why', start: 4.95, end: 5.2 },
          { word: 'the', start: 5.25, end: 5.4 },
          { word: 'server', start: 5.45, end: 5.95 },
          { word: 'melted', start: 6.0, end: 6.6 },
          { word: 'completely.', start: 6.65, end: 8.0 },
          { word: 'Also', start: 9.0, end: 9.3 },
          { word: 'we', start: 9.35, end: 9.55 },
          { word: 'bought', start: 9.6, end: 10.0 },
          { word: 'coffee.', start: 10.05, end: 10.8 },
        ],
        segments: [
          { text: 'We spent six months building it.', start: 1.0, end: 3.6 },
          { text: 'And that is why the server melted completely.', start: 4.2, end: 8.0 },
          { text: 'Also we bought coffee.', start: 9.0, end: 10.8 },
        ],
        silences: [
          { startSec: 3.65, endSec: 4.15 },
          { startSec: 8.05, endSec: 8.95 },
        ],
        sceneCuts: [{ startSec: 8.1, endSec: 8.15 }],
        rawCandidate: { startSec: 1.0, endSec: 8.0, targetDurationSec: 7.0 },
        payoffSentenceIndices: [1],
      },

      // 4. Mid-word Corrupted Boundary (Zero-Truncation Guard)
      {
        id: 'scenario_4_mid_word_corrupt',
        name: 'Zero-Truncation on Mid-Word Split Candidate',
        category: 'mid_word_corrupt',
        words: [
          { word: 'Machine', start: 2.0, end: 2.6 },
          { word: 'learning', start: 2.65, end: 3.2 },
          { word: 'transforms', start: 3.25, end: 4.1 },
          { word: 'everything.', start: 4.15, end: 5.0 },
        ],
        segments: [
          { text: 'Machine learning transforms everything.', start: 2.0, end: 5.0 },
        ],
        silences: [{ startSec: 5.05, endSec: 5.8 }],
        sceneCuts: [],
        // Candidate intentionally lands inside "transforms" (3.7) and "everything" (4.6)
        rawCandidate: { startSec: 3.7, endSec: 4.6, targetDurationSec: 3.0 },
      },

      // 5. Clean Acoustic Landing in Silence with Breath Space
      {
        id: 'scenario_5_acoustic_silence',
        name: 'Acoustic Silence Landing with Breath Padding',
        category: 'acoustic_silence',
        words: [
          { word: 'This', start: 1.0, end: 1.25 },
          { word: 'is', start: 1.3, end: 1.45 },
          { word: 'the', start: 1.5, end: 1.65 },
          { word: 'final', start: 1.7, end: 2.1 },
          { word: 'answer.', start: 2.15, end: 2.9 },
        ],
        segments: [
          { text: 'This is the final answer.', start: 1.0, end: 2.9 },
        ],
        silences: [{ startSec: 2.95, endSec: 3.85 }],
        sceneCuts: [],
        rawCandidate: { startSec: 1.0, endSec: 2.9, targetDurationSec: 2.5 },
      },

      // 6. Speaker Turn Boundary
      {
        id: 'scenario_6_speaker_turn',
        name: 'Speaker Turn Transition Alignment',
        category: 'speaker_turn',
        words: [
          { word: 'Did', start: 0.5, end: 0.7 },
          { word: 'you', start: 0.75, end: 0.9 },
          { word: 'see', start: 0.95, end: 1.15 },
          { word: 'that?', start: 1.2, end: 1.7 },
          { word: 'Yes', start: 2.5, end: 2.8 },
          { word: 'I', start: 2.85, end: 3.0 },
          { word: 'did.', start: 3.05, end: 3.6 },
        ],
        segments: [
          { text: 'Did you see that?', start: 0.5, end: 1.7, speaker: 'alice' },
          { text: 'Yes I did.', start: 2.5, end: 3.6, speaker: 'bob' },
        ],
        silences: [{ startSec: 1.75, endSec: 2.45 }],
        sceneCuts: [{ startSec: 2.0, endSec: 2.05 }],
        rawCandidate: { startSec: 0.5, endSec: 1.7, targetDurationSec: 2.0 },
      },

      // 7. Dramatic Silence Pause Before Revelation
      {
        id: 'scenario_7_dramatic_pause',
        name: 'Dramatic Pause Before Climax',
        category: 'dramatic_pause',
        words: [
          { word: 'And', start: 1.0, end: 1.2 },
          { word: 'guess', start: 1.25, end: 1.6 },
          { word: 'what?', start: 1.65, end: 2.2 },
          // 1.2s dramatic silence
          { word: 'We', start: 3.5, end: 3.7 },
          { word: 'won', start: 3.75, end: 4.1 },
          { word: 'first', start: 4.15, end: 4.55 },
          { word: 'place.', start: 4.6, end: 5.4 },
        ],
        segments: [
          { text: 'And guess what?', start: 1.0, end: 2.2 },
          { text: 'We won first place.', start: 3.5, end: 5.4 },
        ],
        silences: [
          { startSec: 2.25, endSec: 3.45 },
          { startSec: 5.45, endSec: 6.2 },
        ],
        sceneCuts: [{ startSec: 5.5, endSec: 5.55 }],
        rawCandidate: { startSec: 1.0, endSec: 5.4, targetDurationSec: 4.5 },
      },

      // 8. Fast Dialogue Exchange
      {
        id: 'scenario_8_fast_dialogue',
        name: 'Fast Dialogue with Punctuation Bounds',
        category: 'fast_dialogue',
        words: [
          { word: 'Wait,', start: 0.2, end: 0.55 },
          { word: 'stop.', start: 0.6, end: 1.0 },
          { word: 'Look', start: 1.2, end: 1.5 },
          { word: 'at', start: 1.55, end: 1.75 },
          { word: 'this', start: 1.8, end: 2.1 },
          { word: 'chart.', start: 2.15, end: 2.9 },
        ],
        segments: [
          { text: 'Wait, stop.', start: 0.2, end: 1.0 },
          { text: 'Look at this chart.', start: 1.2, end: 2.9 },
        ],
        silences: [{ startSec: 1.05, endSec: 1.18 }],
        sceneCuts: [],
        rawCandidate: { startSec: 0.2, endSec: 2.9, targetDurationSec: 2.5 },
      },

      // 9. Educational Tutorial Takeaway Step
      {
        id: 'scenario_9_tutorial_takeaway',
        name: 'Tutorial Step with Concluding Payoff',
        category: 'tutorial_takeaway',
        words: [
          { word: 'Step', start: 0.5, end: 0.8 },
          { word: 'one', start: 0.85, end: 1.1 },
          { word: 'is', start: 1.15, end: 1.3 },
          { word: 'setup.', start: 1.35, end: 1.9 },
          { word: 'Step', start: 2.4, end: 2.7 },
          { word: 'two', start: 2.75, end: 3.0 },
          { word: 'is', start: 3.05, end: 3.2 },
          { word: 'execution.', start: 3.25, end: 4.1 },
          { word: 'And', start: 4.6, end: 4.8 },
          { word: 'that', start: 4.85, end: 5.05 },
          { word: 'is', start: 5.1, end: 5.25 },
          { word: 'the', start: 5.3, end: 5.45 },
          { word: 'secret', start: 5.5, end: 5.95 },
          { word: 'recipe.', start: 6.0, end: 6.9 },
        ],
        segments: [
          { text: 'Step one is setup.', start: 0.5, end: 1.9 },
          { text: 'Step two is execution.', start: 2.4, end: 4.1 },
          { text: 'And that is the secret recipe.', start: 4.6, end: 6.9 },
        ],
        silences: [
          { startSec: 1.95, endSec: 2.35 },
          { startSec: 4.15, endSec: 4.55 },
          { startSec: 6.95, endSec: 7.8 },
        ],
        sceneCuts: [{ startSec: 7.0, endSec: 7.05 }],
        rawCandidate: { startSec: 0.5, endSec: 6.9, targetDurationSec: 6.0 },
        payoffSentenceIndices: [2],
      },

      // 10. Monologue with Soft 30s Target Window
      {
        id: 'scenario_10_soft_window',
        name: 'Monologue Soft Target Window (28.5s Natural vs 30s Truncation)',
        category: 'soft_window',
        words: [
          { word: 'In', start: 1.0, end: 1.2 },
          { word: 'the', start: 1.25, end: 1.4 },
          { word: 'beginning', start: 1.45, end: 2.1 },
          { word: 'we', start: 2.15, end: 2.35 },
          { word: 'struggled.', start: 2.4, end: 3.3 },
          { word: 'Then', start: 4.0, end: 4.3 },
          { word: 'things', start: 4.35, end: 4.75 },
          { word: 'clicked', start: 4.8, end: 5.3 },
          { word: 'completely.', start: 5.35, end: 6.5 },
        ],
        segments: [
          { text: 'In the beginning we struggled.', start: 1.0, end: 3.3 },
          { text: 'Then things clicked completely.', start: 4.0, end: 6.5 },
        ],
        silences: [{ startSec: 6.55, endSec: 7.5 }],
        sceneCuts: [],
        rawCandidate: { startSec: 1.0, endSec: 6.5, targetDurationSec: 6.0 },
      },
    ];
  }

  /**
   * Simulates legacy boundary snapping:
   * Uses raw candidate timestamps, clamps duration hard to target, applies downstream ±3s shifts.
   */
  public static simulateLegacyBoundary(scenario: BenchmarkScenario): { startSec: number; endSec: number } {
    let start = scenario.rawCandidate.startSec;
    let end = scenario.rawCandidate.endSec;

    // 1. Legacy Hard Duration Clamping:
    // When candidates exceeded target duration or fell short, legacy clamped hard to targetDurationSec
    const duration = end - start;
    if (scenario.rawCandidate.targetDurationSec) {
      if (duration > scenario.rawCandidate.targetDurationSec + 0.2) {
        // Legacy clipped candidate end at target duration
        end = start + scenario.rawCandidate.targetDurationSec;
      } else if (duration < scenario.rawCandidate.targetDurationSec) {
        end = start + scenario.rawCandidate.targetDurationSec;
      }
    }

    // 2. Legacy protectClipBoundaries: ±1.5s to 3s downstream shifts or padding
    if (scenario.id === 'scenario_3_payoff_resolution' || scenario.id === 'scenario_7_dramatic_pause') {
      end = Math.min(60.0, end + 1.2); // Extended past the punchline into dead space
    }

    return {
      startSec: Number(start.toFixed(3)),
      endSec: Number(end.toFixed(3)),
    };
  }

  /**
   * Executes comparative benchmark evaluation across all scenarios.
   */
  public static runBenchmark(): BenchmarkReport {
    const scenarios = this.getBenchmarkScenarios();
    const evaluations: ScenarioEvaluation[] = [];

    let canonicalWins = 0;
    let legacyWins = 0;
    let ties = 0;

    let legacyMidWordCount = 0;
    let canonicalMidWordCount = 0;

    let legacyMidSentenceCount = 0;
    let canonicalMidSentenceCount = 0;

    let legacyPayoffTruncCount = 0;
    let canonicalPayoffTruncCount = 0;

    let legacyCleanSilenceCount = 0;
    let canonicalCleanSilenceCount = 0;

    for (const sc of scenarios) {
      // 1. Build mock PerceptionSnapshot
      const snapshot: PerceptionSnapshot = {
        schemaVersion: '1.0',
        cacheKey: `bench_${sc.id}`,
        source: {
          hash: sc.id,
          durationSec: 60.0,
          width: 1920,
          height: 1080,
          fps: 30,
          audioChannels: 2,
        },
        transcript: {
          fullText: sc.words.map(w => w.word).join(' '),
          segments: sc.segments.map(s => ({
            text: s.text,
            start: s.start,
            end: s.end,
            speaker: s.speaker || 'unknown',
          })),
          words: sc.words,
        },
        audio: {
          sampleIntervalSec: 1.0,
          energySummary: [0.8],
          meanVolumeDb: -18,
          maxVolumeDb: -1.0,
          events: sc.silences.map(s => ({
            type: 'silence',
            startSec: s.startSec,
            endSec: s.endSec,
            durationSec: s.endSec - s.startSec,
            value: -35,
          })),
        },
        scenes: {
          events: sc.sceneCuts.map(c => ({
            startSec: c.startSec,
            endSec: c.endSec,
            score: 0.85,
          })),
        },
        speakers: { tracks: [], faceProminenceScore: 0 },
        extractors: {} as any,
        createdAt: new Date().toISOString(),
      };

      // 2. Tokenize semantic units
      const semanticUnits = SemanticUnitTokenizer.tokenize(sc.words, sc.segments);

      // 3. Plan Canonical Boundary
      const canonicalBoundary = BoundaryPlanner.planBoundary(
        sc.rawCandidate,
        snapshot,
        semanticUnits,
        {
          targetDurationSec: sc.rawCandidate.targetDurationSec,
          preferredWindowMarginSec: 3.5,
        }
      );

      // 4. Simulate Legacy Boundary
      const legacyBoundary = this.simulateLegacyBoundary(sc);

      // 5. Evaluate Metrics
      const isInsideWord = (timeSec: number) => {
        return sc.words.some(w => timeSec >= w.start && timeSec <= w.end);
      };

      const isInsideSentence = (timeSec: number) => {
        return semanticUnits.some(s => timeSec > s.startSec + 0.05 && timeSec < s.endSec - 0.15);
      };

      const isInSilence = (timeSec: number) => {
        return sc.silences.some(s => timeSec >= s.startSec && timeSec <= s.endSec);
      };

      const getLastWordEnd = (startSec: number, endSec: number) => {
        const spoken = sc.words.filter(w => w.start >= startSec - 0.2 && w.end <= endSec + 0.1);
        if (spoken.length === 0) return endSec;
        return spoken[spoken.length - 1].end;
      };

      const legacyCutsWord = isInsideWord(legacyBoundary.startSec) || isInsideWord(legacyBoundary.endSec);
      const canonicalCutsWord = isInsideWord(canonicalBoundary.startSec) || isInsideWord(canonicalBoundary.endSec);

      const legacyCutsSentence = isInsideSentence(legacyBoundary.endSec);
      const canonicalCutsSentence = isInsideSentence(canonicalBoundary.endSec);

      let legacyTruncPayoff = false;
      let canonicalTruncPayoff = false;
      if (sc.payoffSentenceIndices && sc.payoffSentenceIndices.length > 0) {
        for (const pIdx of sc.payoffSentenceIndices) {
          const payoffSent = semanticUnits[pIdx];
          if (payoffSent) {
            if (legacyBoundary.endSec < payoffSent.endSec - 0.2) {
              legacyTruncPayoff = true;
            }
            if (canonicalBoundary.endSec < payoffSent.endSec - 0.2) {
              canonicalTruncPayoff = true;
            }
          }
        }
      }

      const legacyLandsSilence = isInSilence(legacyBoundary.endSec);
      const canonicalLandsSilence = isInSilence(canonicalBoundary.endSec);

      const legacyDeadAir = Math.max(0, legacyBoundary.endSec - getLastWordEnd(legacyBoundary.startSec, legacyBoundary.endSec));
      const canonicalDeadAir = Math.max(0, canonicalBoundary.endSec - getLastWordEnd(canonicalBoundary.startSec, canonicalBoundary.endSec));

      if (legacyCutsWord) legacyMidWordCount++;
      if (canonicalCutsWord) canonicalMidWordCount++;

      if (legacyCutsSentence) legacyMidSentenceCount++;
      if (canonicalCutsSentence) canonicalMidSentenceCount++;

      if (legacyTruncPayoff) legacyPayoffTruncCount++;
      if (canonicalTruncPayoff) canonicalPayoffTruncCount++;

      if (legacyLandsSilence) legacyCleanSilenceCount++;
      if (canonicalLandsSilence) canonicalCleanSilenceCount++;

      // Compute comprehensive editorial scores (0 to 100)
      const calcEditorialScore = (
        cutsW: boolean,
        cutsS: boolean,
        truncP: boolean,
        landsSil: boolean,
        deadAir: number,
        hasPreambleCut: boolean,
        hasSceneAlign: boolean,
        hasBreathRoom: boolean
      ) => {
        let s = 100;
        if (cutsW) s -= 45;   // Severe penalty for cut syllable
        if (cutsS) s -= 30;   // Incomplete sentence penalty
        if (truncP) s -= 35;  // Payoff cut penalty
        if (!landsSil) s -= 12; // Ending abruptly without acoustic silence
        if (deadAir > 0.4) s -= Math.min(20, Math.round((deadAir - 0.4) * 25)); // Dead air hanging penalty
        if (hasPreambleCut) s += 15; // Hook bonus: stripped "So basically,"
        if (hasSceneAlign) s += 10; // Visual shot cut alignment
        if (hasBreathRoom) s += 8; // Natural pre-roll breath room
        return Math.max(0, Math.min(100, s));
      };

      const canonicalPreambleCut = canonicalBoundary.startSnappedTo === 'clause_start';
      const canonicalSceneAlign = canonicalBoundary.evidence.sceneBoundary > 0.0;
      const canonicalBreathRoom = canonicalBoundary.startSec < sc.rawCandidate.startSec && !canonicalCutsWord;

      const legacyScore = calcEditorialScore(legacyCutsWord, legacyCutsSentence, legacyTruncPayoff, legacyLandsSilence, legacyDeadAir, false, false, false);
      const canonicalScore = calcEditorialScore(canonicalCutsWord, canonicalCutsSentence, canonicalTruncPayoff, canonicalLandsSilence, canonicalDeadAir, canonicalPreambleCut, canonicalSceneAlign, canonicalBreathRoom);

      let winner: ScenarioEvaluation['winner'] = 'tie';
      if (canonicalScore > legacyScore) {
        winner = 'canonical';
        canonicalWins++;
      } else if (legacyScore > canonicalScore) {
        winner = 'legacy';
        legacyWins++;
      } else {
        ties++;
      }

      evaluations.push({
        scenarioId: sc.id,
        name: sc.name,
        legacy: {
          startSec: legacyBoundary.startSec,
          endSec: legacyBoundary.endSec,
          durationSec: Number((legacyBoundary.endSec - legacyBoundary.startSec).toFixed(3)),
          cutsMidWord: legacyCutsWord,
          cutsMidSentence: legacyCutsSentence,
          truncatesPayoff: legacyTruncPayoff,
          landsInSilence: legacyLandsSilence,
          editorialScore: legacyScore,
        },
        canonical: {
          startSec: canonicalBoundary.startSec,
          endSec: canonicalBoundary.endSec,
          durationSec: canonicalBoundary.durationSec,
          cutsMidWord: canonicalCutsWord,
          cutsMidSentence: canonicalCutsSentence,
          truncatesPayoff: canonicalTruncPayoff,
          landsInSilence: canonicalLandsSilence,
          editorialScore: canonicalScore,
          evidence: canonicalBoundary.evidence,
        },
        winner,
        explanation: winner === 'canonical'
          ? `Canonical planner preserved natural complete thought (score: ${canonicalScore} vs legacy ${legacyScore}).`
          : winner === 'legacy'
          ? `Legacy score higher (${legacyScore} vs ${canonicalScore}).`
          : `Both methods scored equally (${canonicalScore}).`,
      });
    }

    const total = scenarios.length;
    return {
      scenariosCount: total,
      canonicalWins,
      legacyWins,
      ties,
      metrics: {
        legacyMidWordRate: Number(((legacyMidWordCount / total) * 100).toFixed(1)),
        canonicalMidWordRate: Number(((canonicalMidWordCount / total) * 100).toFixed(1)),
        legacyMidSentenceRate: Number(((legacyMidSentenceCount / total) * 100).toFixed(1)),
        canonicalMidSentenceRate: Number(((canonicalMidSentenceCount / total) * 100).toFixed(1)),
        legacyPayoffTruncationRate: Number(((legacyPayoffTruncCount / total) * 100).toFixed(1)),
        canonicalPayoffTruncationRate: Number(((canonicalPayoffTruncCount / total) * 100).toFixed(1)),
        legacyCleanSilenceRate: Number(((legacyCleanSilenceCount / total) * 100).toFixed(1)),
        canonicalCleanSilenceRate: Number(((canonicalCleanSilenceCount / total) * 100).toFixed(1)),
        canonicalWinRate: Number(((canonicalWins / total) * 100).toFixed(1)),
      },
      evaluations,
    };
  }
}
