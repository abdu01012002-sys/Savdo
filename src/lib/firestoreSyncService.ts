import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { firestoreDb } from './fbClient';
import { 
  DbState, 
  Transaction, 
  Kontragent, 
  Otkazma, 
  KassaHarakati, 
  VozvratItem, 
  BrakItem, 
  User, 
  ModelPrice,
  Amal,
  KassaTuri
} from '../types';
import { INITIAL_DB } from '../data';
import { generateId, getTodayStr, formatPhoneNumber, compareTxLatestFirst } from './utils';
import { sanitizeForFirestore } from './firestoreCollectionSync';

// Known legacy document paths where previous versions (Claude / claucy / earlier apps) may have stored state
export const LEGACY_DOC_PATHS = [
  { col: 'app_db', id: 'main' },
  { col: 'ombor_data', id: 'main' },
  { col: 'ombor_db', id: 'main' },
  { col: 'ombor', id: 'main' },
  { col: 'ombor', id: 'data' },
  { col: 'db', id: 'main' },
  { col: 'data', id: 'main' },
  { col: 'history_records', id: 'main' },
  { col: 'falak_shoe', id: 'main' },
  { col: 'falakshoe', id: 'main' },
  { col: 'ikki_ombor', id: 'main' },
  { col: 'ikki_ombor_v1', id: 'main' },
  { col: 'state', id: 'main' },
  { col: 'database', id: 'main' },
  { col: 'main', id: 'data' }
];

// Known separate collections where individual records may be stored
export const LEGACY_COLLECTIONS = [
  'transactions',
  'history',
  'history_records',
  'kirim_chiqim',
  'tarix',
  'operatsiyalar',
  'harakatlar',
  'kontragentlar',
  'mijozlar',
  'clients',
  'customers',
  'partners',
  'otkazmalar',
  'transfers',
  'stock',
  'qoldiqlar',
  'kassa',
  'kassaHarakatlari',
  'kassa_harakatlari',
  'moliya',
  'vozvratlar',
  'vozvrat',
  'braklar',
  'brak',
  'prices',
  'narxlar',
  'users',
  'xodimlar',
  'templates',
  'shablonlar',
  'auditLogs',
  'pendingKirim'
];

/**
 * Normalizes any object or array into a standard array.
 */
export const normalizeToArray = (val: any): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'object') {
    return Object.values(val).filter(Boolean);
  }
  return [];
};

/**
 * Normalizes a date value (timestamp, string, ISO) into YYYY-MM-DD.
 */
export const normalizeDate = (val: any): string => {
  if (!val) return getTodayStr();
  if (typeof val === 'string') {
    // If it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // If it's ISO like 2025-02-14T10:20:30.000Z
    if (val.includes('T')) return val.split('T')[0];
    // If DD.MM.YYYY
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
      const [d, m, y] = val.split('.');
      return `${y}-${m}-${d}`;
    }
  }
  // If Firestore Timestamp
  if (val && typeof val.toDate === 'function') {
    return val.toDate().toISOString().split('T')[0];
  }
  if (val && val.seconds) {
    return new Date(val.seconds * 1000).toISOString().split('T')[0];
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {
    // ignore
  }
  return getTodayStr();
};

/**
 * Normalizes a time string.
 */
