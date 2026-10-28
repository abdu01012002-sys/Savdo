import React, { useRef, useState } from 'react';
import { useDb } from '../context/DbContext';
import { WarehouseName } from '../types';
import { cn } from '../lib/utils';
import { RotateCcw, Sparkles, Plus, Hash } from 'lucide-react';

const STANDARD_KIRIM_SIZES = ['39', '40', '41', '42', '43', '44'];

interface QuickSizeGridProps {
  model: string;
  ombor: WarehouseName;
  value: Record<string, number>;
  onChange: (val: Record<string, number>) => void;
  accentColor?: 'blue' | 'emerald' | 'indigo';
}

export const QuickSizeGrid: React.FC<QuickSizeGridProps> = ({
  model,
  ombor,
  value,
  onChange,
  accentColor = 'blue'
}) => {
  const { db } = useDb();
  const stock = db[ombor]?.stock || {};
  const modelStock = (model && stock[model]) || {};

  // Custom added extra size input (e.g. 38 or 45, 46)
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [showCustomSize, setShowCustomSize] = useState(false);
  const [customBatchInput, setCustomBatchInput] = useState('');

  // Collect sizes: default standard 39-44 + currently filled / stock sizes
  const allSizesSet = new Set<string>([...STANDARD_KIRIM_SIZES]);
  Object.keys(value).forEach(sz => {
    if (value[sz] !== undefined && value[sz] !== null) {
      allSizesSet.add(sz);
    }
  });
  Object.keys(modelStock).forEach(sz => {
    if ((modelStock[sz] || 0) > 0) {
      allSizesSet.add(sz);
    }
  });

  const sortedSizes = Array.from(allSizesSet).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleQuantityChange = (sz: string, rawVal: string) => {
    const newVal = { ...value };
    if (rawVal === '' || rawVal === null) {
      delete newVal[sz];
    } else {
      const num = parseInt(rawVal, 10);
      if (isNaN(num) || num <= 0) {
        delete newVal[sz];
      } else {
        newVal[sz] = num;
      }
    }
    onChange(newVal);
  };

  const handleStep = (sz: string, delta: number) => {
    const current = Number(value[sz]) || 0;
    const next = Math.max(0, current + delta);
    const newVal = { ...value };
    if (next <= 0) {
      delete newVal[sz];
    } else {
      newVal[sz] = next;
    }
    onChange(newVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentSz: string) => {
    const currentIndex = sortedSizes.indexOf(currentSz);

    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentIndex < sortedSizes.length - 1) {
        const nextSz = sortedSizes[currentIndex + 1];
        inputRefs.current[nextSz]?.focus();
        inputRefs.current[nextSz]?.select();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentIndex > 0) {
        const prevSz = sortedSizes[currentIndex - 1];
        inputRefs.current[prevSz]?.focus();
        inputRefs.current[prevSz]?.select();
      }
    }
  };

  // Quick preset actions
  const handleClearAll = () => {
    onChange({});
  };

  const handleApplyBatchQty = (qty: number) => {
    if (qty <= 0) return;
    const newVal: Record<string, number> = { ...value };
    sortedSizes.forEach(sz => {
      newVal[sz] = qty;
    });
    onChange(newVal);
  };

  const handleApplyCustomBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qty = parseInt(customBatchInput, 10);
    if (!isNaN(qty) && qty > 0) {
      handleApplyBatchQty(qty);
      setCustomBatchInput('');
    }
  };

  const handleAddCustomSize = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSz = customSizeInput.trim();
    if (!cleanSz) return;
    const newVal = { ...value, [cleanSz]: value[cleanSz] || 0 };
    onChange(newVal);
    setCustomSizeInput('');
    setShowCustomSize(false);
    setTimeout(() => {
      inputRefs.current[cleanSz]?.focus();
      inputRefs.current[cleanSz]?.select();
    }, 50);
  };

  const totalPairs = Object.values(value).reduce((sum, q) => sum + (Number(q) || 0), 0);
  const activeSizesCount = Object.values(value).filter(q => Number(q) > 0).length;

  return (
    <div className="space-y-3.5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
              <span>⚡</span>
              <span>O'lchamlar Matritsasi</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-black border border-blue-500/20">
              39° — 44° (2 qator)
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[var(--text3)] mt-0.5">
            Raqamli klaviatura orqali tezkor yozing yoki quyidagi seriya tugmalaridan foydalaning
          </p>
        </div>

        {activeSizesCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs"
            title="Kiritilgan barcha sonlarni tozalash"
          >
            <RotateCcw size={13} />
            <span>Tozalash (0)</span>
          </button>
        )}
      </div>

      {/* TEZKOR SERIYA BO'YICHA TO'LDIRISH (MOBILE-FRIENDLY QUICK ACTION BAR) */}
      <div className="bg-[var(--bg2)] p-2.5 sm:p-3 rounded-2xl border border-[var(--border)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text2)] flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-500" />
            <span>Seriya bo'yicha to'ldirish (Tezkor tugmalar):</span>
          </span>
          <span className="text-[10px] text-[var(--text3)] font-medium">
            Barcha kataklarga bir zumda
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* USER SPECIFIC REQUEST: Har biriga 8 ta (prominent!) */}
          <button
            type="button"
            onClick={() => handleApplyBatchQty(8)}
            className="px-3 py-2 rounded-xl text-xs font-black bg-blue-600 text-white hover:bg-blue-700 border border-blue-500 shadow-sm shadow-blue-500/25 transition-all cursor-pointer active:scale-95 flex items-center gap-1"
            title="Barcha o'lchamlarga 8 tadan yozish"
          >
            <span>★ Har biriga 8 ta</span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyBatchQty(6)}
            className="px-2.5 py-2 rounded-xl text-xs font-extrabold bg-[var(--bg)] hover:bg-blue-500 hover:text-white border border-[var(--border)] text-[var(--text)] transition-all cursor-pointer active:scale-95"
            title="Barcha o'lchamlarga 6 tadan yozish"
          >
            Har biriga 6 ta
          </button>

          <button
            type="button"
            onClick={() => handleApplyBatchQty(10)}
            className="px-2.5 py-2 rounded-xl text-xs font-extrabold bg-[var(--bg)] hover:bg-blue-500 hover:text-white border border-[var(--border)] text-[var(--text)] transition-all cursor-pointer active:scale-95"
            title="Barcha o'lchamlarga 10 tadan yozish"
          >
            Har biriga 10 ta
          </button>

          <button
            type="button"
            onClick={() => handleApplyBatchQty(12)}
            className="px-2.5 py-2 rounded-xl text-xs font-extrabold bg-[var(--bg)] hover:bg-blue-500 hover:text-white border border-[var(--border)] text-[var(--text)] transition-all cursor-pointer active:scale-95"
            title="Barcha o'lchamlarga 12 tadan yozish"
          >
            Har biriga 12 ta
          </button>

          <button
            type="button"
            onClick={() => handleApplyBatchQty(1)}
            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] hover:bg-blue-500 hover:text-white border border-[var(--border)] text-[var(--text2)] transition-all cursor-pointer active:scale-95"
            title="Barcha o'lchamlarga 1 tadan yozish"
          >
            Har biriga 1 ta
          </button>

          {/* Custom Amount Form: "Har biriga [ N ] ta" */}
          <form onSubmit={handleApplyCustomBatch} className="flex items-center gap-1 ml-auto">
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="1"
              placeholder="Son..."
              value={customBatchInput}
              onChange={e => setCustomBatchInput(e.target.value)}
              className="w-16 px-2 py-1.5 text-xs font-black bg-[var(--bg)] border border-[var(--border)] rounded-xl outline-none focus:border-blue-500 text-center text-[var(--text)]"
            />
            <button
              type="submit"
              disabled={!customBatchInput}
              className="px-2.5 py-1.5 text-xs font-bold bg-[var(--bg)] hover:bg-blue-600 hover:text-white disabled:opacity-40 border border-[var(--border)] rounded-xl transition-all cursor-pointer active:scale-95 text-[var(--text)]"
            >
              Qo'yish
            </button>
          </form>

          {/* Add custom size button */}
          {!showCustomSize ? (
            <button
              type="button"
              onClick={() => setShowCustomSize(true)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--bg)] hover:bg-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer flex items-center gap-1"
              title="Nostandart o'lcham qo'shish (masalan 38, 45, 46)"
            >
              <Plus size={12} />
              <span>+ Razmer</span>
            </button>
          ) : (
            <form onSubmit={handleAddCustomSize} className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Razmer..."
                value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                autoFocus
                className="w-16 px-2 py-1.5 text-xs font-bold bg-[var(--bg)] border border-blue-500 rounded-xl outline-none text-[var(--text)] text-center"
              />
              <button
                type="submit"
                className="px-2 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-xl cursor-pointer"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setShowCustomSize(false)}
                className="p-1.5 text-xs text-[var(--text3)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </div>

      {/* The Matrix Grid: 3 columns on mobile (Row 1: 39,40,41 | Row 2: 42,43,44), at least 44x44px touch targets */}
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {sortedSizes.map((sz, idx) => {
          const qty = value[sz] !== undefined ? value[sz] : '';
          const hasQty = Number(qty) > 0;
          const currentAvail = modelStock[sz] || 0;

          return (
            <div
              key={sz}
              className={cn(
                "relative rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-between border-2 transition-all duration-150 min-h-[96px]",
                hasQty
                  ? "bg-blue-500/10 border-blue-500 dark:bg-blue-500/15 ring-2 ring-blue-500/20 shadow-sm"
                  : "bg-[var(--bg)] border-[var(--border)] hover:border-blue-400/50 hover:bg-[var(--bg2)]"
              )}
            >
              {/* Header: Size number & ombor stock */}
              <div className="w-full flex items-center justify-between gap-1 mb-1.5">
                <span
                  className={cn(
                    "text-sm sm:text-base font-black tracking-tight",
                    hasQty ? "text-blue-600 dark:text-blue-400" : "text-[var(--text)]"
                  )}
                >
                  {sz}°
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    currentAvail > 0
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "text-[var(--text3)] bg-[var(--bg2)]"
                  )}
                  title={`Omborda mavjud qoldiq: ${currentAvail} juft`}
                >
                  {currentAvail > 0 ? `${currentAvail}ta` : '0'}
                </span>
              </div>

              {/* Direct Numeric Input with inputMode="numeric", 44px+ height for comfortable touch */}
              <div className="w-full relative">
                <input
                  ref={el => { inputRefs.current[sz] = el; }}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  step="1"
                  tabIndex={idx + 1}
                  value={qty}
                  onChange={e => handleQuantityChange(sz, e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => handleKeyDown(e, sz)}
                  placeholder="0"
                  className={cn(
                    "w-full h-11 sm:h-12 min-h-[44px] text-center font-mono font-black text-lg sm:text-xl rounded-xl border outline-none transition-all",
                    hasQty
                      ? "bg-[var(--bg)] border-blue-500 text-blue-600 dark:text-blue-400 font-black shadow-inner"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text)] placeholder-[var(--text3)]/40 focus:bg-[var(--bg)] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  )}
                />
              </div>

              {/* Stepper +/- controls for finger adjustments */}
              <div className="w-full flex items-center justify-between gap-1 mt-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleStep(sz, -1)}
                  disabled={!hasQty}
                  className="flex-1 h-7 rounded-lg bg-[var(--bg2)] hover:bg-rose-500/15 hover:text-rose-600 disabled:opacity-20 text-[var(--text3)] font-black text-xs transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                >
                  -
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleStep(sz, 1)}
                  className="flex-1 h-7 rounded-lg bg-[var(--bg2)] hover:bg-blue-500/15 hover:text-blue-600 text-[var(--text)] font-black text-xs transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Summary Bar */}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border)] font-semibold">
        <span className="text-[var(--text3)] flex items-center gap-1.5">
          <Hash size={13} className="text-blue-500" />
          <span>To'ldirilgan o'lchamlar: <strong>{activeSizesCount}</strong> xil razmer</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text3)]">Jami partiya:</span>
          <span
            className={cn(
              "px-3 py-1 rounded-xl font-black text-sm transition-all",
              totalPairs > 0
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                : "bg-[var(--bg2)] text-[var(--text3)]"
            )}
          >
            {totalPairs} juft
          </span>
        </div>
      </div>
    </div>
  );
};
