// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  connectRequest.ts — Send a like/connect request                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, CHAT_LIMITS, ERROR_CODES } from '../../../../shared/constants';
import { MatchType, ConnectRequestStatus, VerificationStatus, NotificationType } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const connectRequestSchema = z.object({
  to_id: z.string().min(1).max(128),
  match_type: z.nativeEnum(MatchType),
  message: z.string().max(CHAT_LIMITS.MAX_INTRO_MESSAGE_LENGTH).trim().optional(),
});

export const sendConnectRequest = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ request_id: string }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;
    const collegeId = context.auth.token?.college_id;

    if (context.auth.token?.verification_status !== VerificationStatus.APPROVED) {
      throw new functions.https.HttpsError(
        'failed-precondition', 'Profile must be verified.',
        { code: ERROR_CODES.NOT_VERIFIED }
      );
    }

    try {
      const parsed = connectRequestSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { to_id, match_type, message } = parsed.data;

      if (to_id === uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Cannot send request to yourself.');
      }

      // Verify target is in same college and is verified
      const targetSnap = await db.collection(COLLECTIONS.STUDENTS).doc(to_id).get();
      if (!targetSnap.exists || targetSnap.data()!.college_id !== collegeId) {
        throw new functions.https.HttpsError(
          'not-found', 'Student not found.',
          { code: ERROR_CODES.SAME_COLLEGE_REQUIRED }
        );
      }

      if (targetSnap.data()!.verification_status !== VerificationStatus.APPROVED) {
        throw new functions.https.HttpsError('not-found', 'Student not found.');
      }

      // Check block in either direction
      const [blockA, blockB] = await Promise.all([
        db.collection(COLLECTIONS.BLOCKS).doc(`${uid}_${to_id}`).get(),
        db.collection(COLLECTIONS.BLOCKS).doc(`${to_id}_${uid}`).get(),
      ]);
      if (blockA.exists || blockB.exists) {
        throw new functions.https.HttpsError(
          'permission-denied', 'Cannot send request.',
          { code: ERROR_CODES.USER_BLOCKED }
        );
      }

      // Check for existing pending request
      const existing = await db.collection(COLLECTIONS.CONNECT_REQUESTS)
        .where('from_id', '==', uid)
        .where('to_id', '==', to_id)
        .where('status', '==', ConnectRequestStatus.PENDING)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new functions.https.HttpsError(
          'already-exists', 'Request already sent.',
          { code: ERROR_CODES.ALREADY_REQUESTED }
        );
      }

      // Create connect request
      const reqRef = await db.collection(COLLECTIONS.CONNECT_REQUESTS).add({
        from_id: uid,
        to_id,
        college_id: collegeId,
        match_type,
        status: ConnectRequestStatus.PENDING,
        message: message || null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send push notification to recipient
      const targetFcmToken = targetSnap.data()!.fcm_token;
      if (targetFcmToken) {
        const senderSnap = await db.collection(COLLECTIONS.STUDENTS).doc(uid).get();
        const senderName = senderSnap.data()?.full_name || 'Someone';
        await db.collection(COLLECTIONS.NOTIFICATIONS).add({
          user_id: to_id,
          type: NotificationType.CONNECT_REQUEST,
          title: 'New Connection Request! 🎉',
          body: `${senderName} wants to connect with you`,
          data: { request_id: reqRef.id, from_id: uid },
          is_read: false,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { success: true, data: { request_id: reqRef.id } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('sendConnectRequest error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send request');
    }
  });
