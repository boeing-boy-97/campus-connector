// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notifications/markRead.ts — Mark notifications as read                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db, FieldValue } from '../../config/firebase';
import { FieldPath } from 'firebase-admin/firestore';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const schema = z.object({
  notification_ids: z.array(Schemas.docId).min(1).max(300).optional(), // If omitted, mark ALL read
});

export const markNotificationsRead = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { notification_ids } = validate(schema, data ?? {});

      const query = db.collection(COLLECTIONS.NOTIFICATIONS)
        .where('user_id', '==', authCtx.uid)
        .where('is_read', '==', false);

      // Firestore caps `in` filters at 30 values, so chunk the requested IDs.
      // Without any IDs, every unread notification for the caller is marked read.
      const idChunks: (string[] | null)[] = notification_ids?.length
        ? chunk(notification_ids, 30)
        : [null];

      let updatedCount = 0;
      for (const ids of idChunks) {
        const scoped = ids ? query.where(FieldPath.documentId(), 'in', ids) : query;
        const snap = await scoped.get();
        if (snap.empty) continue;

        const batch = db.batch();
        snap.docs.forEach((document) => batch.update(document.ref, {
          is_read: true,
          read_at: FieldValue.serverTimestamp(),
        }));
        await batch.commit();
        updatedCount += snap.size;
      }

      return { success: true, data: { updated_count: updatedCount } };
    } catch (error) {
      handleUnknownError(error, 'markNotificationsRead');
    }
  });
