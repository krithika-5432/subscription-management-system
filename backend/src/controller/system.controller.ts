import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/environment.js';
import * as repo from '../repositories/system.repository.js';
import * as system from '../services/system.service.js';
import { ok, param } from '../utils/http.js';

export const search = async (req: Request, res: Response) => {
  const { q } = z.object({ q: z.string().trim().min(2, 'Type at least two characters').max(100) }).parse(req.query);
  ok(res, await system.globalSearch(req.user!, q));
};

export const notifications = async (req: Request, res: Response) => {
  const [items, unread] = await Promise.all([repo.listNotifications(req.user!.id), repo.countUnreadNotifications(req.user!.id)]);
  ok(res, { items, unread });
};
export const readNotification = async (req: Request, res: Response) => {
  await repo.markNotificationRead(req.user!.id, param(req.params.id));
  ok(res, { read: true });
};
export const readAllNotifications = async (req: Request, res: Response) => {
  await repo.markAllNotificationsRead(req.user!.id);
  ok(res, { read: true });
};

export const publicPlans = async (_req: Request, res: Response) => {
  const plans = await system.availablePlans();
  ok(res, plans.map(({ id, name, description, price, billingFrequency, minQuantity }: any) => ({ id, name, description, price, billingFrequency, minQuantity })));
};
export const publicInfo = async (_req: Request, res: Response) => ok(res, { ...(await system.publicInfo()), googleEnabled: !!env.googleClientId });
