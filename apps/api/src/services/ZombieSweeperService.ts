import { DatabaseService } from './supabaseService';
import { StorageIntegrityMonitor } from './StorageIntegrityMonitor';
import { RetentionService } from './RetentionService';

export class ZombieSweeperService {
  private db: DatabaseService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly STALE_THRESHOLD_MINUTES = 30;
  private readonly FAIL_THRESHOLD_MINUTES = 15; // Time after being requeued before failing
  private sweepCount: number = 0;              // tracks how many sweeps have run
  private readonly RETENTION_INTERVAL_SWEEPS = 60; // run retention every 60 sweeps (~1 hour at 60s interval)

  constructor() {
    this.db = new DatabaseService();
  }

  public start(intervalMs: number = 60000) {
    if (this.intervalId) return;
    console.log(`[ZombieSweeper]: Started interval sweeps every ${intervalMs}ms`);
    this.intervalId = setInterval(() => this.sweep(), intervalMs);
    // Initial sweep
    setTimeout(() => this.sweep(), 5000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async sweep() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sweepCount++;
    try {
      const supabase = this.db.getSupabase();
      
      // 0. Storage Integrity Sweep
      await StorageIntegrityMonitor.getInstance().sweepDriftedClips();

      // 0b. Retention Sweep — runs once per hour
      if (this.sweepCount % this.RETENTION_INTERVAL_SWEEPS === 0) {
        try {
          await new RetentionService().run();
        } catch (retentionErr) {
          console.error(`[ZombieSweeper]: RetentionService error:`, retentionErr);
        }
      }

      // 1. Sweep Jobs (Analysis/Clipping)
      // Transition 1: pending/processing/cancelling -> stale
      const staleJobThreshold = new Date(Date.now() - this.STALE_THRESHOLD_MINUTES * 60000).toISOString();
      const { data: staleJobs, error: staleJobErr } = await supabase
        .from('jobs')
        .select('id, status, payload')
        .in('status', ['pending', 'processing', 'detecting_clips', 'transcribing', 'cancelling'])
        .lt('updated_at', staleJobThreshold);

      if (staleJobs && staleJobs.length > 0) {
        console.warn(`[ZombieSweeper]: Found ${staleJobs.length} active jobs without heartbeat for ${this.STALE_THRESHOLD_MINUTES}m. Marking as stale.`);
        for (const job of staleJobs) {
          await supabase.from('jobs').update({ status: 'stale', updated_at: new Date().toISOString() }).eq('id', job.id);
        }
      }

      // Transition 2: stale -> requeued
      const requeueThreshold = new Date(Date.now() - this.FAIL_THRESHOLD_MINUTES * 60000).toISOString();
      const { data: toRequeueJobs } = await supabase
        .from('jobs')
        .select('id, status, payload')
        .eq('status', 'stale')
        .lt('updated_at', requeueThreshold);
        
      if (toRequeueJobs && toRequeueJobs.length > 0) {
        console.warn(`[ZombieSweeper]: Requeuing ${toRequeueJobs.length} stale jobs.`);
        for (const job of toRequeueJobs) {
          await supabase.from('jobs').update({ status: 'requeued', updated_at: new Date().toISOString() }).eq('id', job.id);
        }
      }

      // Transition 3: requeued -> failed
      const { data: toFailJobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('status', 'requeued')
        .lt('updated_at', requeueThreshold);
        
      if (toFailJobs && toFailJobs.length > 0) {
        console.warn(`[ZombieSweeper]: Failing ${toFailJobs.length} perpetually stalled jobs.`);
        for (const job of toFailJobs) {
          await supabase.from('jobs').update({ 
            status: 'failed', 
            failed_reason: 'Timeout: Zombie Clip Detection (Heartbeat died multiple times)',
            updated_at: new Date().toISOString() 
          }).eq('id', job.id);
        }
      }

      // 2. Sweep Render Jobs (Video Generation)
      const { data: staleRenders } = await supabase
        .from('render_jobs')
        .select('id, status, attempt_count')
        .in('status', ['pending', 'processing'])
        .lt('updated_at', staleJobThreshold);

      if (staleRenders && staleRenders.length > 0) {
        console.warn(`[ZombieSweeper]: Found ${staleRenders.length} stale render_jobs. Transitioning to stale.`);
        for (const rjob of staleRenders) {
          await supabase.from('render_jobs').update({ status: 'stale', updated_at: new Date().toISOString() }).eq('id', rjob.id);
        }
      }

      const { data: toRequeueRenders } = await supabase
        .from('render_jobs')
        .select('id, attempt_count')
        .eq('status', 'stale')
        .lt('updated_at', requeueThreshold);
        
      if (toRequeueRenders && toRequeueRenders.length > 0) {
        console.warn(`[ZombieSweeper]: Requeuing ${toRequeueRenders.length} stale render_jobs.`);
        for (const rjob of toRequeueRenders) {
          await supabase.from('render_jobs').update({ status: 'requeued', attempt_count: rjob.attempt_count + 1, updated_at: new Date().toISOString() }).eq('id', rjob.id);
        }
      }

      const { data: toFailRenders } = await supabase
        .from('render_jobs')
        .select('id, clip_id')
        .eq('status', 'requeued')
        .lt('updated_at', requeueThreshold);
        
      if (toFailRenders && toFailRenders.length > 0) {
        console.warn(`[ZombieSweeper]: Failing ${toFailRenders.length} perpetually stalled render_jobs.`);
        for (const rjob of toFailRenders) {
          await supabase.from('render_jobs').update({ 
            status: 'failed', 
            last_error: 'Timeout: Zombie Clip Detection',
            updated_at: new Date().toISOString() 
          }).eq('id', rjob.id);
          
          if (rjob.clip_id) {
            await supabase.from('clips').update({ status: 'failed' }).eq('id', rjob.clip_id);
          }
        }
      }

      // 3. Sweep Orphan Clips (Status = pending, but created_at is extremely old)
      // This specifically cleans up the 45 pending clips identified in the audit.
      const orphanThreshold = new Date(Date.now() - 60 * 60000).toISOString(); // 1 hour
      const { data: orphanClips } = await supabase
        .from('clips')
        .select('id, status, created_at')
        .eq('status', 'pending')
        .lt('created_at', orphanThreshold);

      if (orphanClips && orphanClips.length > 0) {
        console.warn(`[ZombieSweeper]: Failing ${orphanClips.length} old orphan pending clips.`);
        for (const clip of orphanClips) {
          await supabase.from('clips').update({ status: 'failed' }).eq('id', clip.id);
        }
      }

      // 4. Sweep Voiceover Clips
      const { data: staleVoiceovers } = await supabase
        .from('voiceover_clips')
        .select('id')
        .in('status', ['pending', 'processing'])
        .lt('updated_at', staleJobThreshold);

      if (staleVoiceovers && staleVoiceovers.length > 0) {
        console.warn(`[ZombieSweeper]: Failing ${staleVoiceovers.length} stale voiceover clips.`);
        for (const vo of staleVoiceovers) {
          await supabase.from('voiceover_clips').update({ 
            status: 'failed', 
            error_message: 'Timeout: Voiceover generation stalled',
            updated_at: new Date().toISOString() 
          }).eq('id', vo.id);
        }
      }

    } catch (err) {
      console.error(`[ZombieSweeper]: Error sweeping zombies:`, err);
    } finally {
      this.isRunning = false;
    }
  }
}
