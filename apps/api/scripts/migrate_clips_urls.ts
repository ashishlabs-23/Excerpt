import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDb() {
  console.log('Fetching clips...');
  const { data, error } = await supabase.from('clips').select('id, video_url, thumbnail_url');
  if (error) {
    console.error(error);
    return;
  }
  for (const clip of data) {
    let newVideoUrl = clip.video_url;
    let newThumbUrl = clip.thumbnail_url;
    
    if (newVideoUrl && newVideoUrl.includes('/storage/v1/object/sign/clips/')) {
        const vMatch = newVideoUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
        if (vMatch) newVideoUrl = 'clips/' + decodeURIComponent(vMatch[1]);
    }
    
    if (newThumbUrl && newThumbUrl.includes('/storage/v1/object/sign/clips/')) {
        const tMatch = newThumbUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
        if (tMatch) newThumbUrl = 'clips/' + decodeURIComponent(tMatch[1]);
    }
    
    if (newVideoUrl !== clip.video_url || newThumbUrl !== clip.thumbnail_url) {
      await supabase.from('clips').update({ video_url: newVideoUrl, thumbnail_url: newThumbUrl }).eq('id', clip.id);
      console.log('Updated clip ' + clip.id);
    }
  }
  console.log('Done migration');
}
fixDb();
