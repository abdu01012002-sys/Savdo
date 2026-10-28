import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { DbState, User, WarehouseName, Kontragent, TemplateItem } from '../types';
import { INITIAL_DB } from '../data';
import { doc, onSnapshot, setDoc, getDoc, getDocFromServer, disableNetwork, enableNetwork } from 'firebase/firestore';
import { firestoreDb, auth } from '../lib/fbClient';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { toast } from 'sonner';
import { getTodayStr } from '../lib/utils';
import { sendDailyReportNotification } from '../services/telegramService';
import { 
  scanAndMergeAllFirestoreSources, 
  normalizeTransaction, 
  extractTransactionsFromRaw,
  normalizeKontragent, 
  normalizeOtkazma, 
  normalizeKassaHarakati, 
  normalizeStockObject,
  mergeTransactionsDeduplicated,
  mergeKontragentlarDeduplicated,
  mergeOtkazmalarDeduplicated,
  mergeKassaDeduplicated,
  mergeVozvratDeduplicated,
  mergeBrakDeduplicated
} from '../lib/firestoreSyncService';
import { saveToIndexedDb, loadFromIndexedDb } from '../lib/indexedDbStorage';
import { 
  syncChangedEntitiesToFirestore, 
  loadDbFromCollections, 
  setupRealtimeCollectionsListeners, 
  saveStockAndSettingsToAppDbMain,
  extractCleanSettingsAndStock
} from '../lib/firestoreCollectionSync';

interface DbContextProps {
  db: DbState;
  setDb: React.Dispatch<React.SetStateAction<DbState>>;
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  currentOmbor: WarehouseName;
  setCurrentOmbor: React.Dispatch<React.SetStateAction<WarehouseName>>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  hasPermission: (action: string) => boolean;
  lastSaved: string | null;
  isOffline: boolean;
  isQuotaExhausted: boolean;
  quotaDetails: {
    message: string;
    projectId: string;
    databaseId: string;
    upgradeUrl: string;
  } | null;
  retryFirestoreSync: () => Promise<void>;
  isSyncing: boolean;
  saveTemplate: (name: string, items: TemplateItem[]) => void;
  deleteTemplate: (id: string) => void;
  scanAndRestoreLegacyData: (showToast?: boolean) => Promise<{
    foundSourcesCount: number;
    recoveredRecordsCount: {
      transactions: number;
      kontragentlar: number;
      otkazmalar: number;
      kassa: number;
      stockTepa: number;
      stockKotta: number;
    };
    details: string[];
  }>;
  isMigrating: boolean;
  resetKassaToZero: () => Promise<void>;
  flushSaveToFirestore: (latestDb?: DbState) => Promise<void>;
  pullLatestFromCloud: (showNotification?: boolean) => Promise<void>;
  toggleArchiveModel: (modelName: string) => void;
  isModelArchived: (modelName: string) => boolean;
  atomicCheckout: (ombor: WarehouseName, items: Array<{ model: string; sizes: Record<string, number> }>) => Promise<{ ok: boolean; conflict?: boolean; conflicts?: any[]; message?: string }>;
  backupsList: Array<{ filename: string; date: string; sizeKb: number; updatedAt: string }>;
  refreshBackupsList: () => Promise<void>;
  createBackupSnapshot: () => Promise<void>;
  restoreBackupSnapshot: (filename: string) => Promise<boolean>;
}

const DbContext = createContext<DbContextProps | undefined>(undefined);

export const FIREBASE_PROJECT_ID = 'collective-thought-5q6d2';
export const FIRESTORE_DATABASE_ID = 'ai-studio-7a56a139-809a-4d72-bfc7-2fb48ddde40a';
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

export const isQuotaError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err?.message || String(err)).toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota') ||
    msg.includes('free daily write units') ||
    msg.includes('free daily read units') ||
    msg.includes('exhausted maximum allowed queued writes') ||
    msg.includes('maximum backoff delay') ||
    msg.includes('overloading the backend')
  );
};

const sanitizeFirebaseKey = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[#$/\[\]]/g, '');
};

const toArray = (obj: any, defaultVal: any[] = []): any[] => {
  if (!obj) return defaultVal;
  if (Array.isArray(obj)) return obj.filter(Boolean);
  if (typeof obj === 'object') return Object.values(obj).filter(Boolean);
  return defaultVal;
};

// Safe extraction to keep app_db/main strictly 30-50 KB without transactions bloat
export const prunePayloadForFirestore = (db: DbState): any => {
  return extractCleanSettingsAndStock(db);
};

// Deeply merges multiple stock objects across local cache and cloud sources so no models or sizes are lost
export const mergeStockObjects = (...stockSources: any[]): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {};
  for (const raw of stockSources) {
    if (!raw) continue;
    const normalized = normalizeStockObject(raw);
    for (const model in normalized) {
      if (!result[model]) {
        result[model] = { ...normalized[model] };
      } else {
        result[model] = { ...result[model], ...normalized[model] };
      }
    }
  }
  return result;
};

