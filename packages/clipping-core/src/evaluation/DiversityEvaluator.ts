import { IEvaluator, EvaluatorResult } from './IEvaluator';

export class DiversityEvaluator implements IEvaluator {
  public evaluate(expected: any, generated: any[]): EvaluatorResult {
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

    let totalOverlapPairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < generated.length; i++) {
      for (let j = i + 1; j < generated.length; j++) {
        const c1 = generated[i];
        const c2 = generated[j];

        const start1 = c1.start_time ?? c1.start;
        const end1 = c1.end_time ?? c1.end;
        const start2 = c2.start_time ?? c2.start;
        const end2 = c2.end_time ?? c2.end;

        const startMax = Math.max(start1, start2);
        const endMin = Math.min(end1, end2);
        const overlap = Math.max(0, endMin - startMax);

        const minDuration = Math.min(end1 - start1, end2 - start2);
        if (overlap > minDuration * 0.5) {
          totalOverlapPairs++;
        }
        totalPairs++;
      }
    }

    const overlapRatio = totalPairs > 0 ? totalOverlapPairs / totalPairs : 0;

    if (overlapRatio > 0.1) {
      score -= (overlapRatio * 100);
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
