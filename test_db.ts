import { config } from 'dotenv';
config({ path: 'apps/api/.env' });
import { DatabaseService } from './apps/api/src/services/supabaseService.js';

async function run() {
  const db = new DatabaseService();
  const { data, error } = await db.getSupabase().from('jobs').select('id, status, progress, failed_reason, updated_at').ilike('failed_reason', '%Terminal state%').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();
