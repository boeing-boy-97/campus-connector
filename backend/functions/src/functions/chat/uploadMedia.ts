// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  chat/uploadMedia.ts — Generate signed URL for chat media upload         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { ChatService } from '../../services/chat.service';
import { CHAT_LIMITS } from '../../../../../shared/constants';

const schema = z.object({
  match_id: Schemas.docId,
  content_type: z.string().min(3).max(100),
  file_size: z.number().int().positive().max(CHAT_LIMITS.MAX_MEDIA_SIZE_MB * 1024 * 1024),
});

export const uploadMedia = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { match_id, content_type, file_size } = validate(schema, data);

      const res = await ChatService.getMediaUploadUrl({
        matchId: match_id,
        userId: authCtx.uid,
        contentType: content_type,
        fileSize: file_size,
      });

      return { success: true, data: res };
    } catch (error) {
      handleUnknownError(error, 'uploadMedia');
    }
  });
