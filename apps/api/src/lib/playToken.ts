import crypto from 'crypto';

const PLAY_TOKEN_TTL_MS = 15 * 60 * 1000;

function getPlayTokenSecret(): string {
  return (
    process.env.EXCERPT_PLAY_TOKEN_SECRET ||
    process.env.EXCERPT_JOB_SUBMISSION_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'excerpt-dev-play-token-secret'
  );
}

export function createPlayToken(clipId: string, userId: string): string {
  const exp = Date.now() + PLAY_TOKEN_TTL_MS;
  const payload = `${clipId}:${userId}:${exp}`;
  const sig = crypto
    .createHmac('sha256', getPlayTokenSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyPlayToken(token: string, clipId: string): string | null {
  if (!token) return null;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon <= 0) return null;

    const payload = decoded.slice(0, lastColon);
    const providedSig = decoded.slice(lastColon + 1);
    const [tokenClipId, userId, expRaw] = payload.split(':');

    if (!tokenClipId || !userId || !expRaw) return null;
    if (tokenClipId !== clipId) return null;

    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const expectedSig = crypto
      .createHmac('sha256', getPlayTokenSecret())
      .update(payload)
      .digest('hex');

    const providedBuffer = Buffer.from(providedSig);
    const expectedBuffer = Buffer.from(expectedSig);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

export function buildPlayUrl(req: { protocol: string; get: (name: string) => string | undefined }, clipId: string, token: string): string {
  return `/api/video/play/${clipId}?pt=${encodeURIComponent(token)}`;
}
