const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const JOB_ID = '7b0c836c-10fd-435f-ba32-5337c562e305';
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', JOB_ID)
    .single();
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data.debug_data, null, 2));
  }
}

main();
