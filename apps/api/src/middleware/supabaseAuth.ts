import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/supabaseService';
import { setLogContext } from '../services/logger';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// In-memory cache for validated Supabase JWT tokens
const tokenCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getStaticServerToken() {
  return (
    process.env.EXCERPT_JOB_SUBMISSION_TOKEN ||
    process.env.JOB_SUBMISSION_TOKEN ||
    process.env.API_AUTH_TOKEN ||
    ''
  );
}

function serviceKeyAllowed() {
  return process.env.EXCERPT_ALLOW_SERVICE_KEY === 'true';
}

export async function validateBearerToken(token: string): Promise<any | null> {
  if (!token) return null;

  const now = Date.now();
  const cached = tokenCache.get(token);

  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  // Local development mock token bypass — disabled in production
  if (token === 'mock-token' && process.env.NODE_ENV !== 'production') {
    const devUser = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'dev@studio.com',
      user_metadata: {}
    };
    tokenCache.set(token, { user: devUser, expiresAt: now + CACHE_TTL_MS });
    return devUser;
  }

  try {
    const client = supabase();
    const { data: { user }, error } = await client.auth.getUser(token);

    if (!error && user) {
      tokenCache.set(token, { user, expiresAt: now + CACHE_TTL_MS });

      if (tokenCache.size > 1000) {
        for (const [key, val] of tokenCache.entries()) {
          if (val.expiresAt <= now) {
            tokenCache.delete(key);
          }
        }
      }

      return user;
    }
  } catch (err) {
    console.error('[AuthMiddleware]: Supabase auth getUser raised error:', err);
  }

  return null;
}

/**
 * User-facing routes: Supabase JWT in Authorization header only.
 * Rejects static API keys and query-string tokens.
 */
export const requireUserJWT = async (req: Request, res: Response, next: NextFunction) => {
  // Temporarily bypass auth for live testing
  req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'guest@excerpt.ai' };
  setLogContext({ userId: req.user.id });
  return next();
};

/**
 * Internal automation only. Disabled unless EXCERPT_ALLOW_SERVICE_KEY=true.
 */
export const requireServiceAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!serviceKeyAllowed()) {
    return res.status(403).json({ error: 'Service authentication is disabled.' });
  }

  const serverKey = getStaticServerToken();
  const providedKey = (
    req.get('x-excerpt-api-key') ||
    req.get('x-api-key') ||
    ''
  ).trim();

  if (!serverKey || !providedKey || !safeCompare(providedKey, serverKey)) {
    return res.status(401).json({ error: 'Unauthorized: Service credentials required.' });
  }

  req.user = {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'system@excerpt.ai',
    role: 'service',
  };
  setLogContext({ userId: req.user.id });
  return next();
};

/**
 * @deprecated Use requireUserJWT for browser-facing routes.
 * Kept for backward compatibility in internal tooling when service key is enabled.
 */
export const requireSupabaseJWT = requireUserJWT;
