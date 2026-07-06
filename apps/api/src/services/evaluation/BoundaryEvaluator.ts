import { IEvaluator, EvaluatorResult } from './IEvaluator';
import { ClipSegment } from '../../aiService';

export class BoundaryEvaluator implements IEvaluator {
  public evaluate(expected: any[], generated: ClipSegment[]): EvaluatorResult {
    let totalError = 0;
    let matches = 0;
    const notes: string[] = [];
    const regressions: string[] = [];

    for (const exp of expected) {
      let closest = generated[0];
      let minDiff = Infinity;

      for (const gen of generated) {
        const diff = Math.abs(gen.start_time - exp.start_time) + Math.abs(gen.end_time - exp.end_time);
        if (diff < minDiff) {
          minDiff = diff;
          closest = gen;
        }
      }

      if (closest && minDiff < 30) {
        totalError += minDiff;
        matches++;
        
        if (Math.abs(closest.start_time - exp.start_time) < 1.0) {
          notes.push(`Hook for expected clip at ${exp.start_time}s starts naturally.`);
        } else {
          notes.push(`Hook for expected clip at ${exp.start_time}s is off by ${Math.abs(closest.start_time - exp.start_time).toFixed(1)}s.`);
        }
      }
    }

    if (matches === 0) {
      return {
        component: 'BoundaryEvaluator',
        score: 0,
        passed: false,
        regressions: ['No overlapping boundaries found with expected clips.'],
        notes: ['Failed to map any generated clips to expected clips.']
      };
    }

    const avgError = totalError / matches;
    const score = Math.max(0, 100 - (avgError * 10)); // 10s avg error = 0 score
    const passed = score >= 80;

    if (!passed) {
      regressions.push(`Boundary score dropped to ${score.toFixed(1)}% (Threshold: 80%)`);
    }

    return {
      component: 'BoundaryEvaluator',
      score: Number(score.toFixed(1)),
      passed,
      regressions,
      notes
    };
  }
}
