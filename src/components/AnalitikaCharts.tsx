import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { getTodayStr, formatCompact, formatUzs, cn, isCorrectionTx, formatPhoneNumber, getCat } from '../lib/utils';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, ComposedChart, Line, Legend
} from 'recharts';
import { useDb } from '../context/DbContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { 
  Package, Download, TrendingUp, DollarSign, Wallet, Activity, AlertTriangle, 
  ArrowRightLeft, Users, Calendar, Sparkles, Layers, ArrowDownLeft, ArrowUpRight,
  Flame, Clock, ChevronRight, Eye, CheckCircle2, ShieldAlert,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { ModelDrillDownModal } from './ModelDrillDownModal';
import { LazyViewport } from './common/LazyViewport';
import { toast } from 'sonner';

interface AnalitikaProps {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981', '#facc15', '#06b6d4', '#84cc16'];

export default function AnalitikaCharts({ dateFilter = 'this_month', startDate, endDate }: AnalitikaProps) {
  const { db, currentOmbor, currentUser } = useDb();
  const isAdmin = currentUser?.rol === 'admin';
  const stock = db[currentOmbor]?.stock || {};
  
  const [selectedModelForDrillDown, setSelectedModelForDrillDown] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'sales_dynamics' | 'flow_comparison' | 'weekday_pattern'>('sales_dynamics');
  const [chartMetric, setChartMetric] = useState<'quantity' | 'summa'>('quantity');
  const [activeAlertTab, setActiveAlertTab] = useState<'low' | 'dead' | 'debtors'>('low');
  const [isAlertsCollapsed, setIsAlertsCollapsed] = useState<boolean>(true);

  // Inventory value & count for current Ombor
  const { currentStockPairs, currentStockValue } = useMemo(() => {
    let pairs = 0;
    let val = 0;
    Object.entries(stock).forEach(([model, sizes]) => {
      const modelPairs = Object.values(sizes || {}).reduce((a, b) => a + (b as number), 0);
      pairs += modelPairs;
      val += modelPairs * (db.prices?.[model]?.cost || 0);
    });
    return { currentStockPairs: pairs, currentStockValue: val };
  }, [stock, db.prices]);

  // Filtered sales
  const allChiqimRaw = useMemo(() => [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(t => t.amal === 'chiqim' && !isCorrectionTx(t)), [db]);
  const allKirimRaw = useMemo(() => [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(t => t.amal === 'kirim' && !isCorrectionTx(t)), [db]);

  const allChiqim = useMemo(() => {
    const today = new Date();
    const todayStr = getTodayStr();
    return allChiqimRaw.filter(t => {
      const tDate = new Date(t.sana);
      if (isNaN(tDate.getTime())) return true;
      
      switch (dateFilter) {
        case 'today': return t.sana === todayStr;
        case 'yesterday': {
          const y = new Date(); y.setDate(y.getDate() - 1);
          return t.sana === y.toISOString().slice(0, 10);
        }
        case 'this_week': {
          const curr = new Date();
          const first = curr.getDate() - curr.getDay() + 1;
          const firstDay = new Date(curr.setDate(first));
          return t.sana >= firstDay.toISOString().slice(0, 10);
        }
        case 'this_month': return tDate.getFullYear() === today.getFullYear() && tDate.getMonth() === today.getMonth();
        case 'last_month': {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          return tDate.getFullYear() === lastMonth.getFullYear() && tDate.getMonth() === lastMonth.getMonth();
        }
        case 'this_year': return tDate.getFullYear() === today.getFullYear();
        case 'custom': {
          if (!startDate && !endDate) return true;
          if (startDate && t.sana < startDate) return false;
          if (endDate && t.sana > endDate) return false;
          return true;
        }
        case 'all': default: return true;
      }
    });
  }, [allChiqimRaw, dateFilter, startDate, endDate]);

  const { totalSalesPairs, totalSalesRevenue, totalSalesProfit } = useMemo(() => {
    let pairs = 0;
    let rev = 0;
    let prof = 0;
    allChiqim.forEach(t => {
      pairs += (t.soni || 0);
      rev += (t.summa || 0);
      prof += (t.foyda || 0);
    });
    return { totalSalesPairs: pairs, totalSalesRevenue: rev, totalSalesProfit: prof };
  }, [allChiqim]);

  // Expenses in date filter
  const allExpenses = useMemo(() => {
    const today = new Date();
    const todayStr = getTodayStr();
    return (db.kassaHarakatlari || []).filter(h => {
      if (h.tur !== 'chiqim') return false;
      const hDate = new Date(h.sana);
      if (isNaN(hDate.getTime())) return true;

      switch (dateFilter) {
        case 'today': return h.sana === todayStr;
        case 'this_month': return hDate.getFullYear() === today.getFullYear() && hDate.getMonth() === today.getMonth();
        case 'last_month': {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          return hDate.getFullYear() === lastMonth.getFullYear() && hDate.getMonth() === lastMonth.getMonth();
        }
        case 'this_year': return hDate.getFullYear() === today.getFullYear();
        case 'custom': {
          if (!startDate && !endDate) return true;
          if (startDate && h.sana < startDate) return false;
          if (endDate && h.sana > endDate) return false;
          return true;
        }
        case 'all': default: return true;
      }
    });
  }, [db.kassaHarakatlari, dateFilter, startDate, endDate]);

  const totalExpensesSum = useMemo(() => {
    const kurs = db.valyutaKursi || 12850;
    return allExpenses.reduce((sum, h) => {
      const val = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || kurs) : h.summa);
      return sum + val;
    }, 0);
  }, [allExpenses, db.valyutaKursi]);

  const trueNetProfit = useMemo(() => {
    return totalSalesProfit - totalExpensesSum;
  }, [totalSalesProfit, totalExpensesSum]);

  // Dynamics (Daily sales and profit for active period)
  const dynamicsData = useMemo(() => {
    const daily: Record<string, { total: number; profit: number; revenue: number; kirim: number }> = {};
    
    // Aggregate Chiqim
    allChiqim.forEach(t => {
      const date = t.sana.slice(5); // Show MM-DD
      if (!daily[date]) daily[date] = { total: 0, profit: 0, revenue: 0, kirim: 0 };
      daily[date].total += (t.soni || 0);
      daily[date].profit += (t.foyda || 0);
      daily[date].revenue += (t.summa || 0);
    });

    // Aggregate Kirim for same period
    allKirimRaw.forEach(t => {
      const date = (t.sana || '').slice(5);
      if (date && daily[date]) {
        daily[date].kirim += (t.soni || 0);
      }
    });
    
    return Object.entries(daily)
      .map(([date, data]) => ({ 
        date, 
        total: data.total, 
        profit: data.profit, 
        revenue: data.revenue,
        kirim: data.kirim 
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }, [allChiqim, allKirimRaw]);

  // Weekday pattern analysis (Dushanba - Yakshanba distribution)
  const weekdayData = useMemo(() => {
    const days = [
      { name: 'Dush', full: 'Dushanba', sales: 0, revenue: 0, count: 0 },
      { name: 'Sesh', full: 'Seshanba', sales: 0, revenue: 0, count: 0 },
      { name: 'Chor', full: 'Chorshanba', sales: 0, revenue: 0, count: 0 },
      { name: 'Pay', full: 'Payshanba', sales: 0, revenue: 0, count: 0 },
      { name: 'Juma', full: 'Juma', sales: 0, revenue: 0, count: 0 },
      { name: 'Shan', full: 'Shanba', sales: 0, revenue: 0, count: 0 },
      { name: 'Yak', full: 'Yakshanba', sales: 0, revenue: 0, count: 0 },
    ];

    allChiqim.forEach(t => {
      if (!t.sana) return;
      const dayIdx = new Date(t.sana).getDay(); // 0 is Sunday
      const mappedIdx = dayIdx === 0 ? 6 : dayIdx - 1; // map to Monday=0
      if (days[mappedIdx]) {
        days[mappedIdx].sales += (t.soni || 0);
        days[mappedIdx].revenue += (t.summa || 0);
        days[mappedIdx].count += 1;
      }
    });

    return days;
  }, [allChiqim]);

  // Top selling models
  const topSellingData = useMemo(() => {
    const stats: Record<string, { soni: number; revenue: number }> = {};
    allChiqim.forEach(t => {
      if (!stats[t.model]) stats[t.model] = { soni: 0, revenue: 0 };
      stats[t.model].soni += (t.soni || 0);
      stats[t.model].revenue += (t.summa || 0);
    });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, soni: data.soni, revenue: data.revenue }))
      .sort((a, b) => b.soni - a.soni)
      .slice(0, 7);
  }, [allChiqim]);

  // Category share data (Klassik, Mexli Qishki, Setka Yozgi, Sport)
  const categoryShare = useMemo(() => {
    const catMap: Record<string, number> = {
      'Klassik': 0,
      'Mexli (Qishki)': 0,
      'Setka / Yozgi': 0,
      'Sport / Krossovka': 0
    };

    Object.entries(stock).forEach(([model, sizes]) => {
      const pairs = Object.values(sizes || {}).reduce((a, b) => a + (b as number), 0);
      const cat = getCat(model);
      if (cat === 'qishki') catMap['Mexli (Qishki)'] += pairs;
      else if (cat === 'yozgi') catMap['Setka / Yozgi'] += pairs;
      else if (model.toLowerCase().includes('sport') || model.toLowerCase().includes('kross')) catMap['Sport / Krossovka'] += pairs;
      else catMap['Klassik'] += pairs;
    });

    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter(x => x.value > 0);
  }, [stock]);

  // Low stock alerts (<= 5 pairs in sizes)
  const lowStockAlerts = useMemo(() => {
    const alerts: { model: string; olcham: string; qoldiq: number }[] = [];
    Object.entries(stock).forEach(([model, sizes]) => {
      Object.entries(sizes).forEach(([sz, qty]) => {
        if (qty > 0 && qty <= 5) {
          alerts.push({ model, olcham: sz, qoldiq: qty });
        }
      });
    });
    return alerts.sort((a, b) => a.qoldiq - b.qoldiq).slice(0, 8);
  }, [stock]);

  // Dead stock (> 20 pairs in stock with zero or < 5 sales)
  const deadStock = useMemo(() => {
    const alerts: { model: string; olcham: string; qoldiq: number; sotilgan: number }[] = [];
    const salesByModel: Record<string, number> = {};
    allChiqimRaw.forEach(t => {
      salesByModel[t.model] = (salesByModel[t.model] || 0) + (t.soni || 0);
    });

    Object.entries(stock).forEach(([model, sizes]) => {
      Object.entries(sizes).forEach(([sz, qty]) => {
        if (qty > 5) {
          const sotuv = salesByModel[model] || 0;
          if (sotuv === 0 || (sotuv < 5 && qty > 20)) {
            alerts.push({ model, olcham: sz, qoldiq: qty, sotilgan: sotuv });
          }
        }
      });
    });
    return alerts.sort((a, b) => b.qoldiq - a.qoldiq).slice(0, 8);
  }, [stock, allChiqimRaw]);

  // Top Debtors
  const topDebtors = useMemo(() => {
    return (db.kontragentlar || [])
      .filter(k => k.balans && k.balans > 0)
      .sort((a, b) => (b.balans || 0) - (a.balans || 0))
      .slice(0, 6);
  }, [db.kontragentlar]);

  // Recent 6 transactions feed (Live Pulse)
  const recentActivities = useMemo(() => {
    const all = [
      ...(db.tepa?.transactions || []).map(t => ({ ...t, ombor: 'Tepa' })),
      ...(db.kotta?.transactions || []).map(t => ({ ...t, ombor: 'Kotta' }))
    ];
    return all.sort((a, b) => (b.vaqt || '').localeCompare(a.vaqt || '')).slice(0, 6);
  }, [db.tepa, db.kotta]);

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  
  const handleExportExcel = useCallback(() => {
    try {
      const summaryData = [
        { "Ko'rsatkich": "Ombor Qoldig'i", "Qiymati": currentStockPairs, "To'liq": `${currentStockPairs} juft` },
        { "Ko'rsatkich": "Zaxira Qiymati", "Qiymati": currentStockValue, "To'liq": `${formatUzs(currentStockValue)} so'm` },
        { "Ko'rsatkich": "Savdo Tushumi", "Qiymati": totalSalesRevenue, "To'liq": `${formatUzs(totalSalesRevenue)} so'm` },
        { "Ko'rsatkich": "Kassa Xarajatlari", "Qiymati": totalExpensesSum, "To'liq": `${formatUzs(totalExpensesSum)} so'm` },
        { "Ko'rsatkich": "Sof Foyda", "Qiymati": trueNetProfit, "To'liq": `${formatUzs(trueNetProfit)} so'm` }
      ];

      const dailySales = dynamicsData.map(d => ({
        "Sana": d.date,
        "Sotuv (juft)": d.total,
        "Tushum (UZS)": d.revenue,
        "Foyda (UZS)": d.profit
      }));

      const topModelData = topSellingData.map(m => ({
        "Model": m.name,
        "Sotilgan (juft)": m.soni,
        "Tushum (UZS)": m.revenue
      }));

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Asosiy Ko'rsatkichlar");
      const wsDaily = XLSX.utils.json_to_sheet(dailySales);
      XLSX.utils.book_append_sheet(wb, wsDaily, "Kunlik Savdo");
      const wsTopModels = XLSX.utils.json_to_sheet(topModelData);
      XLSX.utils.book_append_sheet(wb, wsTopModels, "Top Modellar");

      XLSX.writeFile(wb, `Bento_Dashboard_Hisobot_${getTodayStr()}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error("Excel yuklashda xatolik yuz berdi!");
    }
  }, [currentStockPairs, currentStockValue, totalSalesRevenue, totalExpensesSum, trueNetProfit, dynamicsData, topSellingData]);

  const handleExportPDF = useCallback(async () => {
    setIsExportingPDF(true);
    try {
      const element = document.getElementById('dashboard-export-area');
      if (!element) return;
      await new Promise(r => setTimeout(r, 100));

      const canvas = await htmlToImage.toCanvas(element, { 
        pixelRatio: 2, 
        backgroundColor: document.documentElement.classList.contains('light-mode') ? '#ffffff' : '#121214',
        skipFonts: true,
        cacheBust: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bento_Dashboard_Hisobot_${getTodayStr()}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error("PDF yuklashda xatolik yuz berdi!");
    } finally {
      setIsExportingPDF(false);
    }
  }, []);

  // Listen to global export trigger events from top toolbar
  useEffect(() => {
    const onExcel = () => handleExportExcel();
    const onPdf = () => handleExportPDF();
    window.addEventListener('export-dashboard-excel', onExcel);
    window.addEventListener('export-dashboard-pdf', onPdf);
    return () => {
      window.removeEventListener('export-dashboard-excel', onExcel);
      window.removeEventListener('export-dashboard-pdf', onPdf);
    };
  }, [handleExportExcel, handleExportPDF]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dashboard-pdf-status', { detail: { isExporting: isExportingPDF } }));
  }, [isExportingPDF]);

  return (
    <div className="flex flex-col gap-4 pb-8" id="dashboard-export-area">
      {/* PRIMARY BENTO GRID: MAIN INTERACTIVE CHART ENGINE */}
      <div className="grid grid-cols-1 gap-4">
        
        {/* BENTO TILE 1: INTERACTIVE CHART ENGINE (Full Width) */}
        <div className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 md:p-6 flex flex-col justify-between shadow-xs group hover:border-blue-500/30 transition-colors min-h-[420px]">
          <div>
            {/* Chart Header & Mode Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-black shrink-0">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[14px] font-black text-[var(--text)]">Bento Analitika & Savdo Dinamikasi</h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      Live Engine
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text3)] font-semibold">
                    {dynamicsData.length} kunlik savdo dinamikasi va ombor oqimlari
                  </span>
                </div>
              </div>

              {/* Chart Modes & Metrics Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Metric Selector (Dona vs Summa) */}
                <div className="flex items-center p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl gap-0.5 text-[10px] font-black">
                  <button
                    onClick={() => setChartMetric('quantity')}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all cursor-pointer",
                      chartMetric === 'quantity' ? "bg-blue-600 text-white shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
                    )}
                  >
                    Dona (Juft)
                  </button>
                  <button
                    onClick={() => setChartMetric('summa')}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all cursor-pointer",
                      chartMetric === 'summa' ? "bg-blue-600 text-white shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
                    )}
                  >
                    Summa (UZS)
                  </button>
                </div>

                {/* Sub-modes */}
                <div className="flex items-center p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl gap-0.5 text-[10px] font-black">
                  <button
                    onClick={() => setChartMode('sales_dynamics')}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all cursor-pointer",
                      chartMode === 'sales_dynamics' ? "bg-[var(--text)] text-[var(--bg)] shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
                    )}
                  >
                    Kunlik Trend
                  </button>
                  <button
                    onClick={() => setChartMode('flow_comparison')}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all cursor-pointer",
                      chartMode === 'flow_comparison' ? "bg-[var(--text)] text-[var(--bg)] shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
                    )}
                  >
                    Kirim vs Chiqim
                  </button>
                  <button
                    onClick={() => setChartMode('weekday_pattern')}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all cursor-pointer",
                      chartMode === 'weekday_pattern' ? "bg-[var(--text)] text-[var(--bg)] shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
                    )}
                  >
                    Hafta Kunlari
                  </button>
                </div>
              </div>
            </div>

            {/* Main Recharts Area */}
            <LazyViewport fallbackHeight="300px" placeholderLabel="Bento savdo dinamikasi yuklanmoqda...">
              <div className="w-full h-[280px] sm:h-[320px]">
                {chartMode === 'sales_dynamics' && (
                dynamicsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dynamicsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bentoSalesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="bentoProfitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                      <XAxis dataKey="date" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                      <YAxis 
                        stroke="var(--text3)" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false} 
                        dx={-8}
                        tickFormatter={(val) => chartMetric === 'quantity' ? (val > 1000 ? `${(val/1000).toFixed(0)}k` : val) : formatCompact(val)} 
                      />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--bg2)', 
                          borderRadius: '16px', 
                          border: '1px solid var(--border)', 
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', 
                          padding: '12px' 
                        }}
                        formatter={(val: any, name: any) => [
                          chartMetric === 'quantity' ? `${Number(val).toLocaleString()} juft` : `${formatUzs(Number(val))} so'm`,
                          name === 'total' ? 'Sotuv hajmi' : name === 'profit' ? 'Sof foyda' : name === 'revenue' ? 'Tushum' : name
                        ]}
                        labelStyle={{ fontWeight: 'bold', color: 'var(--text3)', marginBottom: '4px' }}
                      />
                      {isAdmin && (
                        <Area 
                          type="monotone" 
                          dataKey={chartMetric === 'quantity' ? 'profit' : 'profit'} 
                          name="profit" 
                          stroke="#10b981" 
                          strokeWidth={2.5} 
                          fillOpacity={1} 
                          fill="url(#bentoProfitGrad)" 
                          activeDot={{ r: 5, fill: '#10b981' }} 
                        />
                      )}
                      <Area 
                        type="monotone" 
                        dataKey={chartMetric === 'quantity' ? 'total' : 'revenue'} 
                        name="total" 
                        stroke="#3b82f6" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#bentoSalesGrad)" 
                        activeDot={{ r: 5, fill: '#3b82f6' }} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text3)] text-xs font-semibold">
                    <Activity className="w-8 h-8 text-[var(--text3)]/50 mb-2" />
                    Tanlangan davrda sotuvlar mavjud emas
                  </div>
                )
              )}

              {chartMode === 'flow_comparison' && (
                dynamicsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dynamicsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }} barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                      <XAxis dataKey="date" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                      <YAxis stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} dx={-8} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'var(--bg2)', borderRadius: '16px', border: '1px solid var(--border)', padding: '12px' }}
                        formatter={(val: any, name: any) => [`${Number(val).toLocaleString()} juft`, name === 'kirim' ? 'Kirim (Fabrika)' : 'Chiqim (Savdo)']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      <Bar dataKey="kirim" name="kirim" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="total" name="Chiqim" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text3)] text-xs font-semibold">Ma'lumot yetarli emas</div>
                )
              )}

              {chartMode === 'weekday_pattern' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                    <XAxis dataKey="name" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                    <YAxis 
                      stroke="var(--text3)" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      dx={-8}
                      tickFormatter={(val) => chartMetric === 'quantity' ? val : formatCompact(val)} 
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'var(--bg2)', borderRadius: '16px', border: '1px solid var(--border)', padding: '12px' }}
                      formatter={(val: any) => [chartMetric === 'quantity' ? `${Number(val).toLocaleString()} juft` : `${formatUzs(Number(val))} so'm`, 'Savdo']}
                      labelFormatter={(label) => {
                        const d = weekdayData.find(x => x.name === label);
                        return d ? `${d.full} (${d.count} ta chek)` : label;
                      }}
                    />
                    <Bar dataKey={chartMetric === 'quantity' ? 'sales' : 'revenue'} fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {weekdayData.map((entry, index) => {
                        const max = Math.max(...weekdayData.map(x => x.sales));
                        return <Cell key={`cell-${index}`} fill={entry.sales === max && max > 0 ? '#3b82f6' : '#818cf8'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            </LazyViewport>
          </div>

          {/* Bottom Live Summary Strip */}
          <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-[var(--text3)] mt-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-blue-500">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Jami Sotuv: <strong>{totalSalesPairs.toLocaleString()} juft</strong>
              </span>
              {isAdmin && (
                <span className="flex items-center gap-1.5 text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Yalpi Foyda: <strong>{formatCompact(totalSalesProfit)}</strong>
                </span>
              )}
            </div>
            <span className="text-[10px] text-[var(--text3)]">
              Katta doiradagi tahlillar uchun yuqoridagi sanalardan foydalaning
            </span>
          </div>
        </div>

      </div>

      {/* OPERATIONAL SIGNALS (Full Width, Collapsible) */}
      <div className="w-full">
        
        {/* BENTO TILE 3: SMART SIGNALS & RISK RADAR */}
        <div className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 md:p-6 flex flex-col justify-between shadow-xs group hover:border-rose-500/30 transition-all">
          <div>
            {/* Header with Accordion Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div 
                onClick={() => setIsAlertsCollapsed(!isAlertsCollapsed)}
                className="flex items-center gap-2.5 cursor-pointer select-none group/title"
              >
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-black transition-transform group-hover/title:scale-105">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-black text-[var(--text)] group-hover/title:text-rose-500 transition-colors">
                      Operatsion Signallar
                    </h3>
                    {(lowStockAlerts.length > 0 || deadStock.length > 0 || topDebtors.length > 0) && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text3)] font-semibold">Tezkor xavf va zaxira ogohlantirishlari</span>
                </div>
              </div>

              {/* Controls on right side */}
              <div className="flex items-center gap-2">
                {!isAlertsCollapsed && (
                  <div className="flex items-center p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl gap-0.5 text-[10px] font-black">
                    <button
                      onClick={() => setActiveAlertTab('low')}
                      className={cn(
                        "px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1",
                        activeAlertTab === 'low' ? "bg-rose-500 text-white shadow-xs" : "text-[var(--text3)] hover:text-rose-500"
                      )}
                    >
                      <span>Kam qolgan</span>
                      {lowStockAlerts.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-white text-[9px]">
                          {lowStockAlerts.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveAlertTab('dead')}
                      className={cn(
                        "px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1",
                        activeAlertTab === 'dead' ? "bg-purple-500 text-white shadow-xs" : "text-[var(--text3)] hover:text-purple-500"
                      )}
                    >
                      <span>O'lik zaxira</span>
                      {deadStock.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-white text-[9px]">
                          {deadStock.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveAlertTab('debtors')}
                      className={cn(
                        "px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1",
                        activeAlertTab === 'debtors' ? "bg-amber-500 text-white shadow-xs" : "text-[var(--text3)] hover:text-amber-500"
                      )}
                    >
                      <span>Qarzlar</span>
                      {topDebtors.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-white text-[9px]">
                          {topDebtors.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {/* Toggle Button */}
                <button
                  onClick={() => setIsAlertsCollapsed(!isAlertsCollapsed)}
                  className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg2)] text-[var(--text)] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={isAlertsCollapsed ? "Signallarni ochish" : "Signallarni yopish"}
                >
                  <span className="text-[11px] font-semibold text-[var(--text2)] hidden sm:inline">
                    {isAlertsCollapsed ? "Ochish" : "Yashirish"}
                  </span>
                  {isAlertsCollapsed ? (
                    <ChevronDown size={14} className="text-rose-500" />
                  ) : (
                    <ChevronUp size={14} className="text-[var(--text3)]" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsed Summary Strip */}
            {isAlertsCollapsed && (
              <div 
                onClick={() => setIsAlertsCollapsed(false)}
                className="mt-4 p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] hover:border-rose-500/30 transition-all cursor-pointer flex flex-wrap items-center justify-between gap-3 text-[11px]"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 font-bold text-rose-500">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Kam qolgan: <strong>{lowStockAlerts.length} ta</strong>
                  </span>
                  <span className="text-[var(--border)]">•</span>
                  <span className="inline-flex items-center gap-1 font-bold text-purple-500">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    O'lik: <strong>{deadStock.length} ta</strong>
                  </span>
                  <span className="text-[var(--border)]">•</span>
                  <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Qarzdorlar: <strong>{topDebtors.length} ta</strong>
                  </span>
                </div>
                <span className="text-rose-500 font-extrabold text-[10px] flex items-center gap-1">
                  Batafsil ko'rish <ChevronDown size={12} />
                </span>
              </div>
            )}

            {/* Expanded Content List */}
            {!isAlertsCollapsed && (
              <div className="mt-4 space-y-2 overflow-y-auto max-h-[250px] pr-1 custom-scrollbar">
                {activeAlertTab === 'low' && (
                  lowStockAlerts.length > 0 ? (
                    lowStockAlerts.map((alert, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedModelForDrillDown(alert.model)}
                        className="flex items-center justify-between p-3 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors rounded-2xl cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                          <div>
                            <div className="font-extrabold text-[12px] text-[var(--text)]">{alert.model}</div>
                            <div className="text-[10px] text-[var(--text3)] font-semibold">O'lcham: {alert.olcham}</div>
                          </div>
                        </div>
                        <span className="text-[11px] font-black text-rose-500 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20">
                          {alert.qoldiq} juft qoldi
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text3)]">
                      <CheckCircle2 className="w-9 h-9 text-emerald-500 mb-2" />
                      <p className="text-xs font-bold text-[var(--text)]">Barcha zaxiralar yetarli</p>
                      <p className="text-[10px]">Omborda kam qolgan o'lchamlar yo'q</p>
                    </div>
                  )
                )}

                {activeAlertTab === 'dead' && (
                  deadStock.length > 0 ? (
                    deadStock.map((alert, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedModelForDrillDown(alert.model)}
                        className="flex items-center justify-between p-3 border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors rounded-2xl cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                          <div>
                            <div className="font-extrabold text-[12px] text-[var(--text)]">{alert.model}</div>
                            <div className="text-[10px] text-[var(--text3)] font-semibold">O'lcham: {alert.olcham} • Sotilgan: {alert.sotilgan} j</div>
                          </div>
                        </div>
                        <span className="text-[11px] font-black text-purple-500 px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20">
                          {alert.qoldiq} juft yotibdi
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text3)]">
                      <CheckCircle2 className="w-9 h-9 text-emerald-500 mb-2" />
                      <p className="text-xs font-bold text-[var(--text)]">Harakatsiz zaxira yo'q</p>
                      <p className="text-[10px]">Barcha tovarlar aylanmada faol</p>
                    </div>
                  )
                )}

                {activeAlertTab === 'debtors' && (
                  topDebtors.length > 0 ? (
                    topDebtors.map((debtor, i) => (
                      <div 
                        key={i} 
                        className="flex items-center justify-between p-3 bg-[var(--bg)] border border-[var(--border)] hover:border-amber-500/30 transition-colors rounded-2xl"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black text-[11px] uppercase">
                            {debtor.ism.substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-extrabold text-[12px] text-[var(--text)] truncate max-w-[150px]">{debtor.ism}</div>
                            <div className="text-[10px] text-[var(--text3)] font-semibold">{formatPhoneNumber(debtor.tel) || 'Tel mavjud emas'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[12px] font-black text-amber-500 tabular-nums">
                            {formatCompact(debtor.balans || 0)}
                          </div>
                          <div className="text-[8px] font-bold uppercase tracking-wider text-amber-500/70">so'm qarz</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text3)]">
                      <CheckCircle2 className="w-9 h-9 text-emerald-500 mb-2" />
                      <p className="text-xs font-bold text-[var(--text)]">Qarzdorliklar mavjud emas</p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {!isAlertsCollapsed && (
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] font-semibold text-[var(--text3)] mt-2">
              <span>Holat:</span>
              <span className="text-rose-500 font-extrabold flex items-center gap-1">
                Doimiy nazoratda <ShieldAlert size={13} />
              </span>
            </div>
          )}
        </div>

      </div>

      {selectedModelForDrillDown && (
        <ModelDrillDownModal 
          modelName={selectedModelForDrillDown} 
          onClose={() => setSelectedModelForDrillDown(null)} 
        />
      )}
    </div>
  );
}
