// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  sendMessage.ts — Send a chat message to a matched student              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS, CHAT_LIMITS, ERROR_CODES } from '../../../../shared/constants';
import { MatchStatus, MessageMediaType, NotificationType } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();

const sendMessageSchema = z.object({
  match_id: z.string().min(1).max(128),
  text: z.string().max(CHAT_LIMITS.MAX_MESSAGE_LENGTH).trim().optional(),
  media_url: z.string().url().optional(),
  media_type: z.nativeEnum(MessageMediaType).optional(),
}).refine((d) => d.text || d.media_url, { message: 'Message must have text or media.' });

export const sendMessage = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ message_id: string }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = sendMessageSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { match_id, text, media_url, media_type } = parsed.data;

      // Verify match exists and user is part of it
      const matchSnap = await db.collection(COLLECTIONS.MATCHES).doc(match_id).get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found.', { code: ERROR_CODES.NOT_MATCHED });
      }

      const match = matchSnap.data()!;
      const isParticipant = match.student_a_id === uid || match.student_b_id === uid;
      if (!isParticipant) {
        throw new functions.https.HttpsError('permission-denied', 'Not a participant of this match.');
      }

      if (match.status !== MatchStatus.ACTIVE) {
        throw new functions.https.HttpsError(
          'failed-precondition', 'Match is no longer active.',
          { code: ERROR_CODES.MATCH_INACTIVE }
        );
      }

      const recipientId = match.student_a_id === uid ? match.student_b_id : match.student_a_id;

      // Batch: create message + update match last_message
      const msgRef = db.collection(COLLECTIONS.MESSAGES).doc();
      const batch = db.batch();

      batch.set(msgRef, {
        match_id,
        sender_id: uid,
        text: text || null,
        media_url: media_url || null,
        media_type: media_type || null,
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        read_at: null,
        is_deleted: false,
      });

      batch.update(db.collection(COLLECTIONS.MATCHES).doc(match_id), {
        last_message_at: admin.firestore.FieldValue.serverTimestamp(),
        last_message_preview: text
          ? text.substring(0, 60)
          : (media_type === MessageMediaType.IMAGE ? '📷 Photo' : '🎥 Video'),
      });

      await batch.commit();

      // Notification for recipient
      await db.collection(COLLECTIONS.NOTIFICATIONS).add({
        user_id: recipientId,
        type: NotificationType.NEW_MESSAGE,
        title: 'New Message 💬',
        body: text ? text.substring(0, 80) : 'Sent you a photo',
        data: { match_id, sender_id: uid },
        is_read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, data: { message_id: msgRef.id } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('sendMessage error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send message');
    }
  });
