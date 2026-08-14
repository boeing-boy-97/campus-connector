// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notifications/getNotifications.ts — Fetch user notifications            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS, PAGINATION } from '../../../../../shared/constants';

const schema = z.object({
  ...Schemas.pagination.shape,
});

export const getNotifications = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { page_size = PAGINATION.NOTIFICATIONS_PAGE_SIZE, last_doc_id } = validate(schema, data ?? {});

      let query = db.collection(COLLECTIONS.NOTIFICATIONS)
        .where('user_id', '==', authCtx.uid)
        .orderBy('created_at', 'desc');

      if (last_doc_id) {
        const lastSnap = await db.collection(COLLECTIONS.NOTIFICATIONS).doc(last_doc_id).get();
        if (lastSnap.exists) query = query.startAfter(lastSnap);
      }

      query = query.limit(page_size + 1);
      const snap = await query.get();

      const docs = snap.docs.slice(0, page_size);
      const hasMore = snap.docs.length > page_size;

      const notifications = docs.map((d) => ({ id: d.id, ...d.data() }));

      return {
        success: true,
        data: {
          notifications,
          has_more: hasMore,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'getNotifications');
    }
  });
