import { config } from 'dotenv';
config();
import { StorageService } from './apps/api/src/services/storageService';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const storage = new StorageService();

async function run() {
  const path = 'jobs/16a17704-8ba8-473a-982a-5bdb669f56bf/a78eace9-502c-435d-a53f-3c7035b06515.mp4';
  const signedUrl = await storage.createSignedUrl(path);
  console.log("Signed URL:", signedUrl);
  
  try {
    const { stdout, stderr } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      signedUrl
    ]);
    
    console.log("Stdout:", stdout);
    console.log("Stderr:", stderr);
    console.log("Streams split by literal backslash n:", stdout.split('\\n').map(s => s.trim()).filter(Boolean));
    console.log("Streams split by actual newline:", stdout.split('\n').map(s => s.trim()).filter(Boolean));
  } catch (err) {
    console.error("FFprobe Error:", err);
  }
}
run();
