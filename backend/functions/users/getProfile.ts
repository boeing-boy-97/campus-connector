// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  getProfile.ts — Get student profile (enforces college isolation)       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, ERROR_CODES } from '../../../../shared/constants';
import { VerificationStatus } from '../../../../shared/enums';
import { ApiResponse, Student, StudentPublicProfile } from '../../../../shared/types';

const db = admin.firestore();

const getProfileSchema = z.object({
  student_id: z.string().min(1).max(128).optional(), // if absent, returns own profile
});

export const getProfile = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<StudentPublicProfile | Student>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = getProfileSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const targetId = parsed.data.student_id || uid;
      const isSelf = targetId === uid;

      // Get requester's college_id first
      const requesterSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      if (!requesterSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Your profile was not found.');
      }
      const requester = requesterSnap.data() as Student;

      // Get target profile
      const targetSnap = await db.collection(COLLECTIONS.STUDENTS).doc(targetId).get();
      if (!targetSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Student not found.');
      }
      const target = targetSnap.data() as Student;

      // College isolation — can only view profiles from same college (unless admin)
      const isAdmin = context.auth.token?.role === 'admin';
      if (!isSelf && !isAdmin && target.college_id !== requester.college_id) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You can only view profiles from your college.',
          { code: ERROR_CODES.SAME_COLLEGE_REQUIRED }
        );
      }

      // Non-approved profiles are only visible to themselves or admins
      if (!isSelf && !isAdmin && target.verification_status !== VerificationStatus.APPROVED) {
        throw new functions.https.HttpsError('not-found', 'Student not found.');
      }

      // Return full data for self; strip private fields for others
      if (isSelf || isAdmin) {
        return { success: true, data: { id: targetSnap.id, ...target } as Student };
      }

      // Strip private fields for peer view
      const {
        college_email,
        phone,
        uniform_verification_photo_url,
        fcm_token,
        consent_given_at,
        consent_version,
        last_seen,
        ...publicProfile
      } = target;

      return { success: true, data: { id: targetSnap.id, ...publicProfile } as StudentPublicProfile };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('getProfile error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get profile');
    }
  });
