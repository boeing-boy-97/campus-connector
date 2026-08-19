import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
};

// Compute a helpful error message when required VITE_FIREBASE_* vars are missing.
const missingKeys = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
export const firebaseConfigError: string | null = missingKeys.length
  ? `Missing VITE_FIREBASE_* environment variables: ${missingKeys.join(', ')}.`
  : null;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');
export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Failed to set auth persistence:', err);
});

const isEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const customApiUrl = import.meta.env.VITE_API_URL;

if (isEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
} else if (customApiUrl) {
  functions.customDomain = customApiUrl.replace(/\/$/, '');
}
