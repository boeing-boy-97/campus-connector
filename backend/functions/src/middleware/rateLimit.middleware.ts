// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  rateLimit.middleware.ts — Token bucket rate limiter (Firestore-backed)  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { db, FieldValue } from '../config/firebase';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('rateLimit');

export interface RateLimitConfig {
  /** Unique key for this rate limit (e.g., 'otp:email@example.com') */
  key: string;
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Human-readable message shown to user when limited */
  message?: string;
}

/**
 * Token bucket rate limiter backed by Firestore.
 * Creates a document in `rate_limits` collection.
 * Uses atomic increments to safely handle concurrent requests.
 *
 * @throws Errors.rateLimited() if limit is exceeded
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<void> {
  const { key, limit, windowSeconds, message } = config;
  const docRef = db.collection('rate_limits').doc(key);
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);

      if (!snap.exists) {
        // First request in this window
        tx.set(docRef, {
          key,
          count: 1,
          window_start: now,
          expires_at: new Date(now + windowSeconds * 1000),
        });
        return;
      }

      const data = snap.data()!;

      // Window expired — reset
      if (data.window_start < windowStart) {
        tx.update(docRef, {
          count: 1,
          window_start: now,
          expires_at: new Date(now + windowSeconds * 1000),
        });
        return;
      }

      // Within window — check count
      if (data.count >= limit) {
        const retryAfterSeconds = Math.ceil((data.window_start + windowSeconds * 1000 - now) / 1000);
        log.warn(`Rate limit hit: ${key} (${data.count}/${limit})`);
        throw Errors.rateLimited(
          message || `Too many requests. Please try again in ${retryAfterSeconds} seconds.`
        );
      }

      tx.update(docRef, { count: FieldValue.increment(1) });
    });
  } catch (error: any) {
    // Re-throw HttpsErrors directly
    if (error instanceof functions.https.HttpsError || error?.code) throw error;
    // Transaction conflicts are transient — don't block the request
    log.warn(`Rate limit transaction conflict for ${key}:`, error);
  }
}

// ─── Pre-configured rate limits ───────────────────────────────────────────────

export const RateLimits = {
  /**
   * OTP sending: max 3 per email per 10 minutes
   */
  sendOtp: (email: string) => checkRateLimit({
    key: `otp:send:${email}`,
    limit: 3,
    windowSeconds: 600, // 10 minutes
    message: 'Too many OTP requests. Please wait 10 minutes before trying again.',
  }),

  /**
   * OTP verification: max 5 attempts per email per 15 minutes
   */
  verifyOtp: (email: string) => checkRateLimit({
    key: `otp:verify:${email}`,
    limit: 5,
    windowSeconds: 900, // 15 minutes
    message: 'Too many verification attempts. Please request a new OTP.',
  }),

  /**
   * Connect requests: max 30 per user per day
   */
  connectRequest: (userId: string) => checkRateLimit({
    key: `connect:${userId}`,
    limit: 30,
    windowSeconds: 86400, // 24 hours
    message: 'You have reached your daily connection request limit.',
  }),

  /**
   * Report submissions: max 10 per user per day
   */
  reportUser: (userId: string) => checkRateLimit({
    key: `report:${userId}`,
    limit: 10,
    windowSeconds: 86400, // 24 hours
    message: 'Too many reports submitted. Please try again tomorrow.',
  }),

  /**
   * Profile updates: max 20 per user per hour
   */
  updateProfile: (userId: string) => checkRateLimit({
    key: `profile:update:${userId}`,
    limit: 20,
    windowSeconds: 3600, // 1 hour
    message: 'Too many profile updates. Please wait before updating again.',
  }),

  /**
   * Message sending: max 200 per user per hour
   */
  sendMessage: (userId: string) => checkRateLimit({
    key: `message:${userId}`,
    limit: 200,
    windowSeconds: 3600, // 1 hour
    message: 'Messaging rate limit reached. Please slow down.',
  }),
};
