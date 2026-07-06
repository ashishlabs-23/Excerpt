import { BoundaryEvaluator } from './BoundaryEvaluator';
import { SubtitleEvaluator } from './SubtitleEvaluator';
import { RenderEvaluator } from './RenderEvaluator';
import { RankingEvaluator } from './RankingEvaluator';
import { DiversityEvaluator } from './DiversityEvaluator';
import { EvaluatorResult } from './IEvaluator';

export interface EvaluationReport {
  benchmark: string;
  overallScore: number;
  passed: boolean;
  components: EvaluatorResult[];
  metadata: any;
}

export class OverallScorer {
  private boundary = new BoundaryEvaluator();
  private subtitle = new SubtitleEvaluator();
  private render = new RenderEvaluator();
  private ranking = new RankingEvaluator();
  private diversity = new DiversityEvaluator();

  public evaluateAll(
    benchmarkName: string,
    metadata: any,
    expectedData: { clips: any[], render: any },
    generatedData: { 
      candidates: any[], 
      rankedClips: any[], 
      renderPlans: any[], 
      subtitleASS: string 
    }
  ): EvaluationReport {
    
    const results: EvaluatorResult[] = [
      this.boundary.evaluate(expectedData.clips || [], generatedData.rankedClips),
      this.subtitle.evaluate(null, generatedData.subtitleASS),
      this.render.evaluate(expectedData.render, generatedData.renderPlans),
      this.ranking.evaluate(null, generatedData.rankedClips),
      this.diversity.evaluate(null, generatedData.candidates)
    ];

    const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    
    // Overall passes only if NO component has severe regressions (passed === false)
    // AND overall score is above threshold
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
