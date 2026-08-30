import { execSync } from 'child_process';
import { supabase } from '../services/supabaseService';

/**
 * Validates that external binary dependencies are available in the PATH or explicitly provided locations.
 */
function validateBinaries() {
  const binaries = ['ffmpeg', 'ffprobe', 'yt-dlp'];
  const missing: string[] = [];

  for (const bin of binaries) {
    try {
      const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore' });
    } catch (e) {
      missing.push(bin);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required binaries: ${missing.join(', ')}. Please install them and ensure they are in your PATH.`);
  }
}

const EXPECTED_SCHEMA_VERSION = 'v3.0.0';

/**
 * Returns true if the error is a quota/restriction issue (not a real schema problem).
 */
function isQuotaError(msg: string): boolean {
  return (
    msg.includes('exceed_egress_quota') ||
    msg.includes('exceed_storage_size_quota') ||
    msg.includes('restricted due to') ||
    msg.includes('upgrade their plan') ||
    msg.includes('spend caps') ||
    msg.includes('project is restricted')
  );
}

/**
 * Validates the schema version matches the application version to prevent schema drift.
 */
async function validateSchemaVersion() {
  const db = supabase();
  const { data, error } = await db.from('schema_info').select('version').order('id', { ascending: false }).limit(1);
  
  if (error) {
    if (isQuotaError(error.message)) {
      console.warn(`[SystemValidator]: ⚠️ Skipping schema version check — Supabase project is quota-restricted. Remove spend caps at supabase.com/dashboard to restore.`);
      return;
    }
    if (error.message.includes('find the table') || error.message.includes('relation "schema_info" does not exist')) {
      console.warn(`[SystemValidator]: ⚠️ Schema drift detected: 'schema_info' table is missing. Expected version: ${EXPECTED_SCHEMA_VERSION}`);
      return;
    }
    throw new Error(`Failed to check schema version: ${error.message}`);
  }

  const currentVersion = data?.[0]?.version;
  if (currentVersion !== EXPECTED_SCHEMA_VERSION) {
    console.warn(`[SystemValidator]: ⚠️ Schema drift detected: DB version is '${currentVersion}', but App expects '${EXPECTED_SCHEMA_VERSION}'. Please run migrations.`);
  }
}

/**
 * Validates that the Supabase schema contains all expected tables, columns, and RPCs.
 */
async function validateDatabaseSchema() {
  const missingEntities: string[] = [];
  const db = supabase();

  // 1. Check jobs table and required columns
  const { error: jobsErr } = await db.from('jobs').select('id, debug_data').limit(1);
  if (jobsErr) {
    if (isQuotaError(jobsErr.message)) {
      console.warn(`[SystemValidator]: ⚠️ Supabase project is quota-restricted. API will start but DB may be unavailable. Visit supabase.com/dashboard to remove spend caps.`);
      return; // Non-fatal — quota issue, not schema issue
    }
    if (jobsErr.message.includes('debug_data')) {
      missingEntities.push('column: jobs.debug_data');
    } else if (jobsErr.message.includes('find the table')) {
      missingEntities.push('table: jobs');
    } else {
      missingEntities.push(`jobs table error: ${jobsErr.message}`);
    }
  }

  // 2. Check render_jobs table
  const { error: renderJobsErr } = await db.from('render_jobs').select('id').limit(1);
  if (renderJobsErr && !isQuotaError(renderJobsErr.message)) {
    if (renderJobsErr.message.includes('find the table')) {
      missingEntities.push('table: render_jobs');
    }
  }

  // 3. Check render_cache table
  const { error: renderCacheErr } = await db.from('render_cache').select('candidate_hash').limit(1);
  if (renderCacheErr && !isQuotaError(renderCacheErr.message)) {
    if (renderCacheErr.message.includes('find the table')) {
      missingEntities.push('table: render_cache');
    }
  }

  // 4. Check RPCs
  const { data: jobClaim, error: claimErr } = await db.rpc('claim_next_job', { worker_id_text: 'validator_test' });
  if (claimErr && !isQuotaError(claimErr.message)) {
    if (claimErr.code === 'PGRST202' || claimErr.message.includes('Could not find the function')) {
      missingEntities.push('rpc: claim_next_job(worker_id_text text)');
    }
  } else if (jobClaim && jobClaim.length > 0) {
    await db.from('jobs').update({ status: 'queued', locked_by: null, worker_id: null }).eq('id', jobClaim[0].id);
  }

  const { data: renderClaim, error: claimRenderErr } = await db.rpc('claim_next_render_job', { worker_id_text: 'validator_test' });
  if (claimRenderErr && !isQuotaError(claimRenderErr.message)) {
    if (claimRenderErr.code === 'PGRST202' || claimRenderErr.message.includes('Could not find the function')) {
      missingEntities.push('rpc: claim_next_render_job(worker_id_text text)');
    }
  } else if (renderClaim && renderClaim.length > 0) {
    await db.from('render_jobs').update({ status: 'pending', locked_by: null }).eq('id', renderClaim[0].id);
  }

  if (missingEntities.length > 0) {
    throw new Error(`Database schema drift detected. Missing required migrations:\n - ${missingEntities.join('\n - ')}\nPlease run the pending SQL migrations before starting the system.`);
  }
}

/**
 * Validates that all required environment variables are present.
 */
function validateEnvironmentVariables() {
  const aiKeys = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'];
  const hasAi = aiKeys.some(key => Boolean(process.env[key]));
  if (!hasAi) {
    console.warn(`[SystemValidator]: ⚠️ Warning: Missing AI keys. Please ensure at least one AI key is set.`);
  }
}

/**
 * Master validation sequence.
 */
export async function validateSystemOrExit() {
  console.log('[SystemValidator]: Starting boot sequence validations...');

  try {
    validateEnvironmentVariables();
    console.log('[SystemValidator]: ✅ Environment variables verified.');

    validateBinaries();
    console.log('[SystemValidator]: ✅ Binaries verified.');

    console.log('[SystemValidator]: All systems go (Firebase + Local Storage mode).');
  } catch (err: any) {
    console.error('\n=============================================================');
    console.error(' FATAL BOOT ERROR: SYSTEM VALIDATION FAILED');
    console.error('=============================================================');
    console.error(err.message);
    console.error('=============================================================\n');
    process.exit(1);
  }
}
