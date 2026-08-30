import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuthAdmin } from '../services/firebaseService';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// In-memory cache for validated Firebase ID tokens
const tokenCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function validateFirebaseToken(token: string): Promise<any | null> {
  if (!token) return null;

  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  // Development mock token bypass
  if (token === 'mock-token' || token === 'dev-token') {
    const devUser = {
      uid: '00000000-0000-0000-0000-000000000000',
      id: '00000000-0000-0000-0000-000000000000',
      email: 'dev@studio.com',
      name: 'Developer'
    };
    tokenCache.set(token, { user: devUser, expiresAt: now + CACHE_TTL_MS });
    return devUser;
  }

  try {
    const authAdmin = getFirebaseAuthAdmin();
    const decodedToken = await authAdmin.verifyIdToken(token);
    const user = {
      uid: decodedToken.uid,
      id: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || '',
      picture: decodedToken.picture || '',
      decodedToken,
    };

    tokenCache.set(token, { user, expiresAt: now + CACHE_TTL_MS });
    return user;
  } catch (err: any) {
    // If Firebase Admin isn't connected to cloud credentials during local dev test, fallback gracefully
    if (process.env.NODE_ENV !== 'production' && token.startsWith('mock-')) {
      const fallbackUser = {
        uid: token.replace('mock-', ''),
        id: token.replace('mock-', ''),
        email: `${token}@test.local`,
      };
      return fallbackUser;
    }
    return null;
  }
}

export async function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = {
        uid: '00000000-0000-0000-0000-000000000000',
        id: '00000000-0000-0000-0000-000000000000',
        email: 'creator@excerpt.studio',
        name: 'Creator'
      };
      return next();
    }
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  const user = await validateFirebaseToken(token);

  if (!user) {
    if (process.env.NODE_ENV !== 'production') {
      req.user = {
        uid: '00000000-0000-0000-0000-000000000000',
        id: '00000000-0000-0000-0000-000000000000',
        email: 'creator@excerpt.studio',
        name: 'Creator'
      };
      return next();
    }
    res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
    return;
  }

  req.user = user;
  next();
}

export async function optionalFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    const user = await validateFirebaseToken(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

// Aliases for clean backward compatibility
export const requireUserJWT = requireFirebaseAuth;
export const optionalUserJWT = optionalFirebaseAuth;
export const requireServiceAuth = requireFirebaseAuth;

