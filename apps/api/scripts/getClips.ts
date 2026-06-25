import { DatabaseService } from '../src/services/supabaseService';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function getClips() {
  const db = new DatabaseService();
  const supabase = db.getSupabase();

  console.log("=== EXCERPT CLIPS RETRIEVAL ===");
  
  const { data: clips, error: clipsErr } = await supabase
    .from('clips')
    .select('*')
    .order('created_at', { ascending: false });

  if (clipsErr) {
    console.error("FAILURE:", clipsErr);
    return;
  }

  console.log(`Found ${clips?.length || 0} clips in the database.`);
  clips?.forEach((c, i) => {
    console.log(`\n[Clip ${i + 1}] ID: ${c.id}`);
    console.log(`Title: ${c.title}`);
    console.log(`Status: ${c.status}`);
    console.log(`Storage Path: ${c.storage_path}`);
    console.log(`Created At: ${c.created_at}`);
  });
}

getClips().then(() => process.exit(0));
