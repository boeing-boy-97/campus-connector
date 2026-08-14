// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  chat.service.ts — Chat & messaging business logic                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { db, FieldValue } from '../config/firebase';
import { getStudent } from '../utils/firestore.utils';
import { Errors } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { COLLECTIONS, CHAT_LIMITS } from '../../../../shared/constants';
import { MatchStatus, MessageMediaType } from '../../../../shared/enums';
import { NotificationService } from './notification.service';
import { storage } from '../config/firebase';
import { randomUUID } from 'node:crypto';

const log = createLogger('chat.service');

const ALLOWED_CONTENT_TYPES = new Map<string, MessageMediaType>([
  ['image/jpeg', MessageMediaType.IMAGE],
  ['image/png', MessageMediaType.IMAGE],
  ['image/webp', MessageMediaType.IMAGE],
  ['video/mp4', MessageMediaType.VIDEO],
]);

const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ChatService = {

  /**
   * Validates that a user is a participant of a match and it's active.
   * Returns the match data and the recipient ID.
   */
  async validateMatchParticipant(
    matchId: string,
    userId: string
  ): Promise<{ match: FirebaseFirestore.DocumentData; recipientId: string }> {
    const matchSnap = await db.collection(COLLECTIONS.MATCHES).doc(matchId).get();
    if (!matchSnap.exists) throw Errors.notFound('Match');

    const match = matchSnap.data()!;
    const isParticipant = match.student_a_id === userId || match.student_b_id === userId;

    if (!isParticipant) throw Errors.forbidden();
    if (match.status !== MatchStatus.ACTIVE) {
      throw Errors.preconditionFailed('This match is no longer active.');
    }

    const recipientId = match.student_a_id === userId ? match.student_b_id : match.student_a_id;
    return { match, recipientId };
  },

  /**
   * Sends a text or media message.
   */
  async sendMessage(params: {
    matchId: string;
    senderId: string;
    text?: string;
    mediaPath?: string;
  }): Promise<string> {
    const { matchId, senderId, text, mediaPath } = params;

    if (!text && !mediaPath) {
      throw Errors.invalidArgument('Message must have either text or media.');
    }

    if (text && text.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH) {
      throw Errors.invalidArgument(`Message exceeds maximum length of ${CHAT_LIMITS.MAX_MESSAGE_LENGTH} characters.`);
    }

    const { recipientId } = await ChatService.validateMatchParticipant(matchId, senderId);
    let mediaType: MessageMediaType | undefined;

    if (mediaPath) {
      const expectedPrefix = `chat_media/${matchId}/`;
      if (!mediaPath.startsWith(expectedPrefix) || mediaPath.slice(expectedPrefix.length).includes('/')) {
        throw Errors.invalidArgument('Invalid chat media path.');
      }

      let metadata;
      try {
        [metadata] = await storage.bucket().file(mediaPath).getMetadata();
      } catch {
        throw Errors.invalidArgument('The uploaded media file does not exist.');
      }
      mediaType = ALLOWED_CONTENT_TYPES.get(metadata.contentType ?? '');
      const uploadedSize = Number(metadata.size ?? 0);
      const customMetadata = metadata.metadata ?? {};
      if (
        customMetadata.uploader_id !== senderId
        || customMetadata.match_id !== matchId
      ) {
        throw Errors.forbidden('This media upload does not belong to the sender.');
      }
      if (!mediaType || uploadedSize <= 0 || uploadedSize > MAX_MEDIA_SIZE_BYTES) {
        throw Errors.invalidArgument('The uploaded media file is not supported.');
      }
    }

    // Build preview for match document
    let preview: string;
    if (text) {
      preview = text.length > 60 ? text.substring(0, 57) + '…' : text;
    } else if (mediaType === MessageMediaType.IMAGE) {
      preview = '📷 Photo';
    } else {
      preview = '🎥 Video';
    }

    const msgRef = db.collection(COLLECTIONS.MESSAGES).doc();
    const batch = db.batch();

    batch.set(msgRef, {
      match_id: matchId,
      sender_id: senderId,
      text: text || null,
      media_path: mediaPath || null,
      media_type: mediaType || null,
      sent_at: FieldValue.serverTimestamp(),
      read_at: null,
      is_deleted: false,
    });

    batch.update(db.collection(COLLECTIONS.MATCHES).doc(matchId), {
      last_message_at: FieldValue.serverTimestamp(),
      last_message_preview: preview,
      [`unread_count_${recipientId}`]: FieldValue.increment(1),
    });

    await batch.commit();

    // Push notification
    const sender = await getStudent(senderId);
    await NotificationService.newMessage({
      toId: recipientId,
      senderName: sender?.full_name || 'Someone',
      matchId,
      preview: text
        ? (text.length > 80 ? text.substring(0, 77) + '…' : text)
        : mediaType === MessageMediaType.IMAGE ? '📷 Sent a photo' : '🎥 Sent a video',
    });

    log.debug(`Message ${msgRef.id} sent in match ${matchId}`);
    return msgRef.id;
  },

  /**
   * Marks all messages from the other person as read.
   */
  async markRead(matchId: string, userId: string): Promise<number> {
    const { recipientId: senderId } = await ChatService.validateMatchParticipant(matchId, userId);

    // Fetch unread messages from the other person
    const unreadSnap = await db.collection(COLLECTIONS.MESSAGES)
      .where('match_id', '==', matchId)
      .where('sender_id', '==', senderId)
      .where('read_at', '==', null)
      .where('is_deleted', '==', false)
      .get();

    const matchRef = db.collection(COLLECTIONS.MATCHES).doc(matchId);

    if (unreadSnap.empty) {
      // Still clear the counter — it can drift if a message was deleted after
      // incrementing it, and a stale badge is a visible bug.
      await matchRef.update({ [`unread_count_${userId}`]: 0 });
      return 0;
    }

    const readAt = FieldValue.serverTimestamp();
    const BATCH_SIZE = 499;

    for (let i = 0; i < unreadSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      unreadSnap.docs
        .slice(i, i + BATCH_SIZE)
        .forEach((document) => batch.update(document.ref, { read_at: readAt }));

      // Reset the recipient's unread counter alongside the final chunk so the
      // badge never clears while messages remain unmarked.
      if (i + BATCH_SIZE >= unreadSnap.docs.length) {
        batch.update(matchRef, { [`unread_count_${userId}`]: 0 });
      }
      await batch.commit();
    }

    return unreadSnap.size;
  },

  /**
   * Soft-deletes a single message (only sender can delete).
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const msgSnap = await db.collection(COLLECTIONS.MESSAGES).doc(messageId).get();
    if (!msgSnap.exists) throw Errors.notFound('Message');

    const msg = msgSnap.data()!;
    if (msg.sender_id !== userId) throw Errors.forbidden('Only the sender can delete a message.');

    await db.collection(COLLECTIONS.MESSAGES).doc(messageId).update({
      is_deleted: true,
      text: null,
      media_path: null,
      media_type: null,
      deleted_at: FieldValue.serverTimestamp(),
    });

    const mediaPath = typeof msg.media_path === 'string' ? msg.media_path : null;
    if (mediaPath?.startsWith(`chat_media/${msg.match_id}/`)) {
      await storage.bucket().file(mediaPath).delete({ ignoreNotFound: true });
    }
  },

  /**
   * Generates a signed upload URL for a media file.
   */
  async getMediaUploadUrl(params: {
    matchId: string;
    userId: string;
    contentType: string;
    fileSize: number;
  }): Promise<{
    upload_url: string;
    file_path: string;
    upload_headers: Record<string, string>;
  }> {
    const { matchId, userId, contentType, fileSize } = params;

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw Errors.invalidArgument(`Unsupported file type: ${contentType}`);
    }

    if (fileSize > MAX_MEDIA_SIZE_BYTES) {
      throw Errors.invalidArgument(`File size exceeds the maximum of ${MAX_MEDIA_SIZE_BYTES / 1024 / 1024} MB.`);
    }

    await ChatService.validateMatchParticipant(matchId, userId);

    const ext = contentType.split('/')[1];
    const fileName = `${randomUUID()}.${ext}`;
    const filePath = `chat_media/${matchId}/${fileName}`;

    const file = storage.bucket().file(filePath);
    const uploadHeaders = {
      'content-type': contentType,
      'x-goog-meta-uploader_id': userId,
      'x-goog-meta-match_id': matchId,
    };
    const [uploadUrl] = await file.getSignedUrl({
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType,
      extensionHeaders: {
        'x-goog-meta-uploader_id': userId,
        'x-goog-meta-match_id': matchId,
      },
    });

    return { upload_url: uploadUrl, file_path: filePath, upload_headers: uploadHeaders };
  },
};
