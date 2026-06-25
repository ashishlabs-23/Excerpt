import { DatabaseService } from './apps/api/src/services/databaseService';
import { storageService } from './apps/api/src/services/storageService';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function testUrl(url: string) {
  if (!url) return 'NULL';
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status.toString();
  } catch (err) {
    return 'ERROR';
  }
}

function extractStorageKey(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  if (!url.startsWith('http')) {
    if (url.startsWith('clips/')) {
      return url.slice('clips/'.length);
    }
    return url;
  }
  return null;
}

async function run() {
  const db = new DatabaseService();
  const clips = await db.client.from('clips').select('*').order('created_at', { ascending: false }).limit(20);
  
  if (!clips.data) {
    console.error('Failed to fetch clips');
    return;
  }
  
  let report = `# SIGNED URL HEALTH REPORT\n\n`;
  report += `| Clip | Storage Path Exists | Signed Video URL Generated | Video HTTP Status | Signed Thumb URL Generated | Thumb HTTP Status |\n`;
  report += `| ---- | ------------------- | -------------------------- | ----------------- | -------------------------- | ----------------- |\n`;

  for (const c of clips.data) {
    const hasStorage = !!c.storage_path;
    let videoUrl = null;
    let thumbUrl = null;
    
    // Sign video
    let baseStorageKey = c.storage_path || c?.metadata?.video_storage_key || extractStorageKey(c.video_url) || '';
    if (baseStorageKey.startsWith('clips/')) baseStorageKey = baseStorageKey.slice('clips/'.length);
    let cleanStorageKey = c?.metadata?.video_clean_storage_key || baseStorageKey;
    if (cleanStorageKey && cleanStorageKey.startsWith('clips/')) {
      cleanStorageKey = cleanStorageKey.slice('clips/'.length);
    }
    if (cleanStorageKey) {
      try { videoUrl = await storageService.createSignedUrl(cleanStorageKey); } catch (e) {}
    }

    // Sign thumb
    let thumbStorageKey = c.thumbnail_storage_path || c.metadata?.thumbnail_storage_key || extractStorageKey(c.thumbnail_url);
    if (thumbStorageKey && thumbStorageKey.startsWith('clips/')) {
      thumbStorageKey = thumbStorageKey.slice('clips/'.length);
    }
    if (thumbStorageKey) {
      try { thumbUrl = await storageService.createSignedUrl(thumbStorageKey); } catch (e) {}
    }

    const videoStatus = videoUrl ? await testUrl(videoUrl) : 'N/A';
    const thumbStatus = thumbUrl ? await testUrl(thumbUrl) : 'N/A';
    
    report += `| ${c.id.substring(0,8)} | ${hasStorage ? 'Yes' : 'No'} | ${videoUrl ? 'Yes' : 'No'} | ${videoStatus} | ${thumbUrl ? 'Yes' : 'No'} | ${thumbStatus} |\n`;
  }
  
  fs.writeFileSync('SIGNED_URL_HEALTH_REPORT.md', report);
  console.log('Report generated.');
}

run();
