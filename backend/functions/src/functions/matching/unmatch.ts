// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  matching/unmatch.ts — Unmatch from a connected student                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireVerified } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { MatchService } from '../../services/match.service';

const schema = z.object({
  match_id: Schemas.docId,
});

export const unmatch = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireVerified(context);
      const { match_id } = validate(schema, data);

      await MatchService.unmatch(match_id, authCtx.uid);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'unmatch');
    }
  });
