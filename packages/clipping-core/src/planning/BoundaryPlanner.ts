import { PerceptionSnapshot } from '../perception/types';
import {
  SentenceUnit,
  CanonicalClipBoundary,
  BoundaryPolicy,
  BoundaryEvidence,
  BoundaryCandidateType,
  BoundaryFeasibility,
  STANDARD_BOUNDARY_PROFILES,
  StartPreference,
  EndPreference,
  ClipShape,
  EndMode,
} from './types';
import { AcousticBoundarySnapper } from '../candidates/AcousticBoundarySnapper';

interface EvaluatedStartOption {
  startSec: number;
  snappedTo: CanonicalClipBoundary['startSnappedTo'];
  candidateType: BoundaryCandidateType;
  preference: StartPreference;
  targetWord?: { word: string; start: number; end: number };
  openingRelevanceGapMs: number;
  isFeasible: boolean;
  explanation: string;
}

interface EvaluatedEndOption {
  endSec: number;
  snappedTo: CanonicalClipBoundary['endSnappedTo'];
  candidateType: BoundaryCandidateType;
  semanticScore: number;
  punctuationScore: number;
  clauseScore: number;
  payoffScore: number;
  acousticScore: number;
  speakerScore: number;
  sceneScore: number;
  durationScore: number;
  totalScore: number;
  safeUpperBound: number;
  isFeasible: boolean;
  explanation: string;
  preference: EndPreference;
  deadTailMs: number;
}

export class BoundaryPlanner {
  private static readonly PAYOFF_PHRASES = [
    'and that is how', 'turned out that', 'the result is', 'realized that',
    'the lesson is', 'finally', 'which means', 'ultimately', 'that is why',
    'i learned', 'it works because', 'so now', 'in the end', 'the point is',
    'and that is why', 'and that changed everything'
  ];

