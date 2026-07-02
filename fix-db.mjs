import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  const sql = `ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP WITH TIME ZONE;`;
  
  const { data, error } = await supabase.rpc('pg_query', { query: sql });
  
  if (error) {
    console.error("RPC pg_query failed. Error:", error);
    
    console.log("Trying to use postgres driver if we can infer DATABASE_URL...");
    // Let's see if we can infer it from SUPABASE_URL
    // https://maldlbmoeorpetllaceg.supabase.co
    // Usually host is aws-0-ap-south-1.pooler.supabase.com or similar. 
    // We can't know for sure without the DB password.
  } else {
    console.log("Success:", data);
  }
}

main();
