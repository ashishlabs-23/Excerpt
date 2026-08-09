"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RankingEvaluator = void 0;
class RankingEvaluator {
    evaluate(expected, generated) {
        let score = 100;
        const notes = [];
        const regressions = [];
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
        const topClip = generated[0];
        if (!topClip.reason && !topClip.summary) {
            score -= 20;
            notes.push('Missing explanatory reasoning for top clip.');
        }
        else {
            notes.push('Explanatory reasoning present.');
        }
        const vScore = topClip.virality_score ?? topClip.confidence ?? 0;
        if (vScore < 80 && vScore < 0.8) {
            score -= 10;
            notes.push(`Top clip has low virality score (${vScore}).`);
        }
        if (!topClip.score_breakdown && !topClip.scores) {
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
exports.RankingEvaluator = RankingEvaluator;
