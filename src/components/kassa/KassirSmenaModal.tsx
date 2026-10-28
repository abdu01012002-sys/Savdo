import React, { useState, useMemo } from 'react';
import { useDb } from '../../context/DbContext';
import { useAudit } from '../../hooks/useAudit';
import { produce } from 'immer';
import { 
  KassaTuri, 
  KassirSmena, 
  DbState 
} from '../../types';
import { 
  formatUzs, 
  formatCompact, 
  getTodayStr, 
  getNowStr, 
  generateId, 
  cn 
} from '../../lib/utils';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  FileText, 
  DollarSign, 
  Wallet, 
  CreditCard, 
  Landmark, 
  Calculator, 
  Printer,
  Sparkles,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { toast } from 'sonner';

interface KassirSmenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenZReport?: (smena: KassirSmena) => void;
}

const KASSA_INFO: Record<KassaTuri, { label: string; icon: any; valyuta: 'UZS' | 'USD'; color: string }> = {
  naqd_uzs: { label: 'Naqd Pul (So\'m)', icon: Wallet, valyuta: 'UZS', color: 'text-emerald-500' },
  naqd_usd: { label: 'Naqd Pul (Dollar $)', icon: DollarSign, valyuta: 'USD', color: 'text-blue-500' },
  karta_uzs: { label: 'Karta (Humo/Uzcard)', icon: CreditCard, valyuta: 'UZS', color: 'text-purple-500' },
  bank_uzs: { label: 'Bank Hisob Raqami', icon: Landmark, valyuta: 'UZS', color: 'text-amber-500' },
};

