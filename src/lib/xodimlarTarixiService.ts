import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, increment, arrayUnion, query, orderBy } from 'firebase/firestore';
import { firestoreDb, auth } from './fbClient';
import { User as FirebaseUser } from 'firebase/auth';
import { User, XodimTarixi } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

const COLLECTION_NAME = 'XodimlarTarixi';

/**
 * Saves or updates Google user login history in the 'XodimlarTarixi' collection.
 */
export async function recordGoogleLogin(fbUser: FirebaseUser, selectedUser?: User | null): Promise<void> {
  if (!fbUser || !fbUser.uid) return;

  // If quota is exhausted, skip writing to Firestore to preserve resources
  if (typeof localStorage !== 'undefined' && localStorage.getItem('ombor_firestore_quota_exhausted') === 'true') {
    return;
  }

  const userDocRef = doc(firestoreDb, COLLECTION_NAME, fbUser.uid);
  const nowStr = new Date().toISOString();

  try {
    const historyEntry = {
      date: nowStr,
      selectedUser: selectedUser?.ism || 'Noma\'lum',
      selectedRole: selectedUser?.rol || 'Noma\'lum',
    };

    // Use setDoc with merge: true which safely queues in offline cache and syncs seamlessly
    await setDoc(userDocRef, {
      id: fbUser.uid,
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Xodim',
      photoURL: fbUser.photoURL || '',
      lastLogin: nowStr,
      loginCount: increment(1),
      ...(selectedUser ? {
        selectedUserName: selectedUser.ism,
        selectedUserRole: selectedUser.rol,
      } : {}),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      history: arrayUnion(historyEntry),
    }, { merge: true });
  } catch (error: any) {
    const msg = (error?.message || String(error)).toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    if (
      code === 'resource-exhausted' ||
      msg.includes('resource-exhausted') ||
      msg.includes('quota') ||
      msg.includes('exhausted maximum allowed queued writes') ||
      msg.includes('maximum backoff delay') ||
      msg.includes('overloading the backend')
    ) {
      if (typeof localStorage !== 'undefined') {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('ombor_firestore_quota_exhausted', 'true');
        localStorage.setItem('ombor_firestore_quota_date', today);
      }
      console.warn("Xodim kirish tarixi: Firestore kvotasi cheklangan.");
      return;
    }
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn("Xodim kirish tarixi oflayn rejimda saqlandi va tarmoq tiklanganda yuboriladi.");
    } else {
      handleFirestoreError(error, OperationType.WRITE, `${COLLECTION_NAME}/${fbUser.uid}`);
    }
  }
}

/**
 * Subscribes to the real-time list of all users from 'XodimlarTarixi' collection.
 */
export function subscribeToXodimlarTarixi(
  onData: (list: XodimTarixi[]) => void,
  onError?: (err: any) => void
) {
  const colRef = collection(firestoreDb, COLLECTION_NAME);

  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: XodimTarixi[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          uid: data.uid || d.id,
          email: data.email || '',
          displayName: data.displayName || 'Xodim',
          photoURL: data.photoURL || '',
          lastLogin: data.lastLogin || '',
          firstLogin: data.firstLogin || '',
          loginCount: Number(data.loginCount) || 1,
          selectedUserName: data.selectedUserName || '',
          selectedUserRole: data.selectedUserRole || '',
          userAgent: data.userAgent || '',
          history: Array.isArray(data.history) ? data.history : [],
        });
      });

      // Sort by lastLogin descending
      items.sort((a, b) => new Date(b.lastLogin || 0).getTime() - new Date(a.lastLogin || 0).getTime());
      onData(items);
    },
    (error) => {
      const msg = (error?.message || String(error)).toLowerCase();
      const code = String(error?.code || '').toLowerCase();
      if (code === 'resource-exhausted' || msg.includes('quota') || msg.includes('resource-exhausted')) {
        console.warn("Xodimlar tarixi Firestore kvota limiti.");
        return;
      }
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      if (onError) onError(error);
    }
  );
}
