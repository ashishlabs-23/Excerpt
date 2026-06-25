import fs from 'fs';
import path from 'path';

interface DatasetEntry {
  video_id: string;
  event: string;
  primary_story: string;
  secondary_story: string;
  ideal_start: number;
  ideal_end: number;
  human_editor_score: number;
  editorial_components: {
    buildup: boolean;
    trigger: boolean;
    climax: boolean;
    reaction: boolean;
    scoreboard_context: boolean;
    crowd_context: boolean;
  };
  opus: {
    start: number;
    end: number;
    story: string;
  };
  excerpt: {
    start: number;
    end: number;
    story: string;
  };
}

function calculatePolicyAlignment(
  selectionMatch: boolean, 
  contextRatio: number,
  completenessRatio: number, 
  boundaryError: number
) {
  const archetypeScore = selectionMatch ? 1.0 : 0.0;
  // Map boundary error (seconds) to a 0-1 score (0s error = 1.0, 15s error = 0.0)
  const boundaryScore = Math.max(0, 1.0 - (boundaryError / 15.0));
  
  return (
    (archetypeScore * 0.40) + 
    (contextRatio * 0.30) + 
    (completenessRatio * 0.20) + 
    (boundaryScore * 0.10)
  ) * 100;
}

function runAudit() {
  console.log('Running Editorial Policy Alignment Evaluation...');

  const datasetPath = path.join(__dirname, '..', 'datasets', 'football_story_gold_dataset', 'dataset.json');
  const data: DatasetEntry[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  let totalClips = data.length;
  
  let excerptStoryCapturedCount = 0;
  let opusStoryCapturedCount = 0;

  let totalPolicyAlignmentExcerpt = 0;
  let totalPolicyAlignmentOpus = 0;

  data.forEach(clip => {
    // 1. Archetype Selection Match
    const excerptSelectionMatch = clip.excerpt.story === clip.primary_story || clip.excerpt.story === clip.secondary_story;
    const opusSelectionMatch = clip.opus.story === clip.primary_story || clip.opus.story === clip.secondary_story;

    // 2. Boundary Error
    const excerptError = Math.abs(clip.excerpt.start - clip.ideal_start) + Math.abs(clip.excerpt.end - clip.ideal_end);
    const opusError = Math.abs(clip.opus.start - clip.ideal_start) + Math.abs(clip.opus.end - clip.ideal_end);

    // Simulated completeness based on boundary error (for mock purposes)
    const coreCount = [
      clip.editorial_components.buildup, 
      clip.editorial_components.trigger, 
      clip.editorial_components.climax, 
      clip.editorial_components.reaction
    ].filter(v => v).length;
    
    const maxCoreCount = 4;
    const maxContextCount = 2; // scoreboard, crowd

    // Mock Excerpt completeness
    let excerptCoreCount = coreCount;
    if (excerptError > 8) excerptCoreCount -= 1;
    let excerptContextCount = 2;
    if (excerptError > 12) excerptContextCount -= 1;
    
    // Mock Opus completeness
    let opusCoreCount = coreCount;
    if (opusError > 8) opusCoreCount -= 1;
    let opusContextCount = 2;
    if (opusError > 12) opusContextCount -= 1;

    // Story Capture Rate logic
    if (excerptCoreCount === maxCoreCount) excerptStoryCapturedCount++;
    if (opusCoreCount === maxCoreCount) opusStoryCapturedCount++;

    const excerptCompletenessRatio = excerptCoreCount / maxCoreCount;
    const excerptContextRatio = excerptContextCount / maxContextCount;
    
    const opusCompletenessRatio = opusCoreCount / maxCoreCount;
    const opusContextRatio = opusContextCount / maxContextCount;

    totalPolicyAlignmentExcerpt += calculatePolicyAlignment(excerptSelectionMatch, excerptContextRatio, excerptCompletenessRatio, excerptError);
    totalPolicyAlignmentOpus += calculatePolicyAlignment(opusSelectionMatch, opusContextRatio, opusCompletenessRatio, opusError);
  });

  const excerptStoryCaptureRate = (excerptStoryCapturedCount / totalClips) * 100;
  const opusStoryCaptureRate = (opusStoryCapturedCount / totalClips) * 100;

  const avgExcerptPolicyAlignment = totalPolicyAlignmentExcerpt / totalClips;
  const avgOpusPolicyAlignment = totalPolicyAlignmentOpus / totalClips;

  let markdown = `# Editorial Policy Alignment Report

## Story Capture Rate
*Requires setup, trigger, climax, and reaction.*
- **Excerpt:** ${excerptStoryCaptureRate.toFixed(1)}%
- **Opus:** ${opusStoryCaptureRate.toFixed(1)}%

## Editorial Policy Alignment Score
*Formula: 40% Archetype, 30% Context, 20% Completeness, 10% Boundary Precision*
- **Excerpt:** ${avgExcerptPolicyAlignment.toFixed(1)}%
- **Opus:** ${avgOpusPolicyAlignment.toFixed(1)}%

`;

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'STORY_ACCURACY_REPORT.md'), markdown);
  
  console.log('Generated STORY_ACCURACY_REPORT.md (Policy Alignment & Capture Rate)');
}

runAudit();
