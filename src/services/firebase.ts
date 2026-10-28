// src/services/firebase.ts
// Gibrid Xotira (Hybrid Persistence) & Firebase Real-time Sync (onSnapshot)
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc,
  QueryConstraint,
  Unsubscribe 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { sanitizeForFirestore } from '../lib/firestoreCollectionSync';

/**
 * 1. Mahalliy Keshdan Ma'lumotlarni Bir Zumda (0 ms) O'qish (Instant UI)
 */
export const getCollectionFromCache = <T = any>(collectionName: string): T[] => {
  try {
    const cached = localStorage.getItem(`cache_${collectionName}`);
    if (cached) {
      return JSON.parse(cached) as T[];
    }
  } catch (err) {
    console.warn(`[CACHE] Failed to read cache_${collectionName}:`, err);
  }
  return [];
};

/**
 * 2. Real-time Kolleksiya Tinglovchisi (onSnapshot)
 * Serverdagi har qanday o'zgarishni <100ms ichida barcha ulangan qurilmalarga yetkazadi.
 * Xotira sizib chiqishini (Memory Leak) oldini olish uchun unsubscribe funksiyasini qaytaradi.
 */
export const subscribeToCollection = (
  collectionName: string, 
  callback: (data: any[]) => void
): Unsubscribe => {
  // 1. Agar mahalliy keshda ma'lumot bo'lsa, uni darhol UI ga beramiz (0 ms)
  const cachedItems = getCollectionFromCache(collectionName);
  if (cachedItems.length > 0) {
    callback(cachedItems);
  }

  const q = query(collection(db, collectionName));

  // onSnapshot har safar serverda ma'lumot o'zgarsa callback'ni chaqiradi
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items: any[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });
    
    // 2. Mahalliy React state va localStorage'ni yangilaymiz
    callback(items);
    try {
      localStorage.setItem(`cache_${collectionName}`, JSON.stringify(items));
    } catch (e) {
      // LocalStorage to'lgan holatda xavfsiz o'tish
    }
  }, (error) => {
    console.error(`Error subscribing to ${collectionName}:`, error);
  });

  // Xotira sizib chiqishini (Memory Leak) oldini olish uchun unsubscribe qaytariladi
  return unsubscribe;
};

/**
 * 3. Qo'shimcha Filtr / Saralash (Query) bilan Tinglovchi
 */
export const subscribeToCollectionWithQuery = (
  collectionName: string,
  constraints: QueryConstraint[],
  callback: (data: any[]) => void
): Unsubscribe => {
  const cachedItems = getCollectionFromCache(collectionName);
  if (cachedItems.length > 0) {
    callback(cachedItems);
  }

  const q = query(collection(db, collectionName), ...constraints);

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items: any[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });

    callback(items);
    try {
      localStorage.setItem(`cache_${collectionName}`, JSON.stringify(items));
    } catch (e) {}
  }, (error) => {
    console.error(`Error subscribing with query to ${collectionName}:`, error);
  });

  return unsubscribe;
};

/**
 * 4. Yagona Hujjatni (Document) Real-time Tinglash
 */
export const subscribeToDocument = (
  collectionName: string,
  docId: string,
  callback: (data: any | null) => void
): Unsubscribe => {
  try {
    const cachedDoc = localStorage.getItem(`cache_${collectionName}_${docId}`);
    if (cachedDoc) {
      callback(JSON.parse(cachedDoc));
    }
  } catch {}

  const docRef = doc(db, collectionName, docId);
  const unsubscribe = onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() };
      callback(data);
      try {
        localStorage.setItem(`cache_${collectionName}_${docId}`, JSON.stringify(data));
      } catch {}
    } else {
      callback(null);
    }
  }, (err) => {
    console.error(`Error subscribing to document ${collectionName}/${docId}:`, err);
  });

  return unsubscribe;
};

/**
 * 5. Optimistik Saqlash (Optimistic Update)
 * Avval mahalliy keshga va React holatiga yoziladi (0ms), keyin orqa fonda Firestore'ga yuboriladi.
 */
export const saveWithOptimisticUpdate = async (
  collectionName: string,
  docId: string,
  data: any
): Promise<void> => {
  const cleanData = sanitizeForFirestore(data);

  // Mahalliy keshni darhol yangilash
  try {
    localStorage.setItem(`cache_${collectionName}_${docId}`, JSON.stringify(cleanData));
  } catch {}

  // Orqa fonda Firestore'ga yozish
  const docRef = doc(db, collectionName, docId);
  await setDoc(docRef, cleanData, { merge: true });
};

/**
 * 6. Oflayn Rejim va IndexedDB Keshlashni Qo'lda Faollashtirish (Offline Persistence)
 */
export const enableOfflinePersistence = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  try {
    const { enableIndexedDbPersistence } = await import('firebase/firestore');
    await enableIndexedDbPersistence(db);
    console.log('[FIREBASE] Offline persistence muvaffaqiyatli yoqildi');
  } catch (err: any) {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support persistence');
    }
  }
};

