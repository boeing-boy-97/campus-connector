// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  uploadMedia.ts — Get signed upload URL for chat media                  ║
// ║  Security: validates match membership, returns time-limited signed URL  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, STORAGE_PATHS } from '../../../../shared/constants';
import { MatchStatus } from '../../../../shared/enums';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();
const storage = admin.storage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const uploadMediaSchema = z.object({
  match_id: z.string().min(1).max(128),
  file_name: z.string().min(1).max(200),
  content_type: z.string().refine((t) => ALLOWED_MIME_TYPES.includes(t), 'Unsupported file type'),
  file_size: z.number().int().min(1).max(MAX_SIZE_BYTES),
});

export const uploadChatMedia = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse<{ upload_url: string; file_path: string }>> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = context.auth.uid;

    try {
      const parsed = uploadMediaSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { match_id, content_type } = parsed.data;

      // Verify match membership
      const matchSnap = await db.collection(COLLECTIONS.MATCHES).doc(match_id).get();
      if (!matchSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found.');
      }
      const match = matchSnap.data()!;
      if (match.student_a_id !== uid && match.student_b_id !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized.');
      }
      if (match.status !== MatchStatus.ACTIVE) {
        throw new functions.https.HttpsError('failed-precondition', 'Match is not active.');
      }

      // Generate unique file path
      const ext = content_type.split('/')[1];
      const fileName = `${uuidv4()}.${ext}`;
      const filePath = `${STORAGE_PATHS.CHAT_MEDIA(match_id)}/${fileName}`;

      // Generate signed upload URL (valid for 15 minutes)
      const file = storage.bucket().file(filePath);
      const [uploadUrl] = await file.getSignedUrl({
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000,
        contentType: content_type,
      });

      return { success: true, data: { upload_url: uploadUrl, file_path: filePath } };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('uploadChatMedia error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to generate upload URL');
    }
  });
