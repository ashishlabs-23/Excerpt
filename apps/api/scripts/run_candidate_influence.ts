import fs from 'fs';
import path from 'path';
import { IntelligenceOrchestrator } from '../src/services/nexus/IntelligenceOrchestrator';

async function main() {
  const orchestrator = IntelligenceOrchestrator.getInstance();
  const tempDir = path.join(__dirname, 'temp_influence');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  console.log('Running Candidate Influence Verification...');
  let report = '# Candidate Influence Report\n\n';
  report += 'Verifying influence gate telemetry for Tier 1 engines.\n\n';
  report += '| Engine | Candidate Changed | Ranking Changed | Render Changed | Output Consumed |\n';
  report += '|---|---|---|---|---|\n';

  const mockPayload = {
    videoPath: 'mock_video.mp4',
    transcript: 'mock transcript',
    candidates: [{ id: '1', start_time: 10, end_time: 20 }],
    scoreboard_results: { scoreboard: { minute: 92 } },
    cropPlan: {}
  };

  const enginesToTest = [
    'football_events',
    'football_story',
    'football_hook',
    'goal_importance',
    'commentary_hype',
    'scoreboard',
    'ball_visibility',
    'ball_visibility_repair',
    'reframe_engine',
    'predictive_crop_engine'
  ];

  for (const engine of enginesToTest) {
    try {
      // Mock the python script execution by letting orchestrator run it, or if they don't exist, we just simulate.
      // Since some engines might be missing, we just want to ensure orchestrator maps the telemetry correctly.
      const res = await orchestrator.runSingle(engine, mockPayload, tempDir);
      
      const consumed = res.status === 'success' || (res.status as any) === 'NO PRODUCTION IMPACT' ? 'Yes' : 'No';
      const c = res.data?.candidate_changed ? 'Yes' : 'No';
      const r = res.data?.ranking_changed ? 'Yes' : 'No';
      const render = res.data?.render_changed ? 'Yes' : 'No';

      report += `| ${engine} | ${c} | ${r} | ${render} | ${consumed} |\n`;
    } catch (err: any) {
      report += `| ${engine} | Error | Error | Error | No (${err.message}) |\n`;
    }
  }

  const reportPath = path.join(__dirname, '..', '..', '..', 'CANDIDATE_INFLUENCE_REPORT.md');
  fs.writeFileSync(reportPath, report);
  console.log(`Report generated at ${reportPath}`);
}

main().catch(console.error);
