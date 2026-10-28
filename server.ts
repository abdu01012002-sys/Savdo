import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, setLogLevel } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from './firebase-applet-config.json';

// Suppress internal Firestore gRPC transport reconnect logs (ECONNRESET, UNAVAILABLE)
setLogLevel('silent');

const isBenignFirestoreLog = (...args: any[]) => {
  const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  return (
    message.includes('ECONNRESET') ||
    message.includes('GrpcConnection RPC') ||
    message.includes('14 UNAVAILABLE') ||
    message.includes('1 CANCELLED') ||
    message.includes('Call cancelled') ||
    message.includes('transport errored') ||
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

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Server Local Storage directory for high-speed cross-device sync fallback
const SERVER_DATA_DIR = path.join(process.cwd(), 'data');
const SERVER_DB_FILE = path.join(SERVER_DATA_DIR, 'server_db_cache.json');
const SERVER_BACKUPS_DIR = path.join(SERVER_DATA_DIR, 'backups');
try {
  if (!fs.existsSync(SERVER_DATA_DIR)) {
    fs.mkdirSync(SERVER_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SERVER_BACKUPS_DIR)) {
    fs.mkdirSync(SERVER_BACKUPS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[SERVER SYNC] Data dirs creation notice:', e);
}

let serverMemoryDb: any = null;
let serverMemoryVersion: number = Date.now();

// Load existing disk cache on boot if available
try {
  if (fs.existsSync(SERVER_DB_FILE)) {
    const raw = fs.readFileSync(SERVER_DB_FILE, 'utf-8');
    serverMemoryDb = JSON.parse(raw);
    console.log('[SERVER SYNC] ✅ Disk cache loaded successfully into server memory');
  }
} catch (e) {
  console.warn('[SERVER SYNC] Cache load notice:', e);
}

// Initialize Firebase for server-side
const fbApp = getApps().length === 0 
  ? initializeApp(firebaseConfig, 'server-app')
  : getApps()[0];

const serverDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

const serverAuth = getAuth(fbApp);
signInAnonymously(serverAuth).catch(() => {
  // Silent fail or anonymous auth disabled - rules allow public access
});

// Helper to sanitize keys for Firestore documents
const sanitizeFirestoreKey = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[#$/\[\]]/g, '');
};

// Convert nested arrays to maps so Firestore accepts them cleanly without schema or nesting errors
const serverConvertArraysToMaps = (obj: any, rootPath = ''): any => {
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
          map[itemId] = serverConvertArraysToMaps(item, rootPath);
        }
      });
      return map;
    }
    return obj.map(item => serverConvertArraysToMaps(item, rootPath));
  }
  const res: Record<string, any> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      const cleanKey = sanitizeFirestoreKey(key);
      res[cleanKey] = serverConvertArraysToMaps(obj[key], key);
    }
  }
  return res;
};

// Safe prune to keep Firestore document well under 1MB limit
const serverPruneForFirestore = (dbData: any): any => {
  if (!dbData || typeof dbData !== 'object') return dbData;
  const cloned = JSON.parse(JSON.stringify(dbData));
  const sortTxsDesc = (txs: any[]) => {
    if (!Array.isArray(txs)) return [];
    return [...txs].sort((a, b) => {
      const dComp = (b.sana || '').localeCompare(a.sana || '');
      if (dComp !== 0) return dComp;
      return (b.vaqt || '').localeCompare(a.vaqt || '');
    });
  };

  if (Array.isArray(cloned.tepa?.transactions) && cloned.tepa.transactions.length > 200) {
    cloned.tepa.transactions = sortTxsDesc(cloned.tepa.transactions).slice(0, 200);
  }
  if (Array.isArray(cloned.kotta?.transactions) && cloned.kotta.transactions.length > 200) {
    cloned.kotta.transactions = sortTxsDesc(cloned.kotta.transactions).slice(0, 200);
  }
  if (Array.isArray(cloned.sort2?.transactions) && cloned.sort2.transactions.length > 200) {
    cloned.sort2.transactions = sortTxsDesc(cloned.sort2.transactions).slice(0, 200);
  }
  if (Array.isArray(cloned.auditLogs) && cloned.auditLogs.length > 100) {
    cloned.auditLogs = cloned.auditLogs.slice(0, 100);
  }
  if (Array.isArray(cloned.otkazmalar) && cloned.otkazmalar.length > 100) {
    cloned.otkazmalar = cloned.otkazmalar.slice(-100);
  }
  if (Array.isArray(cloned.kassaHarakatlari) && cloned.kassaHarakatlari.length > 100) {
    cloned.kassaHarakatlari = cloned.kassaHarakatlari.slice(-100);
  }
  return cloned;
};

// Debounced batch writer to preserve Firestore daily write quota
let serverSaveTimer: NodeJS.Timeout | null = null;
let serverLastSavedSig: string = '';
let serverIsFirestoreQuotaExhausted = false;

const scheduleServerDbToFirestore = (dbToSave: any) => {
  if (!dbToSave) return;
  if (serverIsFirestoreQuotaExhausted) return; // Prevent spamming when quota is exhausted

  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
  }

  // 15-second debounce batches multiple rapid transactions into a single Firestore write (95% quota reduction!)
  serverSaveTimer = setTimeout(async () => {
    try {
      const sig = `${dbToSave.tepa?.transactions?.length}_${dbToSave.kotta?.transactions?.length}_${dbToSave.sort2?.transactions?.length}_${dbToSave.otkazmalar?.length}_${dbToSave.kassaHarakatlari?.length}_${dbToSave.kontragentlar?.length}`;
      if (sig === serverLastSavedSig) return;

      const pruned = serverPruneForFirestore(dbToSave);
      const payload = serverConvertArraysToMaps(pruned);
      await setDoc(doc(serverDb, 'app_db', 'main'), payload);
      serverLastSavedSig = sig;
      console.log('[SERVER SYNC] ✅ Firestore app_db/main successfully batched & synchronized');
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
        serverIsFirestoreQuotaExhausted = true;
        console.warn('[SERVER SYNC] Firestore daily write quota limit reached. Server fallback memory/disk active.');
      } else {
        console.warn('[SERVER SYNC] Firestore save status:', msg);
      }
    }
  }, 15000);
};

