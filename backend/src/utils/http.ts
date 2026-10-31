import type { Response } from 'express';
import { z } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);

export const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const okPage = <T>(res: Response, page: Page<T>) =>
  res.json({
    success: true,
    data: page.rows,
    meta: { total: page.total, page: page.page, pageSize: page.pageSize, totalPages: Math.ceil(page.total / page.pageSize) },
  });

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
export type Paging = z.infer<typeof pagingSchema>;

/** Express 5 route params are typed string | string[]; every route here uses plain single-value params. */
export const param = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
