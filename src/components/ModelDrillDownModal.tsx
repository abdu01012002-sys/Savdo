import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { X, Package, Calendar, Users, Layers, DollarSign, Download, ArrowUpRight, TrendingUp, Building2, Store, Sparkles, Flame, CheckCircle2 } from 'lucide-react';
import { getCat, getGender, cn } from '../lib/utils';
import { exportToExcel } from '../lib/exportUtils';

interface Props {
  modelName: string;
  onClose: () => void;
}

export function ModelDrillDownModal({ modelName, onClose }: Props) {
  const { db } = useDb();
  const [activeTab, setActiveTab] = useState<'sizes' | 'buyers' | 'history'>('sizes');

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const details = useMemo(() => {
    // 1. Stock Breakdown per size and warehouse
    const qoldiqTepa = (db.tepa?.stock?.[modelName] || {}) as Record<string, number>;
    const qoldiqKotta = (db.kotta?.stock?.[modelName] || {}) as Record<string, number>;
    
    // Merge sizes for comprehensive multi-warehouse display
    const mergedSizes: Record<string, { tepa: number, kotta: number, jami: number }> = {};
    const addSize = (size: string, count: number, loc: 'tepa' | 'kotta') => {
      const num = Number(count || 0);
      if (!mergedSizes[size]) mergedSizes[size] = { tepa: 0, kotta: 0, jami: 0 };
      mergedSizes[size][loc] += num;
      mergedSizes[size].jami += num;
    };

    if (typeof qoldiqTepa === 'number') {
      addSize('Standart', qoldiqTepa, 'tepa');
    } else if (typeof qoldiqTepa === 'object') {
      Object.entries(qoldiqTepa).forEach(([size, count]) => addSize(size, count, 'tepa'));
    }

    if (typeof qoldiqKotta === 'number') {
      addSize('Standart', qoldiqKotta, 'kotta');
    } else if (typeof qoldiqKotta === 'object') {
      Object.entries(qoldiqKotta).forEach(([size, count]) => addSize(size, count, 'kotta'));
    }

    // Sort sizes numerically or alphabetically
    const sortedSizes = Object.entries(mergedSizes).sort((a, b) => {
      const numA = parseInt(a[0]);
      const numB = parseInt(b[0]);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a[0].localeCompare(b[0]);
    });

    const tepaTotalStock = Object.values(mergedSizes).reduce((acc, s) => acc + s.tepa, 0);
    const kottaTotalStock = Object.values(mergedSizes).reduce((acc, s) => acc + s.kotta, 0);
    const totalCurrentStock = tepaTotalStock + kottaTotalStock;

    // 2. Sales History (transactions)
    const tepaTxs = (db.tepa?.transactions || []).map(t => ({ ...t, omborLocation: 'tepa' as const }));
    const kottaTxs = (db.kotta?.transactions || []).map(t => ({ ...t, omborLocation: 'kotta' as const }));
    const allTxs = [...tepaTxs, ...kottaTxs];
    const sales = allTxs
      .filter(t => t.model === modelName && t.amal === 'chiqim')
      .sort((a, b) => new Date(b.sana || '').getTime() - new Date(a.sana || '').getTime());

    const totalSold = sales.reduce((acc, t) => acc + Number(t.soni || 0), 0);
    
    // Revenue calculations
    const unitPrice = db.prices?.[modelName]?.sale ? Number(db.prices[modelName].sale) : 0;
    const totalRevenue = sales.reduce((acc, t) => {
      let sum = Number(t.summa || 0);
      if (sum === 0 && unitPrice > 0) sum = unitPrice * Number(t.soni || 0);
      return acc + sum;
    }, 0);

    // 3. Client Breakdown (Qaysi mijozlarga necha juft ketgani)
    const clientBreakdownMap: Record<string, { totalQty: number, totalSum: number, lastDate: string, txCount: number }> = {};
    sales.forEach(t => {
      const client = (t.kimdan || t.izoh || 'Noma\'lum xaridor').trim();
      const qty = Number(t.soni || 0);
      let sum = Number(t.summa || 0);
      if (sum === 0 && unitPrice > 0) sum = unitPrice * qty;

      if (!clientBreakdownMap[client]) {
        clientBreakdownMap[client] = { totalQty: 0, totalSum: 0, lastDate: t.sana || '', txCount: 0 };
      }
      clientBreakdownMap[client].totalQty += qty;
      clientBreakdownMap[client].totalSum += sum;
      clientBreakdownMap[client].txCount++;
      if (t.sana && (!clientBreakdownMap[client].lastDate || t.sana > clientBreakdownMap[client].lastDate)) {
        clientBreakdownMap[client].lastDate = t.sana;
      }
    });

    const clientList = Object.entries(clientBreakdownMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalQty - a.totalQty);

    const topClient = clientList[0] || null;

    return {
      sortedSizes,
      tepaTotalStock,
      kottaTotalStock,
      totalCurrentStock,
      sales,
      totalSold,
      totalRevenue,
      unitPrice,
      clientList,
      topClient,
      cat: getCat(modelName),
      gender: getGender(modelName)
    };
  }, [db, modelName]);

  const exportModelDetails = () => {
    // 1. Sizes breakdown sheet
    const sizeHeaders = ['O\'lcham (Razmer)', 'Tepa Ombor (juft)', 'Kotta Ombor (juft)', 'Jami Qoldiq (juft)'];
    const sizeRows = details.sortedSizes.map(([size, cnt]) => [size, cnt.tepa, cnt.kotta, cnt.jami]);

    // 2. Client sales sheet
    const clientHeaders = ['Mijoz Nomi', 'Sotib Olingan Juft', 'Jami Summasi ($)', 'Xaridlar Soni', 'Oxirgi Xarid Sanasi'];
    const clientRows = details.clientList.map(c => [c.name, c.totalQty, c.totalSum.toFixed(2), c.txCount, c.lastDate]);

    // 3. Transactions history sheet
    const txHeaders = ['Sana', 'Ombor', 'Mijoz / Izoh', 'Olingan Juft', 'Summasi ($)'];
    const txRows = details.sales.map(t => [
      t.sana,
      t.omborLocation === 'tepa' ? 'Tepa Ombor' : 'Kotta Ombor',
      t.kimdan || t.izoh || 'Noma\'lum',
      t.soni,
      t.summa || (details.unitPrice * Number(t.soni || 0))
    ]);

    exportToExcel(
      [['--- O\'LCHAMLAR BO\'YICHA QOLDIQ ---'], sizeHeaders, ...sizeRows, [], ['--- MIJOZLAR KESIMIDA SAVDO ---'], clientHeaders, ...clientRows, [], ['--- BARCHA CHIQIMLAR TARIXI ---'], txHeaders, ...txRows],
      `Model_Tahlili_${modelName}`,
      'Model_Tahlili'
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] text-[var(--text)] w-full max-w-4xl rounded-t-[28px] sm:rounded-3xl border-t sm:border border-[var(--border)] flex flex-col shadow-2xl relative mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 max-h-[92vh] sm:max-h-[85vh] overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto my-2 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Package size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-[var(--text)] tracking-tight">👞 {modelName}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/15 text-blue-600 dark:text-blue-400 uppercase">
                  {details.cat}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 uppercase">
                  {details.gender}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
                Modelning o'lchamlar, omborlar va mijozlar bo'yicha to'liq drill-down tahlili
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={exportModelDetails}
              className="px-3.5 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Excelga yuklab olish"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2.5 bg-[var(--bg2)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Model KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 sm:px-6 bg-[var(--bg)] border-b border-[var(--border)]">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Sotilgan</span>
            <span className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5 block">{details.totalSold.toLocaleString()} juft</span>
            <span className="text-[10px] font-semibold text-[var(--text3)]">{details.sales.length} marta chiqim</span>
          </div>

          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Aylanma ($)</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">${details.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            <span className="text-[10px] font-semibold text-[var(--text3)]">Savdo tushumi</span>
          </div>

          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Ombordagi Qoldiq</span>
            <span className={cn("text-base sm:text-lg font-black mt-0.5 block", details.totalCurrentStock === 0 ? "text-zinc-500" : details.totalCurrentStock < 50 ? "text-rose-500" : "text-emerald-500")}>
              {details.totalCurrentStock.toLocaleString()} juft
            </span>
            <span className="text-[10px] font-semibold text-[var(--text3)]">Tepa: {details.tepaTotalStock} | Kotta: {details.kottaTotalStock}</span>
          </div>

          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Asosiy Xaridor</span>
            <span className="text-sm font-black text-[var(--text)] mt-0.5 block truncate">
              {details.topClient ? details.topClient.name : '—'}
            </span>
            <span className="text-[10px] font-semibold text-blue-500">
              {details.topClient ? `${details.topClient.totalQty} juft xarid` : 'Xarid yo\'q'}
            </span>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-[var(--border)] bg-[var(--bg2)]">
          <button
            onClick={() => setActiveTab('sizes')}
            className={cn(
              "px-4 py-2.5 rounded-t-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2",
              activeTab === 'sizes'
                ? "border-blue-600 text-blue-600 bg-blue-500/10"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <Layers size={14} />
            <span>O'lchamlar & Omborlar Qoldig'i</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[var(--bg)] border border-[var(--border)] font-extrabold">
              {details.sortedSizes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('buyers')}
            className={cn(
              "px-4 py-2.5 rounded-t-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2",
              activeTab === 'buyers'
                ? "border-blue-600 text-blue-600 bg-blue-500/10"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <Users size={14} />
            <span>Mijozlar Kesimi (Kim qancha oldi)</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[var(--bg)] border border-[var(--border)] font-extrabold">
              {details.clientList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-4 py-2.5 rounded-t-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2",
              activeTab === 'history'
                ? "border-blue-600 text-blue-600 bg-blue-500/10"
                : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <Calendar size={14} />
            <span>Barcha Chiqimlar Tarixi</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-[var(--bg)] border border-[var(--border)] font-extrabold">
              {details.sales.length}
            </span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[60vh] flex flex-col gap-4 bg-[var(--bg)]">

          {/* TAB 1: O'LCHAMLAR VA OMBORLAR BO'YICHA QOLDIQ */}
          {activeTab === 'sizes' && (
            <div className="flex flex-col gap-4">
              
              {/* Warehouse summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center font-black">
                      <Store size={20} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-[var(--text)]">Tepa Ombor Qoldig'i</h4>
                      <p className="text-[11px] font-semibold text-[var(--text3)]">Do'kon/Ko'rgazma zaxirasi</p>
                    </div>
                  </div>
                  <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {details.tepaTotalStock} <span className="text-xs font-bold text-[var(--text3)]">j.</span>
                  </span>
                </div>

                <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 flex items-center justify-center font-black">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-[var(--text)]">Kotta Ombor Qoldig'i</h4>
                      <p className="text-[11px] font-semibold text-[var(--text3)]">Asosiy zavod zaxirasi</p>
                    </div>
                  </div>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                    {details.kottaTotalStock} <span className="text-xs font-bold text-[var(--text3)]">j.</span>
                  </span>
                </div>
              </div>

              {/* Sizes Detailed Grid */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text3)]">
                  Har bir o'lcham (Razmer) kesimida ombor qoldig'i
                </h3>

                {details.sortedSizes.length === 0 ? (
                  <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text3)] font-semibold">
                    Ushbu model hozirda omborlarda mavjud emas (0 juft).
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                    {details.sortedSizes.map(([size, count]) => {
                      const isLow = count.jami > 0 && count.jami <= 10;
                      const isZero = count.jami === 0;

                      return (
                        <div 
                          key={size} 
                          className={cn(
                            "bg-[var(--bg2)] border rounded-2xl p-3.5 flex flex-col items-center justify-between text-center transition-all shadow-xs",
                            isZero ? "border-[var(--border)] opacity-60" : isLow ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--border)] hover:border-blue-500"
                          )}
                        >
                          <div className="w-10 h-10 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center font-black text-base text-[var(--text)] shadow-xs">
                            {size}
                          </div>

                          <div className="my-2.5">
                            <span className={cn("text-base font-black block", isZero ? "text-zinc-500" : isLow ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400")}>
                              {count.jami} <span className="text-[11px] font-bold text-[var(--text3)]">j.</span>
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text3)] block">
                              Jami Qoldiq
                            </span>
                          </div>

                          <div className="w-full pt-2 border-t border-[var(--border)] text-[10px] font-semibold text-[var(--text3)] flex justify-between">
                            <span>T: <b className="text-[var(--text)]">{count.tepa}</b></span>
                            <span>K: <b className="text-[var(--text)]">{count.kotta}</b></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: MIJOZLAR KESIMI (KIM NECHA JUFT OLDI) */}
          {activeTab === 'buyers' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text3)]">
                  Ushbu modelni xarid qilgan mijozlar reytingi
                </h3>
                <span className="text-[11px] font-bold text-[var(--text3)]">
                  Jami {details.clientList.length} ta xaridor
                </span>
              </div>

              {details.clientList.length === 0 ? (
                <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text3)] font-semibold">
                  Ushbu model bo'yicha hali mijozlar xaridi qayd etilmagan.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg2)]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] text-[11px] font-extrabold uppercase">
                      <tr>
                        <th className="p-3 text-center w-12">#</th>
                        <th className="p-3">Mijoz Nomi</th>
                        <th className="p-3 text-right">Olingan Juft</th>
                        <th className="p-3 text-right">Jami Summa ($)</th>
                        <th className="p-3 text-center">Xaridlar</th>
                        <th className="p-3 text-right">Oxirgi Xarid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-medium">
                      {details.clientList.map((client, idx) => {
                        const pctOfTotal = Math.round((client.totalQty / (details.totalSold || 1)) * 100);

                        return (
                          <tr key={client.name} className="hover:bg-[var(--bg)] transition-colors">
                            <td className="p-3 text-center font-black text-sm text-[var(--text3)]">
                              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-extrabold text-sm text-[var(--text)] flex items-center gap-1.5">
                                  {client.name}
                                  {idx === 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/15 text-amber-600">
                                      TOP Xaridor
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] font-bold text-[var(--text3)]">
                                  Model savdosidagi ulushi: {pctOfTotal}%
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-black text-sm text-blue-600 dark:text-blue-400 tabular-nums">
                              {client.totalQty.toLocaleString()} <span className="text-[10px] font-bold text-[var(--text3)]">j.</span>
                            </td>
                            <td className="p-3 text-right font-black text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                              ${client.totalSum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                            </td>
                            <td className="p-3 text-center font-extrabold text-[var(--text)]">
                              {client.txCount} marta
                            </td>
                            <td className="p-3 text-right font-semibold text-[var(--text3)]">
                              {client.lastDate ? client.lastDate.substring(0, 10) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BARCHA CHIQIMLAR TARIXI */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text3)]">
                  Model bo'yicha barcha chiqim operatsiyalari
                </h3>
                <span className="text-[11px] font-bold text-[var(--text3)]">
                  Jami {details.sales.length} ta operatsiya
                </span>
              </div>

              {details.sales.length === 0 ? (
                <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text3)] font-semibold">
                  Bu model bo'yicha chiqim operatsiyalari topilmadi.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg2)]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] text-[11px] font-extrabold uppercase">
                      <tr>
                        <th className="p-3">Sana</th>
                        <th className="p-3">Ombor</th>
                        <th className="p-3">Mijoz / Izoh</th>
                        <th className="p-3 text-right">Olingan Juft</th>
                        <th className="p-3 text-right">Summa ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-medium">
                      {details.sales.map((t, idx) => {
                        const itemSum = Number(t.summa || 0) > 0 
                          ? Number(t.summa) 
                          : details.unitPrice * Number(t.soni || 0);

                        return (
                          <tr key={idx} className="hover:bg-[var(--bg)] transition-colors">
                            <td className="p-3 font-semibold text-[var(--text3)] whitespace-nowrap">
                              {t.sana ? t.sana.substring(0, 10) : '—'}
                            </td>
                            <td className="p-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-black uppercase",
                                t.omborLocation === 'tepa' ? "bg-blue-500/10 text-blue-600" : "bg-indigo-500/10 text-indigo-600"
                              )}>
                                {t.omborLocation === 'tepa' ? 'Tepa' : 'Kotta'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="font-extrabold text-[var(--text)]">{t.kimdan || 'Noma\'lum xaridor'}</div>
                              {t.izoh && <div className="text-[10px] text-[var(--text3)] mt-0.5">{t.izoh}</div>}
                            </td>
                            <td className="p-3 text-right font-black text-sm text-blue-600 dark:text-blue-400 tabular-nums">
                              {t.soni} <span className="text-[10px] font-bold text-[var(--text3)]">j.</span>
                            </td>
                            <td className="p-3 text-right font-black text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                              ${itemSum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text3)]">
            👞 {modelName} — Jami {details.totalSold} juft sotilgan, {details.totalCurrentStock} juft omborda
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
}
