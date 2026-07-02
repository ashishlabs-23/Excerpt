import { DatabaseService } from './apps/api/src/services/supabaseService';
async function run() {
  const db = new DatabaseService();
  const { data, error } = await db.getSupabase().rpc('get_foreign_keys');
  if(error) {
    console.log("No rpc? Fetching render_jobs");
    const { data: cols, error: colErr } = await db.getSupabase().from('render_jobs').select('*').limit(1);
    console.log("render_jobs sample:", cols, "error:", colErr);
  }
  process.exit(0);
}
run();
