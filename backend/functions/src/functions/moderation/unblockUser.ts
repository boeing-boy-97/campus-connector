// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/unblockUser.ts — Unblock a previously blocked student        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

const schema = z.object({
  blocked_id: Schemas.docId,
});

export const unblockUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { blocked_id } = validate(schema, data);

      const blockDocId = `${authCtx.uid}_${blocked_id}`;
      await db.collection(COLLECTIONS.BLOCKS).doc(blockDocId).delete();

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'unblockUser');
    }
  });
