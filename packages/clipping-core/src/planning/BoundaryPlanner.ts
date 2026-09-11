import { PerceptionSnapshot } from '../perception/types';
import { SentenceUnit, CanonicalClipBoundary, BoundaryPolicy, BoundaryEvidence } from './types';

export class BoundaryPlanner {
  private static readonly PAYOFF_PHRASES = [
    'and that is how', 'turned out that', 'the result is', 'realized that',
    'the lesson is', 'finally', 'which means', 'ultimately', 'that is why',
    'i learned', 'it works because', 'so now', 'in the end', 'the point is',
    'and that is why', 'and that changed everything'
  ];

  /**
   * Plans and finalizes the single canonical clip boundary for a candidate range.
   * Enforces that once planned, this boundary represents the true media cut.
   */
  public static planBoundary(
    candidateRange: { startSec: number; endSec: number; targetDurationSec?: number },
    snapshot: PerceptionSnapshot,
    semanticUnits: SentenceUnit[],
    policy: BoundaryPolicy = {}
  ): CanonicalClipBoundary {
    const rawStart = Math.max(0, candidateRange.startSec);
    const rawEnd = Math.max(rawStart + 1.0, candidateRange.endSec);
    const sourceDuration = snapshot.source?.durationSec || 999999;
    
    const targetDur = policy.durationPolicy?.targetSec ?? policy.targetDurationSec ?? candidateRange.targetDurationSec ?? (rawEnd - rawStart);
    const minDur = policy.durationPolicy?.minSec ?? policy.minDurationSec ?? Math.min(targetDur * 0.65, Math.max(1.0, targetDur - 3.0));
    const maxDur = policy.durationPolicy?.maxSec ?? policy.maxDurationSec ?? Math.min(90.0, Math.max(targetDur + 4.0, targetDur * 1.5));
    const windowMargin = policy.durationPolicy?.toleranceSec ?? policy.preferredWindowMarginSec ?? Math.min(4.0, Math.max(1.5, targetDur * 0.3));
    const preRollSec = (policy.preRollBreathMs ?? 180) / 1000.0;
    const postRollSec = (policy.postRollTailMs ?? 300) / 1000.0;

    const allWords = snapshot.transcript?.words || [];
    const audioSilences = (snapshot.audio?.events || []).filter(e => e.type === 'silence');
    const sceneEvents = snapshot.scenes?.events || [];
    const speakerTracks = snapshot.speakers?.tracks || [];

    // 1. SELECT BEST START BOUNDARY (Hook / Sentence / Clause Onset)
    let bestStartSec = rawStart;
    let startSnappedTo: CanonicalClipBoundary['startSnappedTo'] = 'raw_word';
    let sentenceBoundaryEvidence = 0.5;
    let clauseBoundaryEvidence = 0.5;
    let startAcousticEvidence = 0.5;

    // Find sentence containing or closest to rawStart
    const startSentence = semanticUnits.find(s => rawStart >= s.startSec - 0.5 && rawStart <= s.endSec)
      || semanticUnits.find(s => s.startSec >= rawStart && s.startSec <= rawStart + 2.5)
      || semanticUnits[0];

    if (startSentence) {
      bestStartSec = startSentence.startSec;
      startSnappedTo = 'sentence_start';
      sentenceBoundaryEvidence = 1.0;

      // Check if first clause is throat-clearing preamble (e.g. "So basically,")
      if (startSentence.clauses.length > 1 && startSentence.clauses[0].isIntroductoryPreamble) {
        const coreClause = startSentence.clauses[1];
        // If stripping preamble doesn't push start past rawEnd
        if (coreClause.startSec < rawEnd - minDur) {
          bestStartSec = coreClause.startSec;
          startSnappedTo = 'clause_start';
          clauseBoundaryEvidence = 1.0;
        }
      }
    } else {
      // Word-level fallback
      const nearestWord = allWords.find(w => w.start >= rawStart) || allWords[0];
      if (nearestWord) {
        bestStartSec = nearestWord.start;
      }
    }

    // Apply pre-roll breath room into preceding silence, bounded by preceding word
    let precedingWord: (typeof allWords)[0] | undefined;
    for (let i = allWords.length - 1; i >= 0; i--) {
      if (allWords[i].end <= bestStartSec) {
        precedingWord = allWords[i];
        break;
      }
    }
    const minPreRollFloor = precedingWord ? precedingWord.end + 0.02 : 0;
    const targetPreRollStart = Math.max(minPreRollFloor, bestStartSec - preRollSec);
    const precedingSilence = audioSilences.find(s => s.endSec <= bestStartSec + 0.05 && s.endSec >= targetPreRollStart - 0.6);
    if (precedingSilence && precedingSilence.endSec >= minPreRollFloor) {
      bestStartSec = Math.max(minPreRollFloor, precedingSilence.endSec - 0.05);
      startSnappedTo = 'acoustic_silence';
      startAcousticEvidence = 1.0;
    } else {
      bestStartSec = targetPreRollStart;
      startAcousticEvidence = 0.8;
    }

    // 2. SEARCH FOR OPTIMAL END BOUNDARY (Soft Duration Window + Payoff + Complete Thought)
    const minAcceptableEnd = bestStartSec + minDur;
    const maxAcceptableEnd = Math.min(sourceDuration, bestStartSec + maxDur);
    const idealTargetEnd = bestStartSec + targetDur;

    // Evaluate all candidate ending sentences within the policy operating range [minAcceptableEnd, maxAcceptableEnd]
    let eligibleSentences = semanticUnits.filter(
      s => s.endSec >= minAcceptableEnd && s.endSec <= maxAcceptableEnd
    );

    // Fall back to closest sentences if none were strictly within [minDur, maxDur]
    if (eligibleSentences.length === 0) {
      eligibleSentences = semanticUnits.filter(
        s => s.endSec >= minAcceptableEnd - 3.0 && s.endSec <= maxAcceptableEnd + 3.0
      );
    }

    interface EvaluatedEndOption {
      endSec: number;
      snappedTo: CanonicalClipBoundary['endSnappedTo'];
      sentenceScore: number;
      clauseScore: number;
      payoffScore: number;
      acousticScore: number;
      speakerScore: number;
      sceneScore: number;
      durationScore: number;
      totalScore: number;
      explanation: string;
    }

    const endOptions: EvaluatedEndOption[] = [];

    // Candidate generator: every eligible sentence end
    for (const sent of eligibleSentences) {
      const candidateEnd = sent.endSec;
      const duration = candidateEnd - bestStartSec;
      if (duration < minDur * 0.9 || duration > maxDur * 1.05) continue;

      // Distance from ideal target (canonical soft preference formula)
      const durationScore = 1.0 - Math.min(1.0, Math.abs(duration - targetDur) / Math.max(1.0, targetDur));

      // Sentence completeness
      const sentenceScore = sent.hasTerminalPunctuation ? 1.0 : 0.7;

      // Payoff landing: English keyword match OR universal prosodic landing (terminal punctuation + >= 350ms acoustic silence)
      const sentText = sent.text.toLowerCase();
      const sentenceCompletesPayoff = this.PAYOFF_PHRASES.some(p => sentText.includes(p));
      const hasAcousticLandingPause = Boolean(
        audioSilences.some(s => s.startSec >= candidateEnd - 0.1 && s.startSec <= candidateEnd + 0.8 && (s.endSec - s.startSec) >= 0.35)
      );
      const isProsodicLanding = sent.hasTerminalPunctuation && hasAcousticLandingPause;
      const payoffScore = sentenceCompletesPayoff ? 1.0 : isProsodicLanding ? 0.85 : 0.4;
      const isPayoffOrLanding = sentenceCompletesPayoff || isProsodicLanding;

      // Acoustic Landing in Silence
      let acousticScore = 0.7;
      let finalSnappedEnd = candidateEnd + postRollSec;
      let snappedTo: CanonicalClipBoundary['endSnappedTo'] = isPayoffOrLanding ? 'payoff_end' : 'sentence_end';

      const succeedingSilence = audioSilences.find(
        s => s.startSec >= candidateEnd - 0.05 && s.startSec <= candidateEnd + postRollSec + 0.6
      );
      if (succeedingSilence) {
        finalSnappedEnd = succeedingSilence.startSec + 0.1;
        if (!isPayoffOrLanding) {
          snappedTo = 'acoustic_silence';
        }
        acousticScore = 1.0;
      }

      // Speaker Turn Alignment
      let speakerScore = 0.8;
      const endSpeakerTrack = speakerTracks.find(t => candidateEnd >= t.startSec && candidateEnd <= t.endSec);
      if (endSpeakerTrack && endSpeakerTrack.speakingProbability < 0.2) {
        speakerScore = 1.0; // Speaker naturally stopped talking
      }

      // Scene Alignment
      let sceneScore = 0.5;
      const nearbySceneCut = sceneEvents.find(s => Math.abs(s.startSec - finalSnappedEnd) <= 0.35);
      if (nearbySceneCut) {
        // Only snap if cut does not truncate last spoken word
        const lastWord = sent.words[sent.words.length - 1];
        if (!lastWord || nearbySceneCut.startSec >= lastWord.endSec) {
          finalSnappedEnd = nearbySceneCut.startSec;
          sceneScore = 1.0;
        }
      }

      const totalScore = (
        0.25 * 1.0 + // Semantic completion
        0.20 * payoffScore +
        0.15 * sentenceScore +
        0.15 * acousticScore +
        0.10 * speakerScore +
        0.05 * sceneScore +
        0.10 * durationScore
      );

      endOptions.push({
        endSec: Number(finalSnappedEnd.toFixed(3)),
        snappedTo: isPayoffOrLanding ? 'payoff_end' : snappedTo,
        sentenceScore,
        clauseScore: 1.0,
        payoffScore,
        acousticScore,
        speakerScore,
        sceneScore,
        durationScore,
        totalScore,
        explanation: `Natural sentence termination at ${candidateEnd.toFixed(2)}s with duration ${duration.toFixed(1)}s (target: ${targetDur}s).`,
      });
    }

    // If no complete sentence found, evaluate clause or fallback word boundaries
    if (endOptions.length === 0) {
      const fallbackEnd = Math.min(sourceDuration, Math.max(minAcceptableEnd, rawEnd));
      endOptions.push({
        endSec: Number(fallbackEnd.toFixed(3)),
        snappedTo: 'raw_word',
        sentenceScore: 0.5,
        clauseScore: 0.5,
        payoffScore: 0.5,
        acousticScore: 0.5,
        speakerScore: 0.5,
        sceneScore: 0.5,
        durationScore: 0.5,
        totalScore: 0.5,
        explanation: `Fallback acoustic word boundary at ${fallbackEnd.toFixed(2)}s.`,
      });
    }

    // Sort by total composite score descending
    endOptions.sort((a, b) => b.totalScore - a.totalScore);
    const winningEnd = endOptions[0];

    // 3. HARD CONSTRAINTS VERIFICATION (Mid-word & Bound Safety)
    let finalizedStart = Number(bestStartSec.toFixed(3));
    let finalizedEnd = Number(winningEnd.endSec.toFixed(3));

    // Zero-Truncation Guard: Check if finalizedStart cuts inside an active word
    const intersectingStartWord = allWords.find(w => finalizedStart > w.start && finalizedStart < w.end);
    if (intersectingStartWord) {
      finalizedStart = Number(Math.max(0, intersectingStartWord.start - preRollSec).toFixed(3));
    }

    // Zero-Truncation Guard: Check if finalizedEnd cuts inside an active word
    const intersectingEndWord = allWords.find(w => finalizedEnd > w.start && finalizedEnd < w.end);
    if (intersectingEndWord) {
      finalizedEnd = Number((intersectingEndWord.end + postRollSec).toFixed(3));
    }

    // Clamp inside source video limits and strictly enforce maxDur hard ceiling
    finalizedStart = Math.max(0, finalizedStart);
    const absoluteMaxEnd = Math.min(sourceDuration, finalizedStart + maxDur);
    finalizedEnd = Math.min(absoluteMaxEnd, Math.max(finalizedStart + 1.0, finalizedEnd));
    const finalDuration = Number((finalizedEnd - finalizedStart).toFixed(3));

    const evidence: BoundaryEvidence = {
      sentenceBoundary: Number(winningEnd.sentenceScore.toFixed(2)),
      clauseBoundary: Number(winningEnd.clauseScore.toFixed(2)),
      acousticBoundary: Number(((startAcousticEvidence + winningEnd.acousticScore) / 2).toFixed(2)),
      speakerTurnBoundary: Number(winningEnd.speakerScore.toFixed(2)),
      sceneBoundary: Number(winningEnd.sceneScore.toFixed(2)),
      payoffBoundary: Number(winningEnd.payoffScore.toFixed(2)),
    };

    const durationDeviation = Number((finalDuration - targetDur).toFixed(2));
    const compositeScore = Number(winningEnd.totalScore.toFixed(4));
    const startConfidence = Number(((sentenceBoundaryEvidence + startAcousticEvidence) / 2).toFixed(2));
    const endConfidence = Number(((winningEnd.sentenceScore + winningEnd.acousticScore + winningEnd.payoffScore) / 3).toFixed(2));

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
      audioFadeInMs: policy.audioFadeInMs ?? 35,
      audioFadeOutMs: policy.audioFadeOutMs ?? 35,
    };
  }
}
