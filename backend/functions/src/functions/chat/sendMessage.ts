// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  sendMessage.ts — Chat message handler                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError } from '../../utils/errors';
import { ChatService } from '../../services/chat.service';
import { CHAT_LIMITS } from '../../../../../shared/constants';

const schema = z.object({
  match_id: Schemas.docId,
  text: z.string().max(CHAT_LIMITS.MAX_MESSAGE_LENGTH).trim().optional(),
  media_path: z.string().max(512).optional(),
}).refine((d) => d.text || d.media_path, 'Message must contain text or media.');

export const sendMessage = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      await RateLimits.sendMessage(authCtx.uid);
      const { match_id, text, media_path } = validate(schema, data);

      const messageId = await ChatService.sendMessage({
        matchId: match_id,
        senderId: authCtx.uid,
        text,
        mediaPath: media_path,
      });

      return { success: true, data: { message_id: messageId } };
    } catch (error) {
      handleUnknownError(error, 'sendMessage');
    }
  });
