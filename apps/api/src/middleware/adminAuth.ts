import { Request, Response, NextFunction } from 'express';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  // In a real app, verify Supabase auth token and check if email is in whitelist
  // For immediate debugging on Render, we can use a simple header check or env var
  const secret = req.headers['x-admin-secret'];
  
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) {
    return next();
  }
  
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  res.status(403).json({ error: 'Unauthorized. Admin access required.' });
};
