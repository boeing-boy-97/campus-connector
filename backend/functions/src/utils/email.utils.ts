// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  email.utils.ts — SMTP transport + transactional e-mail templates        ║
// ║                                                                          ║
// ║  Credentials come from environment configuration only (never hardcoded). ║
// ║  A missing/incomplete SMTP configuration is reported explicitly rather   ║
// ║  than silently swallowed, so operators can see the misconfiguration.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import nodemailer, { type Transporter } from 'nodemailer';
import { Errors } from './errors';
import { createLogger } from './logger';
import { LEGAL } from '../../../../shared/constants';

const log = createLogger('email.utils');

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Reads and validates the SMTP configuration from the environment.
 * Returns null when e-mail delivery is not configured.
 */
export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass || !from) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { host, port, secure: port === 465, user, pass, from };
}

/** True when transactional e-mail can actually be delivered. */
export function isEmailConfigured(): boolean {
  return readSmtpConfig() !== null;
}

let cachedTransporter: Transporter | null = null;
let cachedKey = '';

/**
 * Returns a memoised SMTP transport. The transport is rebuilt when the
 * configuration changes so a re-deploy with new credentials takes effect.
 */
export function getTransporter(): Transporter {
  const config = readSmtpConfig();
  if (!config) {
    throw Errors.preconditionFailed(
      'E-mail delivery is not configured on the server. Please contact support.'
    );
  }

  const key = `${config.host}:${config.port}:${config.user}`;
  if (!cachedTransporter || cachedKey !== key) {
    // nodemailer's factory is `createTransport` (not `createTransporter`).
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    cachedKey = key;
    log.info('SMTP transport initialised', { host: config.host, port: config.port });
  }

  return cachedTransporter;
}

/** Test seam: clears the memoised transport. */
export function resetTransporter(): void {
  cachedTransporter = null;
  cachedKey = '';
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, subheading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px 16px;background:#f6f5f0;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
    <tr><td style="background:#fffefa;border:1px solid #e2e1da;border-radius:20px;padding:36px">
      <h1 style="margin:0 0 4px;font-size:22px;color:#17211d">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 26px;font-size:13px;color:#66716c">${escapeHtml(subheading)}</p>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #eeede7;margin:28px 0 16px">
      <p style="margin:0;font-size:11px;color:#98a09a;line-height:1.6">
        You received this e-mail because your college address was used on Campus Connect.
        <a href="${LEGAL.PRIVACY_POLICY_URL}" style="color:#38735f">Privacy Policy</a> ·
        <a href="${LEGAL.TERMS_URL}" style="color:#38735f">Terms</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

export const EmailTemplates = {
  otp(otp: string, collegeName: string): EmailContent {
    return {
      subject: `Your Campus Connect verification code`,
      text:
        `Your Campus Connect verification code is ${otp}.\n\n` +
        `It expires in 10 minutes. Do not share this code with anyone.\n` +
        `If you did not request this code, you can safely ignore this e-mail.`,
      html: layout(
        'Campus Connect',
        collegeName,
        `<p style="margin:0 0 18px;font-size:15px;color:#35443d">Your verification code is:</p>
         <div style="background:#244c43;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
           <span style="color:#d8ee6c;font-size:34px;font-weight:700;letter-spacing:10px">${escapeHtml(otp)}</span>
         </div>
         <p style="margin:0;font-size:13px;color:#66716c;line-height:1.6">
           This code expires in <strong>10 minutes</strong>. Never share it with anyone —
           Campus Connect staff will never ask you for it.
         </p>`
      ),
    };
  },

  welcome(name: string, collegeName: string): EmailContent {
    return {
      subject: `Welcome to Campus Connect, ${name}`,
      text:
        `Welcome, ${name}.\n\n` +
        `You are one step away from joining the verified ${collegeName} community. ` +
        `Upload a photo of your student ID or college uniform to finish verification. ` +
        `Once a campus administrator approves it, your profile goes live.`,
      html: layout(
        `Welcome, ${name}`,
        `${collegeName} community`,
        `<p style="margin:0 0 14px;font-size:15px;color:#35443d;line-height:1.7">
           You are one step away. Upload a photo of your student ID or college uniform
           to finish verification.
         </p>
         <p style="margin:0;font-size:15px;color:#35443d;line-height:1.7">
           Once a campus administrator approves it, your profile goes live and you can
           start connecting with verified students from ${escapeHtml(collegeName)}.
         </p>`
      ),
    };
  },

  verificationApproved(name: string, collegeName: string): EmailContent {
    return {
      subject: 'Your Campus Connect profile is verified',
      text:
        `Good news, ${name} — your ${collegeName} profile has been verified and is now live. ` +
        `You can start discovering and connecting with verified students from your campus.`,
      html: layout(
        'Your profile is verified',
        collegeName,
        `<p style="margin:0;font-size:15px;color:#35443d;line-height:1.7">
           Good news, ${escapeHtml(name)} — your profile has been verified and is now live.
           You can start discovering and connecting with verified students from your campus.
         </p>`
      ),
    };
  },

  verificationRejected(name: string, reason: string): EmailContent {
    return {
      subject: 'Action needed on your Campus Connect verification',
      text:
        `Hello ${name},\n\nYour verification photo could not be approved.\n\n` +
        `Reason: ${reason}\n\nYou can submit a new photo from the app at any time.`,
      html: layout(
        'Verification needs another try',
        'Campus Connect',
        `<p style="margin:0 0 14px;font-size:15px;color:#35443d;line-height:1.7">
           Hello ${escapeHtml(name)}, your verification photo could not be approved.
         </p>
         <p style="margin:0 0 14px;padding:14px 16px;background:#fff3f3;border-radius:12px;
            font-size:14px;color:#8f2f2f;line-height:1.6">${escapeHtml(reason)}</p>
         <p style="margin:0;font-size:15px;color:#35443d;line-height:1.7">
           You can submit a new photo from the app at any time.
         </p>`
      ),
    };
  },
};

export type EmailTemplateName = keyof typeof EmailTemplates;

/**
 * Delivers a transactional e-mail. Throws a typed HttpsError when SMTP is not
 * configured or the send fails, so callers can decide how to degrade.
 */
export async function deliverEmail(to: string, content: EmailContent): Promise<void> {
  const config = readSmtpConfig();
  if (!config) {
    throw Errors.preconditionFailed(
      'E-mail delivery is not configured on the server. Please contact support.'
    );
  }

  await getTransporter().sendMail({
    from: config.from,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
