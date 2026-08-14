// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  login.ts — Refresh auth token and validate session                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTIONS, ERROR_CODES } from '../../../../shared/constants';
import { ApiResponse, Student } from '../../../../shared/types';
import { VerificationStatus } from '../../../../shared/enums';

const db = admin.firestore();

// Validates the auth token and returns current user state
export const login = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{
    student: Partial<Student>;
    college: Record<string, unknown>;
    verification_status: VerificationStatus;
  }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required.',
        { code: ERROR_CODES.UNAUTHORIZED }
      );
    }

    try {
      const uid = context.auth.uid;

      // Get student profile
      const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      if (!studentSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Profile not found.');
      }

      const student = studentSnap.data() as Student;

      // Check if suspended
      if (student.verification_status === VerificationStatus.SUSPENDED) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Your account has been suspended.',
          { code: ERROR_CODES.USER_SUSPENDED }
        );
      }

      // Get college branding
      const collegeSnap = await db.collection(COLLECTIONS.COLLEGES).doc(student.college_id).get();
      const college = collegeSnap.exists ? { id: collegeSnap.id, ...collegeSnap.data() } : {};

      // Update last_seen
      await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
        last_seen: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Return only safe fields (no private data)
      const safeStudent: Partial<Student> = {
        id: student.id,
        full_name: student.full_name,
        college_id: student.college_id,
        branch: student.branch,
        year: student.year,
        bio: student.bio,
        profile_photos: student.profile_photos,
        intent_flags: student.intent_flags,
        interests: student.interests,
        verification_status: student.verification_status,
        is_profile_complete: student.is_profile_complete,
        gender: student.gender,
      };

      return {
        success: true,
        data: {
          student: safeStudent,
          college,
          verification_status: student.verification_status,
        },
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('login error:', error);
      throw new functions.https.HttpsError('internal', 'Login failed');
    }
  });
