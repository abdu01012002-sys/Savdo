import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { 
  TrendingUp, 
  TrendingDown,
  Wallet, 
  Package, 
  DollarSign, 
  ChevronRight, 
  ChevronDown,
  BarChart3,
  CreditCard, 
  Landmark, 
  Coins, 
  Receipt,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  PieChart as PieChartIcon,
  ShieldCheck,
  Percent,
  Layers,
  ArrowRightLeft,
  Building2,
  AlertTriangle,
  Info,
  X
} from 'lucide-react';
import { formatCompact, formatUzs, getTodayStr, cn, isCorrectionTx } from '../lib/utils';

interface SmartSummaryProps {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

export function SmartSummaryWidget({ dateFilter = 'today', startDate, endDate }: SmartSummaryProps) {
  const { db, currentUser } = useDb();
  const isAdmin = currentUser?.rol === 'admin';
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('falak_smart_summary_expanded');
      return saved !== null ? saved === 'true' : false; // Default: closed (yopiq holat)
    } catch {
      return false;
    }
  });
  const [activeCard, setActiveCard] = useState<'sales' | 'profit' | 'cash' | 'stock' | 'opex' | null>(null);

  const toggleExpanded = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('falak_smart_summary_expanded', String(next));
      } catch {}
      return next;
    });
  };

  const summary = useMemo(() => {
    const todayStr = getTodayStr();
    const today = new Date();

    // 1. Tanlangan Davr Savdo hajmi (Current Sales)
    const allTxs = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])];
    
    let totalSalesPairs = 0;
    let totalSalesRevenue = 0;
    let grossProfit = 0;
    let transactionsCount = 0;

    // Previous equivalent period for % Growth calculation
    let prevSalesPairs = 0;
    let prevSalesRevenue = 0;
    
    // Sparkline: Oxirgi 7 kunlik trend
    const last7DaysMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7DaysMap[d.toISOString().slice(0, 10)] = 0;
    }

    // Determine target and previous date matches
    allTxs.forEach(t => {
      if (t.amal === 'chiqim' && !isCorrectionTx(t)) {
        const tDate = new Date(t.sana);
        let isMatch = true;
        let isPrevMatch = false;
        
        if (dateFilter === 'today') {
          isMatch = t.sana === todayStr;
          const y = new Date(); y.setDate(y.getDate() - 1);
          isPrevMatch = t.sana === y.toISOString().slice(0, 10);
        } else if (dateFilter === 'yesterday') {
          const y = new Date(); y.setDate(y.getDate() - 1);
          isMatch = t.sana === y.toISOString().slice(0, 10);
          const y2 = new Date(); y2.setDate(y2.getDate() - 2);
          isPrevMatch = t.sana === y2.toISOString().slice(0, 10);
        } else if (dateFilter === 'this_week') {
          const curr = new Date();
          const first = curr.getDate() - curr.getDay() + 1;
          const firstDay = new Date(curr.setDate(first));
          isMatch = t.sana >= firstDay.toISOString().slice(0, 10);
          // Prev week
          const prevFirst = new Date(firstDay); prevFirst.setDate(prevFirst.getDate() - 7);
          isPrevMatch = t.sana >= prevFirst.toISOString().slice(0, 10) && t.sana < firstDay.toISOString().slice(0, 10);
        } else if (dateFilter === 'this_month') {
          isMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === today.getFullYear() && tDate.getMonth() === today.getMonth();
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          isPrevMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === lastMonth.getFullYear() && tDate.getMonth() === lastMonth.getMonth();
        } else if (dateFilter === 'last_month') {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          isMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === lastMonth.getFullYear() && tDate.getMonth() === lastMonth.getMonth();
          const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
          isPrevMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === twoMonthsAgo.getFullYear() && tDate.getMonth() === twoMonthsAgo.getMonth();
        } else if (dateFilter === 'this_year') {
          isMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === today.getFullYear();
          isPrevMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === today.getFullYear() - 1;
        } else if (dateFilter === 'custom') {
          if (startDate && t.sana < startDate) isMatch = false;
          if (endDate && t.sana > endDate) isMatch = false;
        }

        if (isMatch) {
          totalSalesPairs += (t.soni || 0);
          totalSalesRevenue += (t.summa || 0);
          grossProfit += (t.foyda || 0);
          transactionsCount += 1;
        }

        if (isPrevMatch) {
          prevSalesPairs += (t.soni || 0);
          prevSalesRevenue += (t.summa || 0);
        }

        if (last7DaysMap[t.sana] !== undefined) {
          last7DaysMap[t.sana] += (t.soni || 0);
        }
      }
    });

    const sparklineData = Object.values(last7DaysMap);
    const avgPricePerPair = totalSalesPairs > 0 ? Math.round(totalSalesRevenue / totalSalesPairs) : 0;

    // Sales growth vs previous period
    let salesGrowthPct = 0;
    if (prevSalesPairs > 0) {
      salesGrowthPct = Math.round(((totalSalesPairs - prevSalesPairs) / prevSalesPairs) * 100);
    } else if (totalSalesPairs > 0) {
      salesGrowthPct = 100;
    }

    // 2. Kassa Xarajatlari (OpEx)
    const kurs = db.valyutaKursi || 12850;
    const expenseCategories: Record<string, number> = {};
    let totalExpenses = 0;
    let expensesCount = 0;

    (db.kassaHarakatlari || []).forEach(h => {
      if (h.tur !== 'chiqim') return;
      const hDate = new Date(h.sana);
      let isMatch = true;

      if (dateFilter === 'today') isMatch = h.sana === todayStr;
      else if (dateFilter === 'yesterday') {
        const y = new Date(); y.setDate(y.getDate() - 1);
        isMatch = h.sana === y.toISOString().slice(0, 10);
      } else if (dateFilter === 'this_week') {
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + 1;
        const firstDay = new Date(curr.setDate(first));
        isMatch = h.sana >= firstDay.toISOString().slice(0, 10);
      } else if (dateFilter === 'this_month') {
        isMatch = !isNaN(hDate.getTime()) && hDate.getFullYear() === today.getFullYear() && hDate.getMonth() === today.getMonth();
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        isMatch = !isNaN(hDate.getTime()) && hDate.getFullYear() === lastMonth.getFullYear() && hDate.getMonth() === lastMonth.getMonth();
      } else if (dateFilter === 'this_year') {
        isMatch = !isNaN(hDate.getTime()) && hDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'custom') {
        if (startDate && h.sana < startDate) isMatch = false;
        if (endDate && h.sana > endDate) isMatch = false;
      }

      if (isMatch) {
        const val = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || kurs) : h.summa);
        totalExpenses += val;
        expensesCount++;
        const cat = h.kategoriya || 'Boshqa';
        expenseCategories[cat] = (expenseCategories[cat] || 0) + val;
      }
    });

    // 3. Sof Foyda (Net Profit)
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalSalesRevenue > 0 ? ((netProfit / totalSalesRevenue) * 100).toFixed(1) : '0';

    // 4. Kassa Balansi & Likvidlik
    const naqd = db.kassaBalansi?.naqd_uzs || 0;
    const karta = db.kassaBalansi?.karta_uzs || 0;
    const bank = db.kassaBalansi?.bank_uzs || 0;
    const dollarUzs = Math.round((db.kassaBalansi?.naqd_usd || 0) * kurs);
    const kassaQoldiq = naqd + karta + bank + dollarUzs;

    let qarzdorlarSoni = 0;
    let engKattaQarz = 0;
    let engKattaQarzdor = '';

    const umumiyQarz = (db.kontragentlar || []).reduce((acc, k) => {
      const b = k.balans || 0;
      if (b > 0) {
        qarzdorlarSoni++;
        if (b > engKattaQarz) {
          engKattaQarz = b;
          engKattaQarzdor = k.ism;
        }
        return acc + b;
      }
      return acc;
    }, 0);

    // 5. Ombordagi Tovar Qoldig'i & Qiymati
    let tepaJuft = 0;
    let kottaJuft = 0;
    let sort2Juft = 0;
    let jamiTovarQiymati = 0;
    const allModelsSet = new Set<string>();

    const countStock = (stockObj: Record<string, Record<string, number>> = {}, warehouse: 'tepa' | 'kotta' | 'sort2') => {
      Object.entries(stockObj).forEach(([model, sizes]) => {
        let modelSoni = 0;
        Object.values(sizes).forEach(count => modelSoni += count);
        if (modelSoni > 0) allModelsSet.add(model);
        
        if (warehouse === 'tepa') tepaJuft += modelSoni;
        else if (warehouse === 'kotta') kottaJuft += modelSoni;
        else if (warehouse === 'sort2') sort2Juft += modelSoni;
        
        const tanNarx = db.prices?.[model]?.cost || 0;
        jamiTovarQiymati += (modelSoni * tanNarx);
      });
    };
    countStock(db.tepa?.stock, 'tepa');
    countStock(db.kotta?.stock, 'kotta');
    countStock(db.sort2?.stock, 'sort2');
    const jamiTovar = tepaJuft + kottaJuft + sort2Juft;

    return {
      totalSalesPairs,
      totalSalesRevenue,
      salesGrowthPct,
      grossProfit,
      netProfit,
      profitMargin,
      transactionsCount,
      avgPricePerPair,
      sparklineData,
      totalExpenses,
      expensesCount,
      expenseCategories,
      kassaQoldiq,
      naqd,
      karta,
      bank,
      umumiyQarz,
      qarzdorlarSoni,
      engKattaQarz,
      engKattaQarzdor,
      jamiTovar,
      tepaJuft,
      kottaJuft,
      jamiTovarQiymati,
      uniqueModelsCount: allModelsSet.size
    };
  }, [db, dateFilter, startDate, endDate]);

  // Elegant Mini Sparkline (Stripe/Fintech style)
  const renderSparkline = (data: number[], color: string) => {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 64;
    const height = 22;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((val - min) / range) * (height - 6);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon
          points={`2,${height} ${points} ${width - 2},${height}`}
          fill={`url(#grad-spark-${color.replace('#', '')})`}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const periodLabel = dateFilter === 'today' ? 'Bugun' 
    : dateFilter === 'yesterday' ? 'Kecha' 
    : dateFilter === 'this_week' ? 'Shu hafta' 
    : dateFilter === 'this_month' ? 'Shu oy' 
    : dateFilter === 'last_month' ? 'O\'tgan oy' 
    : dateFilter === 'this_year' ? 'Shu yil' 
    : 'Tanlangan davr';

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
            aria-label={isExpanded ? "Moliyaviy ko'rsatkichlarni yopish" : "Moliyaviy ko'rsatkichlarni ochish"}
          >
            <ChevronDown 
              size={15} 
              className={cn("transition-transform duration-200", !isExpanded && "-rotate-90")} 
            />
          </button>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5 leading-tight">
              <BarChart3 size={15} />
              Asosiy Moliyaviy & Operatsion Ko'rsatkichlar
            </span>
            <span className="text-[10px] text-[var(--text3)] font-semibold block sm:hidden">
              Savdo, Sof foyda, Kassa, Ombor, OpEx (5 ta KPI)
            </span>
          </div>
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            5 Ta Asosiy KPI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text3)] hidden sm:inline-block">
            {isExpanded ? "Yig'ish uchun bosing" : "Ko'rsatkichlarni ko'rish uchun bosing"}
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
          {/* 5-COLUMN UNIFORM PREMIUM EXECUTIVE CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        
        {/* CARD 1: SAVDO HAJMI */}
        <div 
          onClick={() => setActiveCard(activeCard === 'sales' ? null : 'sales')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'sales' 
              ? "border-blue-500 ring-2 ring-blue-500/20 bg-gradient-to-b from-blue-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-blue-500/40 hover:shadow-xs"
          )}
        >
          {/* Subtle top indicator */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-90" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <TrendingUp size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider">
                  Savdo Hajmi
                </span>
              </div>
              
              {/* Dynamic Growth Badge */}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-0.5 border",
                summary.salesGrowthPct >= 0 
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              )}>
                {summary.salesGrowthPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {summary.salesGrowthPct >= 0 ? `+${summary.salesGrowthPct}%` : `${summary.salesGrowthPct}%`}
              </span>
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-1">
              <div className="text-2xl font-black text-[var(--text)] tracking-tight">
                {summary.totalSalesPairs.toLocaleString()} <span className="text-xs font-semibold text-[var(--text3)]">juft</span>
              </div>
              <div className="shrink-0 pb-0.5">
                {renderSparkline(summary.sparklineData, '#3b82f6')}
              </div>
            </div>

            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 truncate" title={`${formatUzs(summary.totalSalesRevenue)} so'm`}>
              {formatCompact(summary.totalSalesRevenue)} <span className="text-[10px] font-semibold text-[var(--text3)]">so'm tushum</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span>{summary.transactionsCount} ta sotuv</span>
            <span className="text-blue-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Tafsilot <ChevronRight size={12} className={cn("transition-transform", activeCard === 'sales' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* CARD 2: SOF FOYDA (P&L) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'profit' ? null : 'profit')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'profit' 
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-emerald-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-90" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <DollarSign size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider">
                  Sof Foyda
                </span>
              </div>
              
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {summary.profitMargin}% marja
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight truncate" title={`${formatUzs(summary.netProfit)} so'm`}>
                {formatCompact(summary.netProfit)} <span className="text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70">so'm</span>
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 truncate">
                Yalpi: <strong className="text-[var(--text)]">{formatCompact(summary.grossProfit)}</strong> so'm
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">OpEx chegirilgan</span>
            <span className="text-emerald-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              P&L <ChevronRight size={12} className={cn("transition-transform", activeCard === 'profit' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* CARD 3: KASSA & LIKVIDLIK */}
        <div 
          onClick={() => setActiveCard(activeCard === 'cash' ? null : 'cash')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'cash' 
              ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-gradient-to-b from-indigo-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-indigo-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-90" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider">
                  Kassa & Likvidlik
                </span>
              </div>
              
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Naqd+Karta
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-[var(--text)] tracking-tight truncate" title={`Kassa: ${formatUzs(summary.kassaQoldiq)} so'm`}>
                {formatCompact(summary.kassaQoldiq)} <span className="text-xs font-semibold text-[var(--text3)]">so'm</span>
              </div>
              <div className="text-xs font-bold text-[var(--text3)] mt-0.5 flex items-center gap-1.5 truncate">
                <span className="text-emerald-500">Naqd: {formatCompact(summary.naqd)}</span>
                <span>•</span>
                <span className="text-blue-500">Karta: {formatCompact(summary.karta)}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">Hamyonlar balansi</span>
            <span className="text-indigo-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Hamyon <ChevronRight size={12} className={cn("transition-transform", activeCard === 'cash' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* CARD 4: OMBOR QOLDIG'I & KAPITAL */}
        <div 
          onClick={() => setActiveCard(activeCard === 'stock' ? null : 'stock')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'stock' 
              ? "border-amber-500 ring-2 ring-amber-500/20 bg-gradient-to-b from-amber-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-amber-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-90" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Package size={14} />
                </div>
                <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider">
                  Ombor Kapitali
                </span>
              </div>
              
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {summary.uniqueModelsCount} xil model
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-[var(--text)] tracking-tight truncate">
                {summary.jamiTovar.toLocaleString()} <span className="text-xs font-semibold text-[var(--text3)]">juft</span>
              </div>
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                Qiymati: ~{formatCompact(summary.jamiTovarQiymati)} so'm
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate">2 ombor balansi</span>
            <span className="text-amber-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Ombor <ChevronRight size={12} className={cn("transition-transform", activeCard === 'stock' && "rotate-90")} />
            </span>
          </div>
        </div>

        {/* CARD 5: KASSA XARAJATLARI (OPEX) & NASIYA */}
        <div 
          onClick={() => setActiveCard(activeCard === 'opex' ? null : 'opex')}
          className={cn(
            "bg-[var(--bg2)] border rounded-2xl p-4 transition-all duration-200 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[156px]",
            activeCard === 'opex' 
              ? "border-rose-500 ring-2 ring-rose-500/20 bg-gradient-to-b from-rose-500/[0.05] to-[var(--bg2)] shadow-md" 
              : "border-[var(--border)] hover:border-rose-500/40 hover:shadow-xs"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500 opacity-90" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Receipt size={14} />
                </div>
                <span className="text-[11px] font-black text-rose-500 uppercase tracking-wider">
                  Xarajatlar (OpEx)
                </span>
              </div>
              
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {summary.expensesCount} ta chiqim
              </span>
            </div>

            <div className="mt-1">
              <div className="text-2xl font-black text-rose-500 tracking-tight truncate" title={`${formatUzs(summary.totalExpenses)} so'm`}>
                {formatCompact(summary.totalExpenses)} <span className="text-xs font-semibold text-rose-500/70">so'm</span>
              </div>
              <div className="text-xs font-bold text-amber-500 mt-0.5 truncate" title={`Nasiya: ${formatUzs(summary.umumiyQarz)} so'm`}>
                Nasiya: {formatCompact(summary.umumiyQarz)} so'm ({summary.qarzdorlarSoni} kishi)
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)]">
            <span className="truncate text-rose-500 font-bold">Chiqimlar nazorati</span>
            <span className="text-rose-500 font-extrabold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Tahlil <ChevronRight size={12} className={cn("transition-transform", activeCard === 'opex' && "rotate-90")} />
            </span>
          </div>
        </div>

      </div>

          {/* Details drawer */}
          {activeCard && (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 relative">
              <button 
                onClick={() => setActiveCard(null)} 
                className="absolute top-3.5 right-3.5 text-xs font-black text-[var(--text3)] hover:text-rose-500 bg-[var(--bg)] px-2.5 py-1 rounded-xl border border-[var(--border)] transition-colors cursor-pointer flex items-center gap-1"
              >
                <X size={13} /> Yopish
              </button>

              {/* 1. SAVDO DETAILS */}
              {activeCard === 'sales' && (
                <div className="space-y-3 pr-16">
                  <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp size={15} className="text-blue-500" />
                    Savdo Ko'rsatkichlari ({periodLabel})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Sotilgan Juftlar</span>
                      <span className="text-base sm:text-lg font-black text-[var(--text)]">{summary.totalSalesPairs.toLocaleString()} juft</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Umumiy Savdo Tushumi</span>
                      <span className="text-base sm:text-lg font-black text-blue-500">{formatUzs(summary.totalSalesRevenue)} so'm</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">O'rtacha Juft Narxi</span>
                      <span className="text-base sm:text-lg font-black text-[var(--text)]">{formatUzs(summary.avgPricePerPair)} so'm/j</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Sotuv Hujjatlari</span>
                      <span className="text-base sm:text-lg font-black text-[var(--text)]">{summary.transactionsCount} ta chek</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SOF FOYDA DETAILS */}
              {activeCard === 'profit' && (
                <div className="space-y-3 pr-16">
                  <h4 className="text-xs font-black text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                    <DollarSign size={15} className="text-emerald-500" />
                    P&L Sof Foyda Tuzilishi ({periodLabel})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-emerald-500/20">
                      <span className="text-[10px] font-bold uppercase text-emerald-600 block mb-0.5">1. Savdo Yalpi Foydasi</span>
                      <span className="text-base sm:text-lg font-black text-emerald-500">+{formatUzs(summary.grossProfit)} so'm</span>
                      <span className="text-[10px] text-[var(--text3)] block mt-0.5">Tannarx va sotuv narxi farqi</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-rose-500/20">
                      <span className="text-[10px] font-bold uppercase text-rose-500 block mb-0.5">2. Kassa Xarajatlari (OpEx)</span>
                      <span className="text-base sm:text-lg font-black text-rose-500">-{formatUzs(summary.totalExpenses)} so'm</span>
                      <span className="text-[10px] text-[var(--text3)] block mt-0.5">Ijara, ish haqi, transport va b.</span>
                    </div>
                    <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/30">
                      <span className="text-[10px] font-black uppercase text-emerald-600 block mb-0.5">3. Haqiqiy Sof Foyda</span>
                      <span className="text-lg sm:text-xl font-black text-emerald-500">{formatUzs(summary.netProfit)} so'm</span>
                      <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">Sof Rentabellik: {summary.profitMargin}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. KASSA VA HAMYONLAR */}
              {activeCard === 'cash' && (
                <div className="space-y-3 pr-16">
                  <h4 className="text-xs font-black text-indigo-500 uppercase tracking-wider flex items-center gap-2">
                    <Wallet size={15} className="text-indigo-500" />
                    Moliya Hamyonlari va Kassa Qoldig'i
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-emerald-500 flex items-center gap-1 mb-0.5">
                        <Coins size={12} /> Naqd Pul (Kassa)
                      </span>
                      <span className="text-base font-black text-[var(--text)]">{formatUzs(summary.naqd)} so'm</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-blue-500 flex items-center gap-1 mb-0.5">
                        <CreditCard size={12} /> Plastik Karta
                      </span>
                      <span className="text-base font-black text-[var(--text)]">{formatUzs(summary.karta)} so'm</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-purple-500 flex items-center gap-1 mb-0.5">
                        <Landmark size={12} /> Bank Hisob Raqami
                      </span>
                      <span className="text-base font-black text-[var(--text)]">{formatUzs(summary.bank)} so'm</span>
                    </div>
                    <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                      <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-0.5">
                        <Wallet size={12} /> Jami Likvid Pul
                      </span>
                      <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{formatUzs(summary.kassaQoldiq)} so'm</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. OMBOR QOLDIG'I DETAILS */}
              {activeCard === 'stock' && (
                <div className="space-y-3 pr-16">
                  <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider flex items-center gap-2">
                    <Package size={15} className="text-amber-500" />
                    Ombor Qoldiqlari Tafsiloti
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Tepa Ombor</span>
                      <span className="text-base font-black text-[var(--text)]">{summary.tepaJuft.toLocaleString()} juft</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Kotta Ombor</span>
                      <span className="text-base font-black text-[var(--text)]">{summary.kottaJuft.toLocaleString()} juft</span>
                    </div>
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--text3)] block mb-0.5">Jami Model Xilligi</span>
                      <span className="text-base font-black text-[var(--text)]">{summary.uniqueModelsCount} xil</span>
                    </div>
                    <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                      <span className="text-[10px] font-bold uppercase text-amber-500 block mb-0.5">Zaxira Tan Narxi</span>
                      <span className="text-base font-black text-amber-500">~{formatUzs(summary.jamiTovarQiymati)} so'm</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. XARAJATLAR & NASIYA DETAILS */}
              {activeCard === 'opex' && (
                <div className="space-y-3 pr-16">
                  <h4 className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-2">
                    <Receipt size={15} className="text-rose-500" />
                    Xarajatlar & Nasiya Tafsiloti ({periodLabel})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)]">
                      <span className="text-[11px] font-bold text-rose-500 block mb-2">Kassa Xarajatlari (OpEx)</span>
                      {Object.keys(summary.expenseCategories).length > 0 ? (
                        <div className="space-y-1.5">
                          {Object.entries(summary.expenseCategories).map(([cat, val]) => (
                            <div key={cat} className="flex justify-between text-xs">
                              <span className="text-[var(--text3)]">{cat}:</span>
                              <span className="font-bold text-[var(--text)]">{formatUzs(val)} so'm</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text3)]">Ushbu davrda xarajatlar yo'q.</p>
                      )}
                    </div>

                    <div className="bg-rose-500/5 p-3 rounded-xl border border-rose-500/20 flex flex-col justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-rose-500 block mb-1">Mijozlar Nasiya Portfeli</span>
                        <div className="text-xl font-black text-rose-500">{formatUzs(summary.umumiyQarz)} so'm</div>
                        <p className="text-xs text-[var(--text3)] mt-1">Jami {summary.qarzdorlarSoni} nafar mijozda qarz mavjud.</p>
                      </div>
                      {summary.engKattaQarzdor && (
                        <div className="pt-2 mt-2 border-t border-rose-500/20 text-xs text-[var(--text3)]">
                          Eng katta qarzdor: <strong className="text-[var(--text)]">{summary.engKattaQarzdor}</strong> ({formatUzs(summary.engKattaQarz)} so'm)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
