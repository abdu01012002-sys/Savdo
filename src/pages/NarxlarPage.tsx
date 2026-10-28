import React, { useState, useMemo, useRef, useEffect } from 'react';
import { produce } from 'immer';
import { useDb } from '../context/DbContext';
import { DbState } from '../types';
import { 
  Edit2, Save, X, Search, Filter, History, ChevronDown, DollarSign, 
  RefreshCw, AlertCircle, TrendingUp, ArrowRight, CheckCircle2, 
  CheckSquare, Square, Layers, Percent, Plus, Minus, ArrowUpDown, 
  Check, HelpCircle, ArrowUpRight, ArrowDownRight, Sparkles, CheckCheck,
  QrCode, Barcode, Printer, Archive, ArchiveRestore
} from 'lucide-react';
import { toast } from 'sonner';
import { createAuditLog } from '../lib/auditUtils';
import { getUnpricedSalesStats, syncUnpricedTransactionsWithCurrentPrices } from '../lib/balanceUtils';
import { formatUzs, cn, ALL_SIZES } from '../lib/utils';
import { BarcodeGeneratorModal } from '../components/BarcodeGeneratorModal';

type FilterTab = 'all' | 'no-cost' | 'no-sale' | 'unpriced' | 'fully-priced' | 'archived';
type SortOption = 'az' | 'za' | 'recent' | 'sale-desc' | 'sale-asc' | 'cost-desc' | 'cost-asc';
type BulkEditMode = 'adjust' | 'set-exact' | 'markup-from-cost';

