import { config } from 'dotenv';
config();
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

async function run() {
  const s3 = new S3Client({
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    region: 'us-west-004',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID || '00578b2722b52f60000000001',
      secretAccessKey: process.env.B2_APPLICATION_KEY || 'K005u3rN50XwXy9yH0/T+6+6AIfQz7w'
    }
  });

  console.log('Downloading video...');
  const res = await s3.send(new GetObjectCommand({
    Bucket: 'excerpt-clips',
    Key: 'voiceovers/76dd023a-7494-48f1-8894-64aa08f5d80b/a50355f3-02e1-4642-9f59-9f6d0e455176.mp4'
  }));

  const st = res.Body as any;
  const ws = fs.createWriteStream('final_voiceover.mp4');
  st.pipe(ws);
  
  await new Promise((resolve) => ws.on('finish', resolve));
  console.log('Done downloading video');
}
run().catch(console.error);
