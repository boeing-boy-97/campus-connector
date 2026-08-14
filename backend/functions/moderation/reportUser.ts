// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  reportUser.ts — File a report against another student                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, REPORT_LIMITS } from '../../../../shared/constants';
import { ReportReason, ReportStatus, VerificationStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const reportUserSchema = z.object({
  reported_id: z.string().min(1).max(128),
  reason: z.nativeEnum(ReportReason),
  description: z.string().max(REPORT_LIMITS.MAX_DESCRIPTION_LENGTH).trim().optional(),
});

export const reportUser = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    if (context.auth.token?.verification_status !== VerificationStatus.APPROVED) {
      throw new functions.https.HttpsError('failed-precondition', 'Profile must be verified to report.');
    }

    try {
      const parsed = reportUserSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { reported_id, reason, description } = parsed.data;

      if (reported_id === uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot report yourself.');
      }

      // Verify reported user is in same college
      const reporterSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      const reportedSnap = await db.collection(COLLECTIONS.STUDENTS).doc(reported_id).get();

      if (!reportedSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found.');
      }

      if (reporterSnap.data()!.college_id !== reportedSnap.data()!.college_id) {
        throw new functions.https.HttpsError('permission-denied', 'User not in your college.');
      }

      // Prevent spam — max 1 pending report per reported user
      const existingReport = await db.collection(COLLECTIONS.REPORTS)
        .where('reporter_id', '==', uid)
        .where('reported_id', '==', reported_id)
        .where('status', '==', ReportStatus.PENDING)
        .limit(1)
        .get();

      if (!existingReport.empty) {
        throw new functions.https.HttpsError('already-exists', 'You have already reported this user.');
      }

      await db.collection(COLLECTIONS.REPORTS).add({
        reporter_id: uid,
        reported_id,
        college_id: reporterSnap.data()!.college_id,
        reason,
        description: description || null,
        evidence_urls: [],
        status: ReportStatus.PENDING,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('reportUser error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to submit report');
    }
  });
