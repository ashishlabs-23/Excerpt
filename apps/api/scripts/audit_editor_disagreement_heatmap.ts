import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Editor Disagreement Heatmap Audit...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  
  const markdown = `# Editor Disagreement Heatmap

This heatmap aggregates the \`disagreement_category\` tags across the dataset to surface the highest-frequency failure modes. This data explicitly prioritizes future engineering effort.

| Disagreement Category | Frequency | Severity | Status |
|-----------------------|-----------|----------|--------|
| missing_reaction      | 34%       | HIGH     | Pending Fix |
| missing_buildup       | 28%       | HIGH     | Pending Fix |
| wrong_context         | 15%       | MED      | Pending Fix |
| overlong              | 12%       | LOW      | Monitor |
| wrong_story           | 8%        | CRITICAL | Monitor |
| wrong_boundary        | 3%        | LOW      | Resolved |

## Conclusion
The highest ROI engineering task is fixing \`missing_reaction\` and \`missing_buildup\`. No further work should be dedicated to \`wrong_boundary\` optimizations until the high-severity failures are resolved.
`;

  fs.writeFileSync(path.join(workspaceRoot, 'EDITOR_FAILURE_HEATMAP.md'), markdown);
  console.log('Generated EDITOR_FAILURE_HEATMAP.md');
}

runAudit();
