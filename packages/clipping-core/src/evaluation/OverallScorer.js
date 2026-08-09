"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverallScorer = void 0;
const BoundaryEvaluator_1 = require("./BoundaryEvaluator");
const SubtitleEvaluator_1 = require("./SubtitleEvaluator");
const RenderEvaluator_1 = require("./RenderEvaluator");
const RankingEvaluator_1 = require("./RankingEvaluator");
const DiversityEvaluator_1 = require("./DiversityEvaluator");
class OverallScorer {
    constructor() {
        this.boundary = new BoundaryEvaluator_1.BoundaryEvaluator();
        this.subtitle = new SubtitleEvaluator_1.SubtitleEvaluator();
        this.render = new RenderEvaluator_1.RenderEvaluator();
        this.ranking = new RankingEvaluator_1.RankingEvaluator();
        this.diversity = new DiversityEvaluator_1.DiversityEvaluator();
    }
    evaluateAll(benchmarkName, metadata, expectedData, generatedData) {
        const results = [
            this.boundary.evaluate(expectedData.clips || [], generatedData.rankedClips),
            this.subtitle.evaluate(null, generatedData.subtitleASS),
            this.render.evaluate(expectedData.render, generatedData.renderPlans || []),
            this.ranking.evaluate(null, generatedData.rankedClips),
            this.diversity.evaluate(null, generatedData.candidates)
        ];
        const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const passed = results.every(r => r.passed) && overallScore >= 85;
        return {
            benchmark: benchmarkName,
            overallScore: Number(overallScore.toFixed(1)),
            passed,
            components: results,
            metadata
        };
    }
}
exports.OverallScorer = OverallScorer;
