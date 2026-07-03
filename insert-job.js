const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('jobs')
    .insert([
      { 
        youtube_url: 'https://youtu.be/kwbH2dm1AXo?si=586MYRJz3Jg-bi6h', 
        status: 'queued', 
        user_id: '58b8d0dc-8de5-4250-afa8-6865e10cbebb' // A known user_id from the DB
      }
    ])
    .select();
  
  if (error) {
    console.error('Error inserting job:', error);
  } else {
    console.log('Inserted job:', data[0].id);
  }
}

main();
