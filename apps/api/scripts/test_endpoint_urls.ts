import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const token = process.env.API_AUTH_TOKEN || '';
const apiUrl = 'http://localhost:8010/api/video/clips';

async function testEndpointUrls() {
  console.log(`Fetching clips from API: ${apiUrl} ...`);
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'x-excerpt-api-key': token
      }
    });

    console.log(`API Status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const text = await res.text();
      console.error(`API Error: ${text}`);
      return;
    }

    const clips = await res.json();
    console.log(`Received ${clips.length} clips from API.`);

    for (const clip of clips) {
      console.log(`\nClip: "${clip.title}" (ID: ${clip.id})`);
      console.log(`URL: ${clip.video_url}`);
      try {
        const headRes = await fetch(clip.video_url, { method: 'HEAD' });
        console.log(`HTTP Status of clip url: ${headRes.status} ${headRes.statusText}`);
        if (!headRes.ok) {
          const bodyText = await fetch(clip.video_url).then(r => r.text()).catch(() => 'No body');
          console.log(`Error Response body (trimmed): ${bodyText.slice(0, 300)}`);
        }
      } catch (e: any) {
        console.error(`Fetch Error: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error(`Test failed: ${e.message}`);
  }
}

testEndpointUrls().catch(console.error);
