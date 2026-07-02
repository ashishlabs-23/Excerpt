import { DatabaseService } from './apps/api/src/services/supabaseService';
async function run() {
  const db = new DatabaseService();
  const { data, error } = await db.getSupabase().from('clips').select('*').eq('job_id', '010d0495-f8cc-4346-ab20-b304512d3dae');
  console.log("Clips for job:", data);
  console.log("Error:", error);
  process.exit(0);
}
run();
