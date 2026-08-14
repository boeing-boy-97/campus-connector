// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  moderation/getBlockedUsers.ts — List the accounts the caller has blocked  ║
// ║                                                                          ║
// ║  Blocking is only a usable safety feature if it is reversible, which       ║
// ║  requires the user to see who they have blocked. Only names — never        ║
// ║  private profile fields — are returned.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { db } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

const MAX_ITEMS = 100;

export const getBlockedUsers = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (_data, context) => {
    try {
      const authCtx = requireAuth(context);

      const snapshot = await db.collection(COLLECTIONS.BLOCKS)
        .where('blocker_id', '==', authCtx.uid)
        .limit(MAX_ITEMS)
        .get();

      const items = await Promise.all(snapshot.docs.map(async (document) => {
        const block = document.data();
        const student = await db.collection(COLLECTIONS.STUDENTS)
          .doc(block.blocked_id)
          .get();
        const createdAt = block.created_at;

        return {
          blocked_id: block.blocked_id as string,
          full_name: (student.data()?.full_name as string) ?? 'Former member',
          reason: (block.reason as string | null) ?? null,
          created_at: typeof createdAt?.toDate === 'function'
            ? createdAt.toDate().toISOString()
            : null,
        };
      }));

      items.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

      return { success: true, data: { items } };
    } catch (error) {
      handleUnknownError(error, 'getBlockedUsers');
    }
  });
