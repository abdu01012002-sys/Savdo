import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  Unsubscribe,
  limit,
  enableNetwork
} from 'firebase/firestore';
import { firestoreDb } from './fbClient';
import { DbState, Transaction, Kontragent, Otkazma, KassaHarakati, AuditLog } from '../types';
import { INITIAL_DB } from '../data';
import {
  normalizeToArray,
  extractTransactionsFromRaw,
  normalizeKontragent,
  normalizeOtkazma,
  normalizeKassaHarakati,
  mergeTransactionsDeduplicated,
  mergeKontragentlarDeduplicated,
  mergeOtkazmalarDeduplicated,
  mergeKassaDeduplicated
} from './firestoreSyncService';

export const USE_COLLECTIONS_FLAG_KEY = 'use_collections_architecture';

export const isCollectionsArchitectureEnabled = (): boolean => {
  return localStorage.getItem(USE_COLLECTIONS_FLAG_KEY) === 'true';
};

export const setCollectionsArchitectureEnabled = (enabled: boolean) => {
  localStorage.setItem(USE_COLLECTIONS_FLAG_KEY, enabled ? 'true' : 'false');
};

export const getSixtyDaysAgoStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().split('T')[0];
};

/**
 * Extracts stock, prices, kassa balances, settings, along with recent transactions
 * (up to 120 per warehouse) and active records (kontragentlar, kassa, otkazmalar).
 * Storing recent active records directly in app_db/main guarantees instantaneous,
 * atomic multi-device synchronization via onSnapshot without exceeding Firestore's 1MB limit.
 */
export function extractCleanSettingsAndStock(db: DbState): Record<string, any> {
  const tepaTxs = (db.tepa?.transactions || []).slice(0, 120);
  const kottaTxs = (db.kotta?.transactions || []).slice(0, 120);
  const sort2Txs = (db.sort2?.transactions || []).slice(0, 120);
  const otkazmalar = (db.otkazmalar || []).slice(0, 80);
  const kassaHarakatlari = (db.kassaHarakatlari || []).slice(0, 80);

  return {
    tepa: {
      stock: db.tepa?.stock || {},
      transactions: tepaTxs
    },
    kotta: {
      stock: db.kotta?.stock || {},
      transactions: kottaTxs
    },
    sort2: {
      stock: db.sort2?.stock || {},
      transactions: sort2Txs
    },
    kontragentlar: db.kontragentlar || [],
    otkazmalar,
    kassaHarakatlari,
    prices: db.prices || {},
    kassaBalansi: db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 },
    users: db.users || [],
    templates: db.templates || [],
    valyutaKursi: db.valyutaKursi || 12850,
    valyutaKursConfig: db.valyutaKursConfig || {},
    telegramConfig: db.telegramConfig || {},
    muzlatilgan: db.muzlatilgan || [],
    archivedModels: db.archivedModels || [],
    smenalar: db.smenalar || [],
    joriySmena: db.joriySmena || null,
    pendingKirim: db.pendingKirim || [],
    vozvratlar: db.vozvratlar || [],
    braklar: db.braklar || [],
    updatedAt: new Date().toISOString()
  };
}

/**
/**
 * Strips any 'undefined' values from an object or nested objects before saving to Firestore.
 * Firestore strictly rejects any document containing `undefined` with:
 * "Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => (typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item)) as unknown as T;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = sanitizeForFirestore(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Save lightweight stock and settings document to app_db/main (strictly 30-50 KB).
 */
export async function saveStockAndSettingsToAppDbMain(db: DbState): Promise<void> {
  const payload = sanitizeForFirestore(extractCleanSettingsAndStock(db));
  await setDoc(doc(firestoreDb, 'app_db', 'main'), payload, { merge: true });
}

/**
 * Save a single transaction directly to its Firestore collection as an individual document.
 */
