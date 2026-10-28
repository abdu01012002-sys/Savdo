import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { 
  PackageX, 
  Clock, 
  RotateCcw, 
  Flame, 
  Snowflake, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  ChevronRight, 
  ChevronDown,
  X, 
  Layers, 
  ShieldAlert, 
  ExternalLink,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { formatCompact, formatUzs, cn, isCorrectionTx } from '../lib/utils';
import { ModelDrillDownModal } from './ModelDrillDownModal';

interface Props {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

interface BrokenSeriesItem {
  model: string;
  totalPairs: number;
  availableSizes: string[];
  missingMiddleSizes: string[];
  edgeSizesRemaining: string[];
  status: 'healthy' | 'warning' | 'severely_broken';
}

interface DefectRateItem {
  model: string;
  soldPairs: number;
  returnedPairs: number;
  defectPairs: number;
  totalDefectReturn: number;
  ratePct: number;
  mainDefectReason: string;
}

export function IndustryShoeMetricsWidget({ dateFilter = 'today', startDate, endDate }: Props) {
  const { db } = useDb();
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('falak_industry_metrics_expanded');
      return saved !== null ? saved === 'true' : false; // Default: closed (yopiq holat)
    } catch {
      return false;
    }
  });
  const [activeCard, setActiveCard] = useState<'broken' | 'dsi' | 'returns' | 'bestseller' | 'deadstock' | 'intactness' | null>(null);
  const [selectedModelForModal, setSelectedModelForModal] = useState<string | null>(null);

  const toggleExpanded = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('falak_industry_metrics_expanded', String(next));
      } catch {}
      return next;
    });
  };

  // 1. "SINGAN SERIYALAR" (BROKEN SIZE RUNS) & SERIYA BUTUNLIGI
  const { brokenSeriesData, intactnessPct, severelyBrokenCount } = useMemo(() => {
    const modelStockCombined: Record<string, Record<string, number>> = {};

    ['tepa', 'kotta', 'sort2'].forEach(w => {
      const stock = db[w as 'tepa' | 'kotta' | 'sort2']?.stock || {};
      Object.entries(stock).forEach(([model, sizes]) => {
        if (!modelStockCombined[model]) modelStockCombined[model] = {};
        Object.entries(sizes).forEach(([sz, count]) => {
          modelStockCombined[model][sz] = (modelStockCombined[model][sz] || 0) + count;
        });
      });
    });

    const result: BrokenSeriesItem[] = [];
    let healthyCount = 0;
    let totalAssessedModels = 0;

    Object.entries(modelStockCombined).forEach(([model, sizes]) => {
      const activeSizes = Object.entries(sizes).filter(([_, qty]) => qty > 0);
      const totalPairs = activeSizes.reduce((sum, [_, q]) => sum + q, 0);

      if (totalPairs < 4) return;
      totalAssessedModels++;

      const sizeKeys = Object.keys(sizes);
      const isMenShoes = sizeKeys.some(s => ['40', '41', '42', '43'].includes(s));
      const middleSizes = isMenShoes ? ['40', '41', '42'] : ['37', '38', '39'];
      const edgeSizes = isMenShoes ? ['38', '39', '44', '45'] : ['35', '36', '40', '41'];

      const missingMiddle: string[] = [];
      middleSizes.forEach(ms => {
        if (!sizes[ms] || sizes[ms] === 0) {
          missingMiddle.push(ms);
        }
      });

      const remainingEdges: string[] = [];
      edgeSizes.forEach(es => {
        if (sizes[es] && sizes[es] > 0) {
          remainingEdges.push(`${es} (${sizes[es]}j)`);
        }
      });

      let status: 'healthy' | 'warning' | 'severely_broken' = 'healthy';
      if (missingMiddle.length >= 2 && remainingEdges.length > 0) {
        status = 'severely_broken';
      } else if (missingMiddle.length === 1 && remainingEdges.length > 0) {
        status = 'warning';
      } else {
        healthyCount++;
      }

      if (status !== 'healthy') {
        result.push({
          model,
          totalPairs,
          availableSizes: activeSizes.map(([s, q]) => `${s}: ${q}j`),
          missingMiddleSizes: missingMiddle,
          edgeSizesRemaining: remainingEdges,
          status
        });
      }
    });

    const intactness = totalAssessedModels > 0 
      ? Math.round((healthyCount / totalAssessedModels) * 1000) / 10 
      : 100;

    return {
      brokenSeriesData: result.sort((a, b) => b.totalPairs - a.totalPairs),
      intactnessPct: intactness,
      severelyBrokenCount: result.filter(b => b.status === 'severely_broken').length
    };
  }, [db]);

  // 2. OMBOR AYLANMA DAVRI (DSI / TURNOVER DAYS) & DEAD STOCK (MUZLAGAN TOVARLAR)
  const turnoverData = useMemo(() => {
    const allChiqimTxs = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(
      t => t.amal === 'chiqim' && !isCorrectionTx(t)
    );

    const d30Ago = new Date();
    d30Ago.setDate(d30Ago.getDate() - 30);
    const d30Str = d30Ago.toISOString().slice(0, 10);

    let last30DaysSoldPairs = 0;
    const modelSales30Days: Record<string, number> = {};

    allChiqimTxs.forEach(t => {
      if (t.sana >= d30Str) {
        last30DaysSoldPairs += (t.soni || 0);
        if (t.model) {
          modelSales30Days[t.model] = (modelSales30Days[t.model] || 0) + (t.soni || 0);
        }
      }
    });

    let totalStockPairs = 0;
    const modelCurrentStock: Record<string, number> = {};

    ['tepa', 'kotta', 'sort2'].forEach(w => {
      const stock = db[w as 'tepa' | 'kotta' | 'sort2']?.stock || {};
      Object.entries(stock).forEach(([model, sizes]) => {
        Object.values(sizes).forEach(q => {
          totalStockPairs += q;
          modelCurrentStock[model] = (modelCurrentStock[model] || 0) + q;
        });
      });
    });

    const dailyAverageSales = last30DaysSoldPairs > 0 ? (last30DaysSoldPairs / 30) : 0;
    const overallTurnoverDays = dailyAverageSales > 0 ? Math.round(totalStockPairs / dailyAverageSales) : 999;

    let deadStockPairs = 0;
    let deadStockValue = 0;
    const deadStockModels: Array<{ model: string; pairs: number; costValue: number }> = [];

    const modelTurnoverList = Object.keys(modelCurrentStock).map(model => {
      const currentStock = modelCurrentStock[model] || 0;
      const soldLast30 = modelSales30Days[model] || 0;
      const dailyModelSales = soldLast30 / 30;
      
      let dsiDays = 999;
      if (dailyModelSales > 0) {
        dsiDays = Math.round(currentStock / dailyModelSales);
      } else if (currentStock === 0) {
        dsiDays = 0;
      }

      const costPrice = db.prices?.[model]?.cost || 0;
      const modelCostValue = currentStock * costPrice;

      let speedRating: 'tez' | 'normal' | 'sekin' | 'muzlagan' = 'normal';
      if (dsiDays <= 25) speedRating = 'tez';
      else if (dsiDays <= 60) speedRating = 'normal';
      else if (dsiDays <= 120) speedRating = 'sekin';
      else {
        speedRating = 'muzlagan';
        if (currentStock > 0) {
          deadStockPairs += currentStock;
          deadStockValue += modelCostValue;
          deadStockModels.push({ model, pairs: currentStock, costValue: modelCostValue });
        }
      }

      return {
        model,
        currentStock,
        soldLast30,
        dsiDays: dsiDays > 365 ? '>365' : dsiDays,
        rawDays: dsiDays,
        speedRating,
        costPrice
      };
    }).filter(m => m.currentStock > 0 || m.soldLast30 > 0)
      .sort((a, b) => b.soldLast30 - a.soldLast30);

    return {
      overallTurnoverDays: overallTurnoverDays > 365 ? '>365' : overallTurnoverDays,
      dailyAverageSales: Math.round(dailyAverageSales * 10) / 10,
      totalStockPairs,
      last30DaysSoldPairs,
      modelTurnoverList,
      deadStockPairs,
      deadStockValue,
      deadStockModels: deadStockModels.sort((a, b) => b.pairs - a.pairs)
    };
  }, [db]);

  // 3. QAYTARISHLAR VA BRAK KOEFFITSIYENTI (RETURN / DEFECT RATE)
  const returnDefectData = useMemo(() => {
    const allChiqimTxs = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(
      t => t.amal === 'chiqim' && !isCorrectionTx(t)
    );

    const modelSalesTotal: Record<string, number> = {};
    let grandTotalSold = 0;

    allChiqimTxs.forEach(t => {
      grandTotalSold += (t.soni || 0);
      if (t.model) {
        modelSalesTotal[t.model] = (modelSalesTotal[t.model] || 0) + (t.soni || 0);
      }
    });

    const modelReturns: Record<string, { count: number; reasons: Record<string, number> }> = {};
    let totalReturnsCount = 0;

    (db.vozvratlar || []).forEach(v => {
      totalReturnsCount += (v.jamiSoni || 0);
      if (!modelReturns[v.model]) {
        modelReturns[v.model] = { count: 0, reasons: {} };
      }
      modelReturns[v.model].count += (v.jamiSoni || 0);
      if (v.sabab) {
        modelReturns[v.model].reasons[v.sabab] = (modelReturns[v.model].reasons[v.sabab] || 0) + (v.jamiSoni || 0);
      }
    });

    const modelDefects: Record<string, { count: number; nuqsonlar: Record<string, number> }> = {};
    let totalDefectsCount = 0;

    (db.braklar || []).forEach(b => {
      totalDefectsCount += (b.jamiSoni || 0);
      if (!modelDefects[b.model]) {
        modelDefects[b.model] = { count: 0, nuqsonlar: {} };
      }
      modelDefects[b.model].count += (b.jamiSoni || 0);
      if (b.nuqsonTuri) {
        modelDefects[b.model].nuqsonlar[b.nuqsonTuri] = (modelDefects[b.model].nuqsonlar[b.nuqsonTuri] || 0) + (b.jamiSoni || 0);
      }
    });

    const allModels = Array.from(new Set([
      ...Object.keys(modelSalesTotal),
      ...Object.keys(modelReturns),
      ...Object.keys(modelDefects)
    ]));

    const defectList: DefectRateItem[] = allModels.map(model => {
      const sold = modelSalesTotal[model] || 0;
      const returned = modelReturns[model]?.count || 0;
      const defect = modelDefects[model]?.count || 0;
      const totalIssue = returned + defect;

      const ratePct = sold > 0 ? Math.round((totalIssue / sold) * 1000) / 10 : (totalIssue > 0 ? 100 : 0);

      let mainReason = '—';
      const reasonsObj = modelReturns[model]?.reasons || {};
      const nuqsonObj = modelDefects[model]?.nuqsonlar || {};

      let maxReasonCount = 0;
      Object.entries({ ...reasonsObj, ...nuqsonObj }).forEach(([r, count]) => {
        if (count > maxReasonCount) {
          maxReasonCount = count;
          mainReason = r === 'brak_nuqsonli' ? 'Brak nuqsoni'
            : r === 'olcham_togri_kelmadi' ? 'O\'lcham mos kelmadi'
            : r === 'chok_tutilishi' ? 'Chok tutilishi'
            : r === 'taglik_kochinishi' ? 'Taglik ko\'chishi'
            : r === 'teri_yirtilishi' ? 'Teri shikastlangan'
            : r;
        }
      });

      return {
        model,
        soldPairs: sold,
        returnedPairs: returned,
        defectPairs: defect,
        totalDefectReturn: totalIssue,
        ratePct,
        mainDefectReason: mainReason
      };
    }).filter(item => item.totalDefectReturn > 0 || item.soldPairs > 30)
      .sort((a, b) => b.totalDefectReturn - a.totalDefectReturn);

    const overallIssueCount = totalReturnsCount + totalDefectsCount;
    const overallRate = grandTotalSold > 0 ? Math.round((overallIssueCount / grandTotalSold) * 1000) / 10 : 0;

    return {
      overallRate,
      totalReturnsCount,
      totalDefectsCount,
      overallIssueCount,
      defectList
    };
  }, [db]);

  // 4. BEST SELLER (HIT MODEL VELOCITY)
  const bestSeller = useMemo(() => {
    const list = turnoverData.modelTurnoverList;
    if (list.length > 0) {
      const top = list[0];
      const share = turnoverData.last30DaysSoldPairs > 0 
        ? Math.round((top.soldLast30 / turnoverData.last30DaysSoldPairs) * 100) 
        : 0;
      return {
        model: top.model,
        soldPairs: top.soldLast30,
        sharePct: share,
        stock: top.currentStock
      };
    }
    return { model: '—', soldPairs: 0, sharePct: 0, stock: 0 };
  }, [turnoverData]);

  return (
    <div className="space-y-3 mb-1">
      {/* Sarlavha paneli (Ochilib-yopiladigan boshqaruv) */}
      <div 
        onClick={toggleExpanded}
        className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] hover:border-blue-500/40 cursor-pointer transition-all group select-none shadow-xs"
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="w-7 h-7 rounded-xl bg-[var(--bg)] group-hover:bg-blue-500/10 group-hover:text-blue-500 border border-[var(--border)] flex items-center justify-center text-[var(--text2)] transition-all"
            aria-label={isExpanded ? "Metrikalarni yopish" : "Metrikalarni ochish"}
          >
            <ChevronDown 
              size={15} 
              className={cn("transition-transform duration-200", !isExpanded && "-rotate-90")} 
            />
          </button>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5 leading-tight">
              <PackageX size={15} />
              Poyafzal Ishlab Chiqarish & Savdo Maxsus Metrikalari
            </span>
            <span className="text-[10px] text-[var(--text3)] font-semibold block sm:hidden">
              Singan seriyalar, DSI, Brak va h.k. (6 ta KPI)
            </span>
          </div>
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            6 Ta Asosiy KPI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text3)] hidden sm:inline-block">
            {isExpanded ? "Yig'ish uchun bosing" : "Tahlillarni ko'rish uchun bosing"}
          </span>
          <span className={cn(
            "text-[10px] font-black px-2.5 py-1 rounded-xl border transition-all flex items-center gap-1",
            isExpanded 
              ? "bg-[var(--bg)] text-[var(--text2)] border-[var(--border)]" 
              : "bg-blue-500 hover:bg-blue-600 text-white border-blue-600 shadow-xs"
          )}>
            {isExpanded ? "Yig'ish" : "Ochish ▾"}
          </span>
        </div>
      </div>

      {/* Ochilib-yopiladigan kontent */}
      {isExpanded && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* 6-COLUMN UNIFORM EXECUTIVE GRID (156px height each, symmetrical) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

        {/* 1. SINGAN SERIYALAR */}
        <div 
          onClick={() => setActiveCard(activeCard === 'broken' ? null : 'broken')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'broken' 
              ? "border-rose-500 ring-2 ring-rose-500/20 bg-gradient-to-b from-rose-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-rose-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <PackageX size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Singan Seriya
                </span>
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black border",
                severelyBrokenCount > 0 
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 animate-pulse" 
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              )}>
                {severelyBrokenCount > 0 ? `${severelyBrokenCount} xavf` : 'Normal'}
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-[var(--text)] tracking-tight">
                {brokenSeriesData.length} <span className="text-xs font-semibold text-[var(--text3)]">model</span>
              </div>
              <div className="text-xs font-bold text-rose-500 mt-0.5 truncate">
                {severelyBrokenCount > 0 ? "O'rta o'lchamlar tugagan" : "Seriyalar to'liq"}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">O'lcham balansi</span>
            <span className="text-rose-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Tahlil <ChevronRight size={12} className={cn("transition-transform", activeCard === 'broken' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* 2. SERIYA BUTUNLIGI */}
        <div 
          onClick={() => setActiveCard(activeCard === 'intactness' ? null : 'intactness')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'intactness' 
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-emerald-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Seriya Butunligi
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Ombor salomatligi
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {intactnessPct}%
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                Qutilab sotish tayyorligi
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">To'liq seriyalar</span>
            <span className="text-emerald-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Tafsilot <ChevronRight size={12} className={cn("transition-transform", activeCard === 'intactness' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* 3. OMBOR AYLANMASI (DSI) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'dsi' ? null : 'dsi')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'dsi' 
              ? "border-amber-500 ring-2 ring-amber-500/20 bg-gradient-to-b from-amber-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-amber-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Clock size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Aylanma Davri
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                DSI
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                {turnoverData.overallTurnoverDays} <span className="text-xs font-semibold text-[var(--text3)]">kun</span>
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                Sur'at: ~{turnoverData.dailyAverageSales} j/kun
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">Pul aylanmasi</span>
            <span className="text-amber-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Tezlik <ChevronRight size={12} className={cn("transition-transform", activeCard === 'dsi' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* 4. ENG O'TUVCHI (HIT MODEL) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'bestseller' ? null : 'bestseller')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'bestseller' 
              ? "border-blue-500 ring-2 ring-blue-500/20 bg-gradient-to-b from-blue-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-blue-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Flame size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Hit Model
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Top #1
              </span>
            </div>

            <div className="mt-1">
              <div className="text-lg font-black text-blue-600 dark:text-blue-400 tracking-tight truncate" title={bestSeller.model}>
                {bestSeller.model}
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                {bestSeller.soldPairs.toLocaleString()} j ({bestSeller.sharePct}% ulush)
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">Qoldiq: {bestSeller.stock} j</span>
            <span className="text-blue-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Reyting <ChevronRight size={12} className={cn("transition-transform", activeCard === 'bestseller' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* 5. MUZLAGAN TOVARLAR (DEAD STOCK) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'deadstock' ? null : 'deadstock')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'deadstock' 
              ? "border-purple-500 ring-2 ring-purple-500/20 bg-gradient-to-b from-purple-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-purple-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Snowflake size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Muzlagan Qoldiq
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                &gt;120 kun
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
                {turnoverData.deadStockPairs.toLocaleString()} <span className="text-xs font-semibold text-[var(--text3)]">juft</span>
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                Qiymat: ~{formatCompact(turnoverData.deadStockValue)} so'm
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">{turnoverData.deadStockModels.length} xil model</span>
            <span className="text-purple-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Chegirma <ChevronRight size={12} className={cn("transition-transform", activeCard === 'deadstock' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* 6. BRAK & VOZVRAT */}
        <div 
          onClick={() => setActiveCard(activeCard === 'returns' ? null : 'returns')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'returns' 
              ? "border-red-500 ring-2 ring-red-500/20 bg-gradient-to-b from-red-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-red-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-600 opacity-90" />
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <RotateCcw size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider truncate">
                  Brak & Vozvrat
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                Rate
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-red-600 dark:text-red-400 tracking-tight">
                {returnDefectData.overallRate}%
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                {returnDefectData.overallIssueCount} j ({returnDefectData.totalReturnsCount} vozv / {returnDefectData.totalDefectsCount} brak)
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">Sifat nazorati</span>
            <span className="text-red-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Sabablar <ChevronRight size={12} className={cn("transition-transform", activeCard === 'returns' && "rotate-90")} />
            </span>
          </div>
        </div>

      </div>

      {/* COMPACT EXPANDABLE DETAILS DRAWER (OPENS ON CLICK) */}
      {activeCard && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 relative">
          <button 
            onClick={() => setActiveCard(null)} 
            className="absolute top-3.5 right-3.5 text-xs font-black text-[var(--text3)] hover:text-rose-500 bg-[var(--bg)] px-2.5 py-1 rounded-xl border border-[var(--border)] transition-colors cursor-pointer flex items-center gap-1"
          >
            <X size={13} /> Yopish
          </button>

          {/* 1. SINGAN SERIYALAR DRAWER */}
          {activeCard === 'broken' && (
            <div className="space-y-3 pr-16">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-2">
                  <PackageX size={15} />
                  Singan Seriyalar Tahlili (O'rta o'lchamlari tugagan modellar)
                </h4>
                <span className="text-xs font-bold text-[var(--text3)]">
                  Jami: {brokenSeriesData.length} ta model
                </span>
              </div>

              {brokenSeriesData.length === 0 ? (
                <p className="text-xs text-[var(--text3)] py-3">Barcha modellarda o'lchamlar balansi to'liq saqlanmoqda.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {brokenSeriesData.map(b => (
                    <div key={b.model} className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black text-[var(--text)] truncate">{b.model}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                            b.status === 'severely_broken' ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          )}>
                            {b.status === 'severely_broken' ? "Xavfli: Seriya uzilgan" : "O'rta kamaygan"}
                          </span>
                        </div>
                        <div className="text-[11px] text-rose-500 font-bold mb-1">
                          ✕ Tugagan: {b.missingMiddleSizes.map(s => `${s}-o'lcham`).join(', ')}
                        </div>
                        <div className="text-[10px] text-[var(--text3)]">
                          Qolgan o'lchamlar: {b.edgeSizesRemaining.join(', ') || 'Kam'}
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--text)]">Jami qoldiq: {b.totalPairs} j</span>
                        <button
                          onClick={() => setSelectedModelForModal(b.model)}
                          className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          Tahlil <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. SERIYA BUTUNLIGI DRAWER */}
          {activeCard === 'intactness' && (
            <div className="space-y-3 pr-16">
              <h4 className="text-xs font-black text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={15} />
                Seriya Butunligi va Komplektlash Salomatligi
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[var(--bg)] p-3.5 rounded-xl border border-emerald-500/20">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-0.5">Butun Seriyalar Ulushi</span>
                  <div className="text-xl font-black text-emerald-600">{intactnessPct}%</div>
                  <p className="text-[10px] text-[var(--text3)] mt-1">Barcha o'lchamlari (39-44) mavjud to'liq qutilar nisbati.</p>
                </div>
                <div className="bg-[var(--bg)] p-3.5 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-bold text-[var(--text3)] uppercase block mb-0.5">Xavfli Modellar</span>
                  <div className="text-xl font-black text-rose-500">{severelyBrokenCount} ta</div>
                  <p className="text-[10px] text-[var(--text3)] mt-1">O'rta o'lchamlari quyilishi kerak bo'lgan partiyalar.</p>
                </div>
                <div className="bg-[var(--bg)] p-3.5 rounded-xl border border-blue-500/20">
                  <span className="text-[10px] font-bold text-blue-500 uppercase block mb-0.5">Biznes Tavsiyasi</span>
                  <p className="text-xs font-semibold text-[var(--text)] mt-1 leading-snug">
                    Ulgurji xaridorlarga qutilab sotishda to'xtalish bo'lmasligi uchun brakelangan modellarning faqat 40-42 o'lchamlarini qo'shimcha ishlab chiqarish tavsiya etiladi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. DSI AYLANMA DAVRI DRAWER */}
          {activeCard === 'dsi' && (
            <div className="space-y-3 pr-16">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={15} />
                  Ombor Aylanma Tezligi (DSI: Days Sales of Inventory)
                </h4>
                <span className="text-xs font-bold text-[var(--text3)]">
                  O'rtacha: {turnoverData.overallTurnoverDays} kun
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                {turnoverData.modelTurnoverList.map(m => (
                  <div key={m.model} className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-[var(--text)] truncate">{m.model}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                          m.speedRating === 'tez' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : m.speedRating === 'normal' ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                          : m.speedRating === 'sekin' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          : "bg-purple-500/10 text-purple-600 border border-purple-500/20"
                        )}>
                          {m.speedRating === 'tez' ? '⚡ Tezkor' : m.speedRating === 'normal' ? 'Normal' : m.speedRating === 'sekin' ? 'Sekin' : '❄️ Muzlagan'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[var(--text)]">
                        Aylanma davri: <strong className="text-amber-500">{m.dsiDays} kun</strong>
                      </div>
                      <div className="text-[10px] text-[var(--text3)] mt-0.5">
                        Omborda: {m.currentStock} j | 30 kunda sotilgan: {m.soldLast30} j
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-end">
                      <button
                        onClick={() => setSelectedModelForModal(m.model)}
                        className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        Model tafsiloti <ExternalLink size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. HIT MODEL (BEST SELLER) DRAWER */}
          {activeCard === 'bestseller' && (
            <div className="space-y-3 pr-16">
              <h4 className="text-xs font-black text-blue-500 uppercase tracking-wider flex items-center gap-2">
                <Flame size={15} />
                Eng Ko'p Sotilayotgan Modellar Reytingi (Top Velocity)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {turnoverData.modelTurnoverList.slice(0, 4).map((m, idx) => (
                  <div key={m.model} className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] relative overflow-hidden">
                    <div className="text-[10px] font-black text-blue-500 uppercase mb-1">
                      #{idx + 1} O'rin
                    </div>
                    <div className="text-sm font-black text-[var(--text)] truncate">{m.model}</div>
                    <div className="text-xs font-bold text-blue-500 mt-1">
                      {m.soldLast30.toLocaleString()} juft sotilgan
                    </div>
                    <div className="text-[10px] text-[var(--text3)] mt-0.5">
                      Hozirgi qoldiq: {m.currentStock} j
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. MUZLAGAN QOLDIQ (DEAD STOCK) DRAWER */}
          {activeCard === 'deadstock' && (
            <div className="space-y-3 pr-16">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-purple-500 uppercase tracking-wider flex items-center gap-2">
                  <Snowflake size={15} />
                  Muzlagan Qoldiq & Passiv Modellar (&gt;120 kun aylanmagan)
                </h4>
                <span className="text-xs font-bold text-purple-500">
                  Jami: {turnoverData.deadStockPairs} juft (~{formatCompact(turnoverData.deadStockValue)} so'm)
                </span>
              </div>
              {turnoverData.deadStockModels.length === 0 ? (
                <p className="text-xs text-[var(--text3)] py-3">Aylanmasi to'xtab qolgan muzlagan tovarlar mavjud emas.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {turnoverData.deadStockModels.map(m => (
                    <div key={m.model} className="bg-[var(--bg)] p-3 rounded-xl border border-purple-500/20 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-black text-[var(--text)] truncate mb-1">{m.model}</div>
                        <div className="text-xs font-bold text-purple-600 dark:text-purple-400">
                          Qoldiq: {m.pairs} juft
                        </div>
                        <div className="text-[10px] text-[var(--text3)] mt-0.5">
                          Muzlagan tannarx: ~{formatUzs(m.costValue)} so'm
                        </div>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-[var(--border)] text-[10px] text-amber-500 font-bold">
                        Tavsiya: Aksiyaga kiritish yoki chegirma berish
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. BRAK & QAYTARISHLAR DRAWER */}
          {activeCard === 'returns' && (
            <div className="space-y-3 pr-16">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-red-500 uppercase tracking-wider flex items-center gap-2">
                  <RotateCcw size={15} />
                  Qaytarishlar (Vozvrat) va Brak Tahlili
                </h4>
                <span className="text-xs font-bold text-red-500">
                  Umumiy koeffitsiyent: {returnDefectData.overallRate}%
                </span>
              </div>

              {returnDefectData.defectList.length === 0 ? (
                <p className="text-xs text-[var(--text3)] py-3">Ushbu davrda qaytgan yoki brak mahsulotlar qayd etilmagan.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {returnDefectData.defectList.map(item => (
                    <div key={item.model} className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black text-[var(--text)] truncate">{item.model}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-black",
                            item.ratePct > 3 ? "bg-red-500/10 text-red-600 border border-red-500/20" : "bg-[var(--bg2)] text-[var(--text3)]"
                          )}>
                            {item.ratePct}%
                          </span>
                        </div>
                        <div className="text-xs font-bold text-red-500">
                          {item.totalDefectReturn} j ({item.returnedPairs} vozvrat / {item.defectPairs} brak)
                        </div>
                        <div className="text-[10px] text-[var(--text3)] mt-0.5">
                          Asosiy sabab: <strong className="text-[var(--text)]">{item.mainDefectReason}</strong>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text3)]">
                        <span>Sotuv: {item.soldPairs} j</span>
                        <button
                          onClick={() => setSelectedModelForModal(item.model)}
                          className="font-bold text-blue-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          Tahlil <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

        </div>
      )}

      {/* Model DrillDown Modal */}
      {selectedModelForModal && (
        <ModelDrillDownModal
          modelName={selectedModelForModal}
          onClose={() => setSelectedModelForModal(null)}
        />
      )}
    </div>
  );
}
