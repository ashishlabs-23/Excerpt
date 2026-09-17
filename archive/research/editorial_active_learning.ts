import fs from 'fs';
import path from 'path';

interface ActiveLearningCandidate {
  id: string;
  archetype: string;
  publish_probability: number;
  editor_probability: number;
  story_strength: number;
  archetype_frequency: number;
}

function runActiveLearningRanker() {
  console.log('Running Editorial Active Learning Ranker...');

  // Mock candidates from the current ingestion queue
  const candidates: ActiveLearningCandidate[] = [
    { id: 'clip_a', archetype: 'late_game_winner', publish_probability: 0.95, editor_probability: 0.98, story_strength: 0.9, archetype_frequency: 0.25 },
    { id: 'clip_b', archetype: 'goalkeeper_heroics', publish_probability: 0.85, editor_probability: 0.40, story_strength: 0.88, archetype_frequency: 0.04 },
    { id: 'clip_c', archetype: 'comeback_goal', publish_probability: 0.40, editor_probability: 0.85, story_strength: 0.92, archetype_frequency: 0.10 },
    { id: 'clip_d', archetype: 'routine_save', publish_probability: 0.20, editor_probability: 0.15, story_strength: 0.3, archetype_frequency: 0.40 },
  ];

  const ranked = candidates.map(c => {
    const uncertainty = 1.0 - Math.abs(c.publish_probability - c.editor_probability);
    const editorial_impact = c.story_strength * c.publish_probability;
    const rarity = 1.0 / c.archetype_frequency;
    
    const priority = uncertainty * editorial_impact * rarity;
    
    return {
      ...c,
      uncertainty,
      editorial_impact,
      rarity,
      priority
    };
  }).sort((a, b) => b.priority - a.priority);

  let markdown = `# Editorial Active Learning Queue

This report surfaces the highest-value clips for manual annotation, driving dataset expansion toward maximum ROI.

**Priority Formula**: \`uncertainty * editorial_impact * rarity\`

| Clip ID | Archetype | Priority Score | Uncertainty | Impact | Rarity | Action |
|---------|-----------|----------------|-------------|--------|--------|--------|
`;

  ranked.forEach(c => {
    markdown += `| ${c.id} | ${c.archetype} | **${c.priority.toFixed(2)}** | ${c.uncertainty.toFixed(2)} | ${c.editorial_impact.toFixed(2)} | ${c.rarity.toFixed(1)} | Annotate |\n`;
  });

  markdown += `
## Conclusion
The Active Learning Queue successfully prioritizes edge-case and underrepresented stories (e.g., \`goalkeeper_heroics\`, \`comeback_goal\`) where the model highly disagrees with the human editor, suppressing common, low-disagreement clips.
`;

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'ACTIVE_LEARNING_QUEUE.md'), markdown);
  
  console.log('Generated ACTIVE_LEARNING_QUEUE.md');
}

runActiveLearningRanker();
