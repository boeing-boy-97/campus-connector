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
  // Direct SMTP configuration - prioritize environment variables for reliability
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true if port 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
    },
  };

  // Validate SMTP credentials are present
  if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
    log.error('SMTP credentials not configured', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.auth.user ? '***' : 'MISSING',
      pass: smtpConfig.auth.pass ? '***' : 'MISSING',
    });
    throw Errors.preconditionFailed(
      'Email service not configured. Contact admin.'
    );
  }

  try {
    const transporter = nodemailer.createTransport(smtpConfig);

    // Test connection
    await transporter.verify();
    log.info(`SMTP connection verified for ${smtpConfig.auth.user}`);

    // Send email
    const info = await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: email,
      subject: `Your ${collegeName} Campus Connector Code: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>Campus Connector Verification</h2>
          <p>Your verification code is:</p>
          <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
          </div>
          <p><strong>Valid for 10 minutes only.</strong></p>
          <p style="color: #666; font-size: 14px;">Do not share this code with anyone. ${collegeName} staff will never ask for your OTP.</p>
        </div>
      `,
      text: `Your Campus Connector verification code is: ${otp}\n\nValid for 10 minutes only.\n\nDo not share this code with anyone.`,
    });

    log.info(`Email sent to ${email}`, {
      messageId: info.messageId,
      response: info.response,
    });
  } catch (error: any) {
    log.error(`Failed to send OTP to ${email}`, {
      error: error.message,
      code: error.code,
      command: error.command,
    });
    throw Errors.internal(
      `Email delivery failed: ${error.message}`
    );
  }
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
            otp_sent: false,
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

      // Send OTP via email
      try {
        const hasSmtpConfig = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

        if (process.env.FUNCTIONS_EMULATOR === 'true') {
          log.info(`[DEV MODE] Generated OTP for ${maskEmail(email)}: ${otp}`);
        }

        if (hasSmtpConfig) {
          log.info(`Attempting to send real OTP email to ${maskEmail(email)} via SMTP...`);
          await deliverOtp(email, otp, college.name);
          log.info(`✓ OTP email sent successfully to ${maskEmail(email)}`);
        } else if (process.env.FUNCTIONS_EMULATOR === 'true') {
          log.warn(`SMTP credentials not configured in .env.local — OTP for ${maskEmail(email)} is: ${otp}`);
        } else {
          await deliverOtp(email, otp, college.name);
        }
      } catch (deliveryError) {
        log.error(`✗ OTP email delivery failed for ${maskEmail(email)}:`, deliveryError);
        
        // If in production, invalidate OTP and throw error so user is notified
        if (process.env.FUNCTIONS_EMULATOR !== 'true') {
          await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();
          throw deliveryError;
        } else {
          log.warn(`[DEV MODE] Delivery error ignored in emulator so testing can continue. Use logged OTP above.`);
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
          otp_sent: true,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'sendOtp');
    }
  });