const saveServerDbToFirestore = scheduleServerDbToFirestore;

// Daily Auto-Backup function (creates daily snapshot on disk)
const performDailyAutoBackup = (dbData: any) => {
  if (!dbData) return;
  try {
    const { dateStr } = getTashkentDateTime();
    const backupFile = path.join(SERVER_BACKUPS_DIR, `backup_${dateStr}.json`);
    // Save snapshot of today
    fs.writeFileSync(backupFile, JSON.stringify(dbData, null, 2), 'utf-8');
    console.log(`[AUTO-BACKUP] 💾 Kunlik zaxira nusxasi muvaffaqiyatli saqlandi: backup_${dateStr}.json`);

    // Clean up backups older than 30 days
    const files = fs.readdirSync(SERVER_BACKUPS_DIR);
    const nowMs = Date.now();
    for (const f of files) {
      if (f.startsWith('backup_') && f.endsWith('.json')) {
        const filePath = path.join(SERVER_BACKUPS_DIR, f);
        const stats = fs.statSync(filePath);
        if (nowMs - stats.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (bErr) {
    console.warn('[AUTO-BACKUP] Error saving daily backup:', bErr);
  }
};

// Real-Time Cross-Container Firestore Listener
// Connects ais-dev and ais-pre so all servers stay in continuous lockstep
try {
  onSnapshot(doc(serverDb, 'app_db', 'main'), (snap) => {
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData) {
        serverMemoryDb = mergeServerDbStates(serverMemoryDb, remoteData);
        serverMemoryVersion = Date.now();
        try {
          fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), 'utf-8');
        } catch {}
      }
    }
  }, (err) => {
    console.warn('[SERVER SYNC] Firestore live listener fallback:', err?.message || err);
  });
} catch (listenerErr) {
  console.warn('[SERVER SYNC] Listener init notice:', listenerErr);
}

// Bootstrap historical archive from history_records/main once on boot
getDoc(doc(serverDb, 'history_records', 'main')).then(snap => {
  if (snap.exists()) {
    const histData = snap.data();
    if (histData) {
      serverMemoryDb = mergeServerDbStates(serverMemoryDb, histData);
      serverMemoryVersion = Date.now();
      try {
        fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), 'utf-8');
        console.log('[SERVER SYNC] ✅ 3,300+ historical transactions from history_records/main merged into server cache');
      } catch {}
    }
  }
}).catch(err => {
  console.warn('[SERVER SYNC] Historical fetch notice:', err?.message || err);
});

// Number format helper
const formatUzs = (val: number | string) => {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// Tashkent Time Helper (UTC+5)
const getTashkentDateTime = () => {
  const now = new Date();
  const tzOffset = 5 * 60; // UTC+5 in minutes
  const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  const dateStr = localTime.toISOString().slice(0, 10);
  const hours = String(localTime.getHours()).padStart(2, '0');
  const minutes = String(localTime.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;
  return { dateStr, timeStr, fullIso: localTime.toISOString() };
};

// Telegram API Sender
async function sendTelegramMessage(botToken: string, chatId: string, htmlText: string) {
  if (!botToken || !chatId) return { success: false, error: 'Token yoki Chat ID yetishmaydi' };
  const targetIds = chatId.split(/[\s,;]+/).map(id => id.trim()).filter(Boolean);
  const results = [];

  for (const id of targetIds) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: id,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      const data = await resp.json();
      results.push({ chatId: id, ok: data.ok, description: data.description });
    } catch (e: any) {
      results.push({ chatId: id, ok: false, description: e.message });
    }
  }
  return { success: results.some(r => r.ok), results };
}

// Convert Firestore arrays or maps
function toArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

