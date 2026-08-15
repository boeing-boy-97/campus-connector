// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  OTP generation and password-safe hashing                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { createHash, randomBytes, randomInt, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { createLogger } from './logger';

const log = createLogger('otp.utils');
const scrypt = (
  password: string | Buffer | Uint8Array,
  salt: string | Buffer | Uint8Array,
  keyLength: number
): Promise<Buffer> => new Promise((resolve, reject) => {
  nodeScrypt(password, salt, keyLength, (error: Error | null, derivedKey: Buffer) => {
    if (error) reject(error);
    else resolve(derivedKey);
  });
});

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const SCRYPT_KEY_LENGTH = 32;
const HASH_VERSION = 'scrypt-v1';

export interface OtpRecord {
  hash: string;
  expires_at: Date;
  attempt_count: number;
}

/** Creates a path-safe, non-reversible key for an email-specific OTP record. */
export function otpRecordId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Generates a cryptographically secure six-digit code. */
export function generateOtp(): string {
  return Array.from({ length: OTP_LENGTH }, () => randomInt(0, 10)).join('');
}

/**
 * Derives a salted OTP hash using Node's built-in scrypt implementation.
 * The encoded version allows the parameters to be migrated without keeping a
 * native bcrypt dependency in the Cloud Functions runtime.
 */
export async function hashOtp(otp: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(otp, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${HASH_VERSION}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

/** Compares an OTP hash in constant time. Malformed stored values fail closed. */
export async function verifyOtpHash(otp: string, encodedHash: string): Promise<boolean> {
  const [version, saltValue, hashValue, extra] = encodedHash.split('$');
  if (version !== HASH_VERSION || !saltValue || !hashValue || extra) return false;

  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

    const actual = (await scrypt(otp, salt, expected.length)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function getOtpExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
}

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

/** Masks an address for logs and user-facing confirmations. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const first = local.charAt(0);
  const last = local.length > 3 ? local.charAt(local.length - 1) : '';
  return `${first}***${last}@${domain}`;
}
