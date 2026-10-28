import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { produce } from 'immer';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { useStock } from '../hooks/useStock';
import { getCat, cn, ALL_SIZES, generateId, getNowStr, getTodayStr, formatCompact, formatUzs } from '../lib/utils';
import { DbState, Transaction } from '../types';
import { exportToExcel, exportToPdf, exportToCSV } from '../lib/exportUtils';
import { toast } from 'sonner';
import LowStockAlert from '../components/LowStockAlert';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { ModelHistoryModal } from '../components/ModelHistoryModal';
import { BarcodeScannerModal, ScanResult } from '../components/BarcodeScannerModal';
import { 
  Package, Snowflake, Sun, Search, LayoutGrid, List, FileDown, 
  Layers, Box, FileSpreadsheet, AlertTriangle, Lock, Unlock, 
  Filter, Printer, Pencil, ArrowLeftRight, History, Plus, 
  ChevronDown, ChevronRight, CheckSquare, Square, Download, 
  Eye, TrendingUp, Sparkles, X, ShieldAlert, ArrowRight, 
  Clock, DollarSign, BarChart3, Check, RefreshCw, Upload,
  ChevronsDown, ChevronsUp, Archive, ArchiveRestore, Camera, SlidersHorizontal, Boxes
} from 'lucide-react';
import { Button } from '../components/ui/CommonComponents';

