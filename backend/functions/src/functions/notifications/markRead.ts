// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notifications/markRead.ts — Mark notifications as read                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';

const schema = z.object({
  notification_ids: z.array(Schemas.docId).min(1).max(50).optional(), // If omitted, mark ALL read
});

export const markNotificationsRead = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAuth(context);
      const { notification_ids } = validate(schema, data ?? {});

      let query = db.collection(COLLECTIONS.NOTIFICATIONS)
        .where('user_id', '==', authCtx.uid)
        .where('is_read', '==', false);

      if (notification_ids && notification_ids.length > 0) {
        query = query.where('__name__', 'in', notification_ids);
      }

      const snap = await query.get();
      if (snap.empty) return { success: true, data: { updated_count: 0 } };

      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { is_read: true }));
      await batch.commit();

      return { success: true, data: { updated_count: snap.size } };
    } catch (error) {
      handleUnknownError(error, 'markNotificationsRead');
    }
  });
