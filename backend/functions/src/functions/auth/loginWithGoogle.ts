// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  loginWithGoogle.ts — Google Sign-In authentication                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, auth as adminAuth, FieldValue } from '../../config/firebase';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { CollegeService } from '../../services/college.service';
import { StudentService } from '../../services/student.service';

const log = createLogger('loginWithGoogle');

const schema = z.object({
  id_token: z.string().min(1, 'ID token is required'),
});

export const loginWithGoogle = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      // Verify the ID token from Google
      const { id_token } = validate(schema, data);

      let decodedToken;
      try {
        decodedToken = await adminAuth.verifyIdToken(id_token);
      } catch {
        throw Errors.invalidArgument('Invalid authentication token. Please try again.');
      }

      const uid = decodedToken.uid;
      const email = decodedToken.email || '';

      if (!email) {
        throw Errors.invalidArgument('No email found in your Google account. Please use a college email.');
      }

      // Verify the email domain belongs to a registered college
      const college = await CollegeService.getByDomain(email);
      if (!college) {
        throw Errors.invalidArgument(
          'Your Google email domain is not registered with any approved college. Please use your official college email.'
        );
      }

      // Check if student profile already exists
      const existingStudent = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();

      if (!existingStudent.exists) {
        // New user — update their Firebase Auth with college claims
        await adminAuth.setCustomUserClaims(uid, {
          role: 'student',
          college_id: college.id,
          verification_status: 'pending',
          email_verified: true,
        });

        log.info(`New Google user ${uid} linked to college ${college.name} (${email})`);
      } else {
        // Existing user — sync claims
        const student = existingStudent.data()!;
        await adminAuth.setCustomUserClaims(uid, {
          role: 'student',
          college_id: student.college_id || college.id,
          verification_status: student.verification_status || 'pending',
          email_verified: true,
        });

        // Update last seen
        await db.collection(COLLECTIONS.STUDENTS).doc(uid).update({
          last_seen: FieldValue.serverTimestamp(),
        });

        log.info(`Google user ${uid} logged in (existing profile)`);
      }

      return {
        success: true,
        data: {
          uid,
          college_id: college.id,
          college_name: college.name,
          has_profile: existingStudent.exists,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'loginWithGoogle');
    }
  });
