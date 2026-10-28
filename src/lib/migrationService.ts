import { 
  collection, 
  doc, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { firestoreDb } from '@/lib/fbClient';

export interface MigrationReport {
  dryRun: boolean;
  collections: {
    [key: string]: {
      idbCount: number;
      expectedCount?: number;
      existingFirestoreCount: number;
      toWriteCount: number;
      skippedCount: number;
      mismatch?: boolean;
    }
  };
  invalidDates: {
    collection: string;
    id: string;
    sana: any;
    reason: string;
  }[];
  success: boolean;
  error?: string;
}

const EXPECTED_COUNTS: { [key: string]: number } = {
  transactions: 6700,
  kottaTransactions: 971,
  otkazmalar: 485,
  kassaHarakatlari: 46,
  kontragentlar: 80,
  auditLogs: 50,
};

export async function readFullDbFromIndexedDB(): Promise<any> {
  const tryOpen = (dbName: string, storeName: string, key: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported'));
      }
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result || null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch (e) {
          db.close();
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  };

  let data = await tryOpen('FalakOmborDB', 'app_state', 'full_db');
  if (!data) data = await tryOpen('OmborPro_LocalDB', 'app_state', 'full_db');
  if (!data) data = await tryOpen('OmborPro_LocalDB', 'app_state', 'main_db');
  if (!data) data = await tryOpen('FalakOmborDB', 'app_state', 'main_db');
  return data;
}

function toListWithKey(input: any): { id: string; item: any }[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((item, idx) => ({
      id: item?.id ? String(item.id) : `id_${idx}`,
      item
    }));
  }
  if (typeof input === 'object') {
    return Object.entries(input).map(([key, item]: [string, any]) => ({
      id: item?.id ? String(item.id) : key,
      item: { ...(typeof item === 'object' && item !== null ? item : { value: item }), id: item?.id ? String(item.id) : key }
    }));
  }
  return [];
}

async function fetchExistingIds(collectionName: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const snap = await getDocs(collection(firestoreDb, collectionName));
  snap.forEach(docSnap => {
    ids.add(docSnap.id);
  });
  return ids;
}

