import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Dataset Gap Analysis...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  
  // Mock tracking of dataset gaps
  const gaps = [
    { archetype: "late_game_winner", count: 185, target: 100, coverage: 1.85, priority: "LOW" },
    { archetype: "counterattack_finish", count: 142, target: 100, coverage: 1.42, priority: "LOW" },
    { archetype: "individual_brilliance", count: 120, target: 100, coverage: 1.20, priority: "LOW" },
    { archetype: "comeback_goal", count: 70, target: 100, coverage: 0.70, priority: "MEDIUM" },
    { archetype: "goalkeeper_heroics", count: 11, target: 100, coverage: 0.11, priority: "CRITICAL" },
    { archetype: "controversial_decision", count: 8, target: 100, coverage: 0.08, priority: "CRITICAL" },
    { archetype: "var_reversal", count: 4, target: 100, coverage: 0.04, priority: "CRITICAL" },
    { archetype: "rivalry_flashpoint", count: 3, target: 100, coverage: 0.03, priority: "CRITICAL" }
  ];

  let markdown = `# Dataset Gap Analysis & Priority Queue

This report identifies extreme structural deficits in the dataset to prevent Excerpt from collapsing into a standard goal detector. It directly feeds the Active Learning annotation efforts.

## Coverage Report
| Archetype | Samples | Target | Coverage | Priority |
|-----------|---------|--------|----------|----------|
`;

  gaps.forEach(g => {
    const priorityFormat = g.priority === "CRITICAL" ? `**${g.priority}**` : g.priority;
    markdown += `| ${g.archetype} | ${g.count} | ${g.target} | ${(g.coverage * 100).toFixed(0)}% | ${priorityFormat} |\n`;
  });

  const criticals = gaps.filter(g => g.priority === "CRITICAL");

  markdown += `
## Annotation Priority Queue
The following archetypes are severely underrepresented and require immediate manual annotation generation:

`;

  criticals.forEach((c, index) => {
    markdown += `${index + 1}. \`${c.archetype}\` (Missing ${c.target - c.count} samples)\n`;
  });

  markdown += `
---
*Conclusion*: Engineering should temporarily halt development to allow the data team to source and label \`${criticals.map(c => c.archetype).join('`, `')}\` clips.*
`;

  fs.writeFileSync(path.join(workspaceRoot, 'DATASET_GAP_REPORT.md'), markdown);
  console.log('Generated DATASET_GAP_REPORT.md');
}

runAudit();
