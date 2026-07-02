import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testClaim() {
  console.log("Calling claim_next_job...");
  const { data, error } = await supabase.rpc('claim_next_job', { worker_id_text: 'test_worker_123' });
  console.log("Data:", data);
  if (error) console.error("Error:", error);
}

testClaim();
