// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  blockUser.ts — Block another student                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { MatchStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const blockUserSchema = z.object({
  blocked_id: z.string().min(1).max(128),
});

export const blockUser = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = blockUserSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { blocked_id } = parsed.data;

      if (blocked_id === uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot block yourself.');
      }

      const blockDocId = `${uid}_${blocked_id}`;

      // Idempotent — if already blocked, return success
      const existingBlock = await db.collection(COLLECTIONS.BLOCKS).doc(blockDocId).get();
      if (existingBlock.exists) {
        return { success: true };
      }

      const batch = db.batch();

      // Create block
      batch.set(db.collection(COLLECTIONS.BLOCKS).doc(blockDocId), {
        blocker_id: uid,
        blocked_id,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Deactivate any active match between these users
      const matchesA = await db.collection(COLLECTIONS.MATCHES)
        .where('student_a_id', '==', uid)
        .where('student_b_id', '==', blocked_id)
        .where('status', '==', MatchStatus.ACTIVE)
        .get();

      const matchesB = await db.collection(COLLECTIONS.MATCHES)
        .where('student_a_id', '==', blocked_id)
        .where('student_b_id', '==', uid)
        .where('status', '==', MatchStatus.ACTIVE)
        .get();

      [...matchesA.docs, ...matchesB.docs].forEach((d) =>
        batch.update(d.ref, { status: MatchStatus.UNMATCHED })
      );

      // Cancel any pending connect requests between them
      const pendingReqs = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('from_id', '==', uid)
        .where('to_id', '==', blocked_id)
        .where('status', '==', 'pending')
        .get();

      pendingReqs.docs.forEach((d) => batch.update(d.ref, { status: 'declined' }));

      await batch.commit();

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('blockUser error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to block user');
    }
  });
