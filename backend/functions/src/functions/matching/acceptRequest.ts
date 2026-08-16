// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  matching/acceptRequest.ts — Accept or decline a connection request      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { MatchService } from '../../services/match.service';

const schema = z.object({
  request_id: Schemas.docId,
  action: z.enum(['accept', 'decline']),
});

export const acceptConnectRequest = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { request_id, action } = validate(schema, data);

      const matchId = await MatchService.respondToRequest({
        requestId: request_id,
        responderId: authCtx.uid,
        action,
      });

      return {
        success: true,
        data: { match_id: matchId, status: action === 'accept' ? 'matched' : 'declined' },
      };
    } catch (error) {
      handleUnknownError(error, 'acceptConnectRequest');
    }
  });
