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
  compositeScore: number;
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
    const rawComposite = Number(
      (
        rawPayoff.payoffScore * weights.payoff +
        rawOpening.hookScore * weights.hook +
        rawCoherenceScore * weights.coherence
      ).toFixed(2)
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
      compositeScore: rawComposite,
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
        const hookComposite = Number(
          (
            hookPayoff.payoffScore * weights.payoff +
            sharpenedHookScore * weights.hook +
            hookCoherenceScore * weights.coherence
          ).toFixed(2)
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
          compositeScore: hookComposite,
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
        const extComposite = Number(
          (
            extPayoff.payoffScore * weights.payoff +
            extHookScore * weights.hook +
            extCoherenceScore * weights.coherence
          ).toFixed(2)
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
          compositeScore: extComposite,
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
