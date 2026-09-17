/**
 * test_database_integrity.ts
 * 
 * DB.1 Database Hardening Sprint — Integrity Test Suite
 * 
 * Usage:
 *   npx tsx apps/api/scripts/test_database_integrity.ts
 * 
 * Exit code 0 = all checks pass (safe to deploy)
 * Exit code 1 = one or more checks failed (deployment blocked)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storageService = {
  async canSign(storagePath: string): Promise<boolean> {
    try {
      let key = storagePath;
      if (key.startsWith('clips/')) key = key.slice('clips/'.length);
      const { data, error } = await supabase.storage.from('clips').createSignedUrl(key, 60);
      return !error && !!data?.signedUrl;
    } catch {
      return false;
    }
  }
};

type CheckResult = { name: string; passed: boolean; detail?: string };
const results: CheckResult[] = [];
let exitCode = 0;

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail });
  console.error(`  ❌ FAIL: ${name} — ${detail}`);
  exitCode = 1;
}

async function run() {
  console.log('\n🔍 Excerpt Database Integrity Test Suite (DB.1)\n');

  // ── JOBS CHECKS ────────────────────────────────────────────────
  console.log('── Jobs ──');

  const { data: nullStatusJobs } = await supabase
    .from('jobs')
    .select('id')
    .is('status', null);
  if ((nullStatusJobs?.length ?? 0) > 0)
    fail('No jobs with NULL status', `Found ${nullStatusJobs!.length} jobs with NULL status`);
  else
    pass('No jobs with NULL status');

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: zombieJobs } = await supabase
    .from('jobs')
    .select('id, status, updated_at')
    .in('status', ['processing', 'cutting', 'captioning', 'transcribing', 'detecting_clips'])
    .lt('updated_at', thirtyMinutesAgo);
  if ((zombieJobs?.length ?? 0) > 0)
    fail('No zombie jobs (stuck in processing > 30m)', `Found ${zombieJobs!.length} zombie jobs: ${zombieJobs!.map(j => j.id).join(', ')}`);
  else
    pass('No zombie jobs (stuck in processing > 30m)');

  // ── CLIPS CHECKS ───────────────────────────────────────────────
  console.log('\n── Clips ──');

  const { data: nullJobIdClips } = await supabase
    .from('clips')
    .select('id')
    .is('job_id', null);
  if ((nullJobIdClips?.length ?? 0) > 0)
    fail('No clips with NULL job_id', `Found ${nullJobIdClips!.length} clips missing job_id`);
  else
    pass('No clips with NULL job_id');

  // Orphaned clips: job_id exists in clips but not in jobs
  const { data: allClips } = await supabase.from('clips').select('id, job_id');
  const { data: allJobIds } = await supabase.from('jobs').select('id');
  const jobIdSet = new Set((allJobIds ?? []).map((j: any) => j.id));
  const orphanedClips = (allClips ?? []).filter((c: any) => c.job_id && !jobIdSet.has(c.job_id));
  if (orphanedClips.length > 0)
    fail('No orphaned clips (job_id not in jobs)', `Found ${orphanedClips.length} clips with no matching job: ${orphanedClips.map(c => c.id).join(', ')}`);
  else
    pass('No orphaned clips (job_id references valid job)');

  // Clips with no storage path AND no video_url
  const { data: noStorageClips } = await supabase
    .from('clips')
    .select('id')
    .is('storage_path', null)
    .is('video_url', null);
  if ((noStorageClips?.length ?? 0) > 0)
    fail('No clips missing both storage_path and video_url', `Found ${noStorageClips!.length} unrecoverable clips`);
  else
    pass('All clips have a recoverable storage reference');

  // Expired signed URL stored in video_url (the original bug)
  const { data: expiredUrlClips } = await supabase
    .from('clips')
    .select('id, video_url')
    .not('video_url', 'is', null)
    .like('video_url', '%/storage/v1/object/sign/%');
  if ((expiredUrlClips?.length ?? 0) > 0)
    fail('No expired signed URLs in video_url column', `Found ${expiredUrlClips!.length} clips with permanent signed URLs stored`);
  else
    pass('No expired signed URLs stored in video_url');

  // ── REFERENTIAL INTEGRITY ───────────────────────────────────────
  console.log('\n── Referential Integrity ──');

  // Completed jobs that produced zero clips
  const { data: completedJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'completed');
  const completedJobIds = (completedJobs ?? []).map((j: any) => j.id);
  const emptyCompletedJobs: string[] = [];
  for (const jobId of completedJobIds) {
    const { count } = await supabase
      .from('clips')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId);
    if ((count ?? 0) === 0) emptyCompletedJobs.push(jobId);
  }
  if (emptyCompletedJobs.length > 0)
    fail('No completed jobs with zero clips', `Found ${emptyCompletedJobs.length} completed jobs with no clips: ${emptyCompletedJobs.join(', ')}`);
  else
    pass('All completed jobs produced at least one clip');

  // ── STORAGE SPOT CHECK ─────────────────────────────────────────
  console.log('\n── Storage Spot Check ──');

  const { data: sampleClips } = await supabase
    .from('clips')
    .select('id, storage_path, video_url')
    .not('storage_path', 'is', null)
    .limit(5);

  if (!sampleClips || sampleClips.length === 0) {
    pass('Storage spot check (no clips with storage_path yet)');
  } else {
    const unreachable: string[] = [];
    for (const clip of sampleClips) {
      const reachable = await storageService.canSign(clip.storage_path);
      if (!reachable) unreachable.push(clip.id);
    }
    if (unreachable.length > 0)
      fail(`Storage spot check (5 random clips)`, `${unreachable.length} clips have unreachable storage paths: ${unreachable.join(', ')}`);
    else
      pass(`Storage spot check (${sampleClips.length} clips verified)`);
  }

  // ── SUMMARY ───────────────────────────────────────────────────
  console.log('\n── Summary ──');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`${passed} passed, ${failed} failed out of ${results.length} checks.`);
  
  if (exitCode === 0) {
    console.log('\n✅ All integrity checks passed. Safe to deploy.\n');
  } else {
    console.error('\n❌ Integrity checks FAILED. Deployment blocked.\n');
  }
  process.exit(exitCode);
}

run().catch(err => {
  console.error('Integrity test runner crashed:', err);
  process.exit(1);
});
