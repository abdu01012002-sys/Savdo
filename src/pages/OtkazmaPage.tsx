import React, { useState, useRef, useMemo, useCallback } from 'react';
import { produce } from 'immer';
import { useDb } from '../context/DbContext';
import { DbState, WarehouseName } from '../types';
import { ModelSelect } from '../components/SharedComponents';
import { BarcodeScannerModal, ScanResult } from '../components/BarcodeScannerModal';
import { BarcodeGeneratorModal } from '../components/BarcodeGeneratorModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { 
  generateId, 
  getNowStr, 
  getTodayStr, 
  cn, 
  ALL_SIZES, 
  formatCompact, 
  formatUzs, 
  getCat 
} from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';
import { 
  ACTIVE_BOX_PRESETS, 
  BoxPreset, 
  calculateBoxRun 
} from '../utils/boxCalculations';
import { 
  Trash2, 
  ArrowRight, 
  ArrowLeftRight, 
  Edit2, 
  X, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Box, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  Layers, 
  Send, 
  RotateCcw, 
  Building2, 
  Mountain, 
  Archive,
  Split,
  Plus,
  Minus,
  CheckCircle2,
  Calendar,
  FileText,
  Camera,
  QrCode,
  Barcode
} from 'lucide-react';
import { toast } from 'sonner';

const isSavingRef = { current: false };

// Omborlar vizual ma'lumotlari
const WAREHOUSE_META: Record<WarehouseName, {
  name: string;
  shortName: string;
  badge: string;
  icon: any;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  description: string;
}> = {
  tepa: {
    name: 'Tepa Ombor',
    shortName: 'Tepa',
    badge: '🏔 Tepa Ombor',
    icon: Mountain,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
    description: 'Ishlab chiqarish va asosiy yuqori ombor'
  },
  kotta: {
    name: 'Kotta Ombor',
    shortName: 'Kotta',
    badge: '🏢 Kotta Ombor',
    icon: Building2,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/30',
    description: 'Asosiy savdo zali va realizatsiya ombori'
  },
  sort2: {
    name: '2-Sort Ombor',
    shortName: '2-Sort',
    badge: '🟡 2-Sort Ombor',
    icon: Archive,
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/30',
    description: '2-Sort, chegirma va utsenka mahsulotlari'
  }
};

