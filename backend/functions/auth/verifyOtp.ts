// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  verifyOtp.ts — Verify OTP and return Firebase custom token             ║
// ║  Security: bcrypt compare, max attempts, expiry check                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OTP_CONSTANTS, COLLECTIONS, ERROR_CODES, LEGAL } from '../../../../shared/constants';
import { UserRole, VerificationStatus } from '../../../../shared/enums';
import { ApiResponse, CustomClaims } from '../../../../shared/types';

const db = admin.firestore();

const verifyOtpSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  otp: z.string().length(OTP_CONSTANTS.LENGTH).regex(/^\d+$/, 'OTP must be numeric'),
});

export const verifyOtp = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ custom_token: string; is_new_user: boolean }>> => {
    try {
      // 1. Validate input
      const parsed = verifyOtpSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }
      const { email, otp } = parsed.data;

      // 2. Find the latest non-expired OTP for this email
      const now = admin.firestore.Timestamp.now();
      const otpSnap = await db
        .collection(COLLECTIONS.OTP_STORE)
        .where('email', '==', email)
        .where('expires_at', '>', now)
        .orderBy('expires_at', 'desc')
        .limit(1)
        .get();

      if (otpSnap.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'OTP expired or not found. Please request a new OTP.',
          { code: ERROR_CODES.OTP_EXPIRED }
        );
      }

      const otpDoc = otpSnap.docs[0];
      const otpData = otpDoc.data();

      // 3. Check max attempts
      if (otpData.attempts >= OTP_CONSTANTS.MAX_ATTEMPTS) {
        await otpDoc.ref.delete(); // Invalidate OTP
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Too many incorrect attempts. Please request a new OTP.',
          { code: ERROR_CODES.OTP_MAX_ATTEMPTS }
        );
      }

      // 4. bcrypt compare
      const isValid = await bcrypt.compare(otp, otpData.otp_hash);
      if (!isValid) {
        await otpDoc.ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
        throw new functions.https.HttpsError(
          'unauthenticated',
          `Invalid OTP. ${OTP_CONSTANTS.MAX_ATTEMPTS - otpData.attempts - 1} attempts remaining.`,
          { code: ERROR_CODES.OTP_INVALID }
        );
      }

      // 5. OTP is valid — delete it (single use)
      await otpDoc.ref.delete();

      // 6. Get or create Firebase Auth user
      let firebaseUser: admin.auth.UserRecord;
      let isNewUser = false;

      try {
        firebaseUser = await admin.auth().getUserByEmail(email);
      } catch {
        // User doesn't exist — create them
        firebaseUser = await admin.auth().createUser({ email, emailVerified: true });
        isNewUser = true;
      }

      // 7. Get college for this domain
      const domain = email.split('@')[1];
      const collegeSnap = await db
        .collection(COLLECTIONS.COLLEGES)
        .where('domain', '==', domain)
        .limit(1)
        .get();

      const college = collegeSnap.empty ? null : collegeSnap.docs[0];

      // 8. Set Firebase custom claims
      const claims: CustomClaims = {
        role: UserRole.STUDENT,
        college_id: college?.id,
        verification_status: VerificationStatus.PENDING,
      };

      // Check if student already has an approved profile
      if (!isNewUser) {
        const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(firebaseUser.uid).get();
        if (studentSnap.exists) {
          claims.verification_status = studentSnap.data()!.verification_status;
        }
      }

      await admin.auth().setCustomUserClaims(firebaseUser.uid, claims);

      // 9. Create custom token for client
      const customToken = await admin.auth().createCustomToken(firebaseUser.uid, claims);

      // 10. Record consent on first login
      if (isNewUser && college) {
        await db.collection(COLLECTIONS.STUDENTS).doc(firebaseUser.uid).set({
          id: firebaseUser.uid,
          college_id: college.id,
          college_email: email,
          verification_status: VerificationStatus.PENDING,
          is_active: true,
          is_profile_complete: false,
          consent_given_at: admin.firestore.FieldValue.serverTimestamp(),
          consent_version: LEGAL.CURRENT_TERMS_VERSION,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      return { success: true, data: { custom_token: customToken, is_new_user: isNewUser } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('verifyOtp error:', error);
      throw new functions.https.HttpsError('internal', 'OTP verification failed');
    }
  });
