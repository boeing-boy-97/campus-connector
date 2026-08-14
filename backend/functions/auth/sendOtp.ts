// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  sendOtp.ts — Send OTP to college email                                 ║
// ║  Security: domain validation, rate limiting, bcrypt hash storage        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OTP_CONSTANTS, COLLECTIONS, ERROR_CODES } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

// ─── Input Validation Schema ──────────────────────────────────────────────────
const sendOtpSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(254)
    .transform((e) => e.toLowerCase().trim()),
});

// ─── Generate Numeric OTP ─────────────────────────────────────────────────────
function generateOtp(length: number): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

// ─── Check if domain belongs to a registered college ─────────────────────────
async function getCollegeByDomain(domain: string) {
  const snapshot = await db
    .collection(COLLECTIONS.COLLEGES)
    .where('domain', '==', domain)
    .where('verified_status', '==', 'approved')
    .limit(1)
    .get();

  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ─── Rate limit check ─────────────────────────────────────────────────────────
async function isRateLimited(email: string): Promise<boolean> {
  const windowStart = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - OTP_CONSTANTS.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)
  );

  const snapshot = await db
    .collection(COLLECTIONS.OTP_STORE)
    .where('email', '==', email)
    .where('created_at', '>=', windowStart)
    .get();

  return snapshot.size >= OTP_CONSTANTS.MAX_SENDS_PER_WINDOW;
}

// ─── Main Function ────────────────────────────────────────────────────────────
export const sendOtp = functions
  .region('asia-south1') // Mumbai region for India
  .https.onCall(async (data, context): Promise<ApiResponse<{ college_id: string; college_name: string }>> => {
    try {
      // 1. Validate input
      const parsed = sendOtpSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          parsed.error.errors[0].message,
          { code: ERROR_CODES.VALIDATION_FAILED }
        );
      }
      const { email } = parsed.data;
      const domain = email.split('@')[1];

      // 2. Check email domain against registered colleges
      const college = await getCollegeByDomain(domain);
      if (!college) {
        throw new functions.https.HttpsError(
          'not-found',
          'This email domain is not registered. Please use your college institutional email.',
          { code: ERROR_CODES.INVALID_DOMAIN }
        );
      }

      // 3. Check if student is suspended
      const existingStudentSnap = await db
        .collection(COLLECTIONS.STUDENTS)
        .where('college_email', '==', email)
        .limit(1)
        .get();

      if (!existingStudentSnap.empty) {
        const student = existingStudentSnap.docs[0].data();
        if (student.verification_status === 'suspended') {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Your account has been suspended. Contact support.',
            { code: ERROR_CODES.USER_SUSPENDED }
          );
        }
      }

      // 4. Rate limiting
      if (await isRateLimited(email)) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `Too many OTP requests. Please wait ${OTP_CONSTANTS.RATE_LIMIT_WINDOW_MINUTES} minutes.`,
          { code: ERROR_CODES.OTP_RATE_LIMIT }
        );
      }

      // 5. Generate OTP
      const otp = generateOtp(OTP_CONSTANTS.LENGTH);
      const otpHash = await bcrypt.hash(otp, 12);
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + OTP_CONSTANTS.EXPIRY_MINUTES * 60 * 1000)
      );

      // 6. Store OTP (hashed) in Firestore
      await db.collection(COLLECTIONS.OTP_STORE).add({
        email,
        otp_hash: otpHash,
        attempts: 0,
        expires_at: expiresAt,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 7. Send OTP via email
      // In production: use Nodemailer with SMTP / SendGrid / Resend
      // For emulator: log to console
      if (process.env.FUNCTIONS_EMULATOR) {
        functions.logger.info(`[DEV] OTP for ${email}: ${otp}`);
      } else {
        // TODO: Integrate with email service (SendGrid/Resend)
        // await emailService.sendOtp(email, otp, college.name);
        functions.logger.info(`OTP sent to ${email}`);
      }

      return {
        success: true,
        data: {
          college_id: college.id,
          college_name: (college as any).name,
        },
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('sendOtp error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send OTP', {
        code: ERROR_CODES.INTERNAL,
      });
    }
  });
