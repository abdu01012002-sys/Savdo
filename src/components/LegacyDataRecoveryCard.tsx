import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ArrowRight, 
  Search, 
  Clock, 
  Sparkles,
  Users,
  ShoppingBag,
  ArrowRightLeft,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

export const LegacyDataRecoveryCard: React.FC = () => {
  const { scanAndRestoreLegacyData, isMigrating, db } = useDb();
  const [scanResult, setScanResult] = useState<{
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
  } | null>(null);

  const handleRunScan = async () => {
    try {
      const res = await scanAndRestoreLegacyData(true);
      setScanResult(res);
    } catch (e: any) {
      toast.error("Ma'lumotlarni tiklashda xatolik yuz berdi");
    }
  };

  const currentTotalTx = (db.tepa?.transactions || []).length + (db.kotta?.transactions || []).length;
  const currentClients = (db.kontragentlar || []).length;

  return (
    <div className="bg-[var(--bg2)] border border-[#8b5cf6]/30 hover:border-[#8b5cf6]/50 transition-all rounded-2xl p-6 shadow-sm flex flex-col gap-5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-[#8b5cf6] border border-purple-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-black text-[var(--text)]">
                Firebase / Claucy Eski Baza Ma'lumotlarini Qidirish va Tiklash
              </h3>
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/15 text-[#8b5cf6] px-2.5 py-0.5 rounded-full border border-purple-500/20">
                Avto-Migratsiya
              </span>
            </div>
            <p className="text-xs text-[var(--text3)] mt-1 leading-relaxed">
              Avvalgi ilovangiz (Claude / Claucy) tomonidan Firestore'da alohida saqlangan barcha tarix (kirim-chiqim, mijozlar, o'tkazmalar, kassa) ma'lumotlarini aniqlab, yangi tizimga to'liq birlashtiradi.
            </p>
          </div>
        </div>
      </div>

      {/* Current DB State Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
          <span className="text-[11px] font-bold text-[var(--text3)] flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
            Jami Kirim/Chiqim
          </span>
          <span className="text-base font-black text-[var(--text)] mt-1">
            {currentTotalTx.toLocaleString()} ta
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
          <span className="text-[11px] font-bold text-[var(--text3)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            Mijozlar Bazasida
          </span>
          <span className="text-base font-black text-[var(--text)] mt-1">
            {currentClients.toLocaleString()} ta
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
          <span className="text-[11px] font-bold text-[var(--text3)] flex items-center gap-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-purple-500" />
            O'tkazmalar
          </span>
          <span className="text-base font-black text-[var(--text)] mt-1">
            {(db.otkazmalar || []).length.toLocaleString()} ta
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
          <span className="text-[11px] font-bold text-[var(--text3)] flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-amber-500" />
            Kassa Harakatlari
          </span>
          <span className="text-base font-black text-[var(--text)] mt-1">
            {(db.kassaHarakatlari || []).length.toLocaleString()} ta
          </span>
        </div>
      </div>

      {/* Action Button & Explanations */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2 text-xs text-[var(--text3)]">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span>
            Barcha <code>ombor_data</code>, <code>transactions</code>, <code>history</code>, <code>kontragentlar</code> va boshqa Firestore kolleksiyalari to'liq skanerlanadi.
          </span>
        </div>

        <button
          onClick={handleRunScan}
          disabled={isMigrating}
          className="py-3.5 px-6 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-500/25 active:scale-[0.98] cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isMigrating ? 'animate-spin' : ''}`} />
          <span>{isMigrating ? "Qidirilmoqda va tiklanmoqda..." : "Eski Ma'lumotlarni Qidirish & Tiklash"}</span>
        </button>
      </div>

      {/* Results Log if scanned */}
      {scanResult && (
        <div className="mt-2 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 flex flex-col gap-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Skanerlash Natijasi:
            </span>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full">
              {scanResult.foundSourcesCount} ta manba topildi
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)]">
              <div className="text-[10px] text-[var(--text3)] font-semibold">Tiklandi (Kirim/Chiqim):</div>
              <div className="font-bold text-[var(--text)] mt-0.5">{scanResult.recoveredRecordsCount.transactions} ta</div>
            </div>
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)]">
              <div className="text-[10px] text-[var(--text3)] font-semibold">Tiklandi (Mijozlar):</div>
              <div className="font-bold text-[var(--text)] mt-0.5">{scanResult.recoveredRecordsCount.kontragentlar} ta</div>
            </div>
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)]">
              <div className="text-[10px] text-[var(--text3)] font-semibold">Tiklandi (O'tkazmalar):</div>
              <div className="font-bold text-[var(--text)] mt-0.5">{scanResult.recoveredRecordsCount.otkazmalar} ta</div>
            </div>
            <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)]">
              <div className="text-[10px] text-[var(--text3)] font-semibold">Tiklandi (Kassa):</div>
              <div className="font-bold text-[var(--text)] mt-0.5">{scanResult.recoveredRecordsCount.kassa} ta</div>
            </div>
          </div>

          {scanResult.details.length > 0 && (
            <div className="text-[11px] text-[var(--text3)] font-mono bg-[var(--bg)] p-2.5 rounded-lg border border-[var(--border)] max-h-24 overflow-y-auto space-y-0.5">
              {scanResult.details.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span>✓</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
