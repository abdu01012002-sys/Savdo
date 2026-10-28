import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Monitor, 
  Copy, 
  Check, 
  Download, 
  Upload, 
  RefreshCw, 
  ExternalLink, 
  ShieldAlert, 
  Sparkles,
  ArrowRightLeft,
  FileJson,
  Send,
  AlertTriangle
} from 'lucide-react';
import { useDb } from '../context/DbContext';
import { exportDatabaseToJson } from '../lib/exportUtils';
import { 
  mergeTransactionsDeduplicated, 
  mergeKontragentlarDeduplicated, 
  mergeStockObjects,
  normalizeTransaction,
  normalizeKontragent,
  normalizeStockObject,
  restoreAllHistoricalRecordsFromCloud
} from '../lib/firestoreSyncService';
import { DbState, Transaction, Kontragent } from '../types';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface FastDeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FastDeviceSyncModal: React.FC<FastDeviceSyncModalProps> = ({ isOpen, onClose }) => {
  const { db, setDb, isQuotaExhausted, pullLatestFromCloud, retryFirestoreSync, isSyncing } = useDb();
  const [activeTab, setActiveTab] = useState<'telegram' | 'file' | 'firebase'>('telegram');
  const [isCopied, setIsCopied] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportScope, setExportScope] = useState<'today' | 'recent' | 'all'>('today');

  if (!isOpen) return null;

  // Generate payload for Telegram/text sync
  const generateSyncPayload = () => {
    const today = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const filterTx = (txs: Transaction[]) => {
      if (!Array.isArray(txs)) return [];
      if (exportScope === 'today') {
        return txs.filter(t => t.sana === today || (t.vaqt && t.vaqt.startsWith(today)));
      }
      if (exportScope === 'recent') {
        return txs.filter(t => (t.sana || '') >= threeDaysAgo);
      }
      return txs.slice(0, 300); // keep reasonable size
    };

    const tepaTx = filterTx(db.tepa?.transactions || []);
    const kottaTx = filterTx(db.kotta?.transactions || []);
    const sort2Tx = filterTx(db.sort2?.transactions || []);

    const payload = {
      type: 'FALAK_SYNC_PAYLOAD_V1',
      createdAt: new Date().toISOString(),
      scope: exportScope,
      tepa: {
        stock: db.tepa?.stock || {},
        transactions: tepaTx
      },
      kotta: {
        stock: db.kotta?.stock || {},
        transactions: kottaTx
      },
      sort2: {
        stock: db.sort2?.stock || {},
        transactions: sort2Tx
      },
      kontragentlar: db.kontragentlar || [],
      kassaHarakatlari: (db.kassaHarakatlari || []).slice(0, 100),
      kassaBalansi: db.kassaBalansi || null
    };

    return JSON.stringify(payload);
  };

  const handleCopyCode = () => {
    try {
      const json = generateSyncPayload();
      navigator.clipboard.writeText(json);
      setIsCopied(true);
      toast.success("✅ Sinxronlash kodi xotiraga nusxalandi! Endi Telegram orqali boshqa qurilmaga yuboring.", {
        duration: 4000
      });
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      toast.error("Nusxalashda xatolik yuz berdi. Matnni belgilab nusxalang.");
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setInputText(text.trim());
        toast.info("Buferdagi matn joylandi!");
      } else {
        toast.error("Xotirada nusxalangan matn topilmadi.");
      }
    } catch {
      toast.error("Brauzer xotiradan o'qishga ruxsat bermadi. Matnni qo'lda joylang (Ctrl+V / Qo'yish).");
    }
  };

  const handleApplySyncPayload = (data: any) => {
    if (!data || typeof data !== 'object') {
      toast.error("Noto'g'ri ma'lumot formati!");
      return;
    }

    setIsProcessing(true);
    try {
      let addedTxsCount = 0;
      let addedClientsCount = 0;

      setDb(prev => {
        const next = JSON.parse(JSON.stringify(prev)) as DbState;

        // 1. Transactions Merge
        const inTepaTx = Array.isArray(data.tepa?.transactions) ? data.tepa.transactions : [];
        const inKottaTx = Array.isArray(data.kotta?.transactions) ? data.kotta.transactions : [];
        const inSort2Tx = Array.isArray(data.sort2?.transactions) ? data.sort2.transactions : [];

        const prevTepaLen = next.tepa?.transactions?.length || 0;
        const prevKottaLen = next.kotta?.transactions?.length || 0;

        next.tepa.transactions = mergeTransactionsDeduplicated(next.tepa?.transactions || [], inTepaTx);
        next.kotta.transactions = mergeTransactionsDeduplicated(next.kotta?.transactions || [], inKottaTx);
        if (!next.sort2) next.sort2 = { stock: {}, transactions: [] };
        next.sort2.transactions = mergeTransactionsDeduplicated(next.sort2?.transactions || [], inSort2Tx);

        addedTxsCount = (next.tepa.transactions.length - prevTepaLen) + (next.kotta.transactions.length - prevKottaLen);

        // 2. Stock Merge
        if (data.tepa?.stock) {
          next.tepa.stock = mergeStockObjects(next.tepa.stock, data.tepa.stock);
        }
        if (data.kotta?.stock) {
          next.kotta.stock = mergeStockObjects(next.kotta.stock, data.kotta.stock);
        }
        if (data.sort2?.stock) {
          next.sort2.stock = mergeStockObjects(next.sort2.stock, data.sort2.stock);
        }

        // 3. Kontragentlar Merge
        if (Array.isArray(data.kontragentlar) && data.kontragentlar.length > 0) {
          const prevClientsLen = next.kontragentlar?.length || 0;
          next.kontragentlar = mergeKontragentlarDeduplicated(next.kontragentlar || [], data.kontragentlar);
          addedClientsCount = next.kontragentlar.length - prevClientsLen;
        }

        // 4. Kassa Merge
        if (Array.isArray(data.kassaHarakatlari) && data.kassaHarakatlari.length > 0) {
          const seen = new Set((next.kassaHarakatlari || []).map(k => `${k.sana}_${k.vaqt}_${k.summa}_${k.tur}`));
          data.kassaHarakatlari.forEach((kh: any) => {
            const sig = `${kh.sana}_${kh.vaqt}_${kh.summa}_${kh.tur}`;
            if (!seen.has(sig)) {
              seen.add(sig);
              next.kassaHarakatlari.push(kh);
            }
          });
        }

        return next;
      });

      toast.success(
        `✅ Birlashtirildi! ${addedTxsCount > 0 ? `+${addedTxsCount} ta yangi operatsiya qo'shildi.` : "Yangi operatsiyalar tekshirildi."} ${addedClientsCount > 0 ? `+${addedClientsCount} ta yangi mijoz saqlandi.` : ""}`,
        { duration: 5000 }
      );
      setInputText('');
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error("Ma'lumotlarni birlashtirishda xatolik: " + (e?.message || e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyText = () => {
    if (!inputText.trim()) {
      toast.error("Matn maydoniga sinxronlash kodini joylang!");
      return;
    }
    try {
      const parsed = JSON.parse(inputText.trim());
      handleApplySyncPayload(parsed);
    } catch {
      toast.error("Kiritilgan matn to'g'ri JSON formatida emas. Iltimos, Telegramdan to'liq nusxalab joylang.");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        handleApplySyncPayload(parsed);
      } catch {
        toast.error("Fayl o'qishda xatolik yoki noto'g'ri JSON fayl!");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreArchive = async () => {
    setIsProcessing(true);
    try {
      const res = await restoreAllHistoricalRecordsFromCloud(db);
      if (res.recoveredCount.tepa > 0 || res.recoveredCount.kotta > 0) {
        setDb(res.updatedDb);
        toast.success(`✅ ${res.recoveredCount.tepa + res.recoveredCount.kotta} ta tarixiy amallar va ${res.recoveredCount.otkazmalar} ta o'tkazma muvaffaqiyatli tiklandi!`);
      } else {
        toast.info("Barcha tarixiy amallar allaqachon to'liq tiklangan.");
      }
    } catch (e: any) {
      toast.error("Arxivni tiklashda xatolik: " + (e?.message || e));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[120] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-[var(--text)] leading-tight">
                Qurilmalararo Tezkor Sinxronlash
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--text3)]">
                Telefon ⇄ Kompyuter o'rtasida ma'lumotlarni uzluksiz yangilash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
            title="Yopish"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Callout if Quota is exhausted */}
        {isQuotaExhausted && (
          <div className="bg-amber-500/10 border-b border-amber-500/25 px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-500">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span className="truncate">
                Firebase bepul kvotasi to'lgan: quyidagi Telegram yoki Fayl usulida 1 daqiqada sinxronlang!
              </span>
            </div>
            <button
              onClick={() => setActiveTab('firebase')}
              className="text-[11px] font-bold underline shrink-0 cursor-pointer hover:text-amber-400"
            >
              Batafsil
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 border-b border-[var(--border)] bg-[var(--bg)] text-xs font-bold">
          <button
            onClick={() => setActiveTab('telegram')}
            className={cn(
              "py-3 px-2 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer",
              activeTab === 'telegram'
                ? "border-blue-500 text-blue-500 bg-blue-500/5"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram / Matn</span>
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={cn(
              "py-3 px-2 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer",
              activeTab === 'file'
                ? "border-emerald-500 text-emerald-500 bg-emerald-500/5"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON Fayl</span>
          </button>
          <button
            onClick={() => setActiveTab('firebase')}
            className={cn(
              "py-3 px-2 flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer",
              activeTab === 'firebase'
                ? "border-amber-500 text-amber-500 bg-amber-500/5"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bulut (Blaze)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: TELEGRAM / TEXT */}
          {activeTab === 'telegram' && (
            <div className="space-y-6">
              {/* Step 1: Export from this device */}
              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-500 text-xs font-black flex items-center justify-center">1</span>
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      Ushbu qurilmadan yuborish (Nusxalash)
                    </h4>
                  </div>
                  {/* Scope filter */}
                  <div className="flex items-center gap-1 bg-[var(--bg2)] p-0.5 rounded-lg border border-[var(--border)] text-[10px]">
                    <button
                      onClick={() => setExportScope('today')}
                      className={cn("px-2 py-0.5 rounded-md transition-all font-bold", exportScope === 'today' ? "bg-blue-500 text-white" : "text-[var(--text3)]")}
                    >
                      Bugungi
                    </button>
                    <button
                      onClick={() => setExportScope('recent')}
                      className={cn("px-2 py-0.5 rounded-md transition-all font-bold", exportScope === 'recent' ? "bg-blue-500 text-white" : "text-[var(--text3)]")}
                    >
                      3 kunlik
                    </button>
                    <button
                      onClick={() => setExportScope('all')}
                      className={cn("px-2 py-0.5 rounded-md transition-all font-bold", exportScope === 'all' ? "bg-blue-500 text-white" : "text-[var(--text3)]")}
                    >
                      Hammasi
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-[var(--text3)] leading-relaxed">
                  Telefondagi barcha yangi chiqim va harakatlarni bitta tugma orqali nusxalab, Telegram orqali kompyuteringizga yuboring.
                </p>

                <button
                  onClick={handleCopyCode}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-98 transition-all cursor-pointer"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{isCopied ? "Nusxalandi! Telegramga joylang" : "Telegram uchun Sinxron Kodini Nusxalash"}</span>
                </button>
              </div>

              {/* Step 2: Import into this device */}
              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-black flex items-center justify-center">2</span>
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                      Boshqa qurilmadan qabul qilish (Birlashtirish)
                    </h4>
                  </div>
                  <button
                    onClick={handlePasteFromClipboard}
                    className="text-[11px] font-bold text-blue-500 hover:underline cursor-pointer"
                  >
                    Buferdan joylash
                  </button>
                </div>

                <p className="text-[11px] text-[var(--text3)] leading-relaxed">
                  Telegram orqali kelgan sinxron kodini quyidagi maydonga joylang va «Birlashtirish» tugmasini bosing:
                </p>

                <textarea
                  rows={3}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder='Telegramdan nusxalangan kodni bu yerga joylang (Ctrl+V / Paste)...'
                  className="w-full p-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] font-mono resize-none focus:outline-none focus:border-blue-500"
                />

                <button
                  onClick={handleApplyText}
                  disabled={isProcessing || !inputText.trim()}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-98 transition-all cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Ma'lumotlarni Xavfsiz Birlashtirish</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: JSON FILE */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                    1. Telefondan zaxirani yuklab olish
                  </h4>
                  <p className="text-[11px] text-[var(--text3)]">
                    Telefondagi to'liq bazani fayl ko'rinishida (.json) saqlab oling.
                  </p>
                </div>
                <button
                  onClick={() => exportDatabaseToJson(db)}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Fayl yuklab olish</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                    2. Kompyuterda faylni birlashtirish
                  </h4>
                  <p className="text-[11px] text-[var(--text3)]">
                    Yuklangan JSON faylni tanlang. Barcha yangi chiqimlar xavfsiz qo'shiladi.
                  </p>
                </div>
                <label className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-sm text-center">
                  <Upload className="w-4 h-4" />
                  <span>JSON Faylni Tanlash</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: FIREBASE BLAZE GUIDE */}
          {activeTab === 'firebase' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-xs sm:text-sm">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Nega bu holat yuz berdi?</span>
                </div>
                <p className="text-xs text-[var(--text)] leading-relaxed">
                  Firebase Firestore bepul Spark tarifida kuniga <strong>20 000 ta yozish</strong> limiti mavjud. Chiqim va savdolar ko'payganda yoki bir nechta xodim ishlaganda bu limit tugab qolishi mumkin.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <h4 className="text-xs sm:text-sm font-bold text-[var(--text)]">
                  Doimiy cheksiz sinxronlash (Blaze tarifi):
                </h4>
                <ol className="text-xs text-[var(--text3)] space-y-2 list-decimal pl-4 leading-relaxed">
                  <li>Quyidagi tugma orqali Firebase Console loyiha sahifasini oching.</li>
                  <li>Pastki chap burchakdagi <strong>«Upgrade»</strong> tugmasini bosib, <strong>«Blaze (Pay as you go)»</strong> rejasini tanlang.</li>
                  <li>Shundan so'ng barcha telefon va kompyuterlar hech qanday kod yoki fayl ko'chirishsiz soniyalar ichida avtomatik sinxronlashadi.</li>
                </ol>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <a
                    href="https://console.firebase.google.com/project/collective-thought-5q6d2/usage"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer text-center"
                  >
                    <span>Firebase Blaze ga o'tish</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    onClick={() => {
                      retryFirestoreSync();
                      pullLatestFromCloud(true);
                    }}
                    disabled={isSyncing}
                    className="py-2.5 px-4 bg-[var(--bg2)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text)] font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    <span>Bulutni Qayta Tekshirish</span>
                  </button>
                </div>
              </div>

              {/* Archive Data Recovery Card */}
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-500 font-bold text-xs sm:text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>Tarixiy ma'lumotlar arxivi (3 300+ operatsiya)</span>
                  </div>
                  <button
                    onClick={handleRestoreArchive}
                    disabled={isProcessing}
                    className="py-1.5 px-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isProcessing && "animate-spin")} />
                    <span>Arxivni Tiklash</span>
                  </button>
                </div>
                <p className="text-[11px] text-[var(--text3)] leading-relaxed">
                  Agar avvalgi oylar (iyul, avgust, sentabr) kiritilgan kirim, chiqim yoki o'tkazmalar ko'rinmayotgan bo'lsa, ushbu tugma orqali barcha 3 300 dan ortiq arxiv operatsiyalari qayta tiklanadi.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between text-xs text-[var(--text3)]">
          <span>OmborPro Xavfsiz Sinxronizatsiya</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--bg2)] hover:bg-[var(--border)] text-[var(--text)] font-semibold rounded-lg cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
};