export async function saveTransactionToCollection(tx: Transaction): Promise<void> {
  if (!tx || !tx.id) return;
  const cleanTx = sanitizeForFirestore(tx);
  
  // 1. Always write to the primary collection so all devices receive real-time updates
  const primaryCol = cleanTx.ombor === 'kotta' ? 'kottaTransactions' : 'transactions';
  await setDoc(doc(firestoreDb, primaryCol, String(cleanTx.id)), cleanTx, { merge: true });

  // 2. Also mirror to monthly sharded collection if enabled
  if (isCollectionsArchitectureEnabled()) {
    const [year, month] = (cleanTx.sana || '2026-01').split('-');
    const shardColName = `transactions_${year}_${month}`;
    setDoc(doc(firestoreDb, shardColName, String(cleanTx.id)), cleanTx, { merge: true }).catch(() => {});
  }
}

export async function saveOtkazmaToCollection(otkazma: Otkazma): Promise<void> {
  if (!otkazma || !otkazma.id) return;
  const cleanOtkazma = sanitizeForFirestore(otkazma);
  await setDoc(doc(firestoreDb, 'otkazmalar', String(cleanOtkazma.id)), cleanOtkazma, { merge: true });
}

export async function saveKassaHarakatToCollection(item: KassaHarakati): Promise<void> {
  if (!item || !item.id) return;
  const cleanItem = sanitizeForFirestore(item);
  await setDoc(doc(firestoreDb, 'kassaHarakatlari', String(cleanItem.id)), cleanItem, { merge: true });
}

export async function saveKontragentToCollection(kontragent: Kontragent): Promise<void> {
  if (!kontragent || !kontragent.id) return;
  const cleanKontragent = sanitizeForFirestore(kontragent);
  await setDoc(doc(firestoreDb, 'kontragentlar', String(cleanKontragent.id)), cleanKontragent, { merge: true });
}

export async function saveAuditLogToCollection(log: AuditLog): Promise<void> {
  if (!log || !log.id) return;
  const cleanLog = sanitizeForFirestore(log);
  await setDoc(doc(firestoreDb, 'auditLogs', String(cleanLog.id)), cleanLog, { merge: true });
}

/**
 * Synchronize newly added or modified entities to Firestore without blocking the UI.
 * - Transactions -> /transactions or /kottaTransactions
 * - Otkazmalar -> /otkazmalar
 * - Kassa harakatlari -> /kassaHarakatlari
 * - Kontragentlar -> /kontragentlar
 * - Stock / Prices / KassaBalansi / Settings -> /app_db/main (30-50 KB)
 */
