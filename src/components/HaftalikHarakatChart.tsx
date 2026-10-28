import React, { useState, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  BarChart2,
  Activity,
  ArrowRightLeft,
  DollarSign,
  Package,
  CalendarDays,
  Sparkles,
  Info
} from 'lucide-react';
import { cn, formatCompact, formatUzs, getTodayStr } from '../lib/utils';

type ViewMode = 'grouped_bar' | 'area_trend' | 'net_flow';
type MetricMode = 'quantity' | 'summa';
type FilialFilter = 'all' | 'tepa' | 'kotta';
type RangeMode = 'this_week' | 'last_7_days' | 'last_14_days';

const UZ_DAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
const UZ_DAYS_FULL = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

export const HaftalikHarakatChart: React.FC = () => {
  const { db, currentOmbor, currentUser } = useDb();
  const isAdmin = currentUser?.rol === 'admin';

  const [rangeMode, setRangeMode] = useState<RangeMode>('this_week');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped_bar');
  const [metricMode, setMetricMode] = useState<MetricMode>('quantity');
  const [filialFilter, setFilialFilter] = useState<FilialFilter>('all');

  const prices = db.prices || {};

  // Generate date list based on selected rangeMode
  const dateList = useMemo(() => {
    const dates: { dateStr: string; dayIndex: number; dayShort: string; dayFull: string; isToday: boolean }[] = [];
    const today = new Date();
    const todayStr = getTodayStr();

    if (rangeMode === 'this_week') {
      // Monday through Sunday of current week
      const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday...
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(today);
      monday.setDate(today.getDate() + distanceToMonday);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayIdx = d.getDay();
        dates.push({
          dateStr,
          dayIndex: dayIdx,
          dayShort: UZ_DAYS_SHORT[dayIdx],
          dayFull: UZ_DAYS_FULL[dayIdx],
          isToday: dateStr === todayStr,
        });
      }
    } else if (rangeMode === 'last_7_days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayIdx = d.getDay();
        dates.push({
          dateStr,
          dayIndex: dayIdx,
          dayShort: UZ_DAYS_SHORT[dayIdx],
          dayFull: UZ_DAYS_FULL[dayIdx],
          isToday: dateStr === todayStr,
        });
      }
    } else {
      // last 14 days
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayIdx = d.getDay();
        dates.push({
          dateStr,
          dayIndex: dayIdx,
          dayShort: UZ_DAYS_SHORT[dayIdx],
          dayFull: UZ_DAYS_FULL[dayIdx],
          isToday: dateStr === todayStr,
        });
      }
    }

    return dates;
  }, [rangeMode]);

  // Aggregate transactions by date
  const chartData = useMemo(() => {
    // Collect all transactions based on filialFilter
    const rawTepa = db.tepa?.transactions || [];
    const rawKotta = db.kotta?.transactions || [];

    let transactions: any[] = [];
    if (filialFilter === 'all') {
      transactions = [...rawTepa, ...rawKotta];
    } else if (filialFilter === 'tepa') {
      transactions = [...rawTepa];
    } else {
      transactions = [...rawKotta];
    }

    // Map by date
    const dateMap: Record<
      string,
      {
        kirimQty: number;
        chiqimQty: number;
        kirimSum: number;
        chiqimSum: number;
        kirimCount: number;
        chiqimCount: number;
      }
    > = {};

    transactions.forEach(t => {
      const date = t.sana || (t.vaqt ? t.vaqt.slice(0, 10) : '');
      if (!date) return;

      if (!dateMap[date]) {
        dateMap[date] = {
          kirimQty: 0,
          chiqimQty: 0,
          kirimSum: 0,
          chiqimSum: 0,
          kirimCount: 0,
          chiqimCount: 0,
        };
      }

      const qty = t.soni || 0;
      const modelCost = prices[t.model]?.cost || 0;
      const modelSale = prices[t.model]?.sale || 0;
      const sum = t.summa || (t.amal === 'kirim' ? qty * modelCost : qty * modelSale);

      if (t.amal === 'kirim') {
        dateMap[date].kirimQty += qty;
        dateMap[date].kirimSum += sum;
        dateMap[date].kirimCount += 1;
      } else if (t.amal === 'chiqim') {
        dateMap[date].chiqimQty += qty;
        dateMap[date].chiqimSum += sum;
        dateMap[date].chiqimCount += 1;
      }
    });

    return dateList.map(d => {
      const agg = dateMap[d.dateStr] || {
        kirimQty: 0,
        chiqimQty: 0,
        kirimSum: 0,
        chiqimSum: 0,
        kirimCount: 0,
        chiqimCount: 0,
      };

      const netQty = agg.kirimQty - agg.chiqimQty;
      const netSum = agg.kirimSum - agg.chiqimSum;
      const displayLabel = rangeMode === 'last_14_days'
        ? `${d.dateStr.slice(8, 10)}/${d.dateStr.slice(5, 7)}`
        : `${d.dayShort} (${d.dateStr.slice(8, 10)})`;

      return {
        date: d.dateStr,
        label: displayLabel,
        dayShort: d.dayShort,
        dayFull: d.dayFull,
        isToday: d.isToday,
        kirimQty: agg.kirimQty,
        chiqimQty: agg.chiqimQty,
        kirimSum: agg.kirimSum,
        chiqimSum: agg.chiqimSum,
        kirimCount: agg.kirimCount,
        chiqimCount: agg.chiqimCount,
        netQty,
        netSum,
        // Active values depending on metricMode
        kirim: metricMode === 'quantity' ? agg.kirimQty : agg.kirimSum,
        chiqim: metricMode === 'quantity' ? agg.chiqimQty : agg.chiqimSum,
        net: metricMode === 'quantity' ? netQty : netSum,
      };
    });
  }, [dateList, db, filialFilter, metricMode, prices, rangeMode]);

  // Overall totals for the active range
  const summary = useMemo(() => {
    let totalKirimQty = 0;
    let totalChiqimQty = 0;
    let totalKirimSum = 0;
    let totalChiqimSum = 0;
    let totalKirimOps = 0;
    let totalChiqimOps = 0;
    let maxActivityDay = { label: '-', total: 0 };

    chartData.forEach(d => {
      totalKirimQty += d.kirimQty;
      totalChiqimQty += d.chiqimQty;
      totalKirimSum += d.kirimSum;
      totalChiqimSum += d.chiqimSum;
      totalKirimOps += d.kirimCount;
      totalChiqimOps += d.chiqimCount;

      const dailyTotal = d.kirimQty + d.chiqimQty;
      if (dailyTotal > maxActivityDay.total) {
        maxActivityDay = { label: `${d.dayFull} (${d.date.slice(5)})`, total: dailyTotal };
      }
    });

    const netQty = totalKirimQty - totalChiqimQty;
    const netSum = totalKirimSum - totalChiqimSum;
    const daysCount = chartData.length || 1;
    const avgDailyQty = Math.round((totalKirimQty + totalChiqimQty) / daysCount);

    return {
      totalKirimQty,
      totalChiqimQty,
      totalKirimSum,
      totalChiqimSum,
      totalKirimOps,
      totalChiqimOps,
      netQty,
      netSum,
      avgDailyQty,
      maxActivityDay,
    };
  }, [chartData]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    const isQty = metricMode === 'quantity';

    return (
      <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl shadow-xl backdrop-blur-md min-w-[230px] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-black text-xs text-[var(--text)]">{dataPoint.dayFull}</span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text3)]">{dataPoint.date}</span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Kirim row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-500 font-bold">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Kirim:</span>
            </div>
            <div className="text-right">
              <span className="font-extrabold text-[var(--text)]">
                {isQty ? `${dataPoint.kirimQty.toLocaleString()} dona` : `$${dataPoint.kirimSum.toLocaleString()}`}
              </span>
              <span className="text-[10px] text-[var(--text3)] ml-1.5">({dataPoint.kirimCount} ta)</span>
            </div>
          </div>

          {/* Chiqim row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-500 font-bold">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Chiqim / Savdo:</span>
            </div>
            <div className="text-right">
              <span className="font-extrabold text-[var(--text)]">
                {isQty ? `${dataPoint.chiqimQty.toLocaleString()} dona` : `$${dataPoint.chiqimSum.toLocaleString()}`}
              </span>
              <span className="text-[10px] text-[var(--text3)] ml-1.5">({dataPoint.chiqimCount} ta)</span>
            </div>
          </div>

          {/* Net difference */}
          <div className="pt-2 mt-1 border-t border-[var(--border)] flex items-center justify-between font-bold">
            <span className="text-[var(--text3)] text-[11px]">Kunlik Sof Saldo:</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-md text-[11px] font-black",
                dataPoint.netQty >= 0
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-rose-500/10 text-rose-500"
              )}
            >
              {dataPoint.netQty >= 0 ? '+' : ''}
              {isQty ? `${dataPoint.netQty.toLocaleString()} dona` : `$${dataPoint.netSum.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 md:p-6 shadow-sm flex flex-col gap-6 relative overflow-hidden group">
      {/* Background soft glow accent */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mt-20" />
      <div className="absolute top-1/2 left-0 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -ml-20" />

      {/* HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 text-emerald-500 flex items-center justify-center font-black shadow-sm">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black text-[var(--text)] flex items-center gap-2">
                Haftalik Kirim & Chiqim Dinamikasi
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Recharts
                </span>
              </h3>
              <p className="text-xs text-[var(--text3)]">
                Ombordagi tovarlar kirimi va chiqimini kunbay taqqoslash, trendlar va zaxira oqimini kuzatish
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar controls */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* Filial selector */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setFilialFilter('all')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filialFilter === 'all'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Jami (2 ombor)
            </button>
            <button
              onClick={() => setFilialFilter('tepa')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filialFilter === 'tepa'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Tepa
            </button>
            <button
              onClick={() => setFilialFilter('kotta')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                filialFilter === 'kotta'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Kotta
            </button>
          </div>

          {/* Time range toggle */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setRangeMode('this_week')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                rangeMode === 'this_week'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Joriy Hafta</span>
            </button>
            <button
              onClick={() => setRangeMode('last_7_days')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                rangeMode === 'last_7_days'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              7 kun
            </button>
            <button
              onClick={() => setRangeMode('last_14_days')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                rangeMode === 'last_14_days'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              14 kun
            </button>
          </div>

          {/* Metric toggle (Quantity vs Summa) */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setMetricMode('quantity')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                metricMode === 'quantity'
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Miqdor bo'yicha (dona/juft)"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Dona</span>
            </button>
            <button
              onClick={() => setMetricMode('summa')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                metricMode === 'summa'
                  ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Qiymat ($) bo'yicha"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Summa ($)</span>
            </button>
          </div>

          {/* Chart Type selector */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setViewMode('grouped_bar')}
              className={cn(
                "p-1.5 rounded-lg transition-all cursor-pointer",
                viewMode === 'grouped_bar' ? "bg-indigo-600 text-white shadow-sm" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Ustunli taqqoslash"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('area_trend')}
              className={cn(
                "p-1.5 rounded-lg transition-all cursor-pointer",
                viewMode === 'area_trend' ? "bg-indigo-600 text-white shadow-sm" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Oqim trend chizig'i"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('net_flow')}
              className={cn(
                "p-1.5 rounded-lg transition-all cursor-pointer",
                viewMode === 'net_flow' ? "bg-indigo-600 text-white shadow-sm" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Sof zaxira balansi oqimi"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4 SUMMARY STATS BADGES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
        {/* Total Kirim */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-emerald-500/20 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Jami Kirim
            </span>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
              {summary.totalKirimOps} ta kirim
            </span>
          </div>
          <div>
            <div className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight">
              {summary.totalKirimQty.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-[var(--text3)]">dona</span>
            </div>
            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ${summary.totalKirimSum.toLocaleString()} qiymat
            </div>
          </div>
        </div>

        {/* Total Chiqim */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-rose-500/20 hover:border-rose-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              Jami Chiqim / Savdo
            </span>
            <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md">
              {summary.totalChiqimOps} ta chiqim
            </span>
          </div>
          <div>
            <div className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight">
              {summary.totalChiqimQty.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-[var(--text3)]">dona</span>
            </div>
            <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
              ${summary.totalChiqimSum.toLocaleString()} tushum
            </div>
          </div>
        </div>

        {/* Net Movement */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:border-blue-500/30 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              Sof Zaxira Farqi
            </span>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-md",
                summary.netQty >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              )}
            >
              {summary.netQty >= 0 ? "Zaxira o'sdi" : "Zaxira kamaydi"}
            </span>
          </div>
          <div>
            <div
              className={cn(
                "text-xl md:text-2xl font-black tracking-tight",
                summary.netQty >= 0 ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {summary.netQty >= 0 ? '+' : ''}
              {summary.netQty.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-[var(--text3)]">dona</span>
            </div>
            <div className="text-[11px] font-semibold text-[var(--text3)] mt-0.5">
              {summary.netSum >= 0 ? '+' : ''}${summary.netSum.toLocaleString()} sof balans
            </div>
          </div>
        </div>

        {/* Daily Average & Peak */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:border-indigo-500/30 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              O'rtacha / Eng Yuqori
            </span>
            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
              Faollik
            </span>
          </div>
          <div>
            <div className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight">
              {summary.avgDailyQty.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-[var(--text3)]">dona/kun</span>
            </div>
            <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 truncate" title={summary.maxActivityDay.label}>
              Eng faol: {summary.maxActivityDay.label}
            </div>
          </div>
        </div>
      </div>

      {/* RECHARTS CHART CONTAINER */}
      <div className="w-full h-[320px] md:h-[360px] relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'grouped_bar' ? (
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 15, left: -15, bottom: 5 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dx={-6}
                tickFormatter={(val) =>
                  metricMode === 'quantity'
                    ? val > 1000 ? `${(val / 1000).toFixed(0)}k` : val
                    : val > 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '16px', fontSize: '12px', fontWeight: 'bold' }}
                formatter={(value) => (
                  <span className="text-xs font-bold text-[var(--text)]">
                    {value === 'kirim' ? "Kirim (Kelgan)" : "Chiqim (Sotilgan/Yuborilgan)"}
                  </span>
                )}
              />
              <Bar
                dataKey="kirim"
                name="kirim"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                dataKey="chiqim"
                name="chiqim"
                fill="#f43f5e"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          ) : viewMode === 'area_trend' ? (
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 15, left: -15, bottom: 5 }}
            >
              <defs>
                <linearGradient id="kirimGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="chiqimGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dx={-6}
                tickFormatter={(val) =>
                  metricMode === 'quantity'
                    ? val > 1000 ? `${(val / 1000).toFixed(0)}k` : val
                    : val > 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '16px', fontSize: '12px', fontWeight: 'bold' }}
                formatter={(value) => (
                  <span className="text-xs font-bold text-[var(--text)]">
                    {value === 'kirim' ? "Kirim Oqimi" : "Chiqim Oqimi"}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="kirim"
                name="kirim"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#kirimGradient)"
                activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
              />
              <Area
                type="monotone"
                dataKey="chiqim"
                name="chiqim"
                stroke="#f43f5e"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#chiqimGradient)"
                activeDot={{ r: 6, strokeWidth: 0, fill: '#f43f5e' }}
              />
            </AreaChart>
          ) : (
            // Net flow bar chart
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 15, left: -15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                stroke="var(--text3)"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                dx={-6}
                tickFormatter={(val) =>
                  metricMode === 'quantity'
                    ? val > 1000 ? `${(val / 1000).toFixed(0)}k` : val
                    : val > 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--text3)" strokeWidth={1.5} />
              <Bar dataKey="net" name="Sof Harakat" maxBarSize={42} radius={[6, 6, 6, 6]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.net >= 0 ? '#10b981' : '#f43f5e'}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* DAILY COMPACT TIMELINE PILLS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-[var(--border)] relative z-10">
        {chartData.map((day, idx) => (
          <div
            key={idx}
            className={cn(
              "p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5",
              day.isToday
                ? "bg-blue-500/10 border-blue-500/40 shadow-sm"
                : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--text3)]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[var(--text)] flex items-center gap-1">
                {day.dayShort}
                {day.isToday && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                )}
              </span>
              <span className="text-[10px] text-[var(--text3)] font-semibold">{day.date.slice(8, 10)}-kun</span>
            </div>

            <div className="space-y-0.5 text-[11px] font-bold">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span className="text-[10px] opacity-75">Kirim:</span>
                <span>{metricMode === 'quantity' ? day.kirimQty.toLocaleString() : `$${day.kirimSum.toLocaleString()}`}</span>
              </div>
              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                <span className="text-[10px] opacity-75">Chiqim:</span>
                <span>{metricMode === 'quantity' ? day.chiqimQty.toLocaleString() : `$${day.chiqimSum.toLocaleString()}`}</span>
              </div>
            </div>

            <div className="pt-1 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-extrabold">
              <span className="text-[var(--text3)]">Saldo:</span>
              <span className={day.netQty >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {day.netQty >= 0 ? '+' : ''}
                {metricMode === 'quantity' ? day.netQty.toLocaleString() : `$${day.netSum.toLocaleString()}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
