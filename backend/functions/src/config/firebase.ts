// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — FIREBASE ADMIN SINGLETON                              ║
// ║  Single initialization point — imported by all services and utils       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Guard: only initialize once
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
      console.log('Firebase Admin SDK initialized using FIREBASE_SERVICE_ACCOUNT');
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
      admin.initializeApp();
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'campus-connectt';
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    console.log('Firebase Admin SDK initialized using private key credentials');
  } else {
    admin.initializeApp();
    functions.logger.info('Firebase Admin SDK initialized');
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export const messaging = admin.messaging();
export { FieldValue, Timestamp };

// Firestore settings for better performance
db.settings({ ignoreUndefinedProperties: true });

export default admin;
