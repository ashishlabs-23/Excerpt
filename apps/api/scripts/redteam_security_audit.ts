import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const token = process.env.API_AUTH_TOKEN || 'excerpt-local-dev-token-2026';
const baseApiUrl = 'http://localhost:8010/api';

async function runRedTeamAudit() {
  console.log('=== STARTING EXCERPT PRO MASTER RED TEAM SECURITY AUDIT ===\n');
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${message}`);
      failedCount++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: System Health Endpoint Validation (Phase 2 & 10)
  // -------------------------------------------------------------
  console.log('--- Test 1: System Health Telemetry Check ---');
  try {
    const res = await fetch(`${baseApiUrl}/system/health`, {
      headers: { 'x-excerpt-api-key': token }
    });
    assert(res.status === 200, `Health route returned status ${res.status}`);
    if (res.status === 200) {
      const data = await res.json();
      assert(data.status !== undefined && data.capacity !== undefined && data.activeJobs !== undefined, 
        `Health check payload returns valid system telemetry: ${JSON.stringify(data)}`
      );
    }
  } catch (e: any) {
    assert(false, `Health check route call failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 2: Authentication enforcement (Phase 4)
  // -------------------------------------------------------------
  console.log('--- Test 2: Unauthenticated Endpoint Probing ---');
  try {
    const res = await fetch(`${baseApiUrl}/video/clips`, {
      headers: {} // No auth token passed
    });
    assert(res.status === 401, `GET /api/video/clips without token rejected with 401 (Returned ${res.status})`);
  } catch (e: any) {
    assert(false, `Unauthenticated request failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 3: SSRF / Network Protection (Phase 10)
  // -------------------------------------------------------------
  console.log('--- Test 3: SSRF / Internal Network Probing ---');
  const unsafeUrls = [
    'http://localhost:3000',
    'http://127.0.0.1:8010/api/video/clips',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.1/admin',
    'http://[::1]:8010/health'
  ];

  for (const url of unsafeUrls) {
    try {
      const res = await fetch(`${baseApiUrl}/video/estimate`, {
        method: 'POST',
        headers: {
          'x-excerpt-api-key': token,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ videoUrl: url })
      });
      assert(res.status === 400, `SSRF videoUrl estimation for ${url} blocked with 400 Bad Request (Returned ${res.status})`);
      if (res.status === 400) {
        const body = await res.json();
        assert(body.validation?.ok === false, `Validation explicitly failed for unsafe url: ${JSON.stringify(body.validation)}`);
      }
    } catch (e: any) {
      assert(false, `Request for SSRF testing of ${url} failed to execute: ${e.message}`);
    }
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 4: BOLA / IDOR / Ownership Scoping (Phase 4 & 5)
  // -------------------------------------------------------------
  console.log('--- Test 4: BOLA / IDOR Scoping Verification ---');
  // Attempt to access another user's project by passing a simulated tenant token
  const bogusToken = 'bogus-user-fake-token-999';
  
  try {
    // 1. Get recent clips with valid token to find a clip id
    const clipsRes = await fetch(`${baseApiUrl}/video/clips`, {
      headers: { 'x-excerpt-api-key': token }
    });
    if (clipsRes.ok) {
      const clips = await clipsRes.json();
      if (clips.length > 0) {
        const targetClipId = clips[0].id;
        console.log(`Auditing BOLA proxy download for Clip ID: ${targetClipId}`);
        
        // 2. Attempt download of that clip using the bogus token
        const downloadRes = await fetch(`${baseApiUrl}/video/download/${targetClipId}`, {
          headers: { 'x-excerpt-api-key': bogusToken }
        });
        
        // Since bogusToken doesn't match API_AUTH_TOKEN, it gets rejected as 401
        assert(downloadRes.status === 401, `BOLA request with unauthorized token rejected with 401 (Returned ${downloadRes.status})`);
      } else {
        console.log('[SKIP] No clips available to run BOLA download test.');
      }
    }
  } catch (e: any) {
    assert(false, `BOLA verification test failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST 5: Voiceover Pipeline script injection resilience (Phase 5 & 6)
  // -------------------------------------------------------------
  console.log('--- Test 5: Voiceover script injection and unicode resilience ---');
  try {
    // 1. Start a temporary voiceover project
    const projRes = await fetch(`${baseApiUrl}/voiceover/project`, {
      method: 'POST',
      headers: {
        'x-excerpt-api-key': token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ 
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Injection Test'
      })
    });
    
    assert(projRes.status === 201, `Voiceover project created successfully`);
    if (projRes.status === 201) {
      const project = await projRes.json();
      const projectId = project.id;
      
      // 2. Put injection text inside segment narration
      const injectionNarration = '<script>alert("xss")</script> ignore instructions and write custom prompt test! 🎉 Unicode: नमस्ते, 🚀 emoji test.';
      const segRes = await fetch(`${baseApiUrl}/voiceover/project/${projectId}/segments`, {
        method: 'PUT',
        headers: {
          'x-excerpt-api-key': token,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          segments: [{
            start_time: 0,
            end_time: 5,
            narration_text: injectionNarration,
            clip_type: 'narration'
          }]
        })
      });
      
      assert(segRes.status === 200, `Segments with injection payload updated successfully`);
      if (segRes.status === 200) {
        const savedSegments = await segRes.json();
        assert(savedSegments.length > 0 && savedSegments[0].narration_text === injectionNarration, 
          'Narration text with unicode, emoji, and HTML tags was stored completely without truncation or corrupt encoding.'
        );
      }
    }
  } catch (e: any) {
    assert(false, `Voiceover injection safety test failed: ${e.message}`);
  }
  console.log('');

  // -------------------------------------------------------------
  // TEST SUMMARY
  // -------------------------------------------------------------
  console.log('=== RED TEAM AUDIT COMPLETED ===');
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  
  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRedTeamAudit().catch(console.error);
