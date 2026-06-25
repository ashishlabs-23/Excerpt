import crypto from 'crypto';
import { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(req: Request) {
  return req.ip || 'unknown';
}

function cleanupExpiredRateLimits(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (rateLimitStore.size > 1000) {
      cleanupExpiredRateLimits(now);
    }

    const key = `${options.keyPrefix}:${getClientIp(req)}`;
    const current = rateLimitStore.get(key);
    const entry =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + options.windowMs };

    entry.count += 1;
    rateLimitStore.set(key, entry);

    const remaining = Math.max(0, options.max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please wait before submitting another job.',
      });
    }

    return next();
  };
}

function configuredJobToken() {
  return (
    process.env.EXCERPT_JOB_SUBMISSION_TOKEN ||
    process.env.JOB_SUBMISSION_TOKEN ||
    process.env.API_AUTH_TOKEN ||
    ''
  );
}

function isAuthRequired(token: string) {
  return (
    Boolean(token) ||
    process.env.EXCERPT_REQUIRE_JOB_AUTH === 'true'
  );
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function submittedToken(req: Request) {
  const authHeader = req.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return (
    bearerMatch?.[1]?.trim() ||
    req.get('x-excerpt-api-key') ||
    req.get('x-api-key') ||
    ''
  );
}

export const requireJobSubmissionAuth: RequestHandler = (req, res, next) => {
  const token = configuredJobToken();
  if (!isAuthRequired(token)) {
    return next();
  }

  if (!token) {
    return res.status(503).json({
      error: 'Job submission authentication is required but no server token is configured.',
    });
  }

  const provided = submittedToken(req);
  if (!provided || !safeCompare(provided, token)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  return next();
};

export const jobSubmissionRateLimit = createRateLimiter({
  keyPrefix: 'job-submission',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each user/IP to 10 jobs per window
});

export const metadataLookupRateLimit = createRateLimiter({
  keyPrefix: 'metadata-lookup',
  windowMs: Number(process.env.EXCERPT_METADATA_RATE_WINDOW_MS || 60 * 1000),
  max: Number(process.env.EXCERPT_METADATA_RATE_MAX || 30),
});
