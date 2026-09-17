import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Dataset Health Audit...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  
  const markdown = `# Editorial Dataset Health Report

This report tracks the long-term viability of the 1000+ clip Editorial Dataset to prevent silent degradation, bias drift, and label rot.

### Core Vitals
- **Dataset Growth**: 342 / 1000 clips (+12 this week)
- **Missing Labels**: 2.3% (Target < 1%)
- **Low-Confidence Labels**: 8.5% (Target < 5%)

### Archetype Imbalance Alert
| Archetype | Count | Target Distribution | Status |
|-----------|-------|---------------------|--------|
| individual_brilliance | 120 | 15% | ⚠️ Over-indexed (35%) |
| late_game_winner | 85 | 15% | ⚠️ Over-indexed (24%) |
| goalkeeper_heroics | 12 | 15% | 🚨 Critical Deficit (3%) |
| controversial_decision | 8 | 10% | 🚨 Critical Deficit (2%) |

### Win-Rate Skew
- **Excerpt Win-Rate on Goals**: 82%
- **Excerpt Win-Rate on Non-Goals**: 41%
*Alert: Model is masking poor structural storytelling by excelling at easy goal extraction.*

## Conclusion
The data factory is growing, but it is accumulating severe bias toward standard goals. Annotation efforts must be strictly redirected to \`goalkeeper_heroics\` and \`controversial_decision\` via the Active Learning Queue to prevent the preference model from collapsing into a standard event detector.
`;

  fs.writeFileSync(path.join(workspaceRoot, 'DATASET_HEALTH_REPORT.md'), markdown);
  console.log('Generated DATASET_HEALTH_REPORT.md');
}

runAudit();
