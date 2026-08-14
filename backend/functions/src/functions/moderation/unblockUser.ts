// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/unblockUser.ts — Unblock a previously blocked student        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { blockDocumentId } from '../../utils/firestore.utils';

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

      const blocks = db.collection(COLLECTIONS.BLOCKS);
      const batch = db.batch();
      batch.delete(blocks.doc(blockDocumentId(authCtx.uid, blocked_id)));
      const legacyDocumentId = `${authCtx.uid}_${blocked_id}`;
      if (!legacyDocumentId.includes('/')) batch.delete(blocks.doc(legacyDocumentId));
      await batch.commit();

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'unblockUser');
    }
  });
