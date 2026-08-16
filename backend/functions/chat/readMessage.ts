// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  readMessage.ts — Mark messages as read in a match                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const readMessageSchema = z.object({
  match_id: z.string().min(1).max(128),
});

export const markMessagesRead = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ updated_count: number }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = readMessageSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { match_id } = parsed.data;

      // Verify user is part of the match
      const matchSnap = await db.collection(COLLECTIONS.MATCHES).doc(match_id).get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found.');
      }
      const match = matchSnap.data()!;
      if (match.student_a_id !== uid && match.student_b_id !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized.');
      }

      // Get all unread messages sent by the OTHER person
      const unreadSnap = await db.collection(COLLECTIONS.MESSAGES)
        .where('match_id', '==', match_id)
        .where('sender_id', '!=', uid)
        .where('read_at', '==', null)
        .get();

      if (unreadSnap.empty) {
        return { success: true, data: { updated_count: 0 } };
      }

      // Batch update (max 500 per batch)
      const readAt = admin.firestore.FieldValue.serverTimestamp();
      const batches: Promise<admin.firestore.WriteResult[]>[] = [];
      let batch = db.batch();
      let count = 0;

      for (const doc of unreadSnap.docs) {
        batch.update(doc.ref, { read_at: readAt });
        count++;
        if (count % 499 === 0) {
          batches.push(batch.commit());
          batch = db.batch();
        }
      }
      batches.push(batch.commit());
      await Promise.all(batches);

      return { success: true, data: { updated_count: unreadSnap.size } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('markMessagesRead error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to mark messages as read');
    }
  });
