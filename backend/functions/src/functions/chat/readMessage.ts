// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  chat/readMessage.ts — Mark chat messages as read                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { ChatService } from '../../services/chat.service';

const schema = z.object({
  match_id: Schemas.docId,
});

export const markRead = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { match_id } = validate(schema, data);

      const count = await ChatService.markRead(match_id, authCtx.uid);

      return { success: true, data: { marked_read_count: count } };
    } catch (error) {
      handleUnknownError(error, 'markRead');
    }
  });
