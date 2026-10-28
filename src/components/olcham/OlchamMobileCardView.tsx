import React, { useState } from 'react';
import { ALL_SIZES, cn, formatCompact, formatUzs, getCat } from '../../lib/utils';
import { BoxPreset, BoxStatsResult } from '../../utils/boxCalculations';
import { 
  Box, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Sparkles, 
  Plus, 
  Minus, 
  Edit3, 
  Split, 
  Coins, 
  TrendingUp,
  Package,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface OlchamMobileCardViewProps {
  filteredModels: string[];
  stock: Record<string, Record<string, number>>;
  tepaStock: Record<string, Record<string, number>>;
  kottaStock: Record<string, Record<string, number>>;
  prices: Record<string, { cost: number; sale: number }>;
  compareWarehouses: boolean;
  viewMode: 'compact' | 'detailed' | 'boxes';
  activePreset: BoxPreset;
  isAdmin: boolean;
  targetSize: string;
  getBoxStats: (model: string) => BoxStatsResult;
  getBrokenSizesCount: (model: string) => number;
  getAvailableSizesCount: (model: string) => number;
  getModelTotal: (model: string) => number;
  getCombinedTotal: (model: string) => number;
  updateQuantity: (model: string, size: string, newQty: number, warehouse?: 'tepa' | 'kotta') => void;
  stepQuantity: (e: React.MouseEvent, model: string, size: string, delta: number, warehouse?: 'tepa' | 'kotta') => void;
  onOpenBoxModal: (model: string) => void;
  onOpenBoxBreakdown: (model: string) => void;
}

// Rangli zaxira darajasi (Heatmap) qoidalari
export const getHeatmapPillClass = (qty: number) => {
  if (qty === 0) {
    return "bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 border-zinc-300/40 dark:border-zinc-800 opacity-60 font-medium";
  }
  if (qty <= 3) {
    return "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 font-black ring-1 ring-rose-500/20 shadow-2xs";
  }
  if (qty <= 9) {
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold";
  }
  return "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950 border-emerald-600 font-black shadow-xs";
};

export const OlchamMobileCardView: React.FC<OlchamMobileCardViewProps> = ({
  filteredModels,
  stock,
  tepaStock,
  kottaStock,
  prices,
  compareWarehouses,
  viewMode,
  activePreset,
  isAdmin,
  targetSize,
  getBoxStats,
  getBrokenSizesCount,
  getAvailableSizesCount,
  getModelTotal,
  getCombinedTotal,
  updateQuantity,
  stepQuantity,
  onOpenBoxModal,
  onOpenBoxBreakdown
}) => {
  // Mobile touch quick edit dialog state
  const [activeEditSize, setActiveEditSize] = useState<{
    model: string;
    size: string;
    warehouse?: 'tepa' | 'kotta';
    currentQty: number;
  } | null>(null);
  const [quickInputVal, setQuickInputVal] = useState<string>('');

  // Expandable state for comparison or details
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleCard = (model: string) => {
    setExpandedCards(prev => ({ ...prev, [model]: !prev[model] }));
  };

  const handleStartEdit = (model: string, size: string, qty: number, warehouse?: 'tepa' | 'kotta') => {
    if (!isAdmin) return;
    setActiveEditSize({ model, size, warehouse, currentQty: qty });
    setQuickInputVal(qty.toString());
  };

  const handleSaveEdit = () => {
    if (!activeEditSize) return;
    const newQty = Math.max(0, parseInt(quickInputVal) || 0);
    updateQuantity(activeEditSize.model, activeEditSize.size, newQty, activeEditSize.warehouse);
    setActiveEditSize(null);
  };

  if (filteredModels.length === 0) {
    return (
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-8 text-center text-[var(--text3)]">
        <Package className="w-12 h-12 mx-auto mb-2 opacity-30 text-purple-500" />
        <p className="text-sm font-bold text-[var(--text)]">Mos keluvchi model topilmadi</p>
        <p className="text-xs text-[var(--text3)] mt-1">Filtrlarni tozalab ko'ring yoki boshqa so'z bilan qidiring</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {filteredModels.map((m, idx) => {
        const cat = getCat(m);
        const total = compareWarehouses ? getCombinedTotal(m) : getModelTotal(m);
        const box = getBoxStats(m);
        const salePrice = prices[m]?.sale || 0;
        const costPrice = prices[m]?.cost || 0;
        const saleValue = total * salePrice;
        const costValue = total * costPrice;
        const profit = saleValue - costValue;
        const brokenCount = getBrokenSizesCount(m);
        const availableCount = getAvailableSizesCount(m);
        const isExpanded = expandedCards[m];

        // Max qty in model for sparkline
        const modelMaxQty = Math.max(...ALL_SIZES.map(sz => {
          return compareWarehouses 
            ? (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0)
            : (stock[m]?.[sz] || 0);
        }), 1);

        return (
          <div 
            key={m}
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-xs transition-all hover:border-purple-500/30 flex flex-col gap-3"
          >
            {/* 1. Karta Sarlavhasi (Model, Kategoriya, Jami juft, Qutilar) */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black text-purple-600 dark:text-purple-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <h3 className="text-base font-black text-[var(--text)] tracking-tight truncate">
                    {m}
                  </h3>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide border",
                    cat === 'qishki' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" 
                    : cat === 'yozgi' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" 
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  )}>
                    {cat === 'qishki' ? '❄️ Qish' : cat === 'yozgi' ? '☀️ Yoz' : '👟 Umumiy'}
                  </span>
                </div>

                {/* Holat badge (Uzilish / Komplekt) */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {total === 0 ? (
                    <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                      0 juft (Tugagan)
                    </span>
                  ) : brokenCount > 0 ? (
                    <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0 animate-pulse" />
                      {brokenCount} ta o'lcham uzilgan ({availableCount}/7)
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                      <Check size={11} />
                      To'liq komplekt ({availableCount}/7)
                    </span>
                  )}
                </div>
              </div>

              {/* Jami juft & Qutilar pill */}
              <div className="flex flex-col items-end shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-purple-600 dark:text-purple-400 tabular-nums">
                    {total.toLocaleString()} <span className="text-xs font-bold text-[var(--text3)]">jft</span>
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={() => onOpenBoxBreakdown(m)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-black bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 px-2 py-0.5 rounded-lg hover:bg-purple-500/20 active:scale-95 transition-all cursor-pointer"
                  title="Seriya tahlili"
                >
                  <Box size={10} />
                  <span>{box.fullBoxes} quti</span>
                  {box.loosePairs > 0 && <span className="text-amber-600 dark:text-amber-400">+{box.loosePairs}</span>}
                </button>
              </div>
            </div>

            {/* 2. Zaxira Darajasi (Heatmap) 39-45 O'lchamlar Qatori */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] mb-1.5 px-0.5">
                <span className="uppercase tracking-wider text-[10px] font-extrabold text-[var(--text)]">
                  39–45 O'lchamlar (Heatmap)
                </span>
                {isAdmin && (
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                    Tahrirlash: bosing yoki +/-
                  </span>
                )}
              </div>

              {/* 7 O'lcham Kartochkalar Gridi */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {ALL_SIZES.map(sz => {
                  const qty = compareWarehouses 
                    ? (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0)
                    : (stock[m]?.[sz] || 0);
                  const isHighlighted = targetSize === sz;

                  return (
                    <div
                      key={sz}
                      onClick={() => handleStartEdit(m, sz, qty)}
                      className={cn(
                        "relative flex flex-col items-center justify-between py-1.5 px-1 rounded-xl border text-center transition-all group/pill select-none",
                        getHeatmapPillClass(qty),
                        isHighlighted ? "ring-2 ring-purple-500 scale-102" : "",
                        isAdmin ? "cursor-pointer active:scale-95 hover:shadow-xs" : ""
                      )}
                      title={`${sz}-o'lcham: ${qty} juft ${isAdmin ? '(O\'zgartirish uchun bosing)' : ''}`}
                    >
                      {/* O'lcham Nomi (Yuqori yorliq) */}
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-tighter opacity-80",
                        qty >= 10 ? "text-white/90 dark:text-zinc-950/80" : ""
                      )}>
                        {sz}
                      </span>

                      {/* Qoldiq Miqdori (Asosiy Katta Son) */}
                      <span className={cn(
                        "text-xs sm:text-sm font-black tabular-nums my-0.5",
                        qty === 0 ? "opacity-50" : ""
                      )}>
                        {qty > 0 ? qty : '0'}
                      </span>

                      {/* Micro Holat Belgisi / Mini Indicator */}
                      <div className="w-full flex justify-center">
                        {qty === 0 ? (
                          <div className="w-3 h-0.5 rounded-full bg-zinc-400/50" />
                        ) : qty <= 3 ? (
                          <div className="w-3 h-1 rounded-full bg-rose-500 animate-pulse" />
                        ) : qty <= 9 ? (
                          <div className="w-3 h-1 rounded-full bg-amber-500" />
                        ) : (
                          <div className="w-3 h-1 rounded-full bg-white/70 dark:bg-zinc-950/50" />
                        )}
                      </div>

                      {/* Admin Touch Step Tugmalari (Hover/Mobile) */}
                      {isAdmin && (
                        <div className="absolute -top-2 right-0 hidden group-hover/pill:flex items-center gap-0.5 z-20">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              stepQuantity(e, m, sz, 1);
                            }}
                            className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shadow-xs hover:scale-110"
                            title="+1 juft"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Omborlarni Taqqoslash Bo'lingan Ko'rinishi (Agar Taqqoslash yoqilgan bo'lsa) */}
            {compareWarehouses && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)]">
                  <span className="flex items-center gap-1 font-black text-[var(--text)]">
                    <Split size={12} className="text-purple-600" />
                    Omborlar Bo'yicha Tafsilot
                  </span>
                  <span className="text-[10px] text-purple-600">🏔 Tepa vs 🏢 Kotta</span>
                </div>

                {/* 🏔 Tepa Ombor Qatori */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-[var(--text3)] w-14 shrink-0 flex items-center gap-0.5">
                    <span>🏔 Tepa:</span>
                  </span>
                  <div className="grid grid-cols-7 gap-1 flex-1">
                    {ALL_SIZES.map(sz => {
                      const tQty = tepaStock[m]?.[sz] || 0;
                      return (
                        <div
                          key={sz}
                          onClick={() => handleStartEdit(m, sz, tQty, 'tepa')}
                          className={cn(
                            "py-1 text-center rounded-lg border text-[10px] font-black tabular-nums transition-colors",
                            tQty === 0 ? "bg-[var(--bg2)] text-[var(--text3)]/40 border-[var(--border)]"
                            : tQty < 3 ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
                            : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
                            isAdmin && "cursor-pointer hover:border-purple-500"
                          )}
                          title={`Tepa ombor ${sz}: ${tQty} jft`}
                        >
                          {tQty}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 🏢 Kotta Ombor Qatori */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-[var(--text3)] w-14 shrink-0 flex items-center gap-0.5">
                    <span>🏢 Kotta:</span>
                  </span>
                  <div className="grid grid-cols-7 gap-1 flex-1">
                    {ALL_SIZES.map(sz => {
                      const kQty = kottaStock[m]?.[sz] || 0;
                      return (
                        <div
                          key={sz}
                          onClick={() => handleStartEdit(m, sz, kQty, 'kotta')}
                          className={cn(
                            "py-1 text-center rounded-lg border text-[10px] font-black tabular-nums transition-colors",
                            kQty === 0 ? "bg-[var(--bg2)] text-[var(--text3)]/40 border-[var(--border)]"
                            : kQty < 3 ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
                            isAdmin && "cursor-pointer hover:border-purple-500"
                          )}
                          title={`Kotta ombor ${sz}: ${kQty} jft`}
                        >
                          {kQty}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Moliya Ko'rsatkichlari (Batafsil rejimda) */}
            {viewMode === 'detailed' && (
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[var(--text3)] uppercase">Tannarx</span>
                  <span className="font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {costValue > 0 ? formatCompact(costValue) : '—'}
                  </span>
                  <span className="text-[8px] text-[var(--text3)]">@{formatCompact(costPrice)}</span>
                </div>
                <div className="flex flex-col border-x border-[var(--border)] px-1">
                  <span className="text-[9px] font-bold text-[var(--text3)] uppercase">Sotuv Qiymati</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {saleValue > 0 ? formatCompact(saleValue) : '—'}
                  </span>
                  <span className="text-[8px] text-[var(--text3)]">@{formatCompact(salePrice)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[var(--text3)] uppercase">Taxminiy Foyda</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {profit > 0 ? `+${formatCompact(profit)}` : '—'}
                  </span>
                  <span className="text-[8px] text-emerald-500">
                    {saleValue > 0 ? `${((profit / saleValue) * 100).toFixed(0)}% marja` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* 5. Mini Footer: Seriya Bottleneck & Amallar */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60 text-xs">
              {/* Seriya ehtiyoji / Bottleneck */}
              {box.bottleneckSize && box.bottleneckShortage && box.bottleneckShortage > 0 ? (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text3)]">
                  <span>Keyingi qutiga:</span>
                  <span className="font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                    {box.bottleneckSize}-o'lcham ({box.bottleneckShortage} jft)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={12} />
                  <span>{box.boxedRatioPercent}% seriyada</span>
                </div>
              )}

              {/* Amallar */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenBoxBreakdown(m)}
                  className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>Tahlil</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onOpenBoxModal(m)}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-purple-600 text-white hover:bg-purple-700 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Plus size={11} />
                    <span>Quti</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        );
      })}

      {/* ========================================================================= */}
      {/* QUICK INLINE SIZE EDIT MODAL (MOBILE TOUCH) */}
      {/* ========================================================================= */}
      {activeEditSize && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-xs p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h4 className="text-sm font-black text-[var(--text)]">
                  {activeEditSize.model}
                </h4>
                <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  {activeEditSize.size}-o'lcham {activeEditSize.warehouse ? `(${activeEditSize.warehouse === 'tepa' ? '🏔 Tepa' : '🏢 Kotta'})` : ''}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-600 font-black text-xs">
                {activeEditSize.size}
              </span>
            </div>

            {/* Raqam kiritish va +/- qadami */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const curr = parseInt(quickInputVal) || 0;
                  setQuickInputVal(Math.max(0, curr - 1).toString());
                }}
                className="w-10 h-10 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-rose-500/10 hover:text-rose-500 font-black text-lg flex items-center justify-center cursor-pointer active:scale-90 transition-all"
              >
                -
              </button>

              <input
                autoFocus
                type="number"
                value={quickInputVal}
                onChange={e => setQuickInputVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') setActiveEditSize(null);
                }}
                className="w-24 text-center py-2 bg-[var(--bg)] border-2 border-purple-500 rounded-2xl text-xl font-black text-[var(--text)] outline-none tabular-nums shadow-inner"
              />

              <button
                type="button"
                onClick={() => {
                  const curr = parseInt(quickInputVal) || 0;
                  setQuickInputVal((curr + 1).toString());
                }}
                className="w-10 h-10 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-emerald-500/10 hover:text-emerald-500 font-black text-lg flex items-center justify-center cursor-pointer active:scale-90 transition-all"
              >
                +
              </button>
            </div>

            {/* Tezkor preset tugmalari */}
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 5, 10].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setQuickInputVal(val.toString())}
                  className="py-1.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] cursor-pointer"
                >
                  ={val}
                </button>
              ))}
            </div>

            {/* Saqlash / Bekor qilish */}
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setActiveEditSize(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-2 rounded-xl text-xs font-black bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition-all cursor-pointer shadow-md shadow-purple-600/20"
              >
                Saqlash
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