export default function NarxlarPage() {
  const { db, setDb, currentUser, toggleArchiveModel, isModelArchived } = useDb();
  const [currencyView, setCurrencyView] = useState<'UZS' | 'USD' | 'BOTH'>('BOTH');
  const valyutaKursi = db.valyutaKursi || db.valyutaKursConfig?.joriyKurs || 12850;

  // Search, Quick Filter Tabs & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('az');

  // QR / Barcode Generator Modal State
  const [generatorModel, setGeneratorModel] = useState<string | null>(null);

  // Excel-style Inline Editing state: { model, field: 'cost' | 'sale' }
  const [editingCell, setEditingCell] = useState<{ model: string; field: 'cost' | 'sale' } | null>(null);
  const [cellInputValue, setCellInputValue] = useState<string>('');
  const [recentlySavedCell, setRecentlySavedCell] = useState<string | null>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);

  // Multi-Selection for Bulk Edit
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  
  // Bulk Edit Form State
  const [bulkMode, setBulkMode] = useState<BulkEditMode>('adjust');
  const [bulkTarget, setBulkTarget] = useState<'both' | 'cost' | 'sale'>('sale');
  const [bulkActionType, setBulkActionType] = useState<'add' | 'subtract'>('add');
  const [bulkUnitType, setBulkUnitType] = useState<'amount' | 'percent'>('amount');
  const [bulkAdjustValue, setBulkAdjustValue] = useState<string>('5000');
  
  // Exact Price Inputs
  const [bulkExactCost, setBulkExactCost] = useState<string>('');
  const [bulkExactSale, setBulkExactSale] = useState<string>('');

  // Markup from Cost Inputs
  const [bulkMarkupType, setBulkMarkupType] = useState<'percent' | 'amount'>('percent');
  const [bulkMarkupValue, setBulkMarkupValue] = useState<string>('20');

  // Modals
  const [historyModal, setHistoryModal] = useState<string | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkModalOpen) setBulkModalOpen(false);
        else if (historyModal) setHistoryModal(null);
        else if (syncModalOpen) setSyncModalOpen(false);
        else if (editingCell) setEditingCell(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkModalOpen, historyModal, syncModalOpen, editingCell]);

  const prices = db.prices || {};

  // Compute unpriced transactions stats
  const unpricedStats = useMemo(() => {
    return getUnpricedSalesStats(db);
  }, [db]);

  // Combine models from stock (tepa, kotta, sort2), transactions (kirim, chiqim), pending items, and prices
  const allModels = useMemo(() => {
    const modelsSet = new Set<string>();
    Object.keys(db.tepa?.stock || {}).forEach(m => m && modelsSet.add(m.trim()));
    Object.keys(db.kotta?.stock || {}).forEach(m => m && modelsSet.add(m.trim()));
    Object.keys(db.sort2?.stock || {}).forEach(m => m && modelsSet.add(m.trim()));
    (db.tepa?.transactions || []).forEach(t => t?.model && modelsSet.add(t.model.trim()));
    (db.kotta?.transactions || []).forEach(t => t?.model && modelsSet.add(t.model.trim()));
    (db.sort2?.transactions || []).forEach(t => t?.model && modelsSet.add(t.model.trim()));
    (db.pendingKirim || []).forEach(p => p?.model && modelsSet.add(p.model.trim()));
    Object.keys(db.prices || {}).forEach(m => m && modelsSet.add(m.trim()));
    return Array.from(modelsSet).sort((a, b) => a.localeCompare(b));
  }, [
    db.tepa?.stock, 
    db.kotta?.stock, 
    db.sort2?.stock, 
    db.tepa?.transactions, 
    db.kotta?.transactions, 
    db.sort2?.transactions, 
    db.pendingKirim, 
    db.prices
  ]);

  // Quick Filter Statistics
  const filterStats = useMemo(() => {
    let noCost = 0;
    let noSale = 0;
    let unpriced = 0;
    let fullyPriced = 0;
    let archived = 0;

    const archivedList = db.archivedModels || [];

    allModels.forEach(m => {
      const isArchived = archivedList.includes(m);
      if (isArchived) archived++;

      const p = prices[m];
      const hasCost = p && Number(p.cost || 0) > 0;
      const hasSale = p && Number(p.sale || 0) > 0;

      if (!hasCost) noCost++;
      if (!hasSale) noSale++;
      if (!hasCost && !hasSale) unpriced++;
      if (hasCost && hasSale) fullyPriced++;
    });

    return {
      all: allModels.length,
      noCost,
      noSale,
      unpriced,
      fullyPriced,
      archived
    };
  }, [allModels, prices, db.archivedModels]);

  // Filtered & Sorted Models
  const filteredModels = useMemo(() => {
    const archivedList = db.archivedModels || [];

    let result = allModels.filter(model => {
      const matchesSearch = model.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      const isArchived = archivedList.includes(model);
      if (activeTab === 'archived') {
        if (!isArchived) return false;
      } else {
        // Hide archived models by default unless searched or in archived tab
        if (isArchived && !searchQuery) return false;
      }

      const p = prices[model];
      const hasCost = p && Number(p.cost || 0) > 0;
      const hasSale = p && Number(p.sale || 0) > 0;

      if (activeTab === 'no-cost') return !hasCost;
      if (activeTab === 'no-sale') return !hasSale;
      if (activeTab === 'unpriced') return !hasCost && !hasSale;
      if (activeTab === 'fully-priced') return hasCost && hasSale;

      return true;
    });

    result.sort((a, b) => {
      const pA = prices[a];
      const pB = prices[b];
      const costA = Number(pA?.cost || 0);
      const costB = Number(pB?.cost || 0);
      const saleA = Number(pA?.sale || 0);
      const saleB = Number(pB?.sale || 0);

      if (sortBy === 'za') return b.localeCompare(a);
      if (sortBy === 'sale-desc') return saleB - saleA || a.localeCompare(b);
      if (sortBy === 'sale-asc') return saleA - saleB || a.localeCompare(b);
      if (sortBy === 'cost-desc') return costB - costA || a.localeCompare(b);
      if (sortBy === 'cost-asc') return costA - costB || a.localeCompare(b);
      if (sortBy === 'recent') {
        const aHist = pA?.history || [];
        const bHist = pB?.history || [];
        const dateA = aHist.length > 0 ? new Date(aHist[aHist.length - 1].date).getTime() : 0;
        const dateB = bHist.length > 0 ? new Date(bHist[bHist.length - 1].date).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA;
      }
      return a.localeCompare(b);
    });

    return result;
  }, [allModels, searchQuery, activeTab, sortBy, prices, db.archivedModels]);

  // Handle Starting Inline Cell Edit
  const handleStartCellEdit = (model: string, field: 'cost' | 'sale') => {
    const currentVal = prices[model]?.[field] ?? '';
    setEditingCell({ model, field });
    setCellInputValue(currentVal === 0 ? '' : currentVal.toString());
  };

  // Focus and select input on cell edit
  useEffect(() => {
    if (editingCell && cellInputRef.current) {
      cellInputRef.current.focus();
      cellInputRef.current.select();
    }
  }, [editingCell]);

  // Save single cell value immediately
  const handleSaveCell = (model: string, field: 'cost' | 'sale', rawValue: string) => {
    const cleanNum = rawValue.trim() === '' ? 0 : Number(rawValue.replace(/\s+/g, ''));
    
    if (isNaN(cleanNum) || cleanNum < 0) {
      toast.error("Narx musbat raqam bo'lishi kerak!");
      setEditingCell(null);
      return;
    }

    const currentPrice = prices[model] || { cost: 0, sale: 0, history: [] };
    const oldCost = Number(currentPrice.cost || 0);
    const oldSale = Number(currentPrice.sale || 0);
    const newCost = field === 'cost' ? cleanNum : oldCost;
    const newSale = field === 'sale' ? cleanNum : oldSale;

    // If unchanged, do nothing
    if (field === 'cost' && oldCost === newCost) {
      setEditingCell(null);
      return;
    }
    if (field === 'sale' && oldSale === newSale) {
      setEditingCell(null);
      return;
    }

    const newHistoryItem = {
      date: new Date().toISOString(),
      cost: oldCost,
      sale: oldSale,
      changedBy: currentUser?.ism || 'Admin'
    };

    const log = createAuditLog(
      currentUser!, 
      'narx', 
      'Narx yangilandi', 
      `${model} (${field === 'cost' ? 'Tan narx' : 'Sotuv narxi'}): ${field === 'cost' ? oldCost : oldSale} -> ${cleanNum}`
    );

    setDb(prev => {
      const intermediate = produce(prev, (draft: DbState) => {
        if (!draft.prices) draft.prices = {};
        if (!draft.prices[model]) {
          draft.prices[model] = { cost: newCost, sale: newSale, history: [newHistoryItem] };
        } else {
          draft.prices[model].cost = newCost;
          draft.prices[model].sale = newSale;
          if (!draft.prices[model].history) draft.prices[model].history = [];
          draft.prices[model].history.push(newHistoryItem);
        }

        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(log);
      });

      // Synchronize past unpriced transactions for this model automatically
      const { 
        newDb, 
        updatedChiqimCount, 
        totalRecalculatedSum, 
        impactedClientsCount,
        updatedKirimCount,
        totalRecalculatedKirimCost
      } = syncUnpricedTransactionsWithCurrentPrices(intermediate, currentUser, model);

      if (updatedChiqimCount > 0 || updatedKirimCount > 0) {
        const parts = [];
        if (updatedChiqimCount > 0) parts.push(`${updatedChiqimCount} ta chiqim (+${formatUzs(totalRecalculatedSum)} UZS)`);
        if (updatedKirimCount > 0) parts.push(`${updatedKirimCount} ta kirim (+${formatUzs(totalRecalculatedKirimCost)} UZS)`);
        toast.success(`«${model}» saqlandi! Avvalgi narxsiz operatsiyalar avtomatik hisoblandi: ${parts.join(', ')}`);
      } else {
        toast.success(`«${model}» ${field === 'cost' ? 'tan narxi' : 'sotuv narxi'} saqlandi`);
      }

      return newDb;
    });

    // Temporary highlight animation
    setRecentlySavedCell(`${model}-${field}`);
    setTimeout(() => setRecentlySavedCell(null), 1500);
    setEditingCell(null);
  };

  // Keyboard navigation for inline editing (Excel-like)
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, model: string, field: 'cost' | 'sale') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveCell(model, field, cellInputValue);
      
      // Move down to the same field in the next row
      const currentIndex = filteredModels.indexOf(model);
      if (currentIndex !== -1 && currentIndex < filteredModels.length - 1) {
        const nextModel = filteredModels[currentIndex + 1];
        setTimeout(() => handleStartCellEdit(nextModel, field), 50);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSaveCell(model, field, cellInputValue);
      
      if (!e.shiftKey) {
        if (field === 'cost') {
          setTimeout(() => handleStartCellEdit(model, 'sale'), 50);
        } else {
          const currentIndex = filteredModels.indexOf(model);
          if (currentIndex !== -1 && currentIndex < filteredModels.length - 1) {
            const nextModel = filteredModels[currentIndex + 1];
            setTimeout(() => handleStartCellEdit(nextModel, 'cost'), 50);
          }
        }
      } else {
        if (field === 'sale') {
          setTimeout(() => handleStartCellEdit(model, 'cost'), 50);
        } else {
          const currentIndex = filteredModels.indexOf(model);
          if (currentIndex > 0) {
            const prevModel = filteredModels[currentIndex - 1];
            setTimeout(() => handleStartCellEdit(prevModel, 'sale'), 50);
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Selection Logic
  const handleToggleSelectModel = (model: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedModels.size === filteredModels.length && filteredModels.length > 0) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(filteredModels));
    }
  };

  const handleSelectAllUnpricedCost = () => {
    const unpriced = allModels.filter(m => !prices[m]?.cost || Number(prices[m]?.cost) <= 0);
    setSelectedModels(new Set(unpriced));
    setActiveTab('no-cost');
    toast.info(`${unpriced.length} ta tan narxi yo'q model tanlandi`);
  };

  const handleSelectAllUnpricedSale = () => {
    const unpriced = allModels.filter(m => !prices[m]?.sale || Number(prices[m]?.sale) <= 0);
    setSelectedModels(new Set(unpriced));
    setActiveTab('no-sale');
    toast.info(`${unpriced.length} ta sotuv narxi yo'q model tanlandi`);
  };

  // Bulk Edit Calculation Engine (Returns simulated/new price for preview and application)
  const calculateBulkPrice = (currentCost: number, currentSale: number) => {
    let nextCost = currentCost;
    let nextSale = currentSale;

    if (bulkMode === 'adjust') {
      const val = Number(bulkAdjustValue) || 0;
      if (val > 0) {
        if (bulkTarget === 'cost' || bulkTarget === 'both') {
          if (bulkUnitType === 'amount') {
            nextCost = bulkActionType === 'add' ? currentCost + val : Math.max(0, currentCost - val);
          } else {
            const delta = (currentCost * val) / 100;
            nextCost = bulkActionType === 'add' ? Math.round(currentCost + delta) : Math.max(0, Math.round(currentCost - delta));
          }
        }
        if (bulkTarget === 'sale' || bulkTarget === 'both') {
          if (bulkUnitType === 'amount') {
            nextSale = bulkActionType === 'add' ? currentSale + val : Math.max(0, currentSale - val);
          } else {
            const delta = (currentSale * val) / 100;
            nextSale = bulkActionType === 'add' ? Math.round(currentSale + delta) : Math.max(0, Math.round(currentSale - delta));
          }
        }
      }
    } else if (bulkMode === 'set-exact') {
      if (bulkExactCost.trim() !== '') {
        nextCost = Math.max(0, Number(bulkExactCost) || 0);
      }
      if (bulkExactSale.trim() !== '') {
        nextSale = Math.max(0, Number(bulkExactSale) || 0);
      }
    } else if (bulkMode === 'markup-from-cost') {
      const markupVal = Number(bulkMarkupValue) || 0;
      const baseCost = nextCost > 0 ? nextCost : currentCost;
      if (baseCost > 0 && markupVal > 0) {
        if (bulkMarkupType === 'percent') {
          nextSale = Math.round(baseCost * (1 + markupVal / 100));
        } else {
          nextSale = baseCost + markupVal;
        }
      }
    }

    return { nextCost, nextSale };
  };

  // Apply Bulk Edit to Database
  const handleApplyBulkEdit = () => {
    if (selectedModels.size === 0) {
      toast.error("Hech qanday model tanlanmagan!");
      return;
    }

    const modelsList = Array.from(selectedModels);
    const now = new Date().toISOString();
    let updatedCount = 0;

    setDb(prev => {
      const intermediate = produce(prev, (draft: DbState) => {
        if (!draft.prices) draft.prices = {};
        if (!draft.auditLogs) draft.auditLogs = [];

        modelsList.forEach(m => {
          const oldP = draft.prices[m] || { cost: 0, sale: 0, history: [] };
          const oldCost = Number(oldP.cost || 0);
          const oldSale = Number(oldP.sale || 0);

          const { nextCost, nextSale } = calculateBulkPrice(oldCost, oldSale);

          if (nextCost !== oldCost || nextSale !== oldSale) {
            updatedCount++;
            const historyItem = {
              date: now,
              cost: oldCost,
              sale: oldSale,
              changedBy: currentUser?.ism || 'Admin (Ommaviy)'
            };

            if (!draft.prices[m]) {
              draft.prices[m] = { cost: nextCost, sale: nextSale, history: [historyItem] };
            } else {
              draft.prices[m].cost = nextCost;
              draft.prices[m].sale = nextSale;
              if (!draft.prices[m].history) draft.prices[m].history = [];
              draft.prices[m].history.push(historyItem);
            }
          }
        });

        draft.auditLogs.unshift(
          createAuditLog(
            currentUser!,
            'narx',
            'Ommaviy narx o\'zgartirildi',
            `${updatedCount} ta model narxi ommaviy tahrirlandi (${bulkMode})`
          )
        );
      });

      // Synchronize all impacted unpriced transactions automatically
      const { newDb, updatedChiqimCount, totalRecalculatedSum, updatedKirimCount, totalRecalculatedKirimCost } = 
        syncUnpricedTransactionsWithCurrentPrices(intermediate, currentUser);

      const syncParts = [];
      if (updatedChiqimCount > 0) syncParts.push(`${updatedChiqimCount} ta chiqim (+${formatUzs(totalRecalculatedSum)} UZS)`);
      if (updatedKirimCount > 0) syncParts.push(`${updatedKirimCount} ta kirim (+${formatUzs(totalRecalculatedKirimCost)} UZS)`);

      toast.success(
        `${updatedCount} ta model narxlari ommaviy yangilandi! ${syncParts.length > 0 ? `Qayta hisoblandi: ${syncParts.join(', ')}.` : ''}`,
        { duration: 6000 }
      );

      return newDb;
    });

    setBulkModalOpen(false);
    setSelectedModels(new Set());
  };

  // Batch Unpriced Sync Full Action
  const handleRunSyncAll = () => {
    setIsSyncing(true);
    try {
      const { 
        newDb, 
        updatedChiqimCount, 
        updatedChiqimQty, 
        totalRecalculatedSum, 
        impactedClientsCount,
        updatedKirimCount,
        updatedKirimQty,
        totalRecalculatedKirimCost
      } = syncUnpricedTransactionsWithCurrentPrices(db, currentUser);
      setDb(newDb);

      const parts = [];
      if (updatedChiqimCount > 0) parts.push(`${updatedChiqimCount} ta chiqim (${updatedChiqimQty} juft, +${formatUzs(totalRecalculatedSum)} UZS)`);
      if (updatedKirimCount > 0) parts.push(`${updatedKirimCount} ta kirim (${updatedKirimQty} juft, +${formatUzs(totalRecalculatedKirimCost)} UZS)`);

      toast.success(
        `Muvaffaqiyatli: ${parts.length > 0 ? parts.join(' va ') : "Barcha amaliyotlar yangilandi"}! ${impactedClientsCount} ta mijoz qarzi to'liq yangilandi!`,
        { duration: 6000 }
      );
      setSyncModalOpen(false);
    } catch (e: any) {
      toast.error("Xatolik yuz berdi: " + (e?.message || e));
    } finally {
      setIsSyncing(false);
    }
  };

  // Bulk Archive / Unarchive
  const handleBulkArchive = (archiveAction: boolean) => {
    if (selectedModels.size === 0) return;
    const selectedArr = Array.from(selectedModels);
    setDb(prev => {
      const current = prev.archivedModels || [];
      let next: string[];
      if (archiveAction) {
        next = Array.from(new Set([...current, ...selectedArr]));
      } else {
        next = current.filter(m => !selectedModels.has(m));
      }
      return { ...prev, archivedModels: next };
    });
    toast.success(`${selectedModels.size} ta model ${archiveAction ? 'arxivlandi' : 'arxivdan chiqarildi'}`);
    setSelectedModels(new Set());
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (!val || val === 0) return <span className="text-[var(--text3)] opacity-40 font-mono">-</span>;
    const uzs = val.toLocaleString() + ' UZS';
    const usd = '$' + (val / valyutaKursi).toFixed(2);
    
    if (currencyView === 'UZS') return <span className="font-mono font-bold">{uzs}</span>;
    if (currencyView === 'USD') return <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{usd}</span>;
    return (
      <div className="flex flex-col items-end">
        <span className="font-mono font-bold text-[var(--text)]">{uzs}</span>
        <span className="text-[10px] font-semibold text-[var(--text3)]">≈ {usd}</span>
      </div>
    );
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* 1. HEADER & TOP CONTROLS */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">Mahsulotlar narxlari</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              {allModels.length} model
            </span>
          </div>
          <p className="text-xs text-[var(--text3)] mt-1">
            Har bir model uchun tan narx va sotuv narxi (1$ = {valyutaKursi.toLocaleString()} UZS kursi bo'yicha). Kataklarga bosib to'g'ridan-to'g'ri (Excel kabi) o'zgartiring.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sync unpriced transactions button */}
          <button
            type="button"
            onClick={() => setSyncModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-sm shadow-emerald-600/25 transition-all cursor-pointer"
            title="Eski narxsiz savdo va kirimlarni model narxlari bo'yicha hisoblash va qarzlarni yangilash"
          >
            <RefreshCw size={14} className={(unpricedStats.resolvableChiqimCount > 0 || unpricedStats.resolvableKirimCount > 0) ? "animate-spin" : ""} />
            <span>Qarzlarni Hisoblash</span>
            {(unpricedStats.resolvableChiqimCount + unpricedStats.resolvableKirimCount) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-black">
                {unpricedStats.resolvableChiqimCount + unpricedStats.resolvableKirimCount}
              </span>
            )}
          </button>

          {/* Ommaviy tahrirlash (Bulk Edit) Button */}
          <button
            type="button"
            onClick={() => {
              if (selectedModels.size === 0) {
                // If nothing is selected, select all currently filtered models by default
                setSelectedModels(new Set(filteredModels));
              }
              setBulkModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-black flex items-center gap-2 shadow-sm shadow-purple-600/25 transition-all cursor-pointer"
          >
            <Layers size={15} />
            <span>Ommaviy Narx Belgilash</span>
            {selectedModels.size > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/30 text-[10px] font-black">
                {selectedModels.size}
              </span>
            )}
          </button>

          {/* Currency view toggle */}
          <div className="flex items-center p-1 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold shadow-2xs">
            <button
              onClick={() => setCurrencyView('BOTH')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyView === 'BOTH' ? 'bg-[var(--bg)] text-[var(--text)] shadow-xs font-extrabold' : 'text-[var(--text3)] hover:text-[var(--text)]'
              )}
            >
              So'm + $
            </button>
            <button
              onClick={() => setCurrencyView('UZS')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyView === 'UZS' ? 'bg-[var(--bg)] text-[var(--text)] shadow-xs font-extrabold' : 'text-[var(--text3)] hover:text-[var(--text)]'
              )}
            >
              Faqat So'm
            </button>
            <button
              onClick={() => setCurrencyView('USD')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyView === 'USD' ? 'bg-[var(--bg)] text-[var(--text)] shadow-xs font-extrabold' : 'text-[var(--text3)] hover:text-[var(--text)]'
              )}
            >
              Faqat ($)
            </button>
          </div>
        </div>
      </div>

      {/* 2. TEZKOR FILTRLAR (STATUS PILLS), QIDIRUV VA SARALASH */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        
        {/* Chap tomon: Qidiruv maydoni (Kengligi moslashuvchan) */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
          <input 
            type="text" 
            placeholder="Model nomi bo'yicha qidirish..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-0.5 rounded cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* O'rta: Asosiy Tezkor Holat Tugmalari (Segmented Control) */}
        <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] overflow-x-auto gap-1 shadow-2xs">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'all'
                ? "bg-[var(--bg2)] text-purple-600 shadow-xs border border-[var(--border)] font-extrabold"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <span>Barchasi</span>
            <span className="text-[10px] opacity-75 font-black">({filterStats.all})</span>
          </button>

          {/* Tan Narxi Yo'q (161 ta) */}
          <button
            onClick={() => setActiveTab(activeTab === 'no-cost' ? 'all' : 'no-cost')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'no-cost'
                ? "bg-amber-500 text-white shadow-xs font-extrabold"
                : "text-amber-500 hover:bg-amber-500/10"
            )}
            title="Kirim (Tan) narxi belgilanmagan modellar"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0" />
            <span>Tan narxi yo'q</span>
            <span className="text-[10px] font-black">({filterStats.noCost})</span>
          </button>

          {/* Sotish Narxi Yo'q */}
          <button
            onClick={() => setActiveTab(activeTab === 'no-sale' ? 'all' : 'no-sale')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'no-sale'
                ? "bg-rose-500 text-white shadow-xs font-extrabold"
                : "text-rose-500 hover:bg-rose-500/10"
            )}
            title="Sotish narxi belgilanmagan modellar"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
            <span>Sotish narxi yo'q</span>
            <span className="text-[10px] font-black">({filterStats.noSale})</span>
          </button>

          {/* Ikkalasi ham yo'q */}
          <button
            onClick={() => setActiveTab(activeTab === 'unpriced' ? 'all' : 'unpriced')}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'unpriced'
                ? "bg-slate-700 text-white shadow-xs font-extrabold"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <span>Narxsizlar</span>
            <span className="text-[10px] font-black">({filterStats.unpriced})</span>
          </button>

          {/* To'liq narxlangan */}
          <button
            onClick={() => setActiveTab(activeTab === 'fully-priced' ? 'all' : 'fully-priced')}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'fully-priced'
                ? "bg-emerald-600 text-white shadow-xs font-extrabold"
                : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            <Check size={12} className="shrink-0" />
            <span>To'liq</span>
            <span className="text-[10px] font-black">({filterStats.fullyPriced})</span>
          </button>

          {/* Arxivlanganlar */}
          <button
            onClick={() => setActiveTab(activeTab === 'archived' ? 'all' : 'archived')}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              activeTab === 'archived'
                ? "bg-zinc-700 text-white shadow-xs font-extrabold"
                : "text-zinc-500 hover:bg-zinc-500/10"
            )}
          >
            <Archive size={12} className="shrink-0" />
            <span>Arxiv</span>
            {filterStats.archived > 0 && (
              <span className="text-[10px] font-black">({filterStats.archived})</span>
            )}
          </button>
        </div>

        {/* O'ng: Saralash Dropdown */}
        <div className="relative ml-auto">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="pl-3 pr-8 py-2 appearance-none bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text2)] outline-none focus:border-purple-500 hover:border-[var(--text3)] cursor-pointer shadow-2xs"
          >
            <option value="az">🔤 Model (A-Z)</option>
            <option value="za">🔤 Model (Z-A)</option>
            <option value="recent">⏱ Oxirgi o'zgartirilganlar</option>
            <option value="sale-desc">💰 Sotuv narxi: Yuqoridan pastga</option>
            <option value="sale-asc">📉 Sotuv narxi: Pastdan yuqoriga</option>
            <option value="cost-desc">📦 Tan narx: Yuqoridan pastga</option>
            <option value="cost-asc">📊 Tan narx: Pastdan yuqoriga</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
        </div>

      </div>

      {/* 3. MULTI-SELECTION FLOATING / PROMINENT BAR (When 1+ models selected) */}
      {selectedModels.size > 0 && (
        <div className="p-3 sm:p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
              {selectedModels.size}
            </div>
            <div>
              <p className="text-xs font-black text-[var(--text)]">
                {selectedModels.size} ta model belgilandi
              </p>
              <p className="text-[11px] text-[var(--text3)]">
                Barcha tanlangan modellarga bir vaqtda narx belgilash yoki arxivlash mumkin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setBulkModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Sparkles size={14} />
              <span>Ommaviy Narx</span>
            </button>
            <button
              onClick={() => handleBulkArchive(true)}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer border border-white/10"
            >
              <Archive size={13} />
              <span>Arxivlash</span>
            </button>
            <button
              onClick={() => handleBulkArchive(false)}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-[var(--text)] text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <ArchiveRestore size={13} />
              <span>Arxivdan chiqarish</span>
            </button>
            <button
              onClick={() => setSelectedModels(new Set())}
              className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg2)] text-[var(--text)] text-xs font-bold transition-all cursor-pointer"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}

      {/* 4. UNPRICED NOTICE BANNER (If resolvable transactions exist) */}
      {unpricedStats.resolvableChiqimCount > 0 && (
        <div className="p-4 sm:p-4.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <TrendingUp size={18} />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-[var(--text)] flex items-center gap-2">
                Narxsiz amalga oshirilgan savdolar mavjud ({unpricedStats.resolvableChiqimCount} ta)
              </h3>
              <p className="text-[11px] text-[var(--text2)] mt-0.5">
                Model narxlari asosida mijozlar hisobiga <strong className="text-emerald-600 dark:text-emerald-400">+{formatUzs(unpricedStats.estimatedTotalSum)} UZS</strong> qarz summasini bitta tugma bilan kiritish mumkin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSyncModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>Qarzlarni Yangilash</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* 5. EXCEL-LIKE INLINE EDITING TABLE */}
      <div className="bg-[var(--bg2)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg)] border-b border-[var(--border)] select-none">
              <tr>
                {/* Select All Checkbox */}
                <th className="w-10 px-3 py-3.5 text-center">
                  <button
                    onClick={handleSelectAllFiltered}
                    className="p-1 text-[var(--text3)] hover:text-purple-600 rounded cursor-pointer transition-colors"
                    title={selectedModels.size === filteredModels.length && filteredModels.length > 0 ? "Barchasini bekor qilish" : "Barchasini tanlash"}
                  >
                    {selectedModels.size > 0 && selectedModels.size === filteredModels.length ? (
                      <CheckSquare size={16} className="text-purple-600" />
                    ) : selectedModels.size > 0 ? (
                      <div className="w-4 h-4 rounded border-2 border-purple-600 bg-purple-600/20 flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-purple-600" />
                      </div>
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3.5 text-left font-black text-[var(--text2)] uppercase tracking-wider text-[10px]">
                  Model nomi
                </th>
                <th className="px-4 py-3.5 text-right font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[10px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Kirim (Tan) narxi</span>
                    <span className="text-[9px] lowercase font-normal opacity-70">(bosib tahrirlang)</span>
                  </div>
                </th>
                <th className="px-4 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[10px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Sotuv narxi</span>
                    <span className="text-[9px] lowercase font-normal opacity-70">(bosib tahrirlang)</span>
                  </div>
                </th>
                <th className="px-4 py-3.5 text-center font-black text-[var(--text2)] uppercase tracking-wider text-[10px]">
                  Foyda (Marja)
                </th>
                <th className="px-4 py-3.5 text-center font-black text-[var(--text2)] uppercase tracking-wider text-[10px]">
                  Tarix
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border)]">
              {filteredModels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--text3)]">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Search size={28} className="mx-auto text-[var(--text3)] opacity-40" />
                      <p className="font-bold text-sm text-[var(--text)]">Mos modellar topilmadi</p>
                      <p className="text-xs text-[var(--text3)]">Qidiruv so'zini yoki faol filtrlarni o'zgartirib ko'ring</p>
                    </div>
                  </td>
                </tr>
              ) : filteredModels.map((model, rowIndex) => {
                const p = prices[model];
                const cost = Number(p?.cost || 0);
                const sale = Number(p?.sale || 0);
                const isNoCost = cost <= 0;
                const isNoSale = sale <= 0;
                const isSelected = selectedModels.has(model);
                
                const margin = (cost > 0 && sale > 0) ? sale - cost : 0;
                const marginPercent = (cost > 0 && sale > 0) ? Math.round((margin / cost) * 100) : 0;

                const isEditingCost = editingCell?.model === model && editingCell?.field === 'cost';
                const isEditingSale = editingCell?.model === model && editingCell?.field === 'sale';

                const isSavedCost = recentlySavedCell === `${model}-cost`;
                const isSavedSale = recentlySavedCell === `${model}-sale`;

                return (
                  <tr 
                    key={model} 
                    className={cn(
                      "transition-colors group",
                      isSelected ? "bg-purple-500/5 hover:bg-purple-500/10" : "hover:bg-[var(--bg)]/80"
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleSelectModel(model)}
                        className="p-1 text-[var(--text3)] hover:text-purple-600 cursor-pointer rounded"
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-purple-600" />
                        ) : (
                          <Square size={16} className="group-hover:text-[var(--text2)]" />
                        )}
                      </button>
                    </td>

                    {/* Model Nomi va Status Badgelar */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "font-bold text-xs",
                          isModelArchived(model) ? "text-zinc-400" : "text-[var(--text)]"
                        )}>
                          {model}
                        </span>
                        {isModelArchived(model) && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-zinc-500/20 text-zinc-500 dark:text-zinc-400 border border-zinc-500/30 flex items-center gap-0.5">
                            <Archive size={9} /> Arxiv
                          </span>
                        )}
                        {isNoCost && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                            Tan narxsiz
                          </span>
                        )}
                        {isNoSale && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-rose-500/15 text-rose-500 border border-rose-500/25">
                            Sotuvsiz
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Kirim (Tan) Narxi — Excel-like Inline Editing Cell */}
                    <td 
                      className={cn(
                        "px-3 py-1.5 text-right transition-all cursor-pointer relative",
                        isEditingCost ? "p-1" : "hover:bg-amber-500/5",
                        isSavedCost && "bg-emerald-500/20"
                      )}
                      onClick={() => {
                        if (!isEditingCost) handleStartCellEdit(model, 'cost');
                      }}
                    >
                      {isEditingCost ? (
                        <div className="flex items-center justify-end gap-1">
                          <input 
                            ref={cellInputRef}
                            type="number" 
                            value={cellInputValue}
                            placeholder="0"
                            onChange={e => setCellInputValue(e.target.value)}
                            onBlur={() => handleSaveCell(model, 'cost', cellInputValue)}
                            onKeyDown={e => handleCellKeyDown(e, model, 'cost')}
                            className="w-32 px-2.5 py-1.5 bg-[var(--bg)] border-2 border-amber-500 rounded-lg text-right font-mono font-bold text-xs outline-none shadow-xs text-[var(--text)]"
                          />
                          <button
                            onMouseDown={e => {
                              e.preventDefault();
                              handleSaveCell(model, 'cost', cellInputValue);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                            title="Saqlash (Enter)"
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 group/cell">
                          <div className={cn(
                            "px-2 py-1 rounded-lg transition-all",
                            isNoCost ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : ""
                          )}>
                            {isNoCost ? (
                              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">0 UZS (Belgilanmagan)</span>
                            ) : (
                              formatCurrency(cost)
                            )}
                          </div>
                          <Edit2 size={12} className="opacity-0 group-hover/cell:opacity-60 text-[var(--text3)]" />
                        </div>
                      )}
                    </td>

                    {/* Sotuv Narxi — Excel-like Inline Editing Cell */}
                    <td 
                      className={cn(
                        "px-3 py-1.5 text-right transition-all cursor-pointer relative",
                        isEditingSale ? "p-1" : "hover:bg-emerald-500/5",
                        isSavedSale && "bg-emerald-500/20"
                      )}
                      onClick={() => {
                        if (!isEditingSale) handleStartCellEdit(model, 'sale');
                      }}
                    >
                      {isEditingSale ? (
                        <div className="flex items-center justify-end gap-1">
                          <input 
                            ref={cellInputRef}
                            type="number" 
                            value={cellInputValue}
                            placeholder="0"
                            onChange={e => setCellInputValue(e.target.value)}
                            onBlur={() => handleSaveCell(model, 'sale', cellInputValue)}
                            onKeyDown={e => handleCellKeyDown(e, model, 'sale')}
                            className="w-32 px-2.5 py-1.5 bg-[var(--bg)] border-2 border-emerald-500 rounded-lg text-right font-mono font-bold text-xs outline-none shadow-xs text-[var(--text)]"
                          />
                          <button
                            onMouseDown={e => {
                              e.preventDefault();
                              handleSaveCell(model, 'sale', cellInputValue);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                            title="Saqlash (Enter)"
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 group/cell">
                          <div className={cn(
                            "px-2 py-1 rounded-lg transition-all",
                            isNoSale ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" : ""
                          )}>
                            {isNoSale ? (
                              <span className="text-[11px] font-bold text-rose-500">0 UZS (Belgilanmagan)</span>
                            ) : (
                              formatCurrency(sale)
                            )}
                          </div>
                          <Edit2 size={12} className="opacity-0 group-hover/cell:opacity-60 text-[var(--text3)]" />
                        </div>
                      )}
                    </td>

                    {/* Foyda (Marja) */}
                    <td className="px-4 py-2.5 text-center">
                      {cost > 0 && sale > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "font-mono font-bold text-[11px]",
                            margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                          )}>
                            {margin >= 0 ? '+' : ''}{formatUzs(margin)} UZS
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text3)]">
                            ({marginPercent >= 0 ? '+' : ''}{marginPercent}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-[var(--text3)] opacity-40">-</span>
                      )}
                    </td>

                    {/* Amallar (Tarix va QR Yorliq va Arxiv) */}
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* QR / Shtrix-kod generator */}
                        <button 
                          onClick={() => setGeneratorModel(model)}
                          className="p-1.5 inline-flex items-center justify-center rounded-lg text-purple-600 hover:text-purple-700 hover:bg-purple-500/10 transition-colors cursor-pointer"
                          title="Shtrix-kod / QR-kod yorliq yaratish va chop etish"
                        >
                          <QrCode size={15} />
                        </button>

                        {/* Archive / Unarchive */}
                        <button 
                          onClick={() => toggleArchiveModel(model)}
                          className={cn(
                            "p-1.5 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer",
                            isModelArchived(model)
                              ? "text-zinc-400 hover:text-zinc-200 bg-zinc-700/40 hover:bg-zinc-700" 
                              : "text-[var(--text3)] hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-500/10"
                          )}
                          title={isModelArchived(model) ? "Arxivdan chiqarish (Faollashtirish)" : "Modelni arxivga o'tkazish"}
                        >
                          {isModelArchived(model) ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                        </button>

                        {/* Tarix */}
                        {p?.history?.length > 0 ? (
                          <button 
                            onClick={() => setHistoryModal(model)}
                            className="p-1.5 inline-flex items-center justify-center rounded-lg text-[var(--text3)] hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                            title="Narx o'zgarishlar tarixini ko'rish"
                          >
                            <History size={15} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="p-3 bg-[var(--bg)] border-t border-[var(--border)] flex flex-wrap items-center justify-between text-xs font-bold text-[var(--text3)] gap-2">
          <div className="flex items-center gap-3">
            <span>Ko'rsatilmoqda: <strong className="text-[var(--text)]">{filteredModels.length}</strong> / {allModels.length} model</span>
            {selectedModels.size > 0 && (
              <span className="text-purple-600 dark:text-purple-400 font-extrabold">• {selectedModels.size} ta tanlangan</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-normal text-[var(--text3)]">
              💡 Maslahat: Har qanday narx katagiga bosib, Excel kabi <kbd className="px-1.5 py-0.5 bg-[var(--bg2)] border border-[var(--border)] rounded text-[10px] font-bold">Tab</kbd> va <kbd className="px-1.5 py-0.5 bg-[var(--bg2)] border border-[var(--border)] rounded text-[10px] font-bold">Enter</kbd> orqali tez tahrirlashingiz mumkin.
            </span>
          </div>
        </div>
      </div>

      {/* 6. OMMAVIY NARX BELGILASH MODAL (BULK EDIT MODAL) */}
      {bulkModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBulkModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Ommaviy Narx Belgilash (Bulk Edit)</h3>
                  <p className="text-xs text-[var(--text3)]">
                    Tanlangan <strong className="text-purple-600 dark:text-purple-400">{selectedModels.size} ta</strong> model narxini bir vaqtda o'zgartirish
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto min-h-0 flex-1 space-y-5">
              
              {/* Quick Model Target Selection helpers */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] gap-2 flex-wrap text-xs">
                <span className="font-bold text-[var(--text2)]">Tezkor tanlov:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllUnpricedCost}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold transition-colors cursor-pointer"
                  >
                    Tan narxi yo'qlar ({filterStats.noCost})
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllUnpricedSale}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold transition-colors cursor-pointer"
                  >
                    Sotuv narxi yo'qlar ({filterStats.noSale})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModels(new Set(allModels))}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 font-bold transition-colors cursor-pointer"
                  >
                    Barcha modellar ({allModels.length})
                  </button>
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-3 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs font-bold gap-1">
                <button
                  type="button"
                  onClick={() => setBulkMode('adjust')}
                  className={cn(
                    "py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    bulkMode === 'adjust' ? "bg-[var(--bg2)] text-purple-600 shadow-xs font-extrabold border border-[var(--border)]" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  <ArrowUpDown size={14} />
                  <span>Ustama / Chegirma</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode('set-exact')}
                  className={cn(
                    "py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    bulkMode === 'set-exact' ? "bg-[var(--bg2)] text-purple-600 shadow-xs font-extrabold border border-[var(--border)]" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  <DollarSign size={14} />
                  <span>Aniq Narx Belgilash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode('markup-from-cost')}
                  className={cn(
                    "py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    bulkMode === 'markup-from-cost' ? "bg-[var(--bg2)] text-purple-600 shadow-xs font-extrabold border border-[var(--border)]" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  <Percent size={14} />
                  <span>Tan Narxdan Sotuv</span>
                </button>
              </div>

              {/* Mode 1: Ustama / Chegirma qo'shish */}
              {bulkMode === 'adjust' && (
                <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">Qaysi narxga:</label>
                      <select
                        value={bulkTarget}
                        onChange={e => setBulkTarget(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none"
                      >
                        <option value="sale">Faqat Sotuv narxiga</option>
                        <option value="cost">Faqat Tan narxga</option>
                        <option value="both">Har ikkala narxga</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">Amaliyot:</label>
                      <div className="flex bg-[var(--bg2)] p-1 border border-[var(--border)] rounded-xl">
                        <button
                          type="button"
                          onClick={() => setBulkActionType('add')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1",
                            bulkActionType === 'add' ? "bg-emerald-500 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          <Plus size={13} />
                          <span>Qo'shish (+)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkActionType('subtract')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1",
                            bulkActionType === 'subtract' ? "bg-rose-500 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          <Minus size={13} />
                          <span>Ayirish (-)</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">Birlik:</label>
                      <div className="flex bg-[var(--bg2)] p-1 border border-[var(--border)] rounded-xl">
                        <button
                          type="button"
                          onClick={() => setBulkUnitType('amount')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            bulkUnitType === 'amount' ? "bg-purple-600 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          So'mda (UZS)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkUnitType('percent')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            bulkUnitType === 'percent' ? "bg-purple-600 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          Foizda (%)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">
                      {bulkActionType === 'add' ? 'Qo\'shiladigan' : 'Ayiriladigan'} qiymat:
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        value={bulkAdjustValue}
                        onChange={e => setBulkAdjustValue(e.target.value)}
                        placeholder="5000"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] outline-none focus:border-purple-500"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text3)]">
                        {bulkUnitType === 'amount' ? 'UZS' : '%'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: Aniq Narx Belgilash */}
              {bulkMode === 'set-exact' && (
                <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-4">
                  <p className="text-xs text-[var(--text2)]">
                    Tanlangan barcha modellarga bir xil aniq narx belgilash. (O'zgarishsiz qoldirish uchun maydonni bo'sh qoldiring):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400 block mb-1.5">
                        Kirim (Tan) narxi (UZS):
                      </label>
                      <input 
                        type="number"
                        value={bulkExactCost}
                        onChange={e => setBulkExactCost(e.target.value)}
                        placeholder="Masalan: 85000"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400 block mb-1.5">
                        Sotuv narxi (UZS):
                      </label>
                      <input 
                        type="number"
                        value={bulkExactSale}
                        onChange={e => setBulkExactSale(e.target.value)}
                        placeholder="Masalan: 120000"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 3: Tan Narxdan Sotuv narxini hisoblash (Markup) */}
              {bulkMode === 'markup-from-cost' && (
                <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-4">
                  <p className="text-xs text-[var(--text2)]">
                    Tanlangan modellarning Tan narxiga ustama marjasi qo'shib, Sotuv narxini avtomatik hisoblash:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">Ustama turi:</label>
                      <div className="flex bg-[var(--bg2)] p-1 border border-[var(--border)] rounded-xl">
                        <button
                          type="button"
                          onClick={() => setBulkMarkupType('percent')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            bulkMarkupType === 'percent' ? "bg-purple-600 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          Foizda (+%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkMarkupType('amount')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            bulkMarkupType === 'amount' ? "bg-purple-600 text-white font-extrabold shadow-2xs" : "text-[var(--text3)]"
                          )}
                        >
                          So'mda (+UZS)
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-[var(--text3)] block mb-1.5">Ustama miqdori:</label>
                      <div className="relative">
                        <input 
                          type="number"
                          value={bulkMarkupValue}
                          onChange={e => setBulkMarkupValue(e.target.value)}
                          placeholder="20"
                          className="w-full px-3.5 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] outline-none focus:border-purple-500"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text3)]">
                          {bulkMarkupType === 'percent' ? '%' : 'UZS'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Real-time Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black uppercase text-[var(--text3)]">
                    Natija ko'rinishi (Preview — {Math.min(selectedModels.size, 8)} ta namuna):
                  </span>
                  <span className="text-[11px] text-purple-600 dark:text-purple-400 font-bold">
                    Jami {selectedModels.size} modelga qo'llanadi
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)] text-xs">
                  {Array.from(selectedModels).slice(0, 15).map(m => {
                    const oldP = prices[m] || { cost: 0, sale: 0 };
                    const { nextCost, nextSale } = calculateBulkPrice(Number(oldP.cost || 0), Number(oldP.sale || 0));

                    return (
                      <div key={m} className="p-2.5 flex items-center justify-between hover:bg-[var(--bg2)] transition-colors">
                        <span className="font-bold text-[var(--text)]">{m}</span>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <span className="text-[10px] text-[var(--text3)] block">Tan narx:</span>
                            <span className="font-mono text-[var(--text2)]">
                              {oldP.cost ? formatUzs(oldP.cost) : '0'} → <strong className="text-amber-600 dark:text-amber-400">{formatUzs(nextCost)}</strong> UZS
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text3)] block">Sotuv narxi:</span>
                            <span className="font-mono text-[var(--text2)]">
                              {oldP.sale ? formatUzs(oldP.sale) : '0'} → <strong className="text-emerald-600 dark:text-emerald-400">{formatUzs(nextSale)}</strong> UZS
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {selectedModels.size > 15 && (
                    <div className="p-2 text-center text-[11px] text-[var(--text3)] italic">
                      ...va yana {selectedModels.size - 15} ta model
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleApplyBulkEdit}
                disabled={selectedModels.size === 0}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-purple-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <CheckCheck size={16} />
                <span>Ha, {selectedModels.size} ta model narxini saqlash</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. HISTORY MODAL */}
      {historyModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHistoryModal(null);
          }}
        >
          <div 
            className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-[var(--text)]">
                <History size={20} className="text-blue-500" />
                {historyModal} tarixi
              </h3>
              <button 
                onClick={() => setHistoryModal(null)}
                className="p-2 text-[var(--text3)] hover:text-[var(--text)] rounded-xl hover:bg-[var(--bg2)] transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {prices[historyModal]?.history?.length > 0 ? (
                [...prices[historyModal].history].reverse().map((h, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
                    <div className="space-y-1">
                      <p className="text-xs text-[var(--text3)]">{formatDate(h.date)}</p>
                      <p className="text-sm font-medium text-[var(--text)]">{h.changedBy}</p>
                    </div>
                    <div className="text-right flex gap-3 text-sm">
                      <div>
                        <p className="text-[var(--text3)] text-xs">Eski Tan narx</p>
                        <p className="text-[var(--text2)] font-medium">{formatCurrency(h.cost)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text3)] text-xs">Eski Sotuv</p>
                        <p className="text-emerald-500 font-medium">{formatCurrency(h.sale)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-[var(--text3)] py-8">Tarix mavjud emas</p>
              )}
            </div>
            
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg2)] shrink-0">
              <button 
                onClick={() => setHistoryModal(null)}
                className="w-full py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl font-medium text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. BATCH UNPRICED SYNC MODAL */}
      {syncModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSyncing) setSyncModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-xl w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header (fixed) */}
            <div className="px-6 py-4.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Narxsiz Operatsiyalarni Hisoblash & Sinxronlash</h3>
                  <p className="text-xs text-[var(--text3)]">Modellar narxlari bo'yicha chiqimlar, mijozlar qarzlari va kirim tan narxlarini to'liq yangilash</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto min-h-0 flex-1 space-y-5 overscroll-contain">
              {/* Quick KPI Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Chiqimlar</span>
                  <p className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {unpricedStats.resolvableChiqimCount} ta
                  </p>
                  <span className="text-[10px] text-[var(--text3)]">({unpricedStats.resolvableChiqimQty} juft)</span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Kirimlarga Tan Narx</span>
                  <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                    {unpricedStats.resolvableKirimCount} ta
                  </p>
                  <span className="text-[10px] text-[var(--text3)]">({unpricedStats.resolvableKirimQty} juft)</span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Mijozlar Qarzi</span>
                  <p className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                    {unpricedStats.impactedClients.length} mijoz
                  </p>
                  <span className="text-[10px] text-[var(--text3)]">CRM bo'yicha</span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Chiqim Qiymati</span>
                  <p className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                    +{formatUzs(unpricedStats.estimatedTotalSum)}
                  </p>
                  <span className="text-[9px] font-bold text-emerald-500">UZS</span>
                </div>
              </div>

              {/* Explanatory text */}
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 text-xs font-medium leading-relaxed flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <div>
                  <strong>Ushbu amaliyot nima qiladi?</strong>
                  <p className="mt-0.5">
                    Avvalroq narxi belgilanmasdan amalga oshirilgan barcha chiqim va kirim operatsiyalarini hozirgi kiritilgan model narxlariga ko'paytirib chiqadi. Chiqimlar bo'yicha mijozlarning umumiy xarid summasi hamda qarzdorligini, kirimlar bo'yicha esa omborga kirish tan narxlarini avtomatik to'g'rilaydi.
                  </p>
                </div>
              </div>

              {/* List of items that will be updated */}
              {unpricedStats.details.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase text-[var(--text3)]">Aniqlangan amaliyotlar ({unpricedStats.details.length} ta):</span>
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)] text-xs">
                    {unpricedStats.details.map((item, dIdx) => (
                      <div key={`${item.id || 'unpriced'}_${dIdx}`} className="p-2.5 flex items-center justify-between hover:bg-[var(--bg2)] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${item.amal === 'kirim' ? 'bg-amber-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'}`}>
                              {item.amal}
                            </span>
                            <span className="font-bold text-[var(--text)]">{item.model} ({item.olcham}°)</span>
                            <span className="text-[var(--text3)]">• {item.soni} juft</span>
                          </div>
                          <p className="text-[11px] text-[var(--text3)] mt-0.5">
                            {item.amal === 'kirim' ? 'Manba' : 'Mijoz'}: <span className="font-semibold text-[var(--text2)]">{item.kimdan}</span> ({item.sana})
                          </p>
                        </div>
                        <div className="text-right">
                          {item.canResolve ? (
                            <>
                              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">+{formatUzs(item.newSumma)} UZS</span>
                              <p className="text-[10px] text-[var(--text3)]">@{formatUzs(item.unitPrice)} UZS/juft</p>
                            </>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              Model narxi belgilanmagan
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions (fixed footer) */}
            <div className="px-6 py-4 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                disabled={isSyncing}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleRunSyncAll}
                disabled={isSyncing || (unpricedStats.resolvableChiqimCount === 0 && unpricedStats.resolvableKirimCount === 0)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-emerald-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                <span>{isSyncing ? "Hisoblanmoqda..." : "Ha, barchasini hisoblash va to'liq saqlash"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Barcode & QR Label Generator Modal */}
      {generatorModel && (
        <BarcodeGeneratorModal
          isOpen={!!generatorModel}
          onClose={() => setGeneratorModel(null)}
          model={generatorModel}
          price={db.prices?.[generatorModel]?.sale || db.prices?.[generatorModel]?.cost || 0}
          availableSizes={ALL_SIZES}
        />
      )}

    </div>
  );
}
