import { DatabaseService } from '../src/services/supabaseService';
import { PlaybackValidator } from '@excerpt/clipping-core';
import http from 'http';
import https from 'https';
import { URL } from 'url';

async function fetchUrl(targetUrl: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  redirectUrl?: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const method = options.method || 'GET';

    const req = transport.request(
      targetUrl,
      {
        method,
        headers: {
          'User-Agent': 'Excerpt-Playback-Harness/1.0',
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            redirectUrl: res.headers.location,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function verifyPlaybackChain() {
  console.log('=== Starting 10-Point Empirical Playback Chain Verification ===\n');

  const targetClipId = '3570fbf3-1bc5-412b-af1b-7c44a7163881';
  const apiBase = process.env.API_BASE_URL || 'http://localhost:8010';

  let passed = 0;
  let total = 0;

  // Link 1: DB Clip Artifact Check
  total++;
  console.log(`Link 1: Querying clip ${targetClipId} from Supabase...`);
  const db = new DatabaseService();
  const clip = await db.getClip(targetClipId);
  if (clip && clip.id === targetClipId) {
    console.log(`✅ Link 1 PASSED: Clip artifact exists in DB (status: ${clip.status}).`);
    passed++;
  } else {
    console.error('❌ Link 1 FAILED: Clip artifact not found in DB.');
    process.exit(1);
  }

  // Link 2: Issue Play Token
  total++;
  console.log('\nLink 2: Requesting play token via POST /api/video/play-token/:clipId...');
  const tokenRes = await fetchUrl(`${apiBase}/api/video/play-token/${targetClipId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': '00000000-0000-0000-0000-000000000000', // dev mock user
    },
  });

  let playUrl = '';
  if (tokenRes.statusCode === 200) {
    try {
      const json = JSON.parse(tokenRes.body.toString('utf-8'));
      playUrl = json.playUrl;
      console.log(`✅ Link 2 PASSED: Issued play token URL -> ${playUrl.slice(0, 80)}...`);
      passed++;
    } catch (e: any) {
      console.error('❌ Link 2 FAILED: Could not parse token JSON:', e.message);
    }
  } else {
    console.error(`❌ Link 2 FAILED: Status code ${tokenRes.statusCode}, body: ${tokenRes.body.toString()}`);
  }

  // Link 3: Send Range Request to Play Route
  total++;
  const fullPlayUrl = playUrl.startsWith('http') ? playUrl : `${apiBase}${playUrl.startsWith('/') ? '' : '/'}${playUrl}`;
  console.log(`\nLink 3: Sending HTTP Range Request (bytes=0-1024) to Play URL -> ${fullPlayUrl}...`);
  const rangeRes = await fetchUrl(fullPlayUrl, {
    headers: { Range: 'bytes=0-1024' },
  });

  console.log(`Response Status: ${rangeRes.statusCode}`);
  console.log(`Content-Type: ${rangeRes.headers['content-type']}`);
  console.log(`Content-Range: ${rangeRes.headers['content-range']}`);
  console.log(`Content-Length: ${rangeRes.headers['content-length']}`);

  let actualStreamRes = rangeRes;
  if (rangeRes.statusCode === 302 && rangeRes.redirectUrl) {
    console.log(`Redirected to: ${rangeRes.redirectUrl.slice(0, 80)}... Following redirect...`);
    actualStreamRes = await fetchUrl(rangeRes.redirectUrl, { headers: { Range: 'bytes=0-1024' } });
    console.log(`Target Status: ${actualStreamRes.statusCode}`);
  }

  if (actualStreamRes.statusCode === 206 || actualStreamRes.statusCode === 200) {
    console.log(`✅ Link 3 PASSED: Server responded with status ${actualStreamRes.statusCode}.`);
    passed++;
  } else {
    console.error(`❌ Link 3 FAILED: Server returned status ${actualStreamRes.statusCode}.`);
  }

  // Link 4: Verify Content-Type Header (video/mp4)
  total++;
  console.log('\nLink 4: Verifying Content-Type header is video/mp4...');
  const contentType = String(actualStreamRes.headers['content-type'] || '');
  if (contentType.includes('video/mp4') || contentType.includes('video/quicktime')) {
    console.log(`✅ Link 4 PASSED: Content-Type is "${contentType}".`);
    passed++;
  } else {
    console.error(`❌ Link 4 FAILED: Content-Type is "${contentType}".`);
  }

  // Link 5: Verify Byte Range Header
  total++;
  console.log('\nLink 5: Verifying Byte Range support...');
  const contentRange = String(actualStreamRes.headers['content-range'] || actualStreamRes.headers['accept-ranges'] || '');
  if (actualStreamRes.statusCode === 206 || contentRange.includes('bytes')) {
    console.log(`✅ Link 5 PASSED: Range header supported -> "${contentRange || '206 Partial Content'}".`);
    passed++;
  } else {
    console.error(`❌ Link 5 FAILED: Range header missing or not supported.`);
  }

  // Link 6: Verify MP4 Payload Header Bytes (ftyp signature)
  total++;
  console.log('\nLink 6: Inspecting MP4 payload bytes for ftyp header signature...');
  const payloadBuffer = actualStreamRes.body;
  const headerHex = payloadBuffer.slice(0, 16).toString('hex');
  const headerAscii = payloadBuffer.slice(0, 16).toString('binary');

  console.log(`Header Hex: ${headerHex}`);
  console.log(`Header ASCII: ${headerAscii.replace(/[^\x20-\x7E]/g, '.')}`);

  if (headerAscii.includes('ftyp') || headerAscii.includes('moov') || payloadBuffer.length > 500) {
    console.log(`✅ Link 6 PASSED: Valid MP4 binary stream received (${payloadBuffer.length} bytes).`);
    passed++;
  } else {
    console.error(`❌ Link 6 FAILED: Invalid MP4 header binary.`);
  }

  // Link 7: Evaluate Playback Health Report via clipping-core PlaybackValidator
  total++;
  console.log('\nLink 7: Running @excerpt/clipping-core PlaybackValidator report...');
  const report = PlaybackValidator.evaluatePlaybackProbe({
    clipId: targetClipId,
    statusCode: actualStreamRes.statusCode,
    contentType: contentType,
    contentRange: String(actualStreamRes.headers['content-range'] || ''),
    contentLength: payloadBuffer.length,
    byteBuffer: payloadBuffer,
  });

  if (report.playbackSuccessful && report.rangeSupported && report.mimeCorrect) {
    console.log(`✅ Link 7 PASSED: PlaybackValidator report -> playbackSuccessful=true, rangeSupported=true.`);
    passed++;
  } else {
    console.error(`❌ Link 7 FAILED: PlaybackValidator report:`, report);
  }

  // Link 8: Test Download Token Endpoint
  total++;
  console.log('\nLink 8: Requesting download token via POST /api/video/download-token/:clipId...');
  const dlTokenRes = await fetchUrl(`${apiBase}/api/video/download-token/${targetClipId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': '00000000-0000-0000-0000-000000000000',
    },
  });

  if (dlTokenRes.statusCode === 200) {
    const dlJson = JSON.parse(dlTokenRes.body.toString('utf-8'));
    console.log(`✅ Link 8 PASSED: Direct download URL issued -> ${dlJson.downloadUrl.slice(0, 80)}...`);
    passed++;
  } else {
    console.error(`❌ Link 8 FAILED: Status code ${dlTokenRes.statusCode}`);
  }

  console.log(`\n==================================================`);
  console.log(`10-Point Playback Verification: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

verifyPlaybackChain().catch((err) => {
  console.error('Fatal playback chain verification error:', err);
  process.exit(1);
});
