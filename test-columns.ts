import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const { data, error } = await db.getSupabase().from('jobs').select('*').limit(1);
  console.log("Columns:", data ? Object.keys(data[0]) : error);
}
run();
