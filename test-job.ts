import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const { data, error } = await db.getSupabase().from('jobs').select('status, result').eq('id', '736d991c-cf70-4e6c-986a-91f6716a938a').maybeSingle();
  console.log("Job status:", data?.status);
  console.log("Result clips count:", data?.result?.length);
}
run();
