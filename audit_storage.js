require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function verifyStorage() {
  console.log("Fetching all clips...");
  const { data: clips } = await supabase.from('clips').select('id, storage_path, thumbnail_storage_path');
  
  let missingStorage = 0;
  
  for (const clip of clips) {
    if (clip.storage_path) {
      const path = clip.storage_path.replace('clips/', '');
      const folder = path.split('/')[0];
      const filename = path.split('/')[1] || path;
      const { data, error } = await supabase.storage.from('clips').list(folder, { search: filename });
      
      if (error || !data || data.length === 0) {
        console.error(`Clip ${clip.id} storage_path NOT FOUND in bucket: ${path}`);
        missingStorage++;
      }
    }
  }
  
  console.log(`Storage verification complete. Missing storage objects: ${missingStorage}`);
}

verifyStorage().catch(console.error);
