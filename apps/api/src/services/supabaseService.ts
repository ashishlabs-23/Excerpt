import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageService } from './storageService';
import { firebaseDb } from './firebaseService';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';


/**
 * Lazy Supabase client — initializes on first use, 
 * so dotenv has time to load the environment variables.
 */
let _supabase: SupabaseClient | null = null;

const inMemoryDb: Record<string, any[]> = {
  jobs: [],
  clips: [],
  render_jobs: [],
  schema_info: [{ version: 'v3.0.0' }],
};

function createLocalSupabaseDriver(): any {
  const getQueueFilePath = () => {
    const dir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'active_queue.json');
  };

  const readDb = (): Record<string, any[]> => {
    try {
      const p = getQueueFilePath();
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : Object.values(parsed.jobs || {}),
          clips: Array.isArray(parsed.clips) ? parsed.clips : Object.values(parsed.clips || {}),
          render_jobs: Array.isArray(parsed.render_jobs) ? parsed.render_jobs : Object.values(parsed.render_jobs || {}),
          schema_info: [{ version: 'v3.0.0' }],
        };
      }
    } catch {}
    return { jobs: [], clips: [], render_jobs: [], schema_info: [{ version: 'v3.0.0' }] };
  };

  const writeDb = (data: Record<string, any[]>) => {
    try {
      const p = getQueueFilePath();
      const current = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { jobs: {}, clips: {}, render_jobs: {} };
      if (data.jobs) {
        if (!current.jobs || Array.isArray(current.jobs)) current.jobs = {};
        for (const j of data.jobs) {
          if (j && j.id) current.jobs[j.id] = { ...(current.jobs[j.id] || {}), ...j };
        }
      }
      if (data.clips) {
        if (!current.clips || Array.isArray(current.clips)) current.clips = {};
        for (const c of data.clips) {
          if (c && c.id) current.clips[c.id] = { ...(current.clips[c.id] || {}), ...c };
        }
      }
      if (data.render_jobs) {
        current.render_jobs = data.render_jobs;
      }
      const tmp = `${p}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, p);
      } catch {
        fs.writeFileSync(p, JSON.stringify(current, null, 2), 'utf8');
        try { fs.unlinkSync(tmp); } catch {}
      }
    } catch {}
  };

  return {
    from: (table: string) => {
      const db = readDb();
      if (!db[table]) db[table] = [];
      let rows: any[] = [...(db[table] || [])];

      const builder: any = {
        select: (cols = '*') => builder,
        eq: (col: string, val: any) => {
          rows = rows.filter(r => r[col] === val);
          return builder;
        },
        neq: (col: string, val: any) => {
          rows = rows.filter(r => r[col] !== val);
          return builder;
        },
        is: (col: string, val: any) => {
          rows = rows.filter(r => r[col] === val || (val === null && (r[col] === null || r[col] === undefined)));
          return builder;
        },
        in: (col: string, vals: any[]) => {
          rows = rows.filter(r => vals.includes(r[col]));
          return builder;
        },
        match: (criteria: Record<string, any>) => {
          rows = rows.filter(r => Object.entries(criteria).every(([k, v]) => r[k] === v));
          return builder;
        },
        gte: (col: string, val: any) => {
          rows = rows.filter(r => r[col] >= val);
          return builder;
        },
        gt: (col: string, val: any) => {
          rows = rows.filter(r => r[col] > val);
          return builder;
        },
        lte: (col: string, val: any) => {
          rows = rows.filter(r => r[col] <= val);
          return builder;
        },
        lt: (col: string, val: any) => {
          rows = rows.filter(r => r[col] < val);
          return builder;
        },
        or: () => builder,
        order: (col: string, opts?: any) => {
          rows.sort((a, b) => {
            const valA = a[col] ?? '';
            const valB = b[col] ?? '';
            return opts?.ascending === false ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
          });
          return builder;
        },
        limit: (n: number) => {
          rows = rows.slice(0, n);
          return builder;
        },
        single: async () => ({ data: rows[0] || null, error: null }),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        insert: (data: any) => {
          const toInsert = Array.isArray(data) ? data : [data];
          const enriched = toInsert.map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            createdAt: item.createdAt || new Date().toISOString(),
            ...item
          }));
          db[table] = [...(db[table] || []), ...enriched];
          writeDb(db);
          return {
            select: () => ({
              single: async () => ({ data: enriched[0], error: null }),
              maybeSingle: async () => ({ data: enriched[0], error: null }),
              then: (resolve: any) => resolve({ data: Array.isArray(data) ? enriched : enriched[0], error: null })
            }),
            then: (resolve: any) => resolve({ data: Array.isArray(data) ? enriched : enriched[0], error: null })
          };
        },
        upsert: (data: any, opts?: any) => {
          const items = Array.isArray(data) ? data : [data];
          const conflictKey = opts?.onConflict || 'id';
          const current = db[table] || [];
          for (const item of items) {
            const idx = current.findIndex((c: any) => c[conflictKey] === item[conflictKey]);
            if (idx >= 0) {
              current[idx] = { ...current[idx], ...item };
            } else {
              current.push(item);
            }
          }
          db[table] = current;
          writeDb(db);
          return {
            then: (resolve: any) => resolve({ data: items, error: null })
          };
        },
        update: (updates: any) => {
          const predicates: Array<(r: any) => boolean> = [];

          const executeUpdate = () => {
            let affected: any[] = [];
            db[table] = (db[table] || []).map((r: any) => {
              const match = predicates.length === 0 || predicates.every(p => p(r));
              if (match) {
                const updatedRow = { ...r, ...updates };
                affected.push(updatedRow);
                return updatedRow;
              }
              return r;
            });
            writeDb(db);
            return affected;
          };

          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              predicates.push(r => r[col] === val);
              return updateBuilder;
            },
            neq: (col: string, val: any) => {
              predicates.push(r => r[col] !== val);
              return updateBuilder;
            },
            is: (col: string, val: any) => {
              predicates.push(r => r[col] === val || (val === null && (r[col] === null || r[col] === undefined)));
              return updateBuilder;
            },
            in: (col: string, vals: any[]) => {
              predicates.push(r => vals.includes(r[col]));
              return updateBuilder;
            },
            lt: (col: string, val: any) => {
              predicates.push(r => r[col] < val);
              return updateBuilder;
            },
            lte: (col: string, val: any) => {
              predicates.push(r => r[col] <= val);
              return updateBuilder;
            },
            gt: (col: string, val: any) => {
              predicates.push(r => r[col] > val);
              return updateBuilder;
            },
            gte: (col: string, val: any) => {
              predicates.push(r => r[col] >= val);
              return updateBuilder;
            },
            or: () => updateBuilder,
            select: (cols = '*') => {
              const rows = executeUpdate();
              return {
                single: async () => ({ data: rows[0] || null, error: null }),
                maybeSingle: async () => ({ data: rows[0] || null, error: null }),
                then: (resolve: any) => resolve({ data: rows, error: null })
              };
            },
            then: (resolve: any) => {
              const rows = executeUpdate();
              resolve({ data: rows, error: null });
            }
          };
          return updateBuilder;
        },
        delete: () => ({
          eq: async (col: string, val: any) => {
            db[table] = (db[table] || []).filter((r: any) => r[col] !== val);
            writeDb(db);
            return { error: null };
          },
          in: async (col: string, vals: any[]) => {
            db[table] = (db[table] || []).filter((r: any) => !vals.includes(r[col]));
            writeDb(db);
            return { error: null };
          }
        }),
        then: (resolve: any) => resolve({ data: rows, error: null })
      };
      return builder;
    },
    rpc: async (fn: string, params?: any) => {
      if (fn === 'claim_next_render_job') {
        const db = readDb();
        const renderJobs = db['render_jobs'] || [];
        const pendingJob = renderJobs.find((j: any) => j.status === 'pending' || j.status === 'queued');
        if (pendingJob) {
          pendingJob.status = 'claimed';
          pendingJob.locked_by = params?.worker_id_text || 'render-worker';
          pendingJob.locked_at = new Date().toISOString();
          writeDb(db);
          return { data: [pendingJob], error: null };
        }
        return { data: [], error: null };
      }
      return { data: [], error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async () => ({ data: { path: 'local' }, error: null }),
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `/clips/${p}` }, error: null }),
        download: async () => ({ data: Buffer.from(''), error: null }),
        remove: async () => ({ error: null }),
      }),
      listBuckets: async () => ({ data: [{ name: 'clips' }, { name: 'thumbnails' }], error: null }),
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    }
  };
}

let _localSupabaseDriver: any = null;

function getSupabase(): any {
  if (!_localSupabaseDriver) {
    _localSupabaseDriver = createLocalSupabaseDriver();
  }
  return _localSupabaseDriver;
}

export function supabase(): any {
  return getSupabase();
}

export class DatabaseService {
  public static readonly workerInstanceId = `${os.hostname() || 'worker'}-${crypto.randomUUID()}`;
  private static legacyQueueWarningShown = false;

  private get db() {
    return getSupabase();
  }

  getSupabase() {
    return this.db;
  }

  private storage = StorageService.getInstance();


  async createJob(jobData: any) {
    // 1. Mirror to Firestore / local DB
    try {
      await firebaseDb.createJob({
        id: jobData.id,
        userId: jobData.user_id || jobData.userId,
        videoUrl: jobData.video_url || jobData.videoUrl,
        requestedClips: jobData.num_clips || jobData.numClips,
        status: jobData.status || 'queued',
        progress: jobData.progress || 0,
        metadata: jobData.payload || {},
      });
    } catch {}

    // 2. Try Supabase
    try {
      const { data, error } = await this.db
        .from('jobs')
        .insert(jobData)
        .select()
        .single();
      if (!error && data) return data;
    } catch {}

    return jobData;
  }

  async updateJob(jobId: string, updates: any) {
    if (updates.status) {
      await this.logJobEvent(jobId, `STATUS_${updates.status.toUpperCase()}`, updates);
    }

    // 1. Mirror to Firestore / local DB
    try {
      await firebaseDb.updateJob(jobId, {
        status: updates.status,
        progress: updates.progress,
        stage: updates.stage || updates.stage_label,
        error: updates.error_message || updates.error,
        updatedAt: new Date().toISOString(),
        ...(updates.payload ? { metadata: updates.payload } : {}),
      });
    } catch {}

    // 2. Try Supabase
    try {
      const { data, error } = await this.db
        .from('jobs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error && error.message?.includes('stage_label')) {
        const { stage_label, ...sanitizedUpdates } = updates;
        const { data: retryData } = await this.db
          .from('jobs')
          .update({ ...sanitizedUpdates, updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return retryData;
      }
      return data;
    } catch {}

    return updates;
  }

  async getJob(jobId: string) {
    // 1. Try Firestore / local DB
    try {
      const fbJob = await firebaseDb.getJob(jobId);
      if (fbJob) {
        return {
          ...fbJob,
          user_id: fbJob.userId || (fbJob as any).user_id,
          video_url: fbJob.videoUrl || (fbJob as any).video_url,
          num_clips: fbJob.requestedClips || (fbJob as any).num_clips,
          created_at: fbJob.createdAt || (fbJob as any).created_at,
          updated_at: fbJob.updatedAt || (fbJob as any).updated_at,
        };
      }
    } catch {}

    // 2. Try Supabase
    try {
      const { data, error } = await this.db
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (!error && data) return data;
    } catch {}

    return null;
  }

  async saveClips(clips: any[]) {
    // 1. Mirror to Firestore / local DB
    try {
      const fbClips = clips.map((c, idx) => ({
        id: c.id || `${c.job_id || c.jobId}_clip_${idx + 1}`,
        jobId: c.job_id || c.jobId,
        userId: c.user_id || c.userId || '00000000-0000-0000-0000-000000000000',
        rank: c.rank || idx + 1,
        videoUrl: c.video_url || c.videoUrl || '',
        thumbnailUrl: c.thumbnail_url || c.thumbnailUrl || '',
        durationMs: c.duration_ms || (c.duration ? c.duration * 1000 : 0),
        startMs: c.start_ms || (c.start_time ? c.start_time * 1000 : 0),
        endMs: c.end_ms || (c.end_time ? c.end_time * 1000 : 0),
        score: c.score || c.virality_score || 0,
        title: c.title || `Clip ${idx + 1}`,
        summary: c.summary || c.hook || '',
        aspectRatio: c.aspect_ratio || '9:16',
        createdAt: new Date().toISOString(),
      }));
      await firebaseDb.saveClips(fbClips);
    } catch {}

    // 2. Try Supabase
    const clipsWithTime = clips.map(c => ({...c, created_at: new Date().toISOString()}));
    try {
      const { data } = await this.db
        .from('clips')
        .upsert(clipsWithTime, { onConflict: 'id' });
      return data;
    } catch {}

    return clipsWithTime;
  }

  async getJobWithClips(jobId: string) {
    // 1. Try Firestore / local DB
    try {
      const fbJob = await firebaseDb.getJob(jobId);
      if (fbJob) {
        const clips = await firebaseDb.getClipsForJob(jobId);
        return {
          ...fbJob,
          user_id: fbJob.userId || (fbJob as any).user_id,
          video_url: fbJob.videoUrl || (fbJob as any).video_url,
          num_clips: fbJob.requestedClips || (fbJob as any).num_clips,
          created_at: fbJob.createdAt || (fbJob as any).created_at,
          updated_at: fbJob.updatedAt || (fbJob as any).updated_at,
          clips: clips.map((c: any) => ({
            ...c,
            id: c.id,
            job_id: c.jobId || c.job_id,
            video_url: c.videoUrl || c.video_url,
            thumbnail_url: c.thumbnailUrl || c.thumbnail_url,
            start_time: c.startMs ? c.startMs / 1000 : c.start_time,
            end_time: c.endMs ? c.endMs / 1000 : c.end_time,
            created_at: c.createdAt || c.created_at,
          })),
        };
      }
    } catch {}

    // 2. Try Supabase
    try {
      const { data: job, error: jobError } = await this.db
        .from('jobs')
        .select('*, clips(*)')
        .eq('id', jobId)
        .single();
      if (!jobError && job) return job;
    } catch {}

    return null;
  }

  async updateClipStatus(clipId: string, status: string) {
    const { data, error } = await this.db
      .from('clips')
      .update({ status })
      .eq('id', clipId);
    if (error) console.error(`[Supabase]: Failed to update clip ${clipId} status to ${status}`, error.message);
    return data;
  }

  async saveRenderMetrics(metrics: any) {
    const { error } = await this.db.from('render_metrics').insert(metrics);
    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('not find the table')) {
        console.warn('[Supabase]: render_metrics table unavailable in schema cache. Skipping metrics insert.');
      } else {
        console.error('[Supabase]: Failed to save render metrics', error.message);
      }
    }
  }

  async logProductionFailure(failure: any) {
    const { error } = await this.db.from('production_failures').insert(failure);
    if (error) console.error('[Supabase]: Failed to log production failure', error.message);
  }

  async createRenderJob(renderJobData: any) {
    const { data, error } = await this.db
      .from('render_jobs')
      .insert(renderJobData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateRenderJob(id: string, updates: any) {
    const { data, error } = await this.db
      .from('render_jobs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return data;
  }

  async getRenderCache(candidateHash: string) {
    const { data, error } = await this.db
      .from('render_cache')
      .select('*')
      .eq('candidate_hash', candidateHash)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.warn('[Supabase]: Error checking render cache', error.message);
    }
    return data;
  }

  async setRenderCache(cacheEntry: { candidate_hash: string, storage_path: string, thumbnail_path?: string }) {
    const { error } = await this.db
      .from('render_cache')
      .upsert(cacheEntry, { onConflict: 'candidate_hash' });
    if (error) console.warn('[Supabase]: Error saving to render cache', error.message);
  }

  async clearUserContent(userId: string) {
    console.log(`[Supabase]: 🛠️ Initiating scoped user content purge for ${userId}...`);
    
    const { data: jobs, error: jobsError } = await this.db
      .from('jobs')
      .select('id')
      .eq('user_id', userId);
    if (jobsError) throw jobsError;
    const jobIds = jobs?.map((j: any) => j.id) || [];

    if (jobIds.length > 0) {
      const { error: clipsError } = await this.db
        .from('clips')
        .delete()
        .in('job_id', jobIds);
      if (clipsError) console.error('[Supabase]: Clips purge error:', clipsError.message);

      try {
        await this.db.from('nexus_signals').delete().in('job_id', jobIds);
      } catch (err: any) {
        console.warn('[Supabase]: Optional nexus signals purge:', err.message);
      }
    }

    const { error: jobsDeleteError } = await this.db
      .from('jobs')
      .delete()
      .eq('user_id', userId);
    if (jobsDeleteError) throw jobsDeleteError;
    console.log(`[Supabase]: ✅ Scoped content for user ${userId} purged.`);
  }

  async clearExistingContent() {
    console.warn('[Supabase]: ⚠️ Deprecated global clearExistingContent() called. Wiping default workspace...');
    await this.clearUserContent('00000000-0000-0000-0000-000000000000');
  }

  async getRecentClips(userId: string, limit = 10) {
    const devModeBypass = process.env.DISABLE_OWNERSHIP_CHECKS === 'true';
    const workerEnv = process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');

    if (devModeBypass) {
      const { data: clips, error } = await this.db
        .from('clips')
        .select('*, jobs(user_id, video_url)')
        .eq('environment', workerEnv)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return clips;
    }

    const { data: jobs, error: jobsError } = await this.db
      .from('jobs')
      .select('id')
      .eq('user_id', userId);
    if (jobsError) throw jobsError;
    const jobIds = jobs?.map((j: any) => j.id) || [];
    if (jobIds.length === 0) return [];

    const { data: clips, error } = await this.db
      .from('clips')
      .select('*, jobs(user_id, video_url)')
      .eq('environment', workerEnv)
      .in('job_id', jobIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return clips;
  }


  async getClip(id: string) {
    const { data: clip, error } = await this.db
      .from('clips')
      .select('*, jobs(user_id, video_url)')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    
    if (clip) return clip;

    // Fallback to voiceover clips for download compatibility
    const { data: voiceoverClip, error: voError } = await this.db
      .from('voiceover_clips')
      .select('*')
      .eq('id', id)
      .single();
      
    if (voError && voError.code !== 'PGRST116') throw voError;
    
    if (voiceoverClip) {
      return {
        ...voiceoverClip,
        storage_path: voiceoverClip.video_path || voiceoverClip.audio_path,
        video_url: voiceoverClip.video_path || voiceoverClip.audio_path
      };
    }
    return null;
  }

  async getStats(userId: string) {
    const isDevBypass = process.env.DISABLE_OWNERSHIP_CHECKS === 'true';
    const envFilter = { environment: (process.env.WORKER_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')) };
    const userFilter = isDevBypass ? envFilter : { user_id: userId, ...envFilter };

    const [
      { count: jobsCount },
      { data: userJobs },
      { count: completedJobs },
      { count: failedJobs }
    ] = await Promise.all([
      this.db.from('jobs').select('*', { count: 'exact', head: true }).match(userFilter),
      this.db.from('jobs').select('id').match(userFilter).limit(1000),
      this.db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed').match(userFilter),
      this.db.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['failed', 'dead_letter']).match(userFilter)
    ]);

    const jobIds = userJobs?.map((j: any) => j.id) || [];
    
    let clipsCount = 0;
    if (isDevBypass) {
      const { count } = await this.db.from('clips').select('*', { count: 'exact', head: true }).match(envFilter);
      clipsCount = count || 0;
    } else if (jobIds.length > 0) {
      // Chunking if needed, but for now just use 'in'
      const { count } = await this.db.from('clips').select('*', { count: 'exact', head: true }).match(envFilter).in('job_id', jobIds.slice(0, 500));
      clipsCount = count || 0;
    }

    const resolvedJobs = (completedJobs || 0) + (failedJobs || 0);
    const successRate = resolvedJobs > 0
      ? Math.round(((completedJobs || 0) / resolvedJobs) * 100)
      : 0;
    
    return {
      totalJobs: jobsCount || 0,
      totalClips: clipsCount,
      successRate,
    };
  }

  private isMissingClaimRpcError(error: any) {
    const message = String(error?.message || '');
    return (
      error?.code === 'PGRST202' ||
      (/claim_next_job/i.test(message) &&
        /schema cache|Could not find the function/i.test(message))
    );
  }

  private isMissingColumnError(error: any, columnName: string) {
    const message = String(error?.message || '');
    return (
      error?.code === 'PGRST204' ||
      (message.includes(columnName) && /schema cache|Could not find/i.test(message))
    );
  }

  private async getNextQueuedJobLegacy(workerEnv: string) {
    const { data: candidates, error: selectError } = await this.db
      .from('jobs')
      .select('*')
      .eq('status', 'queued')
      .eq('environment', workerEnv)
      .order('created_at', { ascending: true })
      .limit(1);

    if (selectError) {
      console.error('[Supabase]: Legacy queue select failed:', selectError.message);
      return null;
    }

    const candidate = candidates?.[0];
    if (!candidate) return null;

    const { data: claimedJob, error: updateError } = await this.db
      .from('jobs')
      .update({
        status: 'processing',
        locked_by: DatabaseService.workerInstanceId,
        worker_id: DatabaseService.workerInstanceId,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('[Supabase]: Legacy queue claim failed:', updateError.message);
      return null;
    }

    if (!claimedJob) return null;

    console.log(`[Supabase]: ⚡ Legacy queue claim acquired for Job ${claimedJob.id} by worker ${DatabaseService.workerInstanceId}`);
    return claimedJob;
  }

  async getNextQueuedJob(workerEnv: string) {
    try {
      const job = await firebaseDb.getNextQueuedJob();
      if (job) {
        const now = new Date().toISOString();
        const claimedJob = {
          ...job,
          id: job.id,
          status: 'processing',
          worker_id: DatabaseService.workerInstanceId,
          locked_by: DatabaseService.workerInstanceId,
          locked_at: now,
          updated_at: now,
          updatedAt: now,
          user_id: job.userId || (job as any).user_id,
          video_url: job.videoUrl || (job as any).video_url,
          num_clips: job.requestedClips || (job as any).numClips || (job as any).num_clips || 3,
        };
        console.log(`[Queue]: ⚡ Claimed queued Job ${job.id} from Firestore`);
        return claimedJob;
      }
    } catch (err: any) {
      console.warn('[Queue]: Firestore queue claim error:', err.message);
    }

    return null;
  }

  async logJobEvent(jobId: string, eventType: string, eventData: any = {}) {
    try {
      const { error } = await this.db
        .from('job_events')
        .insert({
          job_id: jobId,
          event_type: eventType,
          event_data: eventData,
        });
      if (error && error.code !== 'PGRST204') {
        console.warn(`[Supabase]: Failed to log job event ${eventType}: ${error.message}`);
      }
    } catch (err: any) {
      console.warn(`[Supabase]: Job event logging error: ${err.message}`);
    }
  }


  async saveNexusSignal(signal: any) {
    const { data, error } = await this.db
      .from('nexus_signals')
      .insert(signal);
    if (error) throw error;
    return data;
  }

  async getLatestNexusSignals(limit = 10) {
    const { data, error } = await this.db
      .from('nexus_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async saveClipEnhancement(enhancement: any) {
    const { data, error } = await this.db
      .from('clip_enhancements')
      .upsert(enhancement);
    if (error) throw error;
    return data;
  }

  async getClipEnhancement(hash: string) {
    const { data, error } = await this.db
      .from('clip_enhancements')
      .select('*')
      .eq('transcript_hash', hash)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
    return data;
  }

  /**
   * EX-WORK-02: Reclaim orphaned/stalled jobs back to 'queued' state.
   * Jobs stuck in processing-like states for more than `staleThresholdMs`
   * without a heartbeat update are considered abandoned. Also operates on the
   * local JSON queue when no Supabase is available (heartbeat_at is not set).
   */
  async reclaimOrphanedJobs(staleThresholdMs = 15 * 60000): Promise<string[]> {
    const staleTimestamp = new Date(Date.now() - staleThresholdMs).toISOString();
    // All statuses that indicate a job is "in flight" and may be orphaned
    const orphanStatuses = ['processing', 'cutting', 'captioning', 'transcribing',
                            'detecting_clips', 'rendering', 'recovering'];

    // ── Local JSON queue reclaim ──────────────────────────────────────────────
    const localIds: string[] = [];
    try {
      const queue = firebaseDb.readQueue();
      let changed = false;
      for (const [id, job] of Object.entries(queue.jobs as Record<string, any>)) {
        if (!orphanStatuses.includes(job.status)) continue;
        // Use updatedAt as staleness proxy (heartbeat_at may not be set)
        const lastUpdate = new Date(job.updatedAt || job.updated_at || job.createdAt || 0).getTime();
        if (Date.now() - lastUpdate > staleThresholdMs) {
          queue.jobs[id] = { ...job, status: 'queued', updatedAt: new Date().toISOString() };
          localIds.push(id);
          changed = true;
          console.log(`[Sweeper]: ♻️ Reclaimed local orphaned job ${id} (was: ${job.status})`);
        }
      }
      if (changed) firebaseDb.writeQueue(queue);
    } catch (localErr: any) {
      console.warn('[Sweeper]: Local queue reclaim error:', localErr.message);
    }

    // ── Supabase reclaim (if available) ──────────────────────────────────────
    const reclaimQuery = (updates: Record<string, any>) => this.db
      .from('jobs')
      .update(updates)
      .in('status', orphanStatuses)
      .lt('updated_at', staleTimestamp)
      .select('id');

    let { data, error } = await reclaimQuery({
      status: 'queued',
      locked_by: null,
      updated_at: new Date().toISOString(),
    });

    if (error && this.isMissingColumnError(error, 'locked_by')) {
      ({ data, error } = await reclaimQuery({
        status: 'queued',
        updated_at: new Date().toISOString(),
      }));
    }

    const supabaseIds = error ? [] : (data || []).map((j: any) => j.id);
    return [...localIds, ...supabaseIds];
  }

  /**
   * Called once on worker startup to immediately rescue any jobs that were
   * orphaned by the previous worker process (no staleness threshold applied).
   */
  async startupReclaim(): Promise<string[]> {
    const orphanStatuses = ['processing', 'cutting', 'captioning', 'transcribing',
                            'detecting_clips', 'rendering', 'recovering'];
    const localIds: string[] = [];
    try {
      const queue = firebaseDb.readQueue();
      let changed = false;
      for (const [id, job] of Object.entries(queue.jobs as Record<string, any>)) {
        if (!orphanStatuses.includes(job.status)) continue;
        queue.jobs[id] = { ...job, status: 'queued', updatedAt: new Date().toISOString() };
        localIds.push(id);
        changed = true;
        console.log(`[Startup Reclaim]: ♻️ Reset orphaned job ${id} (was: ${job.status}) → queued`);
      }
      if (changed) firebaseDb.writeQueue(queue);
    } catch {}
    return localIds;
  }

  async reclaimOrphanedRenderJobs(staleThresholdMs = 10 * 60000): Promise<string[]> {
    const staleTimestamp = new Date(Date.now() - staleThresholdMs).toISOString();
    
    const { data, error } = await this.db
      .from('render_jobs')
      .update({
        status: 'pending',
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .in('status', ['claimed', 'rendering'])
      .lt('locked_at', staleTimestamp)
      .select('id');

    if (error) {
      console.error('[Supabase]: Failed to reclaim orphaned render jobs', error.message);
      return [];
    }
    return (data || []).map((j: any) => j.id);
  }
  // ==========================================
  // VOICEOVER STUDIO METHODS (NEW & LEGACY)
  // ==========================================

  async createVoiceoverClip(vcData: any) {
    const { data, error } = await this.db
      .from('voiceover_clips')
      .insert(vcData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getVoiceoverClipsBySource(sourceClipId: string) {
    const { data, error } = await this.db
      .from('voiceover_clips')
      .select('*')
      .eq('source_clip_id', sourceClipId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getAllVoiceoverClipsByUser(userId: string) {
    const { data, error } = await this.db
      .from('voiceover_clips')
      .select('*, clips(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  // ==========================================
  // LEGACY VOICEOVER STUDIO METHODS (DEPRECATED)
  // ==========================================

  async createVoiceoverProject(projectData: any) {
    const { data, error } = await this.db
      .from('voiceover_projects')
      .insert(projectData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getVoiceoverProject(id: string) {
    const { data, error } = await this.db
      .from('voiceover_projects')
      .select('*, voiceover_segments(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async updateVoiceoverProject(id: string, updates: any) {
    const { data, error } = await this.db
      .from('voiceover_projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async saveVoiceoverSegments(segments: any[]) {
    const { data, error } = await this.db
      .from('voiceover_segments')
      .upsert(segments)
      .select();
    if (error) throw error;
    return data;
  }

  async deleteVoiceoverSegment(id: string) {
    const { error } = await this.db
      .from('voiceover_segments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async getVoiceoverProjectsByUser(userId: string, limit = 10) {
    const { data, error } = await this.db
      .from('voiceover_projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  // ==========================================
  // AGENCY & BUSINESS WORKSPACE FEATURES
  // ==========================================

  async createWorkspace(workspaceData: { name: string; owner_id: string; logo_url?: string }) {
    const { data, error } = await this.db
      .from('workspaces')
      .insert({
        ...workspaceData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || { id: 'mock-workspace-id', ...workspaceData };
  }

  async addWorkspaceMember(memberData: { workspace_id: string; user_id: string; role: 'owner' | 'editor' | 'viewer' }) {
    const { data, error } = await this.db
      .from('workspace_members')
      .insert({
        ...memberData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || { id: 'mock-member-id', ...memberData };
  }

  async getWorkspaceMembers(workspaceId: string) {
    const { data, error } = await this.db
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return data || [];
  }

  async scheduleClipPublication(scheduleData: { clip_id: string; platform: 'tiktok' | 'instagram' | 'youtube'; scheduled_at: string; status: 'pending' | 'published' }) {
    const { data, error } = await this.db
      .from('content_calendar')
      .insert({
        ...scheduleData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || { id: 'mock-calendar-id', ...scheduleData };
  }

  async getScheduledCalendarClips(workspaceId: string) {
    const { data, error } = await this.db
      .from('content_calendar')
      .select('*, clips(*)')
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createABTestCampaign(campaignData: { name: string; original_clip_id: string; status: 'active' | 'completed' }) {
    const { data, error } = await this.db
      .from('ab_test_campaigns')
      .insert({
        ...campaignData,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || { id: 'mock-ab-campaign-id', ...campaignData };
  }

  async addVariantToABTest(variantData: { campaign_id: string; variant_name: string; clip_id: string; hook_text: string; clicks?: number; views?: number }) {
    const { data, error } = await this.db
      .from('ab_test_variants')
      .insert({
        ...variantData,
        clicks: variantData.clicks || 0,
        views: variantData.views || 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || { id: 'mock-variant-id', ...variantData };
  }
}
