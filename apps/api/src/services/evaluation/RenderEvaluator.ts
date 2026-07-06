import { IEvaluator, EvaluatorResult } from './IEvaluator';
import { SmartCropPlan } from '../videoProcessor';

export class RenderEvaluator implements IEvaluator {
  public evaluate(expected: any, generated: SmartCropPlan[]): EvaluatorResult {
    let score = 100;
    const notes: string[] = [];
    const regressions: string[] = [];
    let passed = true;

    if (!expected) {
      return {
        component: 'RenderEvaluator',
        score: 100,
        passed: true,
        regressions: [],
        notes: ['No expected render expectations provided; passing by default.']
      };
    }

    const expectedMode = expected.crop_strategy;

    if (expectedMode === 'dynamic') {
      const allDynamic = generated.every(g => g.mode === 'dynamic');
      if (allDynamic) {
        notes.push('Successfully matched dynamic crop expectation.');
      } else {
        score -= 20;
        notes.push('Expected dynamic crop, but some segments were statically cropped.');
      }
    } else if (expectedMode === 'center') {
      const anyDynamic = generated.some(g => g.mode === 'dynamic');
      if (anyDynamic) {
        score -= 50;
        notes.push('Penalizing dynamic movement when center crop was expected.');
      } else {
        notes.push('Successfully matched center crop expectation.');
      }
    }

    if (score < 90) {
      passed = false;
      regressions.push(`Render score dropped to ${score} (Threshold: 90)`);
    }

    return {
      component: 'RenderEvaluator',
      score,
      passed,
      regressions,
      notes
    };
  }
}
