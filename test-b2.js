const { StorageService } = require('./apps/api/dist/services/storageService');
const fs = require('fs');

async function testUploading() {
  const svc = StorageService.getInstance();
  fs.writeFileSync('test.txt', 'Hello world');
  try {
    const url = await svc.uploadFile('test.txt', 'test-upload.txt');
    console.log("SUCCESS URL:", url);
  } catch (err) {
    console.error("UPLOAD FAILED:", err);
  }
}
testUploading();
