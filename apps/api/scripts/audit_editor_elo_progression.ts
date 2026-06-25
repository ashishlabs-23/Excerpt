import fs from 'fs';
import path from 'path';

function runEloProgressionAudit() {
  console.log('Running Editor Elo Progression Audit...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  const trackerPath = path.join(__dirname, 'editorial_elo_tracker.json');
  
  if (!fs.existsSync(trackerPath)) {
    console.error('No Elo tracker found. Run the championship runner first.');
    return;
  }
  
  const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));

  let markdown = `# Editor Elo Progression

This scoreboard tracks the fundamental capability of Excerpt's editorial intelligence compared to human editors and legacy baselines.

| Week | Human Editor | Current Production | Experimental A | Experimental B | Legacy Baseline |
|------|--------------|--------------------|----------------|----------------|-----------------|
`;

  tracker.history.forEach((h: any) => {
    markdown += `| ${h.week} | ${h.human_editor} | ${h.current_production} | ${h.experimental_a} | ${h.experimental_b} | ${h.legacy_baseline} |\n`;
  });
  
  // Add current
  markdown += `| **Current** | **${tracker.competitors.human_editor || '-'}** | **${tracker.competitors.current_production || '-'}** | **${tracker.competitors.experimental_a || '-'}** | **${tracker.competitors.experimental_b || '-'}** | **${tracker.competitors.legacy_baseline || '-'}** |\n`;

  markdown += `
## Conclusion
This tracking establishes our Editor Elo Gap. Closing the gap between Current Production and Human Editor is the primary objective of all future modeling efforts.
`;

  fs.writeFileSync(path.join(workspaceRoot, 'EDITOR_ELO_HISTORY.md'), markdown);
  console.log('Generated EDITOR_ELO_HISTORY.md');
}

runEloProgressionAudit();
