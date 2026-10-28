import React, { useState, useMemo } from 'react';
import { useDb } from '../../context/DbContext';
import { 
  formatUzs, 
  formatCompact, 
  getTodayStr, 
  cn 
} from '../../lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Sparkles, 
  Search, 
  ArrowUpDown, 
  SlidersHorizontal, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  Layers, 
  Info,
  DollarSign,
  PieChart
} from 'lucide-react';

interface UnitEconomicsViewProps {
  dateRange: string;
  startDate?: string;
  endDate?: string;
  isDateInFilter: (sana: string) => boolean;
}

export const UnitEconomicsView: React.FC<UnitEconomicsViewProps> = ({
  dateRange,
  isDateInFilter
}) => {
  const { db } = useDb();
  const valyutaKursi = db.valyutaKursi || 12850;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'pairs' | 'revenue'>('profit');
  const [filterType, setFilterType] = useState<'all' | 'high_profit' | 'low_profit' | 'loss'>('all');

  // 1. Chiqimlar (Sales) tranzaksiyalarini filtrlash
  const allSales = useMemo(() => {
    const tepa = db.tepa?.transactions || [];
    const kotta = db.kotta?.transactions || [];
    return [...tepa, ...kotta].filter(t => t.amal === 'chiqim' && isDateInFilter(t.sana));
  }, [db.tepa, db.kotta, isDateInFilter]);

  // 2. Jami Operatsion Xarajatlar (OpEx)
  const totalOpExUzs = useMemo(() => {
    return (db.kassaHarakatlari || []).reduce((acc, h) => {
      if (h.tur === 'chiqim' && isDateInFilter(h.sana)) {
        const sumUzs = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || valyutaKursi) : h.summa);
        return acc + sumUzs;
      }
      return acc;
    }, 0);
  }, [db.kassaHarakatlari, isDateInFilter, valyutaKursi]);

  // 3. Jami sotilgan juftlar soni
  const totalPairsSold = useMemo(() => {
    return allSales.reduce((acc, t) => acc + Number(t.soni || 0), 0);
  }, [allSales]);

  // 4. 1 juft poyabzalga to'g'ri keluvchi taqsimlangan Operatsion Xarajat (Allocated OpEx per pair)
  const opExPerPair = useMemo(() => {
    return totalPairsSold > 0 ? totalOpExUzs / totalPairsSold : 0;
  }, [totalOpExUzs, totalPairsSold]);

  // 5. Har bir model bo'yicha Unit Economics tahlili
  const modelEconomics = useMemo(() => {
    const map: Record<string, {
      model: string;
      pairs: number;
      revenue: number;
      cost: number;
      grossProfit: number;
    }> = {};

    allSales.forEach(t => {
      const model = t.model || 'Noma\'lum';
      const qty = Number(t.soni || 0);
      const rev = Number(t.summa || 0);
      const modelCost = db.prices?.[model]?.cost || 0;
      const totalCost = qty * modelCost;
      const gross = rev - totalCost;

      if (!map[model]) {
        map[model] = { model, pairs: 0, revenue: 0, cost: 0, grossProfit: 0 };
      }
      map[model].pairs += qty;
      map[model].revenue += rev;
      map[model].cost += totalCost;
      map[model].grossProfit += gross;
    });

    return Object.values(map).map(item => {
      const avgSalePricePerPair = item.pairs > 0 ? item.revenue / item.pairs : 0;
      const avgCostPerPair = item.pairs > 0 ? item.cost / item.pairs : 0;
      
      // Unit Net Profit = 1 juft sotuv - 1 juft tannarx - 1 juft OpEx ulushi
      const netProfitPerPair = avgSalePricePerPair - avgCostPerPair - opExPerPair;
      const totalNetProfit = netProfitPerPair * item.pairs;
      const netMargin = avgSalePricePerPair > 0 ? (netProfitPerPair / avgSalePricePerPair) * 100 : 0;

      let status: 'star' | 'good' | 'low' | 'loss' = 'good';
      if (netProfitPerPair < 0) status = 'loss';
      else if (netMargin >= 25) status = 'star';
      else if (netMargin < 10) status = 'low';

      return {
        ...item,
        avgSalePricePerPair,
        avgCostPerPair,
        opExPerPair,
        netProfitPerPair,
        totalNetProfit,
        netMargin,
        status
      };
    });
  }, [allSales, db.prices, opExPerPair]);

  // Filtrlash va saralash
  const filteredAndSorted = useMemo(() => {
    return modelEconomics
      .filter(item => {
        if (filterType === 'high_profit' && item.status !== 'star') return false;
        if (filterType === 'low_profit' && item.status !== 'low') return false;
        if (filterType === 'loss' && item.status !== 'loss') return false;

        if (searchQuery) {
          return item.model.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'profit') return b.totalNetProfit - a.totalNetProfit;
        if (sortBy === 'margin') return b.netMargin - a.netMargin;
        if (sortBy === 'pairs') return b.pairs - a.pairs;
        if (sortBy === 'revenue') return b.revenue - a.revenue;
        return 0;
      });
  }, [modelEconomics, filterType, searchQuery, sortBy]);

  // Statistik xulosalar
  const starCount = modelEconomics.filter(m => m.status === 'star').length;
  const lossCount = modelEconomics.filter(m => m.status === 'loss').length;
  const totalNetProfitAll = modelEconomics.reduce((acc, m) => acc + m.totalNetProfit, 0);

  return (
    <div className="space-y-6">
      
      {/* ========================================================================= */}
      {/* 1. UNIT ECONOMICS BANNER & METRIKALAR */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight">
                Unit Economics (Poyabzal Jufti Bo'yicha Sof Foyda)
              </h2>
              <p className="text-xs text-[var(--text3)]">
                Formula: 1 juft sotuv narxi - 1 juft tannarxi - (OpEx taqsimoti / juft) = 1 juftdagi Sof Foyda
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text3)] bg-[var(--bg)] px-3 py-1.5 rounded-xl border border-[var(--border)]">
              Jami sotildi: <strong className="text-[var(--text)]">{totalPairsSold.toLocaleString()} juft</strong>
            </span>
          </div>
        </div>

        {/* 3 ta Katta Indikator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase">1 Juftga To'g'ri Keluvchi OpEx</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400 my-1 tabular-nums">
              {formatUzs(Math.round(opExPerPair))} <span className="text-xs font-bold text-[var(--text3)]">UZS / juft</span>
            </span>
            <span className="text-[10px] text-[var(--text3)]">Ish haqi, ijara, transport, marketing ulushi</span>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">⭐ Yuqori Rentabel Modellar</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 my-1 tabular-nums">
              {starCount} ta model
            </span>
            <span className="text-[10px] text-[var(--text3)]">Marjasi 25% dan yuqori bo'lgan lokomotivlar</span>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">⚠️ Zarar / Muzlagan Modellar</span>
            <span className="text-xl font-black text-rose-600 dark:text-rose-400 my-1 tabular-nums">
              {lossCount} ta model
            </span>
            <span className="text-[10px] text-[var(--text3)]">OpEx hisoblanganda zararga kiruvchi modellar</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FILTRLAR VA SARALASH */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Qidiruv */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
          <input
            type="text"
            placeholder="Model nomi bo'yicha qidirish..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl text-xs font-medium text-[var(--text)] outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter chiplari */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              filterType === 'all' 
                ? "bg-indigo-600 text-white shadow-xs" 
                : "bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
            )}
          >
            Barchasi ({modelEconomics.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('high_profit')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              filterType === 'high_profit' 
                ? "bg-emerald-600 text-white shadow-xs" 
                : "bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
            )}
          >
            ⭐ Yuqori Foydali ({starCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('loss')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              filterType === 'loss' 
                ? "bg-rose-600 text-white shadow-xs" 
                : "bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
            )}
          >
            ⚠️ Zararli / Xavfli ({lossCount})
          </button>
        </div>

        {/* Saralash */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--text3)]">Saralash:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="profit">Jami Sof Foyda (UZS)</option>
            <option value="margin">Rentabellik Marjasi (%)</option>
            <option value="pairs">Sotilgan juftlar soni</option>
            <option value="revenue">Yalpi Tushum (UZS)</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MODELLAR UNIT ECONOMICS JADVALI */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-[10px] font-black uppercase text-[var(--text3)] tracking-wider">
                <th className="px-4 py-3">Model Nomi</th>
                <th className="px-4 py-3 text-center">Sotilgan Juft</th>
                <th className="px-4 py-3 text-right">O'rtacha Sotuv / Juft</th>
                <th className="px-4 py-3 text-right">Tannarx / Juft</th>
                <th className="px-4 py-3 text-right">OpEx Ulushi</th>
                <th className="px-4 py-3 text-right">1 Juftdagi Sof Foyda</th>
                <th className="px-4 py-3 text-right">Jami Sof Foyda</th>
                <th className="px-4 py-3 text-center">Rentabellik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text3)]">
                    Tanlangan davr yoki filtr bo'yicha modellar topilmadi
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map(m => {
                  return (
                    <tr key={m.model} className="hover:bg-[var(--bg)]/50 transition-colors">
                      
                      {/* Model Nomi & Status badge */}
                      <td className="px-4 py-3.5 font-bold text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[var(--text3)] shrink-0" />
                          <span className="truncate max-w-[150px] sm:max-w-none">{m.model}</span>
                          {m.status === 'star' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              ⭐ Star
                            </span>
                          )}
                          {m.status === 'loss' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 border border-rose-500/20">
                              ⚠️ Zarar
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sotilgan Juft */}
                      <td className="px-4 py-3.5 text-center font-bold text-[var(--text)] tabular-nums">
                        {m.pairs.toLocaleString()} juft
                      </td>

                      {/* O'rtacha Sotuv Narxi */}
                      <td className="px-4 py-3.5 text-right font-medium text-[var(--text)] tabular-nums">
                        {formatUzs(Math.round(m.avgSalePricePerPair))}
                      </td>

                      {/* Tannarx */}
                      <td className="px-4 py-3.5 text-right text-[var(--text3)] tabular-nums">
                        {formatUzs(Math.round(m.avgCostPerPair))}
                      </td>

                      {/* OpEx Ulushi */}
                      <td className="px-4 py-3.5 text-right text-amber-600 dark:text-amber-400 tabular-nums font-medium">
                        -{formatUzs(Math.round(m.opExPerPair))}
                      </td>

                      {/* 1 Juftdagi Sof Foyda */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span className={cn(
                          "font-black",
                          m.netProfitPerPair >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"
                        )}>
                          {m.netProfitPerPair >= 0 ? '+' : ''}{formatUzs(Math.round(m.netProfitPerPair))} UZS
                        </span>
                      </td>

                      {/* Jami Sof Foyda */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span className={cn(
                          "font-black text-sm",
                          m.totalNetProfit >= 0 ? "text-purple-600 dark:text-purple-400" : "text-rose-600"
                        )}>
                          {m.totalNetProfit >= 0 ? '+' : ''}{formatCompact(m.totalNetProfit)} UZS
                        </span>
                      </td>

                      {/* Rentabellik % Progress Bar */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={cn(
                            "text-xs font-black tabular-nums",
                            m.netMargin >= 20 ? "text-emerald-600" :
                            m.netMargin > 0 ? "text-amber-600" : "text-rose-600"
                          )}>
                            {m.netMargin.toFixed(1)}%
                          </span>
                          <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                m.netMargin >= 20 ? "bg-emerald-500" :
                                m.netMargin > 0 ? "bg-amber-500" : "bg-rose-500"
                              )}
                              style={{ width: `${Math.min(100, Math.max(5, m.netMargin))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
