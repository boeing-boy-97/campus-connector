// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  fcm.utils.ts — Firebase Cloud Messaging helper                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { messaging, db, FieldValue } from '../config/firebase';
import { COLLECTIONS } from '../../../../shared/constants';
import { createLogger } from './logger';

const log = createLogger('fcm.utils');

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

/**
 * Sends a push notification to a specific FCM token.
 * Automatically clears stale tokens on failure.
 */
export async function sendPush(
  token: string,
  userId: string,
  payload: PushPayload
): Promise<boolean> {
  try {
    await messaging.send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'campus_connect_default',
          sound: 'default',
          color: '#6C63FF',
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
            'content-available': 1,
          },
        },
        headers: { 'apns-priority': '10' },
      },
    });
    log.debug(`Push sent to user ${userId}`);
    return true;
  } catch (error: any) {
    const STALE_TOKEN_CODES = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ];
    if (STALE_TOKEN_CODES.includes(error?.errorInfo?.code)) {
      log.warn(`Stale FCM token for user ${userId}, clearing`);
      await db.collection(COLLECTIONS.STUDENTS).doc(userId).update({ fcm_token: null }).catch(() => {});
      return false;
    }
    log.error(`FCM send failed for user ${userId}`, error);
    return false;
  }
}

/**
 * Sends a push notification to a user by their student ID (auto-fetches token)
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(userId).get();
  if (!studentSnap.exists) return false;

  const fcmToken = studentSnap.data()?.fcm_token as string | null;
  if (!fcmToken) {
    log.debug(`No FCM token for user ${userId}`);
    return false;
  }

  return sendPush(fcmToken, userId, payload);
}

/**
 * Creates an in-app notification document (always, regardless of push success)
 */
export async function createInAppNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<string> {
  const ref = await db.collection(COLLECTIONS.NOTIFICATIONS).add({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
    is_read: false,
    created_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Sends both a push notification AND creates an in-app notification
 */
export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  await Promise.all([
    sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      data: params.data,
    }),
    createInAppNotification(params),
  ]);
}
