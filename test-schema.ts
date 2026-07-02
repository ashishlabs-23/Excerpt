import { config } from 'dotenv';
config();
import { DatabaseService } from './apps/api/src/services/supabaseService';
const db = new DatabaseService();

async function run() {
  const { data: q1, error: e1 } = await db.getSupabase().from('jobs').update({ status: 'processing' }).eq('id', 'd621efdc-735f-46c0-91a9-7a4a061e5553');
  console.log("To processing:", e1?.message || "Success");
  
  const { data: q2, error: e2 } = await db.getSupabase().from('jobs').update({ status: 'completed' }).eq('id', 'd621efdc-735f-46c0-91a9-7a4a061e5553');
  console.log("To completed:", e2?.message || "Success");
}
run();
