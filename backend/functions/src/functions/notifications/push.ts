// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  notifications/push.ts — Admin-triggered push notification                ║
// ║                                                                          ║
// ║  Delivers an operational announcement to one student. Regular in-app      ║
// ║  notifications flow through NotificationService; this endpoint exists so   ║
// ║  administrators can reach a specific user (e.g. safety follow-up).        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth.middleware';
import { validate, Schemas } from '../../middleware/validate.middleware';
import { handleUnknownError, Errors } from '../../utils/errors';
import { notify } from '../../utils/fcm.utils';
import { getStudent, writeAuditLog } from '../../utils/firestore.utils';
import { createLogger } from '../../utils/logger';
import { COLLECTIONS } from '../../../../../shared/constants';
import { NotificationType } from '../../../../../shared/enums';

const log = createLogger('sendPushNotification');

const schema = z.object({
  user_id: Schemas.docId,
  title: z.string().min(1).max(100).trim(),
  body: z.string().min(1).max(500).trim(),
  data: z.record(z.string().max(500)).optional(),
});

export const sendPushNotification = functions
  .region('asia-south1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    try {
      const authCtx = requireAdmin(context);
      const { user_id, title, body, data: payload } = validate(schema, data);

      const student = await getStudent(user_id);
      if (!student) throw Errors.notFound('Student');

      // `notify` always persists the in-app notification, and reports whether the
      // device push itself was delivered (a missing/stale FCM token is not fatal).
      const result = await notify({
        userId: user_id,
        type: NotificationType.ADMIN_ANNOUNCEMENT,
        title,
        body,
        data: { ...(payload ?? {}), type: NotificationType.ADMIN_ANNOUNCEMENT },
      });

      await writeAuditLog({
        admin_id: authCtx.uid,
        action: 'send_push_notification',
        target_id: user_id,
        target_collection: COLLECTIONS.STUDENTS,
        details: { title, push_delivered: result.pushDelivered },
      });

      log.info(`Announcement sent to ${user_id} (push delivered: ${result.pushDelivered})`);

      return {
        success: true,
        data: {
          notification_id: result.notificationId,
          push_delivered: result.pushDelivered,
        },
      };
    } catch (error) {
      handleUnknownError(error, 'sendPushNotification');
    }
  });
