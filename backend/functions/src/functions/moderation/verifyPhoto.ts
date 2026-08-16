// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/verifyPhoto.ts — Admin/moderator photo verification review  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
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

const log = createLogger('verifyPhoto');

const schema = z.object({
  student_id: Schemas.docId,
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).trim().optional(),
});

export const reviewVerificationPhoto = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireModerator(context);
      const { student_id, action, reason } = validate(schema, data);

      const student = await StudentService.getOwnProfile(student_id);
      if (!student) throw Errors.notFound('Student');

      const newStatus = action === 'approve'
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

      const batch = db.batch();
      const studentRef = db.collection(COLLECTIONS.STUDENTS).doc(student_id);

      batch.update(studentRef, {
        verification_status: newStatus,
        is_profile_complete: action === 'approve',
        verified_at: action === 'approve' ? FieldValue.serverTimestamp() : null,
        rejection_reason: action === 'reject' ? reason || null : null,
        updated_at: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      // Sync custom claims so Auth token reflects approval/rejection
      await StudentService.syncAuthClaims(student_id);

      // Send notification to student
      if (action === 'approve') {
        const college = await CollegeService.getBranding(student.college_id);
        await NotificationService.verificationApproved({
          userId: student_id,
          collegeName: college.name,
        });
      } else {
        await NotificationService.verificationRejected({
          userId: student_id,
          reason,
        });
      }

      log.info(`Verification photo ${action}d for user ${student_id} by ${authCtx.uid}`);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'reviewVerificationPhoto');
    }
  });
