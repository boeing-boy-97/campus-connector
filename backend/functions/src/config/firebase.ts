// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — FIREBASE ADMIN SINGLETON                              ║
// ║  Single initialization point — imported by all services and utils       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions/v1';

const app = getApps()[0] ?? initializeApp();
if (getApps().length === 1) {
  functions.logger.info('Firebase Admin SDK initialized');
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);
export { FieldValue, Timestamp };

// Firestore settings for better performance
db.settings({ ignoreUndefinedProperties: true });

export default app;
