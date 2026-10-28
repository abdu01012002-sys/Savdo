import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, X, Download, ShieldAlert, ArrowRightLeft } from 'lucide-react';
import { useDb } from '../context/DbContext';
import { exportDatabaseToJson } from '../lib/exportUtils';
import { FastDeviceSyncModal } from './FastDeviceSyncModal';
import { toast } from 'sonner';

export const QuotaExhaustedBanner: React.FC = () => {
  const { db, isQuotaExhausted, quotaDetails, retryFirestoreSync, pullLatestFromCloud, isSyncing } = useDb();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isFastSyncOpen, setIsFastSyncOpen] = useState(false);

  if (!isQuotaExhausted || isDismissed) return null;

  const upgradeUrl = quotaDetails?.upgradeUrl || 
    'https://console.firebase.google.com/project/collective-thought-5q6d2/firestore/databases/ai-studio-7a56a139-809a-4d72-bfc7-2fb48ddde40a/data?openUpgradeDialog=true';

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await pullLatestFromCloud(true);
      await retryFirestoreSync();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownloadBackup = () => {
    try {
      exportDatabaseToJson(db);
      toast.success("✅ Ushbu qurilmadagi barcha ma'lumotlar (chiqimlar, tovarlar) JSON faylga yuklandi! Uni kompyuterga yuborib 'Import' qilsangiz, kompyuterda ham darhol ko'rinadi.", {
        duration: 7000
      });
    } catch (e: any) {
      toast.error("Eksport qilishda xatolik: " + (e?.message || e));
    }
  };

  return (
    <>
      <div 
        role="alert"
        className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-700 text-white px-4 py-3 shadow-xl z-[90] border-b border-amber-400/50 transition-all duration-300 relative"
      >
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left info */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-black/20 shrink-0 mt-0.5 sm:mt-0 shadow-sm backdrop-blur-sm border border-white/20">
              <ShieldAlert className="w-5 h-5 text-amber-200" />
            </div>
            
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-extrabold text-[10px] sm:text-[11px] tracking-wider uppercase bg-white/20 border border-white/30 px-2 py-0.5 rounded-md text-amber-100">
                  Diqqat: Qurilmalararo Sinxronlash To'xtagan
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">
                  Firebase Firestore kunlik yozish kvotasi (Free Spark: 20,000 writes/kun) tugagan
                </h4>
              </div>
              <p className="text-[11px] sm:text-xs text-amber-100/95 leading-relaxed max-w-3xl">
                <strong>Sababi:</strong> Telefonda qilingan chiqim va sotuvlar hozircha telefonning o'z xotirasida saqlanmoqda, ammo Firebase kvotasi tugagani sababli kompyuterga o'tmayapti. Ma'lumotlarni kompyuterga o'tkazish uchun quyidagi <strong>«Tezkor Sinxronlash»</strong> tugmasini bosing yoki Firebase loyihasini <strong>Blaze</strong> tarifiga o'tkazing.
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center ml-auto lg:ml-0">
            <button
              onClick={() => setIsFastSyncOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-all rounded-lg text-xs font-bold shadow-md cursor-pointer border border-blue-400/40"
              title="Telefon va kompyuterni Telegram yoki matnli kod orqali tezkor sinxronlash"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Tezkor Sinxronlash (Telegram / Kod)</span>
            </button>

            <button
              onClick={handleDownloadBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-900 hover:bg-amber-50 active:scale-95 transition-all rounded-lg text-xs font-bold shadow-md cursor-pointer"
              title="Telefondagi ma'lumotlarni JSON fayl ko'rinishida yuklab olish"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              <span>Zaxirani yuklab olish</span>
            </button>

            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/25 hover:bg-black/40 active:scale-95 transition-all rounded-lg text-xs font-semibold text-white border border-white/30"
              title="Firebase konsolida Blaze (Pay as you go) tarifini yoqish — uzluksiz sinxronlash"
            >
              <span>Blaze ga o'tish</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>

            <button
              onClick={handleRetry}
              disabled={isRetrying || isSyncing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 active:scale-95 transition-all rounded-lg text-xs font-medium text-white cursor-pointer"
              title="Kvotani qayta tekshirish"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying || isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Qayta tekshirish</span>
            </button>

            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 rounded-lg hover:bg-black/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Bildirishnomani yopish"
              aria-label="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <FastDeviceSyncModal
        isOpen={isFastSyncOpen}
        onClose={() => setIsFastSyncOpen(false)}
      />
    </>
  );
};
