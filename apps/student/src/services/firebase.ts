import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBjVXxjynFHoNdIBh03sMz9tUBQ7CXseKQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'campus-connectt.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'campus-connectt',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'campus-connectt.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '594661303702',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:594661303702:web:7e0d90b44d17e0d7dbe9b7',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');
export const storage = getStorage(app);

// Set VITE_USE_FIREBASE_EMULATORS=true in apps/student/.env.local for local development.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
