/**
 * database_repair.ts
 * 
 * DB.1 Database Hardening Sprint — Nightly Self-Healing Job
 * 
 * Usage (manual):
 *   npx tsx apps/api/scripts/database_repair.ts
 * 
 * Usage (scheduled, e.g. via cron or Supabase pg_cron):
 *   0 3 * * * npx tsx apps/api/scripts/database_repair.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZOMBIE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

async function repairZombieJobs(): Promise<number> {
  const staleTimestamp = new Date(Date.now() - ZOMBIE_THRESHOLD_MS).toISOString();
  const { data, error } = await supabase
    .from('jobs')
    .update({
      status: 'queued',
      locked_by: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .in('status', ['processing', 'cutting', 'captioning', 'transcribing', 'detecting_clips'])
    .lt('updated_at', staleTimestamp)
    .select('id');
  if (error) {
    console.error('[Repair]: Zombie reclaim failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function purgeOrphanedClips(): Promise<number> {
  const { data: allClips } = await supabase.from('clips').select('id, job_id');
  const { data: allJobs } = await supabase.from('jobs').select('id');
  if (!allClips || !allJobs) return 0;

  const jobIdSet = new Set(allJobs.map((j: any) => j.id));
  const orphanIds = allClips
    .filter((c: any) => c.job_id && !jobIdSet.has(c.job_id))
    .map((c: any) => c.id);

  if (orphanIds.length === 0) return 0;

  const { error } = await supabase.from('clips').delete().in('id', orphanIds);
  if (error) {
    console.error('[Repair]: Orphaned clip purge failed:', error.message);
    return 0;
  }
  return orphanIds.length;
}

async function repairLegacyVideoUrls(): Promise<number> {
  // Find clips where video_url still contains a signed URL path
  // (should not happen after DB.1 migration, but safety net)
  const { data: legacyClips } = await supabase
    .from('clips')
    .select('id, video_url, thumbnail_url')
    .or('video_url.like.%/storage/v1/object/sign/%,thumbnail_url.like.%/storage/v1/object/sign/%');

  if (!legacyClips || legacyClips.length === 0) return 0;

  let repaired = 0;
  for (const clip of legacyClips) {
    const updates: Record<string, any> = {};
    
    if (clip.video_url?.includes('/storage/v1/object/sign/clips/')) {
      const match = clip.video_url.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
      if (match) {
        updates.storage_path = 'clips/' + decodeURIComponent(match[1]);
        updates.video_url = null;
      }
    }

    if (clip.thumbnail_url?.includes('/storage/v1/object/sign/clips/')) {
      const match = clip.thumbnail_url.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
      if (match) {
        updates.thumbnail_storage_path = 'clips/' + decodeURIComponent(match[1]);
        updates.thumbnail_url = null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('clips').update(updates).eq('id', clip.id);
      repaired++;
    }
  }
  return repaired;
}

async function run() {
  console.log(`\n🔧 Excerpt Database Repair Job — ${new Date().toISOString()}\n`);

  const zombiesReclaimed = await repairZombieJobs();
  console.log(`  🔄 Zombie jobs reclaimed: ${zombiesReclaimed}`);

  const orphansDeleted = await purgeOrphanedClips();
  console.log(`  🗑️  Orphaned clips purged: ${orphansDeleted}`);

  const legacyRepaired = await repairLegacyVideoUrls();
  console.log(`  🔗 Legacy signed URL clips repaired: ${legacyRepaired}`);

  console.log('\n✅ Database repair complete.\n');
}

run().catch(err => {
  console.error('Database repair job crashed:', err);
  process.exit(1);
});
