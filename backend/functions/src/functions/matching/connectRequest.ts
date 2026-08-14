// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  connectRequest.ts — Send connect request                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { RateLimits } from '../../middleware/rateLimit.middleware';
import { handleUnknownError } from '../../utils/errors';
import { MatchService } from '../../services/match.service';
import { MatchType } from '../../../../../shared/enums';
import { CHAT_LIMITS } from '../../../../../shared/constants';

const schema = z.object({
  to_id: Schemas.docId,
  match_type: z.nativeEnum(MatchType),
  message: z.string().max(CHAT_LIMITS.MAX_INTRO_MESSAGE_LENGTH).trim().optional(),
});

export const sendConnectRequest = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      await RateLimits.connectRequest(authCtx.uid);
      const { to_id, match_type, message } = validate(schema, data);

      const requestId = await MatchService.sendConnectRequest({
        fromId: authCtx.uid,
        toId: to_id,
        collegeId: authCtx.collegeId,
        matchType: match_type,
        message,
      });

      return { success: true, data: { request_id: requestId } };
    } catch (error) {
      handleUnknownError(error, 'sendConnectRequest');
    }
  });
