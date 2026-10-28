import React, { useState, useMemo } from 'react';
import { useDb } from '../../context/DbContext';
import { useAudit } from '../../hooks/useAudit';
import { produce } from 'immer';
import { 
  KassaTuri, 
  KassaTransfer, 
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
  ArrowRight, 
  ArrowLeftRight, 
  DollarSign, 
  Wallet, 
  CreditCard, 
  Landmark, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import { toast } from 'sonner';

interface KassaTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFromKassa?: KassaTuri;
}

const KASSA_INFO: Record<KassaTuri, { label: string; icon: any; valyuta: 'UZS' | 'USD'; color: string; bg: string }> = {
  naqd_uzs: { label: 'Naqd Pul (So\'m)', icon: Wallet, valyuta: 'UZS', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  naqd_usd: { label: 'Naqd Pul (Dollar $)', icon: DollarSign, valyuta: 'USD', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  karta_uzs: { label: 'Karta (Humo/Uzcard)', icon: CreditCard, valyuta: 'UZS', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  bank_uzs: { label: 'Bank Hisob Raqami', icon: Landmark, valyuta: 'UZS', color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

export const KassaTransferModal: React.FC<KassaTransferModalProps> = ({ isOpen, onClose, initialFromKassa }) => {
  const { db, setDb, currentUser } = useDb();
  const { logAudit } = useAudit();

  const [fromKassa, setFromKassa] = useState<KassaTuri>(initialFromKassa || 'naqd_usd');
  const [toKassa, setToKassa] = useState<KassaTuri>(initialFromKassa === 'naqd_uzs' ? 'karta_uzs' : 'naqd_uzs');
  const [fromSumma, setFromSumma] = useState<string>('');

  React.useEffect(() => {
    if (isOpen && initialFromKassa) {
      setFromKassa(initialFromKassa);
      if (initialFromKassa === 'naqd_uzs') setToKassa('karta_uzs');
      else setToKassa('naqd_uzs');
    }
  }, [isOpen, initialFromKassa]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  const defaultRate = db.valyutaKursi || 12850;
  const cbuRate = db.valyutaKursConfig?.cbuKurs || defaultRate;
  const [customKurs, setCustomKurs] = useState<number>(defaultRate);
  const [izoh, setIzoh] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const kassaBalansi = db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
  const fromBalans = kassaBalansi[fromKassa] || 0;
  const toBalans = kassaBalansi[toKassa] || 0;

  const fromValyuta = KASSA_INFO[fromKassa].valyuta;
  const toValyuta = KASSA_INFO[toKassa].valyuta;
  const isConversion = fromValyuta !== toValyuta;

  const numFromSumma = parseFloat(fromSumma) || 0;

  // Hisoblangan Qabul qilinuvchi summa
  const calculatedToSumma = useMemo(() => {
    if (numFromSumma <= 0) return 0;
    if (fromValyuta === 'USD' && toValyuta === 'UZS') {
      return numFromSumma * customKurs;
    }
    if (fromValyuta === 'UZS' && toValyuta === 'USD') {
      return customKurs > 0 ? numFromSumma / customKurs : 0;
    }
    return numFromSumma; // Same currency
  }, [numFromSumma, fromValyuta, toValyuta, customKurs]);

  // Forex Gain / Loss (Valyuta kursi farqidan kelib chiqqan foyda yoki zarar)
  const forexGainLoss = useMemo(() => {
    if (!isConversion || numFromSumma <= 0) return 0;
    // Agar USD -> UZS bo'lsa va customKurs > cbuRate bo'lsa, musbat (foyda), aks holda zarar
    if (fromValyuta === 'USD' && toValyuta === 'UZS') {
      const diffPerDollar = customKurs - cbuRate;
      return diffPerDollar * numFromSumma;
    }
    // Agar UZS -> USD bo'lsa
    if (fromValyuta === 'UZS' && toValyuta === 'USD') {
      const cbuDollars = numFromSumma / cbuRate;
      const actualDollars = calculatedToSumma;
      return (actualDollars - cbuDollars) * cbuRate;
    }
    return 0;
  }, [isConversion, numFromSumma, fromValyuta, toValyuta, customKurs, cbuRate, calculatedToSumma]);

  if (!isOpen) return null;

  const handleSwap = () => {
    const prevFrom = fromKassa;
    setFromKassa(toKassa);
    setToKassa(prevFrom);
    setFromSumma('');
  };

  const handleTransfer = () => {
    if (numFromSumma <= 0) {
      toast.error("Iltimos, o'tkazma summasini kiriting!");
      return;
    }

    if (numFromSumma > fromBalans) {
      toast.error(`❌ Manba hisobda yetarli mablag' yo'q! Mavjud: ${fromBalans} ${fromValyuta}`);
      return;
    }

    if (fromKassa === toKassa) {
      toast.error("Bir xil hisoblar o'rtasida o'tkazma qilib bo'lmaydi!");
      return;
    }

    setIsSubmitting(true);

    try {
      const txId = generateId();
      const sana = getTodayStr();
      const vaqt = getNowStr();
      const transferRecord: KassaTransfer = {
        id: txId,
        sana,
        vaqt,
        fromKassa,
        toKassa,
        fromSumma: numFromSumma,
        fromValyuta,
        toSumma: calculatedToSumma,
        toValyuta,
        kurs: customKurs,
        cbuKurs: cbuRate,
        forexGainLossUzs: Math.round(forexGainLoss),
        xodim: currentUser?.ism || 'Foydalanuvchi',
        izoh: izoh.trim() || `Ichki o'tkazma: ${KASSA_INFO[fromKassa].label} ➔ ${KASSA_INFO[toKassa].label}`
      };

      setDb(produce((draft: DbState) => {
        if (!draft.kassaBalansi) {
          draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
        }
        if (!draft.kassaTransferlar) draft.kassaTransferlar = [];
        if (!draft.kassaHarakatlari) draft.kassaHarakatlari = [];

        // 1. Balanslarni yangilash
        draft.kassaBalansi[fromKassa] = (draft.kassaBalansi[fromKassa] || 0) - numFromSumma;
        draft.kassaBalansi[toKassa] = (draft.kassaBalansi[toKassa] || 0) + calculatedToSumma;

        // 2. Transfer jurnaliga yozish
        draft.kassaTransferlar.unshift(transferRecord);

        // 3. Kassa harakatlariga ikkita tranzaksiya sifatida qayd etish (Audit traceability)
        // Chiqim (Source)
        draft.kassaHarakatlari.unshift({
          id: txId + '_out',
          vaqt,
          sana,
          tur: 'chiqim',
          kategoriya: 'boshqa',
          summa: numFromSumma,
          valyuta: fromValyuta,
          kurs: customKurs,
          summaUzs: fromValyuta === 'USD' ? numFromSumma * customKurs : numFromSumma,
          kassaTuri: fromKassa,
          kimgaKimdan: `→ ${KASSA_INFO[toKassa].label}`,
          izoh: `Ichki o'tkazma: ${izoh || 'Hisoblararo konvertatsiya'}`,
          xodim: currentUser?.ism || 'Foydalanuvchi',
          boglanishId: txId
        });

        // Kirim (Destination)
        draft.kassaHarakatlari.unshift({
          id: txId + '_in',
          vaqt,
          sana,
          tur: 'kirim',
          kategoriya: 'boshqa_daromad',
          summa: calculatedToSumma,
          valyuta: toValyuta,
          kurs: customKurs,
          summaUzs: toValyuta === 'USD' ? calculatedToSumma * customKurs : calculatedToSumma,
          kassaTuri: toKassa,
          kimgaKimdan: `← ${KASSA_INFO[fromKassa].label}`,
          izoh: `Ichki o'tkazma: ${izoh || 'Hisoblararo konvertatsiya'}`,
          xodim: currentUser?.ism || 'Foydalanuvchi',
          boglanishId: txId
        });
      }));

      logAudit(
        'transfer_kassa', 
        'Kassa', 
        `Ichki o'tkazma: ${numFromSumma} ${fromValyuta} (${KASSA_INFO[fromKassa].label}) ➔ ${calculatedToSumma} ${toValyuta} (${KASSA_INFO[toKassa].label}) Kurs: ${customKurs}`
      );

      toast.success(`✅ O'tkazma muvaffaqiyatli bajarildi! ${numFromSumma} ${fromValyuta} ➔ ${calculatedToSumma.toLocaleString()} ${toValyuta}`);
      onClose();
    } catch (e: any) {
      toast.error("Xatolik yuz berdi: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const FromIcon = KASSA_INFO[fromKassa].icon;
  const ToIcon = KASSA_INFO[toKassa].icon;

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
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Multi-Hisoblararo Transfer</h3>
              <p className="text-xs text-[var(--text3)]">Ichki inkassatsiya, to'lovlar & valyuta konvertatsiyasi</p>
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

        {/* Transfer Yo'nalishi Kartochkalari */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          
          {/* Manba (From) */}
          <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2">
            <span className="text-[10px] font-black uppercase text-[var(--text3)] block">
              Qayerdan (Chiquvchi)
            </span>
            <select
              value={fromKassa}
              onChange={e => {
                const val = e.target.value as KassaTuri;
                if (val === toKassa) setToKassa(fromKassa);
                setFromKassa(val);
              }}
              className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-2 text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
            >
              {(Object.keys(KASSA_INFO) as KassaTuri[]).map(k => (
                <option key={`from-${k}`} value={k}>
                  {KASSA_INFO[k].label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-[var(--text3)]">Mavjud:</span>
              <span className="font-black text-[var(--text)] tabular-nums">
                {fromBalans.toLocaleString()} {fromValyuta}
              </span>
            </div>
          </div>

          {/* Swap tugmasi */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:text-purple-600 hover:border-purple-500 active:scale-90 transition-all cursor-pointer shadow-xs"
              title="Yo'nalishni almashtirish"
            >
              <ArrowLeftRight size={16} />
            </button>
          </div>

          {/* Qabul (To) */}
          <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2">
            <span className="text-[10px] font-black uppercase text-[var(--text3)] block">
              Qayerga (Qabul qiluvchi)
            </span>
            <select
              value={toKassa}
              onChange={e => {
                const val = e.target.value as KassaTuri;
                if (val === fromKassa) setFromKassa(toKassa);
                setToKassa(val);
              }}
              className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-2 text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
            >
              {(Object.keys(KASSA_INFO) as KassaTuri[]).map(k => (
                <option key={`to-${k}`} value={k}>
                  {KASSA_INFO[k].label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-[var(--text3)]">Joriy:</span>
              <span className="font-black text-[var(--text)] tabular-nums">
                {toBalans.toLocaleString()} {toValyuta}
              </span>
            </div>
          </div>

        </div>

        {/* Summa va Konvertatsiya sozlamasi */}
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center justify-between">
              <span>O'tkaziladigan Summa ({fromValyuta})</span>
              {fromBalans > 0 && (
                <button
                  type="button"
                  onClick={() => setFromSumma(fromBalans.toString())}
                  className="text-purple-600 dark:text-purple-400 font-bold hover:underline cursor-pointer lowercase text-[10px]"
                >
                  Hammasi ({fromBalans.toLocaleString()})
                </button>
              )}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={fromSumma}
              onChange={e => setFromSumma(e.target.value)}
              placeholder={`0 ${fromValyuta}`}
              className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-black text-[var(--text)] outline-none focus:border-purple-500 transition-all tabular-nums"
            />
          </div>

          {/* Agar Valyuta Konvertatsiyasi bo'lsa (USD <-> UZS) */}
          {isConversion && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles size={13} />
                  Valyuta Konvertatsiya Kursi:
                </span>
                <span className="text-[10px] text-[var(--text3)] font-bold">
                  MB Kursi: {formatUzs(cbuRate)} UZS
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text3)]">1 $ =</span>
                <input
                  type="number"
                  value={customKurs}
                  onChange={e => setCustomKurs(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                />
                <span className="text-xs font-bold text-[var(--text)]">UZS</span>
              </div>

              {/* Forex Gain / Loss ko'rsatkichi */}
              {forexGainLoss !== 0 && (
                <div className={cn(
                  "p-2 rounded-xl text-[11px] font-bold flex items-center justify-between",
                  forexGainLoss > 0 
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30" 
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                )}>
                  <span className="flex items-center gap-1">
                    {forexGainLoss > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    Kurs farqi (Forex {forexGainLoss > 0 ? 'Foydasi' : 'Zarari'}):
                  </span>
                  <span className="font-black tabular-nums">
                    {forexGainLoss > 0 ? '+' : ''}{formatUzs(Math.round(forexGainLoss))} UZS
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Qabul qilinadigan summa xulosasi */}
          {numFromSumma > 0 && (
            <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs">
              <span className="text-[var(--text3)] font-medium">Qabul qilinadigan summa:</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {calculatedToSumma.toLocaleString(undefined, { maximumFractionDigits: 2 })} {toValyuta}
              </span>
            </div>
          )}

          {/* Izoh */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[var(--text3)]">Izoh (ixtiyoriy)</label>
            <input
              type="text"
              value={izoh}
              onChange={e => setIzoh(e.target.value)}
              placeholder="Masalan: Plastik kartani to'ldirish..."
              className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Buttons */}
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
            onClick={handleTransfer}
            disabled={isSubmitting || numFromSumma <= 0 || numFromSumma > fromBalans}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <CheckCircle2 size={14} />
            <span>O'tkazmani Tasdiqlash</span>
          </button>
        </div>

      </div>
    </div>
  );
};
