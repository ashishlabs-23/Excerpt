import fs from 'fs';
import path from 'path';
import { OverallScorer } from '../apps/api/src/services/evaluation/OverallScorer';

async function runBenchmarkGate() {
  console.log('=== Excerpt Quality Benchmark Gate ===');
  const scorer = new OverallScorer();
  
  // In a real scenario, this would dynamically run the pipeline on all datasets.
  // For MVP gate, we'll simulate the gathering of the expected/generated data
  const datasets = ['podcast', 'gaming', 'interview', 'tutorial', 'football'];
  
  let allPassed = true;
  const reports = [];
  
  for (const ds of datasets) {
    const basePath = path.join(process.cwd(), 'benchmark', ds);
    if (!fs.existsSync(basePath)) continue;
    
    const expectedClips = loadJson(path.join(basePath, 'expected_clips.json'));
    const expectedRender = loadJson(path.join(basePath, 'expected_render.json'));
    
    // Simulate reading the latest pipeline output (in real life we run the AI engine here)
    // We mock a perfect pipeline run just to validate the CI/CD gate structure
    const report = scorer.evaluateAll(
      ds,
      {
        promptVersion: 'candidate_generation/v1.md',
        rankingPrompt: 'comparative_ranking/v1.md',
        model: 'gemini-2.0-flash',
        temperature: 0.3
      },
      { clips: expectedClips || [], render: expectedRender },
      { candidates: [], rankedClips: [], renderPlans: [], subtitleASS: '' } // This would normally be populated
    );

    // The OverallScorer enforces the thresholds internally. 
    // If it fails (due to missing mock data here), we log it.
    reports.push(report);
    if (!report.passed) {
      allPassed = false;
    }
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const resultsDir = path.join(process.cwd(), 'benchmark-results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);

  const reportJsonPath = path.join(resultsDir, `${dateStr}.json`);
  const reportMdPath = path.join(resultsDir, `${dateStr}.md`);

  fs.writeFileSync(reportJsonPath, JSON.stringify(reports, null, 2));

  let mdContent = `# Excerpt Benchmark Run: ${dateStr}\n\n`;
  mdContent += `**Overall Status**: ${allPassed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
  
  for (const r of reports) {
    mdContent += `## ${r.benchmark}\n`;
    mdContent += `- **Score**: ${r.overallScore}\n`;
    mdContent += `- **Status**: ${r.passed ? '✅ Pass' : '❌ Fail'}\n`;
    
    mdContent += `### Components\n`;
    for (const c of r.components) {
      mdContent += `- **${c.component}**: ${c.score} (${c.passed ? 'Pass' : 'Fail'})\n`;
      if (c.regressions.length > 0) {
        mdContent += `  - *Regressions*: ${c.regressions.join(', ')}\n`;
      }
    }
    mdContent += '\n';
  }

  fs.writeFileSync(reportMdPath, mdContent);
  console.log(`Saved reports to ${resultsDir}`);

  if (!allPassed) {
    console.error('❌ Quality Gate Failed. Regressions detected.');
    process.exit(1);
  } else {
    console.log('✅ Quality Gate Passed.');
    process.exit(0);
  }
}

function loadJson(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

runBenchmarkGate().catch(console.error);
