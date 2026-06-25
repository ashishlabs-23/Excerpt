import { DatabaseService } from '../src/services/supabaseService';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const db = new DatabaseService();

async function testUrls() {
  console.log('Testing video URLs from the clips table...');
  const { data: clips, error } = await (db as any).db
    .from('clips')
    .select('id, title, video_url')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to query clips:', error.message);
    return;
  }

  for (const clip of clips) {
    console.log(`\nClip: "${clip.title}" (ID: ${clip.id})`);
    console.log(`URL: ${clip.video_url}`);
    try {
      const res = await fetch(clip.video_url, { method: 'HEAD' });
      console.log(`HTTP Status: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const text = await fetch(clip.video_url).then(r => r.text()).catch(() => 'No body');
        console.log(`Error Response (trimmed): ${text.slice(0, 300)}`);
      }
    } catch (e: any) {
      console.error(`Fetch Error: ${e.message}`);
    }
  }
}

testUrls().catch(console.error);