  private static readonly DANGLING_PRONOUN_PATTERNS = /^(that's why|that is why|this is why|because of that|because of this|he did that|they said so|which means|it happened)[.!?,\s]*$/i;

  /**
   * Plans and finalizes the single canonical clip boundary for a candidate range.
   * 
   * Invariants Enforced:
   * HARD:
   * 1. Never cut inside an active word or active phoneme.
   * 2. Never exceed hard platform limit (hardMaxDurationSec).
   * 3. Never cross a protected speech boundary (safeUpperBound = nextSpeechStart - speechSafetyMargin).
   * 4. Never recursively extend into subsequent speech (zero snowball cascade).
   * 5. Never produce an inverted/negative interval.
   * 
   * VIEWER PREFERENCE POLICY:
   * 1. Start: Fast opening-relevance speed, low context debt, promise alignment, clean speech onset.
   * 2. End: Semantic completion, payoff resolution, useful bounded reaction, natural landing, zero dead-tail lingering.
   * 3. Loop: Configurable loop-friendly bonus when circular narrative connection is naturally present.
   */
  public static planBoundary(
    candidateRange: { startSec: number; endSec: number; targetDurationSec?: number },
    snapshot: PerceptionSnapshot,
    semanticUnits: SentenceUnit[],
    policy: BoundaryPolicy = {}
  ): CanonicalClipBoundary {
    const rawStart = candidateRange.startSec;
    const rawEnd = candidateRange.endSec;
    const profile = policy.profile || STANDARD_BOUNDARY_PROFILES.default;

    const sourceDuration = snapshot.source?.durationSec || 999999;
    const targetDur = policy.durationPolicy?.targetSec ?? policy.targetDurationSec ?? candidateRange.targetDurationSec ?? (rawEnd - rawStart);
    const minDur = policy.durationPolicy?.minSec ?? policy.minDurationSec ?? Math.min(targetDur * 0.65, Math.max(1.0, targetDur - 3.0));
    const softMaxDur = policy.constraints?.softMaxDurationSec ?? policy.softMaxDurationSec ?? policy.durationPolicy?.maxSec ?? policy.maxDurationSec ?? Math.min(90.0, Math.max(targetDur + 4.0, targetDur * 1.5));
    const hardMaxDur = policy.constraints?.hardMaxDurationSec ?? policy.hardMaxDurationSec ?? policy.durationPolicy?.hardMaxSec ?? softMaxDur;

    const preRollSec = (policy.preRollBreathMs ?? profile.preRollMs) / 1000.0;
    const postRollSec = (policy.postRollTailMs ?? profile.postRollMs) / 1000.0;
    const speechSafetyMarginSec = (policy.speechSafetyMarginMs ?? profile.speechSafetyMarginMs) / 1000.0;

    const allWords = snapshot.transcript?.words || [];
    // Ensure chronological order for reliable index-based adjacency, regardless
    // of the order words arrive from the ASR provider.
    const sortedWords = [...allWords].sort((a, b) => a.start - b.start || a.end - b.end);
    const audioSilences = (snapshot.audio?.events || []).filter(e => e.type === 'silence');
    const sceneEvents = snapshot.scenes?.events || [];
    const speakerTracks = snapshot.speakers?.tracks || [];

    // Optional clip shape (unknown -> general policy)
    const clipShape: ClipShape | undefined = profile.name === 'podcast'
      ? 'podcast_insight'
      : profile.name === 'tutorial'
      ? 'tutorial'
      : profile.name === 'sports'
      ? 'funny_moment'
      : profile.name === 'vlog'
      ? 'story'
      : undefined;

    // Configurable viewer weights
    const vsw = profile.viewerStartWeights || {};
    const wPromise = vsw.promiseAlignment ?? 0.20;
    const wHook = vsw.hookStrength ?? 0.20;
    const wContext = vsw.contextSufficiency ?? 0.20;
    const wOnset = vsw.speechOnsetQuality ?? 0.15;
    const wVisual = vsw.visualSalience ?? 0.10;
    const wPrev = vsw.previousContextPenalty ?? 0.10;
    const wDeadAir = vsw.deadAirPenalty ?? 0.15;

    const vew = profile.viewerEndWeights || {};
    const wCompletion = vew.completion ?? 0.22;
    const wPayoff = vew.payoff ?? 0.20;
    const wAcoustic = vew.acousticLanding ?? 0.15;
    const wDeadTail = vew.deadTailPenalty ?? 0.15;
    const wRisk = vew.nextSpeechRisk ?? 0.10;
    const loopFriendlyBonusWeight = vew.loopFriendlyBonus ?? 0.05;

    // ─────────────────────────────────────────────────────────────
    // 1. SELECT BEST START BOUNDARY (Viewer Start Preference Policy)
    // ─────────────────────────────────────────────────────────────
    let startSentence = semanticUnits.find(s => rawStart >= s.startSec - 0.5 && rawStart <= s.endSec)
      || semanticUnits.find(s => s.startSec >= rawStart && s.startSec <= rawStart + 2.5)
      || semanticUnits[0];

    // ─── Evidence-based residue suppression ────────────────────────────────────
    const RESIDUE_PATTERNS = /^(see you( then| later| soon)?|see ya( then| later| soon)?|see then|talk to you later|talk soon|catch you later|have a good one|take care|thank you|thanks|bye|goodbye|yeah|yes|yep|okay|ok|alright|right|sure|cool|cheers|got it|makes sense|so yeah|no problem|and yeah)[.!?,\s]*$/i;
    const HOOK_PATTERNS = /^(watch|look|listen|here|check|notice|remember|imagine|that's why|that is why|this is why|the thing is|the truth is|what if)/i;

    const evaluateResidue = (candidate: SentenceUnit): { isResidue: boolean; score: number } => {
      if (!candidate.words || candidate.words.length > 7) {
        return { isResidue: false, score: 0 };
      }

      const candidateText = candidate.text.trim().toLowerCase();
      const isLexicalSignoff = RESIDUE_PATTERNS.test(candidateText);
      const isIntentionalHook = HOOK_PATTERNS.test(candidateText);

      if (isIntentionalHook) {
        return { isResidue: false, score: -10 };
      }

      const rawStartAimedAtOnset = rawStart <= candidate.startSec + 0.15;
      if (!isLexicalSignoff && rawStartAimedAtOnset) {
        return { isResidue: false, score: -5 };
      }

      const next = semanticUnits.find(
        s => s.startSec >= candidate.endSec && s.startSec <= rawStart + 4.0
      );
      if (!next) {
        return { isResidue: false, score: 0 };
      }

      const pauseToNext = next.startSec - candidate.endSec;
      const isShortUtterance = candidate.words.length <= 3 || (candidate.endSec - candidate.startSec) <= 1.5;
      const hasSignificantPauseToSuccessor = pauseToNext >= 0.30;
      const hasStrongSuccessor = next.words.length >= candidate.words.length + 2 || next.words.length >= 5;
      const rawStartAimedPastOnset = rawStart > candidate.startSec + 0.15;

      let score = 0;
      if (isLexicalSignoff) score += 3.5;
      if (isShortUtterance && hasSignificantPauseToSuccessor && hasStrongSuccessor) score += 2.0;
      if (rawStartAimedPastOnset && (candidate.endSec - rawStart) < 2.5) score += 1.5;
      if (candidate.words.length <= 3 && hasStrongSuccessor) score += 1.0;

      if (candidate.hasTerminalPunctuation && candidate.words.length >= 4 && !isLexicalSignoff) {
        score -= 2.5;
      }

      return { isResidue: score >= 2.0, score };
    };

    if (startSentence && evaluateResidue(startSentence).isResidue) {
      const nextSentence = semanticUnits.find(
        s => s.startSec >= startSentence.endSec && s.startSec <= rawStart + 4.0
      );
      if (nextSentence) {
        startSentence = nextSentence;
      }
    }

    // ─── Opening Relevance Gap Evaluator ──────────────────────────────────────
    const evaluateOpeningRelevanceGap = (startSec: number, sentence: SentenceUnit): { gapMs: number; deadAirPenalty: number } => {
      const speechStart = sentence?.startSec ?? startSec;
      const gapMs = Math.max(0, Math.round((speechStart - startSec) * 1000));
      const deadAirPenalty = gapMs > 400 ? Math.min(1.0, (gapMs - 400) / 1000) : 0.0;
      return { gapMs, deadAirPenalty };
    };

    // ─── Context Debt & Sufficiency Evaluator ──────────────────────────────────
    const evaluateContextDebt = (sentence: SentenceUnit): { contextDebtScore: number; contextSufficiencyScore: number } => {
      if (!sentence) return { contextDebtScore: 0.5, contextSufficiencyScore: 0.5 };
      const text = sentence.text.trim();
      const isDangling = BoundaryPlanner.DANGLING_PRONOUN_PATTERNS.test(text);

      if (isDangling && (!sentence.words || sentence.words.length <= 3)) {
        return { contextDebtScore: 0.70, contextSufficiencyScore: 0.30 };
      }

      if (sentence.words && sentence.words.length >= 5) {
        return { contextDebtScore: 0.05, contextSufficiencyScore: 0.95 };
      }

      if (HOOK_PATTERNS.test(text) && sentence.words && sentence.words.length >= 3) {
        return { contextDebtScore: 0.15, contextSufficiencyScore: 0.85 };
      }

      return { contextDebtScore: 0.25, contextSufficiencyScore: 0.75 };
    };

    // ─── Generate Start Boundary Candidates ───────────────────────────────────
    const startCandidates: EvaluatedStartOption[] = [];

    if (startSentence) {
      const sentenceText = startSentence.text.toLowerCase();
      const isIntentionalHook = HOOK_PATTERNS.test(sentenceText);
      const { contextDebtScore, contextSufficiencyScore } = evaluateContextDebt(startSentence);
      const hookStrengthScore = isIntentionalHook ? 1.0 : startSentence.clauses?.[0]?.isIntroductoryPreamble ? 0.85 : 0.65;
      const promiseAlignmentScore = isIntentionalHook || (startSentence.words && startSentence.words.length >= 4) ? 0.95 : 0.70;

      const firstWord = allWords.find(w => Math.abs(w.start - startSentence.startSec) <= 0.25)
        || (startSentence.words && startSentence.words.length > 0
            ? { word: startSentence.words[0].text, start: startSentence.words[0].startSec, end: startSentence.words[0].endSec }
            : undefined)
        || allWords.find(w => w.start >= startSentence.startSec)
        || allWords[0];

      if (firstWord) {
        const feasibleStart = AcousticBoundarySnapper.calculateFeasibleStartInterval(
          firstWord as any,
          allWords as any,
          { precedingSafetyMarginSec: speechSafetyMarginSec, preRollSec }
        );

        const sceneCutThreshold = profile.sceneCutThreshold ?? 0.30;
        const candidateStartSceneCut = sceneEvents.find(
          s => (s.score ?? (s as any).value ?? 0.8) >= sceneCutThreshold &&
               s.startSec >= (feasibleStart.isFeasible ? feasibleStart.lowerBound : firstWord.start - 0.5) &&
               s.startSec <= firstWord.start
        );

        const precedingSilence = audioSilences.find(
          s => s.endSec <= firstWord.start + 0.05 && s.endSec >= (feasibleStart.isFeasible ? feasibleStart.lowerBound : firstWord.start - 0.4) - 0.2
        );

        // Candidate A: Sentence onset with natural breath pre-roll
        const sentStartSec = feasibleStart.isFeasible
          ? Math.max(feasibleStart.lowerBound, Math.min(feasibleStart.upperBound, firstWord.start - preRollSec))
          : firstWord.start;
        const relA = evaluateOpeningRelevanceGap(sentStartSec, startSentence);

        const prefA: StartPreference = {
          promiseAlignmentScore,
          hookStrengthScore,
          contextSufficiencyScore,
          contextDebtScore,
          visualSalienceScore: 0.5,
          speechOnsetQuality: feasibleStart.isFeasible ? 0.95 : 0.6,
          openingRelevanceGapMs: relA.gapMs,
          deadAirPenalty: relA.deadAirPenalty,
          previousContextPenalty: 0.0,
          totalScore: (
            wPromise * promiseAlignmentScore +
            wHook * hookStrengthScore +
            wContext * contextSufficiencyScore +
            wOnset * (feasibleStart.isFeasible ? 0.95 : 0.6) +
            wVisual * 0.5 +
            wPrev * 1.0 -
            wDeadAir * relA.deadAirPenalty
          ),
        };

        startCandidates.push({
          startSec: sentStartSec,
          snappedTo: 'sentence_start',
          candidateType: 'semantic',
          preference: prefA,
          targetWord: firstWord,
          openingRelevanceGapMs: relA.gapMs,
          isFeasible: true,
          explanation: `Sentence onset at ${sentStartSec.toFixed(2)}s with natural pre-roll.`,
        });

        // Candidate B: Clause-start if preamble exists (e.g. "So basically,")
        if (startSentence.clauses && startSentence.clauses.length > 1 && startSentence.clauses[0].isIntroductoryPreamble) {
          const coreClause = startSentence.clauses[1];
          const coreWord = allWords.find(w => Math.abs(w.start - coreClause.startSec) <= 0.25) || {
            word: coreClause.text.split(' ')[0] || '',
            start: coreClause.startSec,
            end: coreClause.startSec + 0.3,
          };
          const coreFeasible = AcousticBoundarySnapper.calculateFeasibleStartInterval(
            coreWord as any,
            allWords as any,
            { precedingSafetyMarginSec: speechSafetyMarginSec, preRollSec }
          );
          const coreStartSec = coreFeasible.isFeasible
            ? Math.max(coreFeasible.lowerBound, Math.min(coreFeasible.upperBound, coreWord.start - preRollSec))
            : coreWord.start;

          const relB = evaluateOpeningRelevanceGap(coreStartSec, {
            ...startSentence,
            words: startSentence.words?.filter(w => w.startSec >= coreClause.startSec) || [],
          } as any);

          const prefB: StartPreference = {
            promiseAlignmentScore: 0.98,
            hookStrengthScore: 0.95,
            contextSufficiencyScore,
            contextDebtScore,
            visualSalienceScore: 0.5,
            speechOnsetQuality: 0.95,
            openingRelevanceGapMs: relB.gapMs,
            deadAirPenalty: relB.deadAirPenalty,
            previousContextPenalty: 0.0,
            totalScore: (
              wPromise * 0.98 +
              wHook * 0.95 +
              wContext * contextSufficiencyScore +
              wOnset * 0.95 +
              wVisual * 0.5 +
              wPrev * 1.0 -
              wDeadAir * relB.deadAirPenalty
            ),
          };

          startCandidates.push({
            startSec: coreStartSec,
            snappedTo: 'clause_start',
            candidateType: 'semantic',
            preference: prefB,
            targetWord: coreWord,
            openingRelevanceGapMs: relB.gapMs,
            isFeasible: true,
            explanation: `Core clause onset at ${coreStartSec.toFixed(2)}s (throat-clearing preamble stripped).`,
          });
        }

        // Candidate C: Shot-Aligned Visual Onset (when available in window)
        if (candidateStartSceneCut && feasibleStart.isFeasible && candidateStartSceneCut.startSec >= feasibleStart.lowerBound) {
          const relC = evaluateOpeningRelevanceGap(candidateStartSceneCut.startSec, startSentence);
          const prefC: StartPreference = {
            promiseAlignmentScore,
            hookStrengthScore,
            contextSufficiencyScore,
            contextDebtScore,
            visualSalienceScore: 1.0,
            speechOnsetQuality: 0.90,
            openingRelevanceGapMs: relC.gapMs,
            deadAirPenalty: relC.deadAirPenalty,
            previousContextPenalty: 0.0,
            totalScore: (
              wPromise * promiseAlignmentScore +
              wHook * hookStrengthScore +
              wContext * contextSufficiencyScore +
              wOnset * 0.90 +
              wVisual * 1.0 +
              wPrev * 1.0 -
              wDeadAir * relC.deadAirPenalty
            ),
          };

          startCandidates.push({
            startSec: candidateStartSceneCut.startSec,
            snappedTo: 'visual_cut',
            candidateType: 'visual',
            preference: prefC,
            targetWord: firstWord,
            openingRelevanceGapMs: relC.gapMs,
            isFeasible: true,
            explanation: `Shot-aligned visual onset at ${candidateStartSceneCut.startSec.toFixed(2)}s.`,
          });
        }

        // Candidate D: Acoustic Silence Valley
        if (precedingSilence && feasibleStart.isFeasible && precedingSilence.endSec >= feasibleStart.lowerBound) {
          const acousticStartSec = Math.max(feasibleStart.lowerBound, precedingSilence.endSec - 0.04);
          const relD = evaluateOpeningRelevanceGap(acousticStartSec, startSentence);
          const prefD: StartPreference = {
            promiseAlignmentScore,
            hookStrengthScore,
            contextSufficiencyScore,
            contextDebtScore,
            visualSalienceScore: 0.5,
            speechOnsetQuality: 1.0,
            openingRelevanceGapMs: relD.gapMs,
            deadAirPenalty: relD.deadAirPenalty,
            previousContextPenalty: 0.0,
            totalScore: (
              wPromise * promiseAlignmentScore +
              wHook * hookStrengthScore +
              wContext * contextSufficiencyScore +
              wOnset * 1.0 +
              wVisual * 0.5 +
              wPrev * 1.0 -
              wDeadAir * relD.deadAirPenalty
            ),
          };

          startCandidates.push({
            startSec: acousticStartSec,
            snappedTo: 'acoustic_silence',
            candidateType: 'acoustic',
            preference: prefD,
            targetWord: firstWord,
            openingRelevanceGapMs: relD.gapMs,
            isFeasible: true,
            explanation: `Acoustic silence landing onset at ${acousticStartSec.toFixed(2)}s.`,
          });
        }
      }
    }

    startCandidates.sort((a, b) => b.preference.totalScore - a.preference.totalScore);
    const winningStart = startCandidates[0] || {
      startSec: rawStart,
      snappedTo: 'raw_word' as CanonicalClipBoundary['startSnappedTo'],
      candidateType: 'semantic' as BoundaryCandidateType,
      preference: {
        promiseAlignmentScore: 0.5,
        hookStrengthScore: 0.5,
        contextSufficiencyScore: 0.5,
        contextDebtScore: 0.5,
        visualSalienceScore: 0.5,
        speechOnsetQuality: 0.5,
        openingRelevanceGapMs: 0,
        deadAirPenalty: 0.0,
        previousContextPenalty: 0.0,
        totalScore: 0.5,
      },
      openingRelevanceGapMs: 0,
      isFeasible: true,
      explanation: `Raw start fallback at ${rawStart.toFixed(2)}s.`,
    };

    const bestStartSec = winningStart.startSec;
    const startSnappedTo = winningStart.snappedTo;
    const targetStartWord = winningStart.targetWord;
    const sentenceBoundaryEvidence = winningStart.snappedTo === 'sentence_start' ? 1.0 : 0.8;
    const clauseBoundaryEvidence = winningStart.snappedTo === 'clause_start' ? 1.0 : 0.5;
    const startAcousticEvidence = winningStart.preference.speechOnsetQuality;

    // ─────────────────────────────────────────────────────────────
    // 2. SEARCH FOR OPTIMAL END BOUNDARY (Viewer End Preference Policy)
    // ─────────────────────────────────────────────────────────────
    const minAcceptableEnd = bestStartSec + minDur;
    const softMaxAcceptableEnd = bestStartSec + softMaxDur;
    const hardMaxAcceptableEnd = Math.min(sourceDuration, bestStartSec + hardMaxDur);

    let eligibleSentences = semanticUnits.filter(
      s => s.endSec >= minAcceptableEnd && s.endSec <= hardMaxAcceptableEnd
    );

    if (eligibleSentences.length === 0) {
      eligibleSentences = semanticUnits.filter(
        s => s.endSec >= minAcceptableEnd - 4.0 && s.endSec <= hardMaxAcceptableEnd + 2.0
      );
    }

    const endOptions: EvaluatedEndOption[] = [];

    const evaluateLoopFriendliness = (startText: string, endText: string): boolean => {
      const startClean = startText.toLowerCase();
      const endClean = endText.toLowerCase();
      const circularPhrases = ['brings us back', 'full circle', 'and that is why', 'back to where', 'as we started'];
      if (circularPhrases.some(p => endClean.includes(p))) return true;

      const startWords = startClean.split(/\s+/).filter(w => w.length >= 5);
      const endWords = new Set(endClean.split(/\s+/).filter(w => w.length >= 5));
      const sharedWords = startWords.filter(w => endWords.has(w));
      return sharedWords.length >= 2;
    };

    for (const sent of eligibleSentences) {
      const semanticCompletionEnd = sent.endSec;
      const duration = semanticCompletionEnd - bestStartSec;

      const lastSentWord = sent.words?.at(-1);
      const lastWordIdx = lastSentWord
        ? sortedWords.findIndex(
            w => Math.abs(w.start - lastSentWord.startSec) <= 0.001 && Math.abs(w.end - lastSentWord.endSec) <= 0.001
          )
        : -1;
      let nextWordAfterSent: (typeof sortedWords)[0] | undefined;
      if (lastWordIdx >= 0 && lastSentWord) {
        for (let i = lastWordIdx + 1; i < sortedWords.length; i++) {
          if (sortedWords[i].start > lastSentWord.endSec) {
            nextWordAfterSent = sortedWords[i];
            break;
          }
        }
      }
      const nextSpeechStart = nextWordAfterSent?.start;

      const safeUpperBound = nextSpeechStart !== undefined
        ? Math.max(semanticCompletionEnd, nextSpeechStart - speechSafetyMarginSec)
        : Math.min(sourceDuration, hardMaxAcceptableEnd);

      if (semanticCompletionEnd > hardMaxAcceptableEnd) {
        continue;
      }

      const maxSafePostRoll = nextSpeechStart !== undefined
        ? Math.max(0, Math.min(postRollSec, safeUpperBound - semanticCompletionEnd))
        : postRollSec;

      const semanticCandidateEnd = Math.min(safeUpperBound, semanticCompletionEnd + maxSafePostRoll);

      let acousticCandidateEnd = semanticCandidateEnd;
      let hasAcousticValley = false;
      const succeedingSilence = audioSilences.find(
        s => s.startSec >= semanticCompletionEnd - 0.05 && s.startSec <= semanticCompletionEnd + postRollSec + 0.5
      );
      if (succeedingSilence) {
        const roomTone = Math.min(0.08, (succeedingSilence.endSec - succeedingSilence.startSec) * 0.25);
        const valleyEnd = succeedingSilence.startSec + roomTone;
        if (valleyEnd <= safeUpperBound && valleyEnd >= semanticCompletionEnd) {
          acousticCandidateEnd = valleyEnd;
          hasAcousticValley = true;
        }
      }

      let visualCandidateEnd = semanticCandidateEnd;
      let hasVisualCut = false;
      const sceneCutThreshold = profile.sceneCutThreshold ?? 0.30;
      const nearbySceneCut = sceneEvents.find(
        s => (s.score ?? (s as any).value ?? 0.8) >= sceneCutThreshold &&
             s.startSec >= semanticCompletionEnd - 0.05 &&
             s.startSec <= safeUpperBound
      );
      if (nearbySceneCut && nearbySceneCut.startSec <= safeUpperBound && nearbySceneCut.startSec >= semanticCompletionEnd) {
        visualCandidateEnd = nearbySceneCut.startSec;
        hasVisualCut = true;
      }

      const reactionTailWindowSec = (profile.reactionTailWindowMs ?? 300) / 1000.0;
      const maxReactionExtensionSec = (profile.maxReactionExtensionMs ?? 400) / 1000.0;
      let hasReactionCandidate = false;
      let reactionCandidateEnd = semanticCandidateEnd;

      const reactingSpeaker = speakerTracks.find(
        t => t.startSec >= semanticCompletionEnd &&
             t.startSec <= semanticCompletionEnd + reactionTailWindowSec &&
             (t.speakingProbability < 0.4 || (sent.speaker && ((t as any).speaker || t.speakerId) !== sent.speaker))
      );
      if (reactingSpeaker) {
        const potentialReactionEnd = Math.min(safeUpperBound, semanticCompletionEnd + maxReactionExtensionSec);
        if (potentialReactionEnd > semanticCandidateEnd && potentialReactionEnd <= safeUpperBound) {
          reactionCandidateEnd = potentialReactionEnd;
          hasReactionCandidate = true;
        }
      }

      const sentText = sent.text.toLowerCase();
      const sentenceCompletesPayoff = BoundaryPlanner.PAYOFF_PHRASES.some(p => sentText.includes(p));
      const hasAcousticLandingPause = Boolean(
        audioSilences.some(s => s.startSec >= semanticCompletionEnd - 0.1 && s.startSec <= semanticCompletionEnd + 0.8 && (s.endSec - s.startSec) >= profile.minSilenceMs / 1000)
      );
      const isProsodicLanding = (sent.hasTerminalPunctuation || hasAcousticLandingPause) && hasAcousticLandingPause;
      const isLoopFriendly = startSentence ? evaluateLoopFriendliness(startSentence.text, sent.text) : false;

      const payoffScore = isLoopFriendly ? 1.0 : sentenceCompletesPayoff ? 1.0 : isProsodicLanding ? 0.85 : 0.4;
      const punctuationScore = sent.hasTerminalPunctuation ? 1.0 : hasAcousticLandingPause ? 0.8 : 0.45;
      const semanticScore = 1.0;

      let speakerScore = 0.8;
      const endSpeakerTrack = speakerTracks.find(t => semanticCompletionEnd >= t.startSec && semanticCompletionEnd <= t.endSec);
      if (endSpeakerTrack && endSpeakerTrack.speakingProbability < 0.2) {
        speakerScore = 1.0;
      }

      const variantsToEvaluate: Array<{
        type: BoundaryCandidateType;
        endSec: number;
        snappedTo: CanonicalClipBoundary['endSnappedTo'];
        isReactionVariant?: boolean;
      }> = [
        { type: 'semantic', endSec: semanticCandidateEnd, snappedTo: 'sentence_end' },
      ];

      if (hasAcousticValley) {
        variantsToEvaluate.push({ type: 'acoustic', endSec: acousticCandidateEnd, snappedTo: 'acoustic_silence' });
      }
      if (hasVisualCut) {
        variantsToEvaluate.push({ type: 'visual', endSec: visualCandidateEnd, snappedTo: 'visual_cut' });
      }
      if (hasReactionCandidate) {
        variantsToEvaluate.push({ type: 'hybrid', endSec: reactionCandidateEnd, snappedTo: 'acoustic_silence', isReactionVariant: true });
      }
      if (hasAcousticValley && hasVisualCut && Math.abs(acousticCandidateEnd - visualCandidateEnd) <= 0.15) {
        variantsToEvaluate.push({
          type: 'hybrid',
          endSec: Math.min(acousticCandidateEnd, visualCandidateEnd),
          snappedTo: 'visual_cut',
        });
      }

      for (const variant of variantsToEvaluate) {
        const variantDuration = variant.endSec - bestStartSec;

        let durationScore = 1.0 - Math.min(1.0, Math.abs(variantDuration - targetDur) / Math.max(1.0, targetDur));
        if (variantDuration > softMaxDur) {
          const overage = variantDuration - softMaxDur;
          durationScore = Math.max(0.1, durationScore - (overage / 10.0) * 0.3);
        }

        const acousticScore = variant.type === 'acoustic' || variant.type === 'hybrid'
          ? 1.0
          : hasAcousticLandingPause ? 0.85 : 0.6;
        const sceneScore = variant.type === 'visual' || variant.type === 'hybrid'
          ? 1.0
          : nearbySceneCut ? 0.8 : 0.4;

        const speechEnd = sent.words?.at(-1)?.endSec || semanticCompletionEnd;
        const activeEnd = variant.isReactionVariant && reactingSpeaker ? Math.max(speechEnd, reactingSpeaker.endSec) : speechEnd;
        const deadTailMs = Math.max(0, Math.round((variant.endSec - activeEnd) * 1000));
        const deadTailPenalty = deadTailMs > 250 ? Math.min(1.0, (deadTailMs - 250) / 600) : 0.0;

        const nextSpeechRisk = nextSpeechStart !== undefined
          ? Math.max(0, 1.0 - (nextSpeechStart - variant.endSec) / 0.4)
          : 0.0;

        const loopBonus = isLoopFriendly ? loopFriendlyBonusWeight : 0.0;

        const endMode: EndMode = isLoopFriendly
          ? 'loop_friendly'
          : variant.isReactionVariant
          ? 'reaction'
          : (sentenceCompletesPayoff || isProsodicLanding)
          ? 'payoff'
          : 'resolution';

        const reactionValue = variant.isReactionVariant ? (reactingSpeaker ? 0.95 : 0.70) : 0.40;

        const endPreference: EndPreference = {
          completionScore: semanticScore,
          payoffScore,
          reactionScore: reactionValue,
          acousticLandingScore: acousticScore,
          nextSpeechRisk,
          deadTailPenalty,
          loopFriendlyBonus: loopBonus,
          endMode,
          totalScore: (
            wCompletion * semanticScore +
            wPayoff * payoffScore +
            wAcoustic * acousticScore +
            0.12 * punctuationScore +
            0.10 * speakerScore +
            0.08 * sceneScore +
            0.13 * durationScore +
            (variant.isReactionVariant ? 0.05 * reactionValue : 0.0) +
            loopBonus -
            wDeadTail * deadTailPenalty -
            wRisk * nextSpeechRisk
          ),
        };

        const totalScore = endPreference.totalScore;

        endOptions.push({
          endSec: Number(variant.endSec.toFixed(3)),
          snappedTo: (sentenceCompletesPayoff || isProsodicLanding) ? 'payoff_end' : variant.snappedTo,
          candidateType: variant.type,
          semanticScore,
          punctuationScore,
          clauseScore: 1.0,
          payoffScore,
          acousticScore,
          speakerScore,
          sceneScore,
          durationScore,
          totalScore,
          safeUpperBound,
          isFeasible: variant.endSec <= safeUpperBound && variant.endSec <= hardMaxAcceptableEnd && variant.endSec >= minAcceptableEnd,
          explanation: `Complete sentence ending at ${semanticCompletionEnd.toFixed(2)}s via ${variant.type} landing (mode: ${endMode}, dead tail: ${deadTailMs}ms, duration: ${variantDuration.toFixed(1)}s).`,
          preference: endPreference,
          deadTailMs,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. FEASIBILITY FILTER & WINNING CANDIDATE SELECTION
    // ─────────────────────────────────────────────────────────────
    const feasibleOptions = endOptions.filter(o => o.isFeasible);

    let winningEnd: EvaluatedEndOption;
    if (feasibleOptions.length > 0) {
      feasibleOptions.sort((a, b) => b.totalScore - a.totalScore);
      winningEnd = feasibleOptions[0];
    } else if (endOptions.length > 0) {
      endOptions.sort((a, b) => b.totalScore - a.totalScore);
      winningEnd = endOptions[0];
    } else {
      const fallbackEnd = Math.min(hardMaxAcceptableEnd, Math.max(minAcceptableEnd, rawEnd));
      winningEnd = {
        endSec: Number(fallbackEnd.toFixed(3)),
        snappedTo: 'raw_word',
        candidateType: 'semantic',
        semanticScore: 0.5,
        punctuationScore: 0.5,
        clauseScore: 0.5,
        payoffScore: 0.5,
        acousticScore: 0.5,
        speakerScore: 0.5,
        sceneScore: 0.5,
        durationScore: 0.5,
        totalScore: 0.5,
        safeUpperBound: hardMaxAcceptableEnd,
        isFeasible: true,
        explanation: `Fallback acoustic word boundary at ${fallbackEnd.toFixed(2)}s.`,
        preference: {
          completionScore: 0.5,
          payoffScore: 0.5,
          reactionScore: 0.4,
          acousticLandingScore: 0.5,
          nextSpeechRisk: 0.0,
          deadTailPenalty: 0.0,
          loopFriendlyBonus: 0.0,
          endMode: 'resolution',
          totalScore: 0.5,
        },
        deadTailMs: 0,
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 4. HARD CONSTRAINTS VERIFICATION (Zero-Bleed & Bound Safety)
    // ─────────────────────────────────────────────────────────────
    let finalizedStart = Number(bestStartSec.toFixed(3));
    let finalizedEnd = Number(winningEnd.endSec.toFixed(3));

    const intersectingStartWord = allWords.find(w => finalizedStart > w.start && finalizedStart < w.end);
    if (intersectingStartWord) {
      finalizedStart = Number(Math.max(0, intersectingStartWord.start - preRollSec).toFixed(3));
    }

    const intersectingEndWord = allWords.find(w => finalizedEnd > w.start && finalizedEnd < w.end);
    if (intersectingEndWord) {
      finalizedEnd = Number(Math.min(winningEnd.safeUpperBound, intersectingEndWord.end + 0.05).toFixed(3));
    }

    finalizedStart = Math.max(0, finalizedStart);
    const absoluteMaxEnd = Math.min(sourceDuration, finalizedStart + hardMaxDur);
    finalizedEnd = Math.min(absoluteMaxEnd, Math.min(winningEnd.safeUpperBound, Math.max(finalizedStart + 1.0, finalizedEnd)));
    const finalDuration = Number((finalizedEnd - finalizedStart).toFixed(3));

    const evidence: BoundaryEvidence = {
      sentenceBoundary: Number(winningEnd.semanticScore.toFixed(2)),
      clauseBoundary: Number(winningEnd.clauseScore.toFixed(2)),
      acousticBoundary: Number(((startAcousticEvidence + winningEnd.acousticScore) / 2).toFixed(2)),
      speakerTurnBoundary: Number(winningEnd.speakerScore.toFixed(2)),
      sceneBoundary: Number(winningEnd.sceneScore.toFixed(2)),
      payoffBoundary: Number(winningEnd.payoffScore.toFixed(2)),
    };

    const durationDeviation = Number((finalDuration - targetDur).toFixed(2));
    const compositeScore = Number(winningEnd.totalScore.toFixed(4));
    const startConfidence = Number(((sentenceBoundaryEvidence + startAcousticEvidence) / 2).toFixed(2));
    const endConfidence = Number(((winningEnd.semanticScore + winningEnd.acousticScore + winningEnd.payoffScore) / 3).toFixed(2));

    const startSilenceDepth = targetStartWord ? Math.max(0, targetStartWord.start - finalizedStart) : 0.15;
    const matchingSent = semanticUnits.find(s => Math.abs(s.endSec - finalizedEnd) <= 1.0);
    const endSilenceDepth = matchingSent ? Math.max(0, finalizedEnd - matchingSent.endSec) : 0.15;

    const baseFadeInMs = profile.fadeInMs ?? 35;
    const baseFadeOutMs = profile.fadeOutMs ?? 40;

    const computedFadeInMs = policy.audioFadeInMs ?? (startSilenceDepth >= 0.10 ? 0 : startSilenceDepth >= 0.05 ? 15 : baseFadeInMs);
    const computedFadeOutMs = policy.audioFadeOutMs ?? (endSilenceDepth >= 0.10 ? 0 : endSilenceDepth >= 0.05 ? 20 : baseFadeOutMs);

    // Diagnostic Efficiency Metrics
    const speechStart = targetStartWord?.start ?? finalizedStart;
    const speechEnd = matchingSent?.words?.at(-1)?.endSec ?? matchingSent?.endSec ?? finalizedEnd;
    const usefulContentDuration = Math.max(0, speechEnd - speechStart);
    const boundaryEfficiency = Number((usefulContentDuration / Math.max(0.1, finalDuration)).toFixed(3));
    const boundaryWasteRatio = Number(((winningEnd.deadTailMs / 1000) / Math.max(0.1, finalDuration)).toFixed(3));

    return {
      startSec: finalizedStart,
      endSec: finalizedEnd,
      durationSec: finalDuration,
      startConfidence,
      endConfidence,
      compositeScore,
      evidence,
      durationTargetSec: targetDur,
      durationDeviationSec: durationDeviation,
      durationFitScore: Number(winningEnd.durationScore.toFixed(2)),
      rationale: winningEnd.explanation,
      startSnappedTo,
      endSnappedTo: winningEnd.snappedTo,
      candidateType: winningEnd.candidateType,
      audioFadeInMs: computedFadeInMs,
      audioFadeOutMs: computedFadeOutMs,
      clipShape,
      endMode: winningEnd.preference.endMode,
      startPreference: winningStart.preference,
      endPreference: winningEnd.preference,
      openingRelevanceGapMs: winningStart.openingRelevanceGapMs,
      timeToMeaningfulContentMs: winningStart.openingRelevanceGapMs,
      deadTailMs: winningEnd.deadTailMs,
      boundaryEfficiency,
      boundaryWasteRatio,
    };
  }
}