export async function syncChangedEntitiesToFirestore(prevDb: DbState | null, nextDb: DbState): Promise<void> {
  // 1. Stock / settings check
  const stockOrSettingsChanged = !prevDb || (
    prevDb.tepa?.stock !== nextDb.tepa?.stock ||
    prevDb.kotta?.stock !== nextDb.kotta?.stock ||
    prevDb.sort2?.stock !== nextDb.sort2?.stock ||
    prevDb.prices !== nextDb.prices ||
    prevDb.kassaBalansi !== nextDb.kassaBalansi ||
    prevDb.users !== nextDb.users ||
    prevDb.templates !== nextDb.templates ||
    prevDb.valyutaKursi !== nextDb.valyutaKursi ||
    prevDb.valyutaKursConfig !== nextDb.valyutaKursConfig ||
    prevDb.telegramConfig !== nextDb.telegramConfig ||
    prevDb.muzlatilgan !== nextDb.muzlatilgan ||
    prevDb.archivedModels !== nextDb.archivedModels ||
    prevDb.smenalar !== nextDb.smenalar ||
    prevDb.joriySmena !== nextDb.joriySmena ||
    prevDb.pendingKirim !== nextDb.pendingKirim ||
    prevDb.vozvratlar !== nextDb.vozvratlar ||
    prevDb.braklar !== nextDb.braklar
  );

  if (stockOrSettingsChanged) {
    saveStockAndSettingsToAppDbMain(nextDb).catch(err => {
      console.warn('[FIRESTORE SYNC] app_db/main save warning:', err);
    });
  }

  // 2. Tepa transactions
  if (nextDb.tepa?.transactions) {
    const prevMap = new Map((prevDb?.tepa?.transactions || []).map(t => [t.id, t]));
    const candidateTxs = prevDb ? nextDb.tepa.transactions : nextDb.tepa.transactions.slice(0, 30);
    for (const tx of candidateTxs) {
      if (!tx || !tx.id || String(tx.id).startsWith('init-')) continue;
      const prevTx = prevMap.get(tx.id);
      if (!prevTx || prevTx !== tx) {
        saveTransactionToCollection({ ...tx, ombor: 'tepa' }).catch(console.warn);
      }
    }
  }

  // 3. Kotta transactions
  if (nextDb.kotta?.transactions) {
    const prevMap = new Map((prevDb?.kotta?.transactions || []).map(t => [t.id, t]));
    const candidateTxs = prevDb ? nextDb.kotta.transactions : nextDb.kotta.transactions.slice(0, 30);
    for (const tx of candidateTxs) {
      if (!tx || !tx.id || String(tx.id).startsWith('init-')) continue;
      const prevTx = prevMap.get(tx.id);
      if (!prevTx || prevTx !== tx) {
        saveTransactionToCollection({ ...tx, ombor: 'kotta' }).catch(console.warn);
      }
    }
  }

  // 4. Sort2 transactions
  if (nextDb.sort2?.transactions) {
    const prevMap = new Map((prevDb?.sort2?.transactions || []).map(t => [t.id, t]));
    const candidateTxs = prevDb ? nextDb.sort2.transactions : nextDb.sort2.transactions.slice(0, 30);
    for (const tx of candidateTxs) {
      if (!tx || !tx.id || String(tx.id).startsWith('init-')) continue;
      const prevTx = prevMap.get(tx.id);
      if (!prevTx || prevTx !== tx) {
        saveTransactionToCollection({ ...tx, ombor: 'sort2' }).catch(console.warn);
      }
    }
  }

  // 5. Otkazmalar
  if (nextDb.otkazmalar) {
    const prevMap = new Map((prevDb?.otkazmalar || []).map(o => [o.id, o]));
    const candidateOtk = prevDb ? nextDb.otkazmalar : nextDb.otkazmalar.slice(0, 30);
    for (const otk of candidateOtk) {
      if (!otk || !otk.id || String(otk.id).startsWith('otk-init-')) continue;
      const prevOtk = prevMap.get(otk.id);
      if (!prevOtk || prevOtk !== otk) {
        saveOtkazmaToCollection(otk).catch(console.warn);
      }
    }
  }

  // 6. Kassa harakatlari
  if (nextDb.kassaHarakatlari) {
    const prevMap = new Map((prevDb?.kassaHarakatlari || []).map(k => [k.id, k]));
    const candidateKh = prevDb ? nextDb.kassaHarakatlari : nextDb.kassaHarakatlari.slice(0, 30);
    for (const kh of candidateKh) {
      if (!kh || !kh.id || String(kh.id).startsWith('k-init-')) continue;
      const prevKh = prevMap.get(kh.id);
      if (!prevKh || prevKh !== kh) {
        saveKassaHarakatToCollection(kh).catch(console.warn);
      }
    }
  }

  // 7. Kontragentlar
  if (nextDb.kontragentlar) {
    const prevMap = new Map((prevDb?.kontragentlar || []).map(k => [k.id, k]));
    for (const k of nextDb.kontragentlar) {
      if (!k || !k.id) continue;
      const prevK = prevMap.get(k.id);
      if (!prevK || prevK.balans !== k.balans || prevK !== k) {
        saveKontragentToCollection(k).catch(console.warn);
      }
    }
  }

  // 8. Audit logs
  if (nextDb.auditLogs) {
    const prevMap = new Map((prevDb?.auditLogs || []).map(a => [a.id, a]));
    const candidateLogs = prevDb ? nextDb.auditLogs : nextDb.auditLogs.slice(0, 20);
    for (const log of candidateLogs) {
      if (!log || !log.id) continue;
      if (!prevMap.has(log.id)) {
        saveAuditLogToCollection(log).catch(console.warn);
      }
    }
  }
}

