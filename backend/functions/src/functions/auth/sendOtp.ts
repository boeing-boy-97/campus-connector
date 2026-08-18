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

const smtpConfig = {
  host: process.env.SMTP_HOST || (functions.config().smtp && functions.config().smtp.host) || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || (functions.config().smtp && functions.config().smtp.port) || '587'),
  user: process.env.SMTP_USER || (functions.config().smtp && functions.config().smtp.user) || '',
  pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : ((functions.config().smtp && functions.config().smtp.pass) || '').replace(/\s+/g, ''),
};

async function deliverOtp(email: string, otp: string, collegeName: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: true,
    },
  });

  if (!smtpConfig.user || !smtpConfig.pass) {
    log.error('SMTP credentials not configured', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user ? '***' : 'MISSING',
      pass: smtpConfig.pass ? '***' : 'MISSING',
    });
    throw Errors.preconditionFailed('Email service not configured. Contact admin.');
  }

  try {
    await transporter.verify();
    log.info(`SMTP connection verified for ${smtpConfig.user}`);

    const info = await transporter.sendMail({
      from: `"Campus Connector" <${smtpConfig.user}>`,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    log.error(`Failed to send OTP to ${email}`, { error: message });
    throw Errors.internal(`Email delivery failed: ${message}`);
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

      await RateLimits.sendOtp(email);

      const college = await CollegeService.getByDomain(email);
      if (!college) {
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

      const otp = generateOtp();
      const otpHash = await hashOtp(otp);
      const expiresAt = getOtpExpiry();

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

      try {
        const hasSmtpConfig = Boolean(smtpConfig.user && smtpConfig.pass);

        if (process.env.FUNCTIONS_EMULATOR === 'true') {
          log.info(`[DEV MODE] Generated OTP for ${maskEmail(email)}: ${otp}`);
        }

        if (hasSmtpConfig) {
          log.info(`Attempting to send real OTP email to ${maskEmail(email)} via SMTP...`);
          await deliverOtp(email, otp, college.name);
          log.info(`✓ OTP email sent successfully to ${maskEmail(email)}`);
        } else if (process.env.FUNCTIONS_EMULATOR === 'true') {
          log.warn(`SMTP credentials not configured — OTP for ${maskEmail(email)} is: ${otp}`);
        } else {
          await deliverOtp(email, otp, college.name);
        }
      } catch (deliveryError) {
        log.error(`✗ OTP email delivery failed for ${maskEmail(email)}:`, deliveryError);
        if (process.env.FUNCTIONS_EMULATOR !== 'true') {
          await db.collection(COLLECTIONS.OTP_RECORDS).doc(email).delete();
          throw deliveryError;
        } else {
          log.warn(`[DEV MODE] Delivery error ignored in emulator. Use logged OTP above.`);
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
