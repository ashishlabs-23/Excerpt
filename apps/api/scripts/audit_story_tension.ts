import fs from 'fs';
import path from 'path';

function runAudit() {
  console.log('Running Story Tension Audit...');

  const clips = [
    {
      id: 'clip_101',
      tensionCurve: [
        { time: -15, value: 0.21 },
        { time: -10, value: 0.37 },
        { time: -5, value: 0.64 },
        { time: 0, value: 1.00 },
        { time: 5, value: 0.91 },
        { time: 10, value: 0.73 }
      ]
    },
    {
      id: 'clip_102',
      tensionCurve: [
        { time: -15, value: 0.10 },
        { time: -10, value: 0.15 },
        { time: -5, value: 0.20 },
        { time: 0, value: 0.95 },
        { time: 5, value: 0.85 },
        { time: 10, value: 0.50 }
      ]
    }
  ];

  let markdown = `# Story Tension Report

Visualizes second-by-second tension curves for clips and calculates \`tension_area\` and \`tension_growth_rate\`.

`;

  for (const clip of clips) {
    markdown += `## Clip ID: ${clip.id}\n`;
    markdown += `| Time (s) | Tension |\n|----------|---------|\n`;
    let tensionArea = 0;
    
    // Growth rate: difference between max tension and tension at -15s
    const startTension = clip.tensionCurve.find(p => p.time === -15)?.value || 0;
    const peakTension = Math.max(...clip.tensionCurve.map(p => p.value));
    const tensionGrowthRate = peakTension - startTension;

    for (const point of clip.tensionCurve) {
      markdown += `| ${point.time > 0 ? '+' : ''}${point.time} | ${point.value.toFixed(2)} |\n`;
      // Simplified area under curve (Riemann sum with width=5)
      tensionArea += point.value * 5;
    }

    markdown += `\n**Tension Area:** ${tensionArea.toFixed(2)}\n`;
    markdown += `**Tension Growth Rate:** +${tensionGrowthRate.toFixed(2)}\n\n`;
  }

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  fs.writeFileSync(path.join(workspaceRoot, 'STORY_TENSION_REPORT.md'), markdown);
  
  console.log('Generated STORY_TENSION_REPORT.md');
}

runAudit();
