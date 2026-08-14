// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  verifyOtp — Full production implementation                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, auth as adminAuth, FieldValue } from '../../config/firebase';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { verifyOtpHash, maskEmail } from '../../utils/otp.utils';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { StudentService } from '../../services/student.service';

const log = createLogger('verifyOtp');

const verifyOtpSchema = z.object({
  email: Schemas.collegeEmail,
  otp: Schemas.otp,
});

const MAX_ATTEMPTS = 5;

export const verifyOtp = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const { email, otp } = validate(verifyOtpSchema, data);

      // Rate limit
      await RateLimits.verifyOtp(email);

      // Fetch OTP record
      const otpSnap = await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).get();
      if (!otpSnap.exists) {
        throw Errors.invalidArgument('Invalid or expired OTP. Please request a new one.');
      }

      const record = otpSnap.data()!;

      // Check expiry
      const expiresAt = record.expires_at?.toDate ? record.expires_at.toDate() : new Date(record.expires_at);
      if (new Date() > expiresAt) {
        await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();
        throw Errors.invalidArgument('OTP has expired. Please request a new one.');
      }

      // Check attempt count
      if (record.attempt_count >= MAX_ATTEMPTS) {
        await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();
        throw Errors.rateLimited('Too many incorrect attempts. Please request a new OTP.');
      }

      // Increment attempt count BEFORE verifying (prevents timing attacks)
      await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).update({
        attempt_count: FieldValue.increment(1),
      });

      // Verify hash
      const isValid = await verifyOtpHash(otp, record.otp_hash);
      if (!isValid) {
        const remainingAttempts = MAX_ATTEMPTS - (record.attempt_count + 1);
        log.warn(`Invalid OTP attempt for ${maskEmail(email)} (${remainingAttempts} remaining)`);
        throw Errors.invalidArgument(
          `Incorrect OTP. ${remainingAttempts > 0 ? `${remainingAttempts} attempts remaining.` : 'Please request a new OTP.'}`
        );
      }

      // ── OTP is valid ──────────────────────────────────────────────────────

      // Delete OTP record (single-use)
      await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();

      // Get or create Firebase Auth user
      let uid: string;
      try {
        const existingUser = await adminAuth.getUserByEmail(email);
        uid = existingUser.uid;
      } catch {
        // New user — create Firebase Auth account
        const newUser = await adminAuth.createUser({
          email,
          emailVerified: true,
          displayName: email.split('@')[0],
        });
        uid = newUser.uid;
        log.info(`New Firebase Auth user created: ${uid}`);
      }

      // Set initial custom claims (college_id, role)
      await adminAuth.setCustomUserClaims(uid, {
        role: 'student',
        college_id: record.college_id,
        verification_status: 'pending',
        email_verified: true,
      });

      // Create a custom auth token for the mobile client
      const customToken = await adminAuth.createCustomToken(uid, {
        college_id: record.college_id,
      });

      // Check if profile exists
      const hasProfile = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get()
        .then((s) => s.exists);

      log.info(`OTP verified for ${maskEmail(email)} → uid: ${uid}`);

      return {
        success: true,
        data: {
          custom_token: customToken,
          uid,
          has_profile: hasProfile,
          college_id: record.college_id,
          college_name: record.college_name,
          is_new_user: !hasProfile,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'verifyOtp');
    }
  });
