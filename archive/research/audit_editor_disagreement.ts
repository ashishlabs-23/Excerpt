import fs from 'fs';
import path from 'path';

interface DatasetEntry {
  video_id: string;
  primary_story: string;
  why_editor_chose_this: string[];
  disagreement_category?: string[];
  opus: { story: string };
  excerpt: { story: string };
}

function runAudit() {
  console.log('Running Editor Disagreement Audit...');

  const datasetPath = path.join(__dirname, '..', 'datasets', 'football_story_gold_dataset', 'dataset.json');
  const data: DatasetEntry[] = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  let markdown = `# Editor Disagreement Report

Tracks exactly *why* Excerpt and Opus disagreed with the human editor, based on manual dataset annotations.

`;

  data.forEach((clip) => {
    const excerptMatch = clip.excerpt.story === clip.primary_story;
    const opusMatch = clip.opus.story === clip.primary_story;

    if (!excerptMatch || !opusMatch) {
      markdown += `### Video ID: ${clip.video_id}\n`;
      markdown += `- **Human Editor:** ${clip.primary_story}\n`;
      markdown += `- **Excerpt:** ${clip.excerpt.story}\n`;
      markdown += `- **Opus:** ${clip.opus.story}\n\n`;
      
      markdown += `**Why the Human Editor chose ${clip.primary_story}:**\n`;
      clip.why_editor_chose_this.forEach(reason => markdown += `- ${reason}\n`);
      markdown += '\n';

      if (!excerptMatch && clip.disagreement_category) {
        markdown += `**Disagreement Categories (Why Excerpt Lost):**\n`;
        clip.disagreement_category.forEach(reason => markdown += `- ${reason}\n`);
        markdown += '\n';
      }
      
      markdown += `---\n\n`;
    }
  });

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'EDITOR_DISAGREEMENT_REPORT.md'), markdown);
  
  console.log('Generated EDITOR_DISAGREEMENT_REPORT.md');
}

runAudit();