export const KassirSmenaModal: React.FC<KassirSmenaModalProps> = ({ isOpen, onClose, onOpenZReport }) => {
  const { db, setDb, currentUser } = useDb();
  const { logAudit } = useAudit();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const joriySmena = db.joriySmena;
  const isSmenaOpen = Boolean(joriySmena && joriySmena.status === 'ochiq');

  const kassaBalansi = db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
  const valyutaKursi = db.valyutaKursi || 12850;

  // Smena yopishda sanalgan real summalar
  const [actualCounts, setActualCounts] = useState<Record<KassaTuri, string>>({
    naqd_uzs: '',
    naqd_usd: '',
    karta_uzs: '',
    bank_uzs: ''
  });
  const [closeNote, setCloseNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Smena davomidagi operatsiyalar tahlili (agar smena ochiq bo'lsa)
  const shiftStats = useMemo(() => {
    if (!joriySmena) return { kirimUzs: 0, chiqimUzs: 0, count: 0 };

    const shiftStartTime = joriySmena.ochilganVaqt;
    const shiftTxs = (db.kassaHarakatlari || []).filter(h => {
      const hTime = `${h.sana} ${h.vaqt || ''}`;
      return hTime >= shiftStartTime;
    });

    let kirimUzs = 0;
    let chiqimUzs = 0;

    shiftTxs.forEach(h => {
      const sumUzs = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || valyutaKursi) : h.summa);
      if (h.tur === 'kirim') kirimUzs += sumUzs;
      if (h.tur === 'chiqim') chiqimUzs += sumUzs;
    });

    return { kirimUzs, chiqimUzs, count: shiftTxs.length };
  }, [joriySmena, db.kassaHarakatlari, valyutaKursi]);

  // Smena ochish
  const handleOpenShift = () => {
    setIsSubmitting(true);
    try {
      const nextZNum = (db.smenalar?.length || 0) + 1;
      const newSmena: KassirSmena = {
        id: generateId(),
        zReportNumber: nextZNum,
        ochilganVaqt: getNowStr(),
        ochganXodim: currentUser?.ism || 'Kassir',
        status: 'ochiq',
        boshlangichKassa: {
          naqd_uzs: Number(kassaBalansi.naqd_uzs || 0),
          naqd_usd: Number(kassaBalansi.naqd_usd || 0),
          karta_uzs: Number(kassaBalansi.karta_uzs || 0),
          bank_uzs: Number(kassaBalansi.bank_uzs || 0),
        }
      };

      setDb(produce((draft: DbState) => {
        draft.joriySmena = newSmena;
      }));

      logAudit('open_shift', 'Kassa', `Kassir smenasi ochildi (Z-${nextZNum}). Xodim: ${newSmena.ochganXodim}`);
      toast.success(`✅ Smena muvaffaqiyatli ochildi! (Z-Hisobot #${nextZNum})`);
      onClose();
    } catch (e: any) {
      toast.error("Xatolik: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Smena yopish (Z-Hisobot yaratish)
  const handleCloseShift = () => {
    if (!joriySmena) return;
    setIsSubmitting(true);

    try {
      const yopilganVaqt = getNowStr();
      const realCountsNum: Record<KassaTuri, number> = {
        naqd_uzs: parseFloat(actualCounts.naqd_uzs) || 0,
        naqd_usd: parseFloat(actualCounts.naqd_usd) || 0,
        karta_uzs: parseFloat(actualCounts.karta_uzs) || 0,
        bank_uzs: parseFloat(actualCounts.bank_uzs) || 0,
      };

      const kutilganKassa: Record<KassaTuri, number> = {
        naqd_uzs: Number(kassaBalansi.naqd_uzs || 0),
        naqd_usd: Number(kassaBalansi.naqd_usd || 0),
        karta_uzs: Number(kassaBalansi.karta_uzs || 0),
        bank_uzs: Number(kassaBalansi.bank_uzs || 0),
      };

      const farqlar: Record<KassaTuri, number> = {
        naqd_uzs: realCountsNum.naqd_uzs - kutilganKassa.naqd_uzs,
        naqd_usd: realCountsNum.naqd_usd - kutilganKassa.naqd_usd,
        karta_uzs: realCountsNum.karta_uzs - kutilganKassa.karta_uzs,
        bank_uzs: realCountsNum.bank_uzs - kutilganKassa.bank_uzs,
      };

      const completedSmena: KassirSmena = {
        ...joriySmena,
        status: 'yopilgan',
        yopilganVaqt,
        yopganXodim: currentUser?.ism || 'Kassir',
        yopilishKassa: realCountsNum,
        kutilganKassa,
        farqlar,
        jamiSavdoKirimUzs: shiftStats.kirimUzs,
        jamiXarajatChiqimUzs: shiftStats.chiqimUzs,
        izoh: closeNote.trim()
      };

      setDb(produce((draft: DbState) => {
        if (!draft.smenalar) draft.smenalar = [];
        draft.smenalar.unshift(completedSmena);
        draft.joriySmena = null;
      }));

      logAudit(
        'close_shift', 
        'Kassa', 
        `Smena yopildi (Z-${completedSmena.zReportNumber}). Tushum: ${formatCompact(shiftStats.kirimUzs)} UZS, Chiqim: ${formatCompact(shiftStats.chiqimUzs)} UZS`
      );

      toast.success(`🎉 Smena yopildi va Z-Hisobot #${completedSmena.zReportNumber} shakllantirildi!`);
      onClose();
      if (onOpenZReport) {
        onOpenZReport(completedSmena);
      }
    } catch (e: any) {
      toast.error("Xatolik: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 sticky top-0 bg-[var(--bg2)] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">
                {isSmenaOpen ? "Smenani Yopish & Z-Hisobot" : "Yangi Smena Ochish"}
              </h3>
              <p className="text-xs text-[var(--text3)]">
                Kassir qoldig'i, tushumlar va kassa audit nazorati
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--bg)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* A) SMENA OCHILMAGAN BO'LSA - SMENA OCHISH */}
        {/* ========================================================================= */}
        {!isSmenaOpen ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-300 space-y-2">
              <span className="font-bold flex items-center gap-1.5">
                <Sparkles size={14} />
                Smena ochish tartibi:
              </span>
              <p className="leading-relaxed">
                Smena ochilganda tizim joriy kassa qoldiqlarini boshlang'ich kassa sifatida belgilaydi. Kun oxirida Z-Hisobot topshirilganda tizim kutilgan summa va haqiqiy sanalgan naqd pulni avtomatik solishtiradi.
              </p>
            </div>

            {/* Boshlang'ich Kassa Qoldiqlari */}
            <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5">
              <span className="text-[10px] font-black uppercase text-[var(--text3)]">
                Boshlang'ich Kassa Qoldiqlari (Qabul qilinmoqda):
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(KASSA_INFO) as KassaTuri[]).map(k => (
                  <div key={k} className="p-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] flex flex-col">
                    <span className="text-[10px] text-[var(--text3)] font-bold truncate">{KASSA_INFO[k].label}</span>
                    <span className="text-xs font-black text-[var(--text)] tabular-nums">
                      {Number(kassaBalansi[k] || 0).toLocaleString()} {KASSA_INFO[k].valyuta}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs">
              <span className="text-[var(--text3)]">Kassir / Mas'ul shaxs:</span>
              <span className="font-black text-[var(--text)]">{currentUser?.ism || 'Foydalanuvchi'}</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 pb-1 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg2)] z-10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleOpenShift}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Smenani Ochish</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* B) SMENA OCHIQ BO'LSA - SMENA YOPISH & Z-HISOBOT */
          /* ========================================================================= */
          <div className="space-y-4">
            {/* Smena metrikalari */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text3)] block">Z-Hisobot:</span>
                <span className="font-black text-purple-600 dark:text-purple-400">#{joriySmena.zReportNumber}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text3)] block">Ochilgan vaqti:</span>
                <span className="font-bold text-[var(--text)]">{joriySmena.ochilganVaqt}</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] text-[var(--text3)] block">Kassir:</span>
                <span className="font-bold text-[var(--text)]">{joriySmena.ochganXodim}</span>
              </div>
            </div>

            {/* Smena davomidagi tushum va xarajat */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Jami Kirim / Tushum</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatUzs(shiftStats.kirimUzs)} UZS
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col">
                <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">Jami Chiqim / Xarajat</span>
                <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums">
                  -{formatUzs(shiftStats.chiqimUzs)} UZS
                </span>
              </div>
            </div>

            {/* Haqiqiy sanalgan kassa pullarini kiritish & Discrepancy Checker */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black uppercase text-[var(--text3)] block">
                Haqiqiy Sanalgan Naqd Pulni Kiriting:
              </span>

              {(Object.keys(KASSA_INFO) as KassaTuri[]).map(k => {
                const kutilgan = Number(kassaBalansi[k] || 0);
                const sanalgan = parseFloat(actualCounts[k]) || 0;
                const farq = sanalgan - kutilgan;
                const hasInput = actualCounts[k] !== '';

                return (
                  <div key={k} className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        {KASSA_INFO[k].label}
                      </span>
                      <span className="text-[11px] text-[var(--text3)]">
                        Tizim hisobi: <strong className="text-[var(--text)]">{kutilgan.toLocaleString()} {KASSA_INFO[k].valyuta}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder={`Sanalgan ${KASSA_INFO[k].valyuta}`}
                        value={actualCounts[k]}
                        onChange={e => setActualCounts(prev => ({ ...prev, [k]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => setActualCounts(prev => ({ ...prev, [k]: kutilgan.toString() }))}
                        className="px-2.5 py-1.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-[10px] font-bold text-[var(--text3)] hover:text-[var(--text)] hover:border-purple-500 cursor-pointer"
                        title="Tizim hisobidagi summani to'ldirish"
                      >
                        Mos keldi ({kutilgan.toLocaleString()})
                      </button>
                    </div>

                    {/* Farq ko'rsatkichi */}
                    {hasInput && (
                      <div className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-lg flex items-center justify-between",
                        farq === 0 ? "bg-emerald-500/10 text-emerald-600" :
                        farq > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                        "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                      )}>
                        <span>
                          {farq === 0 ? "✅ Kassa aniq mos keldi" :
                           farq > 0 ? "🟢 Ortiqcha pul (Izlishek)" :
                           "🔴 Kamomad (Nedostacha / Yetishmovchilik)"}
                        </span>
                        <span className="font-black tabular-nums">
                          {farq > 0 ? `+${farq.toLocaleString()}` : farq.toLocaleString()} {KASSA_INFO[k].valyuta}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Izoh */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-[var(--text3)]">Z-Hisobot izohi (ixtiyoriy)</label>
              <input
                type="text"
                value={closeNote}
                onChange={e => setCloseNote(e.target.value)}
                placeholder="Masalan: Inkassatsiyaga topshirildi..."
                className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 pb-1 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg2)] z-10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleCloseShift}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 text-white text-xs font-black shadow-md shadow-rose-600/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={14} />
                <span>Smenani Yopish & Z-Hisobot</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
