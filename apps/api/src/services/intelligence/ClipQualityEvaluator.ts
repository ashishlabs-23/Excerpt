import fs from 'fs';
import path from 'path';
import { ClipSegment } from '../aiService';
import { SmartCropPlan } from '../videoProcessor';

export interface EvaluatorResult {
  benchmark: string;
  clipScore: number;
  boundaryScore: number;
  subtitleScore: number;
  renderScore: number;
  overall: number;
  regressions: string[];
}

export class ClipQualityEvaluator {
  public evaluateBenchmark(
    benchmarkName: string,
    generatedClips: ClipSegment[],
    generatedRenderPlans: SmartCropPlan[]
  ): EvaluatorResult {
    const basePath = path.join(process.cwd(), 'benchmark', benchmarkName);
    
    // Load ground truths
    const expectedClips = this.loadJson(path.join(basePath, 'expected_clips.json'));
    const expectedRender = this.loadJson(path.join(basePath, 'expected_render.json'));
    // TODO: Load expected subtitles ASS file and compare

    let clipScore = 0;
    let boundaryScore = 0;
    let renderScore = 0;
    let subtitleScore = 100; // Mock until ASS diffing is implemented
    const regressions: string[] = [];

    if (expectedClips && expectedClips.length > 0) {
      // Very naive scoring for MVP
      clipScore = this.computeClipScore(expectedClips, generatedClips);
      boundaryScore = this.computeBoundaryScore(expectedClips, generatedClips);
    } else {
      clipScore = 100;
      boundaryScore = 100;
    }

    if (expectedRender && generatedRenderPlans.length > 0) {
      renderScore = this.computeRenderScore(expectedRender, generatedRenderPlans);
    } else {
      renderScore = 100;
    }

    const overall = (clipScore + boundaryScore + subtitleScore + renderScore) / 4;

    if (overall < 80) {
      regressions.push(`Overall score dropped below 80% (Current: ${overall.toFixed(1)}%)`);
    }

    return {
      benchmark: benchmarkName,
      clipScore: Number(clipScore.toFixed(1)),
      boundaryScore: Number(boundaryScore.toFixed(1)),
      subtitleScore: Number(subtitleScore.toFixed(1)),
      renderScore: Number(renderScore.toFixed(1)),
      overall: Number(overall.toFixed(1)),
      regressions
    };
  }

  private computeClipScore(expected: any[], generated: ClipSegment[]): number {
    // Check if the generated clips successfully cover the expected clip timeframes
    let matches = 0;
    for (const exp of expected) {
      const match = generated.some(gen => {
        const overlapStart = Math.max(exp.start_time, gen.start_time);
        const overlapEnd = Math.min(exp.end_time, gen.end_time);
        return (overlapEnd - overlapStart) > 10; // At least 10s of overlap
      });
      if (match) matches++;
    }
    return (matches / expected.length) * 100;
  }

  private computeBoundaryScore(expected: any[], generated: ClipSegment[]): number {
    // Check how close the start/end times are to the expected
    let totalError = 0;
    let matches = 0;

    for (const exp of expected) {
      // Find closest generated clip
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
      }
    }

    if (matches === 0) return 0;
    const avgError = totalError / matches;
    // Perfect is 0 error (100 score). 10 seconds error = 0 score.
    return Math.max(0, 100 - (avgError * 10));
  }

  private computeRenderScore(expected: any, generated: SmartCropPlan[]): number {
    // Simplified: just check if mode matches expectations
    if (expected.crop_strategy === 'dynamic' && generated.every(g => g.mode === 'dynamic')) {
      return 100;
    }
    if (expected.crop_strategy === 'center' && generated.some(g => g.mode === 'dynamic')) {
      return 50; // Penalize for unnecessary dynamic movement
    }
    return 80;
  }

  private loadJson(filePath: string): any {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}
