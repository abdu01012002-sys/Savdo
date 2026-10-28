import React, { useState, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { formatUzs, formatCompact, cn, getTodayStr, isCorrectionTx } from '../lib/utils';
import { 
  TrendingUp, TrendingDown, Scale, DollarSign, Package, 
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2, 
  Users, ChevronDown, ChevronUp, Download, Search, Info,
  BarChart3, RefreshCw, Layers, ShieldAlert, Sparkles, Filter, Calendar
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
  Legend, CartesianGrid, ReferenceLine, Line, ComposedChart 
} from 'recharts';
import { exportToExcel } from '../lib/exportUtils';
import { toast } from 'sonner';

interface Props {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  onSelectClient?: (clientName: string) => void;
}

export function DebtCollectionHealthWidget({ dateFilter, startDate: initialStartDate, endDate: initialEndDate, onSelectClient }: Props) {
  const { db } = useDb();
  
  // Internal period filter (defaults to 1 month / 30 days)
  const [periodMode, setPeriodMode] = useState<'30days' | 'this_month' | '90days' | 'custom'>('30days');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(getTodayStr());
  const [clientSearch, setClientSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'clients'>('overview');
  const [isExpanded, setIsExpanded] = useState(true);

  // Compute effective date range based on period mode
  const { effStart, effEnd, periodTitle } = useMemo(() => {
    const today = getTodayStr();
    if (periodMode === 'this_month') {
      const d = new Date();
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      return { effStart: firstDay, effEnd: today, periodTitle: 'Joriy oy (1-kundan bugungacha)' };
    }
    if (periodMode === '90days') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return { effStart: d.toISOString().slice(0, 10), effEnd: today, periodTitle: 'Oxirgi 3 oy (90 kun)' };
    }
    if (periodMode === 'custom') {
      return { 
        effStart: customStart, 
        effEnd: customEnd, 
        periodTitle: `Tanlangan davr (${customStart || 'Boshidan'} — ${customEnd || 'Bugungacha'})` 
      };
    }
    // Default: 30days
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { effStart: d.toISOString().slice(0, 10), effEnd: today, periodTitle: 'Oxirgi 30 kun (1 oy)' };
  }, [periodMode, customStart, customEnd]);

  // Aggregate Transactions & Payments
  const analyticsData = useMemo(() => {
    // 1. Gather all transactions across warehouses
    const allTxs = [
      ...(db.tepa?.transactions || []).map(t => ({ ...t, ombor: 'tepa' })),
      ...(db.kotta?.transactions || []).map(t => ({ ...t, ombor: 'kotta' })),
      ...(db.sort2?.transactions || []).map(t => ({ ...t, ombor: 'sort2' })),
    ].filter(t => !isCorrectionTx(t));

    // Daily buckets for timeline chart
    const dailyMap: Record<string, { date: string; displayDate: string; yukSumma: number; tolovSumma: number; vozvratSumma: number; netDelta: number }> = {};

    // Helper for date formatting
    const initDaily = (sana: string) => {
      if (!dailyMap[sana]) {
        const parts = sana.split('-');
        const shortDate = parts.length === 3 ? `${parts[2]}.${parts[1]}` : sana;
        dailyMap[sana] = { date: sana, displayDate: shortDate, yukSumma: 0, tolovSumma: 0, vozvratSumma: 0, netDelta: 0 };
      }
    };

    // Client Breakdown Maps
    const clientStatsMap: Record<string, {
      name: string;
      yukSumma: number;
      yukJuft: number;
      tolovSumma: number;
      vozvratSumma: number;
      currentDebt: number;
      operationsCount: number;
      lastDate: string;
    }> = {};

    const getOrCreateClient = (name: string) => {
      const clean = (name || "Noma'lum mijoz").trim();
      if (!clientStatsMap[clean]) {
        // Find existing kontragent balance if available
        const kg = (db.kontragentlar || []).find(k => k.ism.trim().toLowerCase() === clean.toLowerCase());
        clientStatsMap[clean] = {
          name: clean,
          yukSumma: 0,
          yukJuft: 0,
          tolovSumma: 0,
          vozvratSumma: 0,
          currentDebt: kg?.balans || 0,
          operationsCount: 0,
          lastDate: ''
        };
      }
      return clientStatsMap[clean];
    };

    let totalYukSumma = 0;
    let totalYukJuft = 0;
    let totalTolovSumma = 0;
    let totalVozvratSumma = 0;
    let totalChiqimOps = 0;
    let totalTolovOps = 0;

    // A. Process Warehouse Transactions (Chiqim & Tolov)
    allTxs.forEach(t => {
      const sana = t.sana || (t.vaqt ? t.vaqt.slice(0, 10) : '');
      if (!sana) return;
      if (effStart && sana < effStart) return;
      if (effEnd && sana > effEnd) return;

      initDaily(sana);
      const clientName = t.kimdan || t.izoh || t.kimga || "Noma'lum mijoz";
      const client = getOrCreateClient(clientName);

      if (t.sana && (!client.lastDate || t.sana > client.lastDate)) {
        client.lastDate = t.sana;
      }

      if (t.amal === 'chiqim') {
        const qty = Number(t.soni || 0);
        let sum = Number(t.summa || 0);
        if (sum === 0 && t.model && db.prices?.[t.model]?.sale) {
          sum = Number(db.prices[t.model].sale) * qty;
        }

        totalYukSumma += sum;
        totalYukJuft += qty;
        totalChiqimOps++;

        dailyMap[sana].yukSumma += sum;
        client.yukSumma += sum;
        client.yukJuft += qty;
        client.operationsCount++;
      } else if (t.amal === 'tolov') {
        const sum = Number(t.summa || 0);
        totalTolovSumma += sum;
        totalTolovOps++;

        dailyMap[sana].tolovSumma += sum;
        client.tolovSumma += sum;
        client.operationsCount++;
      }
    });

    // B. Process Kassa Harakatlari (To ensure direct kassa client payments are not missed)
    const processedKassaPaymentIds = new Set<string>();
    (db.kassaHarakatlari || []).forEach(k => {
      if (k.tur !== 'kirim') return;
      if (k.kategoriya !== 'qarz_tolovi' && k.kategoriya !== 'savdo_tushumi') return;

      const sana = k.sana || (k.vaqt ? k.vaqt.slice(0, 10) : '');
      if (!sana) return;
      if (effStart && sana < effStart) return;
      if (effEnd && sana > effEnd) return;

      // If already linked to a transaction, avoid double counting
      if (k.boglanishId) return;

      const clientName = k.kimgaKimdan || k.izoh || "Noma'lum mijoz";
      const sum = Number(k.summaUzs || k.summa || 0);
      if (sum <= 0) return;

      // Only count if this payment wasn't already logged under transactions
      // To avoid duplicate tallying, we associate standalone kassa payments
      initDaily(sana);
      const client = getOrCreateClient(clientName);
      
      // Standalone kassa income check
      if (k.kategoriya === 'qarz_tolovi' || k.kategoriya === 'savdo_tushumi') {
        totalTolovSumma += sum;
        totalTolovOps++;
        dailyMap[sana].tolovSumma += sum;
        client.tolovSumma += sum;
        client.operationsCount++;
      }
    });

    // C. Process Vozvratlar (Qarzdan chegirilgan tovarlar)
    (db.vozvratlar || []).forEach(v => {
      const sana = v.sana || (v.vaqt ? v.vaqt.slice(0, 10) : '');
      if (!sana) return;
      if (effStart && sana < effStart) return;
      if (effEnd && sana > effEnd) return;
      if (v.tolovQaytarishTuri !== 'qarzdan_ayirish') return;

      const sum = Number(v.summa || 0);
      if (sum <= 0) return;

      initDaily(sana);
      const client = getOrCreateClient(v.mijoz || "Noma'lum mijoz");

      totalVozvratSumma += sum;
      dailyMap[sana].vozvratSumma += sum;
      client.vozvratSumma += sum;
    });

    // Calculate Daily Net Delta
    Object.values(dailyMap).forEach(day => {
      day.netDelta = day.yukSumma - (day.tolovSumma + day.vozvratSumma);
    });

    // Sort Daily Chart Data
    const chartData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Summary Calculations
    const totalCollectedOrCredited = totalTolovSumma + totalVozvratSumma;
    const netDebtDelta = totalYukSumma - totalCollectedOrCredited; // Positive = Debt increased, Negative = Debt reduced
    
    // Collection Rate (Qoplash Foizi)
    let collectionRatio = 0;
    if (totalYukSumma > 0) {
      collectionRatio = (totalCollectedOrCredited / totalYukSumma) * 100;
    } else if (totalCollectedOrCredited > 0) {
      collectionRatio = 100;
    }

    // Health Status evaluation
    let healthStatus: 'excellent' | 'good' | 'warning' | 'critical' = 'good';
    if (collectionRatio >= 100) {
      healthStatus = 'excellent';
    } else if (collectionRatio >= 85) {
      healthStatus = 'good';
    } else if (collectionRatio >= 65) {
      healthStatus = 'warning';
    } else {
      healthStatus = 'critical';
    }

    // Client lists: Debt Increased vs Debt Reduced
    const clientList = Object.values(clientStatsMap).map(c => {
      const netDelta = c.yukSumma - (c.tolovSumma + c.vozvratSumma);
      const clientCollRate = c.yukSumma > 0 ? ((c.tolovSumma + c.vozvratSumma) / c.yukSumma) * 100 : (c.tolovSumma > 0 ? 100 : 0);
      return {
        ...c,
        netDelta,
        clientCollRate
      };
    });

    // Top Debt Expanding clients (Yuk ko'p olib, pul to'lamagan)
    const debtGrowingClients = clientList
      .filter(c => c.netDelta > 0)
      .sort((a, b) => b.netDelta - a.netDelta);

    // Top Debt Reducing / disciplined clients (Pulini faol to'lagan)
    const debtReducingClients = clientList
      .filter(c => c.netDelta < 0 || (c.yukSumma === 0 && c.tolovSumma > 0))
      .sort((a, b) => a.netDelta - b.netDelta);

    // Total Overall Debt in the enterprise right now
    const totalEnterpriseDebt = (db.kontragentlar || []).reduce((acc, k) => acc + ((k.balans && k.balans > 0) ? k.balans : 0), 0);

    return {
      totalYukSumma,
      totalYukJuft,
      totalTolovSumma,
      totalVozvratSumma,
      totalCollectedOrCredited,
      netDebtDelta,
      collectionRatio,
      healthStatus,
      totalChiqimOps,
      totalTolovOps,
      chartData,
      clientList,
      debtGrowingClients,
      debtReducingClients,
      totalEnterpriseDebt
    };
  }, [db, effStart, effEnd]);

  // Export to Excel
  const handleExportData = () => {
    const summaryRows = [
      ['KORXONA QARZDORLIK VA PUL AYLANMASI TAHLILI'],
      ['Hisobot Davri:', periodTitle],
      ['Chiqarilgan Tovar Summasi:', analyticsData.totalYukSumma, 'UZS'],
      ['Chiqarilgan Tovar Miqdori:', analyticsData.totalYukJuft, 'Juft'],
      ['Mijozlardan Undirilgan Pul:', analyticsData.totalTolovSumma, 'UZS'],
      ['Vozvrat Qarzdan Ayirish:', analyticsData.totalVozvratSumma, 'UZS'],
      ['Jami Yopilgan Qarz:', analyticsData.totalCollectedOrCredited, 'UZS'],
      ['Sof Qarz O\'zgarishi (Delta):', analyticsData.netDebtDelta, analyticsData.netDebtDelta > 0 ? "QARZLAR KO'PAYDI" : "QARZLAR KAMAYDI"],
      ['Qoplash Foizi (Collection Rate):', `${analyticsData.collectionRatio.toFixed(1)}%`],
      ['Joriy Umumiy Mijozlar Qarzi:', analyticsData.totalEnterpriseDebt, 'UZS'],
      []
    ];

    const clientHeaders = [
      '№', 'Mijoz Nomi', 'Chiqarilgan Yuk (UZS)', 'Chiqarilgan (Juft)', 
      'To\'langan Pul (UZS)', 'Vozvrat (UZS)', 'Davriy Qarz O\'zgarishi (UZS)', 
      'Qoplash Foizi (%)', 'Hozirgi Jami Qarzi (UZS)', 'Oxirgi Amal Sanasi'
    ];

    const clientRows = analyticsData.clientList.map((c, idx) => [
      idx + 1,
      c.name,
      c.yukSumma,
      c.yukJuft,
      c.tolovSumma,
      c.vozvratSumma,
      c.netDelta,
      `${c.clientCollRate.toFixed(1)}%`,
      c.currentDebt,
      c.lastDate || '—'
    ]);

    exportToExcel([...summaryRows, clientHeaders, ...clientRows], `Qarzdorlik_Balansi_${effStart}_${effEnd}`, 'Qarz Balansi');
    toast.success("Hisobot Excel formatida yuklab olindi!");
  };

  // Filter client table
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return analyticsData.clientList;
    const q = clientSearch.toLowerCase().trim();
    return analyticsData.clientList.filter(c => c.name.toLowerCase().includes(q));
  }, [analyticsData.clientList, clientSearch]);

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col gap-5 transition-all">
      {/* 1. Header & Period Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 shadow-xs transition-colors",
            analyticsData.netDebtDelta <= 0 
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
          )}>
            {analyticsData.netDebtDelta <= 0 ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                Qarzdorlik & Pul Yig'ish Dinamikasi
              </h3>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-black border flex items-center gap-1",
                analyticsData.healthStatus === 'excellent' && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                analyticsData.healthStatus === 'good' && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                analyticsData.healthStatus === 'warning' && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                analyticsData.healthStatus === 'critical' && "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
              )}>
                {analyticsData.netDebtDelta <= 0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {analyticsData.netDebtDelta <= 0 ? "Qarzlar Qisqarmoqda ✅" : "Qarzdorlik O'smoqda ⚠️"}
              </span>
            </div>
            <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
              Chiqarilgan yuk summasi va mijozlardan kassaga kirgan pullar taqqoslovi ({periodTitle})
            </p>
          </div>
        </div>

        {/* Action Buttons & Period Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Period Selector */}
          <div className="flex items-center bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-1 gap-1 flex-wrap">
            {[
              { id: '30days', label: '1 Oy (30 kun)' },
              { id: 'this_month', label: 'Bu oy' },
              { id: '90days', label: '3 Oy (90 kun)' },
              { id: 'custom', label: 'Tanlangan sana 📅' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodMode(p.id as any)}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1",
                  periodMode === p.id 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Interactive Date Range Pickers (Visible when 'custom' is active) */}
          {periodMode === 'custom' && (
            <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-blue-500/40 rounded-2xl p-1 px-2.5 text-xs font-bold shadow-xs animate-in fade-in duration-200">
              <span className="text-[var(--text3)] text-[11px]">Dan:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-[var(--text)] font-semibold text-xs focus:outline-hidden cursor-pointer"
                title="Boshlanish sanasi"
              />
              <span className="text-[var(--text3)] text-[11px] ml-1">Gacha:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-[var(--text)] font-semibold text-xs focus:outline-hidden cursor-pointer"
                title="Tugash sanasi"
              />
            </div>
          )}

          {/* Excel Export Button */}
          <button
            type="button"
            onClick={handleExportData}
            className="p-2 sm:px-3 sm:py-1.5 bg-[var(--bg)] hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-[var(--border)] hover:border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="Qarzdorlik tahlilini Excel faylda yuklab olish"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Expand/Collapse toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(v => !v)}
            className="p-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer"
            title={isExpanded ? "Bo'limni yig'ish" : "Bo'limni yoyish"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
          {/* 2. Primary KPI Cards Grid (4 Essential Metrics) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* CARD 1: Chiqarilgan Tovar (Nasiya / Savdo) */}
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={14} className="text-blue-500" />
                    Chiqarilgan Yuk
                  </span>
                  <span className="text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md">
                    {analyticsData.totalYukJuft.toLocaleString()} juft
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                  {formatUzs(analyticsData.totalYukSumma)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text3)] font-semibold flex items-center justify-between">
                <span>Savdo operatsiyalari:</span>
                <strong className="text-[var(--text)]">{analyticsData.totalChiqimOps} ta</strong>
              </div>
            </div>

            {/* CARD 2: Undirilgan Pul (Kassaga Kirim) */}
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-500" />
                    Undirilgan Pul
                  </span>
                  <span className="text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                    {analyticsData.totalTolovOps} ta to'lov
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {formatUzs(analyticsData.totalTolovSumma)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text3)] font-semibold flex items-center justify-between">
                <span>Vozvrat hisobiga yopilgan:</span>
                <strong className="text-slate-600 dark:text-slate-400">{formatCompact(analyticsData.totalVozvratSumma)} UZS</strong>
              </div>
            </div>

            {/* CARD 3: Sof Qarz O'zgarishi (Delta) */}
            <div className={cn(
              "border rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden",
              analyticsData.netDebtDelta <= 0 
                ? "bg-emerald-500/5 border-emerald-500/30" 
                : "bg-rose-500/5 border-rose-500/30"
            )}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                    <Scale size={14} className={analyticsData.netDebtDelta <= 0 ? "text-emerald-500" : "text-rose-500"} />
                    Qarz Dinamikasi
                  </span>
                  <span className={cn(
                    "text-[10px] font-extrabold px-2 py-0.5 rounded-md",
                    analyticsData.netDebtDelta <= 0 
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" 
                      : "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                  )}>
                    {analyticsData.netDebtDelta <= 0 ? "Kamaydi" : "Ko'paydi"}
                  </span>
                </div>
                <div className={cn(
                  "text-xl sm:text-2xl font-black tracking-tight",
                  analyticsData.netDebtDelta <= 0 
                    ? "text-emerald-600 dark:text-emerald-400" 
                    : "text-rose-600 dark:text-rose-400"
                )}>
                  {analyticsData.netDebtDelta <= 0 ? "-" : "+"}{formatUzs(Math.abs(analyticsData.netDebtDelta))} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[var(--border)] text-[11px] font-semibold flex items-center justify-between">
                <span className="text-[var(--text3)]">Bozordagi jami qarz:</span>
                <strong className="text-[var(--text)]">{formatCompact(analyticsData.totalEnterpriseDebt)} UZS</strong>
              </div>
            </div>

            {/* CARD 4: Qoplash Foizi & Xulosa */}
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-500" />
                    Qoplash Koeffitsienti
                  </span>
                  <span className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-md",
                    analyticsData.collectionRatio >= 100 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                      : analyticsData.collectionRatio >= 80 
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {analyticsData.collectionRatio >= 100 ? "A'lo" : analyticsData.collectionRatio >= 80 ? "Barqaror" : "Xavfli"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[var(--text)] tracking-tight">
                    {analyticsData.collectionRatio.toFixed(1)}%
                  </span>
                  <span className="text-xs font-semibold text-[var(--text3)]">
                    (maqsad: 100%+)
                  </span>
                </div>
              </div>
              
              {/* Progress visualizer */}
              <div className="mt-3 pt-2.5 border-t border-[var(--border)] space-y-1">
                <div className="w-full bg-[var(--bg3)] h-2 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      analyticsData.collectionRatio >= 100 
                        ? "bg-emerald-500" 
                        : analyticsData.collectionRatio >= 80 
                          ? "bg-blue-500" 
                          : "bg-rose-500"
                    )}
                    style={{ width: `${Math.min(analyticsData.collectionRatio, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] font-medium text-[var(--text3)] truncate">
                  {analyticsData.collectionRatio >= 100 
                    ? "Pullar tovar chiqimidan ortig'i bilan yig'ilmoqda."
                    : "Tovar chiqimi tushumdan yuqori bormoqda."}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Sub-tabs Navigation: Overview vs Chart vs Clients */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'overview' 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                )}
              >
                <Layers size={14} />
                <span>Tezkor Xulosa & Top Mijozlar</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chart')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'chart' 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                )}
              >
                <BarChart3 size={14} />
                <span>Keltirilgan Taqqoslama Grafiki</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('clients')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === 'clients' 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                )}
              >
                <Users size={14} />
                <span>Barcha Mijozlar Ro'yxati ({analyticsData.clientList.length})</span>
              </button>
            </div>
          </div>

          {/* TAB CONTENT: 1. OVERVIEW & TOP CLIENTS */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column: Top Debt Expanding Clients (Yuk olib, pul bermagan) */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                        <ArrowUpRight size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                          Qarzi Eng Ko'p Oshgan Mijozlar
                        </h4>
                        <p className="text-[10px] font-semibold text-[var(--text3)]">
                          Ushbu davrda yuk olib, pulini kam to'laganlar
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-lg">
                      {analyticsData.debtGrowingClients.length} ta mijoz
                    </span>
                  </div>

                  {analyticsData.debtGrowingClients.length === 0 ? (
                    <div className="p-6 text-center text-xs font-semibold text-[var(--text3)] bg-[var(--bg2)] rounded-xl">
                      🎉 Ajoyib! Ushbu davrda qarzi o'sgan mijozlar yo'q.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {analyticsData.debtGrowingClients.slice(0, 6).map((c, i) => (
                        <div 
                          key={c.name}
                          onClick={() => onSelectClient?.(c.name)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:border-rose-500/40 transition-all cursor-pointer group"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-[var(--text3)] w-4">{i + 1}.</span>
                              <span className="text-xs font-black text-[var(--text)] group-hover:text-blue-500 truncate">
                                {c.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text3)] font-medium mt-0.5 flex items-center gap-2">
                              <span>Yuk: <b>{formatCompact(c.yukSumma)} UZS</b></span>
                              <span>•</span>
                              <span>To'lov: <b>{formatCompact(c.tolovSumma)} UZS</b></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-black text-rose-500">
                              +{formatUzs(c.netDelta)} UZS
                            </div>
                            <div className="text-[10px] font-semibold text-[var(--text3)]">
                              Jami qarz: {formatCompact(c.currentDebt)} UZS
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text3)]">
                  <span className="text-[11px]">Jami yangi qarz oshishi:</span>
                  <strong className="text-rose-500">
                    +{formatUzs(analyticsData.debtGrowingClients.reduce((a, b) => a + b.netDelta, 0))} UZS
                  </strong>
                </div>
              </div>

              {/* Right Column: Top Debt Reducing Clients (Qarzini yopayotgan) */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                        <ArrowDownRight size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                          Qarzini Eng Faol Yopgan Mijozlar
                        </h4>
                        <p className="text-[10px] font-semibold text-[var(--text3)]">
                          Ushbu davrda qarzini eng ko'p kamaytirgan xaridorlar
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                      {analyticsData.debtReducingClients.length} ta mijoz
                    </span>
                  </div>

                  {analyticsData.debtReducingClients.length === 0 ? (
                    <div className="p-6 text-center text-xs font-semibold text-[var(--text3)] bg-[var(--bg2)] rounded-xl">
                      Ushbu davrda qarz yopgan mijozlar topilmadi.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {analyticsData.debtReducingClients.slice(0, 6).map((c, i) => (
                        <div 
                          key={c.name}
                          onClick={() => onSelectClient?.(c.name)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] hover:border-emerald-500/40 transition-all cursor-pointer group"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-[var(--text3)] w-4">{i + 1}.</span>
                              <span className="text-xs font-black text-[var(--text)] group-hover:text-blue-500 truncate">
                                {c.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text3)] font-medium mt-0.5 flex items-center gap-2">
                              <span>To'lov: <b className="text-emerald-600 dark:text-emerald-400">{formatCompact(c.tolovSumma)} UZS</b></span>
                              <span>•</span>
                              <span>Yuk: <b>{formatCompact(c.yukSumma)} UZS</b></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-black text-emerald-500">
                              -{formatUzs(Math.abs(c.netDelta))} UZS
                            </div>
                            <div className="text-[10px] font-semibold text-[var(--text3)]">
                              Qoldiq: {formatCompact(c.currentDebt)} UZS
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text3)]">
                  <span className="text-[11px]">Jami yopilgan qarz:</span>
                  <strong className="text-emerald-500">
                    -{formatUzs(Math.abs(analyticsData.debtReducingClients.reduce((a, b) => a + b.netDelta, 0)))} UZS
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: 2. CHART VIEW */}
          {activeTab === 'chart' && (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                    Kunlik Chiqarilgan Yuk vs Undirilgan Pul Taqqoslovi
                  </h4>
                  <p className="text-[11px] text-[var(--text3)] font-semibold">
                    Har bir kun uchun yuk chiqimi va qabul qilingan to'lovlar
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-blue-500 inline-block" />
                    <span>Chiqarilgan Yuk</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block" />
                    <span>Undirilgan Pul</span>
                  </div>
                </div>
              </div>

              <div className="w-full h-[280px] sm:h-[320px] pt-3">
                {analyticsData.chartData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-[var(--text3)]">
                    Ushbu davr uchun operatsiyalar mavjud emas
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analyticsData.chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                      <XAxis 
                        dataKey="displayDate" 
                        stroke="var(--text3)" 
                        fontSize={11} 
                        tickLine={false} 
                      />
                      <YAxis 
                        stroke="var(--text3)" 
                        fontSize={10} 
                        tickLine={false}
                        tickFormatter={(val) => formatCompact(val)}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--bg2)', 
                          borderColor: 'var(--border)', 
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: 'var(--text)'
                        }}
                        formatter={(val: any, name: any) => [
                          `${formatUzs(Number(val))} UZS`,
                          name === 'yukSumma' ? 'Chiqarilgan Yuk' : name === 'tolovSumma' ? 'Undirilgan Pul' : 'Qarz O\'zgarishi'
                        ]}
                      />
                      <Bar dataKey="yukSumma" name="yukSumma" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                      <Bar dataKey="tolovSumma" name="tolovSumma" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: 3. ALL CLIENTS TABLE */}
          {activeTab === 'clients' && (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                    Mijozlar Kesimidagi To'liq Balans Hisoboti
                  </h4>
                  <p className="text-[11px] text-[var(--text3)] font-semibold">
                    Har bir mijoz bo'yicha chiqarilgan yuk, to'langan pul va qarzdorlik o'zgarishi
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Mijoz nomini qidirish..."
                    className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto max-h-[350px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[var(--bg2)] text-[var(--text3)] uppercase text-[10px] font-black border-b border-[var(--border)] sticky top-0 z-10">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Mijoz Nomi</th>
                      <th className="p-3 text-right">Yuk (UZS)</th>
                      <th className="p-3 text-right">To'lov (UZS)</th>
                      <th className="p-3 text-right">Qarz Dinamikasi</th>
                      <th className="p-3 text-right">Qoplash %</th>
                      <th className="p-3 text-right">Joriy Qarz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-xs font-semibold text-[var(--text3)]">
                          Mijozlar topilmadi
                        </td>
                      </tr>
                    ) : (
                      filteredClients.map((c, i) => (
                        <tr 
                          key={c.name} 
                          onClick={() => onSelectClient?.(c.name)}
                          className="hover:bg-[var(--bg2)] cursor-pointer transition-colors"
                        >
                          <td className="p-3 font-bold text-[var(--text3)] text-[11px]">{i + 1}</td>
                          <td className="p-3 font-extrabold text-[var(--text)] truncate max-w-[180px]">
                            {c.name}
                          </td>
                          <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">
                            {formatCompact(c.yukSumma)} UZS
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCompact(c.tolovSumma)} UZS
                          </td>
                          <td className="p-3 text-right font-black">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[11px]",
                              c.netDelta > 0 
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" 
                                : c.netDelta < 0 
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                  : "text-[var(--text3)]"
                            )}>
                              {c.netDelta > 0 ? `+${formatCompact(c.netDelta)}` : c.netDelta < 0 ? `-${formatCompact(Math.abs(c.netDelta))}` : "0"} UZS
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-[var(--text2)]">
                            {c.clientCollRate.toFixed(0)}%
                          </td>
                          <td className="p-3 text-right font-black text-[var(--text)]">
                            {formatCompact(c.currentDebt)} UZS
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
