import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { StorageService } from './services/storageService';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function testUpload() {
  console.log('--- B2 UPLOAD TEST ---');
  console.log('B2_KEY_ID:', process.env.B2_KEY_ID);
  console.log('B2_BUCKET_NAME:', process.env.B2_BUCKET_NAME);
  
  const storage = new StorageService();
  const testFile = path.join(__dirname, 'test_upload.txt');
  fs.writeFileSync(testFile, 'test upload content ' + new Date().toISOString());
  
  try {
    const url = await storage.uploadFile(testFile, 'test/debug-' + Date.now() + '.txt');
    console.log('UPLOAD SUCCESSFUL!');
    console.log('URL:', url);
  } catch (error: any) {
    console.error('UPLOAD FAILED!');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  }
}

testUpload();
