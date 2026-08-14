// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/blockUser.ts — Block another student                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import { MatchStatus } from '../../../../../shared/enums';
import { createLogger } from '../../utils/logger';
import {
  blockDocumentId,
  getStudent,
  participantPairDocumentId,
} from '../../utils/firestore.utils';

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
      const blockedStudent = await getStudent(blocked_id);
      if (!blockedStudent || blockedStudent.college_id !== authCtx.collegeId) {
        throw Errors.notFound('Student');
      }

      const blocks = db.collection(COLLECTIONS.BLOCKS);
      const matches = db.collection(COLLECTIONS.MATCHES);
      const blockRef = blocks.doc(blockDocumentId(authCtx.uid, blocked_id));
      const deterministicMatchRef = matches.doc(participantPairDocumentId(authCtx.uid, blocked_id));

      // Atomically establish the block and close any match created under the
      // current deterministic-ID scheme.
      await db.runTransaction(async (transaction) => {
        const matchDocument = await transaction.get(deterministicMatchRef);
        transaction.set(blockRef, {
          blocker_id: authCtx.uid,
          blocked_id,
          college_id: authCtx.collegeId,
          reason: reason || null,
          created_at: FieldValue.serverTimestamp(),
        });
        if (matchDocument.data()?.status === MatchStatus.ACTIVE) {
          transaction.update(deterministicMatchRef, {
            status: MatchStatus.UNMATCHED,
            unmatched_at: FieldValue.serverTimestamp(),
            unmatched_by: authCtx.uid,
          });
        }
      });

      // Firestore cannot express an unordered pair with two `in` clauses.
      // Clean up any active match that predates deterministic IDs.
      const [forwardMatches, reverseMatches] = await Promise.all([
        matches.where('student_a_id', '==', authCtx.uid)
          .where('student_b_id', '==', blocked_id)
          .where('status', '==', MatchStatus.ACTIVE).get(),
        matches.where('student_a_id', '==', blocked_id)
          .where('student_b_id', '==', authCtx.uid)
          .where('status', '==', MatchStatus.ACTIVE).get(),
      ]);
      const legacyMatches = [...forwardMatches.docs, ...reverseMatches.docs]
        .filter((document) => document.id !== deterministicMatchRef.id);
      if (legacyMatches.length > 0) {
        const batch = db.batch();
        legacyMatches.forEach((document) => batch.update(document.ref, {
          status: MatchStatus.UNMATCHED,
          unmatched_at: FieldValue.serverTimestamp(),
          unmatched_by: authCtx.uid,
        }));
        await batch.commit();
      }

      log.info(`User blocked: ${authCtx.uid} blocked ${blocked_id}`);

      return { success: true };
    } catch (error) {
      handleUnknownError(error, 'blockUser');
    }
  });
