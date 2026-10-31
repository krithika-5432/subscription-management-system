import nodemailer from 'nodemailer';
import { env } from '../config/environment.js';

const transport = env.email.host
  ? nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: env.email.user ? { user: env.email.user, pass: env.email.password } : undefined,
    })
  : null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

/** Sends in the background: a mail failure is logged and never fails the business operation that triggered it. */
export function sendMail(mail: Mail): void {
  if (!transport) {
    console.log(`[email not configured] To: ${mail.to} | ${mail.subject}\n${mail.text}\n`);
    return;
  }
  transport
    .sendMail({ from: env.email.from, ...mail })
    .catch((err) => console.error(`Failed to send "${mail.subject}" to ${mail.to}: ${err.message}`));
}
