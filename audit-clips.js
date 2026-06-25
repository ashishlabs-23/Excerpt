const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');
const util = require('util');
require('dotenv').config({ path: '.env' });

const execFileAsync = util.promisify(execFile);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("Starting Playable Clip Audit...");

  const { data: clips, error } = await supabase
    .from('clips')
    .select('id, status, storage_path')
    .eq('status', 'uploaded');

  if (error || !clips) {
    console.error("Failed to fetch clips:", error);
    return;
  }

  for (const clip of clips) {
    console.log(`\n---------------------------------`);
    console.log(`Testing Clip: ${clip.id}`);
    
    // 1. Generate Signed URL
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from('clips')
      .createSignedUrl(clip.storage_path, 3600);
      
    if (urlError || !urlData?.signedUrl) {
      console.log(`[Signed URL]: FAILED - ${urlError?.message}`);
      continue;
    }
    
    // Quick fix for local Docker URLs on Windows
    let signedUrl = urlData.signedUrl;
    if (signedUrl.includes('supabase_kong')) {
      signedUrl = signedUrl.replace('supabase_kong:8000', '127.0.0.1:54321');
    }
    
    console.log(`[Signed URL]: SUCCESS`);

    // 2. Fetch URL (200 OK)
    try {
      const res = await fetch(signedUrl, { method: 'HEAD' });
      console.log(`[Fetch HTTP]: ${res.status} ${res.ok ? 'OK' : 'FAILED'}`);
      
      if (res.ok) {
        // 3. ffprobe
        try {
          const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'error',
            '-show_entries', 'stream=codec_type',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            signedUrl
          ]);
          console.log(`[ffprobe streams]: ${stdout.trim().split('\n').join(', ')}`);
          console.log(`[Playable]: YES`);
        } catch (err) {
          console.log(`[ffprobe]: FAILED - ${err.message}`);
          console.log(`[Playable]: NO`);
        }
      } else {
        console.log(`[Playable]: NO`);
      }
    } catch (err) {
      console.log(`[Fetch HTTP]: ERROR - ${err.message}`);
      console.log(`[Playable]: NO`);
    }
  }
}

runAudit();
