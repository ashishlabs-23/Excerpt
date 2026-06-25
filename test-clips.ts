import { DatabaseService } from './apps/api/src/services/supabaseService';
import { StorageService } from './apps/api/src/services/storage';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);
const db = new DatabaseService();
const storage = new StorageService();

async function testClips() {
  const { data: clips } = await db.getSupabase().from('clips').select('id, storage_path, status').eq('status', 'uploaded');
  
  if (!clips) {
    console.log("No clips found.");
    return;
  }

  for (const clip of clips) {
    console.log(`\nTesting Clip ID: ${clip.id}`);
    console.log(`Storage Path: ${clip.storage_path}`);
    
    // 1. Check if storage object exists
    const exists = await storage.checkObjectExists(clip.storage_path);
    console.log(`Storage Exists: ${exists}`);
    
    if (exists) {
      // 2. Get signed URL
      const url = await storage.createSignedUrl(clip.storage_path);
      console.log(`URL Generated: ${!!url}`);
      
      if (url) {
        // 3. Test URL fetch
        try {
          const res = await fetch(url, { method: 'HEAD' });
          console.log(`URL 200 OK: ${res.ok} (${res.status})`);
          
          if (res.ok) {
            // 4. Test ffprobe
            try {
              const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'error',
                '-show_entries', 'stream=codec_type',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                url
              ]);
              console.log(`ffprobe output: ${stdout.trim().split('\n').join(', ')}`);
              console.log(`Playable: YES`);
            } catch (err: any) {
              console.log(`ffprobe failed: ${err.message}`);
              console.log(`Playable: NO`);
            }
          }
        } catch (err: any) {
           console.log(`Fetch failed: ${err.message}`);
        }
      }
    } else {
      console.log(`Playable: NO`);
    }
  }
}

testClips().catch(console.error);
