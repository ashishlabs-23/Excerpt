import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const filePath = path.resolve(__dirname, '../../../qsv_test.mp4');
  if (!fs.existsSync(filePath)) {
    console.error(`Sample file not found at ${filePath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const destinationPath = 'jobs/ec1987b6-407e-48e0-8b35-c2ab7dadf578/76dd023a-7494-48f1-8894-64aa08f5d80b.mp4';

  console.log(`Uploading ${filePath} to clips bucket at ${destinationPath}...`);
  const { data, error } = await supabase.storage
    .from('clips')
    .upload(destinationPath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true
    });

  if (error) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }

  console.log('Upload successful! File details:', data);
}

run().catch(console.error);
