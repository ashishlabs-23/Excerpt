import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from '../src/services/supabaseService';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

async function getCounts() {
  const db = new DatabaseService();
  const supabase = db.getSupabase();
  const { data, error } = await supabase.from('jobs').select('status');
  if (error) {
    console.error('Error fetching jobs:', error.message);
    return;
  }
  const counts = data.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('--- JOB COUNTS ---');
  Object.entries(counts).forEach(([status, count]) => {
    console.log(`${status}: ${count}`);
  });
}

getCounts().catch(console.error);
