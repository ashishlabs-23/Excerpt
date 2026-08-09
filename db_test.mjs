import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://maldlbmoeorpetllaceg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing Supabase connection...');
  const { data, error } = await supabase.from('jobs').select('id').limit(1);
  if (error) {
    console.error('Error connecting to database:', error);
    process.exit(1);
  } else {
    console.log('Successfully connected to Supabase database!');
    console.log('Data:', data);
  }
}

testConnection();
