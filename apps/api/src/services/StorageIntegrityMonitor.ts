import { DatabaseService } from './supabaseService';

export class StorageIntegrityMonitor {
  private static instance: StorageIntegrityMonitor;
  private db: DatabaseService;

  private constructor() {
    this.db = new DatabaseService();
  }

  public static getInstance(): StorageIntegrityMonitor {
    if (!StorageIntegrityMonitor.instance) {
      StorageIntegrityMonitor.instance = new StorageIntegrityMonitor();
    }
    return StorageIntegrityMonitor.instance;
  }

  /**
   * Sweeps the `clips` table for records marked 'uploaded' but missing physical storage objects.
   * If a clip lacks a corresponding entry in `storage.objects`, it is marked as 'failed' to prevent player errors.
   */
  public async sweepDriftedClips(): Promise<number> {
    console.log(`[StorageIntegrityMonitor]: Starting storage drift audit...`);
    
    try {
      // 1. Fetch all clips marked as uploaded
      const { data: clips, error: fetchError } = await this.db.getSupabase()
        .from('clips')
        .select('id, storage_path')
        .eq('status', 'uploaded');

      if (fetchError) {
        console.error(`[StorageIntegrityMonitor]: Failed to fetch clips: ${fetchError.message}`);
        return 0;
      }

      if (!clips || clips.length === 0) {
        return 0;
      }

      // 2. Fetch all files from the storage bucket
      // We list the entire directory structure under clips
      const { data: objects, error: storageError } = await this.db.getSupabase()
        .storage
        .from('clips')
        .list('jobs', { limit: 1000, search: '' }); // Simplified check

      if (storageError) {
        console.error(`[StorageIntegrityMonitor]: Failed to fetch storage objects: ${storageError.message}`);
        return 0;
      }

      // 3. To be accurate and handle nested paths, we will instead just do head checks on the clips
      let driftCount = 0;
      for (const clip of clips) {
        if (!clip.storage_path) continue;
        
        // Remove 'clips/' prefix if it exists since the bucket is already 'clips'
        const cleanPath = clip.storage_path.startsWith('clips/') 
          ? clip.storage_path.replace('clips/', '') 
          : clip.storage_path;

        // Verify with storage API
        const { data: signedUrlData, error: signError } = await this.db.getSupabase()
          .storage
          .from('clips')
          .createSignedUrl(cleanPath, 60);

        let isMissing = false;
        
        if (signError || !signedUrlData?.signedUrl) {
           isMissing = true;
        } else {
           // Verify the file actually exists by doing a quick HEAD request
           try {
             const res = await fetch(signedUrlData.signedUrl, { method: 'HEAD' });
             if (!res.ok) isMissing = true;
           } catch {
             isMissing = true;
           }
        }

        if (isMissing) {
          console.warn(`[StorageIntegrityMonitor]: Drift detected for clip ${clip.id}. Missing storage path ${cleanPath}. Marking as failed.`);
          await this.db.getSupabase()
            .from('clips')
            .update({ status: 'failed', failed_reason: 'Storage Integrity Check: Physical file missing from bucket.' })
            .eq('id', clip.id);
          driftCount++;
        }
      }

      if (driftCount > 0) {
        console.log(`[StorageIntegrityMonitor]: Swept ${driftCount} drifted clips.`);
      }

      return driftCount;
    } catch (error: any) {
      console.error(`[StorageIntegrityMonitor]: Error during sweep:`, error.message);
      return 0;
    }
  }
}
