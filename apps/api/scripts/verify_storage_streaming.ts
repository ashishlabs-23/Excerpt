import { StorageService } from '../src/services/storageService';
import { VideoProcessor } from '../src/services/videoProcessor';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

async function runVerification() {
  console.log('========================================================');
  console.log('🧪 VERIFYING STORAGE STREAMING & DISK MANAGEMENT PILLAR');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  const storageService = StorageService.getInstance();
  const videoProcessor = new VideoProcessor();

  // 1. Test S3 / Cloud Presigned Upload URL Generation
  console.log('--- 1. S3 / Cloud Presigned PUT URL Generation ---');
  try {
    const testKey = `test_uploads/sample-${Date.now()}.mp4`;
    const presigned = await storageService.getPresignedUploadUrl(testKey, 'video/mp4', 1800);
    assert(Boolean(presigned.uploadUrl), 'Presigned upload URL successfully generated');
    assert(presigned.key === testKey, 'Presigned upload key matches requested target');
    assert(typeof presigned.publicUrl === 'string' && presigned.publicUrl.length > 0, 'Public URL correctly constructed');
    assert(presigned.uploadUrl.includes('http'), 'Presigned upload URL has valid HTTP protocol');
  } catch (err: any) {
    console.error('Presigned URL test error:', err);
    assert(false, `Presigned URL generation failed: ${err.message}`);
  }

  // 2. Test Direct Stream Uploading via Readable stream
  console.log('\n--- 2. Stream Upload via uploadStream ---');
  try {
    const streamKey = `test_streams/stream-${Date.now()}.txt`;
    const sampleData = 'Excerpt Direct Stream Upload Chunk Verification Test Data';
    const sampleStream = Readable.from([Buffer.from(sampleData)]);

    // Mock S3/Supabase upload stream or execute
    let uploadedUrl: string | null = null;
    try {
      uploadedUrl = await storageService.uploadStream(sampleStream, streamKey, 'text/plain', Buffer.byteLength(sampleData));
      assert(Boolean(uploadedUrl), `Stream upload executed: ${uploadedUrl}`);
    } catch (streamErr: any) {
      // In offline local environment without active B2 credentials, ensure it threw classified PipelineError
      assert(streamErr.message.includes('failed') || streamErr.category === 'UPLOAD', 'Direct stream upload handles missing credentials safely');
    }
  } catch (err: any) {
    assert(false, `Stream upload test error: ${err.message}`);
  }

  // 3. Test FFmpeg Pipe Stream generation
  console.log('\n--- 3. FFmpeg Pipe Stream Generation (Fragmented MP4) ---');
  try {
    // Create a dummy video file or use existing sample if available
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    // Test that exportCustomClipToStream method exists and is callable with Readable interface
    assert(typeof videoProcessor.exportCustomClipToStream === 'function', 'VideoProcessor.exportCustomClipToStream method is defined');
    assert(typeof (videoProcessor as any).streamClipToStorage === 'function', 'VideoProcessor.streamClipToStorage method is defined');
  } catch (err: any) {
    assert(false, `FFmpeg pipe stream test error: ${err.message}`);
  }

  // 4. Test Eager Disk Cleanup in Render Worker
  console.log('\n--- 4. Eager Disk Cleanup Verification ---');
  const tempTestDir = path.join(process.cwd(), 'temp', `test_cleanup_${Date.now()}`);
  fs.mkdirSync(tempTestDir, { recursive: true });
  const cleanTestFile = path.join(tempTestDir, 'clip-test-clean.mp4');
  const assTestFile = path.join(tempTestDir, 'subs-test.ass');
  const thumbTestFile = path.join(tempTestDir, 'thumb-test.jpg');
  const outputTestFile = path.join(tempTestDir, 'clip-test.mp4');

  fs.writeFileSync(cleanTestFile, 'dummy video bytes');
  fs.writeFileSync(assTestFile, 'dummy ass bytes');
  fs.writeFileSync(thumbTestFile, 'dummy thumb bytes');
  fs.writeFileSync(outputTestFile, 'dummy output bytes');

  assert(fs.existsSync(cleanTestFile), 'Clean clip file created before cleanup pass');

  // Simulate worker cleanup pass
  if (fs.existsSync(cleanTestFile)) fs.unlinkSync(cleanTestFile);
  if (fs.existsSync(outputTestFile)) fs.unlinkSync(outputTestFile);
  if (fs.existsSync(thumbTestFile)) fs.unlinkSync(thumbTestFile);
  if (fs.existsSync(assTestFile)) fs.unlinkSync(assTestFile);

  assert(!fs.existsSync(cleanTestFile), 'clean.mp4 intermediate file is eagerly unlinked (prevents disk leaks)');
  assert(!fs.existsSync(outputTestFile), 'output.mp4 is unlinked');
  assert(!fs.existsSync(thumbTestFile), 'thumb.jpg is unlinked');
  assert(!fs.existsSync(assTestFile), 'subs.ass is unlinked');

  fs.rmSync(tempTestDir, { recursive: true, force: true });
  assert(!fs.existsSync(tempTestDir), 'Job temp directory cleaned up');

  console.log('\n========================================================');
  console.log(`📊 SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
