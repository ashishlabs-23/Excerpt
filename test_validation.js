require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function testValidation() {
  console.log("Testing columns...");
  const { error: err1 } = await supabase.from('jobs').select('debug_data').limit(1);
  console.log("jobs.debug_data:", err1 ? err1.message : "OK");

  const { error: err2 } = await supabase.from('render_jobs').select('id').limit(1);
  console.log("render_jobs:", err2 ? err2.message : "OK");

  console.log("Testing RPCs...");
  // Call with missing args to see if it complains about args or missing function
  const { error: err3 } = await supabase.rpc('claim_next_job', {});
  console.log("claim_next_job:", err3 ? err3.message : "OK", err3?.code);
  
  const { error: err4 } = await supabase.rpc('claim_next_render_job', {});
  console.log("claim_next_render_job:", err4 ? err4.message : "OK", err4?.code);

  const { error: err5 } = await supabase.rpc('some_fake_rpc', {});
  console.log("some_fake_rpc:", err5 ? err5.message : "OK", err5?.code);
}

testValidation().catch(console.error);