/**
 * Load database state from Firestore:
 * - app_db/main (stock, prices, settings)
 * - transactions (last 60 days)
 * - kottaTransactions (last 60 days)
 * - otkazmalar (last 60 days)
 * - kassaHarakatlari (last 60 days)
 * - kontragentlar
 * - auditLogs
 */
export async function loadDbFromCollections(loadFullHistory = false): Promise<DbState | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn('[FIRESTORE] Device is currently offline, skipping remote collections fetch');
    return null;
  }

  const sixtyDaysAgo = getSixtyDaysAgoStr();
  const dbState: DbState = JSON.parse(JSON.stringify(INITIAL_DB));

  try {
    try {
      await enableNetwork(firestoreDb);
    } catch {
      // Ignore if network is already enabled or transitioning
    }
    // 1. Load app_db/main (falling back to settings/main if needed)
    let mainSnap = await getDoc(doc(firestoreDb, 'app_db', 'main'));
    if (!mainSnap.exists()) {
      mainSnap = await getDoc(doc(firestoreDb, 'settings', 'main'));
    }
    let mainTepaTxs: Transaction[] = [];
    let mainKottaTxs: Transaction[] = [];
    let mainSort2Txs: Transaction[] = [];
    let mainOtkazmalar: any[] = [];
    let mainKassa: any[] = [];
    let mainKontragentlar: Kontragent[] = [];

    if (mainSnap.exists()) {
      const data = mainSnap.data() as any;
      if (data.tepa?.transactions) {
        mainTepaTxs = normalizeToArray(data.tepa.transactions).flatMap(extractTransactionsFromRaw);
      }
      if (data.kotta?.transactions) {
        mainKottaTxs = normalizeToArray(data.kotta.transactions).flatMap(extractTransactionsFromRaw);
      }
      if (data.sort2?.transactions) {
        mainSort2Txs = normalizeToArray(data.sort2.transactions).flatMap(extractTransactionsFromRaw);
      }
      if (data.kontragentlar) {
        mainKontragentlar = normalizeToArray(data.kontragentlar).map(normalizeKontragent).filter(Boolean);
      }
      if (data.otkazmalar) {
        mainOtkazmalar = normalizeToArray(data.otkazmalar).map(normalizeOtkazma).filter(Boolean);
      }
      if (data.kassaHarakatlari) {
        mainKassa = normalizeToArray(data.kassaHarakatlari).map(normalizeKassaHarakati).filter(Boolean);
      }

      if (data.tepa) dbState.tepa = { ...dbState.tepa, ...data.tepa, transactions: mainTepaTxs };
      if (data.kotta) dbState.kotta = { ...dbState.kotta, ...data.kotta, transactions: mainKottaTxs };
      if (data.sort2) dbState.sort2 = { ...dbState.sort2, ...data.sort2, transactions: mainSort2Txs };
      if (data.kontragentlar) dbState.kontragentlar = mainKontragentlar;
      if (data.otkazmalar) dbState.otkazmalar = mainOtkazmalar;
      if (data.kassaHarakatlari) dbState.kassaHarakatlari = mainKassa;
      if (data.prices) dbState.prices = data.prices;
      if (data.users) dbState.users = data.users;
      if (data.templates) dbState.templates = data.templates;
      if (data.valyutaKursi) dbState.valyutaKursi = data.valyutaKursi;
      if (data.kassaBalansi) dbState.kassaBalansi = data.kassaBalansi;
      if (data.telegramConfig) dbState.telegramConfig = data.telegramConfig;
      if (data.valyutaKursConfig) dbState.valyutaKursConfig = data.valyutaKursConfig;
      if (data.pendingKirim) dbState.pendingKirim = data.pendingKirim;
      if (data.muzlatilgan) dbState.muzlatilgan = data.muzlatilgan;
      if (data.archivedModels) dbState.archivedModels = data.archivedModels;
      if (data.smenalar) dbState.smenalar = data.smenalar;
      if (data.joriySmena) dbState.joriySmena = data.joriySmena;
      if (data.vozvratlar) dbState.vozvratlar = data.vozvratlar;
      if (data.braklar) dbState.braklar = data.braklar;
    }

    // 2. Load transactions from collection
    try {
      const txQuery = loadFullHistory
        ? query(collection(firestoreDb, 'transactions'))
        : query(collection(firestoreDb, 'transactions'), limit(300));
      
      const txSnap = await getDocs(txQuery);
      const colTepaTxs: Transaction[] = [];
      const colKottaTxs: Transaction[] = [];
      const colSort2Txs: Transaction[] = [];
      
      txSnap.forEach(docSnap => {
        const tx = docSnap.data() as Transaction;
        if (tx.ombor === 'kotta') {
          colKottaTxs.push(tx);
        } else if (tx.ombor === 'sort2') {
          colSort2Txs.push(tx);
        } else {
          colTepaTxs.push(tx);
        }
      });
      dbState.tepa.transactions = mergeTransactionsDeduplicated(mainTepaTxs, colTepaTxs);
      if (colSort2Txs.length > 0 || mainSort2Txs.length > 0) {
        dbState.sort2.transactions = mergeTransactionsDeduplicated(mainSort2Txs, colSort2Txs);
      }
      if (colKottaTxs.length > 0) {
        mainKottaTxs = mergeTransactionsDeduplicated(mainKottaTxs, colKottaTxs);
      }
    } catch (e) {
      console.warn('[FIRESTORE] transactions collection load notice:', e);
    }

    // 3. Load kottaTransactions collection
    try {
      const kottaQuery = loadFullHistory
        ? query(collection(firestoreDb, 'kottaTransactions'))
        : query(collection(firestoreDb, 'kottaTransactions'), limit(300));
      const kottaSnap = await getDocs(kottaQuery);
      const colKottaTxs: Transaction[] = [];
      kottaSnap.forEach(docSnap => {
        colKottaTxs.push(docSnap.data() as Transaction);
      });
      dbState.kotta.transactions = mergeTransactionsDeduplicated(mainKottaTxs, colKottaTxs);
    } catch (e) {
      console.warn('[FIRESTORE] kottaTransactions collection load notice:', e);
      dbState.kotta.transactions = mainKottaTxs;
    }

    // 4. Load otkazmalar
    try {
      const otkazmaQuery = loadFullHistory
        ? query(collection(firestoreDb, 'otkazmalar'))
        : query(collection(firestoreDb, 'otkazmalar'), limit(200));
      const otkazmaSnap = await getDocs(otkazmaQuery);
      const colOtkazmalar: any[] = [];
      otkazmaSnap.forEach(docSnap => {
        colOtkazmalar.push(docSnap.data());
      });
      dbState.otkazmalar = mergeOtkazmalarDeduplicated(mainOtkazmalar, colOtkazmalar);
    } catch (e) {
      dbState.otkazmalar = mainOtkazmalar;
    }

    // 5. Load kassaHarakatlari
    try {
      const kassaQuery = loadFullHistory
        ? query(collection(firestoreDb, 'kassaHarakatlari'))
        : query(collection(firestoreDb, 'kassaHarakatlari'), limit(200));
      const kassaSnap = await getDocs(kassaQuery);
      const colKassa: any[] = [];
      kassaSnap.forEach(docSnap => {
        colKassa.push(docSnap.data());
      });
      dbState.kassaHarakatlari = mergeKassaDeduplicated(mainKassa, colKassa);
    } catch (e) {
      dbState.kassaHarakatlari = mainKassa;
    }

    // 6. Load kontragentlar
    try {
      const kontragentSnap = await getDocs(collection(firestoreDb, 'kontragentlar'));
      const colKontragentlar: Kontragent[] = [];
      kontragentSnap.forEach(docSnap => {
        colKontragentlar.push(docSnap.data() as Kontragent);
      });
      dbState.kontragentlar = mergeKontragentlarDeduplicated(colKontragentlar, mainKontragentlar);
    } catch (e) {
      dbState.kontragentlar = mainKontragentlar;
    }

    // 7. Load auditLogs
    const auditQuery = query(collection(firestoreDb, 'auditLogs'), orderBy('date', 'desc'), limit(100));
    const auditSnap = await getDocs(auditQuery);
    const auditLogs: AuditLog[] = [];
    auditSnap.forEach(docSnap => {
      auditLogs.push(docSnap.data() as AuditLog);
    });
    dbState.auditLogs = auditLogs;

  } catch (err: any) {
    const isOfflineErr = err?.code === 'unavailable' || 
                         err?.message?.includes('offline') || 
                         err?.message?.includes('Failed to get document because the client is offline');
    if (isOfflineErr) {
      console.warn('[FIRESTORE] Device or network is offline, continuing with local cache');
    } else {
      console.error('Error loading db from collections:', err);
    }
    return null;
  }

  return dbState;
}

