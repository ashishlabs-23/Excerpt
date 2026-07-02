import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const { data: jobs } = await db.getSupabase().from('render_jobs').select('id, job_id, status, error, created_at').order('created_at', { ascending: false }).limit(5);
  console.log("Recent render_jobs:", jobs);
}
run();
