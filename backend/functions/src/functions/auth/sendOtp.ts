// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  sendOtp — Issues a college-email one-time passcode                      ║
// ║                                                                          ║
// ║  Privacy: the response is byte-identical whether or not the domain        ║
// ║  belongs to a registered college, so the endpoint cannot be used to       ║
// ║  enumerate which institutions are on the platform.                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { Errors, handleUnknownError } from '../../utils/errors';
import { generateOtp, hashOtp, getOtpExpiry, maskEmail, otpRecordId } from '../../utils/otp.utils';
import { deliverEmail, EmailTemplates, isEmailConfigured } from '../../utils/email.utils';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS, OTP_CONSTANTS } from '../../../../../shared/constants';
import { CollegeService } from '../../services/college.service';

const log = createLogger('sendOtp');

const sendOtpSchema = z.object({
  email: Schemas.anyEmail,
  consent_given: z.boolean().refine((v) => v === true, {
    message: 'You must agree to the Terms of Service and Privacy Policy.',
  }),
  consent_version: z.string().max(20).default('1.0.0'),
});

/**
 * Uniform response shape. Never varies by whether the college is registered.
 */
function uniformResponse(email: string) {
  return {
    success: true as const,
    data: {
      message: 'If your college is registered, a verification code is on its way.',
      masked_email: maskEmail(email),
      expires_in_minutes: OTP_CONSTANTS.EXPIRY_MINUTES,
    },
  };
}

export const sendOtp = functions
  .region('asia-south1')
  .runWith({
    memory: '256MB',
    timeoutSeconds: 60,
    // Declared so Cloud Functions injects them at runtime. Set them with
    // `firebase functions:secrets:set SMTP_HOST` (etc.); they are never
    // committed, and sendOtp reports a clear configuration error if absent.
    secrets: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
  })
  .https.onCall(async (data, _context) => {
    try {
      const { email, consent_given, consent_version } = validate(sendOtpSchema, data);

      // Rate limit before any lookup so the endpoint cannot be used as an oracle.
      await RateLimits.sendOtp(email);

      // A misconfigured deployment must fail loudly rather than pretend to send.
      if (!isEmailConfigured() && !process.env.FUNCTIONS_EMULATOR) {
        log.error('SMTP is not configured — cannot deliver verification codes.');
        throw Errors.preconditionFailed(
          'E-mail delivery is not configured on the server. Please contact support.'
        );
      }

      const college = await CollegeService.getByDomain(email);
      if (!college) {
        log.warn(`OTP request for unregistered domain: ${maskEmail(email)}`);
        return uniformResponse(email);
      }

      const otp = generateOtp();
      const otpHash = await hashOtp(otp);
      const expiresAt = getOtpExpiry();

      // Upsert under a path-safe, non-reversible identifier.
      const otpReference = db.collection(COLLECTIONS.OTP_RECORDS).doc(otpRecordId(email));
      await otpReference.set({
        email,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempt_count: 0,
        college_id: college.id,
        college_name: college.name,
        consent_given,
        consent_version,
        created_at: FieldValue.serverTimestamp(),
      });

      if (process.env.FUNCTIONS_EMULATOR) {
        // Local development: surface the code in the emulator log instead of
        // requiring live SMTP credentials.
        log.info(`[emulator] OTP for ${maskEmail(email)}: ${otp}`);
      } else {
        try {
          await deliverEmail(email, EmailTemplates.otp(otp, college.name));
          log.info(`OTP delivered to ${maskEmail(email)}`);
        } catch (deliveryError) {
          // Remove an undelivered code so it can never be used later.
          await otpReference.delete().catch(() => undefined);
          log.error(`OTP delivery failed for ${maskEmail(email)}`, deliveryError);
          if (deliveryError instanceof functions.https.HttpsError) throw deliveryError;
          throw Errors.internal('Unable to send the verification code. Please try again later.');
        }
      }

      return uniformResponse(email);
    } catch (error) {
      handleUnknownError(error, 'sendOtp');
    }
  });
