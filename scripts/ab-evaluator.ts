import fs from 'fs';
import path from 'path';

interface EvaluatorResult {
  component: string;
  score: number;
  passed: boolean;
  regressions: string[];
}

interface EvaluationReport {
  benchmark: string;
  overallScore: number;
  passed: boolean;
  components: EvaluatorResult[];
}

function computeAverage(reports: EvaluationReport[], key: string): number {
  if (reports.length === 0) return 0;
  if (key === 'overall') {
    return reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length;
  }
  
  // Average across components
  let totalScore = 0;
  let count = 0;
  for (const r of reports) {
    const comp = r.components.find(c => c.component === key);
    if (comp) {
      totalScore += comp.score;
      count++;
    }
  }
  return count > 0 ? totalScore / count : 0;
}

function loadReports(filePath: string): EvaluationReport[] {
  if (!fs.existsSync(filePath)) {
    console.error(`Cannot find report at ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/ab-evaluator.ts <baseline.json> <experimental.json>");
    process.exit(1);
  }

  const baselineReports = loadReports(args[0]);
  const experimentalReports = loadReports(args[1]);

  const bOverall = computeAverage(baselineReports, 'overall');
  const eOverall = computeAverage(experimentalReports, 'overall');
  const overallDelta = eOverall - bOverall;

  const components = ['BoundaryEvaluator', 'SubtitleEvaluator', 'RenderEvaluator', 'RankingEvaluator', 'DiversityEvaluator'];
  
  console.log('Baseline');
  console.log('---------');
  console.log(`Overall: ${bOverall.toFixed(1)}`);
  
  console.log('\nExperimental');
  console.log('------------');
  console.log(`Overall: ${eOverall.toFixed(1)}`);

  console.log('\nDelta');
  console.log('-----');
  console.log(`Overall          ${overallDelta > 0 ? '+' : ''}${overallDelta.toFixed(1)}`);
  
  const componentDeltas: Record<string, number> = {};

  for (const comp of components) {
    const bScore = computeAverage(baselineReports, comp);
    const eScore = computeAverage(experimentalReports, comp);
    const delta = eScore - bScore;
    componentDeltas[comp] = delta;
    
    // Format spacing
    const name = comp.replace('Evaluator', '');
    const spaces = ' '.repeat(16 - name.length);
    console.log(`${name}${spaces} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`);
  }

  // Count new regressions
  let newRegressionsCount = 0;
  let hasCriticalQA = false;
  
  for (const eReport of experimentalReports) {
    const bReport = baselineReports.find(r => r.benchmark === eReport.benchmark);
    if (!eReport.passed) {
      // Could be a critical QA failure if it fails completely
      hasCriticalQA = true;
    }
    
    for (const eComp of eReport.components) {
      if (eComp.regressions && eComp.regressions.length > 0) {
        // Just rough count
        newRegressionsCount += eComp.regressions.length;
      }
    }
  }

  console.log('\nRegression Count');
  console.log('----------------');
  console.log(newRegressionsCount);

  console.log('\nRecommendation');
  console.log('--------------');

  // Promotion Rules:
  // PASS if Overall >= Baseline + 1% AND No evaluator decreases > 2% AND No Critical QA failures
  
  let promote = true;
  const reasons: string[] = [];

  if (overallDelta < 1.0) {
    promote = false;
    reasons.push(`Overall improvement (${overallDelta.toFixed(1)}%) is less than 1.0% threshold.`);
  }

  for (const [comp, delta] of Object.entries(componentDeltas)) {
    if (delta < -2.0) {
      promote = false;
      reasons.push(`${comp} degraded by > 2% (${delta.toFixed(1)}%).`);
    }
  }

  if (hasCriticalQA) {
    promote = false;
    reasons.push('Critical QA failures detected in experimental run.');
  }

  if (promote) {
    console.log('PASS');
    console.log('Promote Experimental Pipeline');
  } else {
    console.log('REJECT');
    console.log('Do not promote.');
    console.log('Reasons:');
    for (const r of reasons) console.log(` - ${r}`);
    process.exit(1);
  }
}

main();
