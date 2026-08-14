// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  chat/deleteMessage.ts — Delete a chat message                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { ChatService } from '../../services/chat.service';

const schema = z.object({
  message_id: Schemas.docId,
});

export const deleteMessage = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { message_id } = validate(schema, data);

      await ChatService.deleteMessage(message_id, authCtx.uid);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'deleteMessage');
    }
  });
