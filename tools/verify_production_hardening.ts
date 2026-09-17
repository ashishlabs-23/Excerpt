import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const token = process.env.API_AUTH_TOKEN || 'excerpt-local-dev-token-2026';
const baseApiUrl = 'http://localhost:8010/api';

async function runHardeningTests() {
  console.log('=== RUNNING PRODUCTION HARDENING INTEGRATION TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Health Telemetry Check
  // -------------------------------------------------------------
  console.log('--- Test 1: System Health Telemetry Verification ---');
  try {
    const res = await fetch(`${baseApiUrl}/system/health`, {
      headers: { 'x-excerpt-api-key': token }
    });
    assert(res.status === 200, `Health route returned status ${res.status}`);
    if (res.status === 200) {
      const data = await res.json();
      assert(data.status !== undefined && data.capacity !== undefined && data.memoryUsage !== undefined,
        `Telemetry payload verified: ${JSON.stringify(data)}`
      );
    }
  } catch (e: any) {
    assert(false, `Health check route failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 2: Invalid Magic Bytes File Upload Rejection
  // -------------------------------------------------------------
  console.log('--- Test 2: Invalid Magic Bytes File Upload Check ---');
  try {
    const tempFilePath = path.join(process.cwd(), 'temp', 'dummy_malicious.txt');
    if (!fs.existsSync(path.dirname(tempFilePath))) {
      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
    }
    fs.writeFileSync(tempFilePath, 'This is a plain text file disguised as mp4 but contains script: alert("exploit")');

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(tempFilePath);
    const fileBlob = new Blob([fileBuffer], { type: 'video/mp4' });
    formData.append('video', fileBlob, 'exploit.mp4');

    const res = await fetch(`${baseApiUrl}/video/upload`, {
      method: 'POST',
      headers: {
        'x-excerpt-api-key': token
      },
      body: formData as any
    });

    try { fs.unlinkSync(tempFilePath); } catch {}

    assert(res.status === 400, `Upload rejected invalid file with 400 Bad Request (Returned ${res.status})`);
    if (res.status === 400) {
      const data = await res.json();
      assert(data.error && data.error.includes('Magic bytes mismatch'), `Expected magic bytes error message: "${data.error}"`);
    }
  } catch (e: any) {
    assert(false, `Upload safety test failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 3: Valid Magic Bytes File Upload Acceptance
  // -------------------------------------------------------------
  console.log('--- Test 3: Valid Magic Bytes Upload Check ---');
  let activeJobId: string | null = null;
  try {
    const realVideoPath = path.join(process.cwd(), 'test_download.mp4');
    if (!fs.existsSync(realVideoPath)) {
      console.warn(`[SKIP] 'test_download.mp4' not found at root. Creating a mock file with valid MP4 headers for testing.`);
      // Mock minimum valid MP4 header (ftyp brand)
      const mockMp4 = Buffer.alloc(100);
      mockMp4.write('ftypmp42', 4);
      fs.writeFileSync(realVideoPath, mockMp4);
    }

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(realVideoPath);
    const fileBlob = new Blob([fileBuffer], { type: 'video/mp4' });
    formData.append('video', fileBlob, 'test_download.mp4');
    formData.append('numClips', '3');

    const res = await fetch(`${baseApiUrl}/video/upload`, {
      method: 'POST',
      headers: {
        'x-excerpt-api-key': token
      },
      body: formData as any
    });

    assert(res.status === 202, `Upload accepted valid file with 202 Accepted (Returned ${res.status})`);
    if (res.status === 202) {
      const data = await res.json();
      assert(data.jobId !== undefined, `Job ID returned successfully: ${data.jobId}`);
      activeJobId = data.jobId;
    }
  } catch (e: any) {
    assert(false, `Valid file upload failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 4: Job Controls - Cancel
  // -------------------------------------------------------------
  console.log('--- Test 4: Job Cancellation Control Check ---');
  if (activeJobId) {
    try {
      const res = await fetch(`${baseApiUrl}/video/jobs/${activeJobId}/cancel`, {
        method: 'POST',
        headers: { 'x-excerpt-api-key': token }
      });
      assert(res.status === 200, `Cancel request succeeded with 200 OK (Returned ${res.status})`);

      // Verify status transitions to cancelled
      const statusRes = await fetch(`${baseApiUrl}/video/status/${activeJobId}`, {
        headers: { 'x-excerpt-api-key': token }
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        assert(data.status === 'cancelled', `Job status correctly transitioned to 'cancelled'`);
      }
    } catch (e: any) {
      assert(false, `Job cancellation failed: ${e.message}`);
    }
  } else {
    console.log('[SKIP] No activeJobId for cancellation test.');
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 5: Job Controls - Retry
  // -------------------------------------------------------------
  console.log('--- Test 5: Job Retry Control Check ---');
  if (activeJobId) {
    try {
      const res = await fetch(`${baseApiUrl}/video/jobs/${activeJobId}/retry`, {
        method: 'POST',
        headers: { 'x-excerpt-api-key': token }
      });
      assert(res.status === 200, `Retry request succeeded with 200 OK (Returned ${res.status})`);

      // Verify status transitions back to queued (or already claimed by worker)
      const statusRes = await fetch(`${baseApiUrl}/video/status/${activeJobId}`, {
        headers: { 'x-excerpt-api-key': token }
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        const activeOrQueued = ['queued', 'processing', 'transcribing', 'detecting_clips', 'cutting', 'captioning'].includes(data.status);
        assert(activeOrQueued, `Job status correctly reset to 'queued' or claimed by worker: '${data.status}'`);
      }
    } catch (e: any) {
      assert(false, `Job retry failed: ${e.message}`);
    }
  } else {
    console.log('[SKIP] No activeJobId for retry test.');
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 6: Job Controls - Restart
  // -------------------------------------------------------------
  console.log('--- Test 6: Job Restart Control Check ---');
  if (activeJobId) {
    try {
      const res = await fetch(`${baseApiUrl}/video/jobs/${activeJobId}/restart`, {
        method: 'POST',
        headers: { 'x-excerpt-api-key': token }
      });
      assert(res.status === 200, `Restart request succeeded with 200 OK (Returned ${res.status})`);

      // Verify status transitions back to queued (or already claimed by worker)
      const statusRes = await fetch(`${baseApiUrl}/video/status/${activeJobId}`, {
        headers: { 'x-excerpt-api-key': token }
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        const activeOrQueued = ['queued', 'processing', 'transcribing', 'detecting_clips', 'cutting', 'captioning'].includes(data.status);
        assert(activeOrQueued && data.progress >= 0, `Job status correctly reset/restarted: '${data.status}' (progress: ${data.progress}%)`);
      }
    } catch (e: any) {
      assert(false, `Job restart failed: ${e.message}`);
    }
  } else {
    console.log('[SKIP] No activeJobId for restart test.');
  }
  console.log('');

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('=== HARDENING INTEGRATION TESTS SUMMARY ===');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHardeningTests().catch(console.error);
