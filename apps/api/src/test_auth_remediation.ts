import assert from 'assert';
import { createPlayToken, verifyPlayToken } from './lib/playToken';
import { denyUnlessOwner } from './middleware/ownership';
import { hydrateJobStatusFromDb, mapDbClipsToResult } from './services/jobResultMapper';

function testPlayTokenRoundTrip() {
  const clipId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const token = createPlayToken(clipId, userId);

  assert.strictEqual(verifyPlayToken(token, clipId), userId);
  assert.strictEqual(verifyPlayToken(token, 'other-clip-id'), null);
  assert.strictEqual(verifyPlayToken('invalid-token', clipId), null);
}

function testRequireUserJWTRejectsApiKeyOnly() {
  const authModule = require('./middleware/supabaseAuth');
  assert.strictEqual(typeof authModule.requireUserJWT, 'function');
  assert.strictEqual(typeof authModule.requireServiceAuth, 'function');
  assert.strictEqual(typeof authModule.validateBearerToken, 'function');
}

async function testMiddlewareBehavior() {
  const { requireUserJWT, requireServiceAuth } = await import('./middleware/supabaseAuth');

  const createRes = () => {
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    return res;
  };

  const missingTokenReq: any = { headers: {} };
  const missingTokenRes = createRes();
  let nextCalled = false;
  await requireUserJWT(missingTokenReq, missingTokenRes, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(missingTokenRes.statusCode, 401);

  const apiKeyOnlyReq: any = {
    headers: {
      'x-excerpt-api-key': 'super-secret-key',
    },
  };
  const apiKeyOnlyRes = createRes();
  nextCalled = false;
  await requireUserJWT(apiKeyOnlyReq, apiKeyOnlyRes, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(apiKeyOnlyRes.statusCode, 401);

  const serviceDisabledRes = createRes();
  const previous = process.env.EXCERPT_ALLOW_SERVICE_KEY;
  delete process.env.EXCERPT_ALLOW_SERVICE_KEY;
  nextCalled = false;
  await requireServiceAuth(apiKeyOnlyReq, serviceDisabledRes, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(serviceDisabledRes.statusCode, 403);
  if (previous) process.env.EXCERPT_ALLOW_SERVICE_KEY = previous;
}

function testFailClosedOwnership() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  assert.strictEqual(denyUnlessOwner(null, 'user-a', res, 'job'), false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(denyUnlessOwner('user-b', 'user-a', res, 'job'), false);
  assert.strictEqual(denyUnlessOwner('user-a', 'user-a', res, 'job'), true);
}

function testJobResultHydration() {
  const hydrated = hydrateJobStatusFromDb({
    id: 'job-1',
    status: 'completed',
    clips: [
      {
        id: 'clip-1',
        job_id: 'job-1',
        video_url: 'https://example.com/a.mp4',
        thumbnail_url: 'https://example.com/a.jpg',
        title: 'Clip A',
        caption: 'Caption A',
        start_time: 0,
        end_time: 10,
        metadata: { title: 'Clip A' },
      },
    ],
  });

  assert.strictEqual(hydrated.result.length, 1);
  assert.strictEqual(hydrated.result[0].video_file, 'https://example.com/a.mp4');
  assert.strictEqual(mapDbClipsToResult([]).length, 0);
}

async function main() {
  testPlayTokenRoundTrip();
  testRequireUserJWTRejectsApiKeyOnly();
  testFailClosedOwnership();
  testJobResultHydration();
  await testMiddlewareBehavior();
  console.log('[auth-remediation] all tests passed');
}

main().catch((error) => {
  console.error('[auth-remediation] failed:', error);
  process.exit(1);
});
