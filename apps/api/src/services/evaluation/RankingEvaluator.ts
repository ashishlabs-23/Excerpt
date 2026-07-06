import { IEvaluator, EvaluatorResult } from './IEvaluator';
import { ClipSegment } from '../aiService';

export class RankingEvaluator implements IEvaluator {
  public evaluate(expected: any, generated: ClipSegment[]): EvaluatorResult {
    let score = 100;
    const notes: string[] = [];
    const regressions: string[] = [];
    let passed = true;

    if (!generated || generated.length === 0) {
      return {
        component: 'RankingEvaluator',
        score: 0,
        passed: false,
        regressions: ['No ranked clips generated.'],
        notes: []
      };
    }

    // Evaluate top clip
    const topClip = generated[0];

    // Check for structure
    if (!topClip.reason || topClip.reason.length === 0) {
      score -= 20;
      notes.push('Missing explanatory reasoning for top clip.');
    } else {
      notes.push('Explanatory reasoning present.');
    }

    // Check score threshold
    if ((topClip.virality_score || 0) < 80) {
      score -= 10;
      notes.push(`Top clip has low virality score (${topClip.virality_score}).`);
    }

    // Check score breakdown existence (schema v2)
    if (!topClip.score_breakdown) {
      score -= 30;
      notes.push('Missing detailed score breakdown (retention, curiosity, etc).');
    }

    if (score < 90) {
      passed = false;
      regressions.push(`Ranking schema/quality score dropped to ${score} (Threshold: 90)`);
    }

    return {
      component: 'RankingEvaluator',
      score,
      passed,
      regressions,
      notes
    };
  }
}
