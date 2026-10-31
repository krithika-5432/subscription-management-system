import type { NextFunction, Request, Response } from 'express';
import type { RoleCode } from '../types/index.js';
import { forbidden, unauthorized } from '../utils/http.js';

export const requireRole =
  (...roles: RoleCode[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };

/** Admin holds every permission. Staff need at least one of those listed. Customers hold none. */
export const requirePermission =
  (...permissions: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'staff' && permissions.some((p) => req.user!.permissions.includes(p))) return next();
    throw forbidden();
  };

export const adminOnly = requireRole('admin');
export const internalOnly = requireRole('admin', 'staff');
export const customerOnly = requireRole('customer');