export default function OmborPage() {
  const { db, currentOmbor, currentUser, setDb, toggleArchiveModel, isModelArchived } = useDb();
  const { logAudit } = useAudit();
  const { stock, getStockForModel, getQuantity, getTotalQuantity } = useStock();

  const transactions = db[currentOmbor]?.transactions || [];
  const otherOmbor = currentOmbor === 'tepa' ? 'kotta' : 'tepa';
  const otherStock = db[otherOmbor]?.stock || {};
  const prices = db.prices || {};

  const isOmborchi = currentUser?.rol === 'omborchi';

  // Filters & View State
  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState<'all' | 'out' | 'critical' | 'low' | 'frozen' | 'top' | 'archived'>('all');
  const [seasonFilter, setSeasonFilter] = useState<'all' | 'qishki' | 'yozgi' | 'umumiy'>('all');
  const [sortBy, setSortBy] = useState<'total-desc' | 'total-asc' | 'value-desc' | 'name-asc' | 'out-desc'>('total-desc');
  
  // Responsive default: 'cards' on phones, 'table' on desktop
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'cards';
    }
    return 'table';
  });

  const [compareWarehouses, setCompareWarehouses] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Expandable Rows (Size breakdown open states)
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  // Bulk Selection
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Inline Total / Size Editing State
  const [editingTotalModel, setEditingTotalModel] = useState<string | null>(null);
  const [editTotalValue, setEditTotalValue] = useState<string>('');
  const [editingSizeCell, setEditingSizeCell] = useState<{ model: string; size: string } | null>(null);
  const [editSizeValue, setEditSizeValue] = useState<string>('');
  const [highlightedModel, setHighlightedModel] = useState<string | null>(null);

  // Quick Action Modals
  const [historyModalModel, setHistoryModalModel] = useState<string | null>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isScannerOpen) setIsScannerOpen(false);
        else if (historyModalModel) setHistoryModalModel(null);
        else if (isExcelImportOpen) setIsExcelImportOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyModalModel, isExcelImportOpen, isScannerOpen]);

  // Barcode / QR scan handler
  const handleBarcodeScan = (result: ScanResult) => {
    if (result.model) {
      setSearch(result.model);
      toast.success(`Shtrix-kod skanerlandi: ${result.model} ${result.size ? `(${result.size}-o'lcham)` : ''}`);
      setIsScannerOpen(false);
    }
  };

  const searchInputRef = useRef<HTMLInputElement>(null);
  const allModels = Object.keys(stock);

  // Deferred values for 60fps buttery smooth typing and UI response
  const deferredSearch = React.useDeferredValue(search);
  const deferredActivePill = React.useDeferredValue(activePill);
  const deferredSeasonFilter = React.useDeferredValue(seasonFilter);
  const deferredSortBy = React.useDeferredValue(sortBy);

  // Safe frozen set for O(1) lookups
  const muzlatilgan: string[] = useMemo(() => {
    const raw = db.muzlatilgan;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.values(raw) as string[];
    return [];
  }, [db.muzlatilgan]);

  const frozenSet = useMemo(() => new Set(muzlatilgan), [muzlatilgan]);

  // Model Chiqim Volume in last 30 days (for Top Sold calculation) - computed efficiently
  const modelOutVolume30Days = useMemo(() => {
    const map: Record<string, number> = {};
    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff30ISO = cutoff30.toISOString().slice(0, 10);

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      if ((t.amal === 'chiqim' || t.amal === 'otkazma-out') && t.model && t.sana >= cutoff30ISO) {
        map[t.model] = (map[t.model] || 0) + (Number(t.soni) || 0);
      }
    }
    return map;
  }, [transactions]);

  // High-performance precalculated indexed map for O(1) instant lookups
  const modelStatsMap = useMemo(() => {
    const archivedList = db.archivedModels || [];
    const archivedSet = new Set(archivedList);

    const map = new Map<string, {
      total: number;
      cat: string;
      isFrozen: boolean;
      isArchived: boolean;
      costPrice: number;
      salePrice: number;
      outVol: number;
    }>();

    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      const s = stock[m] || {};
      let total = 0;
      for (const sz in s) {
        total += Number(s[sz]) || 0;
      }
      const cat = getCat(m);
      const isFrozen = frozenSet.has(m);
      const isArchived = archivedSet.has(m);
      const p = prices[m];
      const costPrice = p?.cost || 0;
      const salePrice = p?.sale || 0;
      const outVol = modelOutVolume30Days[m] || 0;

      map.set(m, { total, cat, isFrozen, isArchived, costPrice, salePrice, outVol });
    }
    return map;
  }, [allModels, stock, frozenSet, prices, modelOutVolume30Days, db.archivedModels]);

  const modelTotal = useCallback((m: string) => modelStatsMap.get(m)?.total || 0, [modelStatsMap]);
  const otherModelTotal = useCallback((m: string) => {
    const s = otherStock[m] || {};
    let sum = 0;
    for (const sz in s) {
      sum += Number(s[sz]) || 0;
    }
    return sum;
  }, [otherStock]);

  // 1. KPI & FINANCIAL STATS CALCULATION (Instant O(N) single-pass)
  const kpiStats = useMemo(() => {
    let totalPairs = 0;
    let totalCostVal = 0;
    let totalSaleVal = 0;
    let frozenPairs = 0;
    let frozenVal = 0;
    let frozenCount = 0;
    let criticalCount = 0;
    let lowCount = 0;
    let outOfStockCount = 0;
    let archivedCount = 0;
    let qishkiPairs = 0;
    let yozgiPairs = 0;
    let umumiyPairs = 0;

    modelStatsMap.forEach((stats) => {
      if (stats.isArchived) {
        archivedCount += 1;
      }

      const qty = stats.total;
      totalPairs += qty;
      totalCostVal += qty * stats.costPrice;
      totalSaleVal += qty * stats.salePrice;

      if (stats.cat === 'qishki') qishkiPairs += qty;
      else if (stats.cat === 'yozgi') yozgiPairs += qty;
      else umumiyPairs += qty;

      if (qty === 0) outOfStockCount += 1;
      else if (qty < 10) criticalCount += 1;
      else if (qty < 30) lowCount += 1;

      if (stats.isFrozen && qty > 0) {
        frozenPairs += qty;
        frozenCount += 1;
        frozenVal += qty * (stats.costPrice || stats.salePrice || 0);
      }
    });

    return {
      totalPairs,
      totalCostVal,
      totalSaleVal,
      frozenPairs,
      frozenVal,
      frozenCount,
      criticalCount,
      lowCount,
      outOfStockCount,
      archivedCount,
      qishkiPairs,
      yozgiPairs,
      umumiyPairs,
      totalModelsCount: allModels.length
    };
  }, [modelStatsMap, allModels.length]);

  // Automatic Background Freeze of Idle Stock (14+ days)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      let hasChanges = false;
      const rawMuz = db.muzlatilgan;
      const currentMuzlatilgan = Array.isArray(rawMuz) ? [...rawMuz] : (rawMuz && typeof rawMuz === 'object' ? Object.values(rawMuz) as string[] : []);
      const cutoff14 = new Date();
      cutoff14.setDate(cutoff14.getDate() - 14);
      const cutoff14ISO = cutoff14.toISOString().slice(0, 10);
      
      const firstTxDate = new Map<string, string>();
      const lastOutDate = new Map<string, string>();
      
      for (const t of transactions) {
        if (!t.model || !t.sana) continue;
        if (!firstTxDate.has(t.model) || t.sana < firstTxDate.get(t.model)!) {
          firstTxDate.set(t.model, t.sana);
        }
        if (t.amal === 'chiqim' || t.amal === 'otkazma-out') {
          if (!lastOutDate.has(t.model) || t.sana > lastOutDate.get(t.model)!) {
            lastOutDate.set(t.model, t.sana);
          }
        }
      }

      allModels.forEach(m => {
        if (currentMuzlatilgan.includes(m)) return;
        
        const c = getCat(m);
        const currentMonth = new Date().getMonth();
        let isOffSeason = false;
        if (c === 'qishki' && currentMonth >= 2 && currentMonth <= 9) isOffSeason = true;
        if (c === 'yozgi' && (currentMonth < 4 || currentMonth > 7)) isOffSeason = true;
        if (isOffSeason) return;
        
        const firstSana = firstTxDate.get(m);
        if (!firstSana || firstSana > cutoff14ISO) return;
        
        const latestOut = lastOutDate.get(m);
        const hasRecentOut = latestOut && latestOut > cutoff14ISO;
        
        if (!hasRecentOut && Number(modelTotal(m)) > 0) {
          currentMuzlatilgan.push(m);
          hasChanges = true;
        }
      });

      if (hasChanges && currentMuzlatilgan.length > (Array.isArray(rawMuz) ? rawMuz.length : 0)) {
        setDb(prev => ({ ...prev, muzlatilgan: currentMuzlatilgan }));
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [transactions.length, currentOmbor]);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter & Search Logic - Lightning fast single-pass O(N) filtering
  const filteredModels = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const result: string[] = [];

    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      const stats = modelStatsMap.get(m);
      if (!stats) continue;

      if (q) {
        const qtyMatch = !isNaN(Number(q)) && stats.total === Number(q);
        const nameMatch = m.toLowerCase().includes(q);
        const catMatch = stats.cat.toLowerCase().includes(q);
        if (!nameMatch && !catMatch && !qtyMatch) continue;
      }

      // Status pill filter
      if (deferredActivePill === 'archived') {
        if (!stats.isArchived) continue;
      } else {
        // By default, hide archived models unless 'archived' pill is active or user explicitly searched
        if (stats.isArchived && !q) continue;

        if (deferredActivePill === 'out' && stats.total !== 0) continue;
        if (deferredActivePill === 'critical' && !(stats.total > 0 && stats.total < 10)) continue;
        if (deferredActivePill === 'low' && !(stats.total >= 10 && stats.total < 30)) continue;
        if (deferredActivePill === 'frozen' && !stats.isFrozen) continue;
        if (deferredActivePill === 'top' && !(stats.outVol >= 30)) continue;
      }

      // Season filter
      if (deferredSeasonFilter !== 'all' && stats.cat !== deferredSeasonFilter) continue;

      result.push(m);
    }

    // Sort using precalculated properties
    result.sort((a, b) => {
      const stA = modelStatsMap.get(a);
      const stB = modelStatsMap.get(b);
      if (!stA || !stB) return 0;

      if (deferredSortBy === 'total-desc') return stB.total - stA.total;
      if (deferredSortBy === 'total-asc') return stA.total - stB.total;
      if (deferredSortBy === 'name-asc') return a.localeCompare(b);
      if (deferredSortBy === 'value-desc') {
        const valA = stA.total * (stA.salePrice || stA.costPrice || 0);
        const valB = stB.total * (stB.salePrice || stB.costPrice || 0);
        return valB - valA;
      }
      if (deferredSortBy === 'out-desc') {
        return stB.outVol - stA.outVol;
      }
      return 0;
    });

    return result;
  }, [allModels, deferredSearch, deferredActivePill, deferredSeasonFilter, deferredSortBy, modelStatsMap]);

  const totalPages = Math.ceil(filteredModels.length / itemsPerPage) || 1;
  const paginatedModels = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredModels.slice(start, start + itemsPerPage);
  }, [filteredModels, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activePill, seasonFilter, sortBy]);

  const canManage = currentUser?.rol === 'admin';

  // Toggle Row Expansion
  const toggleRowExpand = (m: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedModels(new Set(paginatedModels));
  };

  const collapseAll = () => {
    setExpandedModels(new Set());
  };

  // Toggle Selection
  const toggleSelect = (m: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedModels.size === filteredModels.length && filteredModels.length > 0) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(filteredModels));
    }
  };

  // Inline Total Quantity Update
  const updateTotalQuantity = (model: string, newTotalStr: string) => {
    const parsed = parseInt(newTotalStr);
    if (isNaN(parsed) && newTotalStr !== '') {
      toast.error("Faqat raqam kiriting!");
      setEditingTotalModel(null);
      return;
    }
    const newTotal = parsed || 0;
    const oldTotalRef = modelTotal(model);

    if (newTotal === oldTotalRef) {
      setEditingTotalModel(null);
      return;
    }

    try {
      setDb(produce((draft: DbState) => {
        const stock = draft[currentOmbor].stock;
        if (!stock[model]) stock[model] = {};
        
        const currentStock = stock[model];
        const oldTotal = Object.values(currentStock).reduce((a, v) => Number(a) + (Number(v) || 0), 0) as number;

        if (newTotal === oldTotal) return;

        const diff = newTotal - oldTotal;
        
        if (diff > 0) {
          currentStock['40'] = (currentStock['40'] || 0) + diff;
        } else {
          let toRemove = Math.abs(diff);
          for (const sz of Object.keys(currentStock)) {
            if (toRemove <= 0) break;
            const qty = currentStock[sz] || 0;
            if (qty > 0) {
              const remove = Math.min(qty, toRemove);
              currentStock[sz] = qty - remove;
              toRemove -= remove;
            }
          }
          if (toRemove > 0) {
            const current40 = currentStock['40'] || 0;
            currentStock['40'] = Math.max(0, current40 - toRemove);
          }
        }

        draft[currentOmbor].transactions.push({
          id: generateId(),
          vaqt: getNowStr(),
          sana: getTodayStr(),
          amal: 'tuzatish',
          model,
          olcham: '40',
          soni: Math.abs(diff),
          kimdan: 'Admin tahrir (Audit)',
          izoh: `Qo'lda tahrirlandi (Jami): ${oldTotal} → ${newTotal} (${diff > 0 ? '+' : ''}${diff})`,
          xodim: currentUser!.ism,
          summa: 0,
          isCorrection: true
        });
      }));

      logAudit('Ombor qoldiq tahriri', `Model: ${model}`, `Qoldiq ${oldTotalRef} tadan ${newTotal} taga o'zgartirildi`, Math.abs(newTotal - oldTotalRef) > 100 ? 'high' : 'warning');
      setEditingTotalModel(null);
      setHighlightedModel(model);
      setTimeout(() => setHighlightedModel(null), 1800);
      toast.success(`${model} jami miqdori yangilandi!`);
    } catch (error) {
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  // Inline Specific Size Quantity Update
  const updateSizeQuantity = (model: string, sz: string, newStrVal: string) => {
    const parsed = parseInt(newStrVal);
    if (isNaN(parsed) && newStrVal !== '') {
      toast.error("Faqat raqam kiriting!");
      setEditingSizeCell(null);
      return;
    }
    const newVal = parsed || 0;
    const oldVal = stock[model]?.[sz] || 0;

    if (newVal === oldVal) {
      setEditingSizeCell(null);
      return;
    }

    try {
      setDb(produce((draft: DbState) => {
        const stock = draft[currentOmbor].stock;
        if (!stock[model]) stock[model] = {};
        stock[model][sz] = Math.max(0, newVal);
        
        draft[currentOmbor].transactions.push({
          id: generateId(),
          vaqt: getNowStr(),
          sana: getTodayStr(),
          amal: 'tuzatish',
          model,
          olcham: sz,
          soni: Math.abs(newVal - oldVal),
          kimdan: 'Admin o\'lcham tuzatish (Audit)',
          izoh: `O'lcham (${sz}) tahrirlandi: ${oldVal} → ${newVal} (${newVal - oldVal > 0 ? '+' : ''}${newVal - oldVal})`,
          xodim: currentUser!.ism,
          summa: 0,
          isCorrection: true
        });
      }));

      logAudit('Ombor o\'lcham tahriri', `Model: ${model}, O'lcham: ${sz}`, `Miqdor ${oldVal} tadan ${newVal} taga tahrirlandi`, Math.abs(newVal - oldVal) > 50 ? 'high' : 'warning');
      setEditingSizeCell(null);
      toast.success(`${model} (${sz}-o'lcham) yangilandi!`);
    } catch (error) {
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  // Freeze / Unfreeze Single Model
  const toggleFreeze = (m: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDb(prev => {
        const rawPrev = prev.muzlatilgan;
        const currentArr = Array.isArray(rawPrev) ? rawPrev : (rawPrev && typeof rawPrev === 'object' ? Object.values(rawPrev) as string[] : []);
        const newF = [...currentArr];
        if (newF.includes(m)) {
          return { ...prev, muzlatilgan: newF.filter(x => x !== m) };
        } else {
          newF.push(m);
          return { ...prev, muzlatilgan: newF };
        }
      });
      toast.success(`${m} holati o'zgartirildi.`);
    } catch (error) {
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  // Bulk Freeze / Unfreeze
  const handleBulkFreeze = (freezeAction: boolean) => {
    if (selectedModels.size === 0) return;
    setDb(prev => {
      const rawPrev = prev.muzlatilgan;
      const currentArr = Array.isArray(rawPrev) ? rawPrev : (rawPrev && typeof rawPrev === 'object' ? Object.values(rawPrev) as string[] : []);
      let newF: string[];
      if (freezeAction) {
        const combined = new Set([...currentArr, ...Array.from(selectedModels)]);
        newF = Array.from(combined);
      } else {
        newF = currentArr.filter(m => !selectedModels.has(m));
      }
      return { ...prev, muzlatilgan: newF };
    });
    toast.success(`${selectedModels.size} ta model ${freezeAction ? 'muzlatildi' : 'muzlatishdan ochildi'}`);
    setSelectedModels(new Set());
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

  // Export handlers
  const handleExportExcel = (exportSelectedOnly: boolean = false) => {
    const list = exportSelectedOnly ? filteredModels.filter(m => selectedModels.has(m)) : filteredModels;
    if (list.length === 0) {
      toast.error("Eksport uchun modellar mavjud emas");
      return;
    }

    const headers = [
      '№',
      'Model Nomi',
      'Tur',
      'Holati',
      'Jami Qoldiq (Juft)',
      '39-o\'lcham',
      '40-o\'lcham',
      '41-o\'lcham',
      '42-o\'lcham',
      '43-o\'lcham',
      '44-o\'lcham',
      '45-o\'lcham',
      'Tannarx (UZS)',
      'Sotuv Narx (UZS)',
      'Zaxira Qiymati (UZS)'
    ];

    const rows = list.map((m, idx) => {
      const qty = Number(modelTotal(m));
      const isFrozen = muzlatilgan.includes(m);
      const cat = getCat(m);
      const s = stock[m] || {};
      const cost = prices[m]?.cost || 0;
      const sale = prices[m]?.sale || 0;
      const totalVal = qty * (sale || cost);

      let status = isFrozen ? 'Muzlatilgan' : qty === 0 ? 'Tugagan' : qty < 10 ? 'Kritik kam' : qty < 30 ? 'Kam qolgan' : 'Yetarli';

      return [
        idx + 1,
        m,
        cat === 'qishki' ? 'Qishki' : cat === 'yozgi' ? 'Yozgi' : 'Umumiy',
        status,
        qty,
        s['39'] || 0,
        s['40'] || 0,
        s['41'] || 0,
        s['42'] || 0,
        s['43'] || 0,
        s['44'] || 0,
        s['45'] || 0,
        cost,
        sale,
        totalVal
      ];
    });

    const filename = `${currentOmbor.toUpperCase()}_Ombor_Qoldiqlari_${list.length}_ta`;
    exportToExcel([headers, ...rows], filename, 'Ombor Qoldiqlari');
    toast.success("Excel hisoboti muvaffaqiyatli yuklab olindi!");
  };

  const handleExportPdf = () => {
    const tableData = filteredModels.map((m, i) => {
      const t = Number(modelTotal(m));
      const h = muzlatilgan.includes(m) ? 'Muzlagan' : t === 0 ? 'Tugagan' : t < 10 ? 'Kritik' : t < 30 ? 'Kam' : 'Yetarli';
      return [i + 1, m, getCat(m), t, h];
    });
    exportToPdf(`Ombor: ${currentOmbor.toUpperCase()}`, ['#', 'Model nomi', 'Tur', 'Jami (juft)', 'Holat'], tableData, `${currentOmbor}_ombor`);
  };

  if (showAlerts) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300">
        <div className="flex justify-between items-center bg-[var(--bg2)] p-4 sm:p-6 rounded-3xl border border-[var(--border)] shadow-xs">
          <div className="flex items-center gap-3 text-rose-500">
            <AlertTriangle size={24} />
            <h2 className="text-[16px] sm:text-[18px] font-black uppercase tracking-wider">Kam qolgan mollar zaxirasi</h2>
          </div>
          <button 
            onClick={() => setShowAlerts(false)}
            className="px-5 py-2.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded-2xl text-[13px] font-bold hover:bg-[var(--border)] transition-colors cursor-pointer"
          >
            Orqaga qaytish
          </button>
        </div>
        <LowStockAlert db={db} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
      
      {/* 1. TOP HEADER & OMBORE TITLE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--bg2)] p-4 sm:p-5 rounded-3xl border border-[var(--border)] shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-600 flex items-center justify-center font-black">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-[var(--text)] flex items-center gap-2">
                Ombor Qoldiqlari & Zaxira Boshqaruvi
                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 text-xs font-black uppercase tracking-wider">
                  {currentOmbor.toUpperCase()}
                </span>
              </h1>
              <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
                Jami {kpiStats.totalModelsCount} ta model, {kpiStats.totalPairs.toLocaleString()} juft mahsulot mavjud
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          
          {/* Compare Warehouses Switch */}
          <button
            onClick={() => setCompareWarehouses(!compareWarehouses)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs",
              compareWarehouses 
                ? "bg-purple-600 text-white border-purple-600 shadow-purple-500/20" 
                : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/50"
            )}
            title="Tepa va Kotta omborlarni yonma-yon solishtirish"
          >
            <ArrowLeftRight size={14} />
            <span className="hidden sm:inline">Omborlarni Taqqoslash</span>
          </button>

          {/* Low Stock Alert */}
          {kpiStats.criticalCount > 0 && (
            <button 
              onClick={() => setShowAlerts(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/30 text-xs font-black bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all shadow-xs cursor-pointer animate-pulse"
            >
              <AlertTriangle size={14} />
              <span>{kpiStats.criticalCount} ta kritik</span>
            </button>
          )}

          {/* Excel Export */}
          <button 
            onClick={() => handleExportExcel(false)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] text-xs font-black bg-[var(--bg)] text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all shadow-xs cursor-pointer"
            title="Excel formatida yuklab olish"
          >
            <FileSpreadsheet size={14} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Excel Import */}
          {currentUser?.rol === 'admin' && (
            <button 
              onClick={() => setIsExcelImportOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-500/30 text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-xs cursor-pointer"
              title="Excel orqali ommaviy yuklash (Import)"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}

          {/* Print */}
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] text-xs font-black bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--border)] transition-all shadow-xs cursor-pointer"
            title="Chop etish"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Chop etish</span>
          </button>

          {/* View Mode (Table / Cards) */}
          <div className="bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] flex items-center shadow-xs ml-auto lg:ml-2">
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "p-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                viewMode === 'table' ? "bg-[var(--bg2)] text-purple-600 shadow-xs border border-[var(--border)]" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Jadval ko'rinishi"
            >
              <List size={16} />
            </button>
            <button 
              onClick={() => setViewMode('cards')}
              className={cn(
                "p-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                viewMode === 'cards' ? "bg-[var(--bg2)] text-purple-600 shadow-xs border border-[var(--border)]" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
              title="Kartalar ko'rinishi"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. ZAMONAVIY BENTO-GRID KPI VA MOLIYAVIY KARTALAR (Omborchi profili uchun yashiriladi) */}
      {currentUser?.rol !== 'omborchi' && (
        <div className="flex flex-col gap-2">
          {/* MOBILE VIEW (sm:hidden) - Super ixcham, chiroyli 2x2 bento grid va mavsum filtrlari */}
          <div className="sm:hidden flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Card 1: Jami Zaxira */}
              <div 
                onClick={() => {
                  setActivePill('all');
                  setSeasonFilter('all');
                }}
                className={cn(
                  "bg-[var(--bg2)] border rounded-2xl p-3 flex flex-col justify-between shadow-xs transition-all cursor-pointer active:scale-[0.98]",
                  activePill === 'all' && seasonFilter === 'all' 
                    ? "ring-2 ring-purple-500/40 border-purple-500/60 bg-purple-500/5" 
                    : "border-[var(--border)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1">
                    <Package size={12} className="text-purple-500 shrink-0" />
                    Jami Zaxira
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-600 flex items-center justify-center shrink-0">
                    <Package size={13} />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-[var(--text)] tracking-tight tabular-nums">
                      {kpiStats.totalPairs.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text3)]">juft</span>
                  </div>
                  <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                    {kpiStats.totalModelsCount} ta model
                  </div>
                </div>
              </div>

              {/* Card 2: Zaxira Qiymati */}
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1">
                    <DollarSign size={12} className="text-emerald-500 shrink-0" />
                    Qiymat
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                    <DollarSign size={13} />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
                      {formatCompact(kpiStats.totalSaleVal || kpiStats.totalCostVal)}
                    </span>
                    <span className="text-[9px] font-black text-emerald-500/80">UZS</span>
                  </div>
                  <div className="text-[10px] font-semibold text-[var(--text3)] truncate mt-0.5">
                    Tannarx: {kpiStats.totalCostVal > 0 ? formatCompact(kpiStats.totalCostVal) : '—'}
                  </div>
                </div>
              </div>

              {/* Card 3: Muzlagan Zaxira */}
              <div 
                onClick={() => setActivePill('frozen')}
                className={cn(
                  "bg-[var(--bg2)] border rounded-2xl p-3 flex flex-col justify-between shadow-xs transition-all cursor-pointer active:scale-[0.98]",
                  activePill === 'frozen'
                    ? "ring-2 ring-purple-500/50 border-purple-500 bg-purple-500/10"
                    : kpiStats.frozenCount > 0 ? "border-purple-500/30" : "border-[var(--border)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                    <Snowflake size={12} className="shrink-0" />
                    Muzlagan
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-600 flex items-center justify-center shrink-0">
                    <Lock size={12} />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-purple-600 dark:text-purple-400 tracking-tight tabular-nums">
                      {kpiStats.frozenPairs.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-purple-500/80">juft</span>
                  </div>
                  <div className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">
                    {kpiStats.frozenCount} model • {formatCompact(kpiStats.frozenVal)}
                  </div>
                </div>
              </div>

              {/* Card 4: Kritik Zaxira */}
              <div 
                onClick={() => setActivePill('critical')}
                className={cn(
                  "bg-[var(--bg2)] border rounded-2xl p-3 flex flex-col justify-between shadow-xs transition-all cursor-pointer active:scale-[0.98]",
                  activePill === 'critical'
                    ? "ring-2 ring-rose-500/50 border-rose-500 bg-rose-500/10"
                    : kpiStats.criticalCount > 0 
                      ? "border-rose-500/30 bg-rose-500/5" 
                      : "border-[var(--border)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle size={12} className="shrink-0" />
                    Kritik (&lt;10)
                  </span>
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                    kpiStats.criticalCount > 0 ? "bg-rose-500 text-white" : "bg-emerald-500/15 text-emerald-600"
                  )}>
                    <ShieldAlert size={12} />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
                      {kpiStats.criticalCount}
                    </span>
                    <span className="text-[10px] font-bold text-rose-500/80">model</span>
                  </div>
                  <div className="text-[10px] font-semibold text-amber-500 mt-0.5">
                    Kam: {kpiStats.lowCount} ta (10-30)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DESKTOP VIEW (hidden sm:grid) - Kompyuter uchun avvalgi to'liq holati */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          
          {/* Card 1: Jami Zaxira Hajmi (Juft va Modellar) - Clickable to reset to All */}
          <div 
            onClick={() => {
              setActivePill('all');
              setSeasonFilter('all');
            }}
            className={cn(
              "bg-[var(--bg2)] border rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-purple-500/40 transition-all cursor-pointer",
              activePill === 'all' && seasonFilter === 'all' ? "ring-2 ring-purple-500/30 border-purple-500/40" : "border-[var(--border)]"
            )}
            title="Barcha modellarni ko'rish"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <Package size={14} className="text-purple-500" />
                Jami Zaxira
              </span>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                <Package size={20} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight tabular-nums">
                  {kpiStats.totalPairs.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-[var(--text3)]">juft</span>
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-600 font-black text-[10px]">
                  {kpiStats.totalModelsCount} model
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
                <span 
                  onClick={(e) => { e.stopPropagation(); setSeasonFilter('qishki'); }}
                  className="text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  ❄️ {kpiStats.qishkiPairs.toLocaleString()} Qishki
                </span>
                <span 
                  onClick={(e) => { e.stopPropagation(); setSeasonFilter('yozgi'); }}
                  className="text-amber-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  ☀️ {kpiStats.yozgiPairs.toLocaleString()} Yozgi
                </span>
                <span 
                  onClick={(e) => { e.stopPropagation(); setSeasonFilter('umumiy'); }}
                  className="text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  👟 {kpiStats.umumiyPairs.toLocaleString()} Umumiy
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Umumiy Zaxira Qiymati (UZS / Tannarx va Sotuv) */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={14} className="text-emerald-500" />
                Zaxira Qiymati
              </span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
                  {formatCompact(kpiStats.totalSaleVal || kpiStats.totalCostVal)}
                </span>
                <span className="text-xs font-black text-emerald-500/80">UZS</span>
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 font-extrabold text-[10px]">
                  Sotuv qiymati
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
                <span>Tannarx zaxirasi:</span>
                <span className="text-[var(--text)] font-extrabold tabular-nums">
                  {kpiStats.totalCostVal > 0 ? `${formatCompact(kpiStats.totalCostVal)} UZS` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Muzlagan / Harakatsiz Kapital - Clickable to filter frozen */}
          <div 
            onClick={() => setActivePill('frozen')}
            className={cn(
              "bg-[var(--bg2)] border rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group transition-all cursor-pointer",
              activePill === 'frozen'
                ? "ring-2 ring-purple-500/50 border-purple-500"
                : kpiStats.frozenCount > 0 ? "border-purple-500/40 hover:border-purple-500" : "border-[var(--border)]"
            )}
            title="Muzlagan tovarlarni filtrlash"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <Snowflake size={14} className={kpiStats.frozenCount > 0 ? "animate-spin" : ""} style={{ animationDuration: '10s' }} />
                Muzlagan Zaxira
              </span>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                <Lock size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 tracking-tight tabular-nums">
                  {kpiStats.frozenPairs.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-purple-500/80">juft</span>
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-600 font-black text-[10px]">
                  {kpiStats.frozenCount} ta model
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
                <span>Muzlagan mablag':</span>
                <span className="text-purple-600 dark:text-purple-400 font-extrabold tabular-nums">
                  {formatCompact(kpiStats.frozenVal)} UZS
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Kritik Kam Qolganlar (<10 juft) - Clickable to filter critical */}
          <div 
            onClick={() => setActivePill('critical')}
            className={cn(
              "bg-[var(--bg2)] border rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group transition-all cursor-pointer",
              activePill === 'critical'
                ? "ring-2 ring-rose-500/50 border-rose-500 bg-rose-500/10"
                : kpiStats.criticalCount > 0 
                  ? "border-rose-500/40 bg-gradient-to-br from-rose-500/5 via-[var(--bg2)] to-rose-500/10 hover:border-rose-500" 
                  : "border-[var(--border)]"
            )}
            title="Kritik kam qolgan tovarlarni filtrlash"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Kritik Zaxira
              </span>
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center font-black transition-transform group-hover:scale-105",
                kpiStats.criticalCount > 0 ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse" : "bg-emerald-500/15 text-emerald-600"
              )}>
                <ShieldAlert size={20} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
                  {kpiStats.criticalCount}
                </span>
                <span className="text-xs font-bold text-rose-500/80">model (&lt;10 juft)</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
                <span>Kam qolganlar (10-30):</span>
                <span className="text-amber-500 font-extrabold tabular-nums">
                  {kpiStats.lowCount} ta model
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
      )}

      {/* 3. BIRLASHTIRILGAN VA MAYDON TEJALGAN IXCHAM FILTR VA BOSHQARUV PANELI */}
      
      {/* DESKTOP FILTERS BAR (hidden sm:flex) - Kompyuter uchun avvalgi 100% to'liq holatida */}
      <div className="hidden sm:flex bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-2.5 sm:p-3 flex-wrap items-center justify-between gap-2.5 shadow-xs">
        
        {/* Chap tomon: Qisqartirilgan Smart Qidiruv + Ixcham Chevrons (Ochish/Yopish) + Tozalash */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Smart Search - Kengligi 790px, Balandligi 38px */}
          <div className="relative w-full sm:w-[790px] max-w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Model qidirish... (Ctrl + K)" 
              className="w-full h-[38px] pl-9.5 pr-14 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-2xs"
            />
            {search ? (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg hover:bg-[var(--bg2)] cursor-pointer"
                title="Qidiruvni tozalash"
              >
                <X size={14} />
              </button>
            ) : (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
                <kbd className="bg-[var(--bg2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[9px] font-bold text-[var(--text3)] shadow-2xs">Ctrl K</kbd>
              </div>
            )}
          </div>

          {/* Zamonaviy O'lchamlarni Ochish / Yopish tugmalari (Chevrons - Qidiruv yoniga ko'chirildi) */}
          {viewMode === 'table' && (() => {
            const isAllExpanded = filteredModels.length > 0 && filteredModels.every(m => expandedModels.has(m));
            const isAnyExpanded = expandedModels.size > 0;

            return (
              <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] shadow-2xs gap-1">
                <button
                  onClick={expandAll}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center select-none",
                    isAllExpanded
                      ? "bg-purple-600 text-white shadow-xs font-extrabold"
                      : "text-[var(--text3)] hover:text-purple-600 hover:bg-purple-500/10"
                  )}
                  title="Barcha o'lchamlar matritsasini birdaniga ochish"
                >
                  <ChevronsDown size={15} className={isAllExpanded ? "text-white" : "text-purple-500"} />
                </button>
                <div className="w-px h-3.5 bg-[var(--border)] my-auto" />
                <button
                  onClick={collapseAll}
                  disabled={!isAnyExpanded}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center select-none",
                    !isAnyExpanded
                      ? "opacity-35 cursor-not-allowed text-[var(--text3)]"
                      : "text-[var(--text3)] hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                  )}
                  title="Barcha o'lchamlarni ixcham holatga yopish"
                >
                  <ChevronsUp size={15} className={isAnyExpanded ? "text-rose-500" : ""} />
                </button>
              </div>
            );
          })()}

          {/* Filtrlarni tozalash tugmasi (agar biror filtr faol bo'lsa) */}
          {(activePill !== 'all' || seasonFilter !== 'all' || search) && (
            <button
              onClick={() => {
                setActivePill('all');
                setSeasonFilter('all');
                setSearch('');
              }}
              className="px-2.5 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
              title="Barcha filtrlarni tozalash"
            >
              <X size={12} />
              <span className="hidden sm:inline">Tozalash</span>
            </button>
          )}

        </div>

        {/* O'ng tomon: Asosiy Holat Tugmalari + Mavsum Dropdown + Saralash Dropdown */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          
          {/* Asosiy Holat Tugmalari (Segmented Control) */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] overflow-x-auto gap-1 shadow-2xs">
            <button
              onClick={() => setActivePill('all')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                activePill === 'all'
                  ? "bg-[var(--bg2)] text-purple-600 shadow-xs border border-[var(--border)] font-extrabold"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <span>Barchasi</span>
              <span className="text-[10px] opacity-75 font-black">({allModels.length})</span>
            </button>

            <button
              onClick={() => setActivePill(activePill === 'critical' ? 'all' : 'critical')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                activePill === 'critical'
                  ? "bg-rose-500 text-white shadow-xs font-extrabold"
                  : "text-rose-500 hover:bg-rose-500/10"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
              <span>Kritik (&lt;10)</span>
              {kpiStats.criticalCount > 0 && (
                <span className="text-[10px] font-black">({kpiStats.criticalCount})</span>
              )}
            </button>

            <button
              onClick={() => setActivePill(activePill === 'low' ? 'all' : 'low')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                activePill === 'low'
                  ? "bg-amber-500 text-white shadow-xs font-extrabold"
                  : "text-amber-500 hover:bg-amber-500/10"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0" />
              <span>Kam (10-30)</span>
              {kpiStats.lowCount > 0 && (
                <span className="text-[10px] font-black">({kpiStats.lowCount})</span>
              )}
            </button>

            <button
              onClick={() => setActivePill(activePill === 'frozen' ? 'all' : 'frozen')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                activePill === 'frozen'
                  ? "bg-purple-600 text-white shadow-xs font-extrabold"
                  : "text-purple-500 hover:bg-purple-500/10"
              )}
            >
              <Snowflake size={12} className="shrink-0" />
              <span>Muzlagan</span>
              {kpiStats.frozenCount > 0 && (
                <span className="text-[10px] font-black">({kpiStats.frozenCount})</span>
              )}
            </button>

            <button
              onClick={() => setActivePill(activePill === 'archived' ? 'all' : 'archived')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                activePill === 'archived'
                  ? "bg-zinc-700 text-white shadow-xs font-extrabold"
                  : "text-zinc-500 hover:bg-zinc-500/10"
              )}
            >
              <Archive size={12} className="shrink-0" />
              <span>Arxiv</span>
              {kpiStats.archivedCount > 0 && (
                <span className="text-[10px] font-black">({kpiStats.archivedCount})</span>
              )}
            </button>
          </div>

          {/* Mavsum Tanlash Dropdown (O'ng tomonga ko'chirildi) */}
          <div className="relative">
            <select
              value={seasonFilter}
              onChange={e => setSeasonFilter(e.target.value as any)}
              className={cn(
                "pl-3 pr-7 py-2 appearance-none bg-[var(--bg)] border rounded-xl text-xs font-bold outline-none cursor-pointer transition-colors shadow-2xs",
                seasonFilter !== 'all' 
                  ? "border-purple-500 text-purple-600 bg-purple-500/5 font-extrabold" 
                  : "border-[var(--border)] text-[var(--text2)] hover:border-[var(--text3)]"
              )}
            >
              <option value="all">⛅️ Mavsum: Barchasi</option>
              <option value="qishki">❄️ Qishki ({allModels.filter(m => getCat(m) === 'qishki').length})</option>
              <option value="yozgi">☀️ Yozgi ({allModels.filter(m => getCat(m) === 'yozgi').length})</option>
              <option value="umumiy">👟 Umumiy ({allModels.filter(m => getCat(m) === 'umumiy').length})</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
          </div>

          {/* Saralash Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="pl-3 pr-7 py-2 appearance-none bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text2)] outline-none focus:border-purple-500 hover:border-[var(--text3)] cursor-pointer shadow-2xs"
            >
              <option value="total-desc">📦 Qoldiq: Ko'pdan kamga</option>
              <option value="total-asc">⚠️ Qoldiq: Kamdan ko'pga</option>
              <option value="value-desc">💰 Zaxira qiymati</option>
              <option value="out-desc">🔥 Eng ko'p sotilgan</option>
              <option value="name-asc">🔤 Model (A-Z)</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
          </div>

        </div>
      </div>

      {/* MOBILE FILTERS BAR (sm:hidden) - Telefonlar uchun maxsus: Ixcham, zamonaviy va qulay */}
      <div className="sm:hidden bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-xs space-y-2.5">
        
        {/* Row 1: Smart Search + Chevrons (if table view) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Model nomi bo'yicha qidirish..." 
              className="w-full h-9 pl-9 pr-8 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all shadow-2xs"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg"
                title="Qidiruvni tozalash"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* O'lchamlarni ochish/yopish tugmalari (Chevrons) faqat jadval ko'rinishida */}
          {viewMode === 'table' && (() => {
            const isAllExpanded = filteredModels.length > 0 && filteredModels.every(m => expandedModels.has(m));
            const isAnyExpanded = expandedModels.size > 0;

            return (
              <div className="flex items-center bg-[var(--bg)] p-0.5 rounded-xl border border-[var(--border)] shrink-0 gap-0.5 shadow-2xs">
                <button
                  onClick={expandAll}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    isAllExpanded ? "bg-purple-600 text-white font-extrabold shadow-xs" : "text-purple-600 hover:bg-purple-500/10"
                  )}
                  title="Barcha o'lchamlarni ochish"
                >
                  <ChevronsDown size={14} />
                </button>
                <div className="w-px h-3 bg-[var(--border)] my-auto" />
                <button
                  onClick={collapseAll}
                  disabled={!isAnyExpanded}
                  className={cn(
                    "p-1.5 rounded-lg text-xs font-bold transition-all",
                    !isAnyExpanded ? "opacity-30 cursor-not-allowed text-[var(--text3)]" : "text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                  )}
                  title="Barcha o'lchamlarni yopish"
                >
                  <ChevronsUp size={14} />
                </button>
              </div>
            );
          })()}
        </div>

        {/* Row 2: Status Filter Pills (Horizontal scrollable, touch-friendly, no line-breaks) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setActivePill('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border",
              activePill === 'all'
                ? "bg-purple-600 text-white border-purple-600 font-black shadow-xs"
                : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
            )}
          >
            Barchasi ({allModels.length})
          </button>

          <button
            type="button"
            onClick={() => setActivePill(activePill === 'critical' ? 'all' : 'critical')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1",
              activePill === 'critical'
                ? "bg-rose-500 text-white border-rose-500 font-black shadow-xs"
                : "bg-[var(--bg)] border-rose-500/30 text-rose-600"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
            <span>Kritik</span>
            {kpiStats.criticalCount > 0 && <span className="font-black">({kpiStats.criticalCount})</span>}
          </button>

          <button
            type="button"
            onClick={() => setActivePill(activePill === 'low' ? 'all' : 'low')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1",
              activePill === 'low'
                ? "bg-amber-500 text-white border-amber-500 font-black shadow-xs"
                : "bg-[var(--bg)] border-amber-500/30 text-amber-600"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0" />
            <span>Kam</span>
            {kpiStats.lowCount > 0 && <span className="font-black">({kpiStats.lowCount})</span>}
          </button>

          <button
            type="button"
            onClick={() => setActivePill(activePill === 'frozen' ? 'all' : 'frozen')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1",
              activePill === 'frozen'
                ? "bg-purple-600 text-white border-purple-600 font-black shadow-xs"
                : "bg-[var(--bg)] border-purple-500/30 text-purple-600"
            )}
          >
            <Snowflake size={12} className="shrink-0" />
            <span>Muzlagan</span>
            {kpiStats.frozenCount > 0 && <span className="font-black">({kpiStats.frozenCount})</span>}
          </button>

          <button
            type="button"
            onClick={() => setActivePill(activePill === 'archived' ? 'all' : 'archived')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1",
              activePill === 'archived'
                ? "bg-zinc-700 text-white border-zinc-700 font-black shadow-xs"
                : "bg-[var(--bg)] border-zinc-500/30 text-zinc-500"
            )}
          >
            <Archive size={12} className="shrink-0" />
            <span>Arxiv</span>
            {kpiStats.archivedCount > 0 && <span className="font-black">({kpiStats.archivedCount})</span>}
          </button>
        </div>

        {/* Row 3: 2 Equal Balanced Columns: Mavsum Dropdown (50%) + Saralash Dropdown (50%) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Mavsum */}
          <div className="relative">
            <select
              value={seasonFilter}
              onChange={e => setSeasonFilter(e.target.value as any)}
              className={cn(
                "w-full pl-2.5 pr-7 py-2 appearance-none bg-[var(--bg)] border rounded-xl text-xs font-bold outline-none cursor-pointer truncate shadow-2xs",
                seasonFilter !== 'all' 
                  ? "border-purple-500 text-purple-600 bg-purple-500/5 font-extrabold" 
                  : "border-[var(--border)] text-[var(--text2)]"
              )}
            >
              <option value="all">⛅️ Mavsum: Barchasi</option>
              <option value="qishki">❄️ Qishki</option>
              <option value="yozgi">☀️ Yozgi</option>
              <option value="umumiy">👟 Umumiy</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
          </div>

          {/* Saralash */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full pl-2.5 pr-7 py-2 appearance-none bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text2)] outline-none cursor-pointer truncate shadow-2xs"
            >
              <option value="total-desc">📦 Ko'pdan kam</option>
              <option value="total-asc">⚠️ Kamdan ko'p</option>
              <option value="value-desc">💰 Zaxira qiymati</option>
              <option value="out-desc">🔥 Ko'p sotilgan</option>
              <option value="name-asc">🔤 Model (A-Z)</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
          </div>
        </div>

        {/* Row 4: Active Filters Clear Notification (if active) */}
        {(activePill !== 'all' || seasonFilter !== 'all' || search) && (
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] text-xs">
            <span className="text-[11px] font-bold text-purple-600 truncate">
              {filteredModels.length} ta model ko'rsatilyapti
            </span>
            <button
              type="button"
              onClick={() => {
                setActivePill('all');
                setSeasonFilter('all');
                setSearch('');
              }}
              className="text-[11px] font-extrabold text-rose-500 flex items-center gap-1 hover:underline cursor-pointer shrink-0"
            >
              <X size={12} /> Filtrlarni tozalash
            </button>
          </div>
        )}

      </div>

      {/* 4. STICKY BULK ACTIONS BAR (When models are selected) */}
      {selectedModels.size > 0 && (
        <div className="bg-purple-600 text-white px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-lg shadow-purple-500/20">
          <div className="flex items-center gap-2 font-black text-xs">
            <CheckSquare size={16} />
            <span>{selectedModels.size} ta model tanlandi</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canManage && (
              <>
                <button
                  onClick={() => handleBulkFreeze(true)}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Lock size={13} /> Muzlatish
                </button>
                <button
                  onClick={() => handleBulkFreeze(false)}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Unlock size={13} /> Ochish
                </button>
                <button
                  onClick={() => handleBulkArchive(true)}
                  className="px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1 border border-white/10"
                >
                  <Archive size={13} /> Arxivlash
                </button>
                <button
                  onClick={() => handleBulkArchive(false)}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ArchiveRestore size={13} /> Arxivdan chiqarish
                </button>
              </>
            )}
            <button
              onClick={() => handleExportExcel(true)}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
            >
              <Download size={13} /> Excel
            </button>
            <button
              onClick={() => setSelectedModels(new Set())}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      )}

      {/* 5. TABLE VIEW WITH EXPANDABLE SIZE MATRIX */}
      {viewMode === 'table' ? (
        /* RESPONSIVE TABLE VIEW - Telefon va kompyuter uchun to'liq moslashgan */
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto relative no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--bg)] text-[var(--text3)] text-[10px] sm:text-[11px] font-black uppercase tracking-wider sticky top-0 border-b border-[var(--border)] z-20">
                <tr>
                  {/* 1. STICKY FROZEN MODEL COLUMN (Model nomi, rasmi, checkbox va expand chevron) */}
                  <th className="sticky left-0 bg-[var(--bg)] z-30 border-r-2 border-[var(--border)] shadow-[3px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[3px_0_8px_-2px_rgba(0,0,0,0.3)] px-2.5 sm:px-3.5 py-2.5 sm:py-3.5 min-w-[170px] sm:min-w-[220px]">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button 
                        type="button"
                        onClick={toggleSelectAll}
                        className="p-1 hover:text-blue-600 cursor-pointer shrink-0"
                        title="Barchasini tanlash"
                      >
                        {selectedModels.size > 0 && selectedModels.size === filteredModels.length ? (
                          <CheckSquare size={15} className="text-blue-600" />
                        ) : (
                          <Square size={15} className="text-[var(--text3)]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy(sortBy === 'name-asc' ? 'total-desc' : 'name-asc')}
                        className="font-black uppercase tracking-wider text-[var(--text2)] hover:text-purple-600 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Model nomi bo'yicha saralash"
                      >
                        <span>Model &amp; Rasmi</span>
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          type="button"
                          onClick={expandAll}
                          className="p-1 hover:text-purple-600 text-[var(--text3)] transition-colors cursor-pointer"
                          title="Barchasini ochish (Akkordeon)"
                        >
                          <ChevronsDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={collapseAll}
                          className="p-1 hover:text-rose-500 text-[var(--text3)] transition-colors cursor-pointer"
                          title="Barchasini yopish"
                        >
                          <ChevronsUp size={14} />
                        </button>
                        <span className="text-[8px] text-purple-600 font-extrabold hidden sm:inline px-1 py-0.5 rounded bg-purple-500/10">
                          Sticky
                        </span>
                      </div>
                    </div>
                  </th>

                  {/* 2. INDIVIDUAL SIZE COLUMNS (Gorizontal suriluvchi 38-44 razmerlar) */}
                  {ALL_SIZES.map(sz => (
                    <th key={sz} className="px-1.5 sm:px-2 py-2.5 sm:py-3 text-center text-xs font-black min-w-[46px] sm:min-w-[52px] font-mono whitespace-nowrap">
                      {sz}°
                    </th>
                  ))}

                  {/* 3. CURRENT WAREHOUSE TOTAL */}
                  <th 
                    onClick={() => setSortBy(sortBy === 'total-desc' ? 'total-asc' : 'total-desc')}
                    className="px-3.5 py-3 text-right font-black text-xs sm:text-sm min-w-[95px] whitespace-nowrap cursor-pointer hover:text-purple-600 transition-colors"
                    title="Qoldiq bo'yicha saralash"
                  >
                    <span>{currentOmbor.toUpperCase()} Jami</span>
                  </th>
                  
                  {/* 4. COMPARE WAREHOUSES */}
                  {compareWarehouses && (
                    <>
                      <th className="px-3 py-3 text-right font-black text-xs text-blue-500 whitespace-nowrap min-w-[85px]">
                        {otherOmbor.toUpperCase()} Qoldiq
                      </th>
                      <th className="px-3 py-3 text-right font-black text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap min-w-[85px]">
                        Umumiy Jami
                      </th>
                    </>
                  )}

                  {/* 5. PRICE & TOTAL VALUE */}
                  {!isOmborchi && (
                    <>
                      <th className="px-3 py-3 text-right text-xs whitespace-nowrap min-w-[80px]">
                        Narxi
                      </th>
                      <th 
                        onClick={() => setSortBy(sortBy === 'value-desc' ? 'total-desc' : 'value-desc')}
                        className="px-3.5 py-3 text-right text-xs whitespace-nowrap cursor-pointer hover:text-purple-600 transition-colors min-w-[100px]"
                        title="Zaxira qiymati bo'yicha saralash"
                      >
                        Qiymati
                      </th>
                    </>
                  )}

                  {/* 6. STATUS */}
                  <th className="px-2.5 py-3 text-center text-xs whitespace-nowrap min-w-[80px]">
                    Holat
                  </th>

                  {/* 7. QUICK ACTIONS */}
                  <th className="px-2.5 py-3 text-center text-xs whitespace-nowrap min-w-[85px]">
                    Amallar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {filteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={10 + (compareWarehouses ? 2 : 0) + (!isOmborchi ? 2 : 0)} className="text-center py-16 text-[var(--text3)]">
                      <Package size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-bold">Modellar topilmadi</p>
                      <p className="text-xs mt-0.5">Filtr yoki qidiruv so'zini o'zgartirib ko'ring</p>
                    </td>
                  </tr>
                ) : (
                  paginatedModels.map((m, idx) => {
                    const isSelected = selectedModels.has(m);
                    const isExpanded = expandedModels.has(m);
                    const isFrozen = muzlatilgan.includes(m);
                    const isArchived = isModelArchived(m);
                    const total = Number(modelTotal(m));
                    const otherTotal = Number(otherModelTotal(m));
                    const grandTotal = total + otherTotal;
                    const cat = getCat(m);
                    const sizes = stock[m] || {};
                    const price = prices[m]?.sale || prices[m]?.cost || 0;
                    const stockValue = total * price;

                    const isCritical = total > 0 && total < 10;
                    const isLow = total >= 10 && total < 30;
                    const isOutOfStock = total === 0;

                    const totalColSpan = 10 + (compareWarehouses ? 2 : 0) + (!isOmborchi ? 2 : 0);

                    return (
                      <React.Fragment key={m}>
                        <tr 
                          className={cn(
                            "transition-colors group cursor-pointer select-none",
                            idx % 2 === 1 ? "bg-[var(--bg)]/35" : "bg-transparent",
                            isSelected ? "bg-blue-500/10!" : "",
                            isCritical ? "bg-rose-500/5!" : "",
                            highlightedModel === m ? "bg-amber-500/20! ring-1 ring-amber-500" : "",
                            "hover:bg-purple-500/5!"
                          )}
                          onClick={() => toggleRowExpand(m)}
                        >
                          {/* 1. STICKY FROZEN MODEL COLUMN */}
                          <td className="sticky left-0 bg-[var(--bg2)] group-hover:bg-[var(--bg)] z-20 border-r-2 border-[var(--border)] shadow-[3px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[3px_0_8px_-2px_rgba(0,0,0,0.3)] transition-colors px-2.5 sm:px-3.5 py-2.5 sm:py-3 min-w-[170px] sm:min-w-[220px]">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              {/* Accordion expand/collapse chevron */}
                              <button 
                                type="button"
                                onClick={e => { e.stopPropagation(); toggleRowExpand(m); }}
                                className="p-1 text-[var(--text3)] hover:text-purple-600 transition-all cursor-pointer shrink-0"
                                title={isExpanded ? "O'lchamlarni yopish" : "O'lchamlarni ochish (Akkordeon)"}
                              >
                                {isExpanded ? <ChevronDown size={15} className="text-purple-600" /> : <ChevronRight size={15} />}
                              </button>

                              {/* Checkbox */}
                              <button 
                                type="button"
                                onClick={e => { e.stopPropagation(); toggleSelect(m); }}
                                className="p-0.5 hover:text-blue-600 cursor-pointer shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare size={15} className="text-blue-600" />
                                ) : (
                                  <Square size={15} className="text-[var(--text3)] opacity-40 group-hover:opacity-100" />
                                )}
                              </button>

                              {/* Visual Model Thumbnail Badge */}
                              <div className={cn(
                                "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-black shrink-0 border transition-transform group-hover:scale-105 shadow-2xs",
                                cat === 'qishki' 
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/25" 
                                  : cat === 'yozgi' 
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/25" 
                                    : "bg-indigo-500/10 text-indigo-600 border-indigo-500/25"
                              )}>
                                {cat === 'qishki' ? (
                                  <Snowflake size={14} />
                                ) : cat === 'yozgi' ? (
                                  <Sun size={14} />
                                ) : (
                                  <Package size={14} />
                                )}
                              </div>

                              {/* Model Name and Tag */}
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className={cn(
                                    "font-black truncate max-w-[95px] sm:max-w-[130px] text-xs sm:text-sm",
                                    isFrozen ? "text-slate-500 dark:text-slate-400 line-through opacity-80" : isArchived ? "text-zinc-400" : "text-[var(--text)]"
                                  )} title={m}>
                                    {m}
                                  </span>
                                  {isArchived && (
                                    <span className="px-1 py-0.2 rounded bg-zinc-500/20 text-zinc-500 dark:text-zinc-400 font-extrabold text-[8px] flex items-center gap-0.5 shrink-0">
                                      <Archive size={7} /> Arxiv
                                    </span>
                                  )}
                                  {isFrozen && (
                                    <span className="px-1 py-0.2 rounded bg-slate-500/15 text-slate-600 dark:text-slate-400 font-extrabold text-[8px] flex items-center gap-0.5 shrink-0">
                                      <Lock size={7} /> Muz
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-wider">
                                  {cat === 'qishki' ? '❄️ Qishki' : cat === 'yozgi' ? '☀️ Yozgi' : '👟 Umumiy'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. INDIVIDUAL SIZE CELLS (Horizontally scrollable) */}
                          {ALL_SIZES.map(sz => {
                            const szQty = Number(sizes[sz] || 0);
                            const isEditingThisCell = editingSizeCell?.model === m && editingSizeCell?.size === sz;

                            return (
                              <td 
                                key={sz} 
                                className="px-1.5 sm:px-2 py-2.5 sm:py-3 min-w-[48px] text-center whitespace-nowrap font-mono"
                                onClick={e => {
                                  if (canManage && !isFrozen) {
                                    e.stopPropagation();
                                    setEditingSizeCell({ model: m, size: sz });
                                    setEditSizeValue(String(szQty));
                                  }
                                }}
                              >
                                {isEditingThisCell ? (
                                  <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                    <input 
                                      type="number" 
                                      autoFocus
                                      value={editSizeValue}
                                      onChange={e => setEditSizeValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') updateSizeQuantity(m, sz, editSizeValue);
                                        if (e.key === 'Escape') setEditingSizeCell(null);
                                      }}
                                      className="w-12 px-1 py-0.5 text-center bg-[var(--bg)] border-2 border-purple-500 rounded font-black text-xs text-[var(--text)] outline-none"
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => updateSizeQuantity(m, sz, editSizeValue)}
                                      className="p-1 bg-purple-600 text-white rounded text-[10px] font-black hover:bg-purple-700 cursor-pointer"
                                    >
                                      <Check size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  szQty === 0 ? (
                                    <span className="text-[var(--text3)]/35 font-mono text-[11px] font-semibold select-none">—</span>
                                  ) : (
                                    <span 
                                      className={cn(
                                        "inline-flex items-center justify-center rounded tabular-nums font-mono transition-transform",
                                        "min-w-[32px] h-7 px-1.5 text-xs font-black",
                                        canManage && !isFrozen ? "cursor-pointer hover:scale-105" : "",
                                        szQty < 5 
                                          ? "text-rose-600 bg-rose-500/10 font-black border border-rose-500/25" 
                                          : szQty < 15 
                                            ? "text-amber-600 bg-amber-500/10 font-bold" 
                                            : "text-emerald-600 bg-emerald-500/10 font-bold"
                                      )}
                                      title={`${sz}-o'lcham: ${szQty} juft${canManage && !isFrozen ? " (Tahrirlash uchun bosing)" : ""}`}
                                    >
                                      {szQty}
                                    </span>
                                  )
                                )}
                              </td>
                            );
                          })}

                          {/* 3. CURRENT WAREHOUSE TOTAL (Editable for Admin) */}
                          <td className="px-3.5 py-2.5 sm:py-3 text-right text-sm min-w-[95px] font-black font-mono tabular-nums whitespace-nowrap">
                            {editingTotalModel === m ? (
                              <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                <input 
                                  type="number"
                                  autoFocus
                                  value={editTotalValue}
                                  onChange={e => setEditTotalValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') updateTotalQuantity(m, editTotalValue);
                                    if (e.key === 'Escape') setEditingTotalModel(null);
                                  }}
                                  className="w-18 px-1 py-0.5 text-right bg-[var(--bg)] border-2 border-blue-500 rounded font-bold text-xs text-[var(--text)] outline-none"
                                />
                                <button 
                                  type="button"
                                  onClick={() => updateTotalQuantity(m, editTotalValue)}
                                  className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-black hover:bg-blue-700 cursor-pointer"
                                >
                                  OK
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <span 
                                  onClick={e => {
                                    if (canManage && !isFrozen) {
                                      e.stopPropagation();
                                      setEditingTotalModel(m);
                                      setEditTotalValue(String(total));
                                    }
                                  }}
                                  className={cn(
                                    "font-black font-mono tabular-nums",
                                    isOutOfStock ? "text-[var(--text3)]" : isCritical ? "text-rose-600 dark:text-rose-400" : isLow ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                                    canManage && !isFrozen && "cursor-pointer hover:underline"
                                  )}
                                  title={canManage && !isFrozen ? "Tahrirlash uchun bosing" : ""}
                                >
                                  {total.toLocaleString()} juft
                                </span>
                                {canManage && !isFrozen && (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setEditingTotalModel(m);
                                      setEditTotalValue(String(total));
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text3)] hover:text-blue-600 transition-opacity"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 4. COMPARE WAREHOUSES COLUMNS */}
                          {compareWarehouses && (
                            <>
                              <td className="px-3 py-2.5 text-right text-sm min-w-[85px] font-black font-mono tabular-nums text-blue-500 whitespace-nowrap">
                                {otherTotal.toLocaleString()} juft
                              </td>
                              <td className="px-3 py-2.5 text-right text-sm min-w-[85px] font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                {grandTotal.toLocaleString()} juft
                              </td>
                            </>
                          )}

                          {/* 5. PRICE & STOCK VALUE (Omborchi uchun yashirilgan) */}
                          {!isOmborchi && (
                            <>
                              <td className="px-3 py-2.5 text-right text-xs min-w-[80px] tabular-nums font-mono font-semibold text-[var(--text3)] whitespace-nowrap">
                                {price > 0 ? `${formatCompact(price)}` : '—'}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-xs min-w-[100px] tabular-nums font-mono font-black text-[var(--text2)] whitespace-nowrap">
                                {stockValue > 0 ? `${formatCompact(stockValue)} UZS` : '—'}
                              </td>
                            </>
                          )}

                          {/* 6. STATUS BADGE */}
                          <td className="px-2.5 py-2.5 text-center min-w-[80px] whitespace-nowrap">
                            {isFrozen ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-500/10 text-slate-600 dark:text-slate-400">
                                Muzlatilgan
                              </span>
                            ) : isOutOfStock ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                Tugagan (0)
                              </span>
                            ) : isCritical ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 border border-rose-500/30">
                                Kritik ({total})
                              </span>
                            ) : isLow ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600">
                                Kam ({total})
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600">
                                Yetarli
                              </span>
                            )}
                          </td>

                          {/* 7. QUICK ROW ACTIONS */}
                          <td className="px-2 sm:px-3 py-2.5 text-center min-w-[85px] whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {/* History Drilldown */}
                              <button
                                type="button"
                                onClick={() => setHistoryModalModel(m)}
                                className="p-1 rounded-md bg-[var(--bg)] text-[var(--text3)] hover:text-blue-600 hover:bg-blue-500/10 transition-colors cursor-pointer border border-[var(--border)]"
                                title="Model harakat tarixi"
                              >
                                <History size={13} />
                              </button>

                              {/* Freeze / Unfreeze */}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={e => toggleFreeze(m, e)}
                                  className={cn(
                                    "p-1 rounded-md transition-colors cursor-pointer border",
                                    isFrozen 
                                      ? "bg-slate-500/20 text-slate-600 dark:text-slate-300" 
                                      : "bg-[var(--bg)] text-[var(--text3)] hover:text-purple-600 border-[var(--border)]"
                                  )}
                                  title={isFrozen ? "Muzlatishdan ochish" : "Muzlatish"}
                                >
                                  {isFrozen ? <Unlock size={13} /> : <Lock size={13} />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDABLE DETAILED INLINE SIZES BREAKDOWN (AKKORDEON) */}
                        {isExpanded && (
                          <tr className="bg-[var(--bg)]/95 border-b border-[var(--border)] transition-all animate-in fade-in duration-150">
                            <td colSpan={totalColSpan} className="p-0 border-b border-[var(--border)]">
                              <div className="sticky left-0 w-full max-w-[calc(100vw-2rem)] sm:max-w-none p-3 sm:p-4">
                                <div className="bg-[var(--bg2)] border border-purple-500/30 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
                                  
                                  {/* Accordion Header: Model details, stats and status */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                                      <h4 className="font-black text-sm text-[var(--text)]">
                                        {m} <span className="text-[11px] text-[var(--text3)] font-semibold">({cat === 'qishki' ? '❄️ Qishki' : cat === 'yozgi' ? '☀️ Yozgi' : '👟 Umumiy'})</span>
                                      </h4>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-extrabold flex items-center gap-1">
                                        <Boxes size={11} /> Akkordeon: O'lchamlar taqsimoti
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2.5 text-xs">
                                      <span className="font-bold text-[var(--text3)]">
                                        Jami: <strong className="text-emerald-600 font-black font-mono">{total}</strong> juft
                                      </span>
                                      {price > 0 && (
                                        <>
                                          <span className="text-[var(--border)]">|</span>
                                          <span className="font-bold text-[var(--text3)]">
                                            Narxi: <strong className="text-[var(--text)] font-extrabold font-mono">{formatCompact(price)}</strong>
                                          </span>
                                          <span className="text-[var(--border)]">|</span>
                                          <span className="font-bold text-[var(--text3)]">
                                            Qiymati: <strong className="text-purple-600 font-black font-mono">{formatCompact(stockValue)} UZS</strong>
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Visual Mini Balance Bar (Seriya taqsimoti) */}
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text3)]">
                                      <span>Seriya balansi (foiz ulushi):</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-[var(--border)]/70 overflow-hidden flex shadow-inner">
                                      {ALL_SIZES.map(sz => {
                                        const szQty = Number(sizes[sz] || 0);
                                        if (szQty === 0 || total === 0) return null;
                                        const pct = Math.round((szQty / total) * 100);
                                        return (
                                          <div 
                                            key={sz}
                                            style={{ width: `${pct}%` }}
                                            className={cn(
                                              "h-full border-r border-white/20 transition-all",
                                              szQty < 5 ? "bg-rose-500" : szQty < 15 ? "bg-amber-500" : "bg-emerald-500"
                                            )}
                                            title={`${sz}-o'lcham: ${szQty} juft (${pct}%)`}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* SIZES CHIPS GRID - Touch-friendly chips */}
                                  <div>
                                    <div className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2 flex items-center justify-between">
                                      <span>Razmerlar Matritsasi (38 — 44):</span>
                                      {canManage && !isFrozen && (
                                        <span className="text-purple-600 font-bold text-[10px] lowercase">
                                          * katakchani bosib miqdorni o'zgartiring
                                        </span>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2">
                                      {ALL_SIZES.map(sz => {
                                        const szQty = Number(sizes[sz] || 0);
                                        const isEditingThisCell = editingSizeCell?.model === m && editingSizeCell?.size === sz;

                                        return (
                                          <div 
                                            key={sz}
                                            onClick={() => {
                                              if (canManage && !isFrozen) {
                                                setEditingSizeCell({ model: m, size: sz });
                                                setEditSizeValue(String(szQty));
                                              }
                                            }}
                                            className={cn(
                                              "rounded-xl p-2 sm:p-2.5 flex flex-col items-center justify-center border transition-all text-center relative",
                                              canManage && !isFrozen ? "cursor-pointer hover:border-purple-500 hover:shadow-xs active:scale-95" : "",
                                              szQty === 0
                                                ? "bg-[var(--bg)] border-[var(--border)] opacity-60"
                                                : szQty < 5
                                                  ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                                                  : szQty < 15
                                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
                                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                                            )}
                                          >
                                            <span className="text-[10px] font-black font-mono uppercase tracking-wider text-[var(--text3)]">
                                              {sz}-o'lcham
                                            </span>
                                            
                                            {isEditingThisCell ? (
                                              <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
                                                <input 
                                                  type="number" 
                                                  autoFocus
                                                  value={editSizeValue}
                                                  onChange={e => setEditSizeValue(e.target.value)}
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') updateSizeQuantity(m, sz, editSizeValue);
                                                    if (e.key === 'Escape') setEditingSizeCell(null);
                                                  }}
                                                  className="w-14 px-1.5 py-0.5 text-center bg-[var(--bg)] border-2 border-purple-500 rounded font-black text-xs text-[var(--text)] outline-none"
                                                />
                                                <button 
                                                  type="button"
                                                  onClick={() => updateSizeQuantity(m, sz, editSizeValue)}
                                                  className="p-1 bg-purple-600 text-white rounded text-[10px] font-black hover:bg-purple-700 cursor-pointer"
                                                >
                                                  <Check size={12} />
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                <span className={cn(
                                                  "font-black font-mono text-sm sm:text-base mt-0.5 tabular-nums",
                                                  szQty === 0 ? "text-[var(--text3)]" : ""
                                                )}>
                                                  {szQty} <span className="text-[10px] font-bold">juft</span>
                                                </span>
                                                <span className="text-[8px] font-extrabold uppercase tracking-wider mt-0.5">
                                                  {szQty === 0 ? 'Tugagan' : szQty < 5 ? 'Kritik kam' : szQty < 15 ? 'Kam' : 'Yetarli'}
                                                </span>
                                              </>
                                            )}

                                            {canManage && !isFrozen && !isEditingThisCell && (
                                              <Pencil size={9} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-[var(--text3)]" />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Quick Action Footer in Accordion */}
                                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs text-[var(--text3)]">
                                    <span className="text-[11px] font-semibold">
                                      Tezkor amallar:
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setHistoryModalModel(m)}
                                        className="px-2.5 py-1 rounded-lg bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border border-[var(--border)] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <History size={13} />
                                        <span>Harakat tarixi</span>
                                      </button>
                                      {canManage && (
                                        <button
                                          type="button"
                                          onClick={e => toggleFreeze(m, e)}
                                          className={cn(
                                            "px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer border",
                                            isFrozen
                                              ? "bg-purple-600 text-white border-purple-600"
                                              : "bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border-[var(--border)]"
                                          )}
                                        >
                                          {isFrozen ? <Unlock size={13} /> : <Lock size={13} />}
                                          <span>{isFrozen ? "Muzdan ochish" : "Muzlatish"}</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 6. CARDS / GRID VIEW WITH RICH SIZES ACCORDION */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.length === 0 ? (
            <div className="text-center py-16 text-[var(--text3)] col-span-full border border-[var(--border)] rounded-3xl bg-[var(--bg2)]">
              <Package size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">Modellar topilmadi</p>
            </div>
          ) : (
            paginatedModels.map(m => {
              const total = Number(modelTotal(m));
              const isFrozen = muzlatilgan.includes(m);
              const isExpanded = expandedModels.has(m);
              const cat = getCat(m);
              const sizes = stock[m] || {};
              const price = prices[m]?.sale || prices[m]?.cost || 0;
              const isCritical = total > 0 && total < 10;
              const isLow = total >= 10 && total < 30;

              return (
                <div 
                  key={m}
                  className={cn(
                    "bg-[var(--bg2)] border rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md relative overflow-hidden group",
                    isFrozen ? "border-purple-500/30 bg-purple-500/5" : isCritical ? "border-rose-500/30 bg-rose-500/5" : "border-[var(--border)] hover:border-purple-500/40"
                  )}
                >
                  <div>
                    {/* Top Row: Title & Total */}
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <h3 className="font-black text-base text-[var(--text)] group-hover:text-purple-600 transition-colors">
                          {m}
                        </h3>
                        <span className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mt-0.5 inline-block">
                          {cat === 'qishki' ? '❄️ Qishki' : cat === 'yozgi' ? '☀️ Yozgi' : '👟 Umumiy'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-2xl font-black tabular-nums tracking-tight",
                          total === 0 ? "text-[var(--text3)]" : isCritical ? "text-rose-600" : isLow ? "text-amber-600" : "text-emerald-600"
                        )}>
                          {total}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--text3)] block uppercase">Juft qoldi</span>
                      </div>
                    </div>

                    {/* Accordion toggle button */}
                    <button
                      type="button"
                      onClick={() => toggleRowExpand(m)}
                      className="w-full py-2 px-3 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-xs font-bold text-[var(--text)] flex items-center justify-between transition-colors cursor-pointer mt-2"
                    >
                      <span className="flex items-center gap-1.5">
                        <Boxes size={14} className="text-purple-600" />
                        <span>O'lchamlar matritsasi ({ALL_SIZES.filter(sz => (sizes[sz] || 0) > 0).length} ta mavjud)</span>
                      </span>
                      <div className="flex items-center gap-1 text-purple-600 font-extrabold text-[11px]">
                        <span>{isExpanded ? "Yopish" : "Ochish"}</span>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </button>

                    {/* Sizes Matrix Chips (Akkordeon ochilganda yoki ko'rsatilganda) */}
                    {isExpanded && (
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--border)] animate-in fade-in duration-150">
                        {ALL_SIZES.map(sz => {
                          const szQty = Number(sizes[sz] || 0);
                          return (
                            <div 
                              key={sz} 
                              className="bg-[var(--bg)] border border-[var(--border)] rounded-xl py-1 px-1.5 flex flex-col items-center"
                            >
                              <span className="text-[9px] font-bold text-[var(--text3)]">{sz}</span>
                              <span className={cn(
                                "font-black text-xs",
                                szQty === 0 ? "text-[var(--text3)] opacity-40" : szQty < 5 ? "text-rose-600" : "text-[var(--text)]"
                              )}>
                                {szQty}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom: Quick Actions */}
                  <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-[var(--border)] text-xs">
                    <span className="font-bold text-[var(--text3)] text-[11px]">
                      {price > 0 ? `${formatCompact(total * price)} UZS` : '—'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryModalModel(m)}
                        className="p-1.5 rounded-lg bg-[var(--bg)] text-[var(--text3)] hover:text-purple-600 transition-colors cursor-pointer border border-[var(--border)]"
                        title="Tarix"
                      >
                        <History size={13} />
                      </button>
                      {canManage && (
                        <button
                          onClick={e => toggleFreeze(m, e)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors cursor-pointer",
                            isFrozen ? "bg-purple-600 text-white" : "bg-[var(--bg)] text-[var(--text3)] hover:text-purple-600 border border-[var(--border)]"
                          )}
                          title={isFrozen ? "Muzlatishdan ochish" : "Muzlatish"}
                        >
                          {isFrozen ? <Unlock size={13} /> : <Lock size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 7. PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 bg-[var(--bg2)] border border-[var(--border)] rounded-3xl gap-3 shadow-xs">
          <span className="text-xs text-[var(--text3)] font-semibold">
            Jami <span className="font-black text-[var(--text)]">{filteredModels.length}</span> ta modeldan <span className="font-black text-[var(--text)]">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredModels.length)}</span> ko'rsatilmoqda
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-[var(--border)] transition-all text-[var(--text)]"
            >
              Oldingi
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map(num => (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={cn(
                    "w-8 h-8 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center",
                    currentPage === num
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:bg-[var(--border)]"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-[var(--border)] transition-all text-[var(--text)]"
            >
              Keyingi
            </button>
          </div>
        </div>
      )}

      {/* 8. MODAL: MODEL TRANSACTION HISTORY DRILLDOWN */}
      <ModelHistoryModal
        model={historyModalModel}
        isOpen={Boolean(historyModalModel)}
        onClose={() => setHistoryModalModel(null)}
        defaultWarehouse={currentOmbor}
      />

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
      />

    </div>
  );
}
