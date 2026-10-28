import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { WarehouseName } from '../types';
import { 
  ArrowUpCircle, 
  RotateCw, 
  Package, 
  GitCompareArrows, 
  RefreshCw, 
  Menu, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Building, 
  Factory, 
  CheckCircle2, 
  Boxes,
  Sparkles,
  Search,
  Zap,
  Camera,
  X,
  Copy,
  Check,
  ChevronRight,
  ArrowRight,
  Share2,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { cn, formatUzs, getTodayStr, ALL_SIZES } from '../lib/utils';
import { BarcodeScannerModal, ScanResult } from '../components/BarcodeScannerModal';
import { toast } from 'sonner';

type Tab = 'asosiy' | 'ombor' | 'olcham' | 'kirim' | 'chiqim' | 'otkazma' | 'tarix' | 'dashboard' | 'sozlamalar' | 'narxlar' | 'inventarizatsiya' | 'audit' | 'profil' | 'kassa' | 'vozvrat-brak' | 'mijozlar' | 'shtrix-kod';

interface AsosiyPageProps {
  onNavigate?: (tab: Tab) => void;
  onOpenSidebar?: () => void;
}

export default function AsosiyPage({ onNavigate, onOpenSidebar }: AsosiyPageProps) {
  const { db, currentOmbor, setCurrentOmbor, currentUser } = useDb();
  const [filterPeriod, setFilterPeriod] = useState<'bugun' | 'hafta' | 'oy'>('bugun');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tezkor Qidiruv States
  const [searchQuery, setSearchQuery] = useState('');
  const [isQuickSearchModalOpen, setIsQuickSearchModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedStockWarehouse, setSelectedStockWarehouse] = useState<'all' | 'tepa' | 'kotta' | 'sort2'>('all');
  const [copiedModel, setCopiedModel] = useState<string | null>(null);
  const [activeExpandedModel, setActiveExpandedModel] = useState<string | null>(null);
  const [searchSwipeY, setSearchSwipeY] = useState(0);
  const searchTouchStartY = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target as Node)) {
        setIsWarehouseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchTouchStart = (e: React.TouchEvent) => {
    searchTouchStartY.current = e.touches[0].clientY;
  };

  const handleSearchTouchMove = (e: React.TouchEvent) => {
    if (searchTouchStartY.current === null) return;
    const diff = e.touches[0].clientY - searchTouchStartY.current;
    if (diff > 0) setSearchSwipeY(diff);
  };

  const handleSearchTouchEnd = () => {
    if (searchSwipeY > 75) {
      setIsQuickSearchModalOpen(false);
    }
    setSearchSwipeY(0);
    searchTouchStartY.current = null;
  };

  // Navigate helper
  const handleNav = (tab: Tab) => {
    if (onNavigate) {
      onNavigate(tab);
    } else {
      window.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
    }
  };

  // Open sidebar trigger
  const handleMenuClick = () => {
    if (onOpenSidebar) {
      onOpenSidebar();
    } else {
      window.dispatchEvent(new CustomEvent('open-sidebar'));
    }
  };

  // Dynamic Greeting based on current local hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Xayrli tong';
    if (hour >= 12 && hour < 18) return 'Xayrli kun';
    return 'Xayrli oqshom';
  }, []);

  // Format today's date in Uzbek / English style as in the photo
  const formattedDate = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    const weekdays = [
      'Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'
    ];
    return `${day} ${months[now.getMonth()]}, ${now.getFullYear()} · ${weekdays[now.getDay()]}`;
  }, []);

  // Calculate today vs yesterday sales and transaction counts
  const stats = useMemo(() => {
    const todayStr = getTodayStr(); // YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split('T')[0];

    const currentWarehouseData = db[currentOmbor] || { transactions: [], stock: {} };
    const allWarehouseTxs = [
      ...(db.tepa?.transactions || []),
      ...(db.kotta?.transactions || []),
      ...(db.sort2?.transactions || [])
    ];

    // Filter by period
    const isMatchingPeriod = (dateStr: string) => {
      if (filterPeriod === 'bugun') return dateStr === todayStr;
      if (filterPeriod === 'hafta') {
        const txDate = new Date(dateStr);
        const diffDays = Math.floor((now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }
      if (filterPeriod === 'oy') {
        return dateStr.startsWith(todayStr.slice(0, 7));
      }
      return dateStr === todayStr;
    };
    const now = new Date();

    // Today's chiqim / sales transactions
    const periodSalesTxs = allWarehouseTxs.filter(
      tx => tx.amal === 'chiqim' && isMatchingPeriod(tx.sana)
    );

    // Sum in UZS
    const totalSalesSum = periodSalesTxs.reduce((acc, tx) => acc + (Number(tx.summa) || 0), 0);
    const totalSalesPairs = periodSalesTxs.reduce((acc, tx) => acc + (Number(tx.soni) || 0), 0);

    // Grouping by receipt / chek count
    const uniqueReceipts = new Set(
      periodSalesTxs.map(t => t.groupId || `${t.sana}_${t.vaqt}_${t.kimdan || ''}`)
    );
    const receiptCount = uniqueReceipts.size || (periodSalesTxs.length > 0 ? periodSalesTxs.length : 0);

    // Yesterday's sales for comparison
    const yesterdaySalesTxs = allWarehouseTxs.filter(
      tx => tx.amal === 'chiqim' && tx.sana === yesterdayStr
    );
    const yesterdaySum = yesterdaySalesTxs.reduce((acc, tx) => acc + (Number(tx.summa) || 0), 0);

    let percentVsYesterday = 0;
    if (yesterdaySum > 0) {
      percentVsYesterday = Math.round(((totalSalesSum - yesterdaySum) / yesterdaySum) * 100);
    } else if (totalSalesSum > 0) {
      percentVsYesterday = 100;
    }

    // Today's kirim
    const periodKirimTxs = allWarehouseTxs.filter(
      tx => tx.amal === 'kirim' && isMatchingPeriod(tx.sana)
    );
    const totalKirimPairs = periodKirimTxs.reduce((acc, tx) => acc + (Number(tx.soni) || 0), 0);

    // Period transfers (O'tkazmalar)
    const periodOtkazmalar = (db.otkazmalar || []).filter(o => isMatchingPeriod(o.sana));
    const totalOtkazmaPairs = periodOtkazmalar.reduce((acc, o) => acc + (Number(o.soni) || 0), 0);

    // Current warehouse total stock
    const stockMap = currentWarehouseData.stock || {};
    let totalStockPairs = 0;
    let modelCount = 0;
    Object.keys(stockMap).forEach(model => {
      const sizes = stockMap[model] || {};
      let modelTotal = 0;
      Object.values(sizes).forEach(cnt => {
        modelTotal += Number(cnt) || 0;
      });
      if (modelTotal > 0) {
        totalStockPairs += modelTotal;
        modelCount += 1;
      }
    });

    return {
      totalSalesSum,
      totalSalesPairs,
      receiptCount,
      percentVsYesterday,
      totalKirimPairs,
      totalOtkazmaPairs,
      totalStockPairs,
      modelCount
    };
  }, [db, currentOmbor, filterPeriod]);

  // Handle refresh click
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Ma'lumotlar muvaffaqiyatli yangilandi");
    }, 600);
  };

  // Focus search input when modal opens
  useEffect(() => {
    if (isQuickSearchModalOpen) {
      const timer = setTimeout(() => {
        modalInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isQuickSearchModalOpen]);

  // Global hotkeys (Ctrl+K or /) to open Tezkor Qidiruv
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        setIsQuickSearchModalOpen(true);
      } else if (e.key === 'Escape' && isQuickSearchModalOpen) {
        setIsQuickSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuickSearchModalOpen]);

  // Comprehensive stock data per model across all warehouses
  const modelStockData = useMemo(() => {
    const tepaStock = db.tepa?.stock || {};
    const kottaStock = db.kotta?.stock || {};
    const sort2Stock = db.sort2?.stock || {};
    const prices = db.prices || {};

    const allModelNames = Array.from(new Set([
      ...Object.keys(tepaStock),
      ...Object.keys(kottaStock),
      ...Object.keys(sort2Stock),
      ...Object.keys(prices)
    ])).filter(Boolean);

    return allModelNames.map(model => {
      const tepaSizes = tepaStock[model] || {};
      const kottaSizes = kottaStock[model] || {};
      const sort2Sizes = sort2Stock[model] || {};

      let tepaTotal = 0;
      Object.values(tepaSizes).forEach(v => { tepaTotal += Number(v) || 0; });

      let kottaTotal = 0;
      Object.values(kottaSizes).forEach(v => { kottaTotal += Number(v) || 0; });

      let sort2Total = 0;
      Object.values(sort2Sizes).forEach(v => { sort2Total += Number(v) || 0; });

      const totalPairs = tepaTotal + kottaTotal + sort2Total;
      const price = prices[model]?.sale || 0;
      const cost = prices[model]?.cost || 0;

      // Collect all sizes
      const allSizesSet = new Set([
        ...ALL_SIZES,
        ...Object.keys(tepaSizes),
        ...Object.keys(kottaSizes),
        ...Object.keys(sort2Sizes)
      ]);

      const combinedSizes: Record<string, { all: number; tepa: number; kotta: number; sort2: number }> = {};
      Array.from(allSizesSet)
        .sort((a, b) => {
          const numA = Number(a);
          const numB = Number(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        })
        .forEach(sz => {
          const t = Number(tepaSizes[sz]) || 0;
          const k = Number(kottaSizes[sz]) || 0;
          const s = Number(sort2Sizes[sz]) || 0;
          combinedSizes[sz] = {
            all: t + k + s,
            tepa: t,
            kotta: k,
            sort2: s
          };
        });

      return {
        model,
        tepaTotal,
        kottaTotal,
        sort2Total,
        totalPairs,
        price,
        cost,
        sizes: combinedSizes
      };
    });
  }, [db]);

  // Top models by available stock for instant one-touch suggestion chips
  const popularModels = useMemo(() => {
    return [...modelStockData]
      .filter(m => m.totalPairs > 0)
      .sort((a, b) => b.totalPairs - a.totalPairs)
      .slice(0, 10);
  }, [modelStockData]);

  // Search results for active query
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return modelStockData
      .filter(m => m.model.toLowerCase().includes(q))
      .sort((a, b) => {
        const aExact = a.model.toLowerCase() === q;
        const bExact = b.model.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = a.model.toLowerCase().startsWith(q);
        const bStarts = b.model.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return b.totalPairs - a.totalPairs;
      })
      .slice(0, 25);
  }, [modelStockData, searchQuery]);

  // Copy stock details to clipboard for sending to clients or Telegram
  const handleCopyStockInfo = (item: typeof modelStockData[0]) => {
    const sizeLines = Object.entries(item.sizes)
      .filter(([_, cnt]) => cnt.all > 0)
      .map(([sz, cnt]) => `• ${sz}-razmer: ${cnt.all} juft (TEPA: ${cnt.tepa}, KOTTA: ${cnt.kotta}${cnt.sort2 > 0 ? `, 2-SORT: ${cnt.sort2}` : ''})`)
      .join('\n');

    const text = `📦 Model: ${item.model}\n🔢 Jami qoldiq: ${item.totalPairs} juft\n🏢 TEPA ombor: ${item.tepaTotal} juft\n🏬 KOTTA ombor: ${item.kottaTotal} juft${item.sort2Total > 0 ? `\n📦 2-SORT: ${item.sort2Total} juft` : ''}${item.price > 0 ? `\n💰 Narxi: ${formatUzs(item.price)}` : ''}\n👟 Razmerlar:\n${sizeLines || 'Qoldiq mavjud emas'}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedModel(item.model);
      toast.success(`${item.model} qoldiq ma'lumotlari nusxalandi!`);
      setTimeout(() => setCopiedModel(null), 2500);
    }).catch(() => {
      toast.info("Nusxalashda xatolik yuz berdi");
    });
  };

  // Barcode / QR scan handler
  const handleScanResult = (result: ScanResult) => {
    if (result.model) {
      setSearchQuery(result.model);
      setIsScannerOpen(false);
      setIsQuickSearchModalOpen(true);
      toast.success(`"${result.model}" skanerlandi!`);
    }
  };

  return (
    <div className="w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto pb-16 font-sans select-none animate-in fade-in duration-300 space-y-6">
      
      {/* 1. TOP HERO SECTION: Responsive layout (Single column on mobile, 2-column or wide banner on desktop/tablet) */}
      <div className="bg-gradient-to-b md:bg-gradient-to-r from-[#006bf8] via-[#0066f5] to-[#0052cc] text-white rounded-3xl p-5 sm:p-7 md:p-8 shadow-xl relative overflow-hidden">
        
        {/* Subtle background glow circles */}
        <div className="absolute -top-12 -right-12 w-48 sm:w-64 h-48 sm:h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-12 w-48 sm:w-64 h-48 sm:h-64 bg-blue-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 items-center relative z-10">
          
          {/* Left Column (Desktop) / Top Section (Mobile): Greeting, Warehouse switcher & Badge */}
          <div className="md:col-span-7 flex flex-col justify-between h-full space-y-4 sm:space-y-5">
            {/* Top Header Row: Menu, Greeting, Date */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Hamburger Button (Mobile & Tablet) */}
                <button
                  type="button"
                  onClick={handleMenuClick}
                  className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#0066f5] shadow-md hover:bg-white/90 active:scale-95 transition-transform cursor-pointer shrink-0"
                  title="Menyuni ochish"
                >
                  <Menu size={20} strokeWidth={2.5} />
                </button>

                {/* Greeting & Date */}
                <div>
                  <h1 className="text-base sm:text-xl lg:text-2xl font-black tracking-tight text-white leading-tight">
                    {greeting}{currentUser?.ism ? `, ${currentUser.ism}` : ''}
                  </h1>
                  <p className="text-[11px] sm:text-xs text-white/80 font-medium">
                    {formattedDate}
                  </p>
                </div>
              </div>
            </div>

            {/* Warehouse Catalog Dropdown Selector */}
            <div ref={warehouseDropdownRef} className="relative w-full">
              <button
                type="button"
                onClick={() => setIsWarehouseDropdownOpen(prev => !prev)}
                className="w-full flex items-center justify-between bg-black/20 hover:bg-black/25 p-3 rounded-2xl border border-white/15 backdrop-blur-md transition-all cursor-pointer shadow-sm text-white"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                    <Package size={15} />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] uppercase font-bold text-white/70 tracking-wider leading-none">Faol ombor</span>
                    <span className="text-xs sm:text-sm font-extrabold text-white mt-0.5">
                      {currentOmbor === 'tepa' ? 'TEPA Ombori (Asosiy)' : currentOmbor === 'kotta' ? 'KOTTA Ombori (Katta)' : '2-SORT Ombori'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-white/80">
                  <span className="text-[11px] font-bold bg-white/20 px-2 py-0.5 rounded-lg">Katalog</span>
                  <ChevronDown size={16} className={cn("transition-transform duration-200", isWarehouseDropdownOpen && "rotate-180")} />
                </div>
              </button>

              {/* Dropdown Catalog Menu */}
              {isWarehouseDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text3)] border-b border-[var(--border)]">
                    Omborni tanlang
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOmbor('tepa');
                      setIsWarehouseDropdownOpen(false);
                      toast.info("TEPA ombori tanlandi");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      currentOmbor === 'tepa'
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold border border-emerald-500/30"
                        : "hover:bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Factory size={15} className="text-emerald-500" />
                      <span>TEPA Ombori (Asosiy)</span>
                    </div>
                    {currentOmbor === 'tepa' && <Check size={14} className="text-emerald-500" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOmbor('kotta');
                      setIsWarehouseDropdownOpen(false);
                      toast.info("KOTTA ombori tanlandi");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      currentOmbor === 'kotta'
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-extrabold border border-blue-500/30"
                        : "hover:bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Building size={15} className="text-blue-500" />
                      <span>KOTTA Ombori (Katta)</span>
                    </div>
                    {currentOmbor === 'kotta' && <Check size={14} className="text-blue-500" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentOmbor('sort2');
                      setIsWarehouseDropdownOpen(false);
                      toast.info("2-SORT ombori tanlandi");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                      currentOmbor === 'sort2'
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold border border-amber-500/30"
                        : "hover:bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Boxes size={15} className="text-amber-500" />
                      <span>2-SORT Ombori (Nuqsonli)</span>
                    </div>
                    {currentOmbor === 'sort2' && <Check size={14} className="text-amber-500" />}
                  </button>
                </div>
              )}
            </div>

            {/* Warehouse quick stats pill for desktop/tablet */}
            <div className="hidden sm:flex items-center gap-4 text-xs text-white/90 pt-1">
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <Boxes size={14} className="text-white/80" />
                <span>Qoldiq: <strong className="text-white font-bold">{stats.totalStockPairs.toLocaleString()}</strong> juft</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <Layers size={14} className="text-white/80" />
                <span>Modellar: <strong className="text-white font-bold">{stats.modelCount}</strong> xil</span>
              </div>
            </div>
          </div>

          {/* Right Column (Desktop) / Bottom Section (Mobile): BUGUNGI SAVDO FLOATING CARD */}
          <div className="md:col-span-5">
            <div className="bg-white/15 border border-white/25 rounded-3xl p-4 sm:p-5 backdrop-blur-md shadow-lg text-white">
              {/* Card Title & Refresh Button */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-semibold text-white/90">
                  {filterPeriod === 'bugun' ? 'Bugungi savdo' : filterPeriod === 'hafta' ? 'Haftalik savdo' : 'Oylik savdo'}
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all text-white/90 hover:text-white cursor-pointer"
                  title="Yangilash"
                >
                  <RefreshCw size={17} className={cn(isRefreshing && "animate-spin")} />
                </button>
              </div>

              {/* Big Amount */}
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono my-1">
                {stats.totalSalesSum > 0 ? (
                  `${stats.totalSalesSum.toLocaleString()} sum`
                ) : (
                  '0 sum'
                )}
              </div>

              {/* Receipt count and vs yesterday indicator */}
              <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-white/15">
                <div className="flex items-center gap-1.5 text-white/90 font-medium">
                  <FileText size={14} className="text-white/80" />
                  <span>{stats.receiptCount} ta chek ({stats.totalSalesPairs} juft)</span>
                </div>

                {/* Comparison Badge: e.g. -22% vs kecha or +15% vs kecha */}
                <div className={cn(
                  "px-2.5 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1 shadow-xs",
                  stats.percentVsYesterday < 0 
                    ? "bg-rose-500 text-white" 
                    : stats.percentVsYesterday > 0 
                      ? "bg-emerald-500 text-white" 
                      : "bg-white/20 text-white"
                )}>
                  {stats.percentVsYesterday < 0 ? (
                    <>
                      <TrendingDown size={12} strokeWidth={3} />
                      <span>{stats.percentVsYesterday}% vs kecha</span>
                    </>
                  ) : stats.percentVsYesterday > 0 ? (
                    <>
                      <TrendingUp size={12} strokeWidth={3} />
                      <span>+{stats.percentVsYesterday}% vs kecha</span>
                    </>
                  ) : (
                    <span>0% vs kecha</span>
                  )}
                </div>
              </div>

              {/* Filter Pill: Bugun / Hafta / Oy */}
              <div className="mt-3 pt-2 flex items-center justify-start">
                <div className="inline-flex items-center bg-white/20 rounded-xl p-0.5 border border-white/20 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterPeriod('bugun')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1",
                      filterPeriod === 'bugun' ? "bg-white text-[#0066f5] shadow-xs" : "text-white/80 hover:text-white"
                    )}
                  >
                    <span>Bugun</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterPeriod('hafta')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                      filterPeriod === 'hafta' ? "bg-white text-[#0066f5] shadow-xs" : "text-white/80 hover:text-white"
                    )}
                  >
                    Hafta
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterPeriod('oy')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                      filterPeriod === 'oy' ? "bg-white text-[#0066f5] shadow-xs" : "text-white/80 hover:text-white"
                    )}
                  >
                    Oy
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* 2. MINIMALIST FAST SEARCH BAR */}
      <div className="px-1">
        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-[var(--text3)] pointer-events-none flex items-center">
            <Search size={18} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Model qidirish (masalan: 705)..."
            className="w-full pl-10 pr-10 py-3 sm:py-3.5 bg-[var(--bg2)] border border-[var(--border)] focus:border-[#0066f5] focus:ring-2 focus:ring-blue-500/20 rounded-2xl text-sm sm:text-base font-semibold text-[var(--text)] placeholder:text-[var(--text3)] placeholder:font-normal outline-none transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 p-1.5 rounded-xl hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
              title="Tozalash"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ACTIVE SEARCH RESULTS DISPLAY */}
        {searchQuery.trim() && (
          <div className="mt-2.5 bg-[var(--bg2)] rounded-2xl p-3.5 sm:p-5 border border-[var(--border)] shadow-sm space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold">
              <span>Natijalar: {searchResults.length} ta model topildi</span>
              {searchResults.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsQuickSearchModalOpen(true)}
                  className="text-[#0066f5] hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <span>Katta oynada ko'rish</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>

            {searchResults.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)]">
                <p className="text-sm font-bold text-[var(--text)] mb-1">"{searchQuery}" bo'yicha mahsulot topilmadi</p>
                <p className="text-xs">Model nomini to'g'ri yozilganligini tekshiring.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.slice(0, 5).map(item => (
                  <StockResultCard
                    key={item.model}
                    item={item}
                    onNav={handleNav}
                    onCopy={() => handleCopyStockInfo(item)}
                    isCopied={copiedModel === item.model}
                  />
                ))}

                {searchResults.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setIsQuickSearchModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-xs font-black text-[#0066f5] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Yana {searchResults.length - 5} ta modelni to'liq ko'rish</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. DEDICATED TEZKOR QIDIRUV MODAL (MOBILE-FIRST BOTTOM SHEET / DIALOG) */}
      {isQuickSearchModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsQuickSearchModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg)] border-t sm:border border-[var(--border)] rounded-t-[28px] sm:rounded-3xl w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 mt-auto sm:my-auto transition-transform pb-safe"
            style={searchSwipeY > 0 ? {
              transform: `translateY(${searchSwipeY}px)`,
              transition: 'none'
            } : {
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Mobile Drag / Pull Indicator */}
            <div 
              className="w-full pt-1 sm:hidden select-none touch-none"
              onTouchStart={handleSearchTouchStart}
              onTouchMove={handleSearchTouchMove}
              onTouchEnd={handleSearchTouchEnd}
            >
              <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto my-2 shrink-0 cursor-grab active:cursor-grabbing" />
            </div>

            {/* Modal Header */}
            <div 
              className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg2)] select-none"
              onTouchStart={handleSearchTouchStart}
              onTouchMove={handleSearchTouchMove}
              onTouchEnd={handleSearchTouchEnd}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
                  <Zap size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)] tracking-tight leading-none flex items-center gap-2">
                    <span>Tezkor Qidiruv (Qoldiqlar)</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase">
                      Live
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">
                    Model, razmerlar va barcha omborlar bo'yicha tezkor zaxira
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsQuickSearchModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
                title="Yopish (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="p-4 border-b border-[var(--border)] bg-[var(--bg2)]/60 shrink-0 space-y-2.5">
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[var(--text3)] pointer-events-none flex items-center">
                  <Search size={18} />
                </div>
                <input
                  ref={modalInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Model nomi yoki kodini yozing..."
                  className="w-full pl-10 pr-24 py-3 bg-[var(--bg)] border border-[var(--border)] focus:border-[#0066f5] rounded-2xl text-base font-semibold text-[var(--text)] placeholder:text-[var(--text3)] placeholder:font-normal outline-none transition-all shadow-inner"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-1.5 rounded-xl hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                      title="Tozalash"
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-[#0066f5] dark:text-blue-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    title="Kamera orqali shtrix-kod skanerlash"
                  >
                    <Camera size={15} />
                    <span className="hidden sm:inline">Skaner</span>
                  </button>
                </div>
              </div>

              {/* Popular quick chips in modal */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
                <span className="text-[11px] font-bold text-[var(--text3)] shrink-0">
                  Tez tanlash:
                </span>
                {popularModels.map(item => (
                  <button
                    key={item.model}
                    type="button"
                    onClick={() => setSearchQuery(item.model)}
                    className={cn(
                      "px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border active:scale-95",
                      searchQuery.trim().toLowerCase() === item.model.toLowerCase()
                        ? "bg-[#0066f5] text-white border-[#0066f5] shadow-xs"
                        : "bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border-[var(--border)]"
                    )}
                  >
                    <span>{item.model}</span>
                    <span className="text-[10px] font-black opacity-80">
                      ({item.totalPairs})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Results Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-hide">
              {searchQuery.trim() ? (
                searchResults.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-2xl bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)]">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
                      <Search size={22} />
                    </div>
                    <p className="text-sm font-black text-[var(--text)] mb-1">
                      "{searchQuery}" bo'yicha tovar topilmadi
                    </p>
                    <p className="text-xs max-w-sm mx-auto mb-4">
                      Nomini tekshirib qayta yozing yoki kamera orqali quti yorlig'ini skanerlang.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsScannerOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
                    >
                      <Camera size={16} />
                      <span>Kamera orqali skanerlash</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold px-1">
                      <span>Topildi: {searchResults.length} ta model</span>
                      <span>Razmerlar va omborlar taqsimoti</span>
                    </div>

                    {searchResults.map(item => (
                      <StockResultCard
                        key={item.model}
                        item={item}
                        onNav={(tab) => {
                          setIsQuickSearchModalOpen(false);
                          handleNav(tab);
                        }}
                        onCopy={() => handleCopyStockInfo(item)}
                        isCopied={copiedModel === item.model}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold px-1">
                    <span>Eng ko'p zaxiraga ega modellar:</span>
                    <span>Jami {modelStockData.length} xil model</span>
                  </div>

                  {popularModels.map(item => (
                    <StockResultCard
                      key={item.model}
                      item={item}
                      onNav={(tab) => {
                        setIsQuickSearchModalOpen(false);
                        handleNav(tab);
                      }}
                      onCopy={() => handleCopyStockInfo(item)}
                      isCopied={copiedModel === item.model}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-[var(--border)] bg-[var(--bg2)] flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsQuickSearchModalOpen(false);
                  handleNav('ombor');
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-xs font-black text-[#0066f5] active:scale-95 transition-all cursor-pointer"
              >
                <Boxes size={16} />
                <span>To'liq ombor jadvaliga o'tish</span>
              </button>

              <button
                type="button"
                onClick={() => setIsQuickSearchModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-xs font-bold text-[var(--text)] active:scale-95 transition-all cursor-pointer"
              >
                Yopish
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. BARCODE / QR CAMERA SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanResult}
        availableModels={modelStockData.map(m => m.model)}
        title="Mahsulot Shtrix-kod / QR Skaneri"
        description="Qutidagi shtrix-kod yoki QR-kodni kameraga qarating"
      />

    </div>
  );
}

/**
 * REUSABLE COMPONENT: StockResultCard
 * Mobile-first stock breakdown card per model with warehouse selector, size matrix and quick actions
 */
interface StockResultCardProps {
  item: {
    model: string;
    tepaTotal: number;
    kottaTotal: number;
    sort2Total: number;
    totalPairs: number;
    price: number;
    cost: number;
    sizes: Record<string, { all: number; tepa: number; kotta: number; sort2: number }>;
  };
  onNav: (tab: Tab) => void;
  onCopy: () => void;
  isCopied: boolean;
  defaultWarehouse?: 'all' | 'tepa' | 'kotta' | 'sort2';
}

function StockResultCard({ item, onNav, onCopy, isCopied, defaultWarehouse = 'all' }: StockResultCardProps) {
  const { currentUser } = useDb();
  const [warehouseTab, setWarehouseTab] = useState<'all' | 'tepa' | 'kotta' | 'sort2'>(defaultWarehouse);

  const displaySizes = useMemo(() => {
    return Object.keys(item.sizes);
  }, [item.sizes]);

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs hover:border-blue-500/30 transition-all">
      {/* Top row: Model name, price & total stock */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
              {item.model}
            </h4>
            {item.totalPairs > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {item.totalPairs} juft
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                Qoldiq yo'q
              </span>
            )}
          </div>
          {item.price > 0 && (
            <p className="text-xs font-bold text-[var(--text3)] mt-0.5">
              Sotuv narxi: <span className="text-[var(--text)] font-extrabold">{formatUzs(item.price)}</span>
            </p>
          )}
        </div>

        {/* Copy share button */}
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0",
            isCopied
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-[var(--bg2)] hover:bg-[var(--bg3)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
          )}
          title="Qoldiq ma'lumotlarini nusxalash (Telegram/Mijoz uchun)"
        >
          {isCopied ? <Check size={15} /> : <Copy size={15} />}
          <span className="hidden sm:inline">{isCopied ? "Nusxalandi" : "Nusxalash"}</span>
        </button>
      </div>

      {/* Warehouse distribution tabs */}
      <div className="flex items-center gap-1 bg-[var(--bg2)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold overflow-x-auto scrollbar-hide">
        <button
          type="button"
          onClick={() => setWarehouseTab('all')}
          className={cn(
            "flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer text-xs",
            warehouseTab === 'all'
              ? "bg-[var(--bg)] text-[var(--text)] shadow-xs font-black border border-[var(--border)]"
              : "text-[var(--text3)] hover:text-[var(--text)]"
          )}
        >
          Barchasi ({item.totalPairs})
        </button>
        <button
          type="button"
          onClick={() => setWarehouseTab('tepa')}
          className={cn(
            "flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer text-xs",
            warehouseTab === 'tepa'
              ? "bg-blue-600 text-white shadow-xs font-black"
              : "text-[var(--text3)] hover:text-[var(--text)]"
          )}
        >
          TEPA ({item.tepaTotal})
        </button>
        <button
          type="button"
          onClick={() => setWarehouseTab('kotta')}
          className={cn(
            "flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer text-xs",
            warehouseTab === 'kotta'
              ? "bg-blue-600 text-white shadow-xs font-black"
              : "text-[var(--text3)] hover:text-[var(--text)]"
          )}
        >
          KOTTA ({item.kottaTotal})
        </button>
        {item.sort2Total > 0 && (
          <button
            type="button"
            onClick={() => setWarehouseTab('sort2')}
            className={cn(
              "flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer text-xs",
              warehouseTab === 'sort2'
                ? "bg-amber-600 text-white shadow-xs font-black"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            2-SORT ({item.sort2Total})
          </button>
        )}
      </div>

      {/* Touch-Friendly Size Matrix (Razmerlar jadvali) */}
      <div className="space-y-1">
        <div className="text-[11px] font-bold text-[var(--text3)] flex items-center justify-between">
          <span>O'lchamlar (Razmerlar):</span>
          <span className="text-[10px]">
            {warehouseTab === 'all' ? "Barcha omborlar bo'yicha" : warehouseTab === 'tepa' ? "TEPA ombori" : warehouseTab === 'kotta' ? "KOTTA ombori" : "2-SORT ombori"}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {displaySizes.map(sz => {
            const count = item.sizes[sz]?.[warehouseTab] || 0;
            return (
              <div
                key={sz}
                className={cn(
                  "p-2 rounded-xl border flex flex-col items-center justify-center transition-all text-center",
                  count > 5
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400 font-black"
                    : count > 0
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400 font-extrabold"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text3)] opacity-40 font-medium"
                )}
              >
                <span className="text-[10px] text-[var(--text3)] font-black uppercase">
                  {sz}
                </span>
                <span className="text-sm sm:text-base font-black leading-tight mt-0.5">
                  {count > 0 ? count : '-'}
                </span>
                {count > 0 && count <= 5 && (
                  <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 leading-none mt-0.5">
                    Kam
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Buttons (Only for omborchi / non-admin) */}
      {currentUser?.rol !== 'admin' && (
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <button
              type="button"
              onClick={() => onNav('chiqim')}
              className="flex-1 py-2 px-3 rounded-xl bg-[#0066f5] hover:bg-[#0055cc] active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <ArrowUpCircle size={14} />
              <span>Chiqim (Sotuv)</span>
            </button>
            <button
              type="button"
              onClick={() => onNav('otkazma')}
              className="flex-1 py-2 px-3 rounded-xl bg-[var(--bg2)] hover:bg-[var(--bg3)] active:scale-95 border border-[var(--border)] text-[var(--text)] font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <GitCompareArrows size={14} />
              <span>O'tkazma</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNav('ombor')}
            className="p-2 rounded-xl bg-[var(--bg2)] hover:bg-[var(--bg3)] active:scale-95 border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] text-xs font-bold transition-all cursor-pointer"
            title="Ombor qoldiqlari to'liq jadvalida ko'rish"
          >
            <Boxes size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

