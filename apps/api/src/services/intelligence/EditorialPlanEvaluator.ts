import { ContextCoherenceGuard } from './ContextCoherenceGuard';
import { PayoffDetectionEngine } from './PayoffDetectionEngine';

export interface EditorialEvaluationWeights {
  hook: number;     // default 0.35
  payoff: number;   // default 0.45
  coherence: number; // default 0.20
}

export interface EditorialVariant {
  variantId: 'raw' | 'hook_adjusted' | 'payoff_extended';
  startSec: number;
  endSec: number;
  durationSec: number;
  hookScore: number;
  payoffScore: number;
  coherenceScore: number;
  editorialScore: number;
  performancePredictionScore: number;
  compositeScore: number; // Aliased to editorialScore for backward compatibility
  speech_density_wps: number;
  pause_density_ratio: number;
  start_boundary_quality: 'clean_thesis' | 'snapped_onset' | 'preamble_present';
  end_boundary_quality: 'complete_terminal' | 'extended_resolution' | 'incomplete_cliffhanger';
  isValid: boolean;
  rejectionReason?: string;
  explanation: string;
}

export interface EditorialPlan {
  candidateId: string;
  winningVariant: EditorialVariant;
  allVariants: EditorialVariant[];
  accepted: boolean;
  rejectionReason?: string;
}

export class EditorialPlanEvaluator {
  private coherenceGuard: ContextCoherenceGuard;
  private payoffEngine: PayoffDetectionEngine;
  private defaultWeights: EditorialEvaluationWeights = {
    payoff: 0.45,
    hook: 0.35,
    coherence: 0.20,
  };

  constructor(
    coherenceGuard?: ContextCoherenceGuard,
    payoffEngine?: PayoffDetectionEngine,
    weights?: EditorialEvaluationWeights
  ) {
    this.coherenceGuard = coherenceGuard || new ContextCoherenceGuard();
    this.payoffEngine = payoffEngine || new PayoffDetectionEngine();
    if (weights) {
      this.defaultWeights = weights;
    }
  }

  private calculatePacingMetrics(
    words: Array<{ word: string; start: number; end: number }>,
    startSec: number,
    endSec: number
  ): { speechDensityWps: number; pauseDensityRatio: number; pacingScore: number } {
    const duration = Math.max(0.5, endSec - startSec);
    const clipWords = words.filter(w => w.start >= startSec - 0.1 && w.end <= endSec + 0.1);
    const count = clipWords.length;
    const speechDensityWps = Number((count / duration).toFixed(2));

    let totalSpokenTime = 0;
    for (const w of clipWords) {
      totalSpokenTime += Math.max(0, w.end - w.start);
    }
    const pauseTime = Math.max(0, duration - totalSpokenTime);
    const pauseDensityRatio = Number(Math.min(1.0, pauseTime / duration).toFixed(2));

    // Optimal spoken density in short-form is ~2.0 - 3.5 WPS
    let pacingScore = 75;
    if (speechDensityWps >= 2.0 && speechDensityWps <= 3.5) {
      pacingScore = 90;
    } else if (speechDensityWps >= 1.5 && speechDensityWps < 2.0) {
      pacingScore = 80;
    } else if (speechDensityWps < 1.0) {
      pacingScore = 55; // Excessive dead air
    } else if (speechDensityWps > 4.2) {
      pacingScore = 70; // Unnaturally fast
    }

    // Heavy pause density penalty if > 45% of clip is silence
    if (pauseDensityRatio > 0.45) {
      pacingScore = Math.max(40, pacingScore - 20);
    }

    return { speechDensityWps, pauseDensityRatio, pacingScore };
  }

