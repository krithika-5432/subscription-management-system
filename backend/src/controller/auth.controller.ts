import type { Request, Response } from 'express';
import { findCustomerById } from '../repositories/customer.repository.js';
import * as auth from '../services/auth.service.js';
import { ok } from '../utils/http.js';
import * as v from '../validators/auth.validators.js';

export const register = async (req: Request, res: Response) => ok(res, await auth.register(v.registerSchema.parse(req.body)), 201);
export const login = async (req: Request, res: Response) => ok(res, await auth.login(v.loginSchema.parse(req.body)));
export const google = async (req: Request, res: Response) => ok(res, await auth.loginWithGoogle(v.googleLoginSchema.parse(req.body)));

export const logout = async (req: Request, res: Response) => {
  await auth.logout(req.user!);
  ok(res, { loggedOut: true });
};

export const forgot = async (req: Request, res: Response) => {
  await auth.forgotPassword(v.forgotSchema.parse(req.body).email);
  ok(res, { message: 'If that address has an account, a reset link is on its way.' });
};

export const reset = async (req: Request, res: Response) => {
  await auth.resetPassword(v.resetSchema.parse(req.body));
  ok(res, { message: 'Your password has been reset. You can now log in.' });
};

export const me = async (req: Request, res: Response) => {
  const customer = req.user!.customerId ? await findCustomerById(req.user!.customerId) : null;
  ok(res, { ...auth.publicUser(req.user!), customer });
};

export const updateMe = async (req: Request, res: Response) => ok(res, await auth.updateProfile(req.user!, v.profileSchema.parse(req.body)));
export const changePassword = async (req: Request, res: Response) => ok(res, await auth.changePassword(req.user!, v.changePasswordSchema.parse(req.body)));