export interface RealtimeSyncHandlers {
  onSettingsAndStockUpdate: (data: Record<string, any>) => void;
  onTransactionsUpdate: (transactions: Transaction[]) => void;
  onKottaTransactionsUpdate: (transactions: Transaction[]) => void;
  onOtkazmalarUpdate: (otkazmalar: Otkazma[]) => void;
  onKassaHarakatlariUpdate: (kassaHarakatlari: KassaHarakati[]) => void;
  onKontragentlarUpdate: (kontragentlar: Kontragent[]) => void;
}

/**
 * Setup real-time onSnapshot listeners for all Firestore collections:
 * Every device's changes propagate to all other devices in real-time!
 */
export function setupRealtimeCollectionsListeners(handlers: RealtimeSyncHandlers): () => void {
  const sixtyDaysAgo = getSixtyDaysAgoStr();
  const unsubs: Unsubscribe[] = [];

  // 1. app_db/main listener (stock, prices, settings)
  try {
    const unsubMain = onSnapshot(doc(firestoreDb, 'app_db', 'main'), (snap) => {
      if (snap.exists()) {
        handlers.onSettingsAndStockUpdate(snap.data());
      }
    }, (err) => console.warn('[FIRESTORE] app_db/main listener notice:', err));
    unsubs.push(unsubMain);
  } catch (err) {
    console.warn('[FIRESTORE] Error initializing app_db/main listener:', err);
  }

  // Helper to subscribe with automatic index-error fallback
  const listenWithFallback = <T>(
    colName: string, 
    filterWhere: boolean, 
    onData: (items: T[]) => void
  ) => {
    try {
      const q = filterWhere 
        ? query(collection(firestoreDb, colName), limit(300))
        : collection(firestoreDb, colName);
      const unsub = onSnapshot(q, (snap) => {
        const items: T[] = [];
        snap.forEach(d => items.push(d.data() as T));
        onData(items);
      }, (err) => {
        console.warn(`[FIRESTORE] ${colName} listener notice:`, err);
        if (filterWhere) {
          try {
            const fallbackQ = query(collection(firestoreDb, colName), limit(150));
            const sub = onSnapshot(fallbackQ, (fSnap) => {
              const fItems: T[] = [];
              fSnap.forEach(d => fItems.push(d.data() as T));
              onData(fItems);
            });
            unsubs.push(sub);
          } catch {}
        }
      });
      unsubs.push(unsub);
    } catch (e) {
      console.warn(`[FIRESTORE] Error listening to ${colName}:`, e);
    }
  };

  // 2. transactions collection listener
  listenWithFallback<Transaction>('transactions', true, handlers.onTransactionsUpdate);

  // 3. kottaTransactions collection listener
  listenWithFallback<Transaction>('kottaTransactions', true, handlers.onKottaTransactionsUpdate);

  // If sharded monthly collections are active, also listen to current month shard
  if (isCollectionsArchitectureEnabled()) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    listenWithFallback<Transaction>(`transactions_${year}_${month}`, false, handlers.onTransactionsUpdate);
  }

  // 4. otkazmalar collection listener
  listenWithFallback<Otkazma>('otkazmalar', true, handlers.onOtkazmalarUpdate);

  // 5. kassaHarakatlari collection listener
  listenWithFallback<KassaHarakati>('kassaHarakatlari', true, handlers.onKassaHarakatlariUpdate);

  // 6. kontragentlar collection listener
  listenWithFallback<Kontragent>('kontragentlar', false, handlers.onKontragentlarUpdate);

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch {}
    });
  };
}
