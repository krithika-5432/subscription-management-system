import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/http.js';

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ success: false, error: { code, message, details } });
}

export function notFoundHandler(_req: Request, res: Response) {
  send(res, 404, 'NOT_FOUND', 'Route not found');
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return send(res, 400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid input', details);
  }
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'BAD_REQUEST', 'Malformed JSON body');
  switch (err?.code) {
    case '23505':
      return send(res, 409, 'CONFLICT', 'A record with these details already exists');
    case '23503':
      return send(res, 409, 'CONFLICT', 'This record references, or is referenced by, other records');
    case '23514':
      return send(res, 400, 'BAD_REQUEST', 'The values provided break a data rule');
    case '22P02':
    case '22007':
    case '22008':
      return send(res, 400, 'BAD_REQUEST', 'Invalid identifier or value');
  }
  // Full detail goes to the server log only. Stack traces never reach the client.
  console.error(err);
  send(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
