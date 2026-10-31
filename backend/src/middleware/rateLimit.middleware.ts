import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/http.js';

/** Fixed-window limiter for auth endpoints, keyed by client IP. In-memory, so per server process. */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
    next();
  };
}
