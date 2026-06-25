import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Find root .env
const rootDotEnv = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootDotEnv)) {
  dotenv.config({ path: rootDotEnv });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

async function purge() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Purging database...');
  await supabase.from('clips').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('Purge complete.');
}

purge();
