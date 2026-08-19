// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CAMPUS CONNECT — FIREBASE ADMIN SINGLETON                              ║
// ║  Single initialization point — imported by all services and utils       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import * as fs from 'fs';
import * as path from 'path';

// Lightweight env loader to parse .env.local when running standalone Express server
function loadEnv() {
  const searchPaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'backend/functions/.env.local'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../../../.env.local'),
  ];
  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const index = trimmed.indexOf('=');
          if (index === -1) return;
          const key = trimmed.substring(0, index).trim();
          let val = trimmed.substring(index + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        });
        console.log(`[Startup] Loaded env from ${envPath}`);
        break;
      } catch (err) {
        console.warn(`[Startup] Failed to parse env at ${envPath}:`, err);
      }
    }
  }
}

const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
  loadEnv();
}

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
  } else if (!isProduction) {
    // Local development: wire emulators automatically if credentials are missing
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'campus-connectt',
    });
    console.log(`Firebase Admin SDK auto-wired to local emulators (Project: ${process.env.FIREBASE_PROJECT_ID || 'campus-connectt'})`);
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
