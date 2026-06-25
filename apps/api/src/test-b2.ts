import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Root .env check
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

async function testB2() {
  const bucket = process.env.B2_BUCKET_NAME || "excerpt-clips";
  const region = process.env.B2_REGION || "us-west-004";
  const accessKeyId = process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "";
  const secretAccessKey = process.env.B2_APPLICATION_KEY || "";

  console.log('--- B2 TEST CONFIG ---');
  console.log('Bucket:', bucket);
  console.log('Region:', region);
  console.log('KeyID:', accessKeyId.substring(0, 10) + '...');
  
  if (!accessKeyId || !secretAccessKey) {
    console.error('CRITICAL: Missing credentials in current process context.');
    process.exit(1);
  }

  const s3 = new S3Client({
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: { accessKeyId, secretAccessKey },
    region,
  });

  const testKey = 'godmode-test.txt';
  const content = 'Godmode Visual Verification Proof';

  try {
    console.log('Uploading test file to B2...');
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: content,
      ContentType: 'text/plain',
    }));

    const publicUrl = `https://${bucket}.s3.${region}.backblazeb2.com/${testKey}`;
    console.log('SUCCESS! Public URL:', publicUrl);
    
    console.log('--- VERIFYING ACCESSIBILITY ---');
    const response = await fetch(publicUrl);
    if (response.ok) {
      console.log('HTTP OK! File is publicly readable.');
    } else {
      console.error('HTTP ERROR:', response.status, response.statusText);
      console.error('HINT: Check if the B2 bucket is set to PUBLIC.');
    }
  } catch (err: any) {
    console.error('UPLOAD FAILED:', err.message);
  }
}

testB2();
