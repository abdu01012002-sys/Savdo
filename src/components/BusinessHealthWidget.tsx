import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { 
  Activity, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Package, 
  Clock, 
  Wallet, 
  ChevronDown, 
  ChevronUp, 
  Flame, 
  Layers, 
  ArrowUpRight,
  Info
} from 'lucide-react';
import { formatCompact, formatUzs, getTodayStr, isCorrectionTx, cn } from '../lib/utils';

interface BusinessHealthWidgetProps {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

interface FactorScore {
  name: string;
  score: number; // 0 - 100
  weight: number; // percentage of overall score
  status: 'excellent' | 'good' | 'warning' | 'critical';
  label: string;
  detail: string;
  icon: any;
  color: string;
}

export function BusinessHealthWidget({ dateFilter = 'all', startDate, endDate }: BusinessHealthWidgetProps) {
  const { db, currentUser } = useDb();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const healthData = useMemo(() => {
    const todayStr = getTodayStr();
    const today = new Date();

    // 1. O'TKAN DAVR VA HOZIRGI DAVR SAVDOLARI (Sales Growth Momentum)
    const allTxs = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(
      t => t.amal === 'chiqim' && !isCorrectionTx(t)
    );

    // Filter current sales
    let currentSalesPairs = 0;
    let currentSalesSumma = 0;

    // Last 7 days vs previous 7 days for stable momentum calculation
    const d7Ago = new Date(); d7Ago.setDate(d7Ago.getDate() - 7);
    const d14Ago = new Date(); d14Ago.setDate(d14Ago.getDate() - 14);
    const d7Str = d7Ago.toISOString().slice(0, 10);
    const d14Str = d14Ago.toISOString().slice(0, 10);

    let last7DaysSalesPairs = 0;
    let prev7DaysSalesPairs = 0;

    // Also track top selling model in current context
    const modelSalesCount: Record<string, number> = {};

    allTxs.forEach(t => {
      // 7-day momentum
      if (t.sana >= d7Str && t.sana <= todayStr) {
        last7DaysSalesPairs += (t.soni || 0);
      } else if (t.sana >= d14Str && t.sana < d7Str) {
        prev7DaysSalesPairs += (t.soni || 0);
      }

      // Date filter for current view
      let isMatch = true;
      if (dateFilter === 'today') isMatch = t.sana === todayStr;
      else if (dateFilter === 'yesterday') {
        const y = new Date(); y.setDate(y.getDate() - 1);
        isMatch = t.sana === y.toISOString().slice(0, 10);
      } else if (dateFilter === 'this_week') {
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + 1;
        const firstDay = new Date(curr.setDate(first));
        isMatch = t.sana >= firstDay.toISOString().slice(0, 10);
      } else if (dateFilter === 'this_month') {
        const tDate = new Date(t.sana);
        isMatch = !isNaN(tDate.getTime()) && tDate.getFullYear() === today.getFullYear() && tDate.getMonth() === today.getMonth();
      } else if (dateFilter === 'custom') {
        if (startDate && t.sana < startDate) isMatch = false;
        if (endDate && t.sana > endDate) isMatch = false;
      }

      if (isMatch) {
        currentSalesPairs += (t.soni || 0);
        currentSalesSumma += (t.summa || 0);
        if (t.model) {
          modelSalesCount[t.model] = (modelSalesCount[t.model] || 0) + (t.soni || 0);
        }
      }
    });

    let topSellingModel = '';
    let topSellingCount = 0;
    Object.entries(modelSalesCount).forEach(([model, count]) => {
      if (count > topSellingCount) {
        topSellingCount = count;
        topSellingModel = model;
      }
    });

    const salesGrowthPct = prev7DaysSalesPairs > 0 
      ? Math.round(((last7DaysSalesPairs - prev7DaysSalesPairs) / prev7DaysSalesPairs) * 100) 
      : (last7DaysSalesPairs > 0 ? 100 : 0);

    // 2. OMBOR AYLANMASI VA QOLDIQLAR SIFATI (Inventory Health)
    let totalStockPairs = 0;
    let criticalLowSizesCount = 0;
    let outOfStockModelsCount = 0;
    let deadStockModelsCount = 0;
    const criticalStockAlerts: { model: string; size: string; qoldiq: number }[] = [];

    const checkStockHealth = (stockObj: Record<string, Record<string, number>> = {}) => {
      Object.entries(stockObj).forEach(([model, sizes]) => {
        let modelTotal = 0;
        Object.entries(sizes).forEach(([size, qoldiq]) => {
          modelTotal += qoldiq;
          totalStockPairs += qoldiq;
          if (qoldiq > 0 && qoldiq < 15) {
            criticalLowSizesCount++;
            if (criticalStockAlerts.length < 3) {
              criticalStockAlerts.push({ model, size, qoldiq });
            }
          }
        });

        if (modelTotal === 0) {
          outOfStockModelsCount++;
        } else {
          // Check if dead stock (has stock, but 0 sold in last 14 days)
          const soldRecent = allTxs.some(t => t.model === model && t.sana >= d14Str);
          if (!soldRecent && modelTotal > 50) {
            deadStockModelsCount++;
          }
        }
      });
    };

    checkStockHealth(db.tepa?.stock);
    checkStockHealth(db.kotta?.stock);
    checkStockHealth(db.sort2?.stock);

    // 3. QARZLAR VA NASIYA PORTFELI XAVFI (Debt & Credit Health)
    let totalDebtorsCount = 0;
    let totalDebtSumma = 0;
    let overdueDebtorsCount = 0;
    let overdueDebtSumma = 0;
    const highRiskDebtors: { name: string; debt: number; days: number }[] = [];

    (db.kontragentlar || []).forEach(k => {
      const b = k.balans || 0;
      if (b > 0) {
        totalDebtorsCount++;
        totalDebtSumma += b;

        // Check overdue (if last purchase was > 30 days ago and still owes, or high credit ratio)
        let daysInactive = 0;
        if (k.oxirgiXarid) {
          daysInactive = Math.floor((today.getTime() - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24));
        }

        const isLimitExceeded = Boolean(k.kreditLimiti && b > k.kreditLimiti);

        if (daysInactive > 30 || isLimitExceeded) {
          overdueDebtorsCount++;
          overdueDebtSumma += b;
          if (highRiskDebtors.length < 3) {
            highRiskDebtors.push({ name: k.ism, debt: b, days: daysInactive || 30 });
          }
        }
      }
    });

    // 4. KASSA VA LIKVIDLIK (Cash Liquidity)
    const naqd = db.kassaBalansi?.naqd_uzs || 0;
    const karta = db.kassaBalansi?.karta_uzs || 0;
    const bank = db.kassaBalansi?.bank_uzs || 0;
    const totalCashUzs = naqd + karta + bank;

    // Monthly average expenses to check cash runway
    let monthlyExpensesUzs = 0;
    (db.kassaHarakatlari || []).forEach(h => {
      if (h.tur === 'chiqim' && h.sana >= d14Str) {
        monthlyExpensesUzs += (h.summaUzs || h.summa || 0);
      }
    });
    // Scale 14-day expense to ~30-day runway
    const estimatedMonthlyOpEx = Math.max(monthlyExpensesUzs * 2.1, 1000000);

    // ==========================================
    // MULTI-FACTOR HEALTH SCORE ALGORITHM (0 - 100)
    // ==========================================
    
    // Factor A: Nasiya / Qarz xavfi (Og'irligi: 30%)
    // Agar muddati o'tgan qarz umumiy qarzning 25% dan ko'p bo'lsa ball tushadi
    let debtScore = 100;
    const overdueRatio = totalDebtSumma > 0 ? overdueDebtSumma / totalDebtSumma : 0;
    if (overdueRatio > 0.4) debtScore = 40;
    else if (overdueRatio > 0.25) debtScore = 60;
    else if (overdueRatio > 0.1) debtScore = 80;
    else debtScore = 95;

    // Factor B: Kassa Likvidligi & Zaxira (Og'irligi: 25%)
    let cashScore = 90;
    if (totalCashUzs <= 0) cashScore = 30;
    else if (totalCashUzs < estimatedMonthlyOpEx * 0.2) cashScore = 55;
    else if (totalCashUzs < estimatedMonthlyOpEx * 0.5) cashScore = 75;
    else cashScore = 98;

    // Factor C: Zaxira & O'lchamlar balansi (Og'irligi: 25%)
    let stockScore = 90;
    if (criticalLowSizesCount > 15 || deadStockModelsCount > 8) stockScore = 55;
    else if (criticalLowSizesCount > 5 || deadStockModelsCount > 3) stockScore = 75;
    else stockScore = 95;

    // Factor D: Savdo o'sishi va dinamika (Og'irligi: 20%)
    let salesScore = 85;
    if (salesGrowthPct >= 10) salesScore = 98;
    else if (salesGrowthPct >= 0) salesScore = 88;
    else if (salesGrowthPct >= -15) salesScore = 70;
    else salesScore = 50;

    // Overall Weighted Health Score
    const totalScore = Math.round(
      (debtScore * 0.30) + 
      (cashScore * 0.25) + 
      (stockScore * 0.25) + 
      (salesScore * 0.20)
    );

    // Status label & color scheme
    let statusTheme: { label: string; textClass: string; bgClass: string; borderClass: string; ringColor: string } = {
      label: "A'lo darajada",
      textClass: 'text-emerald-500',
      bgClass: 'bg-emerald-500/10',
      borderClass: 'border-emerald-500/20',
      ringColor: '#10b981'
    };

    if (totalScore < 60) {
      statusTheme = {
        label: "Yuqori xavf mavjud",
        textClass: 'text-rose-500',
        bgClass: 'bg-rose-500/10',
        borderClass: 'border-rose-500/20',
        ringColor: '#f43f5e'
      };
    } else if (totalScore < 78) {
      statusTheme = {
        label: "Diqqat talab qilinadi",
        textClass: 'text-amber-500',
        bgClass: 'bg-amber-500/10',
        borderClass: 'border-amber-500/20',
        ringColor: '#f59e0b'
      };
    } else if (totalScore < 90) {
      statusTheme = {
        label: "Barqaror holat",
        textClass: 'text-blue-500',
        bgClass: 'bg-blue-500/10',
        borderClass: 'border-blue-500/20',
        ringColor: '#3b82f6'
      };
    }

    // 5. GENERATE NATURAL LANGUAGE EXECUTIVE BRIEFING (1-2 Jumlalik Rahbar Xulosasi)
    const briefingPoints: string[] = [];

    // Sales part
    if (salesGrowthPct >= 0) {
      briefingPoints.push(`So'nggi haftada savdo dinamikasi ${salesGrowthPct > 0 ? `+${salesGrowthPct}% ga oshdi` : "barqaror kechmoqda"}`);
    } else {
      briefingPoints.push(`Savdo hajmi o'tgan haftaga nisbatan ${Math.abs(salesGrowthPct)}% ga sustlashgan`);
    }

    // Debt warning or positive note
    if (overdueDebtorsCount > 0) {
      briefingPoints.push(`${overdueDebtorsCount} nafar mijozning ${formatCompact(overdueDebtSumma)} so'm muddati o'tgan qarzdorligi bor`);
    } else if (totalDebtorsCount > 0) {
      briefingPoints.push(`Nasiya to'lovlari o'z vaqtida yig'ilmoqda`);
    }

    // Stock warning
    if (criticalStockAlerts.length > 0) {
      const firstAlert = criticalStockAlerts[0];
      briefingPoints.push(`${firstAlert.model} (${firstAlert.size}-o'lchamda ${firstAlert.qoldiq} juft) tugamoqda`);
    } else if (topSellingModel) {
      briefingPoints.push(`Hozirgi yetakchi xit model: "${topSellingModel}"`);
    }

    const executiveBriefing = briefingPoints.join(". ") + ".";

    const factors: FactorScore[] = [
      {
        name: "Nasiyalar Sifati",
        score: debtScore,
        weight: 30,
        status: debtScore >= 85 ? 'excellent' : debtScore >= 70 ? 'good' : 'warning',
        label: overdueDebtorsCount === 0 ? "Muddati o'tgan qarz yo'q" : `${overdueDebtorsCount} ta kechikkan qarz`,
        detail: `Jami nasiya: ${formatCompact(totalDebtSumma)} so'm (${totalDebtorsCount} nafar)`,
        icon: Wallet,
        color: debtScore >= 80 ? 'text-emerald-500' : 'text-amber-500'
      },
      {
        name: "Kassa Likvidligi",
        score: cashScore,
        weight: 25,
        status: cashScore >= 85 ? 'excellent' : cashScore >= 65 ? 'good' : 'critical',
        label: totalCashUzs > estimatedMonthlyOpEx ? "Xarajatlarga to'liq yetadi" : "Xarajatlar nazorati lozim",
        detail: `Kassada jami: ${formatCompact(totalCashUzs)} so'm qoldiq`,
        icon: Activity,
        color: cashScore >= 80 ? 'text-blue-500' : 'text-rose-500'
      },
      {
        name: "Ombor Zaxiralari",
        score: stockScore,
        weight: 25,
        status: stockScore >= 85 ? 'excellent' : stockScore >= 70 ? 'good' : 'warning',
        label: criticalLowSizesCount === 0 ? "Zaxiralar optimal" : `${criticalLowSizesCount} ta o'lcham kam qolgan`,
        detail: `Omborda: ${totalStockPairs.toLocaleString()} juft mavjud`,
        icon: Package,
        color: stockScore >= 80 ? 'text-purple-500' : 'text-amber-500'
      },
      {
        name: "Savdo Impulsi",
        score: salesScore,
        weight: 20,
        status: salesScore >= 85 ? 'excellent' : salesScore >= 70 ? 'good' : 'warning',
        label: salesGrowthPct >= 0 ? `+${salesGrowthPct}% haftalik o'sish` : `${salesGrowthPct}% pasayish`,
        detail: `${last7DaysSalesPairs.toLocaleString()} juft sotildi (oxirgi 7 kunda)`,
        icon: TrendingUp,
        color: salesScore >= 80 ? 'text-emerald-500' : 'text-zinc-400'
      }
    ];

    return {
      totalScore,
      statusTheme,
      executiveBriefing,
      factors,
      overdueDebtorsCount,
      overdueDebtSumma,
      criticalStockAlerts,
      salesGrowthPct,
      topSellingModel,
      totalCashUzs,
      totalStockPairs
    };
  }, [db, dateFilter, startDate, endDate]);

  return (
    <div className="w-full bg-gradient-to-r from-[var(--bg2)] via-[var(--bg2)] to-[var(--bg)] border border-[var(--border)] rounded-3xl p-4 sm:p-5 shadow-xs transition-all hover:border-blue-500/30">
      
      {/* 1. TOP EXECUTIVE BAR: HEALTH SCORE + ONE-LINE AI BRIEFING */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Left: Score Badge + Live Pulse + Title */}
        <div className="flex items-center gap-3.5">
          {/* Circular Score Ring */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="23"
                stroke="currentColor"
                strokeWidth="4"
                className="text-[var(--border)] opacity-30"
                fill="transparent"
              />
              <circle
                cx="28"
                cy="28"
                r="23"
                stroke={healthData.statusTheme.ringColor}
                strokeWidth="4"
                strokeDasharray={144.5}
                strokeDashoffset={144.5 - (144.5 * healthData.totalScore) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
                fill="transparent"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-black text-[var(--text)] tracking-tight">
                {healthData.totalScore}%
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)]">
                Biznes Salomatligi
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1",
                healthData.statusTheme.bgClass,
                healthData.statusTheme.textClass,
                healthData.statusTheme.borderClass
              )}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {healthData.statusTheme.label}
              </span>
            </div>

