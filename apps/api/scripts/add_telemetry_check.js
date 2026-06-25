const fs = require('fs');
const preflightPath = 'apps/api/scripts/preflight.ts';
let content = fs.readFileSync(preflightPath, 'utf8');

const telemetryCheck = `
  // 3.5 Telemetry Columns
  allPass &&= await runCheck('Telemetry Columns (V5.10)', async () => {
    const { data, error } = await supabase.from('jobs').select('debug_data, performance_metrics, pipeline_summary').limit(1);
    if (error && error.code === '42703') return false;
    return true;
  }, 'Missing telemetry columns in jobs table. Run v5_hardening_part4.sql');
`;

content = content.replace('// 4. Binary Dependencies', telemetryCheck + '\n  // 4. Binary Dependencies');

fs.writeFileSync(preflightPath, content, 'utf8');
console.log('Added telemetry check to preflight');
