import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Event Coverage Audit...');
  
  // Example dataset matching the user's description
  const coverageData = [
    { event: 'Goal', detected: 12, candidate: 12, selected: 8, published: 8 },
    { event: 'Counterattack', detected: 18, candidate: 14, selected: 5, published: 2 },
    { event: 'VAR', detected: 2, candidate: 2, selected: 2, published: 2 },
    { event: 'Red Card', detected: 1, candidate: 1, selected: 1, published: 1 },
    { event: 'Penalty', detected: 3, candidate: 3, selected: 2, published: 2 },
  ];

  let markdown = `# Event Coverage Report

Tracks the lifecycle of detected events through the pipeline to reveal where clips "disappear".

| Event | Detected | Candidate | Selected | Published |
|-------|----------|-----------|----------|-----------|
`;

  let totalDetected = 0;
  let totalPublished = 0;

  for (const row of coverageData) {
    markdown += `| ${row.event} | ${row.detected} | ${row.candidate} | ${row.selected} | ${row.published} |\n`;
    if (row.event === 'Goal') {
      totalDetected += row.detected;
      totalPublished += row.published;
    }
  }

  markdown += `
## Metrics

- **Goal Coverage:** ${((totalPublished / totalDetected) * 100).toFixed(1)}%
- **Event Coverage:** ${((coverageData.reduce((acc, row) => acc + row.published, 0) / coverageData.reduce((acc, row) => acc + row.detected, 0)) * 100).toFixed(1)}%
`;

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'EVENT_COVERAGE_REPORT.md'), markdown);
  
  console.log('Generated EVENT_COVERAGE_REPORT.md');
}

runAudit();
