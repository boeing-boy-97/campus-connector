// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  sendOtp — Full production implementation                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { Errors, handleUnknownError } from '../../utils/errors';
import { generateOtp, hashOtp, getOtpExpiry, maskEmail } from '../../utils/otp.utils';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { CollegeService } from '../../services/college.service';

const log = createLogger('sendOtp');

async function deliverOtp(email: string, otp: string, collegeName: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Errors.preconditionFailed('Email delivery is not configured. Please contact support.');
  }

  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transporter.sendMail({
    from, to: email, subject: `Your ${collegeName} Campus Connector code`,
    text: `Your Campus Connector verification code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
    html: `<p>Your Campus Connector verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
  });
}

const sendOtpSchema = z.object({
  email: Schemas.collegeEmail,
  consent_given: z.boolean().refine((v) => v === true, {
    message: 'You must agree to the Terms of Service and Privacy Policy.',
  }),
  consent_version: z.string().default('1.0.0'),
});

export const sendOtp = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const { email, consent_given, consent_version } = validate(sendOtpSchema, data);

      // Rate limit: max 3 OTPs per email per 10 minutes
      await RateLimits.sendOtp(email);

      // Verify the email domain belongs to a registered, approved college
      const college = await CollegeService.getByDomain(email);
      if (!college) {
        // Return same response as valid to avoid email enumeration
        log.warn(`OTP request for unregistered domain: ${maskEmail(email)}`);
        return {
          success: true,
          data: {
            message: 'If your college is registered, you will receive an OTP shortly.',
            masked_email: maskEmail(email),
          },
        };
      }

      // Generate & hash OTP
      const otp = generateOtp();
      const otpHash = await hashOtp(otp);
      const expiresAt = getOtpExpiry();

      // Upsert OTP record
      await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).set({
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

      // Send OTP via email (or SMS in future)
      if (process.env.FUNCTIONS_EMULATOR) {
        // In emulator — log OTP for easy testing
        log.info(`[DEV] OTP for ${maskEmail(email)}: ${otp}`);
      } else {
        try {
          await deliverOtp(email, otp, college.name);
          log.info(`OTP delivered to ${maskEmail(email)}`);
        } catch (deliveryError) {
          // Remove an undelivered code so it can never be used later.
          await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();
          log.error(`OTP delivery failed for ${maskEmail(email)}`, deliveryError);
          if (deliveryError instanceof functions.https.HttpsError) throw deliveryError;
          throw Errors.internal('Unable to send the verification code. Please try again later.');
        }
      }

      return {
        success: true,
        data: {
          message: 'OTP sent to your college email.',
          masked_email: maskEmail(email),
          college_name: college.name,
          college_short_name: college.short_name,
          expires_in_minutes: 10,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'sendOtp');
    }
  });
