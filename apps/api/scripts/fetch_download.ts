import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
db.from('clips').select('id, storage_path, video_url').order('created_at', { ascending: false }).limit(1).then(async r => {
  if (r.data && r.data.length > 0) {
    const clip = r.data[0];
    console.log("Testing download for clip:", clip.id);
    
    // We need to generate a valid JWT for the user to hit the download endpoint
    // Actually, we can just use the Service Role key as a Bearer token? No, requireUserJWT expects a user JWT.
    // Wait, let's just bypass auth for the test or use a signed URL directly.
    const url = `http://localhost:8010/api/video/test-download/${clip.id}`;
    
    console.log("Fetching from test endpoint:", url);
    const fetchRes = await fetch(url);
    console.log("Test Endpoint Status:", fetchRes.status);
    console.log("Test Endpoint Content-Type:", fetchRes.headers.get('content-type'));
    console.log("Test Endpoint Content-Length:", fetchRes.headers.get('content-length'));
    console.log("Test Endpoint Content-Disposition:", fetchRes.headers.get('content-disposition'));
    
    // Read the first few bytes to see if it's an MP4
    const buffer = await fetchRes.arrayBuffer();
    console.log("Downloaded Bytes:", buffer.byteLength);
    const firstBytes = new Uint8Array(buffer.slice(0, 8));
    console.log("First 8 bytes (hex):", Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
}).catch(console.error);