export const convertArraysToMaps = (obj: any, rootPath = ''): any => {
  if (obj === undefined) return null;
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const hasId = obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 'id' in obj[0];
    const shouldBeMap = hasId || [
      'users', 'kontragentlar', 'templates', 'pendingKirim', 
      'transactions', 'otkazmalar', 'bekorQilinganOtkazmalar', 
      'bekorQilinganKirimlar', 'bekorQilinganChiqimlar', 
      'auditLogs', 'kassaHarakatlari', 'vozvratlar', 'braklar'
    ].includes(rootPath);

    if (shouldBeMap) {
      const map: Record<string, any> = {};
      obj.forEach((item, index) => {
        if (item && typeof item === 'object') {
          const itemId = item.id ? String(item.id).replace(/[#$/\[\]]/g, '_') : `item_${index}`;
          map[itemId] = convertArraysToMaps(item, rootPath);
        }
      });
      return map;
    }
    return obj.map(item => convertArraysToMaps(item, rootPath));
  }
  const res: Record<string, any> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      const cleanKey = sanitizeFirebaseKey(key);
      res[cleanKey] = convertArraysToMaps(obj[key], key);
    }
  }
  return res;
};

const sanitizeState = (db: any): any => {
  if (!db) return db;
  const newDb = JSON.parse(JSON.stringify(db));

  const sanitizeStock = (stock: any) => {
    if (!stock || typeof stock !== 'object') return {};
    const newStock: any = {};
    for (const key in stock) {
      const cleanModel = sanitizeFirebaseKey(key);
      newStock[cleanModel] = {};
      const modelSizes = stock[key];
      if (modelSizes && typeof modelSizes === 'object') {
        for (const sz in modelSizes) {
          const cleanSize = sanitizeFirebaseKey(sz);
          const count = Number(modelSizes[sz]);
          newStock[cleanModel][cleanSize] = Math.max(0, isNaN(count) ? 0 : count);
        }
      }
    }
    return newStock;
  };

  if (newDb.tepa && newDb.tepa.stock) newDb.tepa.stock = sanitizeStock(newDb.tepa.stock);
  if (newDb.kotta && newDb.kotta.stock) newDb.kotta.stock = sanitizeStock(newDb.kotta.stock);
  if (newDb.sort2 && newDb.sort2.stock) newDb.sort2.stock = sanitizeStock(newDb.sort2.stock);

  if (newDb.prices) {
    const newPrices: any = {};
    for (const key in newDb.prices) {
      newPrices[sanitizeFirebaseKey(key)] = newDb.prices[key];
    }
    newDb.prices = newPrices;
  }

  const sanitizeModelArray = (arr: any[]) => {
    if (!Array.isArray(arr)) return arr;
    return arr.map(item => {
      if (!item) return item;
      const res = { ...item };
      if (res.model) res.model = sanitizeFirebaseKey(res.model);
      if (res.kimdan && (res.kimdan === 'Umid8708' || res.kimdan.trim().toLowerCase() === 'umid8708')) {
        res.kimdan = 'Umid 8708';
      }
      if (res.izoh && (res.izoh === 'Umid8708' || res.izoh.trim().toLowerCase() === 'umid8708')) {
        res.izoh = 'Umid 8708';
      }
      return res;
    });
  };

  const sanitizeKontragentlar = (arr: any[]) => {
    if (!Array.isArray(arr)) return arr;
    const map = new Map<string, any>();
    
    arr.forEach(item => {
      if (!item || !item.ism) return;
      let name = item.ism.trim();
      if (name === 'Umid8708' || name.toLowerCase() === 'umid8708') {
        name = 'Umid 8708';
      }
      
      if (map.has(name)) {
        const existing = map.get(name);
        existing.jami = (existing.jami || 0) + (item.jami || 0);
        existing.balans = (existing.balans || 0) + (item.balans || 0);
        existing.xaridlarSoni = (existing.xaridlarSoni || 0) + (item.xaridlarSoni || 0);
        if (item.tel && !existing.tel) existing.tel = item.tel;
        if (item.viloyat && !existing.viloyat) existing.viloyat = item.viloyat;
      } else {
        const cleaned = { ...item, ism: name };
        if (cleaned.viloyat === undefined) cleaned.viloyat = '';
        map.set(name, cleaned);
      }
    });

    const result = Array.from(map.values());
    const seenIds = new Set<string>();
    result.forEach((client, idx) => {
      if (!client.id || seenIds.has(client.id)) {
        client.id = `client_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2, 6)}`;
      }
      seenIds.add(client.id);
    });

    return result;
  };

  if (newDb.tepa && newDb.tepa.transactions) newDb.tepa.transactions = sanitizeModelArray(newDb.tepa.transactions);
  if (newDb.kotta && newDb.kotta.transactions) newDb.kotta.transactions = sanitizeModelArray(newDb.kotta.transactions);
  if (newDb.sort2 && newDb.sort2.transactions) newDb.sort2.transactions = sanitizeModelArray(newDb.sort2.transactions);
  if (!newDb.sort2) newDb.sort2 = { stock: {}, transactions: [] };
  if (!newDb.sort2.stock) newDb.sort2.stock = {};
  if (!newDb.sort2.transactions) newDb.sort2.transactions = [];
  if (newDb.kontragentlar) newDb.kontragentlar = sanitizeKontragentlar(newDb.kontragentlar);
  
  newDb.otkazmalar = sanitizeModelArray(newDb.otkazmalar);
  newDb.bekorQilinganOtkazmalar = sanitizeModelArray(newDb.bekorQilinganOtkazmalar);
  newDb.bekorQilinganKirimlar = sanitizeModelArray(newDb.bekorQilinganKirimlar);
  newDb.bekorQilinganChiqimlar = sanitizeModelArray(newDb.bekorQilinganChiqimlar);
  if (newDb.vozvratlar) newDb.vozvratlar = sanitizeModelArray(newDb.vozvratlar);
  if (newDb.braklar) newDb.braklar = sanitizeModelArray(newDb.braklar);

  if (Array.isArray(newDb.templates)) {
    newDb.templates = newDb.templates.map((t: any) => ({
      ...t,
      items: sanitizeModelArray(t.items)
    }));
  }

  return newDb;
};

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, setDb: setStoreDb } = useAppStore();
  const setDbState = setStoreDb;
  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('ombor_db_cache');
    } catch {
      return false;
    }
  });
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('ombor_current_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('ombor_current_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('ombor_current_user');
      }
    } catch (e) {}
  }, [currentUser]);
  const [currentOmbor, setCurrentOmbor] = useState<WarehouseName>('tepa');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isMigrating, setIsMigrating] = useState(false);
  
  const [isQuotaExhausted, setIsQuotaExhausted] = useState<boolean>(() => {
    const isExhausted = localStorage.getItem('ombor_firestore_quota_exhausted') === 'true';
    const quotaDate = localStorage.getItem('ombor_firestore_quota_date');
    const today = new Date().toISOString().split('T')[0];
    if (isExhausted && quotaDate && quotaDate !== today) {
      // Yangi kun kelganda avtomatik kvotani qayta tekshirish uchun tozalash
      localStorage.removeItem('ombor_firestore_quota_exhausted');
      localStorage.removeItem('ombor_firestore_quota_date');
      return false;
    }
    return isExhausted;
  });

  const [quotaDetails, setQuotaDetails] = useState<{
    message: string;
    projectId: string;
    databaseId: string;
    upgradeUrl: string;
  } | null>(() => {
    const isExhausted = localStorage.getItem('ombor_firestore_quota_exhausted') === 'true';
    if (!isExhausted) return null;
    return {
      message: "Firebase bepul kunlik yozish kvotasi (Free Spark: 20,000 writes/kun) tugadi. Yangi ma'lumotlar hozircha ushbu qurilmada saqlanmoqda.",
      projectId: FIREBASE_PROJECT_ID,
      databaseId: FIRESTORE_DATABASE_ID,
      upgradeUrl: FIRESTORE_UPGRADE_URL
    };
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isQuotaExhaustedRef = useRef(isQuotaExhausted);
  useEffect(() => {
    isQuotaExhaustedRef.current = isQuotaExhausted;
  }, [isQuotaExhausted]);

  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      setIsAuthLoaded(true);
    });
  }, []);

  // Asynchronously hydrate full unpruned database from IndexedDB if available
  useEffect(() => {
    loadFromIndexedDb().then((idbData) => {
      if (idbData && idbData.tepa && idbData.kotta) {
        setDbState((current) => {
          const idbTxCount = (idbData.tepa?.transactions?.length || 0) + (idbData.kotta?.transactions?.length || 0);
          const currentTxCount = (current.tepa?.transactions?.length || 0) + (current.kotta?.transactions?.length || 0);
          if (idbTxCount > currentTxCount) {
            dbRef.current = idbData;
            return idbData;
          }
          return current;
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success("Internet aloqasi tiklandi! Ma'lumotlar bazasi sinxronizatsiyasi faol.", {
        duration: 4000,
      });
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast.error("Internet aloqasi uzildi! Oflayn rejim faol.", {
        duration: 6000,
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('ombor_theme') as 'light' | 'dark') || 'dark';
  });

  // If database exceeds browser localStorage 5MB limit, creates a lightweight local cache
  // snapshot (keeping 100% of stock, kassa, prices, users, and the most recent 200 transactions per warehouse)
  const pruneDbForLocalStorage = useCallback((data: DbState): DbState => {
    return {
      ...data,
      tepa: {
        ...data.tepa,
        transactions: (data.tepa?.transactions || []).slice(0, 200)
      },
      kotta: {
        ...data.kotta,
        transactions: (data.kotta?.transactions || []).slice(0, 200)
      },
      sort2: {
        ...data.sort2,
        transactions: (data.sort2?.transactions || []).slice(0, 200)
      },
      otkazmalar: (data.otkazmalar || []).slice(0, 200),
      kassaHarakatlari: (data.kassaHarakatlari || []).slice(0, 200),
      vozvratlar: (data.vozvratlar || []).slice(0, 100),
      braklar: (data.braklar || []).slice(0, 100)
    };
  }, []);

  const safeWriteLocalStorageDb = useCallback((data: DbState) => {
    // 1. Full unpruned database is safely saved to IndexedDB (no 5MB limit, multi-gigabyte capacity)
    saveToIndexedDb(data).catch(() => {});

    // 2. LocalStorage receives lightweight pruned snapshot (stock, prices, users, latest txs)
    // This completely eliminates QuotaExceededError and prevents UI lag
    try {
      const pruned = pruneDbForLocalStorage(data);
      localStorage.setItem('ombor_db_cache', JSON.stringify(pruned));
      localStorage.setItem('ombor_last_saved_time', Date.now().toString());
    } catch (err: any) {
      try {
        localStorage.removeItem('ombor_db_cache');
      } catch (cleanErr) {}
    }
  }, [pruneDbForLocalStorage]);

  // Debounced Local caching effect to keep UI 60fps fast without JSON.stringify freezing
  const localCacheTimerRef = useRef<NodeJS.Timeout | null>(null);
  const persistToLocalStorage = useCallback((data: DbState) => {
    if (localCacheTimerRef.current) {
      clearTimeout(localCacheTimerRef.current);
    }
    localCacheTimerRef.current = setTimeout(() => {
      safeWriteLocalStorageDb(data);
    }, 400); // 400ms smooth debounce
  }, [safeWriteLocalStorageDb]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (localCacheTimerRef.current && dbRef.current) {
        clearTimeout(localCacheTimerRef.current);
        safeWriteLocalStorageDb(dbRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [safeWriteLocalStorageDb]);

  const dbRef = useRef<DbState>(db);
  const lastSavedSignatureRef = useRef<string>('');
  const lastSeenDbVersionRef = useRef<number>(0);
  const lastPulledTimeRef = useRef<number>(0);
  const lastUserActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  // Robust signature generator for dirty checking to prevent redundant writes
  const buildDbSignature = useCallback((dbState: DbState): string => {
    if (!dbState) return '';
    const t1 = dbState.tepa?.transactions?.[0];
    const t2 = dbState.kotta?.transactions?.[0];
    const t3 = dbState.sort2?.transactions?.[0];
    const o1 = dbState.otkazmalar?.[0];
    const k1 = dbState.kassaHarakatlari?.[0];
    const c1 = dbState.kontragentlar?.[0];

    return [
      dbState.tepa?.transactions?.length || 0,
      t1 ? `${t1.id}_${t1.sana}_${t1.vaqt}` : '',
      dbState.kotta?.transactions?.length || 0,
      t2 ? `${t2.id}_${t2.sana}_${t2.vaqt}` : '',
      dbState.sort2?.transactions?.length || 0,
      t3 ? `${t3.id}_${t3.sana}_${t3.vaqt}` : '',
      dbState.otkazmalar?.length || 0,
      o1 ? `${o1.id}_${o1.sana}` : '',
      dbState.kassaHarakatlari?.length || 0,
      k1 ? `${k1.id}_${k1.sana}_${k1.summa}` : '',
      dbState.kontragentlar?.length || 0,
      c1 ? `${c1.id}_${c1.balans}` : '',
      dbState.kassaBalansi?.naqd_uzs || 0,
      dbState.kassaBalansi?.naqd_usd || 0,
      dbState.kassaBalansi?.karta_uzs || 0,
      Object.keys(dbState.tepa?.stock || {}).length,
      Object.keys(dbState.kotta?.stock || {}).length,
      Object.keys(dbState.sort2?.stock || {}).length,
      Object.keys(dbState.prices || {}).length,
      dbState.users?.length || 0
    ].join('|');
  }, []);

  // Flush pending save immediately to Firestore
  const flushSaveToFirestore = useCallback(async (latestDb?: DbState) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const dbToSave = latestDb || dbRef.current;
    if (!dbToSave) return;

    try {
      setIsSyncing(true);
      await saveStockAndSettingsToAppDbMain(dbToSave);
      await syncChangedEntitiesToFirestore(dbRef.current !== dbToSave ? dbRef.current : null, dbToSave);
      setLastSaved(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.warn("Firestore save status:", err?.message || err);
      if (isQuotaError(err)) {
        setIsQuotaExhausted(true);
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Pull latest state from Firestore collections and app_db/main directly
  const pullLatestFromCloud = useCallback(async (showNotification = false) => {
    try {
      setIsSyncing(true);
      lastPulledTimeRef.current = Date.now();

      // Direct Firestore fetch from collections and app_db/main
      const cloudDb = await loadDbFromCollections(false);
      if (!cloudDb) {
        // Device or network is offline/slow, continue with current local cache
        setIsDbLoaded(true);
        return;
      }
      const currentLocal = dbRef.current || INITIAL_DB;

      const mergedTepaTx = mergeTransactionsDeduplicated(currentLocal.tepa?.transactions || [], cloudDb.tepa?.transactions || []);
      const mergedKottaTx = mergeTransactionsDeduplicated(currentLocal.kotta?.transactions || [], cloudDb.kotta?.transactions || []);
      const mergedSort2Tx = mergeTransactionsDeduplicated(currentLocal.sort2?.transactions || [], cloudDb.sort2?.transactions || []);
      const mergedKontragentlar = mergeKontragentlarDeduplicated(cloudDb.kontragentlar || [], currentLocal.kontragentlar || []);
      const mergedOtkazmalar = mergeOtkazmalarDeduplicated(currentLocal.otkazmalar || [], cloudDb.otkazmalar || []);
      const mergedKassa = mergeKassaDeduplicated(currentLocal.kassaHarakatlari || [], cloudDb.kassaHarakatlari || []);

      const newDb: DbState = {
        ...currentLocal,
        ...cloudDb,
        tepa: {
          stock: cloudDb.tepa?.stock || currentLocal.tepa?.stock || INITIAL_DB.tepa.stock,
          transactions: mergedTepaTx,
        },
        kotta: {
          stock: cloudDb.kotta?.stock || currentLocal.kotta?.stock || INITIAL_DB.kotta.stock,
          transactions: mergedKottaTx,
        },
        sort2: {
          stock: cloudDb.sort2?.stock || currentLocal.sort2?.stock || INITIAL_DB.sort2.stock,
          transactions: mergedSort2Tx,
        },
        kassaBalansi: cloudDb.kassaBalansi || currentLocal.kassaBalansi || INITIAL_DB.kassaBalansi,
        prices: cloudDb.prices || currentLocal.prices || {},
        otkazmalar: mergedOtkazmalar,
        kassaHarakatlari: mergedKassa,
        kontragentlar: mergedKontragentlar,
        users: cloudDb.users?.length ? cloudDb.users : (currentLocal.users || INITIAL_DB.users),
        valyutaKursi: cloudDb.valyutaKursi || currentLocal.valyutaKursi || 12850,
      };

      dbRef.current = newDb;
      setDbState(newDb);
      safeWriteLocalStorageDb(newDb);
      setIsDbLoaded(true);
      setLastSaved(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      if (showNotification) {
        toast.success("✅ Firestore bulutidan eng so'nggi ma'lumotlar yuklandi!", { duration: 3000 });
      }
    } catch (e: any) {
      console.warn("Pull warning:", e);
      if (showNotification) {
        toast.error("Sinxronlashda xatolik: " + (e?.message || e));
      }
    } finally {
      setIsSyncing(false);
      setIsDbLoaded(true);
    }
  }, [safeWriteLocalStorageDb]);

  // On app startup, immediately pull the latest state from Firestore cloud with 3.5s fail-safe
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setIsDbLoaded(true);
    }, 3500);

    pullLatestFromCloud(false).finally(() => {
      clearTimeout(safetyTimer);
      setIsDbLoaded(true);
    });

    return () => clearTimeout(safetyTimer);
  }, [pullLatestFromCloud]);

  // Window unload / visibility handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (dbRef.current) {
        safeWriteLocalStorageDb(dbRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && dbRef.current) {
        flushSaveToFirestore(dbRef.current);
      } else if (document.visibilityState === 'visible') {
        if (Date.now() - lastPulledTimeRef.current >= 30000) {
          pullLatestFromCloud(false);
        }
      }
    };

    const handleFocus = () => {
      if (Date.now() - lastPulledTimeRef.current >= 30000) {
        pullLatestFromCloud(false);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [flushSaveToFirestore, pullLatestFromCloud, safeWriteLocalStorageDb]);

  // Retry Firestore sync manually
  const retryFirestoreSync = useCallback(async () => {
    toast.loading("Firestore buluti tekshirilmoqda va sinxronlanmoqda...", { id: 'retry-sync' });
    try {
      setIsSyncing(true);
      await enableNetwork(firestoreDb);
      await pullLatestFromCloud(false);
      await saveStockAndSettingsToAppDbMain(dbRef.current);
      setIsQuotaExhausted(false);
      setQuotaDetails(null);
      localStorage.removeItem('ombor_firestore_quota_exhausted');
      localStorage.removeItem('ombor_firestore_quota_date');
      setLastSaved(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      toast.success("✅ Bulutli sinxronizatsiya to'liq yakunlandi!", { id: 'retry-sync' });
    } catch (err: any) {
      if (isQuotaError(err)) {
        setIsQuotaExhausted(true);
        toast.error("Firebase kunlik kvotasi cheklangan.", { id: 'retry-sync' });
      } else {
        toast.error("Ulanishda xatolik: " + (err?.message || err), { id: 'retry-sync' });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [pullLatestFromCloud]);

  // Comprehensive Legacy & Multi-source Migration function
  const scanAndRestoreLegacyData = useCallback(async (showToast = true) => {
    setIsMigrating(true);
    try {
      const result = await scanAndMergeAllFirestoreSources(dbRef.current);
      dbRef.current = result.mergedDb;
      setDbState(result.mergedDb);
      safeWriteLocalStorageDb(result.mergedDb);
      await saveStockAndSettingsToAppDbMain(result.mergedDb);

      if (showToast) {
        if (result.foundSourcesCount > 0) {
          toast.success(
            `✅ Firebase eski bazasidan ma'lumotlar tiklandi!\n` +
            `📦 Jami kirim/chiqim amallari: ${result.recoveredRecordsCount.transactions} ta\n` +
            `👥 Mijozlar: ${result.recoveredRecordsCount.kontragentlar} ta\n` +
            `🔄 O'tkazmalar: ${result.recoveredRecordsCount.otkazmalar} ta\n` +
            `💵 Kassa harakatlari: ${result.recoveredRecordsCount.kassa} ta`,
            { duration: 8000 }
          );
        } else {
          toast.info("Barcha Firestore manbalari tekshirildi. Baza eng so'nggi holatda.", { duration: 4000 });
        }
      }
      return result;
    } catch (err: any) {
      console.error("Migration error:", err);
      if (showToast) {
        toast.error("Baza ma'lumotlarini skanerlashda xatolik: " + (err?.message || err));
      }
      throw err;
    } finally {
      setIsMigrating(false);
    }
  }, [safeWriteLocalStorageDb]);

  // Real-time Firestore onSnapshot listeners for app_db/main and collections
  useEffect(() => {
    const unsubscribe = setupRealtimeCollectionsListeners({
      onSettingsAndStockUpdate: (cloudData) => {
        setDbState(prev => {
          const current = prev || INITIAL_DB;

          let mergedTepaTx = current.tepa?.transactions || [];
          if (cloudData.tepa?.transactions) {
            const rawTxs = toArray(cloudData.tepa.transactions).flatMap(extractTransactionsFromRaw);
            if (rawTxs.length > 0) {
              mergedTepaTx = mergeTransactionsDeduplicated(mergedTepaTx, rawTxs);
            }
          }

          let mergedKottaTx = current.kotta?.transactions || [];
          if (cloudData.kotta?.transactions) {
            const rawTxs = toArray(cloudData.kotta.transactions).flatMap(extractTransactionsFromRaw);
            if (rawTxs.length > 0) {
              mergedKottaTx = mergeTransactionsDeduplicated(mergedKottaTx, rawTxs);
            }
          }

          let mergedSort2Tx = current.sort2?.transactions || [];
          if (cloudData.sort2?.transactions) {
            const rawTxs = toArray(cloudData.sort2.transactions).flatMap(extractTransactionsFromRaw);
            if (rawTxs.length > 0) {
              mergedSort2Tx = mergeTransactionsDeduplicated(mergedSort2Tx, rawTxs);
            }
          }

          let mergedKontragent = current.kontragentlar || [];
          if (cloudData.kontragentlar) {
            const rawK = toArray(cloudData.kontragentlar).map(normalizeKontragent).filter(Boolean);
            if (rawK.length > 0) {
              mergedKontragent = mergeKontragentlarDeduplicated(rawK, mergedKontragent);
            }
          }

          let mergedOtkazmalar = current.otkazmalar || [];
          if (cloudData.otkazmalar) {
            const rawOtk = toArray(cloudData.otkazmalar).map(normalizeOtkazma).filter(Boolean);
            if (rawOtk.length > 0) {
              mergedOtkazmalar = mergeOtkazmalarDeduplicated(mergedOtkazmalar, rawOtk);
            }
          }

          let mergedKassa = current.kassaHarakatlari || [];
          if (cloudData.kassaHarakatlari) {
            const rawKassa = toArray(cloudData.kassaHarakatlari).map(normalizeKassaHarakati).filter(Boolean);
            if (rawKassa.length > 0) {
              mergedKassa = mergeKassaDeduplicated(mergedKassa, rawKassa);
            }
          }

          const merged: DbState = {
            ...current,
            tepa: {
              stock: cloudData.tepa?.stock || current.tepa?.stock || INITIAL_DB.tepa.stock,
              transactions: mergedTepaTx
            },
            kotta: {
              stock: cloudData.kotta?.stock || current.kotta?.stock || INITIAL_DB.kotta.stock,
              transactions: mergedKottaTx
            },
            sort2: {
              stock: cloudData.sort2?.stock || current.sort2?.stock || INITIAL_DB.sort2.stock,
              transactions: mergedSort2Tx
            },
            kontragentlar: mergedKontragent,
            otkazmalar: mergedOtkazmalar,
            kassaHarakatlari: mergedKassa,
            prices: cloudData.prices || current.prices || {},
            kassaBalansi: cloudData.kassaBalansi || current.kassaBalansi || INITIAL_DB.kassaBalansi,
            users: cloudData.users || current.users || INITIAL_DB.users,
            templates: cloudData.templates || current.templates || [],
            valyutaKursi: cloudData.valyutaKursi || current.valyutaKursi || 12850,
            valyutaKursConfig: cloudData.valyutaKursConfig || current.valyutaKursConfig || INITIAL_DB.valyutaKursConfig,
            telegramConfig: cloudData.telegramConfig || current.telegramConfig || INITIAL_DB.telegramConfig,
            muzlatilgan: cloudData.muzlatilgan || current.muzlatilgan || [],
            archivedModels: cloudData.archivedModels || current.archivedModels || [],
            smenalar: cloudData.smenalar || current.smenalar || [],
            joriySmena: cloudData.joriySmena !== undefined ? cloudData.joriySmena : current.joriySmena,
            pendingKirim: cloudData.pendingKirim || current.pendingKirim || [],
            vozvratlar: cloudData.vozvratlar || current.vozvratlar || [],
            braklar: cloudData.braklar || current.braklar || []
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          setLastSaved(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          return merged;
        });
        setIsDbLoaded(true);
      },
      onTransactionsUpdate: (cloudTxs) => {
        if (!cloudTxs || cloudTxs.length === 0) return;
        setDbState(prev => {
          const current = prev || INITIAL_DB;
          const tepaTxs = cloudTxs.filter(t => t.ombor !== 'kotta' && t.ombor !== 'sort2');
          const sort2Txs = cloudTxs.filter(t => t.ombor === 'sort2');
          const kottaTxs = cloudTxs.filter(t => t.ombor === 'kotta');

          const mergedTepa = mergeTransactionsDeduplicated(current.tepa?.transactions || [], tepaTxs);
          const mergedSort2 = mergeTransactionsDeduplicated(current.sort2?.transactions || [], sort2Txs);
          const mergedKotta = kottaTxs.length > 0 
            ? mergeTransactionsDeduplicated(current.kotta?.transactions || [], kottaTxs)
            : (current.kotta?.transactions || []);

          const merged: DbState = {
            ...current,
            tepa: { ...current.tepa, transactions: mergedTepa },
            kotta: { ...current.kotta, transactions: mergedKotta },
            sort2: { ...current.sort2, transactions: mergedSort2 }
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          return merged;
        });
      },
      onKottaTransactionsUpdate: (cloudKottaTxs) => {
        if (!cloudKottaTxs || cloudKottaTxs.length === 0) return;
        setDbState(prev => {
          const current = prev || INITIAL_DB;
          const mergedKotta = mergeTransactionsDeduplicated(current.kotta?.transactions || [], cloudKottaTxs);
          const merged: DbState = {
            ...current,
            kotta: { ...current.kotta, transactions: mergedKotta }
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          return merged;
        });
      },
      onOtkazmalarUpdate: (cloudOtkazmalar) => {
        if (!cloudOtkazmalar || cloudOtkazmalar.length === 0) return;
        setDbState(prev => {
          const current = prev || INITIAL_DB;
          const mergedOtk = mergeOtkazmalarDeduplicated(current.otkazmalar || [], cloudOtkazmalar);
          const merged: DbState = {
            ...current,
            otkazmalar: mergedOtk
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          return merged;
        });
      },
      onKassaHarakatlariUpdate: (cloudKassa) => {
        if (!cloudKassa || cloudKassa.length === 0) return;
        setDbState(prev => {
          const current = prev || INITIAL_DB;
          const mergedKassa = mergeKassaDeduplicated(current.kassaHarakatlari || [], cloudKassa);
          const merged: DbState = {
            ...current,
            kassaHarakatlari: mergedKassa
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          return merged;
        });
      },
      onKontragentlarUpdate: (cloudKontragentlar) => {
        if (!cloudKontragentlar || cloudKontragentlar.length === 0) return;
        setDbState(prev => {
          const current = prev || INITIAL_DB;
          const mergedKontragent = mergeKontragentlarDeduplicated(cloudKontragentlar, current.kontragentlar || []);
          const merged: DbState = {
            ...current,
            kontragentlar: mergedKontragent
          };
          dbRef.current = merged;
          persistToLocalStorage(merged);
          return merged;
        });
      }
    });

    return () => unsubscribe();
  }, [persistToLocalStorage]);

  const setDb = useCallback((action: DbState | ((prev: DbState) => DbState)) => {
    const prevDb = dbRef.current;
    const newDb = typeof action === 'function' ? action(prevDb) : action;
    
    dbRef.current = newDb;
    setStoreDb(newDb);

    persistToLocalStorage(newDb);

    syncChangedEntitiesToFirestore(prevDb, newDb).catch(err => {
      console.warn('[FIRESTORE] Sync error:', err);
    });
  }, [setStoreDb, persistToLocalStorage]);

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
    localStorage.setItem('ombor_theme', theme);
  }, [theme]);

  // Handle body classes for current ombor (for styling)
  useEffect(() => {
    if (currentUser) {
      document.documentElement.classList.toggle('kotta-mode', currentOmbor === 'kotta');
    } else {
      document.documentElement.classList.remove('kotta-mode');
    }
  }, [currentOmbor, currentUser]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const saveTemplate = (name: string, items: TemplateItem[]) => {
    setDb(prev => ({
      ...prev,
      templates: [...(prev.templates || []), { id: Date.now().toString(), name, items }]
    }));
  };

  const deleteTemplate = (id: string) => {
    setDb(prev => ({
      ...prev,
      templates: (prev.templates || []).filter(t => t.id !== id)
    }));
  };

  const hasPermission = (action: string) => {
    if (!currentUser) return false;
    if (currentUser.rol === 'admin') return true;
    if (currentUser.rol === 'omborchi') {
      return ['view', 'kirim', 'chiqim', 'otkazma', 'export'].includes(action);
    }
    if (currentUser.rol === 'kuzatuvchi') {
      return ['view'].includes(action);
    }
    return false;
  };

  const resetKassaToZero = useCallback(async () => {
    const cleanBalansi = {
      naqd_uzs: 0,
      naqd_usd: 0,
      karta_uzs: 0,
      bank_uzs: 0
    };

    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.kassaBalansi = cleanBalansi;
      nextDb.kassaHarakatlari = [];
      nextDb.kassaTransferlar = [];
      nextDb.smenalar = [];
      nextDb.joriySmena = null;
      return nextDb;
    });

    try {
      await fetch('/api/kassa/reset-test-funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.warn("Server reset kassa sync:", e);
    }
  }, [setDb]);

  const toggleArchiveModel = useCallback((modelName: string) => {
    if (!modelName) return;
    const cleanModel = modelName.trim();
    setDb(prev => {
      const current = prev.archivedModels || [];
      const isArchived = current.includes(cleanModel);
      const next = isArchived 
        ? current.filter(m => m !== cleanModel)
        : [...current, cleanModel];
      
      const updated = {
        ...prev,
        archivedModels: next
      };

      toast.success(
        isArchived 
          ? `✨ "${cleanModel}" modeli arxivdan chiqarildi (faollashtirildi).` 
          : `📦 "${cleanModel}" modeli muvaffaqiyatli arxivlandi.`
      );

      return updated;
    });
  }, [setDb]);

  const isModelArchived = useCallback((modelName: string) => {
    if (!modelName) return false;
    return (db.archivedModels || []).includes(modelName.trim());
  }, [db.archivedModels]);

  // Race Condition Guard: atomic checkout against server & Firestore
  const atomicCheckout = useCallback(async (
    ombor: WarehouseName, 
    items: Array<{ model: string; sizes: Record<string, number> }>
  ): Promise<{ ok: boolean; conflict?: boolean; conflicts?: any[]; message?: string }> => {
    if (navigator.onLine === false) {
      // Offline mode fallback: gracefully allow local sale
      return { ok: true };
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/api/stock/atomic-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ombor, items }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 409) {
        const data = await res.json();
        return {
          ok: false,
          conflict: true,
          conflicts: data.conflicts || [],
          message: data.message || "Omborda yetarli qoldiq mavjud emas!"
        };
      }
      return { ok: true };
    } catch (err) {
      console.warn("[ATOMIC] Checkout network notice:", err);
      return { ok: true }; // Allow smooth local execution on transient network timeout
    }
  }, []);

  // Backups state & methods
  const [backupsList, setBackupsList] = useState<Array<{ filename: string; date: string; sizeKb: number; updatedAt: string }>>([]);

  const refreshBackupsList = useCallback(async () => {
    try {
      const res = await fetch('/api/backup/list');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.backups)) {
          setBackupsList(json.backups);
        }
      }
    } catch (e) {
      console.warn("Backups list fetch notice:", e);
    }
  }, []);

  useEffect(() => {
    refreshBackupsList();
  }, [refreshBackupsList]);

  // Auto daily backup to localStorage (keeps last 7 days of snapshots safe locally)
  useEffect(() => {
    if (dbRef.current && (dbRef.current.tepa?.transactions?.length > 0 || Object.keys(dbRef.current.tepa?.stock || {}).length > 0)) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const key = `ombor_daily_backup_${today}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(dbRef.current));
          // Prune old snapshots
          const allKeys = Object.keys(localStorage).filter(k => k.startsWith('ombor_daily_backup_'));
          if (allKeys.length > 7) {
            allKeys.sort().slice(0, allKeys.length - 7).forEach(k => localStorage.removeItem(k));
          }
        }
      } catch {}
    }
  }, [db]);

  const createBackupSnapshot = useCallback(async () => {
    try {
      toast.loading("Yangi zaxira nusxasi olinmoqda...", { id: 'create-backup' });
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db: dbRef.current })
      });
      if (res.ok) {
        toast.success("✅ Kunlik zaxira nusxasi muvaffaqiyatli saqlandi!", { id: 'create-backup' });
        await refreshBackupsList();
      } else {
        toast.error("Zaxira nusxasi olishda xatolik", { id: 'create-backup' });
      }
    } catch (e: any) {
      toast.error("Xatolik: " + (e?.message || e), { id: 'create-backup' });
    }
  }, [refreshBackupsList]);

  const restoreBackupSnapshot = useCallback(async (filename: string): Promise<boolean> => {
    try {
      toast.loading(`"${filename}" nusxasidan tiklanmoqda...`, { id: 'restore-backup' });
      const res = await fetch(`/api/backup/restore/${encodeURIComponent(filename)}`, {
        method: 'POST'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          dbRef.current = json.data;
          setDbState(json.data);
          try {
            localStorage.setItem('ombor_db_cache', JSON.stringify(json.data));
          } catch {}
          toast.success(`✅ Baza "${filename}" nusxasidan muvaffaqiyatli tiklandi!`, { id: 'restore-backup' });
          return true;
        }
      }
      toast.error("Tiklashda xatolik yuz berdi", { id: 'restore-backup' });
      return false;
    } catch (e: any) {
      toast.error("Tiklashda xatolik: " + (e?.message || e), { id: 'restore-backup' });
      return false;
    }
  }, []);

  if (!isDbLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg2)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-10 h-10 border-4 border-[var(--active-color)] border-t-transparent rounded-full"></div>
          <div className="text-[var(--text3)] font-medium text-sm animate-pulse">Tarmoqqa ulanmoqda...</div>
        </div>
      </div>
    );
  }

  return (
    <DbContext.Provider
      value={{
        db,
        setDb,
        currentUser,
        setCurrentUser,
        currentOmbor,
        setCurrentOmbor,
        theme,
        toggleTheme,
        hasPermission,
        lastSaved,
        isOffline,
        isQuotaExhausted,
        quotaDetails,
        retryFirestoreSync,
        isSyncing,
        saveTemplate,
        deleteTemplate,
        scanAndRestoreLegacyData,
        isMigrating,
        resetKassaToZero,
        flushSaveToFirestore,
        pullLatestFromCloud,
        toggleArchiveModel,
        isModelArchived,
        atomicCheckout,
        backupsList,
        refreshBackupsList,
        createBackupSnapshot,
        restoreBackupSnapshot
      }}
    >
      {children}
    </DbContext.Provider>
  );
};

import { useAppStore } from '../store/appStore';

// ... (existing code)

export const useDb = () => {
  const context = useContext(DbContext);
  const { db, setDb } = useAppStore();
  if (context === undefined) {
    throw new Error('useDb must be used within a DbProvider');
  }
  // Merge context (settings, etc.) with store (db, setDb)
  return { ...context, db, setDb };
};


