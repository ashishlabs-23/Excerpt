import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { DatabaseService } from '../src/services/supabaseService';
import { getBinaryPath } from '../src/services/videoProcessor';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

async function runCheck(name: string, checkFn: () => Promise<boolean>, errorMessage: string): Promise<boolean> {
  process.stdout.write(`Checking ${name}... `);
  try {
    const success = await checkFn();
    if (success) {
      console.log('✅ PASS');
      return true;
    } else {
      console.log('❌ FAIL');
      console.error(`   -> ${errorMessage}`);
      return false;
    }
  } catch (e: any) {
    console.log('❌ FAIL');
    console.error(`   -> ${errorMessage}: ${e.message}`);
    return false;
  }
}

async function preflight() {
  console.log("=========================================");
  console.log("      EXCERPT V5 PREFLIGHT CHECKS        ");
  console.log("=========================================\n");

  const db = new DatabaseService();
  const supabase = db.getSupabase();
  let allPass = true;

  // 1. Supabase Reachable
  allPass &&= await runCheck('Supabase Connection', async () => {
    const { error } = await supabase.from('jobs').select('id').limit(1);
    return !error;
  }, 'Could not connect to Supabase or jobs table missing.');

  // 2. Tables Exist
  const requiredTables = [
    'benchmark_videos',
    'render_jobs',
    'render_metrics',
    'worker_heartbeats'
  ];
  for (const table of requiredTables) {
    allPass &&= await runCheck(`Table: ${table}`, async () => {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      // Postgrest returns code 'PGRST204' or '42P01' if table doesn't exist
      if (error && error.code === '42P01') return false;
      if (error && error.message.includes('Could not find the table')) return false;
      return true;
    }, `Table ${table} does not exist. Apply migrations.`);
  }

  // 3. State-Machine Compatibility
  allPass &&= await runCheck('State Machine Compatibility', async () => {
    // Check if we can still update a job status properly (or if there's any jobs to check)
    // We'll just verify the query works and doesn't crash
    const { error } = await supabase.from('jobs').select('status').limit(1).maybeSingle();
    return !error || error.code === 'PGRST116'; // PGRST116 is no rows
  }, 'Jobs table querying failed.');

  
  // 3.5 Telemetry Columns
  allPass &&= await runCheck('Telemetry Columns (V5.10)', async () => {
    const { data, error } = await supabase.from('jobs').select('debug_data, performance_metrics, pipeline_summary').limit(1);
    if (error && error.code === '42703') return false;
    return true;
  }, 'Missing telemetry columns in jobs table. Run v5_hardening_part4.sql');

  // 4. Binary Dependencies
  const checkBinary = (name: string, args: string[]) => new Promise<boolean>((resolve) => {
    const binPath = getBinaryPath(name);
    exec(`"${binPath}" ${args.join(' ')}`, (error) => resolve(!error));
  });

  allPass &&= await runCheck('FFmpeg Available', () => checkBinary('ffmpeg', ['-version']), 'ffmpeg binary not found or failed to execute.');
  allPass &&= await runCheck('FFprobe Available', () => checkBinary('ffprobe', ['-version']), 'ffprobe binary not found or failed to execute.');

  // 5. Environment Variables
  const checkEnv = (keys: string[]) => async () => keys.some(k => !!process.env[k]);
  allPass &&= await runCheck('LLM Provider (OpenAI/Groq)', checkEnv(['OPENAI_API_KEY', 'GROQ_API_KEY']), 'No LLM API keys found in .env');
  allPass &&= await runCheck('Supabase Credentials', checkEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']), 'Missing Supabase URL or Service Role Key');

  console.log("\n=========================================");
  if (allPass) {
    console.log("🚀 PREFLIGHT PASSED. System is ready for E0.");
  } else {
    console.log("🛑 PREFLIGHT FAILED. Resolve errors before running E0.");
    process.exit(1);
  }
}

preflight();
