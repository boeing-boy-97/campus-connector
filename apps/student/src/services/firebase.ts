import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Firebase client configuration.
 *
 * These values are public by design (they identify the project; access is
 * governed by Security Rules), but they must still come from the build
 * environment. Hardcoding a fallback project is dangerous: a deployment with
 * missing variables would silently read and write the *wrong* project instead
 * of failing, so we validate up front and surface a configuration error.
 */
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export type ConfigKey = (typeof REQUIRED_KEYS)[number];

function readEnv(key: ConfigKey): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Environment variables that are required but missing or blank. */
export const missingConfigKeys: ConfigKey[] = REQUIRED_KEYS.filter((key) => !readEnv(key));

export const isFirebaseConfigured = missingConfigKeys.length === 0;

/** Cloud Functions region — every callable is deployed to asia-south1. */
export const FUNCTIONS_REGION = 'asia-south1';

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST?.trim() || '127.0.0.1';

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let storageInstance: FirebaseStorage | undefined;

if (isFirebaseConfigured) {
  app = initializeApp({
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
  });

  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  functionsInstance = getFunctions(app, FUNCTIONS_REGION);
  storageInstance = getStorage(app);

  // Local development against the Firebase emulator suite.
  // Set VITE_USE_FIREBASE_EMULATORS=true in apps/student/.env.local
  if (useEmulators) {
    connectAuthEmulator(authInstance, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, emulatorHost, 8080);
    connectFunctionsEmulator(functionsInstance, emulatorHost, 5001);
    connectStorageEmulator(storageInstance, emulatorHost, 9199);
  }
}

/**
 * When configuration is missing we deliberately do NOT initialise Firebase, and
 * these exports are unusable placeholders. `main.tsx` checks
 * `isFirebaseConfigured` before mounting the app, so nothing ever dereferences
 * them in that state — this keeps the real SDK objects (not proxies) on the
 * happy path, so Firebase's internal instance checks continue to work.
 */
function placeholder(name: string): never {
  throw new Error(
    `Firebase ${name} is unavailable: the app is not configured. ` +
    `Missing environment variables: ${missingConfigKeys.join(', ')}`
  );
}

export const auth: Auth = authInstance ?? (new Proxy({}, {
  get: () => placeholder('Auth'),
}) as Auth);

export const db: Firestore = dbInstance ?? (new Proxy({}, {
  get: () => placeholder('Firestore'),
}) as Firestore);

export const functions: Functions = functionsInstance ?? (new Proxy({}, {
  get: () => placeholder('Functions'),
}) as Functions);

export const storage: FirebaseStorage = storageInstance ?? (new Proxy({}, {
  get: () => placeholder('Storage'),
}) as FirebaseStorage);

export const usingEmulators = useEmulators;
export const firebaseApp = app;
