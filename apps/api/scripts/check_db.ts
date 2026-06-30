import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env'), override: true });

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('jobs').select('id').limit(1);
  if (error) {
    console.error("❌ Database check failed:", error.message);
  } else {
    console.log("✅ Database is reachable and 'jobs' table exists.");
  }
}

check();
