import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load from root .env
config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const REAL_USER_ID = '42b14a82-8ab3-424d-bee7-a4475074a987';

async function restoreLegacyClips() {
  console.log(`Starting migration to real user ID: ${REAL_USER_ID}`);

  // 1. Find all jobs not owned by the real user
  const { data: jobs, error: findError } = await supabase
    .from('jobs')
    .select('id, user_id')
    .neq('user_id', REAL_USER_ID);

  if (findError) {
    console.error('Error finding legacy jobs:', findError);
    return;
  }

  if (!jobs || jobs.length === 0) {
    console.log('No legacy jobs found.');
  } else {
    console.log(`Found ${jobs.length} legacy jobs. Updating user_id...`);
    const jobIds = jobs.map(j => j.id);
    
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ user_id: REAL_USER_ID })
      .in('id', jobIds);
      
    if (updateError) {
      console.error('Error updating legacy jobs:', updateError);
    } else {
      console.log('Successfully updated legacy jobs.');
    }
  }

  console.log('Migration complete.');
}

restoreLegacyClips();
