import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageService } from './storageService';
import os from 'os';
import crypto from 'crypto';



/**
 * Lazy Supabase client — initializes on first use, 
 * so dotenv has time to load the environment variables.
 */
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!url || !key) {
      console.error('[Supabase]: Missing SUPABASE_URL or a Supabase API key');
    } else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[Supabase]: Using SUPABASE_ANON_KEY on the server. Purge and admin writes may be limited by RLS.');
    }
    
    // Resilient Fetch with Retry Logic for Docker DNS constraints (EAI_AGAIN) and HTTP 5xx timeouts
    const resilientFetch = async (input: any, init?: any): Promise<Response> => {
      let attempt = 0;
      const maxRetries = 5;
      while (attempt < maxRetries) {
        const controller = new AbortController();
        const isStorage = typeof input === 'string' && input.includes('/storage/v1/');
        const timeoutMs = isStorage ? 120000 : 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(input, { ...init, signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.status >= 500 && res.status <= 599) {
            throw new Error(`HTTP status ${res.status}`);
          }
          return res;
        } catch (e: any) {
          clearTimeout(timeoutId);
          attempt++;
          const isNetworkError = e.name === 'AbortError' ||
                                 e.message?.includes('fetch failed') || 
                                 e.message?.includes('HTTP status') ||
                                 e.code === 'EAI_AGAIN' || 
                                 e.code === 'ENOTFOUND' || 
                                 e.message?.includes('network timeout');
          if (attempt === maxRetries || !isNetworkError) throw e;
          
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.warn(`[Supabase Fetch]: Transient error (${e.message || 'Timeout'}). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
      throw new Error('Supabase resilient fetch failed');
    };

    _supabase = createClient(url, key, {
      global: {
        fetch: resilientFetch
      }
    });
  }
  return _supabase;
}

export { getSupabase as supabase };

export class DatabaseService {
  private static readonly workerInstanceId = `${os.hostname() || 'worker'}-${crypto.randomUUID()}`;
  private static legacyQueueWarningShown = false;

  private get db() {
    return getSupabase();
  }

  getSupabase() {
    return this.db;
  }

  private storage = StorageService.getInstance();


  async createJob(jobData: any) {
    const { data, error } = await this.db
      .from('jobs')
      .insert(jobData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateJob(jobId: string, updates: any) {
    if (updates.status) {
      await this.logJobEvent(jobId, `STATUS_${updates.status.toUpperCase()}`, updates);
    }
    const { data, error } = await this.db
      .from('jobs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) throw error;
    return data;
  }

  async getJob(jobId: string) {
    const { data, error } = await this.db
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async saveClips(clips: any[]) {
    // Add updated created_at so that reused clips jump to the top of the gallery
    const clipsWithTime = clips.map(c => ({...c, created_at: new Date().toISOString()}));
    const { data, error } = await this.db
      .from('clips')
      .upsert(clipsWithTime, { onConflict: 'id' });
    if (error) throw error;
    return data;
  }

  async getJobWithClips(jobId: string) {
    const { data: job, error: jobError } = await this.db
      .from('jobs')
      .select('*, clips(*)')
      .eq('id', jobId)
      .single();
    if (jobError && jobError.code !== 'PGRST116') throw jobError;
    return job || null;
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
    if (error) console.error('[Supabase]: Failed to save render metrics', error.message);
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
    const jobIds = jobs?.map((j) => j.id) || [];

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

    if (devModeBypass) {
      const { data: clips, error } = await this.db
        .from('clips')
        .select('*, jobs(user_id, video_url)')
        .eq('is_archived', false)
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
    const jobIds = jobs?.map((j) => j.id) || [];
    if (jobIds.length === 0) return [];

    const { data: clips, error } = await this.db
      .from('clips')
      .select('*, jobs(user_id, video_url)')
      .in('job_id', jobIds)
      .eq('is_archived', false)
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
    const userFilter = isDevBypass ? {} : { user_id: userId };

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
      const { count } = await this.db.from('clips').select('*', { count: 'exact', head: true });
      clipsCount = count || 0;
    } else if (jobIds.length > 0) {
      // Chunking if needed, but for now just use 'in'
      const { count } = await this.db.from('clips').select('*', { count: 'exact', head: true }).in('job_id', jobIds.slice(0, 500));
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

  private async getNextQueuedJobLegacy() {
    const { data: candidates, error: selectError } = await this.db
      .from('jobs')
      .select('*')
      .eq('status', 'queued')
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

  async getNextQueuedJob() {
    try {
      const { data, error } = await this.db
        .rpc('claim_next_job', { worker_id_text: DatabaseService.workerInstanceId });
      
      if (error) {
        if (this.isMissingClaimRpcError(error)) {
          if (!DatabaseService.legacyQueueWarningShown) {
            console.warn('[Supabase]: ⚠️ claim_next_job RPC missing! Falling back to legacy queue claiming. Run the queue_locking_migration.sql to enable safe distributed locking.');
            DatabaseService.legacyQueueWarningShown = true;
          }
          return this.getNextQueuedJobLegacy();
        }
        throw error;
      }

      if (data && data.length > 0) {
        const job = data[0];
        console.log(`[Supabase]: 🔒 Secured lock on Job ${job.id} via RPC (Worker: ${DatabaseService.workerInstanceId})`);
        return job;
      }
      return null;
    } catch (e: any) {
      console.error('[Supabase]: Queue claim error:', e.message);
      return null;
    }
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
   * without a heartbeat update are considered abandoned.
   */
  async reclaimOrphanedJobs(staleThresholdMs = 15 * 60000): Promise<string[]> {
    const staleTimestamp = new Date(Date.now() - staleThresholdMs).toISOString();
    const reclaimQuery = (updates: Record<string, any>) => this.db
      .from('jobs')
      .update(updates)
      .in('status', ['processing', 'cutting', 'captioning', 'transcribing', 'detecting_clips'])
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

    if (error) throw error;
    return (data || []).map((j: any) => j.id);
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
