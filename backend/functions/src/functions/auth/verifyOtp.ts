// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  verifyOtp — College-email OTP authentication                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, auth as adminAuth, FieldValue } from '../../config/firebase';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { verifyOtpHash, maskEmail, otpRecordId } from '../../utils/otp.utils';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS, OTP_CONSTANTS } from '../../../../../shared/constants';
import { VerificationStatus } from '../../../../../shared/enums';

const log = createLogger('verifyOtp');

const verifyOtpSchema = z.object({
  email: Schemas.anyEmail,
  otp: Schemas.otp,
});

const MAX_ATTEMPTS = OTP_CONSTANTS.MAX_ATTEMPTS;

type OtpTransactionResult =
  | { status: 'valid'; record: FirebaseFirestore.DocumentData }
  | { status: 'invalid'; remainingAttempts: number }
  | { status: 'expired' }
  | { status: 'replaced' };

export const verifyOtp = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, _context) => {
    try {
      const { email, otp } = validate(verifyOtpSchema, data);
      await RateLimits.verifyOtp(email);

      const otpRef = db.collection(COLLECTIONS.OTP_RECORDS).doc(otpRecordId(email));
      const initialDocument = await otpRef.get();
      if (!initialDocument.exists) {
        throw Errors.invalidArgument('Invalid or expired OTP. Please request a new one.');
      }

      const initialRecord = initialDocument.data()!;
      const isValid = await verifyOtpHash(otp, initialRecord.otp_hash);

      // Consume a valid OTP atomically, or record one failed attempt. Comparing
      // hashes ensures a newly issued OTP cannot be consumed by an older request.
      const result = await db.runTransaction<OtpTransactionResult>(async (transaction) => {
        const currentDocument = await transaction.get(otpRef);
        if (!currentDocument.exists) return { status: 'expired' };

        const record = currentDocument.data()!;
        if (record.otp_hash !== initialRecord.otp_hash) return { status: 'replaced' };

        const expiresAt = record.expires_at?.toDate
          ? record.expires_at.toDate()
          : new Date(record.expires_at);
        if (!Number.isFinite(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
          transaction.delete(otpRef);
          return { status: 'expired' };
        }

        const attemptCount = Number(record.attempt_count) || 0;
        if (attemptCount >= MAX_ATTEMPTS) {
          transaction.delete(otpRef);
          return { status: 'invalid', remainingAttempts: 0 };
        }

        if (isValid) {
          transaction.delete(otpRef);
          return { status: 'valid', record };
        }

        const remainingAttempts = MAX_ATTEMPTS - attemptCount - 1;
        if (remainingAttempts === 0) {
          transaction.delete(otpRef);
        } else {
          transaction.update(otpRef, { attempt_count: FieldValue.increment(1) });
        }
        return { status: 'invalid', remainingAttempts };
      });

      if (result.status === 'expired' || result.status === 'replaced') {
        throw Errors.invalidArgument('Invalid or expired OTP. Please request a new one.');
      }
      if (result.status === 'invalid') {
        log.warn(`Invalid OTP attempt for ${maskEmail(email)} (${result.remainingAttempts} remaining)`);
        if (result.remainingAttempts === 0) {
          throw Errors.rateLimited('Too many incorrect attempts. Please request a new OTP.');
        }
        throw Errors.invalidArgument(`Incorrect OTP. ${result.remainingAttempts} attempts remaining.`);
      }

      let firebaseUser;
      let isNewAuthUser = false;
      try {
        firebaseUser = await adminAuth.getUserByEmail(email);
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
        firebaseUser = await adminAuth.createUser({
          email,
          emailVerified: true,
          displayName: email.split('@')[0],
        });
        isNewAuthUser = true;
        log.info(`New Firebase Auth user created: ${firebaseUser.uid}`);
      }

      const profileDocument = await db.collection(COLLECTIONS.STUDENTS).doc(firebaseUser.uid).get();
      const profile = profileDocument.data();
      const currentClaims = firebaseUser.customClaims ?? {};
      const collegeId = profile?.college_id ?? result.record.college_id;
      const verificationStatus = profile?.verification_status ?? VerificationStatus.PENDING;

      // Preserve privileged roles and current verification state on repeat login.
      await adminAuth.setCustomUserClaims(firebaseUser.uid, {
        ...currentClaims,
        role: currentClaims.role ?? 'student',
        college_id: collegeId,
        verification_status: verificationStatus,
      });

      const customToken = await adminAuth.createCustomToken(firebaseUser.uid);
      log.info(`OTP verified for ${maskEmail(email)} → uid: ${firebaseUser.uid}`);

      return {
        success: true,
        data: {
          custom_token: customToken,
          uid: firebaseUser.uid,
          has_profile: profileDocument.exists,
          college_id: collegeId,
          college_name: result.record.college_name,
          is_new_user: isNewAuthUser && !profileDocument.exists,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'verifyOtp');
    }
  });
