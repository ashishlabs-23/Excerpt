import { DatabaseService } from '../src/services/supabaseService';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function check() {
  const db = new DatabaseService();
  const supabase = db.getSupabase();
  const tables = ['benchmark_videos', 'benchmark_boundaries', 'benchmark_rankings', 'benchmark_judgements'];

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`${table}: Error - ${error.message}`);
    } else {
      console.log(`${table}: ${count} rows`);
    }
  }
}

check().catch(console.error);
