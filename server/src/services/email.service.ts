import nodemailer, { type Transporter } from "nodemailer";
import { env, isProd, isTest } from "@/config/env.js";
import { logger } from "@/lib/logger.js";

export interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  at: number;
}

// Bounded capture buffer for dev/test (NOT used in production).
const captured: SentMail[] = [];
export function recentEmails(): SentMail[] {
  return captured.slice(-25);
}
export function lastEmailFor(to: string): SentMail | undefined {
  return [...captured].reverse().find((m) => m.to.toLowerCase() === to.toLowerCase());
}
export function clearEmails(): void {
  captured.length = 0;
}

let transport: Transporter | null = null;
function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!isProd) {
    captured.push({ ...opts, at: Date.now() });
  }
  if (isTest) return; // never hit the network in tests

  try {
    await getTransport().sendMail({ from: env.SMTP_FROM, ...opts });
    logger.info({ to: opts.to, subject: opts.subject }, "email sent");
  } catch (err) {
    // In dev without a real SMTP server, log the link so flows stay testable.
    logger.warn({ err: (err as Error).message, to: opts.to }, "email send failed");
    if (!isProd) logger.info({ to: opts.to, link: opts.text }, "DEV email (not delivered)");
  }
}

const WEB = env.WEB_ORIGIN;

export function sendVerifyEmail(to: string, token: string): Promise<void> {
  const url = `${WEB}/verify-email?token=${token}`;
  return sendMail({
    to,
    subject: "Verify your Postpin email",
    text: url,
    html: `<p>Welcome to Postpin. Confirm your email address:</p><p><a href="${url}">${url}</a></p>`,
  });
}

export function sendResetEmail(to: string, token: string): Promise<void> {
  const url = `${WEB}/reset-password?token=${token}`;
  return sendMail({
    to,
    subject: "Reset your Postpin password",
    text: url,
    html: `<p>Reset your Postpin password (link valid 30 minutes):</p><p><a href="${url}">${url}</a></p>`,
  });
}

export function sendDunningEmail(to: string, opts: { invoiceNumber: string; planName: string; amount: string }): Promise<void> {
  const url = `${WEB}/app/billing`;
  return sendMail({
    to,
    subject: `Payment failed for ${opts.invoiceNumber} — action needed`,
    text: url,
    html: `<p>We couldn't process the payment for your Postpin <strong>${opts.planName}</strong> plan (invoice ${opts.invoiceNumber}, ${opts.amount}).</p><p>Please update your payment and retry to avoid losing access: <a href="${url}">${url}</a></p>`,
  });
}

export function sendInviteEmail(to: string, token: string, companyName: string): Promise<void> {
  const url = `${WEB}/accept-invite?token=${token}`;
  return sendMail({
    to,
    subject: `You've been invited to ${companyName} on Postpin`,
    text: url,
    html: `<p>You've been invited to join <strong>${companyName}</strong> on Postpin. Accept the invitation and set your password (link valid 7 days):</p><p><a href="${url}">${url}</a></p>`,
  });
}
