import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const rawFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate required config.
// NOTE: these values are compiled into the bundle from VITE_FIREBASE_* env vars
// (e.g. Vercel project → Settings → Environment Variables). They must point to
// the SAME Firebase project that hosts the Cloud Functions (region asia-south1).
// We check the resolved object (not `import.meta.env[key]`) because Vite only
// statically replaces direct `import.meta.env.VITE_*` access.
const requiredConfigEntries: Array<[envKey: string, value: string | undefined]> = [
  ['VITE_FIREBASE_API_KEY', rawFirebaseConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', rawFirebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', rawFirebaseConfig.projectId],
  ['VITE_FIREBASE_STORAGE_BUCKET', rawFirebaseConfig.storageBucket],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', rawFirebaseConfig.messagingSenderId],
  ['VITE_FIREBASE_APP_ID', rawFirebaseConfig.appId],
];

const missingKeys = requiredConfigEntries
  .filter(([, value]) => !value)
  .map(([envKey]) => envKey);

// Exported for UI to render a helpful error instead of crashing to a blank page.
// Previously this file threw synchronously, leaving only the index.html splash "C".
export const firebaseConfigError = missingKeys.length > 0
  ? `Missing Firebase config: ${missingKeys.join(', ')}. ` +
    'Set these in the student app environment (locally in .env.local, or in ' +
    'Vercel → Settings → Environment Variables). They must point to the same ' +
    'Firebase project as the Cloud Functions (asia-south1). See apps/student/README.md.'
  : null;

if (firebaseConfigError) {
  // Do not throw — allow the app to mount and show a meaningful error screen.
  // Logging here is critical for Vercel production debugging.
  console.error('[Firebase config error]', firebaseConfigError);
}

// Use safe fallback values so initializeApp does not itself throw when env vars are missing.
// The app will still render an error UI via firebaseConfigError check in App.tsx and ErrorBoundary.
const firebaseConfig = {
  apiKey: rawFirebaseConfig.apiKey || 'missing-api-key-please-set-env',
  authDomain: rawFirebaseConfig.authDomain || 'missing.firebaseapp.com',
  projectId: rawFirebaseConfig.projectId || 'missing-project-id',
  storageBucket: rawFirebaseConfig.storageBucket || 'missing.appspot.com',
  messagingSenderId: rawFirebaseConfig.messagingSenderId || '000000000000',
  appId: rawFirebaseConfig.appId || '1:000000000000:web:missingappid',
  measurementId: rawFirebaseConfig.measurementId,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');
export const storage = getStorage(app);

// Optional Analytics — only when measurementId is present and window exists
// User provided G-V0ZKW6LDGB, so we init lazily to not block startup or CSP.
if (typeof window !== 'undefined' && firebaseConfig.measurementId && !firebaseConfigError) {
  // Dynamic import to keep main bundle lean and avoid analytics in emulator
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => {
      isSupported()
        .then((ok) => {
          if (ok) {
            try {
              getAnalytics(app);
              console.log('[Analytics] initialized');
            } catch (e) {
              console.warn('[Analytics] failed to init:', e);
            }
          }
        })
        .catch(() => {});
    })
    .catch(() => {});
}

// Ensure persistent session across reloads and tab restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Failed to set auth persistence:', err);
});

// Set VITE_USE_FIREBASE_EMULATORS=true in apps/student/.env.local for local development.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