            {/* Smart 1-line Briefing */}
            <p className="text-[12px] sm:text-[13px] font-medium text-[var(--text)] mt-1 line-clamp-2 max-w-2xl leading-snug">
              <span className="font-bold text-blue-500 dark:text-blue-400">AI Xulosa: </span>
              {healthData.executiveBriefing}
            </p>
          </div>
        </div>

        {/* Right: Quick Action toggle & Metrics badges */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-[var(--border)]">
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[11px] font-bold text-[var(--text2)] flex items-center gap-1.5">
              <TrendingUp size={13} className={healthData.salesGrowthPct >= 0 ? "text-emerald-500" : "text-rose-500"} />
              {healthData.salesGrowthPct >= 0 ? `+${healthData.salesGrowthPct}%` : `${healthData.salesGrowthPct}%`}
            </span>

            {healthData.overdueDebtorsCount > 0 ? (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {healthData.overdueDebtorsCount} qarz kechikkan
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={13} />
                Qarzlar nazoratda
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg2)] text-[var(--text)] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
            title={isExpanded ? "Yashirish" : "Batafsil faktorlarni ko'rish"}
          >
            <span className="text-[11px] font-semibold text-[var(--text2)]">
              {isExpanded ? "Yashirish" : "Diagnostika"}
            </span>
            {isExpanded ? (
              <ChevronUp size={14} className="text-[var(--text3)]" />
            ) : (
              <ChevronDown size={14} className="text-blue-500" />
            )}
          </button>
        </div>
      </div>

      {/* 2. EXPANDABLE DEEP-DIVE DIAGNOSTICS (4 FACTORS BREAKDOWN) */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              Salomatlik Ko'rsatkichi Faktorlari (Vaznli Tahlil)
            </span>
            <span className="text-[10px] text-[var(--text3)] font-semibold">
              Avtomatlashtirilgan moliyaviy va operatsion tahlil
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {healthData.factors.map((f, idx) => {
              const IconComp = f.icon;
              return (
                <div 
                  key={idx} 
                  className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-2.5 hover:border-blue-500/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-7 h-7 rounded-lg bg-[var(--bg2)] flex items-center justify-center font-bold", f.color)}>
                          <IconComp size={15} />
                        </div>
                        <span className="text-xs font-bold text-[var(--text)]">{f.name}</span>
                      </div>
                      <span className="text-xs font-black text-[var(--text)]">{f.score}%</span>
                    </div>

                    <div className="text-[11px] font-bold text-[var(--text)] mt-1 truncate" title={f.label}>
                      {f.label}
                    </div>
                    <div className="text-[10px] text-[var(--text3)] font-semibold truncate" title={f.detail}>
                      {f.detail}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-[var(--bg2)] rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        f.score >= 80 ? "bg-emerald-500" : f.score >= 65 ? "bg-blue-500" : "bg-amber-500"
                      )}
                      style={{ width: `${f.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Critical Warnings Footer in case of actionable alerts */}
          {(healthData.criticalStockAlerts.length > 0 || healthData.overdueDebtorsCount > 0) && (
            <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-[11px]">
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-500 shrink-0" />
                <span className="text-[var(--text)] font-medium">
                  <strong>Tavsiya etiladigan choralar: </strong>
                  {healthData.criticalStockAlerts.length > 0 && `Omborga yangi partiya buyurtma qilish (${healthData.criticalStockAlerts.map(a => `${a.model} [${a.size}]`).join(', ')}). `}
                  {healthData.overdueDebtorsCount > 0 && `Muddati o'tgan nasiyadorlar bilan bog'lanish (${formatCompact(healthData.overdueDebtSumma)} so'm).`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
