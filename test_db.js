const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await db.from('jobs').select('id, status, progress, failed_reason').ilike('failed_reason', '%Terminal state%').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();
