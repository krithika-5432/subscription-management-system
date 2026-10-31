import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { withTransaction } from '../config/database.js';
import { env } from '../config/environment.js';
import { insertCustomer, updateCustomerProfile } from '../repositories/customer.repository.js';
import * as users from '../repositories/user.repository.js';
import type { AuthUser } from '../types/index.js';
import { AppError, badRequest, conflict, unauthorized } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import { audit } from './audit.service.js';

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
// A value no password can hash to: an account created by invitation stays locked until the reset link is used.
export const randomPasswordHash = () => hashPassword(crypto.randomBytes(32).toString('hex'));

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function signToken(userId: string, tokenVersion: number, remember?: boolean) {
  return jwt.sign({ sub: userId, tv: tokenVersion }, env.jwtSecret, { expiresIn: remember ? '30d' : '8h' });
}

export function publicUser(user: AuthUser) {
  const { tokenVersion: _omit, ...rest } = user;
  return rest;
}

export async function register(input: { customerName: string; companyName: string | null; email: string; phone: string; password: string }) {
  if (await users.emailExists(input.email)) throw conflict('An account with this email address already exists');
  const passwordHash = await hashPassword(input.password);
  const userId = await withTransaction(async () => {
    const { id } = await users.insertUser({ role: 'customer', fullName: input.customerName, email: input.email, phone: input.phone, passwordHash });
    await insertCustomer({ userId: id, customerName: input.customerName, companyName: input.companyName });
    await audit(null, 'customer.registered', 'customer', id, { email: input.email });
    return id;
  });
  const user = (await users.findAuthUserById(userId))!;
  return { token: signToken(user.id, user.tokenVersion), user: publicUser(user) };
}

export async function login(input: { email: string; password: string; remember?: boolean }) {
  const account = await users.findCredentialsByEmail(input.email);
  // Compare against a dummy hash for unknown emails so response time does not reveal which addresses exist.
  const hash = account?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZyM1Ww1xM3u5y5Vv1JqvR3Yz2qQmQe';
  const valid = await bcrypt.compare(input.password, hash);
  if (!account || !valid) throw unauthorized('Incorrect email or password');
  if (account.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Please contact your administrator.');
  await users.touchLogin(account.id);
  const user = (await users.findAuthUserById(account.id))!;
  return { token: signToken(user.id, user.tokenVersion, input.remember), user: publicUser(user) };
}

/** Signs in an existing account with a Google ID token. Google sign-in never creates accounts or bypasses account status. */
export async function loginWithGoogle(input: { credential: string; remember?: boolean }) {
  if (!env.googleClientId) throw badRequest('Google sign-in is not configured');
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(input.credential)}`);
  if (!response.ok) throw unauthorized('Google could not verify this sign-in');
  const info = (await response.json()) as { aud?: string; email?: string; email_verified?: string };
  if (info.aud !== env.googleClientId || info.email_verified !== 'true' || !info.email) throw unauthorized('Google could not verify this sign-in');
  const account = await users.findCredentialsByEmail(info.email.toLowerCase());
  if (!account) throw new AppError(404, 'NO_ACCOUNT', 'No Brightloop account uses this Google email. Please create an account first.');
  if (account.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Please contact your administrator.');
  await users.touchLogin(account.id);
  const user = (await users.findAuthUserById(account.id))!;
  return { token: signToken(user.id, user.tokenVersion, input.remember), user: publicUser(user) };
}

/** Logout revokes every token issued to this user, because tokens are stateless. */
export const logout = (user: AuthUser) => users.bumpTokenVersion(user.id);

export async function issueResetLink(userId: string, email: string, reason: 'reset' | 'invite') {
  const token = crypto.randomBytes(32).toString('hex');
  await users.invalidateResetTokens(userId);
  await users.insertResetToken(userId, sha256(token), new Date(Date.now() + (reason === 'invite' ? 72 * RESET_TTL_MS : RESET_TTL_MS)));
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  sendMail(
    reason === 'invite'
      ? {
          to: email,
          subject: 'Your Brightloop account is ready',
          text: `An account has been created for you. Set your password within 72 hours using this link:\n\n${link}`,
        }
      : {
          to: email,
          subject: 'Reset your Brightloop password',
          text: `Use this link within one hour to reset your password:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
        },
  );
}

/** Responds the same whether or not the address exists, so this endpoint cannot be used to discover accounts. */
export async function forgotPassword(email: string) {
  const account = await users.findCredentialsByEmail(email);
  if (account?.status === 'active') await issueResetLink(account.id, email, 'reset');
}

export async function resetPassword(input: { token: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  await withTransaction(async () => {
    const token = await users.findValidResetToken(sha256(input.token));
    if (!token) throw badRequest('This reset link is invalid or has expired. Please request a new one.');
    await users.setPassword(token.userId, passwordHash);
    await users.invalidateResetTokens(token.userId);
    await audit({ id: token.userId } as AuthUser, 'user.password_reset', 'user', token.userId);
  });
}

export async function changePassword(user: AuthUser, input: { currentPassword: string; newPassword: string }) {
  const account = (await users.findCredentialsById(user.id))!;
  if (!(await bcrypt.compare(input.currentPassword, account.passwordHash))) throw badRequest('Your current password is incorrect');
  await users.setPassword(user.id, await hashPassword(input.newPassword));
  const updated = (await users.findAuthUserById(user.id))!;
  await audit(user, 'user.password_changed', 'user', user.id);
  return { token: signToken(updated.id, updated.tokenVersion) };
}

export async function updateProfile(
  user: AuthUser,
  input: { fullName: string; phone?: string | null; companyName: string | null; billingAddress: string | null; taxId: string | null },
) {
  await withTransaction(async () => {
    await users.updateUser(user.id, { full_name: input.fullName, phone: input.phone ?? null });
    if (user.customerId) await updateCustomerProfile(user.customerId, input);
  });
  return publicUser((await users.findAuthUserById(user.id))!);
}
