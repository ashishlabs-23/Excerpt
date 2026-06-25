import { Request, Response, NextFunction } from 'express';
import { withLogContext } from '../services/logger';
import crypto from 'crypto';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const traceId = (req.headers['x-trace-id'] as string) || crypto.randomUUID();
  
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', traceId);

  const context: Record<string, any> = {
    requestId,
    traceId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
  };

  withLogContext(context, () => {
    console.log(`[Request] ${req.method} ${context.url} - Started`);
    
    const start = Date.now();
    
    res.on('finish', () => {
      const elapsed = Date.now() - start;
      console.log(`[Response] ${req.method} ${context.url} - Status: ${res.statusCode} (${elapsed}ms)`);
    });

    next();
  });
}