  /**
   * Evaluates candidate-dependent counterfactual variants in-memory at zero render cost.
   * Strictly enforces: No candidate ends before its validated payoff.
   */
  public evaluateCandidate(
    candidateId: string,
    candidateStartSec: number,
    candidateEndSec: number,
    words: Array<{ word: string; start: number; end: number }>,
    customWeights?: EditorialEvaluationWeights,
    maxClipDurationSec: number = 60
  ): EditorialPlan {
    const weights = customWeights || this.defaultWeights;
    const variants: EditorialVariant[] = [];

    // 1. Evaluate Raw Candidate
    const rawOpening = this.coherenceGuard.analyzeOpening(words, candidateStartSec, candidateEndSec);
    const rawCoherence = this.coherenceGuard.guardBoundaries(words, candidateStartSec, candidateEndSec, { stripPreamble: false });
    const rawPayoff = this.payoffEngine.analyzePayoffWords(words, rawCoherence.startSec, rawCoherence.endSec, maxClipDurationSec);

    const rawCoherenceScore = rawCoherence.danglingPronounResolved || rawCoherence.cliffhangerResolved ? 80 : 95;
    const rawEditorialScore = Number(
      (
        rawPayoff.payoffScore * weights.payoff +
        rawOpening.hookScore * weights.hook +
        rawCoherenceScore * weights.coherence
      ).toFixed(2)
    );

    const rawPacing = this.calculatePacingMetrics(words, rawCoherence.startSec, rawCoherence.endSec);
    const rawPerformanceScore = Number(
      (0.35 * rawPacing.pacingScore + 0.35 * rawOpening.hookScore + 0.30 * rawPayoff.payoffScore).toFixed(2)
    );

    // Decision hierarchy check:
    // If payoff contract is materially violated, candidate cannot be considered valid as-is
    const rawIsValid = !rawPayoff.materialViolation && rawPayoff.isPayoffComplete;

    variants.push({
      variantId: 'raw',
      startSec: rawCoherence.startSec,
      endSec: rawCoherence.endSec,
      durationSec: Number((rawCoherence.endSec - rawCoherence.startSec).toFixed(2)),
      hookScore: rawOpening.hookScore,
      payoffScore: rawPayoff.payoffScore,
      coherenceScore: rawCoherenceScore,
      editorialScore: rawEditorialScore,
      performancePredictionScore: rawPerformanceScore,
      compositeScore: rawEditorialScore,
      speech_density_wps: rawPacing.speechDensityWps,
      pause_density_ratio: rawPacing.pauseDensityRatio,
      start_boundary_quality: rawOpening.isWeakPreamble ? 'preamble_present' : 'snapped_onset',
      end_boundary_quality: !rawPayoff.isPayoffComplete ? 'incomplete_cliffhanger' : 'complete_terminal',
      isValid: rawIsValid,
      rejectionReason: rawIsValid ? undefined : rawPayoff.explanation,
      explanation: `Raw acoustic candidate: ${rawOpening.explanation} ${rawPayoff.explanation}`,
    });

    // 2. Candidate-Dependent Variant: Hook-Adjusted (only generated if weak preamble detected)
    if (rawOpening.isWeakPreamble && rawOpening.thesisStartSec) {
      const hookStart = rawOpening.thesisStartSec;
      const hookEnd = rawCoherence.endSec;
      const hookDuration = hookEnd - hookStart;

      const minDuration = Math.min(10.0, Math.max(3.0, candidateEndSec - candidateStartSec));
      if (hookDuration >= minDuration) {
        const hookOpening = this.coherenceGuard.analyzeOpening(words, hookStart, hookEnd);
        // Advance thesis boosts hook score to punchy delivery
        const sharpenedHookScore = Math.max(hookOpening.hookScore, 85);
        const hookPayoff = this.payoffEngine.analyzePayoffWords(words, hookStart, hookEnd, maxClipDurationSec);
        const hookCoherenceScore = 90; // High coherence with throat-clearing removed
        const hookEditorialScore = Number(
          (
            hookPayoff.payoffScore * weights.payoff +
            sharpenedHookScore * weights.hook +
            hookCoherenceScore * weights.coherence
          ).toFixed(2)
        );

        const hookPacing = this.calculatePacingMetrics(words, hookStart, hookEnd);
        const hookPerformanceScore = Number(
          (0.35 * hookPacing.pacingScore + 0.35 * sharpenedHookScore + 0.30 * hookPayoff.payoffScore).toFixed(2)
        );

        const hookIsValid = !hookPayoff.materialViolation && hookPayoff.isPayoffComplete;

        variants.push({
          variantId: 'hook_adjusted',
          startSec: Number(hookStart.toFixed(2)),
          endSec: Number(hookEnd.toFixed(2)),
          durationSec: Number(hookDuration.toFixed(2)),
          hookScore: sharpenedHookScore,
          payoffScore: hookPayoff.payoffScore,
          coherenceScore: hookCoherenceScore,
          editorialScore: hookEditorialScore,
          performancePredictionScore: hookPerformanceScore,
          compositeScore: hookEditorialScore,
          speech_density_wps: hookPacing.speechDensityWps,
          pause_density_ratio: hookPacing.pauseDensityRatio,
          start_boundary_quality: 'clean_thesis',
          end_boundary_quality: !hookPayoff.isPayoffComplete ? 'incomplete_cliffhanger' : 'complete_terminal',
          isValid: hookIsValid,
          rejectionReason: hookIsValid ? undefined : hookPayoff.explanation,
          explanation: `Preamble stripped: Starts on core thesis with sharpened hook.`,
        });
      }
    }

    // 3. Candidate-Dependent Variant: Payoff-Extended (only generated if payoff incomplete and expandable)
    if (!rawPayoff.isPayoffComplete && rawPayoff.resolutionEndSec) {
      const bestStart = (variants.find(v => v.variantId === 'hook_adjusted')?.startSec) ?? rawCoherence.startSec;
      const extendedEnd = rawPayoff.resolutionEndSec;
      const extendedDuration = extendedEnd - bestStart;
      const minDuration = Math.min(10.0, Math.max(3.0, candidateEndSec - candidateStartSec));

      if (extendedDuration <= maxClipDurationSec && extendedDuration >= minDuration) {
        const extOpening = this.coherenceGuard.analyzeOpening(words, bestStart, extendedEnd);
        const extPayoff = this.payoffEngine.analyzePayoffWords(words, bestStart, extendedEnd, maxClipDurationSec);
        const extHookScore = bestStart !== rawCoherence.startSec ? Math.max(extOpening.hookScore, 85) : extOpening.hookScore;
        const extCoherenceScore = 95;
        const extEditorialScore = Number(
          (
            extPayoff.payoffScore * weights.payoff +
            extHookScore * weights.hook +
            extCoherenceScore * weights.coherence
          ).toFixed(2)
        );

        const extPacing = this.calculatePacingMetrics(words, bestStart, extendedEnd);
        const extPerformanceScore = Number(
          (0.35 * extPacing.pacingScore + 0.35 * extHookScore + 0.30 * extPayoff.payoffScore).toFixed(2)
        );

        const extIsValid = extPayoff.isPayoffComplete && !extPayoff.materialViolation;

        variants.push({
          variantId: 'payoff_extended',
          startSec: Number(bestStart.toFixed(2)),
          endSec: Number(extendedEnd.toFixed(2)),
          durationSec: Number(extendedDuration.toFixed(2)),
          hookScore: extHookScore,
          payoffScore: extPayoff.payoffScore,
          coherenceScore: extCoherenceScore,
          editorialScore: extEditorialScore,
          performancePredictionScore: extPerformanceScore,
          compositeScore: extEditorialScore,
          speech_density_wps: extPacing.speechDensityWps,
          pause_density_ratio: extPacing.pauseDensityRatio,
          start_boundary_quality: bestStart !== rawCoherence.startSec ? 'clean_thesis' : 'snapped_onset',
          end_boundary_quality: 'extended_resolution',
          isValid: extIsValid,
          rejectionReason: extIsValid ? undefined : extPayoff.explanation,
          explanation: `Payoff extended forward to naturally conclude the narrative premise.`,
        });
      }
    }

    // 4. Select Winning Variant
    // Only valid variants that respect the narrative payoff contract are eligible
    const validVariants = variants.filter(v => v.isValid);

    if (validVariants.length === 0) {
      // Invariant enforcement: No candidate without validated payoff is allowed to pass
      const fallback = variants[0];
      return {
        candidateId,
        winningVariant: fallback,
        allVariants: variants,
        accepted: false,
        rejectionReason: fallback.rejectionReason || 'Payoff contract materially violated.',
      };
    }

    // Pick highest composite score among valid variants
    validVariants.sort((a, b) => b.compositeScore - a.compositeScore);
    const winner = validVariants[0];

    return {
      candidateId,
      winningVariant: winner,
      allVariants: variants,
      accepted: true,
    };
  }
}

export const editorialPlanEvaluator = new EditorialPlanEvaluator();
