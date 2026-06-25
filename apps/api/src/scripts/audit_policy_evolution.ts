import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Hardcoded legacy defaults for comparison
const LEGACY_DEFAULTS: Record<string, { pre: number, post: number }> = {
  'LateWinner': { pre: -15, post: 12 },
  'Comeback': { pre: -15, post: 12 },
  'GoalkeeperMasterclass': { pre: -8, post: 5 },
  'CrowdEruption': { pre: -6, post: 18 },
  'TacticalMasterclass': { pre: -20, post: 8 },
  'LastMinuteHeartbreak': { pre: -12, post: 15 },
  'Unknown': { pre: -5, post: 5 }
};

async function run() {
  console.log('Auditing Policy Evolution...');
  
  const { data: policies, error } = await supabase.from('boundary_policy_cache').select('*');
  
  if (error) {
    console.error('Failed to fetch policies:', error);
    return;
  }

  let markdown = `# Policy Evolution Report\n\n`;
  markdown += `This report tracks how the Boundary Learning Engine has evolved clipping policies away from hardcoded heuristics.\n\n`;
  markdown += `| Narrative | Default Policy | Learned Policy | Samples | Confidence | Status |\n`;
  markdown += `|-----------|----------------|----------------|---------|------------|--------|\n`;

  for (const policy of policies || []) {
    const legacy = LEGACY_DEFAULTS[policy.narrative_type] || LEGACY_DEFAULTS['Unknown'];
    const legacyStr = `${legacy.pre}/+${legacy.post}`;
    
    // Format the learned policy to display exactly what it is applying
    const learnedPre = -Math.abs(Math.round(policy.avg_pre_context * 10) / 10);
    const learnedPost = Math.round(policy.avg_post_context * 10) / 10;
    const learnedStr = `${learnedPre}/+${learnedPost}`;
    
    const isPromoted = policy.sample_count >= 20 ? 'Active' : 'Learning';

    markdown += `| ${policy.narrative_type} | ${legacyStr} | ${learnedStr} | ${policy.sample_count} | ${(policy.confidence * 100).toFixed(1)}% | ${isPromoted} |\n`;
  }

  // Also grab summary from boundary_failure_dataset
  const { data: failures } = await supabase.from('boundary_failure_dataset').select('publishability_before, publishability_after');
  
  if (failures && failures.length > 0) {
    const validFailures = failures.filter(f => f.publishability_before && f.publishability_after);
    if (validFailures.length > 0) {
      const avgBefore = validFailures.reduce((acc, f) => acc + f.publishability_before, 0) / validFailures.length;
      const avgAfter = validFailures.reduce((acc, f) => acc + f.publishability_after, 0) / validFailures.length;
      
      markdown += `\n## Quality Impact\n`;
      markdown += `- **Average Publishability (AI Default):** ${(avgBefore * 100).toFixed(1)}%\n`;
      markdown += `- **Average Publishability (Editor Corrected):** ${(avgAfter * 100).toFixed(1)}%\n`;
      markdown += `- **Net Gain:** ${((avgAfter - avgBefore) * 100).toFixed(1)}%\n`;
    }
  }

  const outPath = path.resolve(process.cwd(), 'POLICY_EVOLUTION_REPORT.md');
  fs.writeFileSync(outPath, markdown);
  console.log(`Report generated: ${outPath}`);
}

run().catch(console.error);
