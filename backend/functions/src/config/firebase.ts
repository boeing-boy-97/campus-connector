// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — FIREBASE ADMIN SINGLETON                              ║
// ║  Single initialization point — imported by all services and utils       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Guard: only initialize once
if (!admin.apps.length) {
  admin.initializeApp();
  functions.logger.info('Firebase Admin SDK initialized');
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export const messaging = admin.messaging();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

// Firestore settings for better performance
db.settings({ ignoreUndefinedProperties: true });

export default admin;
