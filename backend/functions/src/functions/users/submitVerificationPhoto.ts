import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue, storage } from '../../config/firebase';
import { requireCollegeLinked } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { VerificationStatus } from '../../../../../shared/enums';
import { StudentService } from '../../services/student.service';

const schema = z.object({
  storage_path: z
    .string()
    .regex(/^verification_photos\/[^/]+\/[^/]+$/, 'Invalid verification photo path'),
});

/**
 * Creates or replaces the signed-in student's pending verification request
 * after confirming that the private upload exists in Cloud Storage.
 */
export const submitVerificationPhoto = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireCollegeLinked(context);
      const { storage_path } = validate(schema, data);

      if (!storage_path.startsWith(`verification_photos/${authCtx.uid}/`)) {
        throw Errors.forbidden('Verification photo must belong to your account.');
      }

      const [fileExists] = await storage.bucket().file(storage_path).exists();
      if (!fileExists) {
        throw Errors.notFound('Uploaded verification photo');
      }

      const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(authCtx.uid);
      const requestRef = db.collection(COLLECTIONS.VERIFICATION_REQUESTS).doc(authCtx.uid);

      await db.runTransaction(async (transaction) => {
        const studentDocument = await transaction.get(studentRef);
        if (!studentDocument.exists) throw Errors.notFound('Profile');

        const student = studentDocument.data()!;
        if (student.college_id !== authCtx.collegeId) {
          throw Errors.forbidden('Your college membership could not be verified.');
        }
        if (student.verification_status === VerificationStatus.APPROVED) {
          throw Errors.preconditionFailed('Your profile is already verified.');
        }
        if (student.verification_status === VerificationStatus.SUSPENDED) {
          throw Errors.userSuspended();
        }

        transaction.set(requestRef, {
          student_id: authCtx.uid,
          college_id: authCtx.collegeId,
          storage_path,
          review_status: 'pending',
          review_notes: FieldValue.delete(),
          reviewed_by: FieldValue.delete(),
          reviewed_at: FieldValue.delete(),
          submitted_at: FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.update(studentRef, {
          verification_photo_path: storage_path,
          verification_status: VerificationStatus.PENDING,
          verification_submitted_at: FieldValue.serverTimestamp(),
          rejection_reason: FieldValue.delete(),
          updated_at: FieldValue.serverTimestamp(),
        });
      });

      // A rejected student may still have a stale rejected claim until this refresh.
      await StudentService.syncAuthClaims(authCtx.uid);

      return { success: true, data: { request_id: authCtx.uid, status: 'pending' } };
    } catch (error) {
      handleUnknownError(error, 'submitVerificationPhoto');
    }
  });