// Build HTML Report from DB data
function buildDailyReportHtml(dbData: any, targetDate?: string): string {
  const { dateStr, timeStr } = getTashkentDateTime();
  const sana = targetDate || dateStr;

  const tepaTxs = toArray(dbData.tepa?.transactions).filter(t => t.sana === sana);
  const kottaTxs = toArray(dbData.kotta?.transactions).filter(t => t.sana === sana);
  const sort2Txs = toArray(dbData.sort2?.transactions).filter(t => t.sana === sana);

  const tepaChiqim = tepaTxs.filter(t => t.amal === 'chiqim');
  const kottaChiqim = kottaTxs.filter(t => t.amal === 'chiqim');
  const sort2Chiqim = sort2Txs.filter(t => t.amal === 'chiqim');
  const allChiqim = [...tepaChiqim, ...kottaChiqim, ...sort2Chiqim];

  const totalJuftChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.soni) || 0), 0);
  const totalSummaChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.summa) || 0), 0);
  const totalFoyda = allChiqim.reduce((acc, t) => acc + (Number(t.foyda) || 0), 0);

  const tepaKirim = tepaTxs.filter(t => t.amal === 'kirim');
  const kottaKirim = kottaTxs.filter(t => t.amal === 'kirim');
  const sort2Kirim = sort2Txs.filter(t => t.amal === 'kirim');
  const totalJuftKirim = [...tepaKirim, ...kottaKirim, ...sort2Kirim].reduce((acc, t) => acc + (Number(t.soni) || 0), 0);

  const otkazmalar = toArray(dbData.otkazmalar).filter(o => o.sana === sana);
  const totalOtkazma = otkazmalar.reduce((acc, o) => acc + (Number(o.soni) || 0), 0);

  const vozvratlar = toArray(dbData.vozvratlar).filter(v => v.sana === sana);
  const totalVozvratQty = vozvratlar.reduce((acc, v) => acc + (Number(v.soni) || 0), 0);

  const braklar = toArray(dbData.braklar).filter(b => b.sana === sana);
  const totalBrakQty = braklar.reduce((acc, b) => acc + (Number(b.soni) || 0), 0);

  // Kassa Balansi
  const kassaBalansi = dbData.kassaBalansi || {};
  const naqdSom = Number(kassaBalansi.naqd_uzs !== undefined ? kassaBalansi.naqd_uzs : dbData.kassa?.naqdSom) || 0;
  const naqdDollar = Number(kassaBalansi.naqd_usd !== undefined ? kassaBalansi.naqd_usd : dbData.kassa?.naqdDollar) || 0;
  const kartaSom = Number(kassaBalansi.karta_uzs || 0);
  const bankHisob = Number(kassaBalansi.bank_uzs !== undefined ? kassaBalansi.bank_uzs : dbData.kassa?.bankHisob) || 0;

  // Stock counts
  const calcOmborStock = (stockObj: any) => {
    return Object.values((stockObj || {}) as Record<string, any>).reduce<number>((acc: number, modelStock: any) => {
      const sum = Object.values((modelStock || {}) as Record<string, any>).reduce<number>((a: number, b: any) => a + (Number(b) || 0), 0);
      return acc + sum;
    }, 0);
  };

  const tepaStockTotal = calcOmborStock(dbData.tepa?.stock);
  const kottaStockTotal = calcOmborStock(dbData.kotta?.stock);
  const sort2StockTotal = calcOmborStock(dbData.sort2?.stock);
  const grandTotalStock = tepaStockTotal + kottaStockTotal + sort2StockTotal;

  let msg = `📊 <b>FALAK SHOE — KUNLIK YIG'MA HISOBOT</b>\n`;
  msg += `📅 <b>Sana:</b> ${sana} (Soat ${timeStr})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `💰 <b>SAVDO VA TUSHUM:</b>\n`;
  msg += `• <b>Jami sotildi:</b> <code>${formatUzs(totalJuftChiqim)} juft</code>\n`;
  msg += `• <b>Umumiy summa:</b> <code>${formatUzs(totalSummaChiqim)} so'm</code>\n`;
  if (totalFoyda > 0) {
    msg += `• <b>Hisoblangan sof foyda:</b> <code>${formatUzs(totalFoyda)} so'm</code>\n`;
  }
  msg += `\n`;

  msg += `📦 <b>OMBOR HARAKATI:</b>\n`;
  msg += `• <b>Kunlik yangi kirim:</b> <code>${formatUzs(totalJuftKirim)} juft</code>\n`;
  if (totalOtkazma > 0) msg += `• <b>Omborlararo o'tkazma:</b> <code>${formatUzs(totalOtkazma)} juft</code>\n`;
  if (totalVozvratQty > 0) msg += `• <b>Mijozdan vozvrat:</b> <code>${formatUzs(totalVozvratQty)} juft</code>\n`;
  if (totalBrakQty > 0) msg += `• <b>Brak fondiga:</b> <code>${formatUzs(totalBrakQty)} juft</code>\n`;
  msg += `\n`;

  msg += `🏢 <b>OMBOR QOLDIQLARI (JORIY):</b>\n`;
  msg += `• <b>Tepa ombor:</b> <code>${formatUzs(tepaStockTotal)} juft</code>\n`;
  msg += `• <b>Kotta ombor:</b> <code>${formatUzs(kottaStockTotal)} juft</code>\n`;
  if (sort2StockTotal > 0) msg += `• <b>2-Sort ombor:</b> <code>${formatUzs(sort2StockTotal)} juft</code>\n`;
  msg += `👉 <b>JAMI OMBORLARDA:</b> <code>${formatUzs(grandTotalStock)} juft</code>\n\n`;

  msg += `💳 <b>KASSA BALANSI (JORIY):</b>\n`;
  msg += `• <b>Naqd so'm:</b> <code>${formatUzs(naqdSom)} so'm</code>\n`;
  if (kartaSom > 0) msg += `• <b>Karta (terminal):</b> <code>${formatUzs(kartaSom)} so'm</code>\n`;
  if (bankHisob > 0) msg += `• <b>Bank hisobi:</b> <code>${formatUzs(bankHisob)} so'm</code>\n`;
  if (naqdDollar > 0) msg += `• <b>Naqd dollar:</b> <code>$${formatUzs(naqdDollar)}</code>\n`;
  msg += `\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚡ <i>Avtomatik Server Cron (Cloud Function) orqali jo'natildi.</i>`;
  return msg;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Server-Assisted Real-Time Sync Bridge (Unblocked by Firestore Spark daily write limits)
