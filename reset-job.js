import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reset() {
  console.log("Resetting job to queued...");
  const { data, error } = await supabase.from('jobs')
    .update({ status: 'queued', locked_by: null, worker_id: null, locked_at: null })
    .eq('id', '2191d4f4-71df-4440-b30f-b08e36c448c0')
    .select();
  console.log("Data:", data);
}

reset();
