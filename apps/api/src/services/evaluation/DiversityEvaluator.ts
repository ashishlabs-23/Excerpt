import { IEvaluator, EvaluatorResult } from './IEvaluator';
import { ClipCandidate } from '../intelligence/CandidateGenerationEngine';

export class DiversityEvaluator implements IEvaluator {
  public evaluate(expected: any, generated: ClipCandidate[]): EvaluatorResult {
    let score = 100;
    const notes: string[] = [];
    const regressions: string[] = [];
    let passed = true;

    if (!generated || generated.length < 5) {
      return {
        component: 'DiversityEvaluator',
        score: 0,
        passed: false,
        regressions: ['Too few candidates generated to evaluate diversity.'],
        notes: []
      };
    }

    // Check temporal overlap between all pairs
    let totalOverlapPairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < generated.length; i++) {
      for (let j = i + 1; j < generated.length; j++) {
        const c1 = generated[i];
        const c2 = generated[j];

        const startMax = Math.max(c1.start_time, c2.start_time);
        const endMin = Math.min(c1.end_time, c2.end_time);
        const overlap = Math.max(0, endMin - startMax);

        // If overlap is more than 50% of the shorter clip
        const minDuration = Math.min(c1.end_time - c1.start_time, c2.end_time - c2.start_time);
        if (overlap > minDuration * 0.5) {
          totalOverlapPairs++;
        }
        totalPairs++;
      }
    }

    const overlapRatio = totalOverlapPairs / totalPairs;

    if (overlapRatio > 0.1) {
      score -= (overlapRatio * 100); // 20% overlap -> -20 score
      notes.push(`High candidate overlap detected: ${(overlapRatio * 100).toFixed(1)}% of pairs.`);
    } else {
      notes.push('Candidates are well-distributed temporally.');
    }

    if (score < 80) {
      passed = false;
      regressions.push(`Diversity score dropped to ${score.toFixed(1)} (Threshold: 80)`);
    }

    return {
      component: 'DiversityEvaluator',
      score: Number(score.toFixed(1)),
      passed,
      regressions,
      notes
    };
  }
}
