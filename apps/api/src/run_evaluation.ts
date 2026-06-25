import { evaluationFramework } from './services/intelligence/EvaluationFramework';

console.log('--- EXCERPT V3 BENCHMARK EVALUATION START ---');
const report = evaluationFramework.runBenchmarks();
console.log('--- REPORT CONTENT ---');
console.log(report);
console.log('--- EXCERPT V3 BENCHMARK EVALUATION COMPLETE ---');
