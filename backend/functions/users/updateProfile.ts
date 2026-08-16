// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  updateProfile.ts — Update student profile fields                       ║
// ║  Security: cannot change college_id, email, or verification_status      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, PROFILE_LIMITS } from '../../../../shared/constants';
import { Gender } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

// Only updateable fields — protected fields are never in this schema
const updateProfileSchema = z.object({
  full_name: z.string().min(2).max(PROFILE_LIMITS.MAX_NAME_LENGTH).trim().optional(),
  branch: z.string().min(2).max(100).trim().optional(),
  year: z.number().int().min(1).max(4).optional(),
  bio: z.string().max(PROFILE_LIMITS.MAX_BIO_LENGTH).trim().optional(),
  gender: z.nativeEnum(Gender).optional(),
  intent_flags: z.object({
    dating: z.boolean(),
    friendship: z.boolean(),
    study: z.boolean(),
    hackathon: z.boolean(),
    project: z.boolean(),
  }).optional(),
  interests: z.array(z.string().max(PROFILE_LIMITS.MAX_INTEREST_LENGTH))
    .max(PROFILE_LIMITS.MAX_INTERESTS).optional(),
  linkedin_url: z.string().url().optional().nullable(),
  github_url: z.string().url().optional().nullable(),
  fcm_token: z.string().max(512).optional(),
});

export const updateProfile = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = updateProfileSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      if (Object.keys(parsed.data).length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No fields to update.');
      }

      // Verify student exists
      const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      if (!studentSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Student not found.');
      }

      // Update only provided fields + timestamp
      await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
        ...parsed.data,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('updateProfile error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update profile');
    }
  });
