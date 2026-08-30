import { Request, Response, NextFunction } from 'express';
import { initFirebaseAdmin } from '../services/firebaseService';

export async function verifyAppCheckToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Allow bypassing in development / test environments if not enforced
  if (process.env.NODE_ENV !== 'production' || process.env.ENFORCE_APP_CHECK !== 'true') {
    next();
    return;
  }

  const appCheckToken = req.header('X-Firebase-AppCheck');
  if (!appCheckToken) {
    res.status(401).json({ error: 'App Check token required' });
    return;
  }

  try {
    const admin = initFirebaseAdmin();
    await admin.appCheck().verifyToken(appCheckToken);
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized: Invalid App Check token' });
  }
}
