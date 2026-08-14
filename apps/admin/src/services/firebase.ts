import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBjVXxjynFHoNdIBh03sMz9tUBQ7CXseKQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'campus-connectt.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'campus-connectt',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'campus-connectt.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '594661303702',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:594661303702:web:7e0d90b44d17e0d7dbe9b7',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');

export const getVerificationQueueFn = httpsCallable(functions, 'getVerificationQueue');
export const reviewVerificationFn = httpsCallable(functions, 'reviewVerificationPhoto');
export const createCollegeFn = httpsCallable(functions, 'createCollege');
export const approveCollegeFn = httpsCallable(functions, 'approveCollege');
export const reviewReportFn = httpsCallable(functions, 'reviewReport');

export default app;
