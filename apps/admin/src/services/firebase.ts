import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBjVXxjynFHoNdIBh03sMz9tUBQ7CXseKQ",
  authDomain: "campus-connectt.firebaseapp.com",
  projectId: "campus-connectt",
  storageBucket: "campus-connectt.firebasestorage.app",
  messagingSenderId: "594661303702",
  appId: "1:594661303702:web:7e0d90b44d17e0d7dbe9b7",
  measurementId: "G-V0ZKW6LDGB",
};

// Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);

export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south1");

/*
// Enable emulators during local development
if (import.meta.env.DEV) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
  } catch {
    // Ignore HMR reload errors
  }
}
*/

// Callable functions
export const reviewVerificationFn = httpsCallable(
  functions,
  "reviewVerificationPhoto"
);

export const createCollegeFn = httpsCallable(
  functions,
  "createCollege"
);

export const approveCollegeFn = httpsCallable(
  functions,
  "approveCollege"
);

export default app;