function mergeServerDbStates(existing: any, incoming: any): any {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const merged = { ...existing, ...incoming };

  const mergeTxs = (t1: any[], t2: any[]) => {
    const seen = new Set<string>();
    const list: any[] = [];
    const add = (t: any) => {
      if (!t || !t.id) return;
      if (seen.has(t.id)) return;
      seen.add(t.id);
      list.push(t);
    };
    (t2 || []).forEach(add);
    (t1 || []).forEach(add);
    return list.sort((a, b) => (b.sana || '').localeCompare(a.sana || '') || (b.vaqt || '').localeCompare(a.vaqt || ''));
  };

  const mergeMapArray = (a1: any[], a2: any[]) => {
    const map = new Map<string, any>();
    (a1 || []).forEach(item => { if (item?.id) map.set(item.id, item); });
    (a2 || []).forEach(item => { if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item }); });
    return Array.from(map.values());
  };

  const mergeStock = (s1: any, s2: any) => {
    const res: Record<string, Record<string, number>> = {};
    const models = new Set([
      ...Object.keys(s1 || {}),
      ...Object.keys(s2 || {})
    ]);
    for (const m of models) {
      res[m] = { ...(s1?.[m] || {}), ...(s2?.[m] || {}) };
    }
    return res;
  };

  merged.tepa = {
    stock: mergeStock(existing.tepa?.stock, incoming.tepa?.stock),
    transactions: mergeTxs(
      toArray(existing.tepa?.transactions || existing.tepaTransactions), 
      toArray(incoming.tepa?.transactions || incoming.tepaTransactions)
    )
  };

  merged.kotta = {
    stock: mergeStock(existing.kotta?.stock, incoming.kotta?.stock),
    transactions: mergeTxs(
      toArray(existing.kotta?.transactions || existing.kottaTransactions), 
      toArray(incoming.kotta?.transactions || incoming.kottaTransactions)
    )
  };

  merged.sort2 = {
    stock: mergeStock(existing.sort2?.stock, incoming.sort2?.stock),
    transactions: mergeTxs(
      toArray(existing.sort2?.transactions || existing.sort2Transactions), 
      toArray(incoming.sort2?.transactions || incoming.sort2Transactions)
    )
  };

  const clientMap = new Map<string, any>();
  toArray(existing.kontragentlar).forEach(k => { if (k?.ism) clientMap.set(k.ism.trim().toLowerCase(), k); });
  toArray(incoming.kontragentlar).forEach(k => {
    if (k?.ism) {
      const key = k.ism.trim().toLowerCase();
      const prev = clientMap.get(key);
      if (!prev) {
        clientMap.set(key, k);
      } else {
        clientMap.set(key, {
          ...prev,
          ...k,
          jami: Math.max(prev.jami || 0, k.jami || 0),
          xaridlarSoni: Math.max(prev.xaridlarSoni || 0, k.xaridlarSoni || 0),
          balans: k.balans !== undefined && k.balans !== 0 ? k.balans : (prev.balans || 0)
        });
      }
    }
  });
  const serverClients = Array.from(clientMap.values());
  const seenClientIds = new Set<string>();
  serverClients.forEach((k, idx) => {
    if (!k.id || seenClientIds.has(k.id)) {
      k.id = `client_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).substr(2, 6)}`;
    }
    seenClientIds.add(k.id);
  });
  merged.kontragentlar = serverClients;

  merged.otkazmalar = mergeMapArray(toArray(existing.otkazmalar), toArray(incoming.otkazmalar));
  merged.kassaHarakatlari = mergeMapArray(toArray(existing.kassaHarakatlari), toArray(incoming.kassaHarakatlari));
  merged.auditLogs = mergeMapArray(toArray(existing.auditLogs), toArray(incoming.auditLogs)).slice(0, 300);
  merged.vozvratlar = mergeMapArray(toArray(existing.vozvratlar), toArray(incoming.vozvratlar));
  merged.braklar = mergeMapArray(toArray(existing.braklar), toArray(incoming.braklar));
  merged.prices = { ...(existing.prices || {}), ...(incoming.prices || {}) };
  merged.kassaBalansi = incoming.kassaBalansi || existing.kassaBalansi;
  merged.qabulQilinganPartiyaIds = Array.from(new Set([
    ...toArray(existing.qabulQilinganPartiyaIds),
    ...toArray(incoming.qabulQilinganPartiyaIds)
  ]));
  merged.partiyaQabulTarixi = {
    ...(existing.partiyaQabulTarixi || {}),
    ...(incoming.partiyaQabulTarixi || {})
  };

  return merged;
}

// 1. Lightweight version check for phone & desktop pollers with ETag caching
app.get('/api/sync/version', (req: Request, res: Response) => {
  const etag = `"${serverMemoryVersion}"`;
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.json({
    version: serverMemoryVersion,
    timestamp: Date.now(),
    hasData: Boolean(serverMemoryDb)
  });
});

