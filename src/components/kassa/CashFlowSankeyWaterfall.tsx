import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  TrendingUp, 
  ArrowRight, 
  DollarSign, 
  PieChart as PieIcon, 
  BarChart3, 
  Layers, 
  Sparkles,
  Wallet,
  Building,
  CheckCircle2,
  Info
} from 'lucide-react';
import { useDb } from '../../context/DbContext';
import { cn } from '../../lib/utils';
import { KassaHarakati, KassaTuri, XarajatKategoriya } from '../../types';

interface CashFlowSankeyWaterfallProps {
  valyutaKursi: number;
  kassaHarakatlari?: KassaHarakati[];
  kassaBalansi?: any;
  pnlData?: any;
  dateRangeLabel?: string;
  isDateInFilter?: (sana: string) => boolean;
}

export const CashFlowSankeyWaterfall: React.FC<CashFlowSankeyWaterfallProps> = ({
  valyutaKursi,
  kassaHarakatlari: propKassaHarakatlari,
  dateRangeLabel = "Tanlangan oraliq",
  isDateInFilter = () => true
}) => {
  const { db } = useDb();
  const [viewMode, setViewMode] = useState<'waterfall' | 'sankey'>('sankey');
  const kassaHarakatlari = propKassaHarakatlari || db.kassaHarakatlari || [];

  // Pul oqimi manbalari va taqsimoti tahlili
  const flowData = useMemo(() => {
    // 1. Manbalar: Kotta ombor, Tepa ombor, Nasiyalar
    const tepaSales = (db.tepa?.transactions || [])
      .filter(t => t.amal === 'chiqim' && isDateInFilter(t.sana))
      .reduce((acc, t) => acc + Number(t.summa || 0), 0);

    const kottaSales = (db.kotta?.transactions || [])
      .filter(t => t.amal === 'chiqim' && isDateInFilter(t.sana))
      .reduce((acc, t) => acc + Number(t.summa || 0), 0);

    // Kassa harakatlaridagi to'g'ridan-to'g'ri kirimlar
    let debtCollection = 0;
    const walletInflows: Record<KassaTuri, number> = {
      naqd_uzs: 0,
      naqd_usd: 0,
      karta_uzs: 0,
      bank_uzs: 0
    };

    // Xarajatlar toifalari
    const expenseBreakdown: Record<string, number> = {
      cogs: 0, // Tannarx
      ish_haqi: 0,
      ijara: 0,
      postavshik: 0,
      transport: 0,
      kommunal: 0,
      marketing: 0,
      boshqa: 0
    };

    // Mahsulotlar tannarxi (COGS)
    let omborCogs = 0;
    const allSales = [
      ...(db.tepa?.transactions || []),
      ...(db.kotta?.transactions || [])
    ].filter(t => t.amal === 'chiqim' && isDateInFilter(t.sana));

    allSales.forEach(t => {
      const qty = Number(t.soni || 0);
      const costPerPair = db.prices?.[t.model]?.cost || 0;
      omborCogs += qty * costPerPair;
    });

    // Kassa jurnali harakatlarini ajratish
    kassaHarakatlari.forEach(h => {
      if (!isDateInFilter(h.sana)) return;

      const sumUzs = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || valyutaKursi) : h.summa);

      if (h.tur === 'kirim') {
        walletInflows[h.kassaTuri] = (walletInflows[h.kassaTuri] || 0) + sumUzs;

        if (h.kategoriya === 'qarz_tolovi' || (h.izoh && h.izoh.toLowerCase().includes('nasiya'))) {
          debtCollection += sumUzs;
        }
      } else if (h.tur === 'chiqim') {
        const cat = h.kategoriya;
        if (expenseBreakdown[cat] !== undefined) {
          expenseBreakdown[cat] += sumUzs;
        } else {
          expenseBreakdown.boshqa += sumUzs;
        }
      }
    });

    const totalSalesRev = tepaSales + kottaSales;
    const totalKassaInflow = walletInflows.naqd_uzs + walletInflows.naqd_usd + walletInflows.karta_uzs + walletInflows.bank_uzs;
    expenseBreakdown.cogs = omborCogs;

    // Operatsion xarajatlar jami (COGS dan tashqari)
    const opexTotal = Object.entries(expenseBreakdown)
      .filter(([k]) => k !== 'cogs')
      .reduce((acc, [, v]) => acc + v, 0);

    const totalRevenue = totalSalesRev;
    const grossProfit = totalRevenue - omborCogs;
    const netProfit = grossProfit - opexTotal;

    const expensesState = {
      cogs: omborCogs,
      ish_haqi: expenseBreakdown.ish_haqi || 0,
      ijara: expenseBreakdown.ijara || 0,
      postavshik: expenseBreakdown.postavshik || 0,
      transport: expenseBreakdown.transport || 0,
      kommunal: expenseBreakdown.kommunal || 0,
      marketing: expenseBreakdown.marketing || 0,
      boshqa: expenseBreakdown.boshqa || 0,
      totalOpex: opexTotal,
      totalWithCogs: omborCogs + opexTotal
    };

    return {
      sources: {
        kottaSales,
        tepaSales,
        debtCollection,
        total: Math.max(totalSalesRev, totalKassaInflow)
      },
      wallets: {
        naqd_uzs: walletInflows.naqd_uzs,
        naqd_usd: walletInflows.naqd_usd,
        karta_uzs: walletInflows.karta_uzs,
        bank_uzs: walletInflows.bank_uzs,
        total: Math.max(totalKassaInflow, 0)
      },
      expenses: expensesState,
      summary: {
        totalRevenue,
        totalCogs: omborCogs,
        grossProfit,
        opexTotal,
        netProfit,
        netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
      }
    };
  }, [db.tepa, db.kotta, db.prices, kassaHarakatlari, valyutaKursi, isDateInFilter]);

  // Waterfall Chart Ma'lumotlari
  const waterfallData = useMemo(() => {
    let runningTotal = flowData.summary.totalRevenue;

    return [
      {
        name: "Yalpi Tushum",
        type: 'start',
        amount: flowData.summary.totalRevenue,
        displayAmount: `+${flowData.summary.totalRevenue.toLocaleString()}`,
        fill: "#3b82f6"
      },
      {
        name: "Xomashyo/Tannarx",
        type: 'subtraction',
        amount: -flowData.summary.totalCogs,
        displayAmount: `-${flowData.summary.totalCogs.toLocaleString()}`,
        fill: "#f59e0b"
      },
      {
        name: "Yalpi Foyda",
        type: 'intermediate',
        amount: flowData.summary.grossProfit,
        displayAmount: `${flowData.summary.grossProfit.toLocaleString()}`,
        fill: "#6366f1"
      },
      {
        name: "Ish Haqi",
        type: 'subtraction',
        amount: -flowData.expenses.ish_haqi,
        displayAmount: `-${flowData.expenses.ish_haqi.toLocaleString()}`,
        fill: "#ef4444"
      },
      {
        name: "Do'kon Ijarasi",
        type: 'subtraction',
        amount: -flowData.expenses.ijara,
        displayAmount: `-${flowData.expenses.ijara.toLocaleString()}`,
        fill: "#f43f5e"
      },
      {
        name: "Fabrika / Xomashyo",
        type: 'subtraction',
        amount: -flowData.expenses.postavshik,
        displayAmount: `-${flowData.expenses.postavshik.toLocaleString()}`,
        fill: "#ea580c"
      },
      {
        name: "Transport & Soliq",
        type: 'subtraction',
        amount: -(flowData.expenses.transport + flowData.expenses.kommunal + flowData.expenses.marketing + flowData.expenses.boshqa),
        displayAmount: `-${(flowData.expenses.transport + flowData.expenses.kommunal + flowData.expenses.marketing + flowData.expenses.boshqa).toLocaleString()}`,
        fill: "#ec4899"
      },
      {
        name: "SOF FOYDA",
        type: 'final',
        amount: flowData.summary.netProfit,
        displayAmount: `${flowData.summary.netProfit.toLocaleString()}`,
        fill: flowData.summary.netProfit >= 0 ? "#10b981" : "#dc2626"
      }
    ];
  }, [flowData]);

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 md:p-6 shadow-sm space-y-6">
      
      {/* HEADER & TOGGLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)] tracking-tight">
                Pul Oqimi Zanjiri (Sankey & Waterfall Flow)
              </h3>
              <p className="text-xs text-[var(--text3)]">
                Tushum manbalari ➔ Kassa portfellari ➔ Xarajatlar ➔ Sof foyda taqsimoti ({dateRangeLabel})
              </p>
            </div>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center p-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setViewMode('sankey')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
              viewMode === 'sankey'
                ? "bg-purple-600 text-white shadow-sm"
                : "text-[var(--text2)] hover:text-[var(--text)]"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sankey Diagrammasi</span>
          </button>

          <button
            onClick={() => setViewMode('waterfall')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
              viewMode === 'waterfall'
                ? "bg-purple-600 text-white shadow-sm"
                : "text-[var(--text2)] hover:text-[var(--text)]"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Waterfall P&L Pog'onasi</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: SANKEY FLOW DIAGRAM */}
      {viewMode === 'sankey' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            
            {/* COLUMN 1: MANBALAR (SOURCES) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-500">
                  1. Tushum Manbalari
                </span>
                <span className="text-[10px] font-bold text-[var(--text3)]">
                  {flowData.summary.totalRevenue.toLocaleString()} UZS
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                  <div className="text-[11px] font-bold text-blue-500">Kotta Ombor Savdosi</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.sources.kottaSales.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1 flex items-center justify-between">
                    <span>Ulgurji savdolar</span>
                    <span className="font-bold">{flowData.sources.total > 0 ? ((flowData.sources.kottaSales / flowData.sources.total) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                  <div className="text-[11px] font-bold text-indigo-500">Tepa Ombor Savdosi</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.sources.tepaSales.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1 flex items-center justify-between">
                    <span>Chakana & do'kon</span>
                    <span className="font-bold">{flowData.sources.total > 0 ? ((flowData.sources.tepaSales / flowData.sources.total) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[11px] font-bold text-emerald-500">Nasiyalar Qaytarilishi</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.sources.debtCollection.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1 flex items-center justify-between">
                    <span>Mijoz to'lovlari</span>
                    <span className="font-bold">{flowData.sources.total > 0 ? ((flowData.sources.debtCollection / flowData.sources.total) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: KASSA HAMYONLARI (WALLETS) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-500">
                  2. Kassa Portfellari
                </span>
                <span className="text-[10px] font-bold text-[var(--text3)]">
                  Qabul qilingan
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Naqd So'm (UZS)</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.wallets.naqd_uzs.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Savdo nuqtasi kassasi</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                  <div className="text-[11px] font-bold text-blue-500">Naqd Valyuta (USD)</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.wallets.naqd_usd.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">
                    ≈ ${Math.round(flowData.wallets.naqd_usd / valyutaKursi).toLocaleString()}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                  <div className="text-[11px] font-bold text-purple-500">Karta / Humo / Uzcard</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.wallets.karta_uzs.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Terminal oqimi</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                  <div className="text-[11px] font-bold text-cyan-500">Bank Hisobi</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.wallets.bank_uzs.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Perechisleniye</div>
                </div>
              </div>
            </div>

            {/* COLUMN 3: XARAJATLAR & CHIQIMLAR (EXPENSES & COGS) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <span className="text-[11px] font-black uppercase tracking-wider text-rose-500">
                  3. Xarajatlar & Tannarx
                </span>
                <span className="text-[10px] font-bold text-[var(--text3)]">
                  -{flowData.expenses.totalWithCogs.toLocaleString()} UZS
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Xomashyo & Tannarx (COGS)</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.summary.totalCogs.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Poyabzal ishlab chiqarish</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[11px] font-bold text-rose-500">Ish Haqi & Oyliklar</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.expenses.ish_haqi.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Xodimlar maoshi</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-pink-500/10 border border-pink-500/20">
                  <div className="text-[11px] font-bold text-pink-500">Do'kon & Ombor Ijarasi</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {flowData.expenses.ijara.toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Oylik arenda</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                  <div className="text-[11px] font-bold text-orange-500">Logistika & Boshqa</div>
                  <div className="text-sm font-black text-[var(--text)] font-mono mt-0.5">
                    {(flowData.expenses.transport + flowData.expenses.kommunal + flowData.expenses.postavshik + flowData.expenses.boshqa).toLocaleString()} UZS
                  </div>
                  <div className="text-[10px] text-[var(--text3)] mt-1">Transport, kommunal, soliq</div>
                </div>
              </div>
            </div>

            {/* COLUMN 4: YAKUNIY SOF FOYDA (NET PROFIT) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-500">
                  4. Yakuniy Sof Foyda
                </span>
                <span className="text-[10px] font-bold text-emerald-500">
                  {flowData.summary.netMargin.toFixed(1)}% Marja
                </span>
              </div>

              <div className="h-full flex flex-col justify-between">
                <div className={cn(
                  "p-5 rounded-3xl border shadow-lg flex flex-col justify-between h-[280px]",
                  flowData.summary.netProfit >= 0
                    ? "bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-teal-500/20 border-emerald-500/40 text-emerald-100"
                    : "bg-gradient-to-br from-rose-500/20 via-rose-600/10 to-red-500/20 border-rose-500/40 text-rose-100"
                )}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest opacity-80">
                        SOF RENTABELLIK
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black font-mono tracking-tight mt-2 text-white">
                      {flowData.summary.netProfit.toLocaleString()} <span className="text-sm font-bold opacity-80">UZS</span>
                    </div>
                    <div className="text-xs text-white/80 mt-1">
                      ≈ ${Math.round(flowData.summary.netProfit / valyutaKursi).toLocaleString()} USD
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-white/10 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="opacity-75">Yalpi Foyda:</span>
                      <span className="font-bold text-white font-mono">{flowData.summary.grossProfit.toLocaleString()} UZS</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="opacity-75">Operatsion Xarajat:</span>
                      <span className="font-bold text-rose-300 font-mono">-{flowData.expenses.totalOpex.toLocaleString()} UZS</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/10 font-bold">
                      <span className="opacity-90">Sof Marja Nisbati:</span>
                      <span className="text-emerald-300">{flowData.summary.netMargin.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* VIEW 2: WATERFALL CHART */}
      {viewMode === 'waterfall' && (
        <div className="space-y-4">
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text3)" 
                  fontSize={11} 
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  stroke="var(--text3)" 
                  fontSize={11} 
                  tickFormatter={(val) => {
                    const abs = Math.abs(val);
                    if (abs >= 1000000) return `${(val / 1000000).toFixed(0)}M`;
                    if (abs >= 1000) return `${(val / 1000).toFixed(0)}K`;
                    return `${val}`;
                  }} 
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-3 shadow-xl text-xs font-bold space-y-1">
                        <div className="text-[var(--text3)] uppercase text-[10px]">{item.name}</div>
                        <div className="text-sm font-black font-mono text-[var(--text)]">
                          {item.displayAmount} UZS
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-[10px] font-bold text-blue-500 uppercase">Yalpi Tushum</span>
              <div className="font-mono font-black text-sm text-[var(--text)]">
                {flowData.summary.totalRevenue.toLocaleString()} UZS
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] font-bold text-amber-500 uppercase">Tannarx (COGS)</span>
              <div className="font-mono font-black text-sm text-[var(--text)]">
                {flowData.summary.totalCogs.toLocaleString()} UZS
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] font-bold text-rose-500 uppercase">Operatsion OpEx</span>
              <div className="font-mono font-black text-sm text-[var(--text)]">
                {flowData.expenses.totalOpex.toLocaleString()} UZS
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Sof Qolgan Foyda</span>
              <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                {flowData.summary.netProfit.toLocaleString()} UZS
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