export async function executeMigration(
  dryRun: boolean,
  onProgress?: (msg: string, percent: number) => void,
  customSourceDb?: any
): Promise<MigrationReport> {
  const report: MigrationReport = {
    dryRun,
    collections: {},
    invalidDates: [],
    success: false,
  };

  try {
    let fullDb: any = null;
    if (customSourceDb) {
      onProgress?.('Zaxira fayldan ma\'lumotlar tahlil qilinmoqda...', 10);
      fullDb = customSourceDb.indexedDbData || customSourceDb;
    } else {
      onProgress?.('IndexedDB dan ma\'lumotlar o\'qilmoqda...', 10);
      fullDb = await readFullDbFromIndexedDB();
    }

    if (!fullDb) {
      throw new Error(
        customSourceDb
          ? 'Zaxira faylida ma\'lumotlar topilmadi (indexedDbData bo\'sh).'
          : 'IndexedDB da full_db topilmadi (FalakOmborDB yoki OmborPro_LocalDB bo\'sh).'
      );
    }

    const tepaTransactionsList = toListWithKey(fullDb.tepa?.transactions);
    const tepaTransactionsTopList = toListWithKey(fullDb.tepaTransactions);
    const kottaTransactionsList = toListWithKey(fullDb.kotta?.transactions);
    const kottaTransactionsTopList = toListWithKey(fullDb.kottaTransactions);
    const sort2TransactionsList = toListWithKey(fullDb.sort2?.transactions);
    const sort2TransactionsTopList = toListWithKey(fullDb.sort2Transactions);

    const mergedTransactionsMap = new Map<string, any>();
    tepaTransactionsList.forEach(t => mergedTransactionsMap.set(t.id, { ...t.item, ombor: t.item?.ombor || 'tepa' }));
    tepaTransactionsTopList.forEach(t => mergedTransactionsMap.set(t.id, { ...t.item, ombor: t.item?.ombor || 'tepa' }));
    kottaTransactionsList.forEach(t => mergedTransactionsMap.set(t.id, { ...t.item, ombor: t.item?.ombor || 'kotta' }));
    sort2TransactionsList.forEach(t => mergedTransactionsMap.set(t.id, { ...t.item, ombor: t.item?.ombor || 'sort2' }));
    sort2TransactionsTopList.forEach(t => mergedTransactionsMap.set(t.id, { ...t.item, ombor: t.item?.ombor || 'sort2' }));

    const transactionsAll = Array.from(mergedTransactionsMap.values());
    const kottaTransactionsAll = kottaTransactionsTopList.map(t => t.item);
    const otkazmalarAll = toListWithKey(fullDb.otkazmalar).map(t => t.item);
    const kassaHarakatlariAll = toListWithKey(fullDb.kassaHarakatlari).map(t => t.item);
    const kontragentlarAll = toListWithKey(fullDb.kontragentlar).map(t => t.item);
    const rawAudit = fullDb.auditLogs || fullDb.audit_logs || fullDb.audit || [];
    const auditLogsAll = toListWithKey(rawAudit).map(t => {
      const item = t.item;
      const id = item?.id ? String(item.id) : t.id;
      const sana = item?.sana || (item?.date ? String(item.date).substring(0, 10) : undefined);
      return { ...item, id, sana: sana || item?.sana };
    });

    const collectionsToMigrate = [
      { name: 'transactions', items: transactionsAll },
      { name: 'kottaTransactions', items: kottaTransactionsAll },
      { name: 'otkazmalar', items: otkazmalarAll },
      { name: 'kassaHarakatlari', items: kassaHarakatlariAll },
      { name: 'kontragentlar', items: kontragentlarAll },
      { name: 'auditLogs', items: auditLogsAll },
    ];

    const invalidDates: { collection: string; id: string; sana: any; reason: string }[] = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (const colInfo of collectionsToMigrate) {
      for (const item of colInfo.items) {
        const id = item?.id ? String(item.id) : null;
        const sana = item?.sana || (colInfo.name === 'auditLogs' && item?.date ? String(item.date).substring(0, 10) : undefined);
        if (!id) {
          invalidDates.push({ collection: colInfo.name, id: 'UNKNOWN_ID', sana, reason: 'ID topilmadi' });
          continue;
        }
        if (!sana || !dateRegex.test(String(sana))) {
          invalidDates.push({ collection: colInfo.name, id, sana: sana || 'YOQ', reason: 'Sana formati noto\'g\'ri yoki yo\'q (YYYY-MM-DD kutilgan)' });
        }
      }
    }
    report.invalidDates = invalidDates;

    let totalProgress = 20;
    const progressStep = 60 / collectionsToMigrate.length;

    for (const colInfo of collectionsToMigrate) {
      onProgress?.(`Kollleksiya tahlil qilinmoqda: ${colInfo.name}...`, totalProgress);
      const existingIds = await fetchExistingIds(colInfo.name);

      const itemsToWrite = colInfo.items.filter((item: any) => {
        const id = item?.id ? String(item.id) : null;
        if (!id) return false;
        return !existingIds.has(id);
      });

      const idbCount = colInfo.items.length;
      const expectedCount = EXPECTED_COUNTS[colInfo.name];
      const existingFirestoreCount = existingIds.size;
      const toWriteCount = itemsToWrite.length;
      const skippedCount = idbCount - toWriteCount;
      const mismatch = expectedCount !== undefined && idbCount !== expectedCount;

      report.collections[colInfo.name] = {
        idbCount,
        expectedCount,
        existingFirestoreCount,
        toWriteCount,
        skippedCount,
        mismatch,
      };

      if (!dryRun && toWriteCount > 0) {
        let batchIndex = 0;
        const BATCH_SIZE = 400;
        const totalBatches = Math.ceil(itemsToWrite.length / BATCH_SIZE);
        while (batchIndex < itemsToWrite.length) {
          const chunk = itemsToWrite.slice(batchIndex, batchIndex + BATCH_SIZE);
          const batch = writeBatch(firestoreDb);
          for (const item of chunk) {
            const id = String(item.id);
            const ref = doc(firestoreDb, colInfo.name, id);
            batch.set(ref, item, { merge: true });
          }
          const partiyaNum = Math.floor(batchIndex / BATCH_SIZE) + 1;
          try {
            await batch.commit();
          } catch (commitErr: any) {
            throw new Error(`${colInfo.name} kolleksiyasini yozishda xatolik yuz berdi (partiya: ${partiyaNum}/${totalBatches}, yozuvlar: ${batchIndex + 1}-${Math.min(batchIndex + BATCH_SIZE, itemsToWrite.length)}): ${commitErr?.message || commitErr}`);
          }
          batchIndex += BATCH_SIZE;

          const batchFraction = Math.min(batchIndex / itemsToWrite.length, 1);
          const currentBatchProgress = Math.min(
            totalProgress + progressStep * batchFraction,
            totalProgress + progressStep
          );
          onProgress?.(
            `${colInfo.name}: ${partiyaNum}/${totalBatches} partiya yozildi (${Math.min(batchIndex, itemsToWrite.length)}/${itemsToWrite.length})...`,
            Math.round(currentBatchProgress)
          );

          // UI nafas olishi va hodisalar siklini bo'shatish uchun
          await new Promise(r => setTimeout(r, 0));
        }
      }

      totalProgress += progressStep;
    }

    if (!dryRun) {
      onProgress?.('Settings / main hujjatiga kichik ma\'lumotlar yozilmoqda...', 85);
      const settingsData = {
        tepa: fullDb.tepa ? { stock: fullDb.tepa.stock, prices: fullDb.tepa.prices } : {},
        kotta: fullDb.kotta ? { stock: fullDb.kotta.stock, prices: fullDb.kotta.prices } : {},
        sort2: fullDb.sort2 ? { stock: fullDb.sort2.stock, prices: fullDb.sort2.prices } : {},
        prices: fullDb.prices || {},
        users: fullDb.users || [],
        templates: fullDb.templates || [],
        valyutaKursi: fullDb.valyutaKursi || 12850,
        valyutaKursConfig: fullDb.valyutaKursConfig || {},
        kassaBalansi: fullDb.kassaBalansi || {},
        telegramConfig: fullDb.telegramConfig || {},
        pendingKirim: fullDb.pendingKirim || [],
        bekorQilinganChiqimlar: fullDb.bekorQilinganChiqimlar || [],
        bekorQilinganOtkazmalar: fullDb.bekorQilinganOtkazmalar || [],
        bekorQilinganKirimlar: fullDb.bekorQilinganKirimlar || [],
        muzlatilgan: fullDb.muzlatilgan || [],
        archivedModels: fullDb.archivedModels || [],
        smenalar: fullDb.smenalar || [],
        qabulQilinganPartiyaIds: fullDb.qabulQilinganPartiyaIds || [],
        migratedAt: new Date().toISOString(),
      };

      const settingsString = JSON.stringify(settingsData);
      const sizeInBytes = new Blob([settingsString]).size;
      const sizeInKb = Math.round(sizeInBytes / 1024);

      if (sizeInBytes > 800 * 1024) {
        throw new Error(`settings/main hajmi 800 KB dan oshib ketdi! (${sizeInKb} KB). Migratsiya to'xtatildi.`);
      }

      const batch = writeBatch(firestoreDb);
      batch.set(doc(firestoreDb, 'settings', 'main'), settingsData, { merge: true });
      await batch.commit();
    }

    report.success = true;
    onProgress?.('Migratsiya muvaffaqiyatli yakunlandi!', 100);
  } catch (err: any) {
    report.success = false;
    report.error = err.message || String(err);
    onProgress?.(`Xatolik: ${report.error}`, 100);
  }

  return report;
}
