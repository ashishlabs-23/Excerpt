require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function runAudit() {
  console.log("1. Counting total clips in database...");
  const { count, error: countError } = await supabase
    .from('clips')
    .select('*', { count: 'exact', head: true });
  
  if (countError) console.error("Error counting clips:", countError);
  console.log("Total Clips in DB:", count);

  console.log("\n2. Fetching recent clips via API logic...");
  // Simulate API limit if applicable (video.ts uses limit(10) in getRecentClips)
  const { data: dbClips, error: selectError } = await supabase
    .from('clips')
    .select('id, created_at, storage_path, thumbnail_storage_path, video_url, thumbnail_url, is_archived')
    .eq('is_archived', false)
    .order('created_at', { ascending: false });
    
  if (selectError) console.error("Error fetching clips:", selectError);
  console.log(`Total non-archived clips fetched: ${dbClips?.length}`);
  
  console.log("\n3. Analyzing missing paths...");
  let missingStoragePath = 0;
  let missingThumbPath = 0;
  let hasLegacyUrls = 0;
  
  dbClips?.forEach(c => {
    if (!c.storage_path) missingStoragePath++;
    if (!c.thumbnail_storage_path) missingThumbPath++;
    if (c.video_url || c.thumbnail_url) hasLegacyUrls++;
  });
  
  console.log(`Clips missing storage_path: ${missingStoragePath}`);
  console.log(`Clips missing thumbnail_storage_path: ${missingThumbPath}`);
  console.log(`Clips with legacy URLs (video_url / thumbnail_url): ${hasLegacyUrls}`);

  console.log("\nDetailed dump of first 10 clips:");
  console.table(dbClips?.slice(0, 10).map(c => ({
    id: c.id,
    status: c.status,
    has_storage: !!c.storage_path,
    has_thumb: !!c.thumbnail_storage_path,
    has_legacy: !!(c.video_url || c.thumbnail_url)
  })));
}

runAudit().catch(console.error);
