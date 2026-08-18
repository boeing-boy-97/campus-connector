import { describe, it, expect } from '@jest/globals';
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  getOtpExpiry,
  isOtpValid,
  maskEmail,
} from '../otp.utils';

describe('otp.utils', () => {
  describe('generateOtp', () => {
    it('returns a 6-digit numeric string', () => {
      const otp = generateOtp();
      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('generates distinct OTPs across calls (no constant value)', () => {
      const results = new Set(Array.from({ length: 20 }, () => generateOtp()));
      // Cryptographically random — the odds of 20 identical 6-digit draws are ~1e-114
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('hashOtp / verifyOtpHash', () => {
    it('verifies the correct OTP against its bcrypt hash', async () => {
      const otp = '123456';
      const hash = await hashOtp(otp);
      expect(hash).not.toBe(otp); // never store plaintext
      await expect(verifyOtpHash(otp, hash)).resolves.toBe(true);
    });

    it('rejects an incorrect OTP', async () => {
      const hash = await hashOtp('123456');
      await expect(verifyOtpHash('654321', hash)).resolves.toBe(false);
    });
  });

  describe('getOtpExpiry', () => {
    it('returns a time ~10 minutes in the future', () => {
      const before = Date.now();
      const expiry = getOtpExpiry();
      const after = Date.now();
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1000);
    });
  });

  describe('isOtpValid', () => {
    const future = () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 5);
      return d;
    };

    it('accepts a fresh record below max attempts', () => {
      expect(isOtpValid({ hash: 'x', expires_at: future(), attempt_count: 0 }, 5)).toBe(true);
    });

    it('rejects an expired record', () => {
      const past = new Date(Date.now() - 60_000);
      expect(isOtpValid({ hash: 'x', expires_at: past, attempt_count: 0 }, 5)).toBe(false);
    });

    it('rejects a record that hit max attempts', () => {
      expect(isOtpValid({ hash: 'x', expires_at: future(), attempt_count: 5 }, 5)).toBe(false);
    });
  });

  describe('maskEmail', () => {
    it('masks the local part while keeping first char, last char, and domain', () => {
      expect(maskEmail('alice@jdcollege.edu.in')).toBe('a***e@jdcollege.edu.in');
    });

    it('handles short local parts without leaking the tail', () => {
      expect(maskEmail('ab@x.edu')).toBe('a***@x.edu');
    });
  });
});
