import { DatabaseService } from './apps/api/src/services/supabaseService';
async function run() {
  const db = new DatabaseService();
  const { data } = await db.getSupabase().from('render_jobs').select('*').limit(1);
  console.log(Object.keys(data?.[0] || {}));
  process.exit(0);
}
run();
