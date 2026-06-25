import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUrl(url: string) {
  if (!url) return 'NULL';
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status.toString();
  } catch (err) {
    return 'ERROR';
  }
}

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL || 'test@test.com',
    password: process.env.TEST_PASSWORD || 'test'
  });
  if (authErr) { console.error('Auth err', authErr); return; }
  
  const res = await fetch('http://localhost:8010/api/video/clips', {
    headers: { 'Authorization': 'Bearer ' + authData.session.access_token }
  });
  const json = await res.json();
  const clips = json.clips || [];
  
  let report = `# SIGNED URL HEALTH REPORT\n\n`;
  report += `| Clip | Storage Path Exists | Signed Video URL Generated | Video HTTP Status | Signed Thumb URL Generated | Thumb HTTP Status |\n`;
  report += `| ---- | ------------------- | -------------------------- | ----------------- | -------------------------- | ----------------- |\n`;

  for (const c of clips) {
    const hasStorage = !!c.storage_path;
    const hasVideoUrl = !!c.video_url;
    const hasThumbUrl = !!c.thumbnail_url;
    
    const videoStatus = hasVideoUrl ? await testUrl(c.video_url) : 'N/A';
    const thumbStatus = hasThumbUrl ? await testUrl(c.thumbnail_url) : 'N/A';
    
    report += `| ${c.id.substring(0,8)} | ${hasStorage ? 'Yes' : 'No'} | ${hasVideoUrl ? 'Yes' : 'No'} | ${videoStatus} | ${hasThumbUrl ? 'Yes' : 'No'} | ${thumbStatus} |\n`;
  }
  
  fs.writeFileSync('SIGNED_URL_HEALTH_REPORT.md', report);
  console.log('Report generated.');
}

run();
