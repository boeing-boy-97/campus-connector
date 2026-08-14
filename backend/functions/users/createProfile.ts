// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  createProfile.ts — Create student profile with age gate (18+)          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, ERROR_CODES, PROFILE_LIMITS, LEGAL } from '../../../../shared/constants';
import { Gender, VerificationStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const createProfileSchema = z.object({
  full_name: z.string().min(2).max(PROFILE_LIMITS.MAX_NAME_LENGTH).trim(),
  branch: z.string().min(2).max(100).trim(),
  year: z.number().int().min(1).max(4),
  bio: z.string().max(PROFILE_LIMITS.MAX_BIO_LENGTH).trim().default(''),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  gender: z.nativeEnum(Gender),
  intent_flags: z.object({
    dating: z.boolean().default(false),
    friendship: z.boolean().default(false),
    study: z.boolean().default(false),
    hackathon: z.boolean().default(false),
    project: z.boolean().default(false),
  }),
  interests: z.array(z.string().max(PROFILE_LIMITS.MAX_INTEREST_LENGTH)).max(PROFILE_LIMITS.MAX_INTERESTS).default([]),
  linkedin_url: z.string().url().optional().nullable(),
  github_url: z.string().url().optional().nullable(),
});

export const createProfile = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      // 1. Validate input
      const parsed = createProfileSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }
      const profileData = parsed.data;

      // 2. Age gate — must be 18+
      const dob = new Date(profileData.date_of_birth);
      const ageDiff = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiff);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (age < PROFILE_LIMITS.MIN_AGE_YEARS) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'You must be 18 or older to use Campus Connect.',
          { code: ERROR_CODES.AGE_RESTRICTION }
        );
      }

      // 3. Ensure student doc exists (created during verifyOtp)
      const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      if (!studentSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Auth record not found. Please log in again.');
      }

      const existingData = studentSnap.data()!;

      // 4. Update profile
      await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
        ...profileData,
        date_of_birth: admin.firestore.Timestamp.fromDate(dob),
        is_profile_complete: true,
        verification_status: existingData.verification_status || VerificationStatus.PENDING,
        profile_photos: existingData.profile_photos || [],
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        consent_given_at: existingData.consent_given_at || admin.firestore.FieldValue.serverTimestamp(),
        consent_version: LEGAL.CURRENT_TERMS_VERSION,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('createProfile error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to create profile');
    }
  });
