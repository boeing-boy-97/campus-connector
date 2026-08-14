// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/verifyPhoto.ts — Admin/moderator photo verification review  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireModerator } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { VerificationStatus } from '../../../../../shared/enums';
import { StudentService } from '../../services/student.service';
import { CollegeService } from '../../services/college.service';
import { NotificationService } from '../../services/notification.service';
import { createLogger } from '../../utils/logger';

const log = createLogger('reviewVerificationPhoto');

const schema = z.object({
  request_id: Schemas.docId,
  action: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(500).optional(),
}).superRefine(({ action, notes }, context) => {
  if (action === 'reject' && !notes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['notes'],
      message: 'A rejection reason is required.',
    });
  }
});

export const reviewVerificationPhoto = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireModerator(context);
      const { request_id, action, notes } = validate(schema, data);
      const requestRef = db.collection(COLLECTIONS.VERIFICATION_REQUESTS).doc(request_id);
      const newStatus = action === 'approve'
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

      const transactionResult = await db.runTransaction(async (transaction) => {
        const requestDocument = await transaction.get(requestRef);
        if (!requestDocument.exists) throw Errors.notFound('Verification request');

        const request = requestDocument.data()!;
        const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(request.student_id);
        const studentDocument = await transaction.get(studentRef);
        if (!studentDocument.exists) throw Errors.notFound('Student');

        if (request.review_status !== 'pending') {
          if (request.review_status === newStatus) {
            return { studentId: request.student_id as string, changed: false };
          }
          throw Errors.preconditionFailed('This verification request has already been reviewed.');
        }

        transaction.update(studentRef, {
          verification_status: newStatus,
          is_profile_complete: action === 'approve',
          verified_at: action === 'approve' ? FieldValue.serverTimestamp() : null,
          rejection_reason: action === 'reject' ? notes : null,
          updated_at: FieldValue.serverTimestamp(),
        });

        transaction.update(requestRef, {
          review_status: newStatus,
          review_notes: notes ?? null,
          reviewed_by: authCtx.uid,
          reviewed_at: FieldValue.serverTimestamp(),
        });

        const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
        transaction.set(auditRef, {
          admin_id: authCtx.uid,
          action: `verification_${action}`,
          target_id: request.student_id,
          target_collection: COLLECTIONS.STUDENTS,
          details: { request_id, notes: notes ?? null },
          created_at: FieldValue.serverTimestamp(),
        });

        return { studentId: request.student_id as string, changed: true };
      });

      // Keep authorization claims synchronized. The idempotent transaction path
      // allows a safe retry if Auth was temporarily unavailable after the commit.
      await StudentService.syncAuthClaims(transactionResult.studentId);

      if (transactionResult.changed) {
        const student = await StudentService.getOwnProfile(transactionResult.studentId);
        if (action === 'approve') {
          const college = await CollegeService.getBranding(student.college_id);
          await NotificationService.verificationApproved({
            userId: transactionResult.studentId,
            collegeName: college.name,
          });
        } else {
          await NotificationService.verificationRejected({
            userId: transactionResult.studentId,
            reason: notes,
          });
        }
      }

      log.info(`Verification request ${request_id} ${action}d by ${authCtx.uid}`);
      return { success: true, data: { status: newStatus } };
    } catch (error) {
      handleUnknownError(error, 'reviewVerificationPhoto');
    }
  });
