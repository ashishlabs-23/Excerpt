import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: clips } = await supabase.from('clips').select('id, video_url');
  const { data: storageFiles } = await supabase.storage.from('clips').list('', { limit: 100 });
  
  console.log("=== DB Clips URLs ===");
  clips?.slice(0, 5).forEach(c => console.log(c.video_url));
  
  console.log("\n=== Storage Files ===");
  storageFiles?.forEach(f => console.log(f.name));
}

main();
