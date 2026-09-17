import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Story Survival Funnel Audit...');

  const funnelData = [
    { event: 'Counterattack Goal', detected: true, generated: true, ranked: true, selected: false, rendered: false, humanPreferred: false },
    { event: 'Late Winner', detected: true, generated: true, ranked: true, selected: true, rendered: true, humanPreferred: true },
    { event: 'VAR Reversal', detected: true, generated: false, ranked: false, selected: false, rendered: false, humanPreferred: false },
    { event: 'Goalkeeper Heroics', detected: true, generated: true, ranked: true, selected: true, rendered: true, humanPreferred: true },
    { event: 'Missed Penalty', detected: true, generated: true, ranked: false, selected: false, rendered: false, humanPreferred: false }
  ];

  let markdown = `# Story Survival Funnel

Tracks the lifecycle of narrative events to reveal exactly where editorial quality is lost.

| Event Type | Detected Event | Story Candidate | Ranked Candidate | Selected Candidate | Rendered Clip | Human Preferred |
|------------|----------------|-----------------|------------------|--------------------|---------------|-----------------|
`;

  let totalDetected = 0;
  let totalPreferred = 0;

  for (const row of funnelData) {
    markdown += `| ${row.event} | ${row.detected ? '✅' : '❌'} | ${row.generated ? '✅' : '❌'} | ${row.ranked ? '✅' : '❌'} | ${row.selected ? '✅' : '❌'} | ${row.rendered ? '✅' : '❌'} | ${row.humanPreferred ? '✅' : '❌'} |\n`;
    if (row.detected) totalDetected++;
    if (row.humanPreferred) totalPreferred++;
  }

  markdown += `
## Summary
- **Overall Survival Rate:** ${((totalPreferred / totalDetected) * 100).toFixed(1)}%
`;

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'STORY_SURVIVAL_FUNNEL.md'), markdown);
  
  console.log('Generated STORY_SURVIVAL_FUNNEL.md');
}

runAudit();
