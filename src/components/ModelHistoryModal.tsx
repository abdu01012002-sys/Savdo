import React, { useState, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { Transaction, WarehouseName } from '../types';
import { formatCompact, formatUzs, cn, compareTxLatestFirst } from '../lib/utils';
import { exportToExcel } from '../lib/exportUtils';
import { 
  X, 
  History, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  RotateCcw, 
  Search, 
  Download, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  User, 
  Calendar, 
  Clock, 
  Layers,
  Filter,
  Archive,
  ArchiveRestore
} from 'lucide-react';
import { toast } from 'sonner';

interface ModelHistoryModalProps {
  model: string | null;
  isOpen: boolean;
  onClose: () => void;
  defaultWarehouse?: WarehouseName;
}

type AmalFilter = 'all' | 'kirim' | 'chiqim' | 'otkazma' | 'other';
type WarehouseFilter = 'all' | 'tepa' | 'kotta' | 'sort2';

export const ModelHistoryModal: React.FC<ModelHistoryModalProps> = ({
  model,
  isOpen,
  onClose,
  defaultWarehouse
}) => {
  const { db, currentOmbor, toggleArchiveModel, isModelArchived } = useDb();

  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>(defaultWarehouse || 'all');
  const [amalFilter, setAmalFilter] = useState<AmalFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(50);

  // Sync warehouse filter when modal opens
  React.useEffect(() => {
    if (defaultWarehouse) {
      setWarehouseFilter(defaultWarehouse);
    }
  }, [defaultWarehouse, isOpen]);

  // Reset pagination on filter change
  React.useEffect(() => {
    setVisibleLimit(50);
  }, [warehouseFilter, amalFilter, searchTerm]);

  // Current Stock Stats for the model
  const stockStats = useMemo(() => {
    if (!model) return { tepa: 0, kotta: 0, sort2: 0, total: 0, sizes: {} as Record<string, number> };
    
    const tepaSizes = db.tepa?.stock?.[model] || {};
    const kottaSizes = db.kotta?.stock?.[model] || {};
    const sort2Sizes = db.sort2?.stock?.[model] || {};

    const tepa = Object.values(tepaSizes).reduce((a, b) => a + Number(b || 0), 0);
    const kotta = Object.values(kottaSizes).reduce((a, b) => a + Number(b || 0), 0);
    const sort2 = Object.values(sort2Sizes).reduce((a, b) => a + Number(b || 0), 0);

    const mergedSizes: Record<string, number> = {};
    const targetSizes = warehouseFilter === 'tepa' ? tepaSizes :
                        warehouseFilter === 'kotta' ? kottaSizes :
                        warehouseFilter === 'sort2' ? sort2Sizes : null;

    if (targetSizes) {
      Object.entries(targetSizes).forEach(([sz, qty]) => {
        if (Number(qty) > 0) mergedSizes[sz] = Number(qty);
      });
    } else {
      [tepaSizes, kottaSizes, sort2Sizes].forEach(sObj => {
        Object.entries(sObj).forEach(([sz, qty]) => {
          if (Number(qty) > 0) {
            mergedSizes[sz] = (mergedSizes[sz] || 0) + Number(qty);
          }
        });
      });
    }

    return {
      tepa,
      kotta,
      sort2,
      total: tepa + kotta + sort2,
      sizes: mergedSizes
    };
  }, [db, model, warehouseFilter]);

  // Aggregate All Transactions for this model
  const allModelTransactions = useMemo(() => {
    if (!model) return [];

    const normModel = model.trim().toLowerCase();
    const list: (Transaction & { warehouseSource: WarehouseName })[] = [];

    // Helper to push transactions
    const addFromWarehouse = (wKey: WarehouseName) => {
      const txs = db[wKey]?.transactions || [];
      for (let i = 0; i < txs.length; i++) {
        const t = txs[i];
        if (t.model && t.model.trim().toLowerCase() === normModel) {
          list.push({
            ...t,
            warehouseSource: wKey
          });
        }
      }
    };

    if (warehouseFilter === 'all') {
      addFromWarehouse('tepa');
      addFromWarehouse('kotta');
      addFromWarehouse('sort2');
    } else {
      addFromWarehouse(warehouseFilter);
    }

    // Deduplicate items that may share the same ID across sources
    const seenIds = new Set<string>();
    const uniqueList: (Transaction & { warehouseSource: WarehouseName })[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const uniqueKey = `${item.warehouseSource}_${item.id}`;
      if (!seenIds.has(uniqueKey)) {
        seenIds.add(uniqueKey);
        uniqueList.push(item);
      }
    }

    // Sort descending by date and time (most recent first)
    return uniqueList.sort(compareTxLatestFirst);
  }, [db, model, warehouseFilter]);

  // Calculate Cumulative KPIs for this model
  const kpis = useMemo(() => {
    let kirimQty = 0;
    let kirimSum = 0;
    let chiqimQty = 0;
    let chiqimSum = 0;
    let otkazmaQty = 0;
    let vozvratQty = 0;

    allModelTransactions.forEach(t => {
      const qty = Number(t.soni || 0);
      const sum = Number(t.summa || 0);

      if (t.amal === 'kirim') {
        kirimQty += qty;
        kirimSum += sum;
      } else if (t.amal === 'chiqim') {
        chiqimQty += qty;
        chiqimSum += sum;
      } else if (t.amal === 'otkazma-out' || t.amal === 'otkazma-in') {
        otkazmaQty += qty;
      } else if (t.amal === 'vozvrat') {
        vozvratQty += qty;
      }
    });

    return {
      kirimQty,
      kirimSum,
      chiqimQty,
      chiqimSum,
      otkazmaQty,
      vozvratQty
    };
  }, [allModelTransactions]);

  // Filtered list by Amal & Search Term
  const filteredTransactions = useMemo(() => {
    let result = allModelTransactions;

    // Filter by Amal
    if (amalFilter === 'kirim') {
      result = result.filter(t => t.amal === 'kirim');
    } else if (amalFilter === 'chiqim') {
      result = result.filter(t => t.amal === 'chiqim');
    } else if (amalFilter === 'otkazma') {
      result = result.filter(t => t.amal === 'otkazma-out' || t.amal === 'otkazma-in');
    } else if (amalFilter === 'other') {
      result = result.filter(t => t.amal !== 'kirim' && t.amal !== 'chiqim' && t.amal !== 'otkazma-out' && t.amal !== 'otkazma-in');
    }

    // Filter by Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(t => 
        (t.olcham !== undefined && t.olcham !== null && String(t.olcham).toLowerCase().includes(q)) ||
        (Boolean(t.kimga) && String(t.kimga).toLowerCase().includes(q)) ||
        (Boolean(t.kimdan) && String(t.kimdan).toLowerCase().includes(q)) ||
        (Boolean(t.xodim) && String(t.xodim).toLowerCase().includes(q)) ||
        (Boolean(t.izoh) && String(t.izoh).toLowerCase().includes(q)) ||
        (Boolean(t.sana) && String(t.sana).includes(q))
      );
    }

    return result;
  }, [allModelTransactions, amalFilter, searchTerm]);

  // Export to Excel
  const handleExportExcel = async () => {
    if (!model || filteredTransactions.length === 0) {
      toast.error("Eksport qilish uchun ma'lumot yo'q!");
      return;
    }

    try {
      const rows: (string | number)[][] = [
        ['#', 'Sana', 'Vaqt', 'Amal', 'Ombor', 'Model', 'O\'lcham', 'Miqdor (juft)', 'Kontragent / Mijoz / Manba', 'Summa (UZS)', 'Xodim', 'Izoh']
      ];

      filteredTransactions.forEach((tx, idx) => {
        const party = tx.amal === 'chiqim' ? (tx.kimga || 'Noma\'lum xaridor') :
                      tx.amal === 'kirim' ? (tx.kimdan || 'Manba/Sex') :
                      (tx.kimga || tx.kimdan || tx.izoh || '—');

        rows.push([
          idx + 1,
          tx.sana || '',
          tx.vaqt || '',
          tx.amal.toUpperCase(),
          tx.warehouseSource.toUpperCase(),
          tx.model,
          tx.olcham,
          tx.soni,
          party,
          tx.summa || 0,
          tx.xodim || '',
          tx.izoh || ''
        ]);
      });

      await exportToExcel(rows, `Harakat_Tarixi_${model.replace(/\s+/g, '_')}_${warehouseFilter}`);
      toast.success("Excel fayl muvaffaqiyatli yuklab olindi!");
    } catch (err) {
      toast.error("Eksportda xatolik: " + err);
    }
  };

  if (!isOpen || !model) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] text-[var(--text)] w-full max-w-4xl rounded-t-[28px] sm:rounded-3xl border-t sm:border border-[var(--border)] shadow-2xl relative mt-auto sm:my-auto max-h-[92vh] sm:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* 1. MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--bg2)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-purple-600 flex items-center justify-center font-black">
              <History size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                  {model}
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 text-xs font-black uppercase">
                  Model Harakat Tarixi
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
                Kirim, chiqim (sotuv), o'tkazma va boshqa barcha operatsiyalar to'liq xronologiyasi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleArchiveModel(model)}
              className={cn(
                "px-3 py-2 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer",
                isModelArchived(model)
                  ? "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/25"
                  : "bg-[var(--bg)] hover:bg-[var(--border)] border-[var(--border)] text-[var(--text)]"
              )}
              title={isModelArchived(model) ? "Arxivdan chiqarish (Faollashtirish)" : "Modelni arxivga o'tkazish"}
            >
              {isModelArchived(model) ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              <span className="hidden sm:inline">{isModelArchived(model) ? "Arxivdan chiqarish" : "Arxivlash"}</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Excel yuklab olish"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button 
              onClick={onClose} 
              className="p-2 bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2. TOP MINI KPI CARDS */}
        <div className="p-4 sm:p-5 bg-[var(--bg)] border-b border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Joriy Qoldiq */}
          <div className="bg-[var(--bg2)] p-3 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold mb-1">
              <span>Joriy Qoldiq</span>
              <Package size={15} className="text-blue-500" />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-black text-[var(--text)]">
                {warehouseFilter === 'all' ? stockStats.total : 
                 warehouseFilter === 'tepa' ? stockStats.tepa : 
                 warehouseFilter === 'kotta' ? stockStats.kotta : stockStats.sort2} <span className="text-xs font-bold text-[var(--text3)]">juft</span>
              </div>
              <div className="text-[10px] text-[var(--text3)] font-semibold mt-0.5 truncate">
                Tepa: {stockStats.tepa} • Kotta: {stockStats.kotta} • 2-nav: {stockStats.sort2}
              </div>
            </div>
          </div>

          {/* Jami Kirim */}
          <div className="bg-[var(--bg2)] p-3 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-emerald-600 font-bold mb-1">
              <span>Jami Kirim</span>
              <ArrowDownLeft size={16} className="text-emerald-500" />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-black text-emerald-600">
                +{kpis.kirimQty} <span className="text-xs font-bold text-emerald-600/70">juft</span>
              </div>
              <div className="text-[10px] text-[var(--text3)] font-semibold mt-0.5">
                {kpis.kirimSum > 0 ? `${formatCompact(kpis.kirimSum)} UZS` : '—'}
              </div>
            </div>
          </div>

          {/* Jami Chiqim (Sotuv) */}
          <div className="bg-[var(--bg2)] p-3 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-rose-600 font-bold mb-1">
              <span>Jami Sotuv</span>
              <ArrowUpRight size={16} className="text-rose-500" />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-black text-rose-600">
                -{kpis.chiqimQty} <span className="text-xs font-bold text-rose-600/70">juft</span>
              </div>
              <div className="text-[10px] text-[var(--text3)] font-semibold mt-0.5">
                {kpis.chiqimSum > 0 ? `${formatCompact(kpis.chiqimSum)} UZS` : '—'}
              </div>
            </div>
          </div>

          {/* O'tkazma & Boshqalar */}
          <div className="bg-[var(--bg2)] p-3 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-purple-600 font-bold mb-1">
              <span>O'tkazmalar</span>
              <ArrowLeftRight size={15} className="text-purple-500" />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-black text-purple-600">
                {kpis.otkazmaQty} <span className="text-xs font-bold text-purple-600/70">juft</span>
              </div>
              <div className="text-[10px] text-[var(--text3)] font-semibold mt-0.5">
                Vozvrat: {kpis.vozvratQty} juft
              </div>
            </div>
          </div>
        </div>

        {/* 3. SIZES QUICK STRIP */}
        {Object.keys(stockStats.sizes).length > 0 && (
          <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--border)] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold text-[var(--text3)] shrink-0 mr-1 flex items-center gap-1">
              <Layers size={13} /> Razmer qoldiqlari:
            </span>
            {Object.entries(stockStats.sizes)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([sz, qty]) => (
                <div 
                  key={sz} 
                  className={cn(
                    "px-2 py-0.5 rounded-lg border text-xs font-extrabold flex items-center gap-1 shrink-0",
                    Number(qty) > 0 
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20" 
                      : "bg-[var(--bg)] text-[var(--text3)] border-[var(--border)] opacity-60"
                  )}
                >
                  <span>{sz}°:</span>
                  <span>{qty}</span>
                </div>
              ))}
          </div>
        )}

        {/* 4. FILTERS & SEARCH CONTROLS */}
        <div className="p-3 sm:p-4 bg-[var(--bg2)] border-b border-[var(--border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Warehouse Scope Selector */}
          <div className="flex items-center gap-1 bg-[var(--bg)] p-1 rounded-2xl border border-[var(--border)] overflow-x-auto no-scrollbar">
            <button
              onClick={() => setWarehouseFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                warehouseFilter === 'all' 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-[var(--text2)] hover:text-[var(--text)]"
              )}
            >
              Barcha Omborlar
            </button>
            <button
              onClick={() => setWarehouseFilter('tepa')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                warehouseFilter === 'tepa' 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-[var(--text2)] hover:text-[var(--text)]"
              )}
            >
              Tepa
            </button>
            <button
              onClick={() => setWarehouseFilter('kotta')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                warehouseFilter === 'kotta' 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-[var(--text2)] hover:text-[var(--text)]"
              )}
            >
              Kotta
            </button>
            <button
              onClick={() => setWarehouseFilter('sort2')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                warehouseFilter === 'sort2' 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-[var(--text2)] hover:text-[var(--text)]"
              )}
            >
              2-Nav
            </button>
          </div>

          {/* Amal Types Filter */}
          <div className="flex items-center gap-1 bg-[var(--bg)] p-1 rounded-2xl border border-[var(--border)] overflow-x-auto no-scrollbar">
            <button
              onClick={() => setAmalFilter('all')}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                amalFilter === 'all' ? "bg-[var(--bg2)] text-[var(--text)] shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Barchasi ({allModelTransactions.length})
            </button>
            <button
              onClick={() => setAmalFilter('kirim')}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                amalFilter === 'kirim' ? "bg-emerald-500/15 text-emerald-600 shadow-xs" : "text-[var(--text3)] hover:text-emerald-600"
              )}
            >
              Kirim
            </button>
            <button
              onClick={() => setAmalFilter('chiqim')}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                amalFilter === 'chiqim' ? "bg-rose-500/15 text-rose-600 shadow-xs" : "text-[var(--text3)] hover:text-rose-600"
              )}
            >
              Sotuv
            </button>
            <button
              onClick={() => setAmalFilter('otkazma')}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                amalFilter === 'otkazma' ? "bg-purple-500/15 text-purple-600 shadow-xs" : "text-[var(--text3)] hover:text-purple-600"
              )}
            >
              O'tkazma
            </button>
            <button
              onClick={() => setAmalFilter('other')}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                amalFilter === 'other' ? "bg-blue-500/15 text-blue-600 shadow-xs" : "text-[var(--text3)] hover:text-blue-600"
              )}
            >
              Boshqa
            </button>
          </div>

          {/* Search Input inside modal */}
          <div className="relative min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Qidirish (razmer, mijoz, xodim)..."
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-[var(--text)] focus:outline-hidden focus:border-purple-500 placeholder:text-[var(--text3)]"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 5. TRANSACTIONS LIST */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-[var(--border)]">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-3xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text3)] mb-3">
                <History size={26} />
              </div>
              <h4 className="text-sm font-bold text-[var(--text)]">Tranzaksiyalar topilmadi</h4>
              <p className="text-xs text-[var(--text3)] mt-1 max-w-xs">
                {searchTerm || amalFilter !== 'all' 
                  ? "Belgilangan filtr yoki qidiruv so'rovi bo'yicha hech qanday amal mavjud emas." 
                  : "Ushbu model bo'yicha hali operatsiyalar tarixi mavjud emas."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.slice(0, visibleLimit).map((tx, idx) => {
                const isKirim = tx.amal === 'kirim';
                const isChiqim = tx.amal === 'chiqim';
                const isOtkazma = tx.amal === 'otkazma-out' || tx.amal === 'otkazma-in';
                const isVozvrat = tx.amal === 'vozvrat';

                // Display accurate counterparty name
                const counterparty = isChiqim 
                  ? (tx.kimga || 'Noma\'lum xaridor')
                  : isKirim 
                  ? (tx.kimdan || 'Ombor / Sex')
                  : (tx.kimga || tx.kimdan || tx.izoh || 'Ichki harakat');

                return (
                  <div 
                    key={`${tx.warehouseSource || 'w'}_${tx.id || ''}_${idx}`} 
                    className="p-3.5 bg-[var(--bg)] hover:bg-[var(--bg2)] border border-[var(--border)] rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    {/* Left: Type, Size, Qty & Counterparty */}
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 mt-0.5",
                        isKirim ? "bg-emerald-500/15 text-emerald-600" :
                        isChiqim ? "bg-rose-500/15 text-rose-600" :
                        isOtkazma ? "bg-purple-500/15 text-purple-600" :
                        "bg-blue-500/15 text-blue-600"
                      )}>
                        {isKirim ? <ArrowDownLeft size={18} /> :
                         isChiqim ? <ArrowUpRight size={18} /> :
                         isOtkazma ? <ArrowLeftRight size={16} /> :
                         <RotateCcw size={16} />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                            isKirim ? "bg-emerald-500/15 text-emerald-600" :
                            isChiqim ? "bg-rose-500/15 text-rose-600" :
                            isOtkazma ? "bg-purple-500/15 text-purple-600" :
                            "bg-blue-500/15 text-blue-600"
                          )}>
                            {tx.amal === 'otkazma-out' ? 'O\'TKAZMA (CHIQISH)' :
                             tx.amal === 'otkazma-in' ? 'O\'TKAZMA (KIRISH)' :
                             tx.amal.toUpperCase()}
                          </span>

                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg2)] border border-[var(--border)] text-[10px] font-extrabold text-[var(--text2)] uppercase">
                            {tx.warehouseSource.toUpperCase()}
                          </span>

                          <span className="font-extrabold text-[var(--text)]">
                            {tx.olcham}-o'lcham: <strong className="font-black text-sm text-[var(--text)]">{tx.soni} juft</strong>
                          </span>
                        </div>

                        {/* Counterparty & Note */}
                        <div className="text-xs text-[var(--text2)] font-semibold flex items-center gap-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[var(--text)] font-bold">
                            {isChiqim ? <User size={13} className="text-rose-500" /> : <Building2 size={13} className="text-emerald-500" />}
                            {isChiqim ? `Xaridor: ` : isKirim ? `Manba: ` : ''}{counterparty}
                          </span>
                          {tx.izoh && (
                            <span className="text-[var(--text3)] text-[11px] before:content-['•'] before:mr-1">
                              {tx.izoh}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Summa & Date/Time */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border)] shrink-0">
                      {tx.summa && tx.summa > 0 ? (
                        <div className="text-right">
                          <div className="font-black text-sm text-[var(--text)]">
                            {formatUzs(tx.summa)} so'm
                          </div>
                          {tx.soni > 1 && (
                            <div className="text-[10px] font-semibold text-[var(--text3)]">
                              (1 juft = {formatCompact(Math.round(tx.summa / tx.soni))} UZS)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-[var(--text3)]">—</div>
                      )}

                      <div className="text-right mt-0.5">
                        <div className="text-[11px] font-bold text-[var(--text)] flex items-center justify-end gap-1">
                          <Calendar size={11} className="text-[var(--text3)]" />
                          {tx.sana}
                        </div>
                        <div className="text-[10px] text-[var(--text3)] font-medium flex items-center justify-end gap-1">
                          <Clock size={10} />
                          {tx.vaqt} • <strong className="text-[var(--text2)]">{tx.xodim}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load More Button if filtered items exceed visibleLimit */}
              {filteredTransactions.length > visibleLimit && (
                <div className="text-center pt-3">
                  <button
                    onClick={() => setVisibleLimit(prev => prev + 50)}
                    className="px-5 py-2.5 bg-[var(--bg)] hover:bg-[var(--border)] border border-[var(--border)] rounded-2xl text-xs font-bold text-[var(--text)] transition-colors cursor-pointer"
                  >
                    Yana 50 ta ko'rsatish (Qolgan: {filteredTransactions.length - visibleLimit} ta)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. MODAL FOOTER */}
        <div className="p-4 bg-[var(--bg2)] border-t border-[var(--border)] flex items-center justify-between gap-3 z-10">
          <div className="text-xs font-semibold text-[var(--text3)]">
            Jami: <strong className="text-[var(--text)]">{filteredTransactions.length} ta</strong> operatsiya topildi
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-purple-600 text-white font-black text-xs hover:bg-purple-700 transition-colors cursor-pointer shadow-xs"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
};
