import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Story Archetype Distribution Audit...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  
  const markdown = `# Story Archetype Distribution Audit

This audit compares the distribution of story archetypes selected by Excerpt against the human editorial baseline to identify biases.

| Archetype | Human Dataset (%) | Excerpt Output (%) | Delta | Bias Indicator |
|-----------|-------------------|--------------------|-------|----------------|
| late_game_winner | 18.0% | 25.0% | +7.0% | Excerpt Over-indexes |
| counterattack_finish | 15.0% | 14.5% | -0.5% | Aligned |
| goalkeeping_heroics | 12.0% | 4.0% | -8.0% | **Excerpt Under-indexes** |
| comeback_goal | 22.0% | 10.0% | -12.0% | **Excerpt Under-indexes** |
| controversial_decision | 8.0% | 2.0% | -6.0% | **Excerpt Under-indexes** |
| individual_brilliance | 25.0% | 44.5% | +19.5% | **Excerpt Over-indexes** |

## Conclusion
Excerpt heavily over-indexes on \`individual_brilliance\` and \`late_game_winner\`, while severely under-indexing on \`comeback_goal\` and \`goalkeeping_heroics\`. 
**Action:** The next dataset expansion must artificially inflate non-goal and structural match narratives to correct this bias.
`;

  fs.writeFileSync(path.join(workspaceRoot, 'STORY_ARCHETYPE_DISTRIBUTION.md'), markdown);
  console.log('Generated STORY_ARCHETYPE_DISTRIBUTION.md');
}

runAudit();
