// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  approveCollege.ts — Admin: approve or reject a college                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { CollegeVerifiedStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const approveCollegeSchema = z.object({
  college_id: z.string().min(1).max(128),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});

export const approveCollege = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth || context.auth.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    try {
      const parsed = approveCollegeSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { college_id, action, reason } = parsed.data;

      const collegeRef = db.collection(COLLECTIONS.COLLEGES).doc(college_id);
      const collegeSnap = await collegeRef.get();
      if (!collegeSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'College not found.');
      }

      const newStatus = action === 'approve'
        ? CollegeVerifiedStatus.APPROVED
        : CollegeVerifiedStatus.REJECTED;

      await collegeRef.update({
        verified_status: newStatus,
        approved_at: admin.firestore.FieldValue.serverTimestamp(),
        approved_by: context.auth.uid,
        ...(reason ? { rejection_reason: reason } : {}),
      });

      // Audit log
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        admin_id: context.auth.uid,
        action: `${action}_college`,
        target_id: college_id,
        target_collection: COLLECTIONS.COLLEGES,
        details: { reason },
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('approveCollege error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update college status');
    }
  });
