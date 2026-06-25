import { config } from 'dotenv';
import { resolve, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load env
config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const REAL_USER_ID = '42b14a82-8ab3-424d-bee7-a4475074a987';
const ACTIVE_JOB_ID = 'ce076f83-22c1-4447-85e5-0c38a0e9936e';
const OUT_DIR = process.argv[2] || process.cwd();

// --- STATE ---
let jobCompletedAt: number | null = null;
let lastProgress = -1;
let stallCount = 0;
let stopMonitoring = false;

// Helpers to write to Markdown
function appendMd(filename: string, content: string) {
  const filepath = join(OUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, `# ${filename.replace('.md', '')}\n\n`);
  }
  fs.appendFileSync(filepath, content + '\n');
}

async function auditAPI() {
  const start = Date.now();
  try {
    const res = await fetch(`http://localhost:8010/api/video/status/${ACTIVE_JOB_ID}`, {
      headers: { Authorization: `Bearer excerpt-local-dev-token-2026` }
    });
    const dur = Date.now() - start;
    appendMd('API_HEALTH_REPORT.md', `- [${new Date().toISOString()}] GET /status -> ${res.status} (${dur}ms)`);
  } catch (err: any) {
    appendMd('API_HEALTH_REPORT.md', `- [${new Date().toISOString()}] GET /status -> ERROR: ${err.message}`);
  }
}

async function auditJob() {
  const { data: job, error } = await supabase.from('jobs').select('*').eq('id', ACTIVE_JOB_ID).single();
  if (error || !job) {
    appendMd('JOB_TIMELINE_REPORT.md', `- Error fetching job: ${error?.message || 'Not found'}`);
    return;
  }

  appendMd('JOB_TIMELINE_REPORT.md', `- [${new Date().toISOString()}] Status: **${job.status}** | Progress: ${job.progress}% | Worker: ${job.worker_id || 'None'}`);

  if (job.progress === lastProgress && !['completed', 'failed'].includes(job.status)) {
    stallCount++;
    if (stallCount >= 20) { // 20 * 15s = 5 mins
      appendMd('JOB_TIMELINE_REPORT.md', `> [!WARNING]\n> STALL DETECTED: Job stuck at ${job.progress}% for > 5 minutes.`);
    }
  } else {
    stallCount = 0;
    lastProgress = job.progress;
  }

  if (['completed', 'failed', 'dead_letter'].includes(job.status)) {
    if (!jobCompletedAt) {
      jobCompletedAt = Date.now();
      appendMd('JOB_TIMELINE_REPORT.md', `\n## Job Reached Terminal State: ${job.status}\nStarting 15-minute cooldown observation...`);
      
      // Perform one-time post-completion audits
      await auditFootballQuality();
      await auditCost(job);
    }
  }
}

async function auditDatabase() {
  // Check for zombies (processing but old)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60000).toISOString();
  const { data: zombies } = await supabase.from('jobs')
    .select('id')
    .in('status', ['processing', 'detecting_clips'])
    .lt('updated_at', fiveMinsAgo);
  
  if (zombies && zombies.length > 0) {
    appendMd('DATABASE_HEALTH_REPORT.md', `- [${new Date().toISOString()}] 🧟 Found ${zombies.length} Zombie Jobs.`);
  }

  // Check clips
  const { count: clipsCount } = await supabase.from('clips').select('*', { count: 'exact', head: true }).eq('job_id', ACTIVE_JOB_ID);
  appendMd('DATABASE_HEALTH_REPORT.md', `- [${new Date().toISOString()}] Clips in DB for active job: ${clipsCount || 0}`);
}

async function auditQueueAndCache() {
  const { data: queued } = await supabase.from('jobs').select('id').eq('status', 'queued');
  appendMd('QUEUE_HEALTH_REPORT.md', `- [${new Date().toISOString()}] Queued jobs: ${queued?.length || 0}`);

  // We can't strictly read memory cache from here, but we can infer from logs or job states.
  appendMd('CACHE_EFFECTIVENESS_REPORT.md', `- [${new Date().toISOString()}] Cache poll completed.`);
}

async function auditFootballQuality() {
  const { data: clips } = await supabase.from('clips').select('*').eq('job_id', ACTIVE_JOB_ID);
  if (!clips) return;

  appendMd('FOOTBALL_QUALITY_SCORECARD.md', `## Quality Audit for Job ${ACTIVE_JOB_ID}\n`);
  appendMd('EDITOR_REVIEW_REPORT.md', `## Editorial Audit for Job ${ACTIVE_JOB_ID}\n`);

  for (const clip of clips) {
    const nexus = clip.nexus_metadata || {};
    const score = clip.clip_score || 0;
    
    appendMd('FOOTBALL_QUALITY_SCORECARD.md', `### Clip: ${clip.title}
- Start at possession: ${nexus.has_buildup ? 'Yes' : 'No'} (20 pts)
- Chance creation: ${nexus.has_chance ? 'Yes' : 'No'} (20 pts)
- Outcome included: ${nexus.has_outcome ? 'Yes' : 'No'} (20 pts)
- Celebration/Reaction: ${nexus.has_reaction ? 'Yes' : 'No'} (20 pts)
- Replay: ${nexus.has_replay ? 'Yes' : 'No'} (20 pts)
**Total System Score**: ${score}
    `);

    appendMd('EDITOR_REVIEW_REPORT.md', `### Clip: ${clip.title}
- Did it start before attack? ${nexus.has_buildup ? '✅' : '❌'}
- Included Replay? ${nexus.has_replay ? '✅' : '❌'}
- Human Editor Publishable? ${score > 80 ? '✅ YES' : '❌ NO'}
    `);
  }
}

async function auditCost(job: any) {
  const debug = job.debug_data || {};
  appendMd('COST_BREAKDOWN_REPORT.md', `## Cost Audit\n`);
  appendMd('COST_BREAKDOWN_REPORT.md', `- Pipeline Summary: ${JSON.stringify(job.pipeline_summary)}`);
  appendMd('COST_BREAKDOWN_REPORT.md', `- Total Execution Time: ${job.totalExecutionTimeMs}ms`);
}

async function mainLoop() {
  console.log('Starting Unified Auditor...');
  const MAX_RUNTIME = 90 * 60000;
  const startTime = Date.now();

  while (!stopMonitoring) {
    const now = Date.now();
    if (now - startTime > MAX_RUNTIME) {
      console.log('Max runtime exceeded.');
      break;
    }

    if (jobCompletedAt && (now - jobCompletedAt > 15 * 60000)) {
      console.log('15 minute cooldown complete. Auto-stopping.');
      break;
    }

    await Promise.all([
      auditJob(),
      auditAPI(),
      auditDatabase(),
      auditQueueAndCache()
    ]);

    // Poll every 15 seconds
    await new Promise(r => setTimeout(r, 15000));
  }
}

mainLoop();
