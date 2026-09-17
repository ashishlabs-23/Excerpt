import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log('Auditing Narrative Coverage & Annotation Priorities...');
  
  const { data: corrections, error } = await supabase.from('boundary_failure_dataset').select('story_type, failure_type, severity, start_delta, end_delta');
  
  if (error || !corrections) {
    console.error('Failed to fetch boundary dataset:', error);
    return;
  }

  // Aggregate stats per narrative
  const stats: Record<string, { count: number, failureRates: number, totalDisagreementSecs: number }> = {};
  
  for (const c of corrections) {
    if (!stats[c.story_type]) stats[c.story_type] = { count: 0, failureRates: 0, totalDisagreementSecs: 0 };
    stats[c.story_type].count++;
    
    // Treat moderate or critical severity as a hard failure
    if (c.severity === 'critical' || c.severity === 'moderate') {
      stats[c.story_type].failureRates++;
    }
    
    stats[c.story_type].totalDisagreementSecs += Math.abs(c.start_delta) + Math.abs(c.end_delta);
  }

  let markdown = `# Narrative Coverage & Annotation Priority\n\n`;
  markdown += `This report identifies blind spots in editorial annotation and dynamically scores which narratives the Editor team should focus on next.\n\n`;

  markdown += `| Narrative | Annotated Samples | Failure Rate | Avg Disagreement | Priority Score |\n`;
  markdown += `|-----------|-------------------|--------------|------------------|----------------|\n`;

  // Assume ideal target sample count is 500 for a fully learned policy
  const TARGET_SAMPLES = 500;

  type ReportRow = { narrative: string, samples: number, failureRate: string, avgDisagreement: string, priority: number };
  const rows: ReportRow[] = [];

  for (const [narrative, data] of Object.entries(stats)) {
    const failureRate = data.count > 0 ? data.failureRates / data.count : 0;
    const avgDisagreement = data.count > 0 ? data.totalDisagreementSecs / data.count : 0;
    
    const coverageGap = Math.max(0, TARGET_SAMPLES - data.count) / TARGET_SAMPLES;
    
    // Annotation Priority Score = coverage_gap * failure_rate * editor_disagreement
    // Normalize disagreement (assume max 20s = 1.0)
    const normalizedDisagreement = Math.min(1.0, avgDisagreement / 20.0);
    const rawPriority = coverageGap * failureRate * normalizedDisagreement;
    
    // Scale 0-100
    const priorityScore = Math.round(rawPriority * 1000); // multiplied a bit extra for readability

    rows.push({
      narrative,
      samples: data.count,
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      avgDisagreement: `${avgDisagreement.toFixed(1)}s`,
      priority: priorityScore
    });
  }

  rows.sort((a, b) => b.priority - a.priority);

  for (const r of rows) {
    markdown += `| **${r.narrative}** | ${r.samples} | ${r.failureRate} | ${r.avgDisagreement} | **${r.priority}** |\n`;
  }

  markdown += `\n> **Action Item:** Instruct the editorial team to specifically target narratives with high Priority Scores in their daily annotation queue to rapidly close learning gaps.\n`;

  const outPath = path.resolve(process.cwd(), 'NARRATIVE_COVERAGE_REPORT.md');
  fs.writeFileSync(outPath, markdown);
  console.log(`Report generated: ${outPath}`);
}

run().catch(console.error);
