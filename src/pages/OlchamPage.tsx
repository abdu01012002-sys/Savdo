import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { ALL_SIZES, cn, generateId, getCat, getNowStr, getTodayStr, formatUzs, formatCompact } from '../lib/utils';
import { WarehouseName } from '../types';
import * as XLSX from 'xlsx';
import { 
  Package, 
  Search, 
  X, 
  Printer, 
  Split, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  Maximize2,
  Minimize2,
  Layers, 
  Sparkles, 
  Plus, 
  Minus, 
  Edit3, 
  Box, 
  Coins, 
  Flame, 
  AlertTriangle, 
  FileSpreadsheet, 
  Receipt,
  LayoutGrid,
  Table as TableIcon,
  PackageCheck,
  TrendingUp,
  Percent,
  Check,
  Info,
  SlidersHorizontal,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { ACTIVE_BOX_PRESETS, BOX_PRESETS, BoxPreset, calculateBoxRun, BoxStatsResult } from '../utils/boxCalculations';
import { BoxBreakdownModal } from '../components/olcham/BoxBreakdownModal';
import { OlchamMobileCardView, getHeatmapPillClass } from '../components/olcham/OlchamMobileCardView';

type TableViewMode = 'compact' | 'detailed' | 'boxes';
type DisplayLayout = 'auto' | 'table' | 'cards';
type RiskFilter = 'all' | 'broken' | 'has_zero' | 'balanced' | 'has_boxes' | 'only_loose';
type SeasonFilter = 'all' | 'qishki' | 'yozgi' | 'umumiy';
type SortOption = 'total-desc' | 'total-asc' | 'broken-desc' | 'name-asc' | 'value-desc' | 'cost-desc' | 'boxes-desc' | 'loose-desc';
type SizeCondition = 'all' | 'zero' | 'critical' | 'moderate' | 'plenty' | 'available';
type PrintMode = 'a4' | 'receipt';

// Ranglar va gradientlar o'lchamlar gistogrammasi uchun
const SIZE_COLORS: Record<string, { bg: string; text: string; bar: string; badge: string }> = {
  '39': { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500', badge: 'border-indigo-500/30' },
  '40': { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500', badge: 'border-blue-500/30' },
  '41': { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', bar: 'bg-cyan-500', badge: 'border-cyan-500/30' },
  '42': { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', badge: 'border-emerald-500/30' },
  '43': { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', badge: 'border-amber-500/30' },
  '44': { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500', badge: 'border-orange-500/30' },
  '45': { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500', badge: 'border-purple-500/30' },
};

export default function OlchamPage() {
  const { db, currentOmbor, currentUser, setDb } = useDb();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // View mode: compact (omborchi/tezkor), detailed (moliyaviy tahlil), boxes (qutilar/seriyalar)
  const [viewMode, setViewMode] = useState<TableViewMode>('compact');

  // Display layout: auto (responsive), table (jadval), cards (smart kartalar)
  const [displayLayout, setDisplayLayout] = useState<DisplayLayout>(() => {
    const saved = localStorage.getItem('olcham_display_layout') as DisplayLayout;
    return saved || 'auto';
  });

  const handleSetDisplayLayout = (layout: DisplayLayout) => {
    setDisplayLayout(layout);
    localStorage.setItem('olcham_display_layout', layout);
  };

  // Faol Quti / Seriya Shabloni (Tanlangan Box Run shabloni)
  const [activePresetId, setActivePresetId] = useState<string>('standard-8');
  const activePreset = useMemo(() => {
    return ACTIVE_BOX_PRESETS.find(p => p.id === activePresetId) || ACTIVE_BOX_PRESETS[0];
  }, [activePresetId]);

  // Modelning seriya qutisi tahlili modali
  const [activeBoxModalModel, setActiveBoxModalModel] = useState<string | null>(null);

  // Filters & State
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all');
  const [targetSize, setTargetSize] = useState<string>('all');
  const [sizeCondition, setSizeCondition] = useState<SizeCondition>('all');
  const [sortBy, setSortBy] = useState<SortOption>('total-desc');
  const [compareWarehouses, setCompareWarehouses] = useState(false);
  const [editingCell, setEditingCell] = useState<{ model: string; size: string; warehouse?: 'tepa' | 'kotta' } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Berkitib ochiladigan oynalar holati (boshlang'ich holatda doimiy yopiq/ixcham turadi)
  const [isHeaderOpen, setIsHeaderOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('olcham_header_open');
    return saved === 'true';
  });

  const [isDistributionOpen, setIsDistributionOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('olcham_distrib_open');
    return saved === 'true';
  });

  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('olcham_filter_open');
    return saved === 'true';
  });

  const toggleHeader = () => {
    setIsHeaderOpen(prev => {
      const next = !prev;
      localStorage.setItem('olcham_header_open', String(next));
      return next;
    });
  };

  const toggleDistribution = () => {
    setIsDistributionOpen(prev => {
      const next = !prev;
      localStorage.setItem('olcham_distrib_open', String(next));
      return next;
    });
  };

  const toggleFilter = () => {
    setIsFilterOpen(prev => {
      const next = !prev;
      localStorage.setItem('olcham_filter_open', String(next));
      return next;
    });
  };

  // Partiyaviy to'ldirish (Batch/Box Entry) modali
  const [boxModalOpen, setBoxModalOpen] = useState(false);
  const [selectedBatchModel, setSelectedBatchModel] = useState<string>('');
  const [batchActionType, setBatchActionType] = useState<'kirim' | 'chiqim'>('kirim');
  const [batchWarehouse, setBatchWarehouse] = useState<WarehouseName>(currentOmbor);
  const [batchSizes, setBatchSizes] = useState<Record<string, number>>({
    '39': 0, '40': 1, '41': 2, '42': 2, '43': 2, '44': 1, '45': 0
  });
  const [batchBoxCount, setBatchBoxCount] = useState<number>(1);
  const [batchComment, setBatchComment] = useState<string>('');

  // Print Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>('a4');

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (boxModalOpen) setBoxModalOpen(false);
        else if (printModalOpen) setPrintModalOpen(false);
        else if (activeBoxModalModel) setActiveBoxModalModel(null);
        else if (editingCell) setEditingCell(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [boxModalOpen, printModalOpen, activeBoxModalModel, editingCell]);

  const isAdmin = currentUser?.rol === 'admin';
  const stock = db[currentOmbor]?.stock || {};
  const tepaStock = db.tepa?.stock || {};
  const kottaStock = db.kotta?.stock || {};
  const prices = db.prices || {};

  // Barcha modellar ro'yxati
  const allModels = useMemo(() => {
    if (compareWarehouses) {
      const keys = new Set([...Object.keys(tepaStock), ...Object.keys(kottaStock)]);
      return Array.from(keys);
    }
    return Object.keys(stock);
  }, [stock, tepaStock, kottaStock, compareWarehouses]);

  // Modelning umumiy juftlari
  const getModelTotal = (m: string, warehouseStock = stock) => {
    return Object.values(warehouseStock[m] || {}).reduce((a, v) => Number(a) + (Number(v) || 0), 0) as number;
  };

  // Modelning kombinatsiyalangan jami (Ikkala ombor bo'yicha)
  const getCombinedTotal = (m: string) => {
    const t = getModelTotal(m, tepaStock);
    const k = getModelTotal(m, kottaStock);
    return t + k;
  };

  // Faol quti shabloni bo'yicha hisob-kitob (Box Run & Loose pairs)
  const getBoxStats = (m: string): BoxStatsResult => {
    const activeStock = compareWarehouses ? {
      ...ALL_SIZES.reduce((acc, sz) => {
        acc[sz] = (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0);
        return acc;
      }, {} as Record<string, number>)
    } : (stock[m] || {});

    return calculateBoxRun(activeStock, activePreset);
  };

  // Modelda qaysi o'lchamlar uzilgan (0 juft, lekin boshqa o'lchamlar bor)
  const getBrokenSizesCount = (m: string) => {
    const activeStock = compareWarehouses ? {
      ...ALL_SIZES.reduce((acc, sz) => {
        acc[sz] = (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0);
        return acc;
      }, {} as Record<string, number>)
    } : (stock[m] || {});

    const total = Object.values(activeStock).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total === 0) return 0;
    
    let zeroCount = 0;
    ALL_SIZES.forEach(sz => {
      if ((activeStock[sz] || 0) === 0) zeroCount++;
    });
    return zeroCount;
  };

  // Modelning mavjud o'lchamlar soni (7 tadan nechtasi bor)
  const getAvailableSizesCount = (m: string) => {
    const activeStock = compareWarehouses ? {
      ...ALL_SIZES.reduce((acc, sz) => {
        acc[sz] = (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0);
        return acc;
      }, {} as Record<string, number>)
    } : (stock[m] || {});

    let count = 0;
    ALL_SIZES.forEach(sz => {
      if ((activeStock[sz] || 0) > 0) count++;
    });
    return count;
  };

  // Har bir o'lcham bo'yicha umumiy zaxira statistikasi (Tepa, Kotta va Kombinatsiya)
  const { sizeStats, tepaSizeStats, kottaSizeStats, grandTepaTotal, grandKottaTotal } = useMemo(() => {
    const stats: Record<string, number> = {};
    const tepaStats: Record<string, number> = {};
    const kottaStats: Record<string, number> = {};
    let tTotal = 0;
    let kTotal = 0;

    ALL_SIZES.forEach(sz => {
      let tSum = 0;
      let kSum = 0;
      let sum = 0;
      allModels.forEach(m => {
        const t = Number(tepaStock[m]?.[sz]) || 0;
        const k = Number(kottaStock[m]?.[sz]) || 0;
        const s = Number(stock[m]?.[sz]) || 0;
        tSum += t;
        kSum += k;
        sum += compareWarehouses ? (t + k) : s;
      });
      stats[sz] = sum;
      tepaStats[sz] = tSum;
      kottaStats[sz] = kSum;
      tTotal += tSum;
      kTotal += kSum;
    });

    return { 
      sizeStats: stats, 
      tepaSizeStats: tepaStats, 
      kottaSizeStats: kottaStats,
      grandTepaTotal: tTotal,
      grandKottaTotal: kTotal
    };
  }, [allModels, stock, tepaStock, kottaStock, compareWarehouses]);

  const grandTotal = useMemo(() => {
    return Object.values(sizeStats).reduce((a, b) => a + b, 0);
  }, [sizeStats]);

  // Butun ombor gistogrammasi (sparkline) masshtabi uchun maksimal qiymat
  const maxTotalSizeQty = useMemo(() => {
    return Math.max(...Object.values(sizeStats), 1);
  }, [sizeStats]);

  // Jami to'liq qutilar va ortiqcha dona juftlar statistikasi
  const { grandBoxes, grandBoxedPairs, grandLoosePairs } = useMemo(() => {
    let boxes = 0;
    let boxedPairs = 0;
    let loose = 0;
    allModels.forEach(m => {
      const b = getBoxStats(m);
      boxes += b.fullBoxes;
      boxedPairs += b.boxedPairs;
      loose += b.loosePairs;
    });
    return { 
      grandBoxes: boxes, 
      grandBoxedPairs: boxedPairs, 
      grandLoosePairs: loose 
    };
  }, [allModels, stock, tepaStock, kottaStock, compareWarehouses, activePreset]);

  // Eng ko'p va eng kam zaxirali o'lchamlar
  const { topSize, deficitSize } = useMemo(() => {
    let maxVal = -1;
    let maxSz = '42';
    let minVal = Infinity;
    let minSz = '39';

    ALL_SIZES.forEach(sz => {
      const val = sizeStats[sz] || 0;
      if (val > maxVal) {
        maxVal = val;
        maxSz = sz;
      }
      if (val < minVal) {
        minVal = val;
        minSz = sz;
      }
    });

    return { topSize: maxSz, deficitSize: minSz };
  }, [sizeStats]);

  // Deferred values for responsive 60fps input
  const deferredSearch = React.useDeferredValue(search);
  const deferredRiskFilter = React.useDeferredValue(riskFilter);
  const deferredSeasonFilter = React.useDeferredValue(seasonFilter);
  const deferredTargetSize = React.useDeferredValue(targetSize);
  const deferredSizeCondition = React.useDeferredValue(sizeCondition);
  const deferredSortBy = React.useDeferredValue(sortBy);

  // Modellar filtri va saralashi (Yuqori tezlikdagi O(N) hisob-kitob)
  const filteredModels = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();

    // 1. Precalculate model properties once
    const modelMetaMap = new Map<string, {
      total: number;
      cat: string;
      brokenCount: number;
      availableCount: number;
      box: BoxStatsResult;
      targetSzQty: number;
      price: number;
      cost: number;
      hasMatchingSize: boolean;
    }>();

    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      const activeStock = compareWarehouses ? {
        ...ALL_SIZES.reduce((acc, sz) => {
          acc[sz] = (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0);
          return acc;
        }, {} as Record<string, number>)
      } : (stock[m] || {});

      let total = 0;
      let zeroCount = 0;
      let availableCount = 0;
      let hasMatchingSize = false;

      for (let s = 0; s < ALL_SIZES.length; s++) {
        const sz = ALL_SIZES[s];
        const val = Number(activeStock[sz]) || 0;
        total += val;
        if (val === 0) zeroCount++;
        else {
          availableCount++;
          if (q === sz) hasMatchingSize = true;
        }
      }

      const brokenCount = total === 0 ? 0 : zeroCount;
      const box = calculateBoxRun(activeStock, activePreset);
      const cat = getCat(m);
      const targetSzQty = deferredTargetSize !== 'all' ? (activeStock[deferredTargetSize] || 0) : 0;
      const price = prices[m]?.sale || 0;
      const cost = prices[m]?.cost || 0;

      modelMetaMap.set(m, {
        total,
        cat,
        brokenCount,
        availableCount,
        box,
        targetSzQty,
        price,
        cost,
        hasMatchingSize
      });
    }

    const results: string[] = [];

    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      const meta = modelMetaMap.get(m)!;

      // Search
      if (q) {
        const matchesName = m.toLowerCase().includes(q);
        const matchesCat = meta.cat.toLowerCase().includes(q);
        if (!matchesName && !matchesCat && !meta.hasMatchingSize) continue;
      }

      // Season filter
      if (deferredSeasonFilter !== 'all' && meta.cat !== deferredSeasonFilter) continue;

      // Risk & Box filter
      if (deferredRiskFilter === 'broken') {
        if (meta.total === 0 || meta.brokenCount === 0 || meta.availableCount === ALL_SIZES.length) continue;
      } else if (deferredRiskFilter === 'has_zero') {
        if (meta.brokenCount === 0 && meta.total > 0) continue;
      } else if (deferredRiskFilter === 'balanced') {
        if (meta.availableCount < ALL_SIZES.length || meta.total === 0) continue;
      } else if (deferredRiskFilter === 'has_boxes') {
        if (meta.box.fullBoxes === 0) continue;
      } else if (deferredRiskFilter === 'only_loose') {
        if (meta.box.fullBoxes > 0 || meta.total === 0) continue;
      }

      // Target size filter
      if (deferredTargetSize !== 'all') {
        const szQty = meta.targetSzQty;
        if (deferredSizeCondition === 'zero' && szQty !== 0) continue;
        if (deferredSizeCondition === 'critical' && (szQty === 0 || szQty >= 5)) continue;
        if (deferredSizeCondition === 'moderate' && (szQty < 5 || szQty >= 15)) continue;
        if (deferredSizeCondition === 'plenty' && szQty < 15) continue;
        if (deferredSizeCondition === 'available' && szQty === 0) continue;
      }

      results.push(m);
    }

    // Sort using precalculated metadata
    results.sort((a, b) => {
      const metaA = modelMetaMap.get(a)!;
      const metaB = modelMetaMap.get(b)!;

      if (deferredSortBy === 'total-desc') return metaB.total - metaA.total;
      if (deferredSortBy === 'total-asc') return metaA.total - metaB.total;
      if (deferredSortBy === 'boxes-desc') return metaB.box.fullBoxes - metaA.box.fullBoxes;
      if (deferredSortBy === 'loose-desc') return metaB.box.loosePairs - metaA.box.loosePairs;
      if (deferredSortBy === 'broken-desc') return metaB.brokenCount - metaA.brokenCount;
      if (deferredSortBy === 'name-asc') return a.localeCompare(b);
      if (deferredSortBy === 'value-desc') return (metaB.total * metaB.price) - (metaA.total * metaA.price);
      if (deferredSortBy === 'cost-desc') return (metaB.total * metaB.cost) - (metaA.total * metaA.cost);
      return 0;
    });

    return results;
  }, [allModels, deferredSearch, deferredSeasonFilter, deferredRiskFilter, deferredTargetSize, deferredSizeCondition, deferredSortBy, stock, tepaStock, kottaStock, compareWarehouses, prices, activePreset]);

  // Moliyaviy Jami hisob-kitoblar (Sotuv va Tannarx)
  const totalValuation = useMemo(() => {
    let totalSale = 0;
    let totalCost = 0;
    filteredModels.forEach(m => {
      const qty = compareWarehouses ? getCombinedTotal(m) : getModelTotal(m);
      const saleP = prices[m]?.sale || 0;
      const costP = prices[m]?.cost || 0;
      totalSale += (qty * saleP);
      totalCost += (qty * costP);
    });
    return {
      totalSale,
      totalCost,
      margin: totalSale > 0 ? ((totalSale - totalCost) / totalSale) * 100 : 0
    };
  }, [filteredModels, prices, compareWarehouses, stock, tepaStock, kottaStock]);

  // Miqdorni o'zgartirish (Admin inline editing)
  const updateQuantity = (model: string, sz: string, newVal: number, targetWarehouse: WarehouseName = currentOmbor) => {
    const val = Math.max(0, newVal);
    const targetStock = db[targetWarehouse]?.stock || {};
    const oldVal = targetStock[model]?.[sz] || 0;
    if (val === oldVal) {
      setEditingCell(null);
      return;
    }

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      if (!draft[targetWarehouse].stock[model]) draft[targetWarehouse].stock[model] = {};
      draft[targetWarehouse].stock[model][sz] = val;

      draft[targetWarehouse].transactions.push({
        id: generateId(),
        vaqt: getNowStr(),
        sana: getTodayStr(),
        amal: val > oldVal ? 'kirim' : 'chiqim',
        model,
        olcham: sz,
        soni: Math.abs(val - oldVal),
        kimdan: "O'lcham matritsasi (Admin)",
        izoh: `O'lcham ${sz} tahrirlandi: ${oldVal} → ${val} juft (${targetWarehouse === 'tepa' ? 'Tepa' : targetWarehouse === 'kotta' ? 'Kotta' : '2-Sort'})`,
        xodim: currentUser?.ism || 'Admin'
      });
      return draft;
    });

    toast.success(`${model} (${sz}-o'lcham) yangilandi: ${val} juft`);
    setEditingCell(null);
  };

  // Tezkor Stepper (+1 / -1)
  const stepQuantity = (e: React.MouseEvent, model: string, sz: string, delta: number, targetWarehouse: WarehouseName = currentOmbor) => {
    e.stopPropagation();
    const currentQty = (db[targetWarehouse]?.stock?.[model]?.[sz]) || 0;
    const nextQty = Math.max(0, currentQty + delta);
    updateQuantity(model, sz, nextQty, targetWarehouse);
  };

  // Partiyaviy to'ldirishni saqlash (Batch Box submit)
  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchModel) {
      toast.error("Iltimos, modelni tanlang!");
      return;
    }
    if (batchBoxCount <= 0) {
      toast.error("Qutilar soni kamida 1 bo'lishi kerak!");
      return;
    }

    const totalPairsInOneBox = Object.values(batchSizes).reduce((a, b) => a + (Number(b) || 0), 0);
    if (totalPairsInOneBox <= 0) {
      toast.error("Quti ichida kamida bitta o'lcham jufti bo'lishi kerak!");
      return;
    }

    const totalBatchPairs = totalPairsInOneBox * batchBoxCount;

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const targetWh = draft[batchWarehouse];
      if (!targetWh.stock[selectedBatchModel]) targetWh.stock[selectedBatchModel] = {};

      ALL_SIZES.forEach(sz => {
        const added = (batchSizes[sz] || 0) * batchBoxCount;
        if (added > 0) {
          const current = targetWh.stock[selectedBatchModel][sz] || 0;
          if (batchActionType === 'kirim') {
            targetWh.stock[selectedBatchModel][sz] = current + added;
          } else {
            targetWh.stock[selectedBatchModel][sz] = Math.max(0, current - added);
          }

          targetWh.transactions.push({
            id: generateId(),
            vaqt: getNowStr(),
            sana: getTodayStr(),
            amal: batchActionType,
            model: selectedBatchModel,
            olcham: sz,
            soni: added,
            kimdan: batchActionType === 'kirim' ? "Partiyaviy Qabul (Fabrika/Ishlab chiqarish)" : "Partiyaviy Chiqim",
            izoh: `Partiyaviy ${batchBoxCount} quti (${batchComment || 'Standart to\'ldirish'})`,
            xodim: currentUser?.ism || 'Admin'
          });
        }
      });

      return draft;
    });

    toast.success(`${selectedBatchModel}: ${totalBatchPairs} juft (${batchBoxCount} quti) muvaffaqiyatli ${batchActionType === 'kirim' ? 'qabul qilindi' : 'chiqarildi'}!`);
    setBoxModalOpen(false);
  };

  // Presetni qo'llash
  const applyPreset = (preset: typeof BOX_PRESETS[0]) => {
    setBatchSizes({ ...preset.sizes });
    toast.info(`"${preset.name}" shabloni tanlandi (${preset.total} juft/quti)`);
  };

  // Formatlangan Excel eksport
  const exportExcel = () => {
    const header = [
      '#', 
      'Model nomi', 
      'Mavsum', 
      ...ALL_SIZES.map(s => `O'lcham ${s}`), 
      'Jami juft',
      'To\'liq qutilar (8-lik)',
      'Ortiqcha juft',
      'Tannarx (UZS)',
      'Tannarx Qiymati',
      'Sotish narxi (UZS)', 
      'Sotuv Qiymati',
      'Taxminiy Foyda',
      'Holati'
    ];
    const data = [header];
    
    filteredModels.forEach((m, i) => {
      const cat = getCat(m);
      const total = compareWarehouses ? getCombinedTotal(m) : getModelTotal(m);
      const box = getBoxStats(m);
      const saleP = prices[m]?.sale || 0;
      const costP = prices[m]?.cost || 0;
      const saleVal = total * saleP;
      const costVal = total * costP;
      const profit = saleVal - costVal;
      const broken = getBrokenSizesCount(m);
      const status = total === 0 ? "Tugagan (0)" : broken > 0 ? `Notekis (${broken} ta uzilish)` : "To'liq komplekt";

      data.push([
        (i + 1).toString(),
        m,
        cat === 'qishki' ? 'Qishki' : cat === 'yozgi' ? 'Yozgi' : 'Umumiy',
        ...ALL_SIZES.map(sz => {
          if (compareWarehouses) {
            return `${tepaStock[m]?.[sz] || 0} / ${kottaStock[m]?.[sz] || 0}`;
          }
          return (stock[m]?.[sz] || 0).toString();
        }),
        total.toString(),
        box.fullBoxes.toString(),
        box.loosePairs.toString(),
        costP > 0 ? costP.toString() : '0',
        costVal > 0 ? costVal.toString() : '0',
        saleP > 0 ? saleP.toString() : '0',
        saleVal > 0 ? saleVal.toString() : '0',
        profit > 0 ? profit.toString() : '0',
        status
      ]);
    });

    // Jami qator
    data.push([
      'JAMI',
      `${filteredModels.length} ta model`,
      '',
      ...ALL_SIZES.map(sz => sizeStats[sz].toString()),
      grandTotal.toString(),
      grandBoxes.toString(),
      '',
      '',
      totalValuation.totalCost.toString(),
      '',
      totalValuation.totalSale.toString(),
      (totalValuation.totalSale - totalValuation.totalCost).toString(),
      ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 5 }, { wch: 25 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "O'lchamlar Matritsasi");
    XLSX.writeFile(wb, `${currentOmbor}_olchamlar_matritsasi_${getTodayStr()}.xlsx`);
    toast.success("Formatlangan Excel fayli muvaffaqiyatli yuklab olindi!");
  };

  // Chop etish
  const executePrint = () => {
    window.print();
  };

  // Micro-badge katakcha stili (Rangli Zaxira Heatmap)
  const getCellPillStyle = (qty: number) => {
    if (qty === 0) {
      return "bg-zinc-500/10 text-zinc-400 dark:text-zinc-500 border-zinc-300/40 dark:border-zinc-800 opacity-60 font-medium";
    }
    if (qty <= 3) {
      return "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 font-black ring-1 ring-rose-500/20 shadow-2xs";
    }
    if (qty <= 9) {
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold";
    }
    return "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950 border-emerald-600 font-black shadow-xs";
  };

  return (
    <div className="flex flex-col gap-4 pb-12">
      
      {/* 1. SAHIFA SARLAVHASI VA AMALLAR PANELI (BERKITIB OCHILADIGAN) */}
      <div className={cn(
        "bg-[var(--bg2)] border border-[var(--border)] rounded-3xl transition-all duration-200 shadow-xs",
        isHeaderOpen ? "p-4 sm:p-5" : "p-2.5 sm:p-3"
      )}>
        {isHeaderOpen ? (
          /* Ochiq to'liq ko'rinish */
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shrink-0">
                  <Layers size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight">
                      O'lchamlar Matritsasi & Zaxira
                    </h1>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-[11px] font-black uppercase">
                      39–45
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--text3)] flex items-center gap-1.5 mt-0.5">
                    <span>{currentOmbor === 'tepa' ? '🏔 Tepa Ombor' : '🏢 Kotta Ombor'}</span>
                    <span>•</span>
                    <span>Zaxira chuqurligi, standart seriyalar & moliyaviy tahlil</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Asosiy Amallar va Yig'ish Tugmasi */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Partiyaviy To'ldirish (Batch/Box Entry) */}
              {isAdmin && (
                <button
                  onClick={() => {
                    setSelectedBatchModel(filteredModels[0] || allModels[0] || '');
                    setBoxModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-purple-600/20 shrink-0"
                >
                  <Box size={14} />
                  <span>Quti / Partiya</span>
                </button>
              )}

              {/* Omborlarni Taqqoslash Toggle */}
              <button
                onClick={() => setCompareWarehouses(!compareWarehouses)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border shadow-xs shrink-0",
                  compareWarehouses 
                    ? "bg-purple-600 text-white border-purple-600 shadow-purple-500/20"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)]"
                )}
                title="Tepa va Kotta ombordagi o'lchamlarni yonma-yon solishtirish"
              >
                <Split size={14} />
                <span>{compareWarehouses ? "Taqqoslash: Yoniq" : "Omborlarni Taqqoslash"}</span>
              </button>

              {/* Formatlangan Excel Export */}
              <button
                onClick={exportExcel}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
              >
                <FileSpreadsheet size={14} />
                <span>Excel</span>
              </button>

              {/* Chop etish */}
              <button
                onClick={() => setPrintModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
              >
                <Printer size={14} />
                <span>Chop etish</span>
              </button>

              {/* Sarlavhani Berkitish Tugmasi */}
              <button
                onClick={toggleHeader}
                className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                title="Sarlavha panelini yig'ish (ekranda joyni kengaytirish)"
              >
                <ChevronUp size={14} />
                <span className="hidden sm:inline text-[11px] font-bold">Yig'ish</span>
              </button>
            </div>
          </div>
        ) : (
          /* Yig'ilgan (Kompakt) sarlavha ko'rinishi */
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shrink-0">
                <Layers size={15} />
              </div>
              <span className="text-sm font-black text-[var(--text)] tracking-tight">
                O'lchamlar Matritsasi & Zaxira
              </span>
              <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 text-[10px] font-black">
                39–45
              </span>
              <span className="text-[11px] font-bold text-[var(--text3)] hidden md:inline">
                • {currentOmbor === 'tepa' ? '🏔 Tepa Ombor' : '🏢 Kotta Ombor'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <button
                  onClick={() => {
                    setSelectedBatchModel(filteredModels[0] || allModels[0] || '');
                    setBoxModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                  title="Quti / Partiya to'ldirish"
                >
                  <Box size={13} />
                  <span className="hidden sm:inline">Quti</span>
                </button>
              )}

              <button
                onClick={() => setCompareWarehouses(!compareWarehouses)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border shadow-xs shrink-0",
                  compareWarehouses 
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)]"
                )}
                title="Taqqoslash"
              >
                <Split size={13} />
                <span className="hidden sm:inline">{compareWarehouses ? "Taqqoslash: Yoniq" : "Taqqoslash"}</span>
              </button>

              <button
                onClick={exportExcel}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer flex items-center gap-1 shrink-0"
                title="Excel yuklab olish"
              >
                <FileSpreadsheet size={13} />
                <span className="hidden sm:inline">Excel</span>
              </button>

              <button
                onClick={() => setPrintModalOpen(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1 shrink-0"
                title="Chop etish"
              >
                <Printer size={13} />
              </button>

              <button
                onClick={toggleHeader}
                className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white transition-all cursor-pointer flex items-center gap-1 shrink-0"
                title="Sarlavha panelini to'liq ochish"
              >
                <ChevronDown size={14} />
                <span className="text-[11px]">Ochish</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. ZAMONAVIY 39-45 TAQSIMOT GISTOGRAMMASI & KPI SUMMARY (BERKITIB OCHILADIGAN) */}
      <div className={cn(
        "bg-[var(--bg2)] border border-[var(--border)] rounded-3xl transition-all duration-200 shadow-xs",
        isDistributionOpen ? "p-4 sm:p-5 flex flex-col gap-4" : "p-3"
      )}>
        {isDistributionOpen ? (
          /* Ochiq to'liq taqsimot ko'rinishi */
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-500" />
                  Umumiy O'lchamlar Taqsimoti
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xl sm:text-2xl font-black text-[var(--text)] tabular-nums">
                    {grandTotal.toLocaleString()} <span className="text-xs font-bold text-[var(--text3)] uppercase">Juft Zaxira</span>
                  </span>
                  <span className="text-xs font-bold text-[var(--text3)]">
                    ({filteredModels.length} xil model)
                  </span>
                </div>
              </div>

              {/* Tezkor Ko'rsatkichlar & Yig'ish Tugmasi */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 shadow-2xs">
                  <PackageCheck size={14} className="text-purple-600 dark:text-purple-400" />
                  <span>To'liq Qutilar: <strong className="font-black text-purple-600 dark:text-purple-400">{grandBoxes.toLocaleString()} quti</strong> ({grandBoxedPairs.toLocaleString()} jft)</span>
                </div>

                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-400 shadow-2xs">
                  <Box size={14} className="text-amber-600 dark:text-amber-400" />
                  <span>Ortiqcha Dona: <strong className="font-black">{grandLoosePairs.toLocaleString()} juft</strong></span>
                </div>

                <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--text)] shadow-2xs">
                  <Coins size={13} className="text-emerald-500" />
                  <span>Sotuv: <strong>{formatCompact(totalValuation.totalSale)}</strong></span>
                  <span className="text-[var(--text3)]">|</span>
                  <span className="text-[var(--text3)]">Tannarx: <strong>{formatCompact(totalValuation.totalCost)}</strong></span>
                </div>

                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Flame size={13} className="text-emerald-500" />
                  <span>Top: <strong>{topSize}-o'lcham</strong> ({sizeStats[topSize]?.toLocaleString()} jft)</span>
                </div>

                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={13} className="text-rose-500" />
                  <span>Defitsit: <strong>{deficitSize}-o'lcham</strong> ({sizeStats[deficitSize]?.toLocaleString()} jft)</span>
                </div>

                {/* Yig'ish Tugmasi */}
                <button
                  onClick={toggleDistribution}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                  title="Taqsimot panelini yig'ish (maydonni kengaytirish)"
                >
                  <ChevronUp size={14} />
                  <span className="hidden sm:inline text-[11px] font-bold">Yig'ish</span>
                </button>
              </div>
            </div>

            {/* Stacked Proportional Distribution Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-full bg-[var(--bg)] rounded-full overflow-hidden flex border border-[var(--border)] p-0.5">
                {ALL_SIZES.map(sz => {
                  const qty = sizeStats[sz] || 0;
                  const percent = grandTotal > 0 ? (qty / grandTotal) * 100 : 0;
                  if (percent === 0) return null;
                  return (
                    <div
                      key={sz}
                      style={{ width: `${percent}%` }}
                      className={cn(SIZE_COLORS[sz]?.bar || 'bg-purple-500', "h-full transition-all relative group cursor-pointer hover:opacity-85")}
                      title={`${sz}-o'lcham: ${qty.toLocaleString()} juft (${percent.toFixed(1)}%)`}
                      onClick={() => {
                        setTargetSize(sz);
                        setSizeCondition('all');
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* 7 ta O'lcham Kartalari */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {ALL_SIZES.map(sz => {
                const qty = sizeStats[sz] || 0;
                const percent = grandTotal > 0 ? (qty / grandTotal) * 100 : 0;
                const isTop = sz === topSize;
                const isDeficit = sz === deficitSize;
                const isSelected = targetSize === sz;

                return (
                  <div 
                    key={sz}
                    onClick={() => {
                      setTargetSize(targetSize === sz ? 'all' : sz);
                    }}
                    className={cn(
                      "bg-[var(--bg)] border rounded-2xl p-2.5 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden group shadow-2xs",
                      isSelected
                        ? "border-purple-500 ring-2 ring-purple-500/30 bg-purple-500/5"
                        : "border-[var(--border)] hover:border-purple-500/40 hover:bg-[var(--bg2)]"
                    )}
                    title={`Faqat ${sz}-o'lcham bo'yicha filtrlash`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg border", SIZE_COLORS[sz]?.bg, SIZE_COLORS[sz]?.text, SIZE_COLORS[sz]?.badge)}>
                        {sz}
                      </span>
                      {isTop && (
                        <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                          Top
                        </span>
                      )}
                      {isDeficit && (
                        <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-500/20">
                          Kam
                        </span>
                      )}
                    </div>

                    <div className="mt-2">
                      <div className="text-base font-black text-[var(--text)] tabular-nums">
                        {qty.toLocaleString()} <span className="text-[10px] font-bold text-[var(--text3)] uppercase">juft</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text3)] mt-0.5">
                        <span>Ulushi:</span>
                        <span className="text-[var(--text)] font-extrabold">{percent.toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-[var(--border)] h-1 rounded-full overflow-hidden mt-1.5">
                      <div 
                        className={cn(SIZE_COLORS[sz]?.bar || 'bg-purple-500', "h-full rounded-full transition-all")}
                        style={{ width: `${Math.min(100, percent * 2.5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Yig'ilgan (Kompakt) taqsimot ko'rinishi */
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                <Sparkles size={14} className="text-purple-500" />
                <span>Umumiy O'lchamlar Taqsimoti</span>
              </span>
              <span className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">
                {grandTotal.toLocaleString()} juft
              </span>
              <span className="text-xs font-bold text-[var(--text3)] hidden sm:inline">
                ({filteredModels.length} xil model)
              </span>
            </div>

            {/* Qisqacha ko'rsatkichlar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden md:flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold text-purple-700 dark:text-purple-300">
                <PackageCheck size={13} className="text-purple-600" />
                <span>{grandBoxes.toLocaleString()} quti</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">+{grandLoosePairs.toLocaleString()} dona</span>
              </div>

              <div className="hidden lg:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <Flame size={12} />
                <span>Top: {topSize} ({sizeStats[topSize]?.toLocaleString()} jft)</span>
              </div>

              <div className="hidden lg:flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle size={12} />
                <span>Defitsit: {deficitSize} ({sizeStats[deficitSize]?.toLocaleString()} jft)</span>
              </div>

              {/* Ochish Tugmasi */}
              <button
                onClick={toggleDistribution}
                className="px-3 py-1 rounded-xl text-xs font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                title="O'lchamlar taqsimoti kartalarini ochish"
              >
                <ChevronDown size={14} />
                <span>Taqsimotni Ochish</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. KO'RINISH REJIMLARI (VIEW MODES), QUTI SHABLONI VA FILTRLAR (BERKITIB OCHILADIGAN) */}
      <div className={cn(
        "bg-[var(--bg2)] border border-[var(--border)] rounded-2xl transition-all duration-200 shadow-xs",
        isFilterOpen ? "p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3" : "p-2.5"
      )}>
        {isFilterOpen ? (
          /* Ochiq to'liq filtrlar va rejimlar ko'rinishi */
          <>
            {/* Chap tomon: Rejim Switcher + Quti Shabloni + Qidiruv */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* 3 xil ko'rinish rejimi */}
              <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] shrink-0">
                <button
                  onClick={() => setViewMode('compact')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                    viewMode === 'compact'
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Kompakt rejim: Faqat model, 39-45 o'lchamlar matritsasi va quti hisobi"
                >
                  <LayoutGrid size={13} />
                  <span>Kompakt</span>
                </button>

                <button
                  onClick={() => setViewMode('detailed')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                    viewMode === 'detailed'
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Batafsil rejim: Tannarx, sotuv qiymati va foyda hisoblari bilan"
                >
                  <TableIcon size={13} />
                  <span>Batafsil (Moliya)</span>
                </button>

                <button
                  onClick={() => setViewMode('boxes')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                    viewMode === 'boxes'
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Qutilar & Seriyalar: To'liq quti tahlili va uzilishlar"
                >
                  <PackageCheck size={13} />
                  <span>Faqat Qutilar</span>
                </button>
              </div>

              {/* Faol Quti Shabloni Tanlash Dropdown */}
              <div className="flex items-center gap-1.5 bg-[var(--bg)] px-2.5 py-1.5 rounded-xl border border-[var(--border)] shrink-0">
                <Box size={13} className="text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-bold text-[var(--text3)] hidden sm:inline">Shablon:</span>
                <div className="relative">
                  <select
                    value={activePresetId}
                    onChange={e => setActivePresetId(e.target.value)}
                    className="pr-5 bg-transparent text-xs font-black text-purple-600 dark:text-purple-400 outline-none cursor-pointer appearance-none"
                  >
                    {ACTIVE_BOX_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                </div>
              </div>

              {/* Qidiruv Input */}
              <div className="relative min-w-[170px] flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] w-3.5 h-3.5" />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Model yoki razmer qidirish..." 
                  className="w-full pl-8.5 pr-8 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500 transition-all"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-0.5 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Xavf & Quti Filtrlari Tabs */}
              <div className="flex items-center bg-[var(--bg)] p-0.5 rounded-xl border border-[var(--border)] shrink-0 overflow-x-auto">
                <button
                  onClick={() => setRiskFilter('all')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    riskFilter === 'all'
                      ? "bg-[var(--bg2)] text-purple-600 shadow-xs border border-[var(--border)] font-extrabold"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  <span>Barchasi</span>
                  <span className="text-[10px] opacity-75 font-black">({allModels.length})</span>
                </button>

                <button
                  onClick={() => setRiskFilter('has_boxes')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    riskFilter === 'has_boxes'
                      ? "bg-purple-600 text-white shadow-xs font-extrabold"
                      : "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                  )}
                  title="Kamida 1 ta to'liq qutisi (seriyasi) bor modellar"
                >
                  <PackageCheck size={12} className="shrink-0" />
                  <span>📦 Qutili</span>
                </button>

                <button
                  onClick={() => setRiskFilter('only_loose')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    riskFilter === 'only_loose'
                      ? "bg-amber-500 text-white shadow-xs font-extrabold"
                      : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  )}
                  title="To'liq qutisi yo'q, faqat tarqoq donalar qolgan modellar"
                >
                  <Box size={12} className="shrink-0" />
                  <span>⚠️ Donalar</span>
                </button>

                <button
                  onClick={() => setRiskFilter('broken')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    riskFilter === 'broken'
                      ? "bg-rose-500 text-white shadow-xs font-extrabold"
                      : "text-rose-500 hover:bg-rose-500/10"
                  )}
                  title="Ba'zi o'lchamlari 0 bo'lib qolgan notekis modellar"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
                  <span>🔴 Notekis</span>
                </button>

                <button
                  onClick={() => setRiskFilter('balanced')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    riskFilter === 'balanced'
                      ? "bg-emerald-600 text-white shadow-xs font-extrabold"
                      : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  )}
                  title="Barcha 39-45 o'lchamlari mavjud bo'lgan to'liq komplektlar"
                >
                  <CheckCircle2 size={12} className="shrink-0" />
                  <span>✅ Balansli</span>
                </button>
              </div>

            </div>

            {/* O'ng tomon: Razmer Filtrlari, Mavsum, Saralash va Yig'ish Tugmasi */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Tanlangan O'lcham & Shart Dropdown */}
              <div className="flex items-center gap-1 bg-[var(--bg)] p-0.5 rounded-xl border border-[var(--border)]">
                <div className="relative">
                  <select
                    value={targetSize}
                    onChange={e => setTargetSize(e.target.value)}
                    className="pl-2 pr-6 py-1.5 appearance-none bg-transparent text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
                  >
                    <option value="all">📏 Barcha o'lchamlar</option>
                    {ALL_SIZES.map(sz => (
                      <option key={sz} value={sz}>{sz}-o'lcham</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                </div>

                {targetSize !== 'all' && (
                  <div className="relative border-l border-[var(--border)] pl-1">
                    <select
                      value={sizeCondition}
                      onChange={e => setSizeCondition(e.target.value as any)}
                      className="pl-2 pr-6 py-1.5 appearance-none bg-transparent text-xs font-bold text-purple-600 dark:text-purple-400 outline-none cursor-pointer"
                    >
                      <option value="all">Shart: Barchasi</option>
                      <option value="zero">0️⃣ Tugagan (0 juft)</option>
                      <option value="critical">🔴 Kritik (&lt; 5 juft)</option>
                      <option value="moderate">🟡 O'rtacha (5–14)</option>
                      <option value="plenty">🟢 Mo'l (15+)</option>
                      <option value="available">📦 Mavjud (&gt; 0)</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Mavsum Dropdown */}
              <div className="relative">
                <select
                  value={seasonFilter}
                  onChange={e => setSeasonFilter(e.target.value as any)}
                  className={cn(
                    "pl-2.5 pr-7 py-2 appearance-none bg-[var(--bg)] border rounded-xl text-xs font-bold outline-none cursor-pointer transition-colors",
                    seasonFilter !== 'all' ? "border-purple-500 text-purple-600 bg-purple-500/5 font-extrabold" : "border-[var(--border)] text-[var(--text)]"
                  )}
                >
                  <option value="all">⛅️ Mavsum: Barchasi</option>
                  <option value="qishki">❄️ Qishki</option>
                  <option value="yozgi">☀️ Yozgi</option>
                  <option value="umumiy">👟 Umumiy</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
              </div>

              {/* Saralash Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="pl-2.5 pr-7 py-2 appearance-none bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="total-desc">📦 Qoldiq: Ko'pdan kamga</option>
                  <option value="total-asc">⚠️ Qoldiq: Kamdan ko'pga</option>
                  <option value="boxes-desc">📦 To'liq qutilar bo'yicha</option>
                  <option value="broken-desc">🔴 Eng ko'p uzilishli</option>
                  <option value="value-desc">💰 Sotuv qiymati bo'yicha</option>
                  <option value="cost-desc">🏷 Tannarx bo'yicha</option>
                  <option value="name-asc">🔤 Model (A-Z)</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
              </div>

              {/* Tozalash */}
              {(riskFilter !== 'all' || seasonFilter !== 'all' || targetSize !== 'all' || search) && (
                <button
                  onClick={() => {
                    setRiskFilter('all');
                    setSeasonFilter('all');
                    setTargetSize('all');
                    setSizeCondition('all');
                    setSearch('');
                  }}
                  className="px-2.5 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1"
                  title="Barcha filtrlarni tozalash"
                >
                  <X size={12} />
                  <span className="hidden sm:inline">Tozalash</span>
                </button>
              )}

              {/* Yig'ish Tugmasi */}
              <button
                onClick={toggleFilter}
                className="px-2.5 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                title="Filtrlar panelini yig'ish (maydonni kengaytirish)"
              >
                <ChevronUp size={14} />
                <span className="hidden sm:inline text-[11px] font-bold">Yig'ish</span>
              </button>

            </div>
          </>
        ) : (
          /* Yig'ilgan (Kompakt) filtrlar ko'rinishi */
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Chap tomon: Rejim Switcher + Tezkor Qidiruv */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-[var(--bg)] p-0.5 rounded-lg border border-[var(--border)]">
                <button
                  onClick={() => setViewMode('compact')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer",
                    viewMode === 'compact' ? "bg-purple-600 text-white font-black" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Kompakt rejim"
                >
                  Kompakt
                </button>
                <button
                  onClick={() => setViewMode('detailed')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer",
                    viewMode === 'detailed' ? "bg-purple-600 text-white font-black" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Batafsil rejim"
                >
                  Batafsil
                </button>
                <button
                  onClick={() => setViewMode('boxes')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer",
                    viewMode === 'boxes' ? "bg-purple-600 text-white font-black" : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Qutilar rejimi"
                >
                  Qutilar
                </button>
              </div>

              {/* Tezkor qidiruv */}
              <div className="relative min-w-[150px] max-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-3 h-3" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Qidirish..." 
                  className="w-full pl-7 pr-6 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500"
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-0.5 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Faol filtrlar ko'rsatkichi */}
              <span className="text-[11px] font-bold text-[var(--text3)] hidden sm:inline">
                {filteredModels.length} / {allModels.length} model
              </span>

              {(riskFilter !== 'all' || seasonFilter !== 'all' || targetSize !== 'all') && (
                <div className="flex items-center gap-1 bg-purple-500/10 text-purple-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-purple-500/20">
                  <span>Filtr faol</span>
                  <button 
                    onClick={() => {
                      setRiskFilter('all');
                      setSeasonFilter('all');
                      setTargetSize('all');
                      setSizeCondition('all');
                    }}
                    className="hover:text-rose-500 cursor-pointer ml-0.5"
                    title="Filtrlarni tozalash"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* O'ng tomon: Ochish Tugmasi */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFilter}
                className="px-3 py-1 rounded-xl text-xs font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                title="Barcha filtrlar va saralash parametrlarini ochish"
              >
                <SlidersHorizontal size={13} />
                <span>Filtrlarni Ochish</span>
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 4. LEGENDA & ADMIN QO'LLANMASI & REJIM SWITCHER */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs font-semibold text-[var(--text3)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text)] font-extrabold flex items-center gap-1">
            <Info size={13} className="text-purple-500" />
            Zaxira Darajasi (Heatmap):
          </span>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 text-[11px] font-medium">—</span>
            <span>0 juft (Bo'sh / Tugagan)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-[11px] font-black">1-3</span>
            <span className="text-rose-600 dark:text-rose-400 font-bold">1-3 juft (Kritik defitsit)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-bold">4-9</span>
            <span>4-9 juft (O'rtacha)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950 text-[11px] font-black">10+</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black">10+ juft (Mo'l zaxira)</span>
          </div>
        </div>

        {/* Rejim Ko'rinishi Switcher (Kartalar vs Jadval) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-[var(--bg)] p-1 rounded-2xl border border-[var(--border)] shadow-2xs">
            <button
              onClick={() => handleSetDisplayLayout('auto')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                displayLayout === 'auto' 
                  ? "bg-purple-600 text-white font-black shadow-xs" 
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="Telefonda avtomatik smart kartalar, kompyuterda jadval"
            >
              <Sparkles size={13} />
              <span>Avto</span>
            </button>
            <button
              onClick={() => handleSetDisplayLayout('cards')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                displayLayout === 'cards' 
                  ? "bg-purple-600 text-white font-black shadow-xs" 
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="Smart Mobile Kartalar ko'rinishi (o'lchamlar pill/chip badge)"
            >
              <LayoutGrid size={13} />
              <span>Smart Kartalar</span>
            </button>
            <button
              onClick={() => handleSetDisplayLayout('table')}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                displayLayout === 'table' 
                  ? "bg-purple-600 text-white font-black shadow-xs" 
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="To'liq 39-45 jadval ko'rinishi"
            >
              <TableIcon size={13} />
              <span>Jadval</span>
            </button>
          </div>

          {isAdmin && (
            <div className="hidden sm:flex text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-xl items-center gap-1.5">
              <Edit3 size={12} />
              <span>Admin: katakchani bosib tahrirlang</span>
            </div>
          )}
        </div>
      </div>

      {/* SMART MOBILE CARDS VIEW (Avto rejimda mobilda, yoki Kartalar tanlanganda) */}
      {(displayLayout === 'cards' || displayLayout === 'auto') && (
        <div className={displayLayout === 'auto' ? 'block lg:hidden' : 'block'}>
          <OlchamMobileCardView
            filteredModels={filteredModels}
            stock={stock}
            tepaStock={tepaStock}
            kottaStock={kottaStock}
            prices={prices}
            compareWarehouses={compareWarehouses}
            viewMode={viewMode}
            activePreset={activePreset}
            isAdmin={isAdmin}
            targetSize={targetSize}
            getBoxStats={getBoxStats}
            getBrokenSizesCount={getBrokenSizesCount}
            getAvailableSizesCount={getAvailableSizesCount}
            getModelTotal={getModelTotal}
            getCombinedTotal={getCombinedTotal}
            updateQuantity={updateQuantity}
            stepQuantity={stepQuantity}
            onOpenBoxModal={(m) => {
              setSelectedBatchModel(m);
              setBoxModalOpen(true);
            }}
            onOpenBoxBreakdown={(m) => setActiveBoxModalModel(m)}
          />
        </div>
      )}

      {/* 5. ASOSIY O'LCHAMLAR MATRITSASI JADVALI */}
      {(displayLayout === 'table' || displayLayout === 'auto') && (
      <div className={cn(
        "relative rounded-3xl border border-[var(--border)] shadow-xs bg-[var(--bg2)] overflow-hidden",
        displayLayout === 'auto' ? "hidden lg:block" : "block"
      )}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            
            {/* Sticky Header */}
            <thead className="bg-[var(--bg)] border-b border-[var(--border)] sticky top-0 z-30 shadow-xs">
              <tr>
                {/* Sticky # Ustun */}
                <th className="p-3 text-left text-[11px] font-black uppercase tracking-wider text-[var(--text3)] w-10 sticky left-0 bg-[var(--bg)] z-35">
                  #
                </th>
                
                {/* Sticky Model Nomi Ustun */}
                <th className="p-3 text-left text-[11px] font-black uppercase tracking-wider text-[var(--text3)] min-w-[190px] sticky left-10 bg-[var(--bg)] z-35 border-r border-[var(--border)]">
                  Model & Holat
                </th>

                <th className="p-3 text-left text-[11px] font-black uppercase tracking-wider text-[var(--text3)] w-20">
                  Mavsum
                </th>

                {/* Taqsimot Sparkline Ustuni */}
                <th className="p-3 text-center text-[11px] font-black uppercase tracking-wider text-[var(--text3)] w-24">
                  Balans
                </th>
                
                {/* 39-45 O'lchamlar Ustunlari */}
                {ALL_SIZES.map(sz => (
                  <th 
                    key={sz} 
                    className={cn(
                      "p-2.5 text-center text-[12px] font-black uppercase tracking-wider transition-colors",
                      targetSize === sz ? "text-purple-600 dark:text-purple-400 bg-purple-500/10" : "text-[var(--text)]"
                    )}
                    style={{ width: compareWarehouses ? '125px' : '72px' }}
                  >
                    <div className="flex flex-col items-center">
                      <span>{sz}</span>
                      {compareWarehouses && (
                        <span className="text-[9px] font-bold text-[var(--text3)] uppercase mt-0.5">
                          🏔 / 🏢
                        </span>
                      )}
                    </div>
                  </th>
                ))}

                {/* Jami Juft */}
                <th className="p-3 text-right text-[11px] font-black uppercase tracking-wider text-[var(--text3)] w-24">
                  Jami Juft
                </th>

                {/* Qutilar (Box Runs) Ustuni */}
                {(viewMode === 'compact' || viewMode === 'boxes') && (
                  <th className="p-3 text-center text-[11px] font-black uppercase tracking-wider text-[var(--text3)] min-w-[150px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1 text-[var(--text)]">
                        <Box size={12} className="text-purple-600" />
                        Quti / Ortiqcha
                      </span>
                      <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400">
                        ({activePreset.name.split(' ')[0]} {activePreset.name.split(' ')[1] || ''})
                      </span>
                    </div>
                  </th>
                )}

                {/* Batafsil Moliya Ustunlari */}
                {viewMode === 'detailed' && (
                  <>
                    <th className="p-3 text-right text-[11px] font-black uppercase tracking-wider text-[var(--text3)] min-w-[130px]">
                      Tannarx & Qiymati
                    </th>
                    <th className="p-3 text-right text-[11px] font-black uppercase tracking-wider text-[var(--text3)] min-w-[130px]">
                      Sotish & Qiymati
                    </th>
                    <th className="p-3 text-right text-[11px] font-black uppercase tracking-wider text-[var(--text3)] min-w-[110px]">
                      Taxminiy Foyda
                    </th>
                  </>
                )}

                {isAdmin && (
                  <th className="p-3 text-center text-[11px] font-black uppercase tracking-wider text-[var(--text3)] w-20">
                    Amal
                  </th>
                )}
              </tr>
            </thead>
            
            {/* Table Body */}
            <tbody className="divide-y divide-[var(--border)]">
              {filteredModels.length === 0 ? (
                <tr>
                  <td colSpan={20} className="text-center py-16 text-[var(--text3)]">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold text-[var(--text)]">Mos keluvchi model topilmadi</p>
                    <p className="text-xs text-[var(--text3)] mt-1">Filtrlarni tozalab ko'ring yoki boshqa so'z bilan qidiring</p>
                  </td>
                </tr>
              ) : (
                filteredModels.map((m, i) => {
                  const cat = getCat(m);
                  const total = compareWarehouses ? getCombinedTotal(m) : getModelTotal(m);
                  const box = getBoxStats(m);
                  const salePrice = prices[m]?.sale || 0;
                  const costPrice = prices[m]?.cost || 0;
                  const saleValue = total * salePrice;
                  const costValue = total * costPrice;
                  const profit = saleValue - costValue;
                  const brokenCount = getBrokenSizesCount(m);
                  const availableCount = getAvailableSizesCount(m);

                  // Model ichidagi o'lchamlar bo'yicha maksimal qoldiq (sparkline masshtabi uchun)
                  const modelMaxQty = Math.max(...ALL_SIZES.map(sz => {
                    return compareWarehouses 
                      ? (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0)
                      : (stock[m]?.[sz] || 0);
                  }), 1);

                  return (
                    <tr key={m} className="hover:bg-[var(--bg)]/70 transition-colors group">
                      
                      {/* Sticky Index */}
                      <td className="p-3 text-[11px] font-bold text-[var(--text3)] tabular-nums sticky left-0 bg-[var(--bg2)] group-hover:bg-[var(--bg)] z-10">
                        {i + 1}
                      </td>

                      {/* Sticky Model Nomi & Holat */}
                      <td className="p-3 sticky left-10 bg-[var(--bg2)] group-hover:bg-[var(--bg)] z-10 border-r border-[var(--border)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-[var(--text)] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors leading-tight">
                            {m}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            {total === 0 ? (
                              <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                                0 juft
                              </span>
                            ) : brokenCount > 0 ? (
                              <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
                                {brokenCount} uzilish
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-0.5">
                                <Check size={10} />
                                Komplekt
                              </span>
                            )}
                            <span className="text-[10px] text-[var(--text3)] font-bold">
                              ({availableCount}/7)
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Mavsum */}
                      <td className="p-3">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide border",
                          cat === 'qishki' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" 
                          : cat === 'yozgi' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" 
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}>
                          {cat === 'qishki' ? '❄️ Qish' : cat === 'yozgi' ? '☀️ Yoz' : '👟 Umumiy'}
                        </span>
                      </td>

                      {/* Mini Sparkline (7 ta o'lcham taqsimoti mini grafigi - Gistogramma) */}
                      <td className="p-2.5 text-center">
                        <div 
                          className="group/spark relative flex items-end justify-between gap-1 h-7 w-20 mx-auto px-1.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] shadow-2xs cursor-help" 
                          title="39-45 o'lchamlar taqsimoti grafigi (Gistogramma)"
                        >
                          {ALL_SIZES.map(sz => {
                            const szQty = compareWarehouses 
                              ? (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0)
                              : (stock[m]?.[sz] || 0);
                            const heightPercent = szQty > 0 ? Math.max(20, Math.min(100, Math.round((szQty / modelMaxQty) * 100))) : 0;
                            
                            return (
                              <div
                                key={sz}
                                className="flex-1 flex flex-col items-center justify-end h-full relative"
                              >
                                {szQty === 0 ? (
                                  <div 
                                    className="w-full h-[2.5px] rounded-full bg-rose-500/60" 
                                    title={`${sz}: 0 juft (uzilgan)`}
                                  />
                                ) : (
                                  <div
                                    style={{ height: `${heightPercent}%` }}
                                    className={cn(
                                      "w-full rounded-t-xs transition-all",
                                      szQty < 5 
                                        ? "bg-rose-500" 
                                        : szQty < 15 
                                        ? "bg-amber-500" 
                                        : "bg-purple-600 dark:bg-purple-400"
                                    )}
                                    title={`${sz}: ${szQty} juft`}
                                  />
                                )}
                              </div>
                            );
                          })}

                          {/* Hover Floating Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/spark:flex items-center gap-1.5 bg-slate-900/95 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-xl pointer-events-none z-40 whitespace-nowrap border border-slate-700">
                            <span className="text-purple-300 font-extrabold">39–45:</span>
                            {ALL_SIZES.map(sz => {
                              const szQty = compareWarehouses 
                                ? (tepaStock[m]?.[sz] || 0) + (kottaStock[m]?.[sz] || 0) 
                                : (stock[m]?.[sz] || 0);
                              return (
                                <span 
                                  key={sz} 
                                  className={cn(
                                    "px-1 py-0.2 rounded font-mono",
                                    szQty === 0 ? "bg-rose-500/30 text-rose-300 font-black" : "text-slate-200"
                                  )}
                                >
                                  {sz}:{szQty}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      {/* 39-45 O'lchamlar Katakchalari */}
                      {ALL_SIZES.map(sz => {
                        const qty = stock[m]?.[sz] || 0;
                        const tepaQty = tepaStock[m]?.[sz] || 0;
                        const kottaQty = kottaStock[m]?.[sz] || 0;
                        const isEditing = editingCell?.model === m && editingCell?.size === sz && !editingCell?.warehouse;

                        return (
                          <td 
                            key={sz} 
                            className={cn(
                              "p-1.5 text-center transition-colors relative",
                              targetSize === sz ? "bg-purple-500/5" : ""
                            )}
                          >
                            {compareWarehouses ? (
                              // Taqqoslash ko'rinishi: 2 qavatli ergonomik badge (Yuqori: Tepa, Pastki: Kotta, Fon: Jami ranglangan)
                              (() => {
                                const totalSzQty = tepaQty + kottaQty;
                                const isEditingTepa = editingCell?.model === m && editingCell?.size === sz && editingCell?.warehouse === 'tepa';
                                const isEditingKotta = editingCell?.model === m && editingCell?.size === sz && editingCell?.warehouse === 'kotta';

                                return (
                                  <div className={cn(
                                    "p-1.5 rounded-xl border flex flex-col gap-1 transition-all text-left shadow-2xs w-full max-w-[120px] mx-auto",
                                    totalSzQty === 0 
                                      ? "bg-zinc-500/10 border-dashed border-zinc-500/20 opacity-60" 
                                      : totalSzQty <= 3 
                                      ? "bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20" 
                                      : totalSzQty <= 9 
                                      ? "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300" 
                                      : "bg-emerald-600/15 border-emerald-600/40 text-emerald-800 dark:text-emerald-300"
                                  )}>
                                    {/* Yuqori qavat: 🏔 Tepa Ombor */}
                                    {isEditingTepa ? (
                                      <input
                                        autoFocus
                                        type="number"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') updateQuantity(m, sz, parseInt(editValue) || 0, 'tepa');
                                          if (e.key === 'Escape') setEditingCell(null);
                                        }}
                                        onBlur={() => updateQuantity(m, sz, parseInt(editValue) || 0, 'tepa')}
                                        className="w-full text-center py-0.5 bg-[var(--bg)] border-2 border-purple-500 rounded text-[10px] font-black text-[var(--text)] outline-none tabular-nums"
                                      />
                                    ) : (
                                      <div 
                                        onClick={() => {
                                          if (isAdmin) {
                                            setEditingCell({ model: m, size: sz, warehouse: 'tepa' });
                                            setEditValue(tepaQty.toString());
                                          }
                                        }}
                                        className={cn(
                                          "flex items-center justify-between px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                          tepaQty > 0 ? "bg-[var(--bg2)] text-[var(--text)]" : "text-[var(--text3)]",
                                          isAdmin && "cursor-pointer hover:ring-1 hover:ring-purple-500 hover:bg-purple-500/10"
                                        )}
                                        title={`Tepa ombor: ${tepaQty} juft (Tahrirlash uchun bosing)`}
                                      >
                                        <span className="flex items-center gap-1 text-[9px] text-[var(--text3)] font-semibold">
                                          <span>🏔</span> <span>Tepa:</span>
                                        </span>
                                        <span className={cn("font-black tabular-nums", tepaQty > 0 ? "text-[var(--text)]" : "text-[var(--text3)]")}>
                                          {tepaQty > 0 ? tepaQty : '0'}
                                        </span>
                                      </div>
                                    )}

                                    {/* Pastki qavat: 🏢 Kotta Ombor */}
                                    {isEditingKotta ? (
                                      <input
                                        autoFocus
                                        type="number"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') updateQuantity(m, sz, parseInt(editValue) || 0, 'kotta');
                                          if (e.key === 'Escape') setEditingCell(null);
                                        }}
                                        onBlur={() => updateQuantity(m, sz, parseInt(editValue) || 0, 'kotta')}
                                        className="w-full text-center py-0.5 bg-[var(--bg)] border-2 border-purple-500 rounded text-[10px] font-black text-[var(--text)] outline-none tabular-nums"
                                      />
                                    ) : (
                                      <div 
                                        onClick={() => {
                                          if (isAdmin) {
                                            setEditingCell({ model: m, size: sz, warehouse: 'kotta' });
                                            setEditValue(kottaQty.toString());
                                          }
                                        }}
                                        className={cn(
                                          "flex items-center justify-between px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                          kottaQty > 0 ? "bg-[var(--bg2)] text-[var(--text)]" : "text-[var(--text3)]",
                                          isAdmin && "cursor-pointer hover:ring-1 hover:ring-purple-500 hover:bg-purple-500/10"
                                        )}
                                        title={`Kotta ombor: ${kottaQty} juft (Tahrirlash uchun bosing)`}
                                      >
                                        <span className="flex items-center gap-1 text-[9px] text-[var(--text3)] font-semibold">
                                          <span>🏢</span> <span>Kotta:</span>
                                        </span>
                                        <span className={cn("font-black tabular-nums", kottaQty > 0 ? "text-[var(--text)]" : "text-[var(--text3)]")}>
                                          {kottaQty > 0 ? kottaQty : '0'}
                                        </span>
                                      </div>
                                    )}

                                    {/* Umumiy Yig'indi Badge */}
                                    <div className="flex items-center justify-between pt-0.5 border-t border-[var(--border)]/40 px-1 text-[9px] font-black">
                                      <span className="text-[var(--text3)] text-[8px] uppercase">Jami:</span>
                                      <span className={cn(
                                        "tabular-nums font-black",
                                        totalSzQty === 0 
                                          ? "text-[var(--text3)]" 
                                          : totalSzQty <= 3 
                                          ? "text-rose-600 dark:text-rose-400" 
                                          : totalSzQty <= 9 
                                          ? "text-amber-600 dark:text-amber-400" 
                                          : "text-emerald-600 dark:text-emerald-400"
                                      )}>
                                        {totalSzQty} jft
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : isEditing ? (
                              // Inline Edit Input (Admin)
                              <div className="flex items-center justify-center">
                                <input 
                                  autoFocus
                                  type="number"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') updateQuantity(m, sz, parseInt(editValue) || 0);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  onBlur={() => updateQuantity(m, sz, parseInt(editValue) || 0)}
                                  className="w-12 text-center py-1 bg-[var(--bg)] border-2 border-purple-500 rounded-lg text-xs font-black text-[var(--text)] outline-none tabular-nums shadow-xs"
                                />
                              </div>
                            ) : (
                              // Standart Micro-Badge Katakcha
                              <div className="group/cell relative flex items-center justify-center">
                                {/* Minus tugmasi (Admin hover paytida) */}
                                {isAdmin && (
                                  <button
                                    onClick={(e) => stepQuantity(e, m, sz, -1)}
                                    className="absolute -left-1 opacity-0 group-hover/cell:opacity-100 w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-black hover:scale-110 transition-all z-10 cursor-pointer shadow-xs"
                                    title="-1 juft"
                                  >
                                    <Minus size={8} />
                                  </button>
                                )}

                                {/* Katakcha Micro-Pill */}
                                <div 
                                  onClick={() => {
                                    if (isAdmin) {
                                      setEditingCell({ model: m, size: sz });
                                      setEditValue(qty.toString());
                                    }
                                  }}
                                  className={cn(
                                    "w-11 py-1 rounded-lg border text-xs text-center transition-all tabular-nums flex items-center justify-center",
                                    getCellPillStyle(qty),
                                    isAdmin ? "cursor-pointer hover:ring-2 hover:ring-purple-500/40 hover:scale-105" : ""
                                  )}
                                  title={isAdmin ? `Tahrirlash uchun bosing (${sz}-o'lcham)` : `${sz}-o'lcham: ${qty} juft`}
                                >
                                  {qty > 0 ? qty : '—'}
                                </div>

                                {/* Plus tugmasi (Admin hover paytida) */}
                                {isAdmin && (
                                  <button
                                    onClick={(e) => stepQuantity(e, m, sz, 1)}
                                    className="absolute -right-1 opacity-0 group-hover/cell:opacity-100 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black hover:scale-110 transition-all z-10 cursor-pointer shadow-xs"
                                    title="+1 juft"
                                  >
                                    <Plus size={8} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Jami Juft */}
                      <td className="p-3 text-right font-black tabular-nums text-sm text-purple-600 dark:text-purple-400">
                        {total.toLocaleString()}
                      </td>

                      {/* Qutilar (Box Runs) Ustuni - Interactive Badge */}
                      {(viewMode === 'compact' || viewMode === 'boxes') && (
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => setActiveBoxModalModel(m)}
                            className="inline-flex flex-col items-center p-1.5 rounded-xl hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all cursor-pointer group/box w-full max-w-[155px]"
                            title="Batafsil quti va o'lchamlar taqsimotini ko'rish uchun bosing"
                          >
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {box.fullBoxes > 0 ? (
                                <span className="text-xs font-black text-purple-700 dark:text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-lg shadow-2xs group-hover/box:scale-105 transition-transform">
                                  {box.fullBoxes} quti
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-[var(--text3)] bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-lg">
                                  0 quti
                                </span>
                              )}
                              
                              {box.loosePairs > 0 ? (
                                <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                                  +{box.loosePairs} dona
                                </span>
                              ) : box.fullBoxes > 0 ? (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded-md">
                                  To'liq
                                </span>
                              ) : null}
                            </div>

                            {/* Bottleneck yoki Progress mini-label */}
                            {box.bottleneckSize && box.bottleneckShortage && box.bottleneckShortage > 0 ? (
                              <span className="text-[9px] font-semibold text-[var(--text3)] group-hover/box:text-purple-600 flex items-center gap-0.5 mt-1">
                                <span>Keyingi qutiga:</span>
                                <span className="font-black text-rose-500">{box.bottleneckSize} ({box.bottleneckShortage} jft)</span>
                              </span>
                            ) : box.fullBoxes > 0 ? (
                              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 mt-0.5">
                                <CheckCircle2 size={10} />
                                {box.boxedRatioPercent}% seriya
                              </span>
                            ) : null}
                          </button>
                        </td>
                      )}

                      {/* Batafsil Moliya Ustunlari */}
                      {viewMode === 'detailed' && (
                        <>
                          {/* Tannarx & Qiymat */}
                          <td className="p-3 text-right font-bold tabular-nums text-xs text-[var(--text)]">
                            {costValue > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-black text-amber-600 dark:text-amber-400">{formatCompact(costValue)}</span>
                                <span className="text-[9px] text-[var(--text3)] font-semibold">@{formatCompact(costPrice)}</span>
                              </div>
                            ) : (
                              <span className="text-[var(--text3)] font-normal">—</span>
                            )}
                          </td>

                          {/* Sotish Narxi & Sotuv Qiymati */}
                          <td className="p-3 text-right font-bold tabular-nums text-xs text-[var(--text)]">
                            {saleValue > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-black text-emerald-600 dark:text-emerald-400">{formatCompact(saleValue)}</span>
                                <span className="text-[9px] text-[var(--text3)] font-semibold">@{formatCompact(salePrice)}</span>
                              </div>
                            ) : (
                              <span className="text-[var(--text3)] font-normal">—</span>
                            )}
                          </td>

                          {/* Taxminiy Foyda */}
                          <td className="p-3 text-right font-bold tabular-nums text-xs">
                            {profit > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="font-black text-emerald-600 dark:text-emerald-400">+{formatCompact(profit)}</span>
                                <span className="text-[9px] text-emerald-500 font-semibold">
                                  {saleValue > 0 ? `${((profit / saleValue) * 100).toFixed(0)}% marja` : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[var(--text3)] font-normal">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* Admin Amal */}
                      {isAdmin && (
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedBatchModel(m);
                              setBoxModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-black bg-purple-500/10 text-purple-600 hover:bg-purple-600 hover:text-white border border-purple-500/20 transition-all cursor-pointer inline-flex items-center gap-1"
                            title="Ushbu modelga quti to'ldirish"
                          >
                            <Box size={11} />
                            <span>+Quti</span>
                          </button>
                        </td>
                      )}

                    </tr>
                  );
                })
              )}
            </tbody>

            {/* JAMI FOOTER (Jadval oxirida tabiiy davom etuvchi yig'indi qatori) */}
            <tfoot className="bg-[var(--bg2)] font-black text-sm border-t-2 border-purple-500/30">
              <tr>
                {/* Sticky Index */}
                <td className="p-3 text-[11px] font-black text-purple-600 dark:text-purple-400 sticky left-0 bg-[var(--bg2)] z-35 text-center">
                  Σ
                </td>

                {/* Sticky Model & Holat Sarlavhasi */}
                <td className="p-3 sticky left-10 bg-[var(--bg2)] z-35 border-r border-[var(--border)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      JAMI ({filteredModels.length} ta model)
                    </span>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.2 rounded-md">
                        ⚠️ Defitsit: {deficitSize}-o'lcham ({sizeStats[deficitSize]?.toLocaleString()} jft)
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded-md">
                        🔥 Top: {topSize} ({sizeStats[topSize]?.toLocaleString()} jft)
                      </span>
                    </div>
                  </div>
                </td>

                {/* Mavsum */}
                <td className="p-3 text-center text-[10px] text-[var(--text3)] font-bold">
                  Barchasi
                </td>

                {/* Umumiy Ombor Sparkline Gistogrammasi */}
                <td className="p-2 text-center">
                  <div className="flex items-end justify-between gap-1 h-7 w-20 mx-auto px-1.5 py-1 rounded-lg bg-[var(--bg)] border border-purple-500/30 shadow-2xs" title="Butun ombor bo'yicha 39-45 o'lchamlar balansi">
                    {ALL_SIZES.map(sz => {
                      const szQty = sizeStats[sz] || 0;
                      const heightPercent = szQty > 0 ? Math.max(20, Math.min(100, Math.round((szQty / maxTotalSizeQty) * 100))) : 0;
                      return (
                        <div key={sz} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={cn(
                              "w-full rounded-t-xs transition-all",
                              sz === deficitSize ? "bg-rose-500" : sz === topSize ? "bg-emerald-500" : "bg-purple-600 dark:bg-purple-400"
                            )}
                            title={`${sz}: ${szQty} juft (${grandTotal > 0 ? ((szQty / grandTotal) * 100).toFixed(1) : 0}%)`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </td>

                {/* 39-45 Vertikal Yig'indilar */}
                {ALL_SIZES.map(sz => {
                  const szTotal = sizeStats[sz] || 0;
                  const tQty = tepaSizeStats[sz] || 0;
                  const kQty = kottaSizeStats[sz] || 0;
                  const percent = grandTotal > 0 ? ((szTotal / grandTotal) * 100).toFixed(1) : '0';
                  const isDeficit = sz === deficitSize;
                  const isTop = sz === topSize;

                  return (
                    <td key={sz} className="p-2 text-center align-middle">
                      {compareWarehouses ? (
                        <div className="p-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col gap-0.5 w-full max-w-[120px] mx-auto text-left shadow-2xs">
                          <div className="flex items-center justify-between text-[10px] font-bold px-1 text-[var(--text)]">
                            <span className="text-[9px] text-[var(--text3)]">🏔 Tepa:</span>
                            <span className="font-black tabular-nums">{tQty.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-bold px-1 text-[var(--text)]">
                            <span className="text-[9px] text-[var(--text3)]">🏢 Kotta:</span>
                            <span className="font-black tabular-nums">{kQty.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between pt-0.5 border-t border-[var(--border)] px-1 text-[10px] font-black">
                            <span className="text-[9px] text-purple-600 dark:text-purple-400">Σ Jami:</span>
                            <span className="tabular-nums font-black text-purple-600 dark:text-purple-400">
                              {szTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg border text-xs font-black tabular-nums",
                            isDeficit 
                              ? "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300"
                              : isTop
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)]"
                          )}>
                            {szTotal.toLocaleString()}
                          </span>
                          <span className="text-[9px] font-bold text-[var(--text3)] mt-0.5">
                            {percent}%
                          </span>
                          {isDeficit && (
                            <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter mt-0.5">
                              ⚠️ Defitsit
                            </span>
                          )}
                          {isTop && (
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter mt-0.5">
                              🔥 Eng ko'p
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Jami Juft */}
                <td className="p-3 text-right tabular-nums text-sm font-black text-purple-600 dark:text-purple-400">
                  <div className="flex flex-col items-end">
                    <span>{grandTotal.toLocaleString()}</span>
                    {compareWarehouses && (
                      <span className="text-[9px] font-bold text-[var(--text3)] mt-0.5">
                        🏔 {grandTepaTotal.toLocaleString()} / 🏢 {grandKottaTotal.toLocaleString()}
                      </span>
                    )}
                  </div>
                </td>

                {/* Qutilar (Box Runs) Jami */}
                {(viewMode === 'compact' || viewMode === 'boxes') && (
                  <td className="p-3 text-center text-xs font-black text-purple-600 dark:text-purple-400">
                    <div className="flex flex-col items-center">
                      <span className="bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-lg text-purple-700 dark:text-purple-300 font-black">
                        {grandBoxes.toLocaleString()} quti
                      </span>
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                        +{grandLoosePairs.toLocaleString()} dona
                      </span>
                    </div>
                  </td>
                )}

                {/* Moliya Jami */}
                {viewMode === 'detailed' && (
                  <>
                    <td className="p-3.5 text-right tabular-nums text-xs font-black text-amber-600 dark:text-amber-400">
                      {formatCompact(totalValuation.totalCost)}
                    </td>
                    <td className="p-3.5 text-right tabular-nums text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {formatCompact(totalValuation.totalSale)}
                    </td>
                    <td className="p-3.5 text-right tabular-nums text-xs font-black text-emerald-600 dark:text-emerald-400">
                      +{formatCompact(totalValuation.totalSale - totalValuation.totalCost)}
                    </td>
                  </>
                )}

                {isAdmin && <td className="p-3.5"></td>}
              </tr>
            </tfoot>

          </table>
        </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* 6. PARTIYAVIY TO'LDIRISH MODALI (BATCH / BOX ENTRY MODAL) */}
      {/* ========================================================================= */}
      {boxModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBoxModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative my-auto"
            onClick={e => e.stopPropagation()}
          >
            
            {/* Modal Sarlavhasi */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                  <Box size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--text)]">
                    Partiyaviy / Quti To'ldirish (Batch Entry)
                  </h3>
                  <p className="text-xs font-semibold text-[var(--text3)]">
                    Standart qutilar yoki maxsus partiya bo'yicha tezkor kirim/chiqim
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setBoxModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleBatchSubmit} className="flex flex-col gap-4 mt-4">
              
              {/* Amal turi va Ombor tanlash */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1 block">
                    Amal Turi
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => setBatchActionType('kirim')}
                      className={cn(
                        "py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                        batchActionType === 'kirim' ? "bg-emerald-600 text-white shadow-xs" : "text-[var(--text3)]"
                      )}
                    >
                      + Kirim (Qabul)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchActionType('chiqim')}
                      className={cn(
                        "py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                        batchActionType === 'chiqim' ? "bg-rose-600 text-white shadow-xs" : "text-[var(--text3)]"
                      )}
                    >
                      - Chiqim (Jo'natish)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1 block">
                    Qaysi Omborga?
                  </label>
                  <select
                    value={batchWarehouse}
                    onChange={e => setBatchWarehouse(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="tepa">🏔 Tepa Ombor</option>
                    <option value="kotta">🏢 Kotta Ombor</option>
                  </select>
                </div>
              </div>

              {/* Modelni Tanlash */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1 block">
                  Model Nomi
                </label>
                <select
                  value={selectedBatchModel}
                  onChange={e => setSelectedBatchModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  {allModels.map(m => (
                    <option key={m} value={m}>
                      {m} ({getCat(m) === 'qishki' ? '❄️ Qishki' : getCat(m) === 'yozgi' ? '☀️ Yozgi' : '👟 Umumiy'}) — Hozir: {getModelTotal(m, db[batchWarehouse]?.stock)} juft
                    </option>
                  ))}
                </select>
              </div>

              {/* Tayyor Quti Shablonlari (Box Presets) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1.5 flex items-center justify-between">
                  <span>Tayyor Shablonlar (Presets)</span>
                  <span className="text-[10px] text-purple-600 font-bold">1 ta bosishda o'lchamlarni to'ldirish</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BOX_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="p-2 bg-[var(--bg)] border border-[var(--border)] hover:border-purple-500/50 hover:bg-purple-500/5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <span className="text-xs font-black text-[var(--text)]">{p.name}</span>
                      <span className="text-[10px] font-bold text-purple-600 mt-1">{p.total} juft / quti</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 1 ta Qutidagi O'lchamlar Taqsimoti (39-45) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1.5 block">
                  1 ta Qutidagi Razmerlar Tarkibi (Juft)
                </label>
                <div className="grid grid-cols-7 gap-1.5 bg-[var(--bg)] p-2.5 rounded-2xl border border-[var(--border)]">
                  {ALL_SIZES.map(sz => (
                    <div key={sz} className="flex flex-col items-center">
                      <span className="text-[11px] font-black text-[var(--text3)] mb-1">{sz}</span>
                      <input
                        type="number"
                        min="0"
                        value={batchSizes[sz] || 0}
                        onChange={e => {
                          const v = Math.max(0, parseInt(e.target.value) || 0);
                          setBatchSizes(prev => ({ ...prev, [sz]: v }));
                        }}
                        className="w-full text-center py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text3)] mt-1 px-1">
                  <span>1 quti sig'imi:</span>
                  <span className="text-purple-600 font-black">
                    {Object.values(batchSizes).reduce((a, b) => a + (Number(b) || 0), 0)} juft
                  </span>
                </div>
              </div>

              {/* Qutilar Soni & Izoh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1 block">
                    Qutilar (Partiyalar) Soni
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={batchBoxCount}
                      onChange={e => setBatchBoxCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                    />
                    <span className="text-xs font-bold text-[var(--text3)] uppercase">quti</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] mb-1 block">
                    Izoh (Ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    value={batchComment}
                    onChange={e => setBatchComment(e.target.value)}
                    placeholder="Masalan: 12-partiya qabul"
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Jami Xulosa Banneri */}
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                    Jami Kirim / Chiqim Qilinadigan:
                  </span>
                  <span className="text-lg font-black text-[var(--text)] tabular-nums">
                    {(Object.values(batchSizes).reduce((a, b) => a + (Number(b) || 0), 0) * batchBoxCount).toLocaleString()} juft
                  </span>
                </div>
                <div className="text-right text-xs font-bold text-[var(--text3)]">
                  <span>{batchBoxCount} quti × {Object.values(batchSizes).reduce((a, b) => a + (Number(b) || 0), 0)} juft</span>
                </div>
              </div>

              {/* Modal Tugmalari */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setBoxModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className={cn(
                    "px-5 py-2 rounded-xl text-xs font-black text-white transition-all cursor-pointer shadow-xs",
                    batchActionType === 'kirim' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                  )}
                >
                  {batchActionType === 'kirim' ? "Qabul Qilishni Tasdiqlash" : "Chiqim Qilishni Tasdiqlash"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. CHOP ETISH MODALI (A4 JADVAL VS 80MM CHEK / NAKLADNOY) */}
      {/* ========================================================================= */}
      {printModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative my-auto"
            onClick={e => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--text)]">
                    O'lchamlar Matritsasini Chop Etish
                  </h3>
                  <p className="text-xs font-semibold text-[var(--text3)]">
                    A4 to'liq hisobot yoki 80mm chek/nakladnoy lentasi
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPrintModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Format Tanlash */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                type="button"
                onClick={() => setPrintMode('a4')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3",
                  printMode === 'a4' 
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs font-black" 
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] font-bold"
                )}
              >
                <FileSpreadsheet size={20} className={printMode === 'a4' ? "text-white" : "text-purple-600"} />
                <div>
                  <div className="text-xs">A4 To'liq Jadval</div>
                  <div className={cn("text-[10px]", printMode === 'a4' ? "text-white/80" : "text-[var(--text3)]")}>Usta & Ombor hisoboti uchun</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrintMode('receipt')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3",
                  printMode === 'receipt' 
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs font-black" 
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] font-bold"
                )}
              >
                <Receipt size={20} className={printMode === 'receipt' ? "text-white" : "text-purple-600"} />
                <div>
                  <div className="text-xs">80mm Termal Chek</div>
                  <div className={cn("text-[10px]", printMode === 'receipt' ? "text-white/80" : "text-[var(--text3)]")}>Omborchi & Partiya nakladnoyi</div>
                </div>
              </button>
            </div>

            {/* Print Preview Area */}
            <div className="mt-4 p-4 bg-white text-black rounded-2xl border border-slate-300 max-h-80 overflow-y-auto font-mono text-xs shadow-inner">
              {printMode === 'a4' ? (
                <div>
                  <div className="text-center font-bold border-b border-black pb-2 mb-2">
                    <div className="text-sm">FALAK SHOE — O'LCHAMLAR MATRITSASI</div>
                    <div className="text-[10px] text-slate-600 font-normal">
                      Ombor: {currentOmbor === 'tepa' ? 'Tepa Ombor' : 'Kotta Ombor'} | Sana: {getTodayStr()} {getNowStr().slice(11, 16)}
                    </div>
                  </div>
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-400 font-bold">
                        <th className="text-left py-1">Model</th>
                        {ALL_SIZES.map(s => <th key={s} className="text-center py-1">{s}</th>)}
                        <th className="text-right py-1">Jami</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.slice(0, 15).map(m => (
                        <tr key={m} className="border-b border-slate-200">
                          <td className="py-1 font-bold">{m}</td>
                          {ALL_SIZES.map(s => <td key={s} className="text-center py-1">{(stock[m]?.[s] || 0) || '—'}</td>)}
                          <td className="text-right py-1 font-bold">{getModelTotal(m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredModels.length > 15 && (
                    <div className="text-center text-[9px] text-slate-500 mt-2">
                      ... va yana {filteredModels.length - 15} ta model (Chop etishda to'liq chiqadi)
                    </div>
                  )}
                  <div className="border-t-2 border-black mt-3 pt-1 flex justify-between font-bold text-xs">
                    <span>JAMI QOLDIQ:</span>
                    <span>{grandTotal.toLocaleString()} juft</span>
                  </div>
                </div>
              ) : (
                <div className="max-w-[280px] mx-auto text-center">
                  <div className="font-bold text-xs">*** FALAK SHOE ***</div>
                  <div className="text-[10px]">O'LCHAMLAR RO'YXATI</div>
                  <div className="text-[9px] border-b border-dashed border-black pb-1 mb-1">
                    {getTodayStr()} | {currentOmbor === 'tepa' ? 'TEPA' : 'KOTTA'}
                  </div>
                  {filteredModels.slice(0, 10).map(m => (
                    <div key={m} className="text-left border-b border-dotted border-slate-300 py-1 text-[10px]">
                      <div className="font-bold flex justify-between">
                        <span>{m}</span>
                        <span>{getModelTotal(m)} jft</span>
                      </div>
                      <div className="text-[9px] text-slate-700">
                        {ALL_SIZES.map(s => `${s}:${stock[m]?.[s] || 0}`).join(' ')}
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-dashed border-black pt-1 mt-2 font-bold flex justify-between">
                    <span>JAMI:</span>
                    <span>{grandTotal} juft</span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--border)] mt-4">
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
              >
                Yopish
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintModalOpen(false);
                  executePrint();
                }}
                className="px-5 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-700 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Printer size={14} />
                <span>Pechatga Chiqarish</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 8. QUTI / SERIYA TAHLILI MODALI */}
      {activeBoxModalModel && (() => {
        const modalStock = compareWarehouses
          ? ALL_SIZES.reduce((acc, sz) => {
              acc[sz] = (tepaStock[activeBoxModalModel]?.[sz] || 0) + (kottaStock[activeBoxModalModel]?.[sz] || 0);
              return acc;
            }, {} as Record<string, number>)
          : (stock[activeBoxModalModel] || {});
        const modalBoxStats = getBoxStats(activeBoxModalModel);
        const modalCat = getCat(activeBoxModalModel);

        return (
          <BoxBreakdownModal
            modelName={activeBoxModalModel}
            category={modalCat === 'qishki' ? 'Qishki poyabzal' : modalCat === 'yozgi' ? 'Yozgi poyabzal' : 'Mavsumiy poyabzal'}
            activePreset={activePreset}
            boxStats={modalBoxStats}
            stock={modalStock}
            onClose={() => setActiveBoxModalModel(null)}
            onOpenBatchEntry={() => {
              setSelectedBatchModel(activeBoxModalModel);
              setBoxModalOpen(true);
              setActiveBoxModalModel(null);
            }}
          />
        );
      })()}

    </div>
  );
}
