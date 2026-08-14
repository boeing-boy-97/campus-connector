// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/blockUser.ts — Block another student                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { MatchStatus } from '../../../../../shared/enums';
import { createLogger } from '../../utils/logger';

const log = createLogger('blockUser');

const schema = z.object({
  blocked_id: Schemas.docId,
  reason: z.string().max(300).trim().optional(),
});

export const blockUser = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { blocked_id, reason } = validate(schema, data);

      if (authCtx.uid === blocked_id) {
        throw Errors.invalidArgument('You cannot block yourself.');
      }

      const blockDocId = `${authCtx.uid}_${blocked_id}`;
      const batch = db.batch();

      // Create block doc
      batch.set(db.collection(COLLECTIONS.BLOCKS).doc(blockDocId), {
        blocker_id: authCtx.uid,
        blocked_id,
        college_id: authCtx.collegeId,
        reason: reason || null,
        created_at: FieldValue.serverTimestamp(),
      });

      // Automatically unmatch if connected
      const matchSnap = await db.collection(COLLECTIONS.MATCHES)
        .where('student_a_id', 'in', [authCtx.uid, blocked_id])
        .where('student_b_id', 'in', [authCtx.uid, blocked_id])
        .where('status', '==', MatchStatus.ACTIVE)
        .limit(1)
        .get();

      if (!matchSnap.empty) {
        batch.update(matchSnap.docs[0].ref, {
          status: MatchStatus.UNMATCHED,
          unmatched_at: FieldValue.serverTimestamp(),
          unmatched_by: authCtx.uid,
        });
      }

      await batch.commit();

      log.info(`User blocked: ${authCtx.uid} blocked ${blocked_id}`);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'blockUser');
    }
  });
