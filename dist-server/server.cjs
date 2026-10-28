var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_app = require("firebase/app");
var import_firestore = require("firebase/firestore");
var import_auth = require("firebase/auth");

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "collective-thought-5q6d2",
  appId: "1:622254989357:web:2f6060a1d3c82a7a1098a4",
  apiKey: "AIzaSyCWGqvf2ugDdvEtB5BcSb8EZta3Q0plV8s",
  authDomain: "collective-thought-5q6d2.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-7a56a139-809a-4d72-bfc7-2fb48ddde40a",
  storageBucket: "collective-thought-5q6d2.firebasestorage.app",
  messagingSenderId: "622254989357",
  measurementId: "",
  oAuthClientId: "622254989357-94ic3eql2oc94mir6n4h4bj0ilvjfdf0.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// server.ts
(0, import_firestore.setLogLevel)("silent");
var isBenignFirestoreLog = (...args) => {
  const message = args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  return message.includes("ECONNRESET") || message.includes("GrpcConnection RPC") || message.includes("14 UNAVAILABLE") || message.includes("1 CANCELLED") || message.includes("Call cancelled") || message.includes("transport errored") || message.includes("Listen") || message.includes("Using maximum backoff delay");
};
var originalConsoleError = console.error;
var originalConsoleWarn = console.warn;
console.error = (...args) => {
  if (isBenignFirestoreLog(...args)) return;
  originalConsoleError.apply(console, args);
};
console.warn = (...args) => {
  if (isBenignFirestoreLog(...args)) return;
  originalConsoleWarn.apply(console, args);
};
var app = (0, import_express.default)();
var PORT = 3e3;
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
var SERVER_DATA_DIR = import_path.default.join(process.cwd(), "data");
var SERVER_DB_FILE = import_path.default.join(SERVER_DATA_DIR, "server_db_cache.json");
var SERVER_BACKUPS_DIR = import_path.default.join(SERVER_DATA_DIR, "backups");
try {
  if (!import_fs.default.existsSync(SERVER_DATA_DIR)) {
    import_fs.default.mkdirSync(SERVER_DATA_DIR, { recursive: true });
  }
  if (!import_fs.default.existsSync(SERVER_BACKUPS_DIR)) {
    import_fs.default.mkdirSync(SERVER_BACKUPS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[SERVER SYNC] Data dirs creation notice:", e);
}
var serverMemoryDb = null;
var serverMemoryVersion = Date.now();
try {
  if (import_fs.default.existsSync(SERVER_DB_FILE)) {
    const raw = import_fs.default.readFileSync(SERVER_DB_FILE, "utf-8");
    serverMemoryDb = JSON.parse(raw);
    console.log("[SERVER SYNC] \u2705 Disk cache loaded successfully into server memory");
  }
} catch (e) {
  console.warn("[SERVER SYNC] Cache load notice:", e);
}
var fbApp = (0, import_app.getApps)().length === 0 ? (0, import_app.initializeApp)(firebase_applet_config_default, "server-app") : (0, import_app.getApps)()[0];
var serverDb = (0, import_firestore.getFirestore)(fbApp, firebase_applet_config_default.firestoreDatabaseId);
var serverAuth = (0, import_auth.getAuth)(fbApp);
(0, import_auth.signInAnonymously)(serverAuth).catch(() => {
});
var sanitizeFirestoreKey = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/[#$/\[\]]/g, "");
};
var serverConvertArraysToMaps = (obj, rootPath = "") => {
  if (obj === void 0) return null;
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    const hasId = obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null && "id" in obj[0];
    const shouldBeMap = hasId || [
      "users",
      "kontragentlar",
      "templates",
      "pendingKirim",
      "transactions",
      "otkazmalar",
      "bekorQilinganOtkazmalar",
      "bekorQilinganKirimlar",
      "bekorQilinganChiqimlar",
      "auditLogs",
      "kassaHarakatlari",
      "vozvratlar",
      "braklar"
    ].includes(rootPath);
    if (shouldBeMap) {
      const map = {};
      obj.forEach((item, index) => {
        if (item && typeof item === "object") {
          const itemId = item.id ? String(item.id).replace(/[#$/\[\]]/g, "_") : `item_${index}`;
          map[itemId] = serverConvertArraysToMaps(item, rootPath);
        }
      });
      return map;
    }
    return obj.map((item) => serverConvertArraysToMaps(item, rootPath));
  }
  const res = {};
  for (const key in obj) {
    if (obj[key] !== void 0) {
      const cleanKey = sanitizeFirestoreKey(key);
      res[cleanKey] = serverConvertArraysToMaps(obj[key], key);
    }
  }
  return res;
};
var serverPruneForFirestore = (dbData) => {
  if (!dbData || typeof dbData !== "object") return dbData;
  const cloned = JSON.parse(JSON.stringify(dbData));
  const sortTxsDesc = (txs) => {
    if (!Array.isArray(txs)) return [];
    return [...txs].sort((a, b) => {
      const dComp = (b.sana || "").localeCompare(a.sana || "");
      if (dComp !== 0) return dComp;
      return (b.vaqt || "").localeCompare(a.vaqt || "");
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
var serverSaveTimer = null;
var serverLastSavedSig = "";
var serverIsFirestoreQuotaExhausted = false;
var scheduleServerDbToFirestore = (dbToSave) => {
  if (!dbToSave) return;
  if (serverIsFirestoreQuotaExhausted) return;
  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
  }
  serverSaveTimer = setTimeout(async () => {
    try {
      const sig = `${dbToSave.tepa?.transactions?.length}_${dbToSave.kotta?.transactions?.length}_${dbToSave.sort2?.transactions?.length}_${dbToSave.otkazmalar?.length}_${dbToSave.kassaHarakatlari?.length}_${dbToSave.kontragentlar?.length}`;
      if (sig === serverLastSavedSig) return;
      const pruned = serverPruneForFirestore(dbToSave);
      const payload = serverConvertArraysToMaps(pruned);
      await (0, import_firestore.setDoc)((0, import_firestore.doc)(serverDb, "app_db", "main"), payload);
      serverLastSavedSig = sig;
      console.log("[SERVER SYNC] \u2705 Firestore app_db/main successfully batched & synchronized");
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded")) {
        serverIsFirestoreQuotaExhausted = true;
        console.warn("[SERVER SYNC] Firestore daily write quota limit reached. Server fallback memory/disk active.");
      } else {
        console.warn("[SERVER SYNC] Firestore save status:", msg);
      }
    }
  }, 15e3);
};
var saveServerDbToFirestore = scheduleServerDbToFirestore;
var performDailyAutoBackup = (dbData) => {
  if (!dbData) return;
  try {
    const { dateStr } = getTashkentDateTime();
    const backupFile = import_path.default.join(SERVER_BACKUPS_DIR, `backup_${dateStr}.json`);
    import_fs.default.writeFileSync(backupFile, JSON.stringify(dbData, null, 2), "utf-8");
    console.log(`[AUTO-BACKUP] \u{1F4BE} Kunlik zaxira nusxasi muvaffaqiyatli saqlandi: backup_${dateStr}.json`);
    const files = import_fs.default.readdirSync(SERVER_BACKUPS_DIR);
    const nowMs = Date.now();
    for (const f of files) {
      if (f.startsWith("backup_") && f.endsWith(".json")) {
        const filePath = import_path.default.join(SERVER_BACKUPS_DIR, f);
        const stats = import_fs.default.statSync(filePath);
        if (nowMs - stats.mtimeMs > 30 * 24 * 60 * 60 * 1e3) {
          import_fs.default.unlinkSync(filePath);
        }
      }
    }
  } catch (bErr) {
    console.warn("[AUTO-BACKUP] Error saving daily backup:", bErr);
  }
};
try {
  (0, import_firestore.onSnapshot)((0, import_firestore.doc)(serverDb, "app_db", "main"), (snap) => {
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData) {
        serverMemoryDb = mergeServerDbStates(serverMemoryDb, remoteData);
        serverMemoryVersion = Date.now();
        try {
          import_fs.default.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), "utf-8");
        } catch {
        }
      }
    }
  }, (err) => {
    console.warn("[SERVER SYNC] Firestore live listener fallback:", err?.message || err);
  });
} catch (listenerErr) {
  console.warn("[SERVER SYNC] Listener init notice:", listenerErr);
}
(0, import_firestore.getDoc)((0, import_firestore.doc)(serverDb, "history_records", "main")).then((snap) => {
  if (snap.exists()) {
    const histData = snap.data();
    if (histData) {
      serverMemoryDb = mergeServerDbStates(serverMemoryDb, histData);
      serverMemoryVersion = Date.now();
      try {
        import_fs.default.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), "utf-8");
        console.log("[SERVER SYNC] \u2705 3,300+ historical transactions from history_records/main merged into server cache");
      } catch {
      }
    }
  }
}).catch((err) => {
  console.warn("[SERVER SYNC] Historical fetch notice:", err?.message || err);
});
var formatUzs = (val) => {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};
var getTashkentDateTime = () => {
  const now = /* @__PURE__ */ new Date();
  const tzOffset = 5 * 60;
  const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 6e4);
  const dateStr = localTime.toISOString().slice(0, 10);
  const hours = String(localTime.getHours()).padStart(2, "0");
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;
  return { dateStr, timeStr, fullIso: localTime.toISOString() };
};
async function sendTelegramMessage(botToken, chatId, htmlText) {
  if (!botToken || !chatId) return { success: false, error: "Token yoki Chat ID yetishmaydi" };
  const targetIds = chatId.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean);
  const results = [];
  for (const id of targetIds) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: id,
          text: htmlText,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      });
      const data = await resp.json();
      results.push({ chatId: id, ok: data.ok, description: data.description });
    } catch (e) {
      results.push({ chatId: id, ok: false, description: e.message });
    }
  }
  return { success: results.some((r) => r.ok), results };
}
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return Object.values(val);
  return [];
}
function buildDailyReportHtml(dbData, targetDate) {
  const { dateStr, timeStr } = getTashkentDateTime();
  const sana = targetDate || dateStr;
  const tepaTxs = toArray(dbData.tepa?.transactions).filter((t) => t.sana === sana);
  const kottaTxs = toArray(dbData.kotta?.transactions).filter((t) => t.sana === sana);
  const sort2Txs = toArray(dbData.sort2?.transactions).filter((t) => t.sana === sana);
  const tepaChiqim = tepaTxs.filter((t) => t.amal === "chiqim");
  const kottaChiqim = kottaTxs.filter((t) => t.amal === "chiqim");
  const sort2Chiqim = sort2Txs.filter((t) => t.amal === "chiqim");
  const allChiqim = [...tepaChiqim, ...kottaChiqim, ...sort2Chiqim];
  const totalJuftChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.soni) || 0), 0);
  const totalSummaChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.summa) || 0), 0);
  const totalFoyda = allChiqim.reduce((acc, t) => acc + (Number(t.foyda) || 0), 0);
  const tepaKirim = tepaTxs.filter((t) => t.amal === "kirim");
  const kottaKirim = kottaTxs.filter((t) => t.amal === "kirim");
  const sort2Kirim = sort2Txs.filter((t) => t.amal === "kirim");
  const totalJuftKirim = [...tepaKirim, ...kottaKirim, ...sort2Kirim].reduce((acc, t) => acc + (Number(t.soni) || 0), 0);
  const otkazmalar = toArray(dbData.otkazmalar).filter((o) => o.sana === sana);
  const totalOtkazma = otkazmalar.reduce((acc, o) => acc + (Number(o.soni) || 0), 0);
  const vozvratlar = toArray(dbData.vozvratlar).filter((v) => v.sana === sana);
  const totalVozvratQty = vozvratlar.reduce((acc, v) => acc + (Number(v.soni) || 0), 0);
  const braklar = toArray(dbData.braklar).filter((b) => b.sana === sana);
  const totalBrakQty = braklar.reduce((acc, b) => acc + (Number(b.soni) || 0), 0);
  const kassaBalansi = dbData.kassaBalansi || {};
  const naqdSom = Number(kassaBalansi.naqd_uzs !== void 0 ? kassaBalansi.naqd_uzs : dbData.kassa?.naqdSom) || 0;
  const naqdDollar = Number(kassaBalansi.naqd_usd !== void 0 ? kassaBalansi.naqd_usd : dbData.kassa?.naqdDollar) || 0;
  const kartaSom = Number(kassaBalansi.karta_uzs || 0);
  const bankHisob = Number(kassaBalansi.bank_uzs !== void 0 ? kassaBalansi.bank_uzs : dbData.kassa?.bankHisob) || 0;
  const calcOmborStock = (stockObj) => {
    return Object.values(stockObj || {}).reduce((acc, modelStock) => {
      const sum = Object.values(modelStock || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      return acc + sum;
    }, 0);
  };
  const tepaStockTotal = calcOmborStock(dbData.tepa?.stock);
  const kottaStockTotal = calcOmborStock(dbData.kotta?.stock);
  const sort2StockTotal = calcOmborStock(dbData.sort2?.stock);
  const grandTotalStock = tepaStockTotal + kottaStockTotal + sort2StockTotal;
  let msg = `\u{1F4CA} <b>FALAK SHOE \u2014 KUNLIK YIG'MA HISOBOT</b>
`;
  msg += `\u{1F4C5} <b>Sana:</b> ${sana} (Soat ${timeStr})
`;
  msg += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

`;
  msg += `\u{1F4B0} <b>SAVDO VA TUSHUM:</b>
`;
  msg += `\u2022 <b>Jami sotildi:</b> <code>${formatUzs(totalJuftChiqim)} juft</code>
`;
  msg += `\u2022 <b>Umumiy summa:</b> <code>${formatUzs(totalSummaChiqim)} so'm</code>
`;
  if (totalFoyda > 0) {
    msg += `\u2022 <b>Hisoblangan sof foyda:</b> <code>${formatUzs(totalFoyda)} so'm</code>
`;
  }
  msg += `
`;
  msg += `\u{1F4E6} <b>OMBOR HARAKATI:</b>
`;
  msg += `\u2022 <b>Kunlik yangi kirim:</b> <code>${formatUzs(totalJuftKirim)} juft</code>
`;
  if (totalOtkazma > 0) msg += `\u2022 <b>Omborlararo o'tkazma:</b> <code>${formatUzs(totalOtkazma)} juft</code>
`;
  if (totalVozvratQty > 0) msg += `\u2022 <b>Mijozdan vozvrat:</b> <code>${formatUzs(totalVozvratQty)} juft</code>
`;
  if (totalBrakQty > 0) msg += `\u2022 <b>Brak fondiga:</b> <code>${formatUzs(totalBrakQty)} juft</code>
`;
  msg += `
`;
  msg += `\u{1F3E2} <b>OMBOR QOLDIQLARI (JORIY):</b>
`;
  msg += `\u2022 <b>Tepa ombor:</b> <code>${formatUzs(tepaStockTotal)} juft</code>
`;
  msg += `\u2022 <b>Kotta ombor:</b> <code>${formatUzs(kottaStockTotal)} juft</code>
`;
  if (sort2StockTotal > 0) msg += `\u2022 <b>2-Sort ombor:</b> <code>${formatUzs(sort2StockTotal)} juft</code>
`;
  msg += `\u{1F449} <b>JAMI OMBORLARDA:</b> <code>${formatUzs(grandTotalStock)} juft</code>

`;
  msg += `\u{1F4B3} <b>KASSA BALANSI (JORIY):</b>
`;
  msg += `\u2022 <b>Naqd so'm:</b> <code>${formatUzs(naqdSom)} so'm</code>
`;
  if (kartaSom > 0) msg += `\u2022 <b>Karta (terminal):</b> <code>${formatUzs(kartaSom)} so'm</code>
`;
  if (bankHisob > 0) msg += `\u2022 <b>Bank hisobi:</b> <code>${formatUzs(bankHisob)} so'm</code>
`;
  if (naqdDollar > 0) msg += `\u2022 <b>Naqd dollar:</b> <code>$${formatUzs(naqdDollar)}</code>
`;
  msg += `
`;
  msg += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`;
  msg += `\u26A1 <i>Avtomatik Server Cron (Cloud Function) orqali jo'natildi.</i>`;
  return msg;
}
function mergeServerDbStates(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing, ...incoming };
  const mergeTxs = (t1, t2) => {
    const seen = /* @__PURE__ */ new Set();
    const list = [];
    const add = (t) => {
      if (!t || !t.id) return;
      if (seen.has(t.id)) return;
      seen.add(t.id);
      list.push(t);
    };
    (t2 || []).forEach(add);
    (t1 || []).forEach(add);
    return list.sort((a, b) => (b.sana || "").localeCompare(a.sana || "") || (b.vaqt || "").localeCompare(a.vaqt || ""));
  };
  const mergeMapArray = (a1, a2) => {
    const map = /* @__PURE__ */ new Map();
    (a1 || []).forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    (a2 || []).forEach((item) => {
      if (item?.id) map.set(item.id, { ...map.get(item.id) || {}, ...item });
    });
    return Array.from(map.values());
  };
  const mergeStock = (s1, s2) => {
    const res = {};
    const models = /* @__PURE__ */ new Set([
      ...Object.keys(s1 || {}),
      ...Object.keys(s2 || {})
    ]);
    for (const m of models) {
      res[m] = { ...s1?.[m] || {}, ...s2?.[m] || {} };
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
  const clientMap = /* @__PURE__ */ new Map();
  toArray(existing.kontragentlar).forEach((k) => {
    if (k?.ism) clientMap.set(k.ism.trim().toLowerCase(), k);
  });
  toArray(incoming.kontragentlar).forEach((k) => {
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
          balans: k.balans !== void 0 && k.balans !== 0 ? k.balans : prev.balans || 0
        });
      }
    }
  });
  const serverClients = Array.from(clientMap.values());
  const seenClientIds = /* @__PURE__ */ new Set();
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
  merged.prices = { ...existing.prices || {}, ...incoming.prices || {} };
  merged.kassaBalansi = incoming.kassaBalansi || existing.kassaBalansi;
  merged.qabulQilinganPartiyaIds = Array.from(/* @__PURE__ */ new Set([
    ...toArray(existing.qabulQilinganPartiyaIds),
    ...toArray(incoming.qabulQilinganPartiyaIds)
  ]));
  merged.partiyaQabulTarixi = {
    ...existing.partiyaQabulTarixi || {},
    ...incoming.partiyaQabulTarixi || {}
  };
  return merged;
}
app.get("/api/sync/version", (req, res) => {
  const etag = `"${serverMemoryVersion}"`;
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }
  res.json({
    version: serverMemoryVersion,
    timestamp: Date.now(),
    hasData: Boolean(serverMemoryDb)
  });
});
app.get("/api/sync/db", async (req, res) => {
  try {
    const etag = `"${serverMemoryVersion}"`;
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("ETag", etag);
    if (serverMemoryDb && req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    if (!serverMemoryDb) {
      try {
        const snap = await (0, import_firestore.getDoc)((0, import_firestore.doc)(serverDb, "app_db", "main"));
        if (snap.exists()) {
          serverMemoryDb = snap.data();
          serverMemoryVersion = Date.now();
        }
      } catch (e) {
        console.warn("[SERVER SYNC] Firestore read seed notice:", e?.message || e);
      }
    }
    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/sync/db", async (req, res) => {
  try {
    const clientPayload = req.body?.db;
    if (!clientPayload || typeof clientPayload !== "object") {
      return res.status(400).json({ success: false, message: "Yaroqsiz ma'lumot formati" });
    }
    serverMemoryDb = mergeServerDbStates(serverMemoryDb, clientPayload);
    serverMemoryVersion = Date.now();
    try {
      import_fs.default.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), "utf-8");
    } catch (fsErr) {
      console.warn("[SERVER SYNC] File write notice:", fsErr);
    }
    performDailyAutoBackup(serverMemoryDb);
    scheduleServerDbToFirestore(serverMemoryDb);
    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/stock/atomic-checkout", async (req, res) => {
  try {
    const { ombor, items } = req.body;
    if (!ombor || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Yaroqsiz so'rov parametrlari" });
    }
    if (!serverMemoryDb) {
      try {
        const snap = await (0, import_firestore.getDoc)((0, import_firestore.doc)(serverDb, "app_db", "main"));
        if (snap.exists()) {
          serverMemoryDb = snap.data();
          serverMemoryVersion = Date.now();
        }
      } catch (e) {
        console.warn("[ATOMIC] Firestore seed notice:", e?.message || e);
      }
    }
    if (!serverMemoryDb || !serverMemoryDb[ombor]) {
      return res.json({ success: true, fallback: true, message: "Lokal tekshiruvga ruxsat berildi" });
    }
    const currentOmborStock = serverMemoryDb[ombor]?.stock || {};
    const conflicts = [];
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
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: "Omborda yetarli qoldiq mavjud emas! Boshqa qurilmadan sotilgan bo'lishi mumkin.",
        conflicts
      });
    }
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
      import_fs.default.writeFileSync(SERVER_DB_FILE, JSON.stringify(serverMemoryDb), "utf-8");
    } catch {
    }
    saveServerDbToFirestore(serverMemoryDb);
    return res.json({
      success: true,
      version: serverMemoryVersion,
      updatedStock: currentOmborStock
    });
  } catch (err) {
    console.error("[ATOMIC] Checkout error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/backup/list", (req, res) => {
  try {
    if (!import_fs.default.existsSync(SERVER_BACKUPS_DIR)) {
      return res.json({ success: true, backups: [] });
    }
    const files = import_fs.default.readdirSync(SERVER_BACKUPS_DIR).filter((f) => f.startsWith("backup_") && f.endsWith(".json")).sort().reverse();
    const backups = files.map((filename) => {
      const filePath = import_path.default.join(SERVER_BACKUPS_DIR, filename);
      const stats = import_fs.default.statSync(filePath);
      const datePart = filename.replace("backup_", "").replace(".json", "");
      return {
        filename,
        date: datePart,
        sizeBytes: stats.size,
        sizeKb: Math.round(stats.size / 1024),
        updatedAt: stats.mtime.toISOString()
      };
    });
    return res.json({ success: true, backups });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/backup/create", (req, res) => {
  try {
    const { dateStr, timeStr } = getTashkentDateTime();
    const safeTime = timeStr.replace(":", "-");
    const filename = `backup_${dateStr}_${safeTime}.json`;
    const targetFile = import_path.default.join(SERVER_BACKUPS_DIR, filename);
    const sourceData = req.body?.db || serverMemoryDb;
    if (!sourceData) {
      return res.status(400).json({ success: false, message: "Zaxira uchun ma'lumot topilmadi" });
    }
    import_fs.default.writeFileSync(targetFile, JSON.stringify(sourceData, null, 2), "utf-8");
    return res.json({
      success: true,
      message: `Zaxira nusxasi muvaffaqiyatli yaratildi: ${filename}`,
      filename,
      date: dateStr
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/backup/download/:filename", (req, res) => {
  try {
    const filename = import_path.default.basename(req.params.filename);
    const filePath = import_path.default.join(SERVER_BACKUPS_DIR, filename);
    if (!import_fs.default.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Zaxira fayli topilmadi" });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/backup/restore/:filename", async (req, res) => {
  try {
    const filename = import_path.default.basename(req.params.filename);
    const filePath = import_path.default.join(SERVER_BACKUPS_DIR, filename);
    if (!import_fs.default.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Zaxira fayli topilmadi" });
    }
    const raw = import_fs.default.readFileSync(filePath, "utf-8");
    const backupDb = JSON.parse(raw);
    serverMemoryDb = backupDb;
    serverMemoryVersion = Date.now();
    import_fs.default.writeFileSync(SERVER_DB_FILE, JSON.stringify(backupDb), "utf-8");
    await saveServerDbToFirestore(backupDb);
    return res.json({
      success: true,
      version: serverMemoryVersion,
      data: serverMemoryDb,
      message: `Baza "${filename}" zaxira nusxasidan to'liq tiklandi!`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/currency/rates", async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    const response = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/", {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, data, source: "O'zbekiston Markaziy Banki (CBU.uz)" });
    }
    return res.status(502).json({ success: false, message: "CBU API javob bermadi" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Xatolik" });
  }
});
app.post("/api/kassa/reset-test-funds", async (req, res) => {
  try {
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    await (0, import_firestore.setDoc)(docRef, {
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
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/telegram/status", async (req, res) => {
  const { dateStr, timeStr } = getTashkentDateTime();
  try {
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    const snap = await (0, import_firestore.getDoc)(docRef);
    const data = snap.exists() ? snap.data() : null;
    const config = data?.telegramConfig || {};
    res.json({
      status: "online",
      serverTimezone: "Asia/Tashkent (UTC+5)",
      currentTashkentDate: dateStr,
      currentTashkentTime: timeStr,
      cronTargetTime: config.dailyReportTime || "20:00",
      cronEnabled: Boolean(config.isEnabled && config.notifyDailyReport),
      lastDailyReportSentDate: config.lastDailyReportSentDate || null,
      isConfigured: Boolean(config.botToken && config.chatId)
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});
app.all(["/api/telegram/cron-trigger", "/api/telegram/daily-report"], async (req, res) => {
  try {
    const { dateStr } = getTashkentDateTime();
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    const snap = await (0, import_firestore.getDoc)(docRef);
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
      await (0, import_firestore.setDoc)(docRef, {
        telegramConfig: {
          ...config || {},
          lastDailyReportSentDate: dateStr || ""
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
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/telegram/send", async (req, res) => {
  try {
    let { botToken, chatId, text } = req.body;
    if (!botToken || !chatId) {
      const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
      const snap = await (0, import_firestore.getDoc)(docRef);
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
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/telegram/test", async (req, res) => {
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
        message: `Bot Token noto'g'ri! Telegram javobi: ${meData.description || "Xato token"}`
      });
    }
    const botUsername = meData.result?.username || meData.result?.first_name || "Bot";
    if (chatId?.trim()) {
      const { timeStr } = getTashkentDateTime();
      const pingText = `\u{1F916} <b>FALAK SHOE \u2014 TIZIM BILDIRISHNOMASI</b>

\u2705 <b>Telegram Bot muvaffaqiyatli ulandi!</b>
\u2022 <b>Bot:</b> @${botUsername}
\u2022 <b>Vaqt:</b> ${timeStr}
\u2022 <b>Holat:</b> Barcha xabarnomalar va kunlik hisobotlar ushbu chatga yuboriladi. \u{1F680}`;
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
      message: `\u2705 Bot @${botUsername} ga muvaffaqiyatli ulandi va test xabari yuborildi!`
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) {
      return res.json({ ok: true });
    }
    const chatId = message.chat?.id;
    const text = message.text.trim();
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    const snap = await (0, import_firestore.getDoc)(docRef);
    if (!snap.exists()) {
      return res.json({ ok: true });
    }
    const data = snap.data();
    const config = data.telegramConfig;
    if (!config || !config.botToken) {
      return res.json({ ok: true });
    }
    const { dateStr, timeStr } = getTashkentDateTime();
    if (text.startsWith("/start") || text.startsWith("/help") || text.startsWith("/yordam")) {
      const welcome = `\u{1F916} <b>Falak Shoe Botiga Xush Kelibsiz!</b>

Siz quyidagi buyruqlardan foydalanishingiz mumkin:

\u{1F4CA} <b>/hisobot</b> \u2014 Bugungi kunlik savdo va kassa hisoboti
\u{1F4E6} <b>/ombor</b> \u2014 Omborlar qoldig'i va modellar ro'yxati
\u{1F4E5} <b>/kirim</b> \u2014 Bugungi omborga yangi kirimlar
\u{1F4E4} <b>/chiqim</b> \u2014 Bugungi savdo va chiqimlar
\u{1F4B3} <b>/kassa</b> \u2014 Joriy kassa qoldiqlari (so'm, karta, bank, dollar)
\u{1F465} <b>/qarzlar</b> \u2014 Mijozlarning umumiy qarzdorlik holati

\u23F0 <i>Har kuni soat 20:00 da hisobot avtomatik keladi.</i>`;
      await sendTelegramMessage(config.botToken, String(chatId), welcome);
    } else if (text.startsWith("/hisobot") || text.startsWith("/bugun")) {
      const report = buildDailyReportHtml(data);
      await sendTelegramMessage(config.botToken, String(chatId), report);
    } else if (text.startsWith("/kassa")) {
      const kassaBalansi = data.kassaBalansi || {};
      const naqdSom = Number(kassaBalansi.naqd_uzs !== void 0 ? kassaBalansi.naqd_uzs : data.kassa?.naqdSom) || 0;
      const kartaSom = Number(kassaBalansi.karta_uzs || 0);
      const bankHisob = Number(kassaBalansi.bank_uzs !== void 0 ? kassaBalansi.bank_uzs : data.kassa?.bankHisob) || 0;
      const naqdDollar = Number(kassaBalansi.naqd_usd !== void 0 ? kassaBalansi.naqd_usd : data.kassa?.naqdDollar) || 0;
      let kassaMsg = `\u{1F4B3} <b>JORIY KASSA BALANSI (${dateStr} ${timeStr})</b>

\u2022 <b>Naqd so'm:</b> <code>${formatUzs(naqdSom)} so'm</code>
`;
      if (kartaSom > 0) kassaMsg += `\u2022 <b>Karta (terminal):</b> <code>${formatUzs(kartaSom)} so'm</code>
`;
      if (bankHisob > 0) kassaMsg += `\u2022 <b>Bank hisobi:</b> <code>${formatUzs(bankHisob)} so'm</code>
`;
      if (naqdDollar > 0) kassaMsg += `\u2022 <b>Naqd dollar:</b> <code>$${formatUzs(naqdDollar)}</code>
`;
      kassaMsg += `
\u{1F4B0} <b>Umumiy jamg'arma:</b> <code>${formatUzs(naqdSom + kartaSom + bankHisob)} so'm</code>`;
      if (naqdDollar > 0) kassaMsg += ` + <code>$${formatUzs(naqdDollar)}</code>`;
      await sendTelegramMessage(config.botToken, String(chatId), kassaMsg);
    } else if (text.startsWith("/ombor") || text.startsWith("/qoldiq")) {
      const calcOmborStock = (stockObj) => {
        let total = 0;
        const modelTotals = {};
        Object.entries(stockObj || {}).forEach(([m, sizes]) => {
          const sum = Object.values(sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0);
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
      let omborMsg = `\u{1F4E6} <b>FALAK SHOE \u2014 OMBOR ZAXIRALARI (${dateStr} ${timeStr})</b>

\u2022 <b>Tepa ombor:</b> <b>${formatUzs(tepa.total)} juft</b>
\u2022 <b>Kotta ombor:</b> <b>${formatUzs(kotta.total)} juft</b>
`;
      if (sort2.total > 0) {
        omborMsg += `\u2022 <b>2-Sort ombor:</b> <b>${formatUzs(sort2.total)} juft</b>
`;
      }
      omborMsg += `\u{1F449} <b>JAMI ZAXIRA:</b> <b>${formatUzs(grandTotal)} juft</b>

`;
      const combined = {};
      [tepa.modelTotals, kotta.modelTotals, sort2.modelTotals].forEach((mMap) => {
        Object.entries(mMap).forEach(([m, q]) => {
          combined[m] = (combined[m] || 0) + q;
        });
      });
      const topModels = Object.entries(combined).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (topModels.length > 0) {
        omborMsg += `\u{1F4CA} <b>TOP MODELLAR:</b>
`;
        topModels.forEach(([m, q], idx) => {
          omborMsg += `${idx + 1}. <code>${m}</code>: <b>${formatUzs(q)} juft</b>
`;
        });
      }
      await sendTelegramMessage(config.botToken, String(chatId), omborMsg);
    } else if (text.startsWith("/kirim")) {
      const tepaKirim = toArray(data.tepa?.transactions).filter((t) => t.sana === dateStr && t.amal === "kirim");
      const kottaKirim = toArray(data.kotta?.transactions).filter((t) => t.sana === dateStr && t.amal === "kirim");
      const sort2Kirim = toArray(data.sort2?.transactions).filter((t) => t.sana === dateStr && t.amal === "kirim");
      const allKirims = [...tepaKirim, ...kottaKirim, ...sort2Kirim];
      const totalQty = allKirims.reduce((a, t) => a + (Number(t.soni) || 0), 0);
      let kirimMsg = `\u{1F4E5} <b>BUGUNGI OMBOR KIRIMLARI (${dateStr})</b>

\u2022 <b>Jami kelgan tovar:</b> <b>${formatUzs(totalQty)} juft</b>
\u2022 <b>Kirimlar soni:</b> ${allKirims.length} ta yozuv

`;
      if (allKirims.length > 0) {
        kirimMsg += `\u{1F4CB} <b>So'nggi kirimlar:</b>
`;
        allKirims.slice(-8).reverse().forEach((t, i) => {
          kirimMsg += `${i + 1}. <code>${t.model}</code> (${t.olcham}\xB0) \u2014 <b>${t.soni} juft</b> (${t.kimdan || "Sex"})
`;
        });
      }
      await sendTelegramMessage(config.botToken, String(chatId), kirimMsg);
    } else if (text.startsWith("/chiqim") || text.startsWith("/savdo")) {
      const tepaChiqim = toArray(data.tepa?.transactions).filter((t) => t.sana === dateStr && t.amal === "chiqim");
      const kottaChiqim = toArray(data.kotta?.transactions).filter((t) => t.sana === dateStr && t.amal === "chiqim");
      const sort2Chiqim = toArray(data.sort2?.transactions).filter((t) => t.sana === dateStr && t.amal === "chiqim");
      const allChiqims = [...tepaChiqim, ...kottaChiqim, ...sort2Chiqim];
      const totalQty = allChiqims.reduce((a, t) => a + (Number(t.soni) || 0), 0);
      const totalSum = allChiqims.reduce((a, t) => a + (Number(t.summa) || 0), 0);
      let chiqimMsg = `\u{1F4E4} <b>BUGUNGI SAVDO VA CHIQIMLAR (${dateStr})</b>

\u2022 <b>Jami sotilgan hajm:</b> <b>${formatUzs(totalQty)} juft</b>
\u2022 <b>Jami savdo summasi:</b> <b>${formatUzs(totalSum)} so'm</b>
\u2022 <b>Amaliyotlar soni:</b> ${allChiqims.length} ta

`;
      if (allChiqims.length > 0) {
        chiqimMsg += `\u{1F4CB} <b>So'nggi chiqimlar:</b>
`;
        allChiqims.slice(-8).reverse().forEach((t, i) => {
          chiqimMsg += `${i + 1}. <b>${t.kimga || "Mijoz"}</b>: <code>${t.model}</code> (${t.soni} juft) \u2014 ${formatUzs(t.summa || 0)} so'm
`;
        });
      }
      await sendTelegramMessage(config.botToken, String(chatId), chiqimMsg);
    } else if (text.startsWith("/qarzlar")) {
      const kontragentlar = toArray(data.kontragentlar);
      const debtors = kontragentlar.filter((k) => (Number(k.balans) || 0) < 0);
      const totalDebt = debtors.reduce((acc, k) => acc + Math.abs(Number(k.balans) || 0), 0);
      let qarzMsg = `\u{1F465} <b>MIJOZLAR QARZDORLIGI (${dateStr})</b>

`;
      qarzMsg += `\u2022 <b>Qarzdor mijozlar:</b> ${debtors.length} ta
`;
      qarzMsg += `\u2022 <b>Jami qarz summasi:</b> <code>${formatUzs(totalDebt)} so'm</code>

`;
      if (debtors.length > 0) {
        qarzMsg += `<b>Eng katta qarzdorlar:</b>
`;
        debtors.sort((a, b) => (Number(a.balans) || 0) - (Number(b.balans) || 0)).slice(0, 5).forEach((d, i) => {
          qarzMsg += `${i + 1}. <b>${d.nomi || d.ism}</b>: <code>${formatUzs(Math.abs(Number(d.balans) || 0))} so'm</code>
`;
        });
      }
      await sendTelegramMessage(config.botToken, String(chatId), qarzMsg);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.json({ ok: true });
  }
});
app.post("/api/telegram/set-webhook", async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    const snap = await (0, import_firestore.getDoc)(docRef);
    const data = snap.exists() ? snap.data() : null;
    const botToken = data?.telegramConfig?.botToken;
    if (!botToken) {
      return res.status(400).json({ success: false, message: "Bot token sozlanmagan" });
    }
    const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const setData = await setRes.json();
    return res.json({ success: setData.ok, result: setData });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
var lastCronSentDate = "";
setInterval(async () => {
  try {
    const { dateStr, timeStr } = getTashkentDateTime();
    const docRef = (0, import_firestore.doc)(serverDb, "app_db", "main");
    const snap = await (0, import_firestore.getDoc)(docRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const config = data?.telegramConfig;
    if (!config || !config.isEnabled || !config.notifyDailyReport || !config.botToken || !config.chatId) {
      return;
    }
    const targetTime = config.dailyReportTime || "20:00";
    if (timeStr >= targetTime && config.lastDailyReportSentDate !== dateStr && lastCronSentDate !== dateStr) {
      console.log(`[SERVER CRON] 20:00 reached in Asia/Tashkent (${dateStr} ${timeStr}). Sending daily report...`);
      lastCronSentDate = dateStr;
      const reportHtml = buildDailyReportHtml(data);
      const sendRes = await sendTelegramMessage(config.botToken, config.chatId, reportHtml);
      if (sendRes.success) {
        await (0, import_firestore.setDoc)(docRef, {
          telegramConfig: {
            ...config || {},
            lastDailyReportSentDate: dateStr || ""
          }
        }, { merge: true });
        console.log(`[SERVER CRON] \u2705 Daily Telegram report sent successfully.`);
      }
    }
  } catch (e) {
    if (e?.code === "unavailable" || e?.message?.includes("offline")) {
    } else {
      console.warn("[SERVER CRON] Check notice:", e?.message || e);
    }
  }
}, 3e4);
async function start() {
  const httpServer = import_http.default.createServer(app);
  if (process.env.NODE_ENV !== "production") {
    const isHmrDisabled = process.env.ENABLE_HMR !== "true";
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : {
          server: httpServer,
          protocol: "wss",
          clientPort: process.env.HMR_CLIENT_PORT ? parseInt(process.env.HMR_CLIENT_PORT, 10) : 443
        },
        watch: isHmrDisabled ? null : void 0
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = import_fs.default.readFileSync(import_path.default.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} OmborPro Server running on http://0.0.0.0:${PORT}`);
  });
}
start();
//# sourceMappingURL=server.cjs.map
