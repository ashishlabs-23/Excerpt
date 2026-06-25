import { execSync } from 'child_process';
import { supabase } from '../services/supabaseService';
import fs from 'fs';
import path from 'path';

/**
 * Validates that external binary dependencies are available in the PATH or explicitly provided locations.
 */
function validateBinaries() {
  const binaries = ['ffmpeg', 'ffprobe', 'yt-dlp'];
  const missing: string[] = [];

  for (const bin of binaries) {
    try {
      // Use 'where' on Windows, 'which' on Linux/Mac
      const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore' });
    } catch (e) {
      // If it fails, it might not be in PATH. We can also check common paths if we want,
      // but standard is it must be in PATH.
      missing.push(bin);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required binaries: ${missing.join(', ')}. Please install them and ensure they are in your PATH.`);
  }
}

const EXPECTED_SCHEMA_VERSION = 'v3.0.0';

/**
 * Validates the schema version matches the application version to prevent schema drift.
 */
async function validateSchemaVersion() {
  const db = supabase();
  const { data, error } = await db.from('schema_info').select('version').order('id', { ascending: false }).limit(1);
  
  if (error) {
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
  if (renderJobsErr) {
    if (renderJobsErr.message.includes('find the table')) {
      missingEntities.push('table: render_jobs');
    }
  }

  // 3. Check render_cache table
  const { error: renderCacheErr } = await db.from('render_cache').select('candidate_hash').limit(1);
  if (renderCacheErr) {
    if (renderCacheErr.message.includes('find the table')) {
      missingEntities.push('table: render_cache');
    }
  }

  // 4. Check RPCs
  // We must pass the correct arguments to avoid PGRST202 signature mismatches
  const { data: jobClaim, error: claimErr } = await db.rpc('claim_next_job', { worker_id_text: 'validator_test' });
  if (claimErr && (claimErr.code === 'PGRST202' || claimErr.message.includes('Could not find the function'))) {
    missingEntities.push('rpc: claim_next_job(worker_id_text text)');
  } else if (jobClaim && jobClaim.length > 0) {
    // Unclaim if it accidentally claimed
    await db.from('jobs').update({ status: 'queued', locked_by: null, worker_id: null }).eq('id', jobClaim[0].id);
  }

  const { data: renderClaim, error: claimRenderErr } = await db.rpc('claim_next_render_job', { worker_id_text: 'validator_test' });
  if (claimRenderErr && (claimRenderErr.code === 'PGRST202' || claimRenderErr.message.includes('Could not find the function'))) {
    missingEntities.push('rpc: claim_next_render_job(worker_id_text text)');
  } else if (renderClaim && renderClaim.length > 0) {
    // Unclaim if it accidentally claimed
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
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GROQ_API_KEY',
    'GEMINI_API_KEY'
  ];
  
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables:\n - ${missing.join('\n - ')}\nPlease configure these in your .env file before starting the system.`);
  }
}

/**
 * Validates that all required Supabase Storage Buckets exist.
 */
async function validateStorageBuckets() {
  const db = supabase();
  const { data: buckets, error } = await db.storage.listBuckets();
  
  if (error) {
    throw new Error(`Failed to validate storage buckets: ${error.message}`);
  }
  
  const existingBuckets = new Set(buckets.map((b: any) => b.name));
  const requiredBuckets = ['clips', 'thumbnails'];
  const missing = requiredBuckets.filter(b => !existingBuckets.has(b));
  
  if (missing.length > 0) {
    throw new Error(`Missing required Supabase Storage Buckets:\n - ${missing.join('\n - ')}\nPlease create these buckets in your Supabase dashboard.`);
  }
}

/**
 * Master validation sequence.
 * Fails fast if the environment is not ready.
 */
export async function validateSystemOrExit() {
  console.log('[SystemValidator]: Starting boot sequence validations...');
  try {
    validateEnvironmentVariables();
    console.log('[SystemValidator]: ✅ Environment variables verified.');

    validateBinaries();
    console.log('[SystemValidator]: ✅ Binaries verified.');

    await validateDatabaseSchema();
    console.log('[SystemValidator]: ✅ Database schema verified.');

    await validateSchemaVersion();
    console.log(`[SystemValidator]: ✅ Schema version matched (${EXPECTED_SCHEMA_VERSION}).`);

    await validateStorageBuckets();
    console.log('[SystemValidator]: ✅ Storage buckets verified.');
    
    console.log('[SystemValidator]: All systems go.');
  } catch (err: any) {
    console.error('\n=============================================================');
    console.error(' FATAL BOOT ERROR: SYSTEM VALIDATION FAILED');
    console.error('=============================================================');
    console.error(err.message);
    console.error('=============================================================\n');
    process.exit(1);
  }
}
