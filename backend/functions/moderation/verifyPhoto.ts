// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  verifyPhoto.ts — Admin: approve or reject verification photo           ║
// ║  Security: admin/moderator only, audit logged                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { VerificationStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const verifyPhotoSchema = z.object({
  request_id: z.string().min(1).max(128),
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(500).trim().optional(),
});

export const reviewVerificationPhoto = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    // Moderator or Admin only
    if (!context.auth ||
      !['admin', 'moderator'].includes(context.auth.token?.role)) {
      throw new functions.https.HttpsError('permission-denied', 'Moderator access required.');
    }

    const reviewerId = context.auth.uid;

    try {
      const parsed = verifyPhotoSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { request_id, action, notes } = parsed.data;

      const reqRef = db.collection(COLLECTIONS.VERIFICATION_REQUESTS).doc(request_id);
      const reqSnap = await reqRef.get();

      if (!reqSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Verification request not found.');
      }

      const req = reqSnap.data()!;
      if (req.review_status !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'Request already reviewed.');
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const studentStatus = action === 'approve'
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

      const batch = db.batch();

      // Update verification request
      batch.update(reqRef, {
        review_status: newStatus,
        review_notes: notes || null,
        reviewed_by: reviewerId,
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update student verification status
      batch.update(db.collection(COLLECTIONS.STUDENTS).doc(req.student_id), {
        verification_status: studentStatus,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      // Update Firebase Auth custom claims
      const claims = await admin.auth().getUser(req.student_id)
        .then((u) => u.customClaims || {});
      await admin.auth().setCustomUserClaims(req.student_id, {
        ...claims,
        verification_status: studentStatus,
      });

      // Notify student
      const notifType = action === 'approve' ? 'verification_approved' : 'verification_rejected';
      const notifTitle = action === 'approve'
        ? '✅ Profile Verified!'
        : '❌ Verification Rejected';
      const notifBody = action === 'approve'
        ? 'Your profile is now live. Start connecting!'
        : `Reason: ${notes || 'Please resubmit a clearer photo.'}`;

      await db.collection(COLLECTIONS.NOTIFICATIONS).add({
        user_id: req.student_id,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        data: { request_id },
        is_read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Audit log
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        admin_id: reviewerId,
        action: `${action}_verification`,
        target_id: req.student_id,
        target_collection: COLLECTIONS.STUDENTS,
        details: { request_id, notes },
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('reviewVerificationPhoto error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to review verification');
    }
  });