// Heatmap uslublari
const getHeatmapBadge = (qty: number) => {
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

export default function OtkazmaPage() {
  const { db, currentOmbor, currentUser, setDb } = useDb();
  
  // Yo'nalish
  const [otkazmaFrom, setOtkazmaFrom] = useState<WarehouseName>(currentOmbor || 'tepa');
  const [otkazmaTo, setOtkazmaTo] = useState<WarehouseName>(currentOmbor === 'tepa' ? 'kotta' : 'tepa');
  
  // Forma
  const [sana, setSana] = useState(getTodayStr());
  const [model, setModel] = useState('');
  const [izoh, setIzoh] = useState('');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  
  // Partiyaviy Box Preset
  const [activePresetId, setActivePresetId] = useState<string>('standard-8');
  const activePreset = useMemo(() => {
    return ACTIVE_BOX_PRESETS.find(p => p.id === activePresetId) || ACTIVE_BOX_PRESETS[0];
  }, [activePresetId]);

  // Amallar holatlari
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [historyFilterDirection, setHistoryFilterDirection] = useState<'all' | 'tepa-kotta' | 'kotta-tepa' | 'to-sort2' | 'from-sort2'>('all');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Manbadagi barcha modellar
  const sourceStock = useMemo(() => {
    return db[otkazmaFrom]?.stock || {};
  }, [db, otkazmaFrom]);

  const destinationStock = useMemo(() => {
    return db[otkazmaTo]?.stock || {};
  }, [db, otkazmaTo]);

  const [showAllModels, setShowAllModels] = useState(false);

  const sourceStockMap = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(sourceStock).forEach(([m, szs]) => {
      const sum = Object.values(szs || {}).reduce((a, b) => a + Number(b || 0), 0);
      map[m] = sum;
    });
    return map;
  }, [sourceStock]);

  const inStockModels = useMemo(() => {
    const archived = db.archivedModels || [];
    return Object.keys(sourceStock)
      .filter(m => (sourceStockMap[m] || 0) > 0 && !archived.includes(m))
      .sort((a, b) => a.localeCompare(b));
  }, [sourceStock, sourceStockMap, db.archivedModels]);

  const allModels = useMemo(() => {
    if (!showAllModels) {
      return inStockModels;
    }
    const withStock = Object.keys(sourceStock).filter(m => (sourceStockMap[m] || 0) > 0);
    const otherModels = Array.from(new Set([
      ...Object.keys(sourceStock || {}),
      ...Object.keys(destinationStock || {}),
      ...Object.keys(db.prices || {})
    ])).filter(m => Boolean(m) && !withStock.includes(m));

    return [...withStock, ...otherModels];
  }, [sourceStock, destinationStock, db.prices, sourceStockMap, showAllModels, inStockModels]);

  // Barcode / QR Scanner & Generator Modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [generatorModel, setGeneratorModel] = useState<string | null>(null);

  // Handle incoming camera barcode scan in Otkazma
  const handleBarcodeScan = useCallback((res: ScanResult) => {
    if (!res.model) return;
    setModel(res.model);

    // If QR code contained a full box/series of sizes
    if (res.sizesObject && Object.keys(res.sizesObject).length > 0) {
      setSizes(prev => ({
        ...prev,
        ...res.sizesObject
      }));
      toast.success(`📦 "${res.model}" seriya o'lchamlari yuklandi!`);
    } else if (res.size) {
      // Single size scan (increment by scanned quantity)
      const qtyToAdd = res.quantity || 1;
      setSizes(prev => ({
        ...prev,
        [res.size!]: (Number(prev[res.size!] || 0) + qtyToAdd)
      }));
      toast.success(`👞 "${res.model}" ${res.size}-o'lchamga +${qtyToAdd} juft qo'shildi!`);
    } else {
      toast.info(`🔍 "${res.model}" modeli tanlandi. O'tkazma sonlarini kiriting.`);
    }
  }, []);

  // Global hardware laser scanner listener
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    availableModels: allModels,
    enabled: true
  });

  // Tanlangan modelning manbadagi qoldig'i
  const currentModelSourceStock = useMemo(() => {
    if (!model) return {};
    return sourceStock[model] || {};
  }, [sourceStock, model]);

  // Tanlangan modelning qabuldagi qoldig'i
  const currentModelDestStock = useMemo(() => {
    if (!model) return {};
    return destinationStock[model] || {};
  }, [destinationStock, model]);

  // Manbadagi modelning jami juft soni
  const modelTotalSourceQty = useMemo(() => {
    return Object.values(currentModelSourceStock).reduce((a, b) => a + Number(b || 0), 0);
  }, [currentModelSourceStock]);

  // Qabuldagi modelning jami juft soni
  const modelTotalDestQty = useMemo(() => {
    return Object.values(currentModelDestStock).reduce((a, b) => a + Number(b || 0), 0);
  }, [currentModelDestStock]);

  // Manbadagi to'liq qutilar tahlili (Box calculation)
  const sourceBoxStats = useMemo(() => {
    if (!model) return null;
    return calculateBoxRun(currentModelSourceStock, activePreset);
  }, [currentModelSourceStock, activePreset, model]);

  // Hozir kiritilayotgan o'tkazma jami juft soni
  const totalTransferQty = useMemo(() => {
    return Object.values(sizes).reduce((a, b) => a + Number(b || 0), 0);
  }, [sizes]);

  // O'tkazilayotgan qutilar soni
  const transferBoxStats = useMemo(() => {
    if (totalTransferQty === 0) return null;
    return calculateBoxRun(sizes, activePreset);
  }, [sizes, activePreset, totalTransferQty]);

  // Narxlar va qiymat
  const priceInfo = db.prices?.[model];
  const totalTransferCostValue = (priceInfo?.cost || 0) * totalTransferQty;
  const totalTransferSaleValue = (priceInfo?.sale || 0) * totalTransferQty;

  // Ombordagi umumiy juftlar statistikasi
  const warehouseTotalSource = useMemo(() => {
    let sum = 0;
    Object.values(sourceStock).forEach(st => {
      Object.values(st || {}).forEach(q => sum += Number(q || 0));
    });
    return sum;
  }, [sourceStock]);

  const warehouseTotalDest = useMemo(() => {
    let sum = 0;
    Object.values(destinationStock).forEach(st => {
      Object.values(st || {}).forEach(q => sum += Number(q || 0));
    });
    return sum;
  }, [destinationStock]);

  // Yo'nalishni almashtirish (Swap)
  const flipOtkazma = () => {
    const prevFrom = otkazmaFrom;
    const prevTo = otkazmaTo;
    setOtkazmaFrom(prevTo);
    setOtkazmaTo(prevFrom);
    setModel('');
    setSizes({});
  };

  // O'lcham qiymatini o'zgartirish
  const handleSizeChange = (sz: string, val: number) => {
    const avail = currentModelSourceStock[sz] || 0;
    const clamped = Math.max(0, Math.min(val, avail));
    setSizes(prev => {
      const next = { ...prev };
      if (clamped === 0) {
        delete next[sz];
      } else {
        next[sz] = clamped;
      }
      return next;
    });
  };

  // O'lchamga +1 / -1 bosish
  const stepSize = (sz: string, delta: number) => {
    const curr = sizes[sz] || 0;
    handleSizeChange(sz, curr + delta);
  };

  // Bitta o'lchamni maksimal (manbadagi barchasi) qilish
  const setSizeMax = (sz: string) => {
    const avail = currentModelSourceStock[sz] || 0;
    handleSizeChange(sz, avail);
  };

  // PARTIYAVIY O'TKAZISH: 1 Quti qo'shish
  const handleApplyBoxPreset = (multiplier: number = 1) => {
    if (!model) {
      toast.error("Avval modelni tanlang!");
      return;
    }

    const nextSizes = { ...sizes };
    let canApply = true;
    let bottleneckSize = '';

    ALL_SIZES.forEach(sz => {
      const neededForPreset = (activePreset.sizes[sz] || 0) * multiplier;
      const currentInForm = nextSizes[sz] || 0;
      const totalWanted = currentInForm + neededForPreset;
      const avail = currentModelSourceStock[sz] || 0;

      if (totalWanted > avail) {
        canApply = false;
        bottleneckSize = sz;
      }
    });

    if (!canApply) {
      toast.error(`❌ Manba omborda ${bottleneckSize}-o'lchamdan ${multiplier} ta quti uchun yetarli qoldiq yo'q!`);
      return;
    }

    ALL_SIZES.forEach(sz => {
      const neededForPreset = (activePreset.sizes[sz] || 0) * multiplier;
      const currentInForm = nextSizes[sz] || 0;
      const newVal = currentInForm + neededForPreset;
      if (newVal > 0) {
        nextSizes[sz] = newVal;
      }
    });

    setSizes(nextSizes);
    toast.success(`📦 +${multiplier} ta quti (${activePreset.name}) o'tkazmaga qo'shildi!`);
  };

  // PARTIYAVIY O'TKAZISH: Manbadagi Barcha To'liq Qutilarni o'tkazish
  const handleTransferAllFullBoxes = () => {
    if (!model) {
      toast.error("Avval modelni tanlang!");
      return;
    }
    const maxBoxes = sourceBoxStats?.fullBoxes || 0;
    if (maxBoxes <= 0) {
      toast.warning(`⚠️ Manba omborda bu model bo'yicha to'liq 1 quti ham komplekt qolmagan!`);
      return;
    }

    const newSizes: Record<string, number> = {};
    ALL_SIZES.forEach(sz => {
      const boxCountForSize = (activePreset.sizes[sz] || 0) * maxBoxes;
      if (boxCountForSize > 0) {
        newSizes[sz] = boxCountForSize;
      }
    });

    setSizes(newSizes);
    toast.success(`📦 ${maxBoxes} ta to'liq quti (${maxBoxes * activePreset.total} juft) o'tkazmaga belgilandi!`);
  };

  // Barcha mavjud qoldiqni 100% ko'chirish
  const handleTransferEntireStock = () => {
    if (!model) {
      toast.error("Avval modelni tanlang!");
      return;
    }
    if (modelTotalSourceQty === 0) {
      toast.warning("Bu modelda manba omborda qoldiq yo'q!");
      return;
    }

    const newSizes: Record<string, number> = {};
    ALL_SIZES.forEach(sz => {
      const avail = currentModelSourceStock[sz] || 0;
      if (avail > 0) {
        newSizes[sz] = avail;
      }
    });

    setSizes(newSizes);
    toast.success(`🚀 Barcha mavjud qoldiq (${modelTotalSourceQty} juft) 100% o'tkazmaga tanlandi!`);
  };

  // Tozalash
  const clearForm = () => {
    setModel('');
    setIzoh('');
    setSizes({});
  };

  // SAQLASH (O'tkazmani tasdiqlash)
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    const cleanModel = model.trim();
    if (!cleanModel) { 
      setIsSaving(false); 
      isSavingRef.current = false; 
      return toast.error('Model nomini kiriting!'); 
    }
    if (!sana) { 
      setIsSaving(false); 
      isSavingRef.current = false; 
      return toast.error('Sanani kiriting!'); 
    }
    
    const sizeEntries = Object.entries(sizes)
      .map(([sz, qty]) => [sz, Number(qty)] as [string, number])
      .filter(([, qty]) => qty > 0);

    if (sizeEntries.length === 0) { 
      setIsSaving(false); 
      isSavingRef.current = false; 
      return toast.error('Kamida bir o\'lcham va soni kiriting!'); 
    }

    // Tekshirish
    const fromStock = db[otkazmaFrom]?.stock || {};
    for (const [sz, qty] of sizeEntries) {
      const avail = fromStock[cleanModel]?.[sz] || 0;
      if (qty > avail) { 
        setIsSaving(false); 
        isSavingRef.current = false; 
        return toast.error(`❌ ${sz}° uchun manba omborida faqat ${avail} juft mavjud!`); 
      }
    }

    const sizeKey = Object.entries(sizes).sort((a,b) => a[0].localeCompare(b[0])).map(e => e.join(':')).join('|');
    const txGroupId = `${cleanModel}_${otkazmaFrom}_${otkazmaTo}_${sana}_${sizeKey}_${Date.now()}`;
    
    try {
      const txVaqt = getNowStr();
      setDb(produce((draft: DbState) => {
        if (!draft[otkazmaFrom]) draft[otkazmaFrom] = { stock: {}, transactions: [] };
        if (!draft[otkazmaTo]) draft[otkazmaTo] = { stock: {}, transactions: [] };
        if (!draft.otkazmalar) draft.otkazmalar = [];

        if (!draft[otkazmaFrom].stock[cleanModel]) draft[otkazmaFrom].stock[cleanModel] = {};
        if (!draft[otkazmaTo].stock[cleanModel]) draft[otkazmaTo].stock[cleanModel] = {};

        sizeEntries.forEach(([sz, qty]) => {
          const txId = generateId();
          
          // From ombor
          const currentFromStock = draft[otkazmaFrom].stock[cleanModel][sz] || 0;
          draft[otkazmaFrom].stock[cleanModel][sz] = Math.max(0, currentFromStock - qty);
          draft[otkazmaFrom].transactions.push({
            id: txId + '_out',
            vaqt: txVaqt,
            sana,
            amal: 'otkazma-out',
            model: cleanModel,
            olcham: sz,
            soni: qty,
            izoh: `→ ${otkazmaTo.toUpperCase()}${izoh ? ': ' + izoh : ''}`,
            xodim: currentUser?.ism || 'Foydalanuvchi',
            groupId: txGroupId
          });
          
          // To ombor
          draft[otkazmaTo].stock[cleanModel][sz] = (draft[otkazmaTo].stock[cleanModel][sz] || 0) + qty;
          draft[otkazmaTo].transactions.push({
            id: txId + '_in',
            vaqt: txVaqt,
            sana,
            amal: 'otkazma-in',
            model: cleanModel,
            olcham: sz,
            soni: qty,
            izoh: `← ${otkazmaFrom.toUpperCase()}${izoh ? ': ' + izoh : ''}`,
            xodim: currentUser?.ism || 'Foydalanuvchi',
            groupId: txGroupId
          });
          
          // Global O'tkazma yozuvi
          draft.otkazmalar.push({
            id: txId,
            vaqt: txVaqt,
            sana,
            model: cleanModel,
            olcham: sz,
            soni: qty,
            from: otkazmaFrom,
            to: otkazmaTo,
            izoh,
            groupId: txGroupId
          });

          const log = createAuditLog(
            currentUser!, 
            'otkazma', 
            'Otkazma', 
            `O'tkazma: ${cleanModel} (${sz}° x ${qty} ta) | ${WAREHOUSE_META[otkazmaFrom].name} ➡️ ${WAREHOUSE_META[otkazmaTo].name}`
          );
          if (!draft.auditLogs) draft.auditLogs = [];
          draft.auditLogs.push(log);
        });
      }));
      
      toast.success(`✅ ${cleanModel} — ${totalTransferQty} juft muvaffaqiyatli o'tkazildi!`);
      clearForm();
    } catch (error: any) {
      console.error(`[Transaction] Error:`, error);
      toast.error("Xatolik yuz berdi: " + error.message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  // O'TKAZMANI BEKOR QILISH (Guruh)
  const deleteGroupOtkazma = (groupId: string) => {
    if (currentUser?.rol !== 'admin') {
      toast.error("Faqat admin o'tkazmani bekor qilishi mumkin!");
      return;
    }

    const recs = (db.otkazmalar || []).filter(o => 
      o.groupId === groupId || 
      (!o.groupId && `${o.from}_${o.to}_${o.vaqt?.slice(0, 16) || ''}` === groupId)
    );
    if (recs.length === 0) return;

    let totalNotReturned = 0;
    recs.forEach(rec => {
      const destinationStockVal = db[rec.to]?.stock?.[rec.model]?.[rec.olcham] || 0;
      const itemsNotReturned = Math.max(0, rec.soni - destinationStockVal);
      totalNotReturned += itemsNotReturned;
    });

    if (totalNotReturned > 0) {
      toast.warning(`⚠️ Mahsulotlar allaqachon sotib yuborilgan. O'tkazma bekor qilingani uchun qabul qiluvchi omborda kamomad yuzaga kelishi mumkin.`);
    }

    setDb(produce((draft: DbState) => {
      const draftRecs = (draft.otkazmalar || []).filter(o => 
        o.groupId === groupId || 
        (!o.groupId && `${o.from}_${o.to}_${o.vaqt?.slice(0, 16) || ''}` === groupId)
      );

      draftRecs.forEach(rec => {
        if (!draft[rec.from].stock[rec.model]) {
          draft[rec.from].stock[rec.model] = {};
        }
        draft[rec.from].stock[rec.model][rec.olcham] = (draft[rec.from].stock[rec.model][rec.olcham] || 0) + rec.soni;

        if (!draft[rec.to].stock[rec.model]) {
          draft[rec.to].stock[rec.model] = {};
        }
        
        const currentDestStock = draft[rec.to].stock[rec.model]?.[rec.olcham] || 0;
        draft[rec.to].stock[rec.model][rec.olcham] = Math.max(0, currentDestStock - rec.soni);

        draft[rec.from].transactions = (draft[rec.from].transactions || []).filter(t => t.id !== rec.id + '_out');
        draft[rec.to].transactions = (draft[rec.to].transactions || []).filter(t => t.id !== rec.id + '_in');
        
        const returnedAmount = Math.min(rec.soni, currentDestStock);
        if (!draft.bekorQilinganOtkazmalar) draft.bekorQilinganOtkazmalar = [];
        draft.bekorQilinganOtkazmalar.push({ ...rec, qaytibKelganSoni: returnedAmount });
        
        draft.otkazmalar = draft.otkazmalar.filter(o => o.id !== rec.id);
      });
      
      if (!draft.auditLogs) draft.auditLogs = [];
      const log = createAuditLog(currentUser!, 'delete_otkazma_group', 'Otkazma', `O'tkazma bekor qilindi (guruh): ${draftRecs.length} ta xil tovar`);
      draft.auditLogs.push(log);
    }));

    toast.success("O'tkazma muvaffaqiyatli bekor qilindi va qoldiqlar orqaga qaytarildi.");
  };

  // TARIXNI TOZALASH
  const handleClearAllOtkazmaHistory = () => {
    if (currentUser?.rol !== 'admin') return;
    try {
      setDb(produce((draft: DbState) => {
        draft.otkazmalar = [];
        const log = createAuditLog(currentUser!, 'clear_otkazma_history', 'Otkazma', `Barcha omborlararo o'tkazmalar tarixi tozalandi`);
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(log);
      }));
      toast.success("O'tkazmalar tarixi muvaffaqiyatli tozalandi!");
      setIsClearAllModalOpen(false);
    } catch (e: any) {
      toast.error("Xatolik yuz berdi: " + e.message);
    }
  };

  // Guruhlangan o'tkazmalar
  const groupedOtkazmalar = useMemo(() => {
    const groups: Record<string, any> = {};
    const txList = [...(db.otkazmalar || [])].reverse();
    
    txList.forEach(t => {
      const key = t.groupId || `${t.from}_${t.to}_${t.vaqt?.slice(0, 16) || ''}_${t.model}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          vaqt: t.vaqt,
          sana: t.sana || t.vaqt?.slice(0, 10),
          from: t.from,
          to: t.to,
          model: t.model,
          izoh: t.izoh || '',
          items: [],
          jamiSoni: 0
        };
      }
      
      groups[key].items.push(t);
      groups[key].jamiSoni += Number(t.soni || 0);
    });
    
    return Object.values(groups);
  }, [db.otkazmalar]);

  // Filtrlangan tarix
  const filteredGroups = useMemo(() => {
    return groupedOtkazmalar.filter(g => {
      // Direction filter
      if (historyFilterDirection === 'tepa-kotta' && !(g.from === 'tepa' && g.to === 'kotta')) return false;
      if (historyFilterDirection === 'kotta-tepa' && !(g.from === 'kotta' && g.to === 'tepa')) return false;
      if (historyFilterDirection === 'to-sort2' && g.to !== 'sort2') return false;
      if (historyFilterDirection === 'from-sort2' && g.from !== 'sort2') return false;

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        String(g.from || '').toLowerCase().includes(q) ||
        String(g.to || '').toLowerCase().includes(q) ||
        (Boolean(g.izoh) && String(g.izoh).toLowerCase().includes(q)) ||
        (Boolean(g.model) && String(g.model).toLowerCase().includes(q)) ||
        (Boolean(g.vaqt) && String(g.vaqt).includes(q)) ||
        (g.items || []).some((t: any) => 
          String(t?.model || '').toLowerCase().includes(q) || 
          String(t?.olcham ?? '').toLowerCase().includes(q)
        )
      );
    });
  }, [groupedOtkazmalar, historyFilterDirection, search]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteGroupClick = (groupId: string) => {
    if (deleteId === groupId) {
      deleteGroupOtkazma(groupId);
      setDeleteId(null);
    } else {
      setDeleteId(groupId);
      setTimeout(() => setDeleteId(null), 3500);
    }
  };

  const FromIcon = WAREHOUSE_META[otkazmaFrom].icon;
  const ToIcon = WAREHOUSE_META[otkazmaTo].icon;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      
      {/* ========================================================================= */}
      {/* 1. VIZUAL TRANSFER YO'NALISHI (HERO BENTO CARDS) */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col gap-5">
        
        {/* Sarlavha & Ma'lumot */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
              <Split className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-[var(--text)] tracking-tight">
                Omborlararo O'tkazma & Transfer
              </h1>
              <p className="text-xs text-[var(--text3)]">
                Tovarlarni omborlar o'rtasida xavfsiz va partiyaviy (karobka) ko'chirish
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text3)]">Sana:</span>
            <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--text)]">
              <Calendar size={13} className="text-purple-600" />
              <input 
                type="date" 
                value={sana}
                onChange={e => setSana(e.target.value)}
                className="bg-transparent text-xs font-bold text-[var(--text)] outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 2 Katta Kartochka va O'rtadagi Interaktiv Yo'nalish Ko'prigi */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-4">
          
          {/* A) CHIQUVCHI OMBOR KARTASI (MANBA - FROM) */}
          <div className={cn(
            "p-4 sm:p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col gap-3",
            WAREHOUSE_META[otkazmaFrom].bgClass,
            WAREHOUSE_META[otkazmaFrom].borderClass
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
                <Send size={11} className="text-rose-500" />
                Chiquvchi Ombor (Manba)
              </span>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-white/50 dark:bg-black/30 border border-current/20">
                Jami: {warehouseTotalSource.toLocaleString()} jft
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/70 dark:bg-black/40 flex items-center justify-center shrink-0 shadow-xs">
                <FromIcon className={cn("w-6 h-6", WAREHOUSE_META[otkazmaFrom].colorClass)} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-[var(--text)] tracking-tight">
                  {WAREHOUSE_META[otkazmaFrom].badge}
                </h3>
                <p className="text-xs text-[var(--text3)] truncate">
                  {WAREHOUSE_META[otkazmaFrom].description}
                </p>
              </div>
            </div>

            {/* Ombor tanlash tugmalari */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-black/5 dark:border-white/5">
              {(['tepa', 'kotta', 'sort2'] as WarehouseName[]).map(w => {
                const isSelected = otkazmaFrom === w;
                return (
                  <button
                    key={`from-${w}`}
                    type="button"
                    onClick={() => {
                      if (w === otkazmaTo) {
                        setOtkazmaTo(otkazmaFrom);
                      }
                      setOtkazmaFrom(w);
                      setModel('');
                      setSizes({});
                    }}
                    className={cn(
                      "py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center truncate",
                      isSelected 
                        ? "bg-purple-600 text-white shadow-xs font-black scale-102" 
                        : "bg-white/40 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/40 text-[var(--text2)] border border-transparent"
                    )}
                  >
                    {WAREHOUSE_META[w].shortName}
                  </button>
                );
              })}
            </div>

            {/* Model tanlangandagi manba qoldig'i ko'rsatkichi */}
            {model && (
              <div className="mt-1 bg-white/60 dark:bg-black/40 rounded-2xl p-2.5 border border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
                <span className="text-[var(--text3)] font-medium">Model qoldig'i:</span>
                <div className="flex items-center gap-1.5 font-black">
                  <span className="text-[var(--text)] tabular-nums">{modelTotalSourceQty} jft</span>
                  {totalTransferQty > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 text-[11px]">
                      ➔ {Math.max(0, modelTotalSourceQty - totalTransferQty)} jft qoladi
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* B) O'RTADAGI SWAP & TRANSFER ANIMATSIYASI */}
          <div className="flex flex-col items-center justify-center gap-2 my-1 lg:my-0">
            <button
              type="button"
              onClick={flipOtkazma}
              className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:border-purple-500 hover:text-purple-600 hover:shadow-lg active:scale-90 transition-all cursor-pointer flex items-center gap-2 group shadow-xs"
              title="Yo'nalishni almashtirish"
            >
              <ArrowLeftRight className="w-5 h-5 group-hover:rotate-180 transition-transform duration-300" />
            </button>
            <span className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider hidden lg:block">
              Almashtirish
            </span>
          </div>

          {/* C) QABUL QILUVCHI OMBOR KARTASI (QABUL - TO) */}
          <div className={cn(
            "p-4 sm:p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col gap-3",
            WAREHOUSE_META[otkazmaTo].bgClass,
            WAREHOUSE_META[otkazmaTo].borderClass
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Qabul Qiluvchi Ombor (Qabul)
              </span>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-white/50 dark:bg-black/30 border border-current/20">
                Jami: {warehouseTotalDest.toLocaleString()} jft
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/70 dark:bg-black/40 flex items-center justify-center shrink-0 shadow-xs">
                <ToIcon className={cn("w-6 h-6", WAREHOUSE_META[otkazmaTo].colorClass)} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-[var(--text)] tracking-tight">
                  {WAREHOUSE_META[otkazmaTo].badge}
                </h3>
                <p className="text-xs text-[var(--text3)] truncate">
                  {WAREHOUSE_META[otkazmaTo].description}
                </p>
              </div>
            </div>

            {/* Ombor tanlash tugmalari */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-black/5 dark:border-white/5">
              {(['tepa', 'kotta', 'sort2'] as WarehouseName[]).map(w => {
                const isSelected = otkazmaTo === w;
                return (
                  <button
                    key={`to-${w}`}
                    type="button"
                    onClick={() => {
                      if (w === otkazmaFrom) {
                        setOtkazmaFrom(otkazmaTo);
                      }
                      setOtkazmaTo(w);
                    }}
                    className={cn(
                      "py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center truncate",
                      isSelected 
                        ? "bg-purple-600 text-white shadow-xs font-black scale-102" 
                        : "bg-white/40 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/40 text-[var(--text2)] border border-transparent"
                    )}
                  >
                    {WAREHOUSE_META[w].shortName}
                  </button>
                );
              })}
            </div>

            {/* Model tanlangandagi qabul qoldig'i ko'rsatkichi */}
            {model && (
              <div className="mt-1 bg-white/60 dark:bg-black/40 rounded-2xl p-2.5 border border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
                <span className="text-[var(--text3)] font-medium">Joriy qoldiq:</span>
                <div className="flex items-center gap-1.5 font-black">
                  <span className="text-[var(--text)] tabular-nums">{modelTotalDestQty} jft</span>
                  {totalTransferQty > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
                      ➔ {modelTotalDestQty + totalTransferQty} jft bo'ladi
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. MODEL TANLASH & PARTIYAVIY (BOX / KAROBKA) ASBOBLARI */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col gap-5">
        
        {/* Model va Izoh inputlari */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Model Tanlash */}
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider">
                Model (Manba: {WAREHOUSE_META[otkazmaFrom].shortName})
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-purple-600 dark:text-purple-400 font-bold lowercase text-[10px]">
                  {showAllModels ? `Barcha (${allModels.length})` : `${inStockModels.length} ta bor`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllModels(prev => !prev)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer border",
                    showAllModels
                      ? "bg-amber-500/20 text-amber-600 border-amber-500/40"
                      : "bg-purple-500/10 text-purple-600 border-purple-500/30 hover:bg-purple-500/20"
                  )}
                >
                  {showAllModels ? "Faqat borlar" : "Barchasi"}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-[46px]">
                <ModelSelect 
                  value={model} 
                  onChange={(val) => {
                    setModel(val);
                    setSizes({});
                  }} 
                  options={allModels} 
                  stockMap={sourceStockMap}
                  placeholder="Model nomini qidiring yoki tanlang..." 
                />
              </div>

              {/* Camera Barcode / QR Scanner button */}
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="h-[46px] px-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-black text-xs active:scale-95"
                title="Kameradan shtrix-kod yoki QR-kod skanerlash"
              >
                <Camera size={16} />
                <span className="hidden sm:inline">Skaner</span>
              </button>

              {/* QR Label Generator button for current model */}
              {model && (
                <button
                  type="button"
                  onClick={() => setGeneratorModel(model)}
                  className="h-[46px] px-3 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text2)] border border-[var(--border)] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
                  title="Ushbu model uchun QR / Shtrix-kod yorliq chiqarish"
                >
                  <QrCode size={16} className="text-purple-500" />
                  <span className="hidden sm:inline">Yorliq</span>
                </button>
              )}
            </div>
          </div>

          {/* Izoh */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider">
              Izoh / Sabab (ixtiyoriy)
            </label>
            <input 
              type="text" 
              value={izoh}
              onChange={e => setIzoh(e.target.value)}
              placeholder="Masalan: Savdoga to'ldirish..."
              className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all font-medium"
            />
          </div>

        </div>

        {/* PARTIYAVIY (BOX / KAROBKA) SERIYA BOSHQARUVI */}
        {model && (
          <div className="bg-[var(--bg)] border border-purple-500/30 rounded-3xl p-4 sm:p-5 flex flex-col gap-4 animate-in fade-in duration-200">
            
            {/* Sarlavha & Preset tanlash */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <h3 className="text-sm font-black text-[var(--text)]">
                    Partiyaviy (Quti / Seriya) O'tkazish
                  </h3>
                  <p className="text-[11px] text-[var(--text3)]">
                    Model tanlanganda butun seriyani bitta tugma bilan ko'chirish
                  </p>
                </div>
              </div>

              {/* Box Preset tanlash */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[var(--text3)]">Seriya shabloni:</span>
                <select
                  value={activePresetId}
                  onChange={e => setActivePresetId(e.target.value)}
                  className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1 text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  {ACTIVE_BOX_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.shortName} ({p.total} jft)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Manbadagi qutilar tahlili (Box stats) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 flex flex-col">
                <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Manbadagi Jami</span>
                <span className="text-base font-black text-[var(--text)] tabular-nums">
                  {modelTotalSourceQty} <span className="text-xs font-normal text-[var(--text3)]">juft</span>
                </span>
              </div>

              <div className="bg-[var(--bg2)] border border-purple-500/20 rounded-2xl p-3 flex flex-col">
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">To'liq Qutilar</span>
                <span className="text-base font-black text-purple-600 dark:text-purple-400 tabular-nums">
                  {sourceBoxStats?.fullBoxes || 0} <span className="text-xs font-normal text-[var(--text3)]">quti ({((sourceBoxStats?.fullBoxes || 0) * activePreset.total)} jft)</span>
                </span>
              </div>

              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 flex flex-col">
                <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Dona (Seriyasiz)</span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {sourceBoxStats?.loosePairs || 0} <span className="text-xs font-normal text-[var(--text3)]">juft</span>
                </span>
              </div>

              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 flex flex-col">
                <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Seriya Nisbati</span>
                <span className="text-[11px] font-bold text-[var(--text)] truncate mt-1" title={activePreset.description}>
                  {activePreset.description}
                </span>
              </div>
            </div>

            {/* TEZKOR PARTIYAVIY O'TKAZISH TUGMALARI */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              
              <button
                type="button"
                onClick={() => handleApplyBoxPreset(1)}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Plus size={13} />
                <span>+1 Quti ({activePreset.total} jft)</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyBoxPreset(2)}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <span>+2 Quti</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyBoxPreset(5)}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <span>+5 Quti</span>
              </button>

              {/* Barcha to'liq qutilarni o'tkazish */}
              {(sourceBoxStats?.fullBoxes || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleTransferAllFullBoxes}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Box size={13} />
                  <span>Barcha {sourceBoxStats?.fullBoxes} ta Qutini O'tkazish</span>
                </button>
              )}

              {/* 100% barcha qoldiqni ko'chirish */}
              <button
                type="button"
                onClick={handleTransferEntireStock}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 text-zinc-950 hover:bg-amber-400 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ml-auto"
              >
                <Sparkles size={13} />
                <span>100% Barcha Qoldiqni Ko'chirish</span>
              </button>

              {totalTransferQty > 0 && (
                <button
                  type="button"
                  onClick={() => setSizes({})}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all cursor-pointer"
                >
                  Tozalash
                </button>
              )}

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. INTERAKTIV O'LCHAMLAR (39-45) MATRITSASI & REAL-TIME PREVIEW */}
        {/* ========================================================================= */}
        {model && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--text3)] px-1">
              <span className="uppercase tracking-wider font-extrabold text-[var(--text)]">
                39–45 O'lchamlar bo'yicha taqsimot
              </span>
              <span>
                Manba: <strong className="text-[var(--text)]">{WAREHOUSE_META[otkazmaFrom].shortName}</strong> ➔ Qabul: <strong className="text-[var(--text)]">{WAREHOUSE_META[otkazmaTo].shortName}</strong>
              </span>
            </div>

            {/* 7 O'lcham Kartochkalar Gridi (Mobil: 3 ustun, 39-41 yuqori qator, 42-44 pastki qator) */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {ALL_SIZES.map(sz => {
                const avail = currentModelSourceStock[sz] || 0;
                const transferQty = sizes[sz] || 0;
                const destCurrent = currentModelDestStock[sz] || 0;
                const afterSource = Math.max(0, avail - transferQty);
                const afterDest = destCurrent + transferQty;
                const isOverLimit = transferQty > avail;

                return (
                  <div
                    key={sz}
                    className={cn(
                      "p-2.5 sm:p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 bg-[var(--bg)] min-h-[96px]",
                      transferQty > 0 ? "border-purple-500 shadow-xs ring-1 ring-purple-500/20" : "border-[var(--border)]",
                      isOverLimit ? "border-rose-500 ring-2 ring-rose-500/30" : ""
                    )}
                  >
                    {/* Yuqori: Razmer nomi & Mavjud zaxira Heatmap badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-[var(--text)]">
                        {sz}°
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums border",
                        getHeatmapBadge(avail)
                      )} title={`Manbadagi mavjud qoldiq: ${avail} jft`}>
                        {avail} jft
                      </span>
                    </div>

                    {/* O'rtada: Input va +/- tugmalari */}
                    <div className="flex items-center justify-between gap-1 bg-[var(--bg2)] p-1 rounded-xl border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => stepSize(sz, -1)}
                        disabled={transferQty <= 0}
                        className="w-7 sm:w-8 h-8 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:text-rose-500 flex items-center justify-center text-xs font-black disabled:opacity-30 cursor-pointer active:scale-90"
                      >
                        -
                      </button>

                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        max={avail}
                        value={transferQty > 0 ? transferQty : ''}
                        onFocus={e => e.target.select()}
                        onChange={e => handleSizeChange(sz, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full h-8 min-h-[32px] text-center bg-transparent text-sm sm:text-base font-black text-[var(--text)] outline-none tabular-nums"
                      />

                      <button
                        type="button"
                        onClick={() => stepSize(sz, 1)}
                        disabled={transferQty >= avail}
                        className="w-7 sm:w-8 h-8 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:text-emerald-500 flex items-center justify-center text-xs font-black disabled:opacity-30 cursor-pointer active:scale-90"
                      >
                        +
                      </button>
                    </div>

                    {/* Pastki qism: Max tugmasi va Before-After Ko'rsatkich */}
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/60 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSizeMax(sz)}
                        disabled={avail <= 0 || transferQty === avail}
                        className="font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer disabled:opacity-30"
                      >
                        Max ({avail})
                      </button>

                      <div className="text-right">
                        <span className="text-[var(--text3)] font-semibold">
                          ➔ {afterDest} jft
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. JONLI TRANSFER XULOSASI & TASDIQLASH TUGMASI */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-5 border-t border-[var(--border)]">
          
          {/* Xulosa raqamlari */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 bg-[var(--bg)] px-3.5 py-2 rounded-2xl border border-[var(--border)]">
              <span className="text-[var(--text3)] font-bold">O'tkazma miqdori:</span>
              <span className="text-base font-black text-purple-600 dark:text-purple-400 tabular-nums">
                {totalTransferQty} <span className="text-xs font-bold text-[var(--text3)]">juft</span>
              </span>
            </div>

            {transferBoxStats && transferBoxStats.fullBoxes > 0 && (
              <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 px-3 py-2 rounded-2xl text-purple-700 dark:text-purple-300 font-bold">
                <Box size={14} />
                <span>{transferBoxStats.fullBoxes} quti</span>
                {transferBoxStats.loosePairs > 0 && (
                  <span className="text-xs opacity-80">+{transferBoxStats.loosePairs} dona</span>
                )}
              </div>
            )}

            {totalTransferSaleValue > 0 && (
              <div className="hidden md:flex items-center gap-2 bg-[var(--bg)] px-3.5 py-2 rounded-2xl border border-[var(--border)] text-[var(--text3)]">
                <span>Qiymati:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  ~{formatCompact(totalTransferSaleValue)} UZS
                </span>
              </div>
            )}
          </div>

          {/* Amallar */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={clearForm}
              className="px-4 py-3 rounded-2xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer"
            >
              Tozalash
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || totalTransferQty === 0}
              className="px-6 py-3 rounded-2xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-md shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>O'tkazmani Tasdiqlash</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 5. O'TKAZMALAR TARIXI (HISTORY BENTO GRID & FILTRLAR) */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col gap-4">
        
        {/* Yuqori Panel: Sarlavha, Qidiruv va Tozalash */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-black text-[var(--text)] tracking-tight">
              O'tkazmalar Tarixi & Jurnali
            </h2>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-purple-600">
              {filteredGroups.length} ta partiya
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Qidiruv */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input 
                type="text" 
                placeholder="Model, sana yoki omborni qidiring..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500 transition-all font-medium"
              />
            </div>

            {currentUser?.rol === 'admin' && filteredGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                title="Barcha o'tkazmalar tarixini tozalash"
              >
                <Trash2 size={13} />
                <span>Tarixni tozalash</span>
              </button>
            )}
          </div>
        </div>

        {/* Yo'nalish bo'yicha filtrlar */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'Barcha Yo\'nalishlar' },
            { id: 'tepa-kotta', label: '🏔 Tepa ➔ 🏢 Kotta' },
            { id: 'kotta-tepa', label: '🏢 Kotta ➔ 🏔 Tepa' },
            { id: 'to-sort2', label: '➔ 🟡 2-Sortga' },
            { id: 'from-sort2', label: '🟡 2-Sortdan ➔' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setHistoryFilterDirection(f.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-xs",
                historyFilterDirection === f.id
                  ? "bg-purple-600 text-white font-black shadow-xs"
                  : "bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Guruhlangan O'tkazmalar Kartochkalari */}
        <div className="flex flex-col gap-2.5">
          {filteredGroups.length === 0 ? (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-10 text-center text-[var(--text3)]">
              <Archive className="w-10 h-10 mx-auto mb-2 opacity-30 text-purple-500" />
              <p className="text-sm font-bold text-[var(--text)]">O'tkazmalar topilmadi</p>
              <p className="text-xs text-[var(--text3)] mt-1">Filtrni tozalang yoki yangi o'tkazma amalga oshiring</p>
            </div>
          ) : (
            filteredGroups.map((g, gIdx) => {
              const isExpanded = expandedGroups[g.id];
              const fromMeta = WAREHOUSE_META[g.from as WarehouseName] || WAREHOUSE_META.tepa;
              const toMeta = WAREHOUSE_META[g.to as WarehouseName] || WAREHOUSE_META.kotta;

              return (
                <div 
                  key={`${g.id || 'otkazma'}_${gIdx}`}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3.5 sm:p-4 hover:border-purple-500/40 transition-all flex flex-col gap-3"
                >
                  {/* Karta Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    
                    {/* Yo'nalish va Model nomi */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase border",
                        fromMeta.bgClass, fromMeta.colorClass, fromMeta.borderClass
                      )}>
                        {fromMeta.badge}
                      </span>
                      <ArrowRight size={13} className="text-[var(--text3)] shrink-0" />
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase border",
                        toMeta.bgClass, toMeta.colorClass, toMeta.borderClass
                      )}>
                        {toMeta.badge}
                      </span>

                      <span className="text-sm font-black text-[var(--text)] ml-1">
                        {g.model}
                      </span>
                    </div>

                    {/* Jami juft, sana va ochish tugmasi */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="flex flex-col items-end text-right">
                        <span className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">
                          {g.jamiSoni} <span className="text-[10px] text-[var(--text3)] font-bold">juft</span>
                        </span>
                        <span className="text-[10px] text-[var(--text3)] font-semibold">
                          {g.vaqt || g.sana}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {currentUser?.rol === 'admin' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroupClick(g.id);
                            }}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                              deleteId === g.id 
                                ? "bg-rose-600 text-white shadow-xs font-black animate-pulse" 
                                : "bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)] hover:text-rose-500 hover:border-rose-500/30"
                            )}
                            title={deleteId === g.id ? "Tasdiqlash uchun yana bir marta bosing" : "O'tkazmani bekor qilish (qoldiqni qaytarish)"}
                          >
                            <Trash2 size={12} />
                            <span>{deleteId === g.id ? 'Tasdiqlang' : 'Bekor qilish'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="p-1.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
                          title="Tafsilotlarni ko'rish"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Izoh mavjud bo'lsa */}
                  {g.izoh && (
                    <p className="text-[11px] text-[var(--text3)] bg-[var(--bg2)] px-2.5 py-1 rounded-lg w-fit border border-[var(--border)]">
                      💬 {g.izoh}
                    </p>
                  )}

                  {/* O'lchamlar parchalanishi (Expanded yoki barcha o'lchamlar qatori) */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border)]/60">
                    {g.items.map((item: any, itmIdx: number) => (
                      <div
                        key={`${item.id || 'itm'}_${itmIdx}`}
                        className="inline-flex items-center gap-1 bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded-lg text-xs"
                      >
                        <span className="font-extrabold text-[var(--text3)]">{item.olcham}°:</span>
                        <span className="font-black text-purple-600 dark:text-purple-400 tabular-nums">
                          {item.soni} ta
                        </span>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 6. TOZALASHNI TASDIQLASH MODALI */}
      {/* ========================================================================= */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">O'tkazmalar Tarixini Tozalash</h3>
                <p className="text-xs text-[var(--text3)]">Omborlararo barcha o'tkazmalar jurnali</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium leading-relaxed">
              Diqqat! Barcha omborlararo o'tkazmalar jurnali to'liq o'chiriladi. Ombordagi joriy tovar qoldiqlari o'zgarishsiz saqlanadi.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleClearAllOtkazmaHistory}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tozalashni tasdiqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode / QR-Code Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScan}
        availableModels={allModels}
        title="O'tkazma Skaneri (Kamera)"
        description="Omborlararo ko'chirilayotgan tovar shtrix-kodi yoki QR-kodini skanerlang"
      />

      {/* Barcode & QR Label Generator Modal */}
      {generatorModel && (
        <BarcodeGeneratorModal
          isOpen={!!generatorModel}
          onClose={() => setGeneratorModel(null)}
          model={generatorModel}
          availableSizes={ALL_SIZES}
        />
      )}

    </div>
  );
}
