import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
db.from('clips').select('id, title, storage_path, video_url').order('created_at', { ascending: false }).limit(1).then(r => {
  console.log(JSON.stringify(r.data, null, 2));
}).catch(console.error);
