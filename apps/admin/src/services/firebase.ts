import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

/**
 * Firebase client configuration for the admin panel.
 *
 * As with the student app, no project values are hardcoded: a build with missing
 * variables must fail visibly rather than silently connect to the wrong project.
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

export const missingConfigKeys: ConfigKey[] = REQUIRED_KEYS.filter((key) => !readEnv(key));
export const isFirebaseConfigured = missingConfigKeys.length === 0;

/** Every callable is deployed to this region. */
export const FUNCTIONS_REGION = 'asia-south1';

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST?.trim() || '127.0.0.1';

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;

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

  if (useEmulators) {
    connectAuthEmulator(authInstance, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, emulatorHost, 8080);
    connectFunctionsEmulator(functionsInstance, emulatorHost, 5001);
  }
}

function placeholder(name: string): never {
  throw new Error(
    `Firebase ${name} is unavailable: the admin panel is not configured. ` +
    `Missing environment variables: ${missingConfigKeys.join(', ')}`
  );
}

export const auth: Auth = authInstance ?? (new Proxy({}, { get: () => placeholder('Auth') }) as Auth);
export const db: Firestore = dbInstance ?? (new Proxy({}, { get: () => placeholder('Firestore') }) as Firestore);
export const functions: Functions = functionsInstance
  ?? (new Proxy({}, { get: () => placeholder('Functions') }) as Functions);

/**
 * Callable references.
 *
 * Created lazily through a getter so an unconfigured build does not throw at
 * module-evaluation time (which would break the configuration error screen).
 */
const CALLABLE_TIMEOUT_MS = 60_000;

function callable<TRequest extends object, TResponse>(name: string) {
  return (data?: TRequest) =>
    httpsCallable<TRequest, TResponse>(functions, name, { timeout: CALLABLE_TIMEOUT_MS })(
      data ?? ({} as TRequest),
    );
}

export const getVerificationQueueFn = callable<object, unknown>('getVerificationQueue');
export const reviewVerificationFn = callable<object, unknown>('reviewVerificationPhoto');
export const createCollegeFn = callable<object, unknown>('createCollege');
export const approveCollegeFn = callable<object, unknown>('approveCollege');
export const reviewReportFn = callable<object, unknown>('reviewReport');
export const suspendUserFn = callable<object, unknown>('suspendUser');
export const reinstateUserFn = callable<object, unknown>('reinstateUser');
export const getPlatformAnalyticsFn = callable<object, unknown>('getPlatformAnalytics');
export const sendPushNotificationFn = callable<object, unknown>('sendPushNotification');
export const sendEmailFn = callable<object, unknown>('sendEmail');

export default app;