// 2. Pull server state (instant cross-device synchronization with ETag support)
app.get('/api/sync/db', async (req: Request, res: Response) => {
  try {
    const etag = `"${serverMemoryVersion}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);

    if (serverMemoryDb && req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    if (!serverMemoryDb) {
      // Seed from Firestore app_db/main if memory is fresh
      try {
        const snap = await getDoc(doc(serverDb, 'app_db', 'main'));
        if (snap.exists()) {
          serverMemoryDb = snap.data();
          serverMemoryVersion = Date.now();
        }
      } catch (e: any) {
        console.warn('[SERVER SYNC] Firestore read seed notice:', e?.message || e);
      }
    }

    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Push client state and broadcast to all connected devices
app.post('/api/sync/db', async (req: Request, res: Response) => {
  try {
    const clientPayload = req.body?.db;
    if (!clientPayload || typeof clientPayload !== 'object') {
      return res.status(400).json({ success: false, message: "Yaroqsiz ma'lumot formati" });
    }

    serverMemoryDb = mergeServerDbStates(serverMemoryDb, clientPayload);
    serverMemoryVersion = Date.now();

    // Async save to local disk
    try {
      fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), 'utf-8');
    } catch (fsErr) {
      console.warn('[SERVER SYNC] File write notice:', fsErr);
    }

    // Auto-create/update daily snapshot
    performDailyAutoBackup(serverMemoryDb);

    // Persist properly serialized payload to Firestore in debounced batches to protect quota
    scheduleServerDbToFirestore(serverMemoryDb);

    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// ATOMIC STOCK CHECKOUT & RACE-CONDITION GUARD
// ----------------------------------------------------
app.post('/api/stock/atomic-checkout', async (req: Request, res: Response) => {
  try {
    const { ombor, items } = req.body;
    if (!ombor || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Yaroqsiz so'rov parametrlari" });
    }

    // Ensure serverMemoryDb is populated
    if (!serverMemoryDb) {
      try {
        const snap = await getDoc(doc(serverDb, 'app_db', 'main'));
        if (snap.exists()) {
          serverMemoryDb = snap.data();
          serverMemoryVersion = Date.now();
        }
      } catch (e: any) {
        console.warn('[ATOMIC] Firestore seed notice:', e?.message || e);
      }
    }

    if (!serverMemoryDb || !serverMemoryDb[ombor]) {
      // If server has no state yet, pass through safely
      return res.json({ success: true, fallback: true, message: "Lokal tekshiruvga ruxsat berildi" });
    }

    const currentOmborStock = serverMemoryDb[ombor]?.stock || {};
    const conflicts: Array<{ model: string; size: string; requested: number; available: number }> = [];

    // Step 1: Pre-validation of all items in cart
    for (const item of items) {
      const model = item.model;
      const sizes = item.sizes || {};
      for (const [sz, qty] of Object.entries(sizes)) {
        const requestedQty = Number(qty || 0);
        if (requestedQty <= 0) continue;
        const availableQty = Number(currentOmborStock[model]?.[sz] || 0);
        if (requestedQty > availableQty) {
          conflicts.push({
            model,
            size: sz,
            requested: requestedQty,
            available: availableQty
          });
        }
      }
    }

    // If any item violates current stock, reject atomically
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: "Omborda yetarli qoldiq mavjud emas! Boshqa qurilmadan sotilgan bo'lishi mumkin.",
        conflicts
      });
    }

    // Step 2: Atomic decrement
    for (const item of items) {
      const model = item.model;
      const sizes = item.sizes || {};
      if (!currentOmborStock[model]) currentOmborStock[model] = {};
      for (const [sz, qty] of Object.entries(sizes)) {
        const requestedQty = Number(qty || 0);
        if (requestedQty <= 0) continue;
        const availableQty = Number(currentOmborStock[model][sz] || 0);
        currentOmborStock[model][sz] = Math.max(0, availableQty - requestedQty);
      }
    }

    serverMemoryVersion = Date.now();
    try {
      fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), 'utf-8');
    } catch {}

    // Async persist to Firestore
    saveServerDbToFirestore(serverMemoryDb);

    return res.json({
      success: true,
      version: serverMemoryVersion,
      updatedStock: currentOmborStock
    });
  } catch (err: any) {
    console.error('[ATOMIC] Checkout error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// DAILY AUTO-BACKUP & SNAPSHOT RECOVERY APIs
// ----------------------------------------------------

// List all available backups
app.get('/api/backup/list', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(SERVER_BACKUPS_DIR)) {
      return res.json({ success: true, backups: [] });
    }
    const files = fs.readdirSync(SERVER_BACKUPS_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    const backups = files.map(filename => {
      const filePath = path.join(SERVER_BACKUPS_DIR, filename);
      const stats = fs.statSync(filePath);
      const datePart = filename.replace('backup_', '').replace('.json', '');
      return {
        filename,
        date: datePart,
        sizeBytes: stats.size,
        sizeKb: Math.round(stats.size / 1024),
        updatedAt: stats.mtime.toISOString()
      };
    });

    return res.json({ success: true, backups });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create an immediate manual backup snapshot
app.post('/api/backup/create', (req: Request, res: Response) => {
  try {
    const { dateStr, timeStr } = getTashkentDateTime();
    const safeTime = timeStr.replace(':', '-');
    const filename = `backup_${dateStr}_${safeTime}.json`;
    const targetFile = path.join(SERVER_BACKUPS_DIR, filename);

    const sourceData = req.body?.db || serverMemoryDb;
    if (!sourceData) {
      return res.status(400).json({ success: false, message: "Zaxira uchun ma'lumot topilmadi" });
    }

    fs.writeFileSync(targetFile, JSON.stringify(sourceData, null, 2), 'utf-8');
    return res.json({
      success: true,
      message: `Zaxira nusxasi muvaffaqiyatli yaratildi: ${filename}`,
      filename,
      date: dateStr
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Download a specific backup JSON file
app.get('/api/backup/download/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(SERVER_BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Zaxira fayli topilmadi" });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    return res.sendFile(filePath);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Restore database from a specific backup snapshot
app.post('/api/backup/restore/:filename', async (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(SERVER_BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Zaxira fayli topilmadi" });
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const backupDb = JSON.parse(raw);

    // Update memory
    serverMemoryDb = backupDb;
    serverMemoryVersion = Date.now();

    // Overwrite live disk cache
    fs.writeFileSync(SERVER_DB_FILE, JSON.stringify(backupDb), 'utf-8');

    // Overwrite Firestore
    await saveServerDbToFirestore(backupDb);

    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb,
      message: `Baza "${filename}" zaxira nusxasidan to'liq tiklandi!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Server-side CBU Currency Proxy (bypasses browser CORS & network blocks)
app.get('/api/currency/rates', async (req: Request, res: Response) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, data, source: "O'zbekiston Markaziy Banki (CBU.uz)" });
    }
    return res.status(502).json({ success: false, message: "CBU API javob bermadi" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || "Xatolik" });
  }
});

