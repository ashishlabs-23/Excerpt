import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const dbClip = {
    id: '47d4237b-8c01-408f-98b7-57ea3a36b7f0',
    job_id: 'f6c699c1-a8fb-42d9-af52-e1cc33d8eed1',
    status: 'pending',
    title: 'Test',
    start_time: 0,
    end_time: 10,
    metadata: {}
  };
  const dbClips: any = [dbClip];
  dbClips._pendingRenderJobs = [{ clip_id: '123' }];
  
  console.log("Saving clips:", dbClips);
  try {
    await db.saveClips(dbClips);
    console.log("Success");
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
run();
