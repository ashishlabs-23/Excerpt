import { BoundaryEvaluator } from '../apps/api/src/services/evaluation/BoundaryEvaluator';
import { SubtitleEvaluator } from '../apps/api/src/services/evaluation/SubtitleEvaluator';
import { RenderEvaluator } from '../apps/api/src/services/evaluation/RenderEvaluator';
import { DiversityEvaluator } from '../apps/api/src/services/evaluation/DiversityEvaluator';
import { RankingEvaluator } from '../apps/api/src/services/evaluation/RankingEvaluator';

function testBoundaryEvaluator() {
  const evaluator = new BoundaryEvaluator();
  const expected = [{ start_time: 10, end_time: 20 }];
  const generated = [{ start_time: 15, end_time: 25 } as any]; // 10s error
  
  const result = evaluator.evaluate(expected, generated);
  if (result.passed) {
    throw new Error('BoundaryEvaluator failed to catch 10s error.');
  }
  console.log('✅ BoundaryEvaluator successfully caught boundary mismatch.');
}

function testSubtitleEvaluator() {
  const evaluator = new SubtitleEvaluator();
  const badAss = `Dialogue: 0,0:00:01.00,0:00:01.20,Default,,0,0,0,,This is a very long line that exceeds twenty five characters and also overlaps
Dialogue: 0,0:00:01.10,0:00:01.50,Default,,0,0,0,,Overlapping text`;
  
  const result = evaluator.evaluate(null, badAss);
  if (result.passed) {
    throw new Error('SubtitleEvaluator failed to catch subtitle overflow and overlap.');
  }
  console.log('✅ SubtitleEvaluator successfully caught overlap and overflow.');
}

function testRenderEvaluator() {
  const evaluator = new RenderEvaluator();
  const expected = { crop_strategy: 'center' };
  const generated = [{ mode: 'dynamic' } as any];
  
  const result = evaluator.evaluate(expected, generated);
  if (result.passed) {
    throw new Error('RenderEvaluator failed to catch incorrect crop mode.');
  }
  console.log('✅ RenderEvaluator successfully caught incorrect crop mode.');
}

function testDiversityEvaluator() {
  const evaluator = new DiversityEvaluator();
  const generated = [
    { start_time: 10, end_time: 20 },
    { start_time: 10, end_time: 20 },
    { start_time: 10, end_time: 20 },
    { start_time: 10, end_time: 20 },
    { start_time: 10, end_time: 20 },
  ] as any[];
  
  const result = evaluator.evaluate(null, generated);
  if (result.passed) {
    throw new Error('DiversityEvaluator failed to catch zero-diversity candidate list.');
  }
  console.log('✅ DiversityEvaluator successfully caught low candidate diversity.');
}

function testRankingEvaluator() {
  const evaluator = new RankingEvaluator();
  const generated = [
    { virality_score: 50, reason: null, score_breakdown: null } as any
  ];
  
  const result = evaluator.evaluate(null, generated);
  if (result.passed) {
    throw new Error('RankingEvaluator failed to catch poor ranking quality.');
  }
  console.log('✅ RankingEvaluator successfully caught bad ranking output.');
}

function main() {
  console.log('Running Synthetic Regression Tests...\n');
  try {
    testBoundaryEvaluator();
    testSubtitleEvaluator();
    testRenderEvaluator();
    testDiversityEvaluator();
    testRankingEvaluator();
    console.log('\nAll Synthetic Evaluator Tests Passed. System is robust against regressions.');
  } catch (err: any) {
    console.error('\n❌ Synthetic Regression Test Failed:', err.message);
    process.exit(1);
  }
}

main();
