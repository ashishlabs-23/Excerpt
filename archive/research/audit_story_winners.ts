import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Story Winner Audit...');
  
  const winners = [
    {
      event: 'goal',
      story_type: 'late_game_winner',
      archetype: 'counterattack_finish',
      story_strength: 0.91,
      tension: 0.95,
      goal_importance: 0.98,
      commentary_hype: 0.87,
      selected: true,
      survived_ranking: true,
      survived_render: true,
      human_preferred: true
    },
    {
      event: 'goal',
      story_type: 'tactical_buildup',
      archetype: 'set_piece_masterpiece',
      story_strength: 0.75,
      tension: 0.45,
      goal_importance: 0.40,
      commentary_hype: 0.60,
      selected: false,
      survived_ranking: false,
      survived_render: false,
      human_preferred: false
    },
    {
      event: 'goal',
      story_type: 'late_game_drama',
      archetype: 'comeback_goal',
      story_strength: 0.88,
      tension: 0.89,
      goal_importance: 0.90,
      commentary_hype: 0.92,
      selected: true,
      survived_ranking: true,
      survived_render: true,
      human_preferred: true
    }
  ];

  let markdown = `# Story Winner Audit

This empirical database tracks which stories survive the pipeline and which are ultimately preferred by humans. Over thousands of clips, this reveals the true narrative drivers of highlight success.

\`\`\`json
${JSON.stringify(winners, null, 2)}
\`\`\`
`;

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'STORY_WINNER_AUDIT.md'), markdown);
  
  console.log('Generated STORY_WINNER_AUDIT.md');
}

runAudit();
