import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const { data, error } = await db.getSupabase().from('clips').update({
    status: 'uploaded',
    is_archived: false
  }).eq('id', 'a78eace9-502c-435d-a53f-3c7035b06515');
  console.log("Error:", error);
}
run();
