import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { findAuthUserById } from '../repositories/user.repository.js';
import { unauthorized } from '../utils/http.js';

/** Role, permissions and account state are read from the database on every request, never from the client or token claims. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw unauthorized();

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }

  const user = await findAuthUserById(String(payload.sub));
  if (!user || payload.tv !== user.tokenVersion) throw unauthorized('Your session has expired. Please log in again.');
  req.user = user;
  next();
}