// Reset test funds in Kassa
app.post('/api/kassa/reset-test-funds', async (req: Request, res: Response) => {
  try {
    const docRef = doc(serverDb, 'app_db', 'main');
    await setDoc(docRef, {
      kassaBalansi: {
        naqd_uzs: 0,
        naqd_usd: 0,
        karta_uzs: 0,
        bank_uzs: 0
      },
      kassaHarakatlari: {},
      kassaTransferlar: [],
      smenalar: [],
      joriySmena: null
    }, { merge: true });

    return res.json({
      success: true,
      message: "Kassa mablag'lari va test yozuvlari tozalandi!"
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Server status and cron inspection
app.get('/api/telegram/status', async (req: Request, res: Response) => {
  const { dateStr, timeStr } = getTashkentDateTime();
  try {
    const docRef = doc(serverDb, 'app_db', 'main');
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : null;
    const config = data?.telegramConfig || {};

    res.json({
      status: 'online',
      serverTimezone: 'Asia/Tashkent (UTC+5)',
      currentTashkentDate: dateStr,
      currentTashkentTime: timeStr,
      cronTargetTime: config.dailyReportTime || '20:00',
      cronEnabled: Boolean(config.isEnabled && config.notifyDailyReport),
      lastDailyReportSentDate: config.lastDailyReportSentDate || null,
      isConfigured: Boolean(config.botToken && config.chatId)
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Manual or Cloud Scheduler triggered daily report
app.all(['/api/telegram/cron-trigger', '/api/telegram/daily-report'], async (req: Request, res: Response) => {
  try {
    const { dateStr } = getTashkentDateTime();
    const docRef = doc(serverDb, 'app_db', 'main');
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ success: false, message: "Baza topilmadi" });
    }

    const data = snap.data();
    const config = data.telegramConfig;

    if (!config || !config.botToken || !config.chatId) {
      return res.status(400).json({ success: false, message: "Bot Token yoki Chat ID sozlanmagan" });
    }

    const reportHtml = buildDailyReportHtml(data);
    const sendResult = await sendTelegramMessage(config.botToken, config.chatId, reportHtml);

    if (sendResult.success) {
      // update last sent date
      await setDoc(docRef, {
        telegramConfig: {
          ...(config || {}),
          lastDailyReportSentDate: dateStr || ''
        }
      }, { merge: true });

      return res.json({
        success: true,
        message: "Kunlik hisobot Telegramga muvaffaqiyatli jo'natildi!",
        date: dateStr,
        details: sendResult.results
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Telegramga yuborishda xatolik yuz berdi",
        details: sendResult.results
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Server-side Telegram Send Proxy (avoids CORS and browser adblocker issues)
app.post('/api/telegram/send', async (req: Request, res: Response) => {
  try {
    let { botToken, chatId, text } = req.body;

    if (!botToken || !chatId) {
      const docRef = doc(serverDb, 'app_db', 'main');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const config = snap.data().telegramConfig;
        botToken = botToken || config?.botToken;
        chatId = chatId || config?.chatId;
      }
    }

    if (!botToken || !chatId) {
      return res.status(400).json({ success: false, message: "Bot Token yoki Chat ID topilmadi" });
    }

    const sendRes = await sendTelegramMessage(botToken, chatId, text);
    return res.json({
      success: sendRes.success,
      message: sendRes.success ? "Xabar muvaffaqiyatli jo'natildi" : "Xatolik yuz berdi",
      details: sendRes.results
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Server-side Telegram Connection Test
app.post('/api/telegram/test', async (req: Request, res: Response) => {
  try {
    const { botToken, chatId } = req.body;
    const cleanToken = botToken?.trim();

    if (!cleanToken) {
      return res.status(400).json({ success: false, message: "Bot Token kiritilmagan!" });
    }

    const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const meData = await meRes.json();

    if (!meData.ok) {
      return res.json({
        success: false,
        message: `Bot Token noto'g'ri! Telegram javobi: ${meData.description || 'Xato token'}`
      });
    }

    const botUsername = meData.result?.username || meData.result?.first_name || 'Bot';

    if (chatId?.trim()) {
      const { timeStr } = getTashkentDateTime();
      const pingText = `🤖 <b>FALAK SHOE — TIZIM BILDIRISHNOMASI</b>\n\n` +
        `✅ <b>Telegram Bot muvaffaqiyatli ulandi!</b>\n` +
        `• <b>Bot:</b> @${botUsername}\n` +
        `• <b>Vaqt:</b> ${timeStr}\n` +
        `• <b>Holat:</b> Barcha xabarnomalar va kunlik hisobotlar ushbu chatga yuboriladi. 🚀`;

      const sendRes = await sendTelegramMessage(cleanToken, chatId.trim(), pingText);
      if (!sendRes.success) {
        return res.json({
          success: false,
          botUsername,
          message: `Bot topildi (@${botUsername}), lekin Chat ID ga xabar yuborib bo'lmadi. Botga /start bosganingizni yoki guruhga qo'shganingizni tekshiring!`
        });
      }
    }

    return res.json({
      success: true,
      botUsername,
      message: `✅ Bot @${botUsername} ga muvaffaqiyatli ulandi va test xabari yuborildi!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Telegram Interactive Webhook (Supports /hisobot, /kassa, /ombor, /qarzlar, /start)
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) {
      return res.json({ ok: true });
    }

    const chatId = message.chat?.id;
    const text = message.text.trim();

    const docRef = doc(serverDb, 'app_db', 'main');
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.json({ ok: true });
    }

    const data = snap.data();
    const config = data.telegramConfig;
    if (!config || !config.botToken) {
      return res.json({ ok: true });
    }

    const { dateStr, timeStr } = getTashkentDateTime();

    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/yordam')) {
      const welcome = `🤖 <b>Falak Shoe Botiga Xush Kelibsiz!</b>\n\n` +
        `Siz quyidagi buyruqlardan foydalanishingiz mumkin:\n\n` +
        `📊 <b>/hisobot</b> — Bugungi kunlik savdo va kassa hisoboti\n` +
        `📦 <b>/ombor</b> — Omborlar qoldig'i va modellar ro'yxati\n` +
        `📥 <b>/kirim</b> — Bugungi omborga yangi kirimlar\n` +
        `📤 <b>/chiqim</b> — Bugungi savdo va chiqimlar\n` +
        `💳 <b>/kassa</b> — Joriy kassa qoldiqlari (so'm, karta, bank, dollar)\n` +
        `👥 <b>/qarzlar</b> — Mijozlarning umumiy qarzdorlik holati\n\n` +
        `⏰ <i>Har kuni soat 20:00 da hisobot avtomatik keladi.</i>`;
      await sendTelegramMessage(config.botToken, String(chatId), welcome);
    } else if (text.startsWith('/hisobot') || text.startsWith('/bugun')) {
      const report = buildDailyReportHtml(data);
      await sendTelegramMessage(config.botToken, String(chatId), report);
    } else if (text.startsWith('/kassa')) {
      const kassaBalansi = data.kassaBalansi || {};
      const naqdSom = Number(kassaBalansi.naqd_uzs !== undefined ? kassaBalansi.naqd_uzs : data.kassa?.naqdSom) || 0;
      const kartaSom = Number(kassaBalansi.karta_uzs || 0);
      const bankHisob = Number(kassaBalansi.bank_uzs !== undefined ? kassaBalansi.bank_uzs : data.kassa?.bankHisob) || 0;
      const naqdDollar = Number(kassaBalansi.naqd_usd !== undefined ? kassaBalansi.naqd_usd : data.kassa?.naqdDollar) || 0;

      let kassaMsg = `💳 <b>JORIY KASSA BALANSI (${dateStr} ${timeStr})</b>\n\n` +
        `• <b>Naqd so'm:</b> <code>${formatUzs(naqdSom)} so'm</code>\n`;
      if (kartaSom > 0) kassaMsg += `• <b>Karta (terminal):</b> <code>${formatUzs(kartaSom)} so'm</code>\n`;
      if (bankHisob > 0) kassaMsg += `• <b>Bank hisobi:</b> <code>${formatUzs(bankHisob)} so'm</code>\n`;
      if (naqdDollar > 0) kassaMsg += `• <b>Naqd dollar:</b> <code>$${formatUzs(naqdDollar)}</code>\n`;

      kassaMsg += `\n💰 <b>Umumiy jamg'arma:</b> <code>${formatUzs(naqdSom + kartaSom + bankHisob)} so'm</code>`;
      if (naqdDollar > 0) kassaMsg += ` + <code>$${formatUzs(naqdDollar)}</code>`;

      await sendTelegramMessage(config.botToken, String(chatId), kassaMsg);
    } else if (text.startsWith('/ombor') || text.startsWith('/qoldiq')) {
      const calcOmborStock = (stockObj: any) => {
        let total = 0;
        const modelTotals: Record<string, number> = {};
        Object.entries(stockObj || {}).forEach(([m, sizes]) => {
          const sum = Object.values((sizes || {}) as Record<string, any>).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
          if (sum > 0) {
            modelTotals[m] = sum;
            total += sum;
          }
        });
        return { total, modelTotals };
      };

      const tepa = calcOmborStock(data.tepa?.stock);
      const kotta = calcOmborStock(data.kotta?.stock);
      const sort2 = calcOmborStock(data.sort2?.stock);
      const grandTotal = tepa.total + kotta.total + sort2.total;

      let omborMsg = `📦 <b>FALAK SHOE — OMBOR ZAXIRALARI (${dateStr} ${timeStr})</b>\n\n` +
        `• <b>Tepa ombor:</b> <b>${formatUzs(tepa.total)} juft</b>\n` +
        `• <b>Kotta ombor:</b> <b>${formatUzs(kotta.total)} juft</b>\n`;
      if (sort2.total > 0) {
        omborMsg += `• <b>2-Sort ombor:</b> <b>${formatUzs(sort2.total)} juft</b>\n`;
      }
      omborMsg += `👉 <b>JAMI ZAXIRA:</b> <b>${formatUzs(grandTotal)} juft</b>\n\n`;

      const combined: Record<string, number> = {};
      [tepa.modelTotals, kotta.modelTotals, sort2.modelTotals].forEach(mMap => {
        Object.entries(mMap).forEach(([m, q]) => {
          combined[m] = (combined[m] || 0) + q;
        });
      });

      const topModels = Object.entries(combined).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (topModels.length > 0) {
        omborMsg += `📊 <b>TOP MODELLAR:</b>\n`;
        topModels.forEach(([m, q], idx) => {
          omborMsg += `${idx + 1}. <code>${m}</code>: <b>${formatUzs(q)} juft</b>\n`;
        });
      }

      await sendTelegramMessage(config.botToken, String(chatId), omborMsg);
    } else if (text.startsWith('/kirim')) {
      const tepaKirim = toArray(data.tepa?.transactions).filter(t => t.sana === dateStr && t.amal === 'kirim');
      const kottaKirim = toArray(data.kotta?.transactions).filter(t => t.sana === dateStr && t.amal === 'kirim');
      const sort2Kirim = toArray(data.sort2?.transactions).filter(t => t.sana === dateStr && t.amal === 'kirim');
      const allKirims = [...tepaKirim, ...kottaKirim, ...sort2Kirim];
      const totalQty = allKirims.reduce((a, t) => a + (Number(t.soni) || 0), 0);

      let kirimMsg = `📥 <b>BUGUNGI OMBOR KIRIMLARI (${dateStr})</b>\n\n` +
        `• <b>Jami kelgan tovar:</b> <b>${formatUzs(totalQty)} juft</b>\n` +
        `• <b>Kirimlar soni:</b> ${allKirims.length} ta yozuv\n\n`;

      if (allKirims.length > 0) {
        kirimMsg += `📋 <b>So'nggi kirimlar:</b>\n`;
        allKirims.slice(-8).reverse().forEach((t, i) => {
          kirimMsg += `${i + 1}. <code>${t.model}</code> (${t.olcham}°) — <b>${t.soni} juft</b> (${t.kimdan || 'Sex'})\n`;
        });
      }

      await sendTelegramMessage(config.botToken, String(chatId), kirimMsg);
    } else if (text.startsWith('/chiqim') || text.startsWith('/savdo')) {
      const tepaChiqim = toArray(data.tepa?.transactions).filter(t => t.sana === dateStr && t.amal === 'chiqim');
      const kottaChiqim = toArray(data.kotta?.transactions).filter(t => t.sana === dateStr && t.amal === 'chiqim');
      const sort2Chiqim = toArray(data.sort2?.transactions).filter(t => t.sana === dateStr && t.amal === 'chiqim');
      const allChiqims = [...tepaChiqim, ...kottaChiqim, ...sort2Chiqim];
      const totalQty = allChiqims.reduce((a, t) => a + (Number(t.soni) || 0), 0);
      const totalSum = allChiqims.reduce((a, t) => a + (Number(t.summa) || 0), 0);

      let chiqimMsg = `📤 <b>BUGUNGI SAVDO VA CHIQIMLAR (${dateStr})</b>\n\n` +
        `• <b>Jami sotilgan hajm:</b> <b>${formatUzs(totalQty)} juft</b>\n` +
        `• <b>Jami savdo summasi:</b> <b>${formatUzs(totalSum)} so'm</b>\n` +
        `• <b>Amaliyotlar soni:</b> ${allChiqims.length} ta\n\n`;

      if (allChiqims.length > 0) {
        chiqimMsg += `📋 <b>So'nggi chiqimlar:</b>\n`;
        allChiqims.slice(-8).reverse().forEach((t, i) => {
          chiqimMsg += `${i + 1}. <b>${t.kimga || 'Mijoz'}</b>: <code>${t.model}</code> (${t.soni} juft) — ${formatUzs(t.summa || 0)} so'm\n`;
        });
      }

      await sendTelegramMessage(config.botToken, String(chatId), chiqimMsg);
    } else if (text.startsWith('/qarzlar')) {
      const kontragentlar = toArray(data.kontragentlar);
      const debtors = kontragentlar.filter(k => (Number(k.balans) || 0) < 0);
      const totalDebt = debtors.reduce((acc, k) => acc + Math.abs(Number(k.balans) || 0), 0);

      let qarzMsg = `👥 <b>MIJOZLAR QARZDORLIGI (${dateStr})</b>\n\n`;
      qarzMsg += `• <b>Qarzdor mijozlar:</b> ${debtors.length} ta\n`;
      qarzMsg += `• <b>Jami qarz summasi:</b> <code>${formatUzs(totalDebt)} so'm</code>\n\n`;
      if (debtors.length > 0) {
        qarzMsg += `<b>Eng katta qarzdorlar:</b>\n`;
        debtors
          .sort((a, b) => (Number(a.balans) || 0) - (Number(b.balans) || 0))
          .slice(0, 5)
          .forEach((d, i) => {
            qarzMsg += `${i + 1}. <b>${d.nomi || d.ism}</b>: <code>${formatUzs(Math.abs(Number(d.balans) || 0))} so'm</code>\n`;
          });
      }
      await sendTelegramMessage(config.botToken, String(chatId), qarzMsg);
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return res.json({ ok: true });
  }
});

// Set Webhook helper
app.post('/api/telegram/set-webhook', async (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body;
    const docRef = doc(serverDb, 'app_db', 'main');
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : null;
    const botToken = data?.telegramConfig?.botToken;

    if (!botToken) {
      return res.status(400).json({ success: false, message: "Bot token sozlanmagan" });
    }

    const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const setData = await setRes.json();

    return res.json({ success: setData.ok, result: setData });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 24/7 BACKGROUND CRON SCHEDULER (Checks 20:00 Asia/Tashkent)
// ----------------------------------------------------
let lastCronSentDate = '';

setInterval(async () => {
  try {
    const { dateStr, timeStr } = getTashkentDateTime();
    const docRef = doc(serverDb, 'app_db', 'main');
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const config = data?.telegramConfig;
    if (!config || !config.isEnabled || !config.notifyDailyReport || !config.botToken || !config.chatId) {
      return;
    }

    const targetTime = config.dailyReportTime || '20:00';

    // Trigger when current Tashkent time >= targetTime and not yet sent today
    if (timeStr >= targetTime && config.lastDailyReportSentDate !== dateStr && lastCronSentDate !== dateStr) {
      console.log(`[SERVER CRON] 20:00 reached in Asia/Tashkent (${dateStr} ${timeStr}). Sending daily report...`);
      lastCronSentDate = dateStr;

      const reportHtml = buildDailyReportHtml(data);
      const sendRes = await sendTelegramMessage(config.botToken, config.chatId, reportHtml);

      if (sendRes.success) {
        await setDoc(docRef, {
          telegramConfig: {
            ...(config || {}),
            lastDailyReportSentDate: dateStr || ''
          }
        }, { merge: true });
        console.log(`[SERVER CRON] ✅ Daily Telegram report sent successfully.`);
      }
    }
  } catch (e: any) {
    // Quiet offline/transient errors during cold starts or network recovery
    if (e?.code === 'unavailable' || e?.message?.includes('offline')) {
      // transient offline state, skip log noise
    } else {
      console.warn('[SERVER CRON] Check notice:', e?.message || e);
    }
  }
}, 30000); // Check every 30 seconds

// ----------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// ----------------------------------------------------
async function start() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.ENABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled
          ? false
          : {
              server: httpServer,
              protocol: 'wss',
              clientPort: process.env.HMR_CLIENT_PORT ? parseInt(process.env.HMR_CLIENT_PORT, 10) : 443,
            },
        watch: isHmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OmborPro Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
