import React, { useRef, useEffect } from 'react';
import { KassirSmena, KassaTuri } from '../../types';
import { formatUzs, formatCompact } from '../../lib/utils';
import { usePrint } from '../../hooks/usePrint';
import { 
  X, 
  Printer, 
  CheckCircle2, 
  Clock, 
  User, 
  FileText, 
  Building2, 
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface ZReportModalProps {
  smena: KassirSmena | null;
  isOpen: boolean;
  onClose: () => void;
}

const KASSA_LABELS: Record<KassaTuri, string> = {
  naqd_uzs: 'Naqd Pul (So\'m)',
  naqd_usd: 'Naqd Pul (USD $)',
  karta_uzs: 'Karta (Humo/Uzcard)',
  bank_uzs: 'Bank Hisob Raqami'
};

export const ZReportModal: React.FC<ZReportModalProps> = ({ smena, isOpen, onClose }) => {
  const { print, isPrinting } = usePrint();
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !smena) return null;

  const handlePrint = async () => {
    if (receiptRef.current) {
      await print(receiptRef, {
        title: `Z-Hisobot #${smena.zReportNumber}`,
        pageSize: 'thermal-80'
      });
      toast.success("Z-Hisobot kvitansiyasi chop etishga yuborildi");
    }
  };

  const farqlar = smena.farqlar || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
  const hasDiscrepancy = Object.values(farqlar).some(v => v !== 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 print-receipt-modal print:fixed print:inset-0 print:bg-white print:p-0 print:m-0 print:z-[99999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto print-modal-card print:shadow-none print:w-full print:max-w-none print:rounded-none print:h-auto print:block print:border-none"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top actions */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sticky top-0 bg-[var(--bg2)] z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span className="font-black text-sm text-[var(--text)]">Z-Hisobot #{smena.zReportNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="p-1.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Chop etish"
            >
              <Printer size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--bg)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body (Slip format) */}
        <div 
          ref={receiptRef}
          className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] font-mono text-xs space-y-3 shadow-inner"
        >
          {/* Slip Header */}
          <div className="text-center border-b border-dashed border-[var(--border)] pb-3 space-y-1">
            <h4 className="font-black text-sm uppercase tracking-wider text-[var(--text)]">FALAK SHOES</h4>
            <p className="text-[10px] text-[var(--text3)]">Kassir Smenasi Yopilish Kvitansiyasi</p>
            <p className="font-bold text-purple-600">*** Z-HISOBOT #{smena.zReportNumber} ***</p>
          </div>

          {/* Smena rekvizitlari */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-[var(--border)] pb-2.5">
            <div className="flex justify-between">
              <span className="text-[var(--text3)]">Ochilgan:</span>
              <span className="font-bold text-[var(--text)]">{smena.ochilganVaqt}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text3)]">Yopilgan:</span>
              <span className="font-bold text-[var(--text)]">{smena.yopilganVaqt || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text3)]">Kassir:</span>
              <span className="font-bold text-[var(--text)]">{smena.yopganXodim || smena.ochganXodim}</span>
            </div>
          </div>

          {/* Smena oboroti */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-[var(--border)] pb-2.5">
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>(+) Jami Savdo Tushumi:</span>
              <span>+{formatUzs(smena.jamiSavdoKirimUzs || 0)} UZS</span>
            </div>
            <div className="flex justify-between text-rose-600 font-bold">
              <span>(-) Jami Xarajatlar:</span>
              <span>-{formatUzs(smena.jamiXarajatChiqimUzs || 0)} UZS</span>
            </div>
          </div>

          {/* Kassa hisob-kitobi (Tizim vs Real) */}
          <div className="space-y-2 border-b border-dashed border-[var(--border)] pb-2.5">
            <span className="text-[10px] font-black uppercase text-[var(--text3)] block">
              Hisoblar bo'yicha yakuniy qoldiq:
            </span>

            {(['naqd_uzs', 'naqd_usd', 'karta_uzs', 'bank_uzs'] as KassaTuri[]).map(k => {
              const kutilgan = smena.kutilganKassa?.[k] || 0;
              const real = smena.yopilishKassa?.[k] || 0;
              const farq = farqlar[k] || 0;
              const val = k === 'naqd_usd' ? '$' : 'UZS';

              return (
                <div key={k} className="flex justify-between items-center text-[10px]">
                  <span className="text-[var(--text3)] truncate max-w-[120px]">{KASSA_LABELS[k]}:</span>
                  <div className="text-right font-bold">
                    <span className="text-[var(--text)]">{real.toLocaleString()} {val}</span>
                    {farq !== 0 && (
                      <span className={farq > 0 ? "text-amber-500 ml-1.5" : "text-rose-500 ml-1.5"}>
                        ({farq > 0 ? `+${farq}` : farq})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discrepancy Status */}
          <div className="pt-1 text-center">
            {hasDiscrepancy ? (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-black flex items-center justify-center gap-1.5">
                <AlertTriangle size={12} />
                <span>Kassada tafovut (Izlishek/Nedostacha) aniqlangan</span>
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center justify-center gap-1.5">
                <CheckCircle2 size={12} />
                <span>Kassa balansi 100% to'g'ri topshirildi</span>
              </div>
            )}
          </div>

          {smena.izoh && (
            <p className="text-[10px] text-[var(--text3)] italic text-center pt-1">
              "{smena.izoh}"
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 sticky bottom-0 bg-[var(--bg2)] z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
};
