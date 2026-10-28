import React from 'react';
import { ALL_SIZES, cn } from '../../lib/utils';
import { BoxPreset, BoxStatsResult } from '../../utils/boxCalculations';
import { Box, Check, AlertTriangle, ArrowRight, X, Sparkles, PackageCheck, Layers } from 'lucide-react';

interface BoxBreakdownModalProps {
  modelName: string;
  category: string;
  activePreset: BoxPreset;
  boxStats: BoxStatsResult;
  stock: Record<string, number>;
  onClose: () => void;
  onOpenBatchEntry?: () => void;
}

export const BoxBreakdownModal: React.FC<BoxBreakdownModalProps> = ({
  modelName,
  category,
  activePreset,
  boxStats,
  stock,
  onClose,
  onOpenBatchEntry
}) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border-t sm:border border-[var(--border)] rounded-t-[28px] sm:rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 pb-safe"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto mb-3 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
              <PackageCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[var(--text)]">
                  {modelName}
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600">
                  {category}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] flex items-center gap-1.5 mt-0.5">
                <span>Seriya balansi: <strong>{activePreset.name}</strong></span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Asosiy Natija Kartochkasi */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4">
          
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <Box size={12} />
              To'liq Qutilar
            </span>
            <div className="mt-2">
              <span className="text-2xl font-black text-purple-700 dark:text-purple-300 tabular-nums">
                {boxStats.fullBoxes} <span className="text-xs font-bold uppercase">quti</span>
              </span>
              <p className="text-[10px] font-bold text-purple-600/80 mt-0.5">
                = {boxStats.boxedPairs} juft qutilangan
              </p>
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
              <Layers size={12} />
              Ortiqcha (Dona)
            </span>
            <div className="mt-2">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
                +{boxStats.loosePairs} <span className="text-xs font-bold uppercase">juft</span>
              </span>
              <p className="text-[10px] font-bold text-[var(--text3)] mt-0.5">
                Qutiga kirmagan qoldiq
              </p>
            </div>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
              <Sparkles size={12} />
              Qutilanish Darajasi
            </span>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {boxStats.boxedRatioPercent}%
              </span>
              <div className="w-full bg-[var(--border)] h-1.5 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${boxStats.boxedRatioPercent}%` }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* O'lchamlar bo'yicha Batafsil Taqsimot Jadvali */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center justify-between">
            <span>O'lchamlar Taqsimoti & Quti Tarkibi</span>
            <span className="text-[10px] text-purple-600 font-bold">1 quti = {activePreset.total} juft</span>
          </span>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-2.5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--text3)]">
                  <th className="p-1.5 text-left">Ko'rsatkich</th>
                  {ALL_SIZES.map(sz => (
                    <th key={sz} className="p-1.5 text-center font-black">{sz}</th>
                  ))}
                  <th className="p-1.5 text-right">Jami</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs font-semibold">
                {/* 1. Hozirgi zaxira */}
                <tr>
                  <td className="p-1.5 text-[var(--text3)] font-bold">📦 Mavjud Zaxira:</td>
                  {ALL_SIZES.map(sz => {
                    const qty = stock[sz] || 0;
                    return (
                      <td key={sz} className="p-1.5 text-center font-black tabular-nums">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-md",
                          qty === 0 ? "text-[var(--text3)]" : "bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)]"
                        )}>
                          {qty > 0 ? qty : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right font-black text-purple-600">{boxStats.total}</td>
                </tr>

                {/* 2. Standart 1 quti talabi */}
                <tr className="bg-purple-500/5">
                  <td className="p-1.5 text-purple-600 font-bold">🎯 1 quti normasi:</td>
                  {ALL_SIZES.map(sz => {
                    const need = activePreset.sizes[sz] || 0;
                    return (
                      <td key={sz} className="p-1.5 text-center font-bold text-purple-600 tabular-nums">
                        {need > 0 ? `${need} ta` : '—'}
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right font-black text-purple-600">{activePreset.total}</td>
                </tr>

                {/* 3. Qutilarga band qilingan juftlar */}
                <tr>
                  <td className="p-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                    ✅ Qutilarda band ({boxStats.fullBoxes} quti):
                  </td>
                  {ALL_SIZES.map(sz => {
                    const used = boxStats.fullBoxes * (activePreset.sizes[sz] || 0);
                    return (
                      <td key={sz} className="p-1.5 text-center font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {used > 0 ? used : '—'}
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right font-black text-emerald-600 dark:text-emerald-400">{boxStats.boxedPairs}</td>
                </tr>

                {/* 4. Ortiqcha qolgan dona juftlar */}
                <tr className="bg-amber-500/5">
                  <td className="p-1.5 text-amber-600 dark:text-amber-400 font-bold">
                    ⚠️ Ortiqcha (Dona qoldiq):
                  </td>
                  {ALL_SIZES.map(sz => {
                    const loose = boxStats.looseBySizes[sz] || 0;
                    return (
                      <td key={sz} className="p-1.5 text-center font-black text-amber-600 dark:text-amber-400 tabular-nums">
                        {loose > 0 ? `+${loose}` : '—'}
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right font-black text-amber-600 dark:text-amber-400">+{boxStats.loosePairs}</td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>

        {/* Keyingi 1 ta qutini yig'ish tavsiyasi / Ishlab chiqarish buyurtmasi */}
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3.5 mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-amber-500" />
              Keyingi 1 ta To'liq Qutini To'ldirish Uchun:
            </span>
            <span className="text-[10px] font-bold text-[var(--text3)]">
              {boxStats.fullBoxes + 1}-qutiga yetishmayotganlar
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {Object.keys(boxStats.neededForNextBox).length === 0 ? (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <Check size={14} />
                Barcha qutilar to'liq shakllantirilgan!
              </span>
            ) : (
              ALL_SIZES.map(sz => {
                const shortage = boxStats.neededForNextBox[sz] || 0;
                if (shortage <= 0) return null;
                const isWorst = sz === boxStats.bottleneckSize;
                return (
                  <div 
                    key={sz}
                    className={cn(
                      "px-2 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5",
                      isWorst 
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 font-black" 
                        : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    )}
                  >
                    <span>{sz}-o'lcham:</span>
                    <strong className="underline decoration-2">{shortage} juft kerak</strong>
                    {isWorst && <span className="text-[9px] uppercase px-1 rounded bg-rose-500 text-white font-black">Asosiy to'siq</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-[var(--border)] mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
          >
            Yopish
          </button>

          {onOpenBatchEntry && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBatchEntry();
              }}
              className="px-4 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-700 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Box size={13} />
              <span>Quti Kirim / Chiqim Qilish</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
