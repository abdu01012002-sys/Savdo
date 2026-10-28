import 'firebase/app';
import 'firebase/firestore';
import 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore,
  initializeFirestore, 
  setLogLevel,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import config from '../../firebase-applet-config.json';

// Suppress internal SDK logs to prevent stream backoff and retry error spam
try {
  setLogLevel('silent');
} catch (e) {}

// Filter out benign Firestore transport/stream reconnect notices
const isBenignFirestoreLog = (...args: any[]) => {
  const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  return (
    message.includes('ECONNRESET') ||
    message.includes('GrpcConnection RPC') ||
    message.includes('14 UNAVAILABLE') ||
    message.includes('1 CANCELLED') ||
    message.includes('Call cancelled') ||
    message.includes('transport errored') ||
    message.includes('WebChannel') ||
    message.includes('Listen') ||
    message.includes('Using maximum backoff delay')
  );
};

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  if (isBenignFirestoreLog(...args)) return;
  originalConsoleError.apply(console, args);
};

console.warn = (...args: any[]) => {
  if (isBenignFirestoreLog(...args)) return;
  originalConsoleWarn.apply(console, args);
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || config.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || config.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || config.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || config.measurementId
};

// Safe app initialization (prevents duplicate app creation or HMR conflicts)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const databaseId = config.firestoreDatabaseId || (import.meta.env.VITE_FIRESTORE_DATABASE_ID as string) || undefined;

// Fast real-time bidirectional WebChannel/WebSockets streams with auto-detection fallback
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
}, databaseId);

export const firestoreDb = db;

// Oflayn rejim va IndexedDB keshlashni yoqish
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err: any) => {
    if (err.code === 'failed-precondition') {
      // Ko'p tablar ochilganda bir vaqtning o'zida ishlashi uchun
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support persistence');
    }
  });
}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Auto sign-in anonymously if unauthenticated so multi-device sync has active auth context
if (typeof window !== 'undefined') {
  auth.onAuthStateChanged(user => {
    if (!user) {
      signInAnonymously(auth).catch(() => {
        // Safe catch if anonymous auth is not explicitly enabled in console
      });
    }
  });
}
