import { createClient } from '@supabase/supabase-js';

const url = 'https://maldlbmoeorpetllaceg.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbGRsYm1vZW9ycGV0bGxhY2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MDYyNywiZXhwIjoyMDk4MDI2NjI3fQ.7WDVHZKx8f2km8dkHVtRycTPCr4c7MxZtPpJEt15xKM';
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
