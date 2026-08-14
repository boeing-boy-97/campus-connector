import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
const app = initializeApp({ apiKey: 'AIzaSyBjVXxjynFHoNdIBh03sMz9tUBQ7CXseKQ', authDomain: 'campus-connectt.firebaseapp.com', projectId: 'campus-connectt', storageBucket: 'campus-connectt.firebasestorage.app', messagingSenderId: '594661303702', appId: '1:594661303702:web:7e0d90b44d17e0d7dbe9b7' });
export const auth = getAuth(app); export const db = getFirestore(app); export const functions = getFunctions(app, 'asia-south1'); export const storage = getStorage(app);

console.log(
  'VITE_USE_FIREBASE_EMULATORS =',
  import.meta.env.VITE_USE_FIREBASE_EMULATORS
);

// Set VITE_USE_FIREBASE_EMULATORS=true in apps/student/.env.local for local development.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
