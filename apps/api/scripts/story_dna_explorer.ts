import fs from 'fs';
import path from 'path';

function runExplorer() {
  console.log('Running Story DNA Explorer...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  const dnaPath = path.join(__dirname, 'story_dna_database.json');
  
  let database: any[] = [];
  if (fs.existsSync(dnaPath)) {
    database = JSON.parse(fs.readFileSync(dnaPath, 'utf8'));
  }

  // Example Query 1: All Late Winners
  const lateWinners = database.filter(d => d.story_archetype === 'late_game_winner');
  
  // Example Query 2: Highest Editor Score Stories
  const highestScores = [...database].sort((a, b) => b.editor_score - a.editor_score).slice(0, 5);

  let markdown = `# Story DNA Explorer

This tool allows the editorial team to query the structural components of the highest-performing football clips.

## Query: Late Winners
Found **${lateWinners.length}** samples.
Average Editor Score: ${(lateWinners.reduce((sum, d) => sum + d.editor_score, 0) / (lateWinners.length || 1)).toFixed(2)}

## Query: Top 5 Highest Editor Scores
`;

  highestScores.forEach((d, i) => {
    markdown += `### ${i+1}. Story ID: ${d.story_id}
- Archetype: \`${d.story_archetype}\`
- Tension Peak: ${d.tension_peak}
- Editor Score: **${d.editor_score}**
- Reactions: Crowd (${d.crowd_reaction}), Bench (${d.bench_reaction}), Player (${d.player_reaction})
- Context: ${d.pre_context}s pre / ${d.post_context}s post

`;
  });

  fs.writeFileSync(path.join(workspaceRoot, 'STORY_DNA_EXPLORER_RESULTS.md'), markdown);
  console.log('Generated STORY_DNA_EXPLORER_RESULTS.md');
}

runExplorer();
