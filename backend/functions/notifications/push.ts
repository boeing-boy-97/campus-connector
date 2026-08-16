// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  push.ts — Send FCM push notification to a student                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { COLLECTIONS } from '../../../../shared/constants';
import { ApiResponse } from '../../../../shared/types';

const db = admin.firestore();
const messaging = admin.messaging();

const pushSchema = z.object({
  user_id: z.string().min(1).max(128),
  title: z.string().max(100),
  body: z.string().max(500),
  data: z.record(z.string()).optional(),
});

export const sendPushNotification = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    // Only Cloud Functions (admin context) or admins can trigger push directly
    if (!context.auth || context.auth.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    try {
      const parsed = pushSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { user_id, title, body, data: payload } = parsed.data;

      // Get the student's FCM token
      const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(user_id).get();
      if (!studentSnap.exists) {
        return { success: false, error: 'Student not found' };
      }

      const fcmToken = studentSnap.data()!.fcm_token;
      if (!fcmToken) {
        return { success: false, error: 'No FCM token registered' };
      }

      await messaging.send({
        token: fcmToken,
        notification: { title, body },
        data: payload || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'campus_connect_default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: { badge: 1, sound: 'default' },
          },
        },
      });

      return { success: true };
    } catch (error) {
      // Handle invalid FCM token
      if ((error as any)?.errorInfo?.code === 'messaging/invalid-registration-token' ||
          (error as any)?.errorInfo?.code === 'messaging/registration-token-not-registered') {
        // Clear stale token
        await db.collection(COLLECTIONS.STUDENTS).doc(data.user_id).update({ fcm_token: null });
        return { success: false, error: 'Stale token cleared' };
      }
      functions.logger.error('sendPushNotification error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send notification');
    }
  });
