// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  acceptRequest.ts — Accept a connection request, create match           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { ConnectRequestStatus, MatchStatus, NotificationType } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const acceptRequestSchema = z.object({
  request_id: z.string().min(1).max(128),
  action: z.enum(['accept', 'decline']),
});

export const acceptConnectRequest = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ match_id?: string }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = acceptRequestSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { request_id, action } = parsed.data;

      const reqRef = db.collection(COLLECTIONS.CONNECT_REQUESTS).doc(request_id);
      const reqSnap = await reqRef.get();

      if (!reqSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Request not found.');
      }

      const req = reqSnap.data()!;

      // Only the recipient can accept/decline
      if (req.to_id !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized.');
      }

      if (req.status !== ConnectRequestStatus.PENDING) {
        throw new functions.https.HttpsError('failed-precondition', 'Request is no longer pending.');
      }

      if (action === 'decline') {
        await reqRef.update({
          status: ConnectRequestStatus.DECLINED,
          responded_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true };
      }

      // Accept — create match atomically
      const matchRef = db.collection(COLLECTIONS.MATCHES).doc();
      const batch = db.batch();

      batch.update(reqRef, {
        status: ConnectRequestStatus.ACCEPTED,
        responded_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      batch.set(matchRef, {
        student_a_id: req.from_id,
        student_b_id: uid,
        college_id: req.college_id,
        match_type: req.match_type,
        status: MatchStatus.ACTIVE,
        matched_at: admin.firestore.FieldValue.serverTimestamp(),
        last_message_at: null,
        last_message_preview: null,
      });

      await batch.commit();

      // Notify the sender
      const senderSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
      const myName = senderSnap.data()?.full_name || 'Someone';

      await db.collection(COLLECTIONS.NOTIFICATIONS).add({
        user_id: req.from_id,
        type: NotificationType.NEW_MATCH,
        title: "It's a Match! 💞",
        body: `You and ${myName} are now connected!`,
        data: { match_id: matchRef.id },
        is_read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, data: { match_id: matchRef.id } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('acceptConnectRequest error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to process request');
    }
  });