export const normalizeTime = (val: any): string => {
  if (!val) return '12:00';
  if (typeof val === 'string') {
    if (val.includes('T')) {
      const parts = val.split('T')[1]?.split(':');
      if (parts && parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    }
    if (/^\d{2}:\d{2}/.test(val)) {
      return val.slice(0, 5);
    }
  }
  if (val && typeof val.toDate === 'function') {
    return val.toDate().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  return String(val).slice(0, 5);
};

/**
 * Normalizes an operation/action type into standard Amal.
 */
export const normalizeAmal = (val: any): Amal => {
  if (!val) return 'kirim';
  const str = String(val).toLowerCase().trim();
  if (str === 'kirim' || str === 'in' || str === 'qabul' || str === 'income') return 'kirim';
  if (str === 'chiqim' || str === 'out' || str === 'sale' || str === 'sotuv' || str === 'savdo') return 'chiqim';
  if (str.startsWith('otkazma') || str.includes('transfer')) {
    if (str.includes('in') || str.includes('keldi')) return 'otkazma-in';
    return 'otkazma-out';
  }
  if (str === 'tolov' || str === 'pay' || str === 'payment') return 'tolov';
  if (str === 'vozvrat' || str === 'return' || str === 'qaytarish') return 'vozvrat';
  if (str === 'brak' || str === 'defect') return 'brak';
  return 'kirim';
};

/**
 * Extracts one or more normalized transaction records from any legacy schema format.
 * Supports:
 * 1. Single flat record: { model, olcham, soni, ... }
 * 2. Size map: { model, sizes: { '39': 5, '40': 10 }, ... }
 * 3. Cart / Items array: { items: [ { model, sizes: {...} } ], ... }
 */
export const extractTransactionsFromRaw = (raw: any): Transaction[] => {
  if (!raw || typeof raw !== 'object') return [];

  const amal = normalizeAmal(raw.amal || raw.type || raw.action || raw.tip || raw.operation);
  const sana = normalizeDate(raw.sana || raw.date || raw.createdAt || raw.created_at || raw.timestamp || raw.vaqt);
  const vaqt = normalizeTime(raw.vaqt || raw.time || raw.createdAt || raw.created_at);
  const kimdan = String(raw.kimdan || raw.client || raw.mijoz || raw.partner || raw.kimga || raw.kontragent || raw.customer || raw.manba || raw.sender || '').trim();
  const izoh = String(raw.izoh || raw.note || raw.comment || raw.desc || raw.description || raw.tavsif || '').trim();
  const xodim = String(raw.xodim || raw.user || raw.author || raw.creator || raw.worker || raw.operator || 'Admin').trim();
  const baseGroupId = raw.groupId ? String(raw.groupId) : (raw.id ? String(raw.id) : `grp-${sana}-${vaqt}-${generateId()}`);
  const basePrice = Number(raw.summa ?? raw.price ?? raw.total ?? raw.jami ?? raw.amount ?? raw.narx ?? 0);
  const baseProfit = Number(raw.foyda ?? raw.profit ?? 0);

  const results: Transaction[] = [];

  

  // Case A: raw has items or cart array
  const itemsArray = normalizeToArray(raw.items || raw.cart || raw.tovarlar || raw.products);
  if (itemsArray.length > 0) {
    itemsArray.forEach((item: any, idx: number) => {
      const itemModel = String(item.model || item.modelName || item.nomi || item.tovar || '').trim() || 'Noma\'lum model';
      const itemSizes = item.sizes && typeof item.sizes === 'object' ? item.sizes : null;
      
      if (itemSizes) {
        Object.entries(itemSizes).forEach(([sz, q]) => {
          const qty = Math.abs(Number(q || 0));
          if (qty > 0) {
            results.push({
              id: `${baseGroupId}-${idx}-${sz}`,
              sana,
              vaqt,
              amal,
              model: itemModel,
              olcham: String(sz).trim(),
              soni: qty,
              summa: basePrice > 0 ? Math.round(basePrice / itemsArray.length) : 0,
              foyda: baseProfit > 0 ? Math.round(baseProfit / itemsArray.length) : 0,
              kimdan: kimdan || undefined,
              kimga: item.kimga || raw.kimga || (amal === 'chiqim' ? (kimdan || raw.kimga) : undefined),
              izoh: izoh || undefined,
              xodim,
              groupId: baseGroupId,
              ombor: item.ombor || raw.ombor || undefined,
              sort: item.sort || raw.sort || undefined
            });
          }
        });
      } else {
        const sz = String(item.olcham || item.size || item.razmer || '39').trim();
        const qty = Math.abs(Number(item.soni ?? item.qty ?? item.count ?? item.quantity ?? 1));
        if (qty > 0) {
          results.push({
            id: `${baseGroupId}-${idx}`,
            sana,
            vaqt,
            amal,
            model: itemModel,
            olcham: sz,
            soni: qty,
            summa: Number(item.summa || item.price || 0),
            foyda: Number(item.foyda || item.profit || 0),
            kimdan: kimdan || undefined,
            kimga: item.kimga || raw.kimga || (amal === 'chiqim' ? (kimdan || raw.kimga) : undefined),
            izoh: izoh || undefined,
            xodim,
            groupId: baseGroupId,
            ombor: item.ombor || raw.ombor || undefined,
            sort: item.sort || raw.sort || undefined
          });
        }
      }
    });
    if (results.length > 0) return results;
  }

  // Case B: raw has a single model but with a sizes map { '39': 5, '40': 10 }
  const rawModel = String(raw.model || raw.modelName || raw.nomi || raw.tovar || raw.mahsulot || raw.product || '').trim();
  const rawSizes = raw.sizes && typeof raw.sizes === 'object' ? raw.sizes : null;
  if (rawSizes && Object.keys(rawSizes).length > 0) {
    Object.entries(rawSizes).forEach(([sz, q]) => {
      const qty = Math.abs(Number(q || 0));
      if (qty > 0) {
        results.push({
          id: `${baseGroupId}-${sz}`,
          sana,
          vaqt,
          amal,
          model: rawModel || 'Noma\'lum model',
          olcham: String(sz).trim(),
          soni: qty,
          summa: basePrice,
          foyda: baseProfit,
          kimdan: kimdan || undefined,
          kimga: raw.kimga || (amal === 'chiqim' ? (kimdan || raw.kimga) : undefined),
          izoh: izoh || undefined,
          xodim,
          groupId: baseGroupId,
          ombor: raw.ombor || undefined,
          sort: raw.sort || undefined
        });
      }
    });
    if (results.length > 0) return results;
  }

  // Case C: Single flat record
  if (rawModel || raw.amal || raw.type || raw.summa || raw.price) {
    const olcham = String(raw.olcham || raw.size || raw.razmer || raw.olchami || '39').trim();
    const soni = Math.abs(Number(raw.soni ?? raw.qty ?? raw.quantity ?? raw.count ?? raw.miqdor ?? raw.juft ?? raw.dona ?? 0));
    const id = raw.id ? String(raw.id) : `tx-${sana}-${vaqt}-${rawModel}-${olcham}-${generateId()}`;

    results.push({
      id,
      vaqt,
      sana,
      amal,
      model: rawModel || 'Noma\'lum model',
      olcham: olcham || '39',
      soni: isNaN(soni) ? 0 : soni,
      summa: isNaN(basePrice) ? 0 : basePrice,
      foyda: isNaN(baseProfit) ? 0 : baseProfit,
      kimdan: kimdan || undefined,
      kimga: raw.kimga || (amal === 'chiqim' ? (kimdan || raw.kimga) : undefined),
      izoh: izoh || undefined,
      xodim,
      groupId: raw.groupId ? String(raw.groupId) : undefined,
      ombor: raw.ombor || undefined,
      sort: raw.sort || undefined
    });
  }

  return results;
};

/**
 * Normalizes a transaction record from any legacy schema (single item wrapper).
 */
export const normalizeTransaction = (raw: any): Transaction | null => {
  const extracted = extractTransactionsFromRaw(raw);
  return extracted.length > 0 ? extracted[0] : null;
};

/**
 * Normalizes a Kontragent (client/partner) record.
 */
export const normalizeKontragent = (raw: any): Kontragent | null => {
  if (!raw || typeof raw !== 'object') return null;
  const ism = String(raw.ism || raw.name || raw.fio || raw.nomi || raw.title || raw.clientName || '').trim();
  if (!ism) return null;

  const id = raw.id ? String(raw.id) : (raw._id ? String(raw._id) : (raw.docId ? String(raw.docId) : `k-${generateId()}`));
  const tel = formatPhoneNumber(String(raw.tel || raw.phone || raw.telefon || raw.phone_number || '').trim());
  const manzil = String(raw.manzil || raw.address || raw.shahar || raw.location || '').trim();
  const viloyat = String(raw.viloyat || raw.region || raw.hudud || raw.state || raw.province || '').trim();
  const kategoriya = String(raw.kategoriya || raw.category || raw.toifa || raw.type || 'Ulgurji').trim();
  const izoh = String(raw.izoh || raw.note || raw.comment || raw.description || '').trim();
  
  const jami = Number(raw.jami ?? raw.total ?? raw.totalPurchases ?? raw.xaridHajmi ?? raw.hajm ?? 0);
  const xaridlarSoni = Number(raw.xaridlarSoni ?? raw.purchaseCount ?? raw.ordersCount ?? raw.count ?? 0);
  const balans = Number(raw.balans ?? raw.balance ?? raw.qarz ?? raw.debt ?? 0);
  const kreditLimiti = Number(raw.kreditLimiti ?? raw.creditLimit ?? raw.limit ?? 0);

  const birinchiXarid = normalizeDate(raw.birinchiXarid || raw.firstPurchase || raw.qoshilganSana || raw.createdAt);
  const oxirgiXarid = normalizeDate(raw.oxirgiXarid || raw.lastPurchase || raw.lastOrderDate || raw.updatedAt);
  const qoshilganSana = normalizeDate(raw.qoshilganSana || raw.createdAt || raw.date);

  return {
    id,
    ism,
    tel,
    manzil,
    viloyat: viloyat || undefined,
    kategoriya: kategoriya || 'Ulgurji',
    izoh,
    jami: isNaN(jami) ? 0 : jami,
    xaridlarSoni: isNaN(xaridlarSoni) ? 0 : xaridlarSoni,
    balans: isNaN(balans) ? 0 : balans,
    kreditLimiti: isNaN(kreditLimiti) ? undefined : kreditLimiti,
    birinchiXarid,
    oxirgiXarid,
    qoshilganSana
  };
};

/**
 * Normalizes Otkazma (transfer) record.
 */
export const normalizeOtkazma = (raw: any): Otkazma | null => {
  if (!raw || typeof raw !== 'object') return null;
  const model = String(raw.model || raw.modelName || raw.nomi || '').trim();
  if (!model) return null;

  const id = raw.id ? String(raw.id) : `otk-${generateId()}`;
  const vaqt = normalizeTime(raw.vaqt || raw.time || raw.createdAt);
  const sana = normalizeDate(raw.sana || raw.date || raw.createdAt);
  const olcham = String(raw.olcham || raw.size || raw.razmer || '39').trim();
  const soni = Math.abs(Number(raw.soni ?? raw.qty ?? raw.count ?? 0));
  
  let from: 'tepa' | 'kotta' = 'tepa';
  let to: 'tepa' | 'kotta' = 'kotta';

  const rawFrom = String(raw.from || raw.qayerdan || raw.source || '').toLowerCase();
  const rawTo = String(raw.to || raw.qayerga || raw.target || '').toLowerCase();

  if (rawFrom.includes('kotta') || rawFrom.includes('katta')) from = 'kotta';
  if (rawTo.includes('tepa')) to = 'tepa';

  return {
    id,
    vaqt,
    sana,
    model,
    olcham,
    soni: isNaN(soni) ? 0 : soni,
    from,
    to,
    izoh: String(raw.izoh || raw.note || raw.comment || ''),
    qaytibKelganSoni: raw.qaytibKelganSoni ? Number(raw.qaytibKelganSoni) : undefined,
    groupId: raw.groupId ? String(raw.groupId) : undefined
  };
};

/**
 * Normalizes Kassa Harakati record.
 */
export const normalizeKassaHarakati = (raw: any): KassaHarakati | null => {
  if (!raw || typeof raw !== 'object') return null;
  const summa = Number(raw.summa ?? raw.amount ?? raw.total ?? 0);
  if (isNaN(summa) || summa === 0) return null;

  const id = raw.id ? String(raw.id) : `kassa-${generateId()}`;
  const vaqt = normalizeTime(raw.vaqt || raw.time || raw.createdAt);
  const sana = normalizeDate(raw.sana || raw.date || raw.createdAt);
  const tur = String(raw.tur || raw.type || '').toLowerCase().includes('chiqim') ? 'chiqim' : 'kirim';
  const valyuta = String(raw.valyuta || raw.currency || 'UZS').toUpperCase() === 'USD' ? 'USD' : 'UZS';
  const kurs = Number(raw.kurs || 12850);
  const summaUzs = Number(raw.summaUzs || (valyuta === 'USD' ? summa * kurs : summa));
  const kassaTuri: KassaTuri = raw.kassaTuri || (valyuta === 'USD' ? 'naqd_usd' : 'naqd_uzs');

  return {
    id,
    vaqt,
    sana,
    tur,
    kategoriya: raw.kategoriya || (tur === 'kirim' ? 'savdo_tushumi' : 'boshqa'),
    summa,
    valyuta,
    kurs,
    summaUzs,
    kassaTuri,
    kimgaKimdan: String(raw.kimgaKimdan || raw.partner || raw.client || raw.mijoz || ''),
    izoh: String(raw.izoh || raw.note || raw.comment || ''),
    xodim: String(raw.xodim || raw.user || 'Admin'),
    boglanishId: raw.boglanishId ? String(raw.boglanishId) : undefined
  };
};

/**
 * Normalizes stock data format into `{ [model]: { [olcham]: count } }`.
 */
export const normalizeStockObject = (rawStock: any): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {};
  if (!rawStock || typeof rawStock !== 'object') return result;

  // Case A: rawStock is already `{ [model]: { [size]: count } }`
  if (!Array.isArray(rawStock)) {
    for (const modelKey of Object.keys(rawStock)) {
      const cleanModel = String(modelKey).replace(/[#$/\[\]]/g, '').trim();
      const sizesObj = rawStock[modelKey];
      if (sizesObj && typeof sizesObj === 'object') {
        result[cleanModel] = result[cleanModel] || {};
        for (const sizeKey of Object.keys(sizesObj)) {
          const cleanSize = String(sizeKey).replace(/[#$/\[\]]/g, '').trim();
          const count = Number(sizesObj[sizeKey]);
          if (!isNaN(count) && count > 0) {
            result[cleanModel][cleanSize] = Math.max(0, (result[cleanModel][cleanSize] || 0) + count);
          }
        }
      }
    }
    return result;
  }

  // Case B: rawStock is array `[{ model, olcham, soni }, ...]`
  for (const item of rawStock) {
    if (item && typeof item === 'object') {
      const model = String(item.model || item.modelName || item.nomi || '').trim();
      const size = String(item.olcham || item.size || item.razmer || '39').trim();
      const count = Number(item.soni ?? item.count ?? item.qty ?? 0);
      if (model && !isNaN(count) && count > 0) {
        result[model] = result[model] || {};
        result[model][size] = Math.max(0, (result[model][size] || 0) + count);
      }
    }
  }

  return result;
};

/**
 * Helper to deduplicate transactions by ID and contents.
 */
export const mergeTransactionsDeduplicated = (existing: Transaction[], incoming: Transaction[]): Transaction[] => {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const merged: Transaction[] = [];

  const add = (t: Transaction) => {
    if (!t || !t.model) return;
    const sig = `${t.sana}_${t.vaqt}_${t.amal}_${t.model}_${t.olcham}_${t.soni}_${t.kimdan || ''}`;
    if (t.id && seenIds.has(t.id)) return;
    if (seenSignatures.has(sig)) return;
    if (t.id) seenIds.add(t.id);
    seenSignatures.add(sig);
    merged.push(t);
  };

  // Add incoming first or existing first? Keep existing, add incoming
  existing.forEach(add);
  incoming.forEach(add);

  // Sort by sana and vaqt descending (stable sort with id tie-breaker)
  return merged.sort(compareTxLatestFirst);
};

/**
 * Helper to deduplicate and merge Kontragentlar.
 */
export const mergeKontragentlarDeduplicated = (existing: Kontragent[], incoming: Kontragent[]): Kontragent[] => {
  const mapByName = new Map<string, Kontragent>();

  const process = (k: Kontragent) => {
    if (!k || !k.ism) return;
    const nameKey = k.ism.trim().toLowerCase();
    const prev = mapByName.get(nameKey);
    if (!prev) {
      mapByName.set(nameKey, { ...k });
    } else {
      // Merge best fields
      mapByName.set(nameKey, {
        ...prev,
        ...k,
        id: prev.id || k.id,
        tel: formatPhoneNumber(prev.tel || k.tel),
        manzil: prev.manzil || k.manzil,
        viloyat: k.viloyat || prev.viloyat,
        kategoriya: prev.kategoriya || k.kategoriya || 'Ulgurji',
        izoh: prev.izoh || k.izoh,
        jami: Math.max(prev.jami || 0, k.jami || 0),
        xaridlarSoni: Math.max(prev.xaridlarSoni || 0, k.xaridlarSoni || 0),
        balans: k.balans !== undefined && k.balans !== 0 ? k.balans : (prev.balans || 0),
        kreditLimiti: k.kreditLimiti || prev.kreditLimiti,
        birinchiXarid: prev.birinchiXarid || k.birinchiXarid,
        oxirgiXarid: k.oxirgiXarid || prev.oxirgiXarid,
        qoshilganSana: prev.qoshilganSana || k.qoshilganSana
      });
    }
  };

  existing.forEach(process);
  incoming.forEach(process);

  const result = Array.from(mapByName.values());
  const seenIds = new Set<string>();
  result.forEach((client, idx) => {
    if (!client.id || seenIds.has(client.id)) {
      client.id = `client_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2, 6)}`;
    }
    seenIds.add(client.id);
  });

  return result;
};

/**
 * Helper to merge two stock objects (Record<string, Record<string, number>>) safely
 */
export const mergeStockObjects = (
  baseStock: Record<string, Record<string, number>> = {}, 
  incomingStock: Record<string, Record<string, number>> = {}
): Record<string, Record<string, number>> => {
  const merged: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(baseStock || {}));

  if (!incomingStock || typeof incomingStock !== 'object') return merged;

  Object.entries(incomingStock).forEach(([model, sizes]) => {
    if (!merged[model]) {
      merged[model] = {};
    }
    if (sizes && typeof sizes === 'object') {
      Object.entries(sizes).forEach(([size, qty]) => {
        const val = Number(qty);
        if (!isNaN(val)) {
          merged[model][size] = val;
        }
      });
    }
  });

  return merged;
};

/**
 * Helper to deduplicate and merge Otkazmalar (transfers)
 */
export const mergeOtkazmalarDeduplicated = (existing: Otkazma[] = [], incoming: Otkazma[] = []): Otkazma[] => {
  const seen = new Set<string>();
  const merged: Otkazma[] = [];

  const add = (o: Otkazma) => {
    if (!o || !o.model) return;
    const sig = `${o.id || ''}_${o.vaqt || o.sana || ''}_${o.model}_${o.olcham}_${o.soni}_${o.from}_${o.to}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(o);
  };

  (incoming || []).forEach(add);
  (existing || []).forEach(add);

  return merged.sort((a, b) => {
    const sA = a?.sana || a?.vaqt || '';
    const sB = b?.sana || b?.vaqt || '';
    if (sB !== sA) return sB > sA ? -1 : 1;
    const vA = a?.vaqt || '';
    const vB = b?.vaqt || '';
    if (vB !== vA) return vB > vA ? -1 : 1;
    const idA = a?.id || '';
    const idB = b?.id || '';
    if (idB !== idA) return idB > idA ? -1 : 1;
    return 0;
  });
};

/**
 * Helper to deduplicate and merge Kassa Harakatlari
 */
export const mergeKassaDeduplicated = (existing: KassaHarakati[] = [], incoming: KassaHarakati[] = []): KassaHarakati[] => {
  const seen = new Set<string>();
  const merged: KassaHarakati[] = [];

  const add = (k: KassaHarakati) => {
    if (!k) return;
    const sig = `${k.id || ''}_${k.sana}_${k.vaqt}_${k.summa}_${k.tur}_${k.kassaTuri || ''}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(k);
  };

  (incoming || []).forEach(add);
  (existing || []).forEach(add);

  return merged.sort((a, b) => {
    const sA = a?.sana || '';
    const sB = b?.sana || '';
    if (sB !== sA) return sB > sA ? 1 : -1;
    const vA = a?.vaqt || '';
    const vB = b?.vaqt || '';
    if (vB !== vA) return vB > vA ? 1 : -1;
    const idA = a?.id || '';
    const idB = b?.id || '';
    if (idB !== idA) return idB > idA ? 1 : -1;
    return 0;
  });
};

/**
 * Helper to deduplicate and merge Vozvratlar
 */
export const mergeVozvratDeduplicated = (existing: VozvratItem[] = [], incoming: VozvratItem[] = []): VozvratItem[] => {
  const seen = new Set<string>();
  const merged: VozvratItem[] = [];

  const add = (v: VozvratItem) => {
    if (!v) return;
    const sig = `${v.id || ''}_${v.sana || ''}_${v.vaqt || ''}_${v.model || ''}_${v.jamiSoni || 0}_${v.ombor || ''}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(v);
  };

  (incoming || []).forEach(add);
  (existing || []).forEach(add);
  return merged;
};

/**
 * Helper to deduplicate and merge Braklar
 */
export const mergeBrakDeduplicated = (existing: BrakItem[] = [], incoming: BrakItem[] = []): BrakItem[] => {
  const seen = new Set<string>();
  const merged: BrakItem[] = [];

  const add = (b: BrakItem) => {
    if (!b) return;
    const sig = `${b.id || ''}_${b.sana || ''}_${b.vaqt || ''}_${b.model || ''}_${b.jamiSoni || 0}_${b.ombor || ''}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(b);
  };

  (incoming || []).forEach(add);
  (existing || []).forEach(add);
  return merged;
};

/**
 * Helper to fetch and merge all 3,300+ historical records directly from history_records/main in Firestore
 */
export async function restoreAllHistoricalRecordsFromCloud(currentDb: DbState): Promise<{
  updatedDb: DbState;
  recoveredCount: { tepa: number; kotta: number; sort2: number; otkazmalar: number };
}> {
  try {
    const histDocRef = doc(firestoreDb, 'history_records', 'main');
    const histSnap = await getDoc(histDocRef);
    if (!histSnap.exists()) {
      return { updatedDb: currentDb, recoveredCount: { tepa: 0, kotta: 0, sort2: 0, otkazmalar: 0 } };
    }

    const histData = histSnap.data();
    if (!histData) {
      return { updatedDb: currentDb, recoveredCount: { tepa: 0, kotta: 0, sort2: 0, otkazmalar: 0 } };
    }

    const rawTepa = normalizeToArray(histData.tepaTransactions || histData.tepa?.transactions);
    const normTepa: Transaction[] = [];
    rawTepa.forEach(r => normTepa.push(...extractTransactionsFromRaw(r)));

    const rawKotta = normalizeToArray(histData.kottaTransactions || histData.kotta?.transactions);
    const normKotta: Transaction[] = [];
    rawKotta.forEach(r => normKotta.push(...extractTransactionsFromRaw(r)));

    const rawSort2 = normalizeToArray(histData.sort2Transactions || histData.sort2?.transactions);
    const normSort2: Transaction[] = [];
    rawSort2.forEach(r => normSort2.push(...extractTransactionsFromRaw(r)));

    const rawOtk = normalizeToArray(histData.otkazmalar);
    const normOtk = rawOtk.map(normalizeOtkazma).filter(Boolean) as Otkazma[];

    const updatedDb: DbState = {
      ...currentDb,
      tepa: {
        ...currentDb.tepa,
        transactions: mergeTransactionsDeduplicated(currentDb.tepa?.transactions || [], normTepa)
      },
      kotta: {
        ...currentDb.kotta,
        transactions: mergeTransactionsDeduplicated(currentDb.kotta?.transactions || [], normKotta)
      },
      sort2: {
        ...currentDb.sort2,
        transactions: mergeTransactionsDeduplicated(currentDb.sort2?.transactions || [], normSort2)
      },
      otkazmalar: mergeOtkazmalarDeduplicated(currentDb.otkazmalar || [], normOtk)
    };

    return {
      updatedDb,
      recoveredCount: {
        tepa: normTepa.length,
        kotta: normKotta.length,
        sort2: normSort2.length,
        otkazmalar: normOtk.length
      }
    };
  } catch (e) {
    console.warn("restoreAllHistoricalRecordsFromCloud error:", e);
    return { updatedDb: currentDb, recoveredCount: { tepa: 0, kotta: 0, sort2: 0, otkazmalar: 0 } };
  }
}

/**
 * Comprehensive Multi-Source Scanner & Merger.
 * Searches across all possible legacy Firestore document locations and separate collections,
 * normalizes disparate key structures, merges data safely without duplicates, and returns the unified state.
 */
export async function scanAndMergeAllFirestoreSources(currentDb: DbState): Promise<{
  mergedDb: DbState;
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
}> {
  const details: string[] = [];
  let foundSourcesCount = 0;
  
  let tepaTransactions: Transaction[] = [...(currentDb.tepa?.transactions || [])];
  let kottaTransactions: Transaction[] = [...(currentDb.kotta?.transactions || [])];
  let sort2Transactions: Transaction[] = [...(currentDb.sort2?.transactions || [])];
  let kontragentlar: Kontragent[] = [...(currentDb.kontragentlar || [])];
  let otkazmalar: Otkazma[] = [...(currentDb.otkazmalar || [])];
  let kassaHarakatlari: KassaHarakati[] = [...(currentDb.kassaHarakatlari || [])];
  let vozvratlar: VozvratItem[] = [...(currentDb.vozvratlar || [])];
  let braklar: BrakItem[] = [...(currentDb.braklar || [])];
  let users: User[] = [...(currentDb.users || [])];
  let prices: Record<string, ModelPrice> = { ...(currentDb.prices || {}) };

  let tepaStock = normalizeStockObject(currentDb.tepa?.stock || {});
  let kottaStock = normalizeStockObject(currentDb.kotta?.stock || {});
  let sort2Stock = normalizeStockObject(currentDb.sort2?.stock || {});

  // 1. Scan all known document paths
  for (const { col, id } of LEGACY_DOC_PATHS) {
    try {
      const docRef = doc(firestoreDb, col, id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && typeof data === 'object') {
          foundSourcesCount++;
          details.push(`Hujjat topildi: ${col}/${id}`);

          // Extract tepa transactions (checks both app_db and history_records structures)
          const rawTepaTxs = normalizeToArray(data.tepa?.transactions || data.tepaTransactions || data.tepa_transactions || data.transactions_tepa || data.kirim_chiqim_tepa);
          const normTepaTxs: Transaction[] = [];
          rawTepaTxs.forEach(r => normTepaTxs.push(...extractTransactionsFromRaw(r)));
          if (normTepaTxs.length > 0) {
            tepaTransactions = mergeTransactionsDeduplicated(tepaTransactions, normTepaTxs);
          }

          // Extract kotta transactions (checks both app_db and history_records structures)
          const rawKottaTxs = normalizeToArray(data.kotta?.transactions || data.kottaTransactions || data.kotta_transactions || data.transactions_kotta || data.kirim_chiqim_kotta);
          const normKottaTxs: Transaction[] = [];
          rawKottaTxs.forEach(r => normKottaTxs.push(...extractTransactionsFromRaw(r)));
          if (normKottaTxs.length > 0) {
            kottaTransactions = mergeTransactionsDeduplicated(kottaTransactions, normKottaTxs);
          }

          // Extract sort2 transactions (checks both app_db and history_records structures)
          const rawSort2Txs = normalizeToArray(data.sort2?.transactions || data.sort2Transactions || data.sort2_transactions || data.transactions_sort2 || data.kirim_chiqim_sort2);
          const normSort2Txs: Transaction[] = [];
          rawSort2Txs.forEach(r => normSort2Txs.push(...extractTransactionsFromRaw(r)));
          if (normSort2Txs.length > 0) {
            sort2Transactions = mergeTransactionsDeduplicated(sort2Transactions, normSort2Txs);
          }

          // Extract general transactions if not separated by ombor
          const rawGeneralTxs = normalizeToArray(data.transactions || data.history || data.kirim_chiqim || data.tarix || data.operatsiyalar);
          if (rawGeneralTxs.length > 0) {
            for (const raw of rawGeneralTxs) {
              const extractedList = extractTransactionsFromRaw(raw);
              if (extractedList.length > 0) {
                const omborStr = String(raw.ombor || raw.warehouse || raw.qayerga || '').toLowerCase();
                if (omborStr.includes('sort2') || omborStr.includes('2-sort') || raw.sort === '2') {
                  sort2Transactions = mergeTransactionsDeduplicated(sort2Transactions, extractedList);
                } else if (omborStr.includes('kotta') || omborStr.includes('katta')) {
                  kottaTransactions = mergeTransactionsDeduplicated(kottaTransactions, extractedList);
                } else {
                  tepaTransactions = mergeTransactionsDeduplicated(tepaTransactions, extractedList);
                }
              }
            }
          }

          // Extract kontragentlar
          const rawKontragentlar = normalizeToArray(data.kontragentlar || data.mijozlar || data.clients || data.customers);
          const normKontragentlar = rawKontragentlar.map(normalizeKontragent).filter(Boolean) as Kontragent[];
          if (normKontragentlar.length > 0) {
            kontragentlar = mergeKontragentlarDeduplicated(kontragentlar, normKontragentlar);
          }

          // Extract otkazmalar
          const rawOtkazmalar = normalizeToArray(data.otkazmalar || data.otkazmalarTransactions || data.transfers);
          const normOtkazmalar = rawOtkazmalar.map(normalizeOtkazma).filter(Boolean) as Otkazma[];
          if (normOtkazmalar.length > 0) {
            otkazmalar = mergeOtkazmalarDeduplicated(otkazmalar, normOtkazmalar);
          }

          // Extract kassa
          const rawKassa = normalizeToArray(data.kassaHarakatlari || data.kassa_harakatlari || data.kassa || data.moliya);
          const normKassa = rawKassa.map(normalizeKassaHarakati).filter(Boolean) as KassaHarakati[];
          if (normKassa.length > 0) {
            kassaHarakatlari = mergeKassaDeduplicated(kassaHarakatlari, normKassa);
          }

          // Merge stock
          if (data.tepa?.stock) {
            const parsed = normalizeStockObject(data.tepa.stock);
            for (const m in parsed) {
              tepaStock[m] = tepaStock[m] || {};
              for (const s in parsed[m]) {
                tepaStock[m][s] = Math.max(tepaStock[m][s] || 0, parsed[m][s]);
              }
            }
          }

          if (data.kotta?.stock) {
            const parsed = normalizeStockObject(data.kotta.stock);
            for (const m in parsed) {
              kottaStock[m] = kottaStock[m] || {};
              for (const s in parsed[m]) {
                kottaStock[m][s] = Math.max(kottaStock[m][s] || 0, parsed[m][s]);
              }
            }
          }

          if (data.sort2?.stock) {
            const parsed = normalizeStockObject(data.sort2.stock);
            for (const m in parsed) {
              sort2Stock[m] = sort2Stock[m] || {};
              for (const s in parsed[m]) {
                sort2Stock[m][s] = Math.max(sort2Stock[m][s] || 0, parsed[m][s]);
              }
            }
          }

          // Merge prices
          if (data.prices && typeof data.prices === 'object') {
            for (const m in data.prices) {
              const cleanM = String(m).replace(/[#$/\[\]]/g, '').trim();
              if (typeof data.prices[m] === 'number') {
                prices[cleanM] = prices[cleanM] || { cost: 0, sale: data.prices[m], history: [] };
              } else if (data.prices[m] && typeof data.prices[m] === 'object') {
                prices[cleanM] = {
                  cost: Number(data.prices[m].cost || 0),
                  sale: Number(data.prices[m].sale || 0),
                  history: Array.isArray(data.prices[m].history) ? data.prices[m].history : []
                };
              }
            }
          }

          // Merge users
          const rawUsers = normalizeToArray(data.users || data.xodimlar);
          if (rawUsers.length > 0) {
            const existingUserPins = new Set(users.map(u => u.pin));
            rawUsers.forEach((u: any) => {
              if (u && u.ism && u.pin && !existingUserPins.has(u.pin)) {
                users.push({
                  id: u.id || `u-${generateId()}`,
                  ism: String(u.ism).trim(),
                  rol: u.rol === 'admin' ? 'admin' : 'omborchi',
                  pin: String(u.pin).slice(0, 4)
                });
                existingUserPins.add(u.pin);
              }
            });
          }
        }
      }
    } catch (e) {
      // Ignored non-existent documents
    }
  }

  // 2. Scan separate collections where each doc is an individual item
  for (const colName of LEGACY_COLLECTIONS) {
    try {
      const colRef = collection(firestoreDb, colName);
      const querySnapshot = await getDocs(colRef);
      
      if (!querySnapshot.empty) {
        foundSourcesCount++;
        details.push(`Collection topildi: ${colName} (${querySnapshot.size} ta hujjat)`);
        
        querySnapshot.forEach((docSnap) => {
          const rawData = docSnap.data();
          if (!rawData) return;
          const dataWithId = { id: docSnap.id, ...rawData };

          // A. Transactions / History Collections
          if (['transactions', 'history', 'history_records', 'kirim_chiqim', 'tarix', 'operatsiyalar', 'harakatlar'].includes(colName)) {
            const extractedList = extractTransactionsFromRaw(dataWithId);
            if (extractedList.length > 0) {
              const omborStr = String(rawData.ombor || rawData.warehouse || rawData.qayerga || '').toLowerCase();
              if (omborStr.includes('kotta') || omborStr.includes('katta')) {
                kottaTransactions = mergeTransactionsDeduplicated(kottaTransactions, extractedList);
              } else {
                tepaTransactions = mergeTransactionsDeduplicated(tepaTransactions, extractedList);
              }
            }
          }

          // B. Kontragentlar / Clients Collections
          if (['kontragentlar', 'mijozlar', 'clients', 'customers', 'partners'].includes(colName)) {
            const normClient = normalizeKontragent(dataWithId);
            if (normClient) {
              kontragentlar = mergeKontragentlarDeduplicated(kontragentlar, [normClient]);
            }
          }

          // C. Transfers Collections
          if (['otkazmalar', 'transfers'].includes(colName)) {
            const normOtk = normalizeOtkazma(dataWithId);
            if (normOtk) {
              const sig = `${normOtk.vaqt}_${normOtk.model}_${normOtk.olcham}_${normOtk.from}_${normOtk.to}`;
              if (!otkazmalar.some(o => `${o.vaqt}_${o.model}_${o.olcham}_${o.from}_${o.to}` === sig)) {
                otkazmalar.push(normOtk);
              }
            }
          }

          // D. Kassa Collections
          if (['kassa', 'kassaHarakatlari', 'kassa_harakatlari', 'moliya'].includes(colName)) {
            const normKassa = normalizeKassaHarakati(dataWithId);
            if (normKassa) {
              const sig = `${normKassa.sana}_${normKassa.vaqt}_${normKassa.summa}_${normKassa.tur}`;
              if (!kassaHarakatlari.some(k => `${k.sana}_${k.vaqt}_${k.summa}_${k.tur}` === sig)) {
                kassaHarakatlari.push(normKassa);
              }
            }
          }

          // E. Stock Collections
          if (['stock', 'qoldiqlar'].includes(colName)) {
            if (docSnap.id === 'tepa' || docSnap.id === 'kotta' || docSnap.id === 'sort2') {
              const parsed = normalizeStockObject(rawData);
              const target = docSnap.id === 'sort2' ? sort2Stock : (docSnap.id === 'kotta' ? kottaStock : tepaStock);
              for (const m in parsed) {
                target[m] = target[m] || {};
                for (const s in parsed[m]) {
                  target[m][s] = Math.max(target[m][s] || 0, parsed[m][s]);
                }
              }
            } else if (rawData.model && rawData.olcham) {
              const count = Number(rawData.soni ?? rawData.count ?? 0);
              const omborStr = String(rawData.ombor || '').toLowerCase();
              const ombor = omborStr.includes('sort2') || omborStr.includes('2-sort') ? sort2Stock : (omborStr.includes('kotta') ? kottaStock : tepaStock);
              ombor[rawData.model] = ombor[rawData.model] || {};
              ombor[rawData.model][rawData.olcham] = (ombor[rawData.model][rawData.olcham] || 0) + count;
            }
          }
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  // Filter out any default sample/mock initialization items
  tepaTransactions = tepaTransactions.filter(t => t && !t.id?.startsWith('init-'));
  kottaTransactions = kottaTransactions.filter(t => t && !t.id?.startsWith('init-'));
  sort2Transactions = sort2Transactions.filter(t => t && !t.id?.startsWith('init-'));
  otkazmalar = otkazmalar.filter(o => o && !o.id?.startsWith('otk-init-'));

  const countStockItems = (stock: Record<string, Record<string, number>>) => {
    return Object.values(stock).reduce((acc, sizes) => acc + Object.values(sizes).reduce((a, b) => a + b, 0), 0);
  };

  const mergedDb: DbState = {
    ...currentDb,
    tepa: {
      stock: tepaStock,
      transactions: tepaTransactions
    },
    kotta: {
      stock: kottaStock,
      transactions: kottaTransactions
    },
    sort2: {
      stock: sort2Stock,
      transactions: sort2Transactions
    },
    kontragentlar,
    otkazmalar,
    kassaHarakatlari,
    vozvratlar,
    braklar,
    users: users.length > 0 ? users : INITIAL_DB.users,
    prices: Object.keys(prices).length > 0 ? prices : currentDb.prices
  };

  const recoveredRecordsCount = {
    transactions: tepaTransactions.length + kottaTransactions.length + sort2Transactions.length,
    kontragentlar: kontragentlar.length,
    otkazmalar: otkazmalar.length,
    kassa: kassaHarakatlari.length,
    stockTepa: countStockItems(tepaStock),
    stockKotta: countStockItems(kottaStock),
    stockSort2: countStockItems(sort2Stock)
  };

  return {
    mergedDb,
    foundSourcesCount,
    recoveredRecordsCount,
    details
  };
}

/**
 * Executes an atomic Firestore transaction (`runTransaction`) to safely validate and update
 * inventory stock, preventing race conditions when multiple devices sell items simultaneously.
 */
export async function executeAtomicStockTransaction(
  updateFn: (transaction: any, docSnap: any) => Promise<void>
): Promise<boolean> {
  try {
    await runTransaction(firestoreDb, async (transaction) => {
      const docRef = doc(firestoreDb, 'app_db', 'main');
      const docSnap = await transaction.get(docRef);
      await updateFn(transaction, docSnap);
    });
    return true;
  } catch (error) {
    console.error("Atomic transaction error (Race Condition guard):", error);
    return false;
  }
}

/**
 * Migrates transactions and kassa data from legacy main document to sharded collections.
 */
export const migrateDataToCollections = async (db: DbState) => {
  console.log('[MIGRATION] Starting sharding migration...');
  
  // 1. Transactions migration
  const allTransactions = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])];
  for (const tx of allTransactions) {
    if (!tx.sana) continue;
    const [year, month] = tx.sana.split('-');
    const shard = `${year}-${month}`;
    const txRef = doc(firestoreDb, 'transactions', shard, tx.id);
    await setDoc(txRef, sanitizeForFirestore(tx));
  }

  // 2. Kassa migration
  const allKassa = db.kassaHarakatlari || [];
  for (const kh of allKassa) {
    if (!kh.sana) continue;
    const [year, month] = kh.sana.split('-');
    const shard = `${year}-${month}`;
    const kRef = doc(firestoreDb, `collections/kassa/${shard}`, kh.id);
    await setDoc(kRef, sanitizeForFirestore(kh));
  }

  console.log('[MIGRATION] Sharding migration completed successfully.');
};
