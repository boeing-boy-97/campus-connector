// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  otp.utils.ts — OTP generation, hashing, and verification               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as bcrypt from 'bcryptjs';
import { createLogger } from './logger';

const log = createLogger('otp.utils');

const BCRYPT_ROUNDS = 10;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

export interface OtpRecord {
  hash: string;
  expires_at: Date;
  attempt_count: number;
}

/**
 * Generates a cryptographically secure numeric OTP
 */
export function generateOtp(): string {
  const digits = '0123456789';
  let otp = '';
  // Use Math.random only for demonstration in emulator;
  // In production, use crypto.getRandomValues via the Node crypto module
  const { randomInt } = require('crypto');
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[randomInt(0, 10)];
  }
  return otp;
}

/**
 * Hashes an OTP using bcrypt
 */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

/**
 * Verifies an OTP against its hash
 */
export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

/**
 * Returns OTP expiry date (current time + OTP_EXPIRY_MINUTES)
 */
export function getOtpExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
  return expiry;
}

/**
 * Checks if an OTP record is still valid (not expired, not max attempts)
 */
export function isOtpValid(record: OtpRecord, maxAttempts: number): boolean {
  if (new Date() > record.expires_at) {
    log.debug('OTP expired');
    return false;
  }
  if (record.attempt_count >= maxAttempts) {
    log.debug('OTP max attempts exceeded');
    return false;
  }
  return true;
}

/**
 * Masks email for logging/display (e.g., a***@jdcollege.edu.in)
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const masked = local.charAt(0) + '***' + (local.length > 3 ? local.charAt(local.length - 1) : '');
  return `${masked}@${domain}`;
}
