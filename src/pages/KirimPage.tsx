import { formatCompact, formatUzs, isCorrectionTx, cn, compareTxLatestFirst } from '../lib/utils';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { produce } from 'immer';
import { useDb } from '../context/DbContext';
import { useStock } from '../hooks/useStock';
import { ModelSelect, SizeInputs } from '../components/SharedComponents';
import { QuickSizeGrid } from '../components/QuickSizeGrid';
import { generateId, getNowStr, getTodayStr, ALL_SIZES } from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';
import { BarcodeScannerModal, ScanResult } from '../components/BarcodeScannerModal';
import { BarcodeGeneratorModal } from '../components/BarcodeGeneratorModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { 
  Trash2, 
  ShoppingCart, 
  X, 
  Edit2, 
  Search, 
  Save, 
  LayoutGrid, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Printer, 
  Share2, 
  FileText,
  Radio,
  RefreshCw,
  Zap,
  CheckCircle2,
  PackageCheck,
  Filter,
  ArrowUpDown,
  Calendar,
  Layers,
  DollarSign,
  Camera,
  QrCode,
  Barcode,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { ProductionSverkaModal } from '../components/ProductionSverkaModal';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { DbState, WarehouseName } from '../types';
import { 
  listenToProductionParties, 
  ProductionParty, 
  markPartyAsReceivedInProduction 
} from '../lib/productionIntegration';
import { 
  getUnpricedSalesStats, 
  syncUnpricedKirimTransactionsWithPrices,
  getUnpricedKirimModelGroups,
  batchApplyCostPricesToKirims,
  findModelPrice
} from '../lib/balanceUtils';
import { notifyKirimAlert } from '../services/telegramService';

type CartItem = { 
  id: string; 
  model: string; 
  costPrice?: number; 
  sizes: Record<string, number>;
  sort?: '1' | '2';
  ombor?: WarehouseName;
};

const copyTextToClipboard = async (text: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    console.warn("Clipboard API failed, trying fallback", err);
  }
  
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  } catch (err) {
    console.error('Fallback clipboard failed', err);
  }
};

export default function KirimPage() {
  const { db, currentOmbor, currentUser, setDb, saveTemplate, setCurrentOmbor } = useDb();
  const [sortType, setSortType] = useState<'1' | '2'>('1');
  const [sana, setSana] = useState(getTodayStr());
  const [model, setModel] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [kimdan, setKimdan] = useState('');
  const [izoh, setIzoh] = useState('');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isSyncingPastKirims, setIsSyncingPastKirims] = useState(false);

  const { stock } = useStock();
  const allModels = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(db.prices || {}),
      ...Object.keys(db.tepa?.stock || {}),
      ...Object.keys(db.kotta?.stock || {}),
      ...Object.keys(db.sort2?.stock || {}),
      ...(db.pendingKirim || []).map((p: any) => p.model),
      ...(db.tepa?.transactions || []).map((t: any) => t.model),
      ...(db.kotta?.transactions || []).map((t: any) => t.model),
      ...(db.sort2?.transactions || []).map((t: any) => t.model),
    ]);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [db.prices, db.tepa, db.kotta, db.sort2, db.pendingKirim]);

  // Barcode / QR Scanner & Generator Modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [generatorModel, setGeneratorModel] = useState<string | null>(null);

  // Handle incoming camera barcode scan in Kirim
  const handleBarcodeScan = useCallback((res: ScanResult) => {
    if (!res.model) return;
    setModel(res.model);
    setIsManualFormOpen(true);

    // Auto-fetch catalog cost price if available
    const catCost = db.prices?.[res.model]?.cost || 0;
    if (catCost > 0) {
      setCostPrice(catCost);
    }

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
      toast.info(`🔍 "${res.model}" modeli tanlandi. O'lchamlarni kiriting.`);
    }
  }, [db.prices]);

  // Global hardware laser scanner listener
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    availableModels: allModels,
    enabled: true
  });

  // Batch Kirim Pricing Modal states
  const [isKirimPriceModalOpen, setIsKirimPriceModalOpen] = useState(false);
  const [customKirimPrices, setCustomKirimPrices] = useState<Record<string, number | ''>>({});

  // Pending batches accordion state (default: closed/collapsed)
  const [isPendingSectionOpen, setIsPendingSectionOpen] = useState(false);

  // Received batches history accordion state (collapsible)
  const [isHistorySectionOpen, setIsHistorySectionOpen] = useState(true);

  const unpricedStats = useMemo(() => {
    return getUnpricedSalesStats(db);
  }, [db]);

  const unpricedKirimGroups = useMemo(() => {
    return getUnpricedKirimModelGroups(db);
  }, [db]);

  const openKirimPriceModal = (focusModel?: string) => {
    const initialPrices: Record<string, number | ''> = {};
    unpricedKirimGroups.forEach(g => {
      if (g.catalogCost > 0) {
        initialPrices[g.model] = g.catalogCost;
      } else if (g.suggestedCost > 0) {
        initialPrices[g.model] = g.suggestedCost;
      } else {
        initialPrices[g.model] = '';
      }
    });

    if (focusModel && !initialPrices[focusModel]) {
      const p = findModelPrice(db.prices, focusModel);
      initialPrices[focusModel] = p?.cost || '';
    }

    setCustomKirimPrices(initialPrices);
    setIsKirimPriceModalOpen(true);
  };

  const handleApplyBatchKirimPrices = () => {
    const pricesMap: Record<string, number> = {};
    let filledCount = 0;

    Object.entries(customKirimPrices).forEach(([m, p]) => {
      const val = Number(p || 0);
      if (val > 0) {
        pricesMap[m] = val;
        filledCount++;
      }
    });

    if (filledCount === 0) {
      toast.error("Iltimos, kamida bitta model uchun tan narx kiriting!");
      return;
    }

    setIsSyncingPastKirims(true);
    try {
      const { newDb, updatedKirimCount, updatedKirimQty, totalRecalculatedCost, impactedModelsCount } = batchApplyCostPricesToKirims(db, pricesMap, currentUser);
      
      setDb(newDb);
      toast.success(
        `Muvaffaqiyatli! ${impactedModelsCount} ta model bo'yicha ${updatedKirimCount} ta kirim tovariga (${updatedKirimQty} juft) jami +${formatUzs(totalRecalculatedCost)} so'm tan narx o'rnatildi va saqlandi!`,
        { duration: 7000 }
      );
      setIsKirimPriceModalOpen(false);
    } catch (err: any) {
      toast.error("Xatolik yuz berdi: " + (err?.message || err));
    } finally {
      setIsSyncingPastKirims(false);
    }
  };

  const handleSyncAllPastKirims = () => {
    setIsSyncingPastKirims(true);
    try {
      const { newDb, updatedKirimCount, updatedKirimQty, totalRecalculatedCost, impactedModelsCount } = syncUnpricedKirimTransactionsWithPrices(db, currentUser);
      if (updatedKirimCount === 0) {
        toast.info("Katalogdagi tan narxlar bo'yicha yangilanadigan kirim operatsiyalari topilmadi. Narx kiritish oynasini oching.", {
          action: {
            label: "Narx kiritish",
            onClick: () => openKirimPriceModal()
          }
        });
      } else {
        setDb(newDb);
        toast.success(
          `Avvalgi ${updatedKirimCount} ta kirim tovariga (${updatedKirimQty} juft) jami +${formatUzs(totalRecalculatedCost)} so'm tan narx avtomatik biriktirildi (${impactedModelsCount} ta model)!`,
          { duration: 6000 }
        );
      }
    } catch (err: any) {
      toast.error("Xatolik yuz berdi: " + (err?.message || err));
    } finally {
      setIsSyncingPastKirims(false);
    }
  };

  const handleClearAllKirimHistory = () => {
    if (currentUser?.rol !== 'admin') return;
    try {
      setDb(produce((draft: DbState) => {
        draft[currentOmbor].transactions = (draft[currentOmbor].transactions || []).filter(t => t.amal !== 'kirim');
        draft.bekorQilinganKirimlar = [];
        draft.pendingKirim = [];

        const log = createAuditLog(currentUser!, 'clear_kirim_history', 'Kirim', `${currentOmbor.toUpperCase()} omboridagi barcha kirim tarixi tozalandi`);
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(log);
      }));
      toast.success("Kirimlar tarixi muvaffaqiyatli tozalandi!");
      setIsClearAllModalOpen(false);
    } catch (e: any) {
      toast.error("Xatolik yuz berdi: " + e.message);
    }
  };

  const deleteGroupTx = (groupId: string) => {
    if (currentUser?.rol !== 'admin') return;

    try {
      const txsInGroup = (db[currentOmbor]?.transactions || []).filter(t => 
        t.amal === 'kirim' && 
        (t.groupId === groupId || (!t.groupId && `${t.sana}_${t.kimdan || t.izoh || ''}_${t.vaqt?.slice(0, 16) || ''}` === groupId))
      );

      if (txsInGroup.length === 0) return;

      let hasKamomad = false;
      txsInGroup.forEach(tx => {
        const curStock = db[currentOmbor]?.stock?.[tx.model]?.[tx.olcham] || 0;
        if (curStock < tx.soni) {
          hasKamomad = true;
        }
      });

      if (hasKamomad) {
        const proceed = window.confirm(
          "⚠️ DIQQAT: Ushbu partiyadagi ba'zi tovarlar allaqachon sotilgan yoki boshqa omborga o'tkazilgan.\n\n" +
          "Kirim bekor qilinsa, ombordagi qoldiq manfiy (kamomad) bo'lib qoladi.\n\n" +
          "Rostdan ham ushbu kirim guruhini bekor qilishni tasdiqlaysizmi?"
        );
        if (!proceed) return;
      }

      setDb(produce((draft: DbState) => {
        const draftTxsInGroup = draft[currentOmbor].transactions.filter(t => 
          t.amal === 'kirim' && 
          (t.groupId === groupId || (!t.groupId && `${t.sana}_${t.kimdan || t.izoh || ''}_${t.vaqt?.slice(0, 16) || ''}` === groupId))
        );

        if (draftTxsInGroup.length === 0) return;

        draftTxsInGroup.forEach(tx => {
          if (!draft[currentOmbor].stock[tx.model]) {
            draft[currentOmbor].stock[tx.model] = {};
          }
          draft[currentOmbor].stock[tx.model][tx.olcham] = (draft[currentOmbor].stock[tx.model][tx.olcham] || 0) - tx.soni;
          if (!draft.bekorQilinganKirimlar) draft.bekorQilinganKirimlar = [];
          draft.bekorQilinganKirimlar.push(tx);
        });

        const txIds = draftTxsInGroup.map(t => t.id);
        draft[currentOmbor].transactions = draft[currentOmbor].transactions.filter(t => !txIds.includes(t.id));

        if (!draft.auditLogs) draft.auditLogs = [];
        const log = createAuditLog(currentUser!, 'delete_kirim_group', 'Kirim', `Kirim bekor qilindi (guruh): ${draftTxsInGroup.length} ta xil tovar`);
        draft.auditLogs.push(log);
      }));
      toast.success("Kirim guruh bo'yicha bekor qilindi!");
    } catch (error) {
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx.sana || !editingTx.model || !editingTx.olcham || !editingTx.soni || !editingTx.kimdan) {
      toast.error("Barcha maydonlarni to'ldiring!");
      return;
    }
    const nSoni = Number(editingTx.soni);
    if (isNaN(nSoni) || nSoni <= 0) {
      toast.error("Soni noto'g'ri kiritildi!");
      return;
    }

    const nCost = Number(editingTx.costPrice) >= 0 && editingTx.costPrice !== '' 
      ? Number(editingTx.costPrice) 
      : (db.prices?.[editingTx.model]?.cost || 0);

    try {
      setDb(produce((draft: DbState) => {
        const txIndex = draft[currentOmbor].transactions.findIndex(t => t.id === editingTx.id);
        if (txIndex === -1) return;
        
        const oldTx = draft[currentOmbor].transactions[txIndex];
        const stock = draft[currentOmbor].stock;

        // 1. Revert old stock
        if (!stock[oldTx.model]) stock[oldTx.model] = {};
        stock[oldTx.model][oldTx.olcham] = (stock[oldTx.model][oldTx.olcham] || 0) - oldTx.soni;

        // 2. Apply new stock
        if (!stock[editingTx.model]) stock[editingTx.model] = {};
        stock[editingTx.model][editingTx.olcham] = (stock[editingTx.model][editingTx.olcham] || 0) + nSoni;

        // 3. Update tx
        oldTx.sana = editingTx.sana;
        oldTx.model = editingTx.model;
        oldTx.olcham = editingTx.olcham;
        oldTx.soni = nSoni;
        oldTx.kimdan = editingTx.kimdan;
        oldTx.izoh = editingTx.izoh;
        oldTx.summa = nSoni * nCost;

        // 4. Update price catalog if cost provided
        if (nCost > 0) {
          if (!draft.prices) draft.prices = {};
          if (!draft.prices[editingTx.model]) {
            draft.prices[editingTx.model] = {
              cost: nCost,
              sale: 0,
              history: [{
                date: editingTx.sana,
                cost: nCost,
                sale: 0,
                changedBy: `${currentUser?.ism || 'Admin'} (Kirim tahrirlandi)`
              }]
            };
          } else if (draft.prices[editingTx.model].cost !== nCost) {
            draft.prices[editingTx.model].cost = nCost;
            if (!draft.prices[editingTx.model].history) draft.prices[editingTx.model].history = [];
            draft.prices[editingTx.model].history.push({
              date: editingTx.sana,
              cost: nCost,
              sale: draft.prices[editingTx.model].sale || 0,
              changedBy: `${currentUser?.ism || 'Admin'} (Kirim tahrirlandi)`
            });
          }

          // Backfill other unpriced kirims of this model across all warehouses
          (['tepa', 'kotta'] as const).forEach(wKey => {
            if (!draft[wKey]?.transactions) return;
            draft[wKey].transactions.forEach(t => {
              if (t.amal === 'kirim' && t.model === editingTx.model && (!t.summa || t.summa === 0) && t.soni > 0) {
                t.summa = nCost * Number(t.soni || 0);
              }
            });
          });
        }

        if (!draft.auditLogs) draft.auditLogs = [];
        const log = createAuditLog(currentUser!, 'edit_kirim', 'Kirim', `Kirim tahrirlandi: ${editingTx.model} (${editingTx.olcham}° x ${nSoni} ta = ${(nSoni * nCost).toLocaleString()} so'm)`);
        draft.auditLogs.push(log);

        setEditingTx(null);
      }));
      toast.success("Kirim tahrirlandi!");
    } catch (error) {
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedPendingItemId, setSelectedPendingItemId] = useState<string | null>(null);
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const otherOmborKey = currentOmbor === 'tepa' ? 'kotta' : 'tepa';
  const otherOmborName = currentOmbor === 'tepa' ? 'Kotta ombor' : 'Tepa ombor';
  const otherOmborKirimCount = (db[otherOmborKey]?.transactions || []).filter(t => t.amal === 'kirim' && !isCorrectionTx(t)).length;

  const setQuickDate = (type: 'all' | 'today' | '7days' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (type === 'all') {
      setStartDate('');
    } else if (type === 'today') {
      setStartDate(todayStr);
    } else if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split('T')[0]);
    } else if (type === 'month') {
      const d = new Date();
      d.setDate(1);
      setStartDate(d.toISOString().split('T')[0]);
    }
  };

  // Production Realtime Database State
  const [prodParties, setProdParties] = useState<ProductionParty[]>([]);
  const [isProdSyncing, setIsProdSyncing] = useState<boolean>(true);
  const [prodSyncError, setProdSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  useEffect(() => {
    setIsProdSyncing(true);
    const unsubscribe = listenToProductionParties(
      (parties) => {
        setProdParties(parties);
        setIsProdSyncing(false);
        setProdSyncError(null);
        setLastSyncTime(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      },
      (err) => {
        console.warn('Realtime database connection error:', err);
        setProdSyncError(err.message || 'Ulanishda xatolik');
        setIsProdSyncing(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const [isSverkaOpen, setIsSverkaOpen] = useState(false);

  // All kirim transactions across warehouses for matching received batches
  const allKirimTransactions = useMemo(() => {
    const list: any[] = [];
    (['tepa', 'kotta', 'sort2'] as const).forEach(wKey => {
      (db[wKey]?.transactions || []).forEach(t => {
        if (t.amal === 'kirim') list.push(t);
      });
    });
    return list;
  }, [db.tepa, db.kotta, db.sort2]);

  // Combine Realtime Database incoming batches + Firestore local pending items
  const qabulQilinganSet = useMemo(() => new Set(db.qabulQilinganPartiyaIds || []), [db.qabulQilinganPartiyaIds]);

  const pendingItems = useMemo(() => {
    const list: {
      id: string;
      originalPartyId?: string;
      model: string;
      totalCount: number;
      date: string;
      sender?: string;
      status: 'pending';
      isRealtime: boolean;
      partiyaNomi?: string;
      sizes?: Record<string, number>;
      tannarx?: number;
      isContinuation?: boolean;
      alreadyReceived?: number;
      totalDelivered?: number;
    }[] = [];

    // 1. Production Realtime Database items
    prodParties.forEach((party) => {
      const pId = party.id || party.partiyaId || '';
      if (!pId) return;

      const stage = party.stages?.sotuv_ombori || party.stages?.ombor || party.stages?.sotuv;
      const modelName = party.model || party.modelNomi || party.partiyaNomi || party.nomi || 'Nomsiz model';
      const totalDelivered = Number(stage?.inQty || stage?.outQty || party.soni || party.jamiSoni || 0);
      if (totalDelivered <= 0) return;

      // Check how much has already been received in our warehouse
      const recordedHistory = db.partiyaQabulTarixi?.[pId]?.jamiQabul || 0;
      const txCount = allKirimTransactions.filter(t => {
        const izoh = (t.izoh || '').toLowerCase();
        const pIdLower = pId.toLowerCase();
        const partyNomiLower = (party.partiyaNomi || '').toLowerCase();
        return (
          izoh.includes(`partiya: ${pIdLower}`) ||
          izoh.includes(`partiya:${pIdLower}`) ||
          (pIdLower && izoh.includes(pIdLower)) ||
          (partyNomiLower && izoh.includes(partyNomiLower))
        );
      }).reduce((sum, t) => sum + Number(t.soni || 0), 0);

      const alreadyReceived = Math.max(recordedHistory, txCount);
      const remainingQty = totalDelivered - alreadyReceived;

      // If already fully received, don't show as pending
      if (remainingQty <= 0) return;

      const isContinuation = alreadyReceived > 0;
      const date = stage?.date || party.sana || party.createdDate || getTodayStr();
      const sender = stage?.workerName || stage?.sender || stage?.worker || 'Ishlab chiqarish (Pardoz/Tikuv)';
      const partySizes = party.sizes || party.olchamlar || stage?.sizes || stage?.olchamlar || (party as any).itemsSizes;
      const partyCost = Number(party.tannarx || party.tanNarxi || stage?.tannarx || stage?.cost || 0);

      list.push({
        id: `rtdb_${pId}`,
        originalPartyId: pId,
        model: modelName,
        totalCount: remainingQty, // The actual remaining amount waiting to be received!
        date,
        sender,
        status: 'pending',
        isRealtime: true,
        partiyaNomi: party.partiyaNomi || party.nomi || pId,
        sizes: partySizes && typeof partySizes === 'object' ? partySizes : undefined,
        tannarx: partyCost > 0 ? partyCost : undefined,
        isContinuation,
        alreadyReceived,
        totalDelivered
      });
    });

    // 2. Firestore local pending items
    (db.pendingKirim || []).forEach((item) => {
      if (item.status === 'pending') {
        const itemSizes = (item as any).sizes || (item as any).olchamlar;
        const itemCost = Number((item as any).costPrice || (item as any).tannarx || 0);
        list.push({
          id: item.id,
          originalPartyId: item.id,
          model: item.model,
          totalCount: item.totalCount,
          date: item.date,
          sender: item.sender || 'Mahalliy Kirim',
          status: 'pending',
          isRealtime: false,
          sizes: itemSizes && typeof itemSizes === 'object' ? itemSizes : undefined,
          tannarx: itemCost > 0 ? itemCost : undefined,
          isContinuation: false,
          alreadyReceived: 0,
          totalDelivered: item.totalCount
        });
      }
    });

    return list;
  }, [prodParties, db.partiyaQabulTarixi, allKirimTransactions, db.pendingKirim]);

  // Filters for Pending Batches
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingDateFilter, setPendingDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all');
  const [pendingSenderFilter, setPendingSenderFilter] = useState<string>('all');
  const [pendingSortBy, setPendingSortBy] = useState<'newest' | 'qty_desc' | 'qty_asc' | 'model_asc'>('newest');

  // Unique senders for dropdown
  const distinctSenders = useMemo(() => {
    const senders = new Set<string>();
    pendingItems.forEach(item => {
      if (item.sender) senders.add(item.sender);
    });
    return Array.from(senders);
  }, [pendingItems]);

  // Filtered & Sorted pending items
  const filteredPendingItems = useMemo(() => {
    const todayStr = getTodayStr();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    return pendingItems.filter(item => {
      // Search
      if (pendingSearch.trim()) {
        const q = pendingSearch.toLowerCase().trim();
        const matchesModel = item.model.toLowerCase().includes(q);
        const matchesSender = (item.sender || '').toLowerCase().includes(q);
        const matchesPartiya = (item.partiyaNomi || '').toLowerCase().includes(q);
        const matchesId = item.id.toLowerCase().includes(q);
        if (!matchesModel && !matchesSender && !matchesPartiya && !matchesId) return false;
      }

      // Date Filter
      if (pendingDateFilter === 'today') {
        if (item.date !== todayStr) return false;
      } else if (pendingDateFilter === 'yesterday') {
        if (item.date !== yesterdayStr) return false;
      } else if (pendingDateFilter === 'week') {
        if (item.date < sevenDaysAgoStr) return false;
      }

      // Sender Filter
      if (pendingSenderFilter !== 'all') {
        if (item.sender !== pendingSenderFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      if (pendingSortBy === 'qty_desc') return b.totalCount - a.totalCount;
      if (pendingSortBy === 'qty_asc') return a.totalCount - b.totalCount;
      if (pendingSortBy === 'model_asc') return a.model.localeCompare(b.model);
      // 'newest' (default)
      return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    });
  }, [pendingItems, pendingSearch, pendingDateFilter, pendingSenderFilter, pendingSortBy]);

  const totalFilteredPendingPairs = useMemo(() => {
    return filteredPendingItems.reduce((acc, it) => acc + it.totalCount, 0);
  }, [filteredPendingItems]);

  const totalAllPendingPairs = useMemo(() => {
    return pendingItems.reduce((acc, it) => acc + it.totalCount, 0);
  }, [pendingItems]);

  const selectedPendingItem = pendingItems.find(p => p.id === selectedPendingItemId);

  const handleSelectPendingItemForKirim = (item: (typeof pendingItems)[0]) => {
    if (selectedPendingItemId === item.id) {
      setSelectedPendingItemId(null);
      setModel('');
      setCostPrice('');
      setKimdan('');
      setIzoh('');
      setSizes({});
      setIsManualFormOpen(false);
      return;
    }

    setSelectedPendingItemId(item.id);
    setModel(item.model);

    const partyCost = Number(item.tannarx || 0);
    const catalogCost = Number(db.prices?.[item.model]?.cost || 0);
    if (partyCost > 0) {
      setCostPrice(partyCost);
    } else if (catalogCost > 0) {
      setCostPrice(catalogCost);
    } else {
      setCostPrice('');
    }

    setKimdan(item.sender || 'Pardoz sexi');
    if (item.isContinuation) {
      setIzoh(item.partiyaNomi 
        ? `Partiya: ${item.partiyaNomi} (Davomi: ${item.totalCount} juft)` 
        : `Partiya: ${item.originalPartyId || item.id} (Davomi: ${item.totalCount} juft)`);
    } else {
      setIzoh(item.partiyaNomi ? `Partiya: ${item.partiyaNomi}` : `Partiya: ${item.originalPartyId || item.id}`);
    }

    // Auto fill sizes if specified in party data
    if (item.sizes && typeof item.sizes === 'object') {
      const parsedSizes: Record<string, number> = {};
      let totalParsed = 0;
      Object.entries(item.sizes).forEach(([sz, val]) => {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
          parsedSizes[sz] = num;
          totalParsed += num;
        }
      });
      // If continuation and totalParsed exceeds current delta, let user distribute cleanly
      if (item.isContinuation && totalParsed > item.totalCount) {
        setSizes({});
      } else if (Object.keys(parsedSizes).length > 0) {
        setSizes(parsedSizes);
      } else {
        setSizes({});
      }
    } else {
      setSizes({});
    }

    setIsManualFormOpen(true);
    toast.info(item.isContinuation 
      ? `⚡ «${item.model}» partiyasining davomi (${item.totalCount} juft) tanlandi.` 
      : `«${item.model}» (${item.totalCount} juft) tanlandi. Yangi Kirim Hujjati ochildi.`);

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const handleSelectFromSverka = (party: ProductionParty, remainingQty: number, isContinuation: boolean) => {
    const pId = party.id || party.partiyaId || '';
    const pendingMatch = pendingItems.find(p => p.originalPartyId === pId || p.id === `rtdb_${pId}`);
    if (pendingMatch) {
      handleSelectPendingItemForKirim(pendingMatch);
    } else {
      setSelectedPendingItemId(`rtdb_${pId}`);
      const modelName = party.model || party.modelNomi || party.partiyaNomi || party.nomi || 'Nomsiz model';
      setModel(modelName);
      const stage = party.stages?.sotuv_ombori || party.stages?.ombor || party.stages?.sotuv;
      setKimdan(stage?.workerName || stage?.sender || 'Pardoz sexi');
      setIzoh(isContinuation 
        ? `Partiya: ${party.partiyaNomi || pId} (Davomi: ${remainingQty} juft)` 
        : `Partiya: ${party.partiyaNomi || pId}`);
      setCostPrice(party.tannarx || db.prices?.[modelName]?.cost || '');
      setSizes({});
      setIsManualFormOpen(true);
      toast.info(`«${modelName}» partiyasining ${remainingQty} juft qoldig'i kirim oynasiga yuklandi.`);
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  };

  const calculateTotalDistributed = () => {
    let total = 0;
    cart.forEach(item => {
      Object.values(item.sizes).forEach(qty => {
        total += (qty as number) || 0;
      });
    });
    Object.values(sizes).forEach(qty => {
      total += (qty as number) || 0;
    });
    return total;
  };

  const handleAddToCart = () => {
    if (!model) {
        toast.error('Model nomini tanlang!');
        return;
    }
    
    const sizeEntries = Object.entries(sizes).map(([sz, qty]) => [sz, Number(qty)] as [string, number]).filter(([, qty]) => qty > 0);
    if (sizeEntries.length === 0) {
        toast.error("Kamida bir o'lcham va soni kiriting!");
        return;
    }
    
    // Check for negative quantities
    if (Object.values(sizes).some(qty => Number(qty) < 0)) {
        toast.error("Soni manfiy bo'lishi mumkin emas!");
        return;
    }

    if (selectedPendingItem) {
      const currentDist = calculateTotalDistributed();
      if (currentDist > selectedPendingItem.totalCount) {
        return toast.error(`Xatolik: Siz kutilayotgan umumiy sondan (${selectedPendingItem.totalCount} ta) ko'proq taqsimlayapsiz! Taqsimlangan: ${currentDist} ta`);
      }
    }

    const numCostPrice = Number(costPrice) >= 0 && costPrice !== '' 
      ? Number(costPrice) 
      : (sortType === '2' ? 0 : (db.prices?.[model]?.cost || 0));

    const itemOmbor: WarehouseName = sortType === '2' ? 'sort2' : (currentOmbor === 'sort2' ? 'tepa' : currentOmbor);

    setCart([...cart, { 
      id: generateId(), 
      model, 
      costPrice: numCostPrice, 
      sizes: { ...sizes },
      sort: sortType,
      ombor: itemOmbor
    }]);
    setSizes({});
    if (!selectedPendingItem) {
      setModel('');
      setCostPrice('');
    }
    toast.success(`"${model}" (${sortType === '2' ? '2-sort' : '1-sort'}) savatga qo'shildi!`);
  };

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const handleSave = () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setTimeout(() => { isSavingRef.current = false; setIsSaving(false); }, 2000);

    if (cart.length === 0) {
        setIsSaving(false); isSavingRef.current = false;
        toast.error('Savat bo\'sh!');
        return;
    }
    if (!sana) {
        setIsSaving(false); isSavingRef.current = false;
        toast.error('Sanani kiriting!');
        return;
    }
    if (!kimdan) {
        setIsSaving(false); isSavingRef.current = false;
        toast.error('Kimdan/Manba maydonini to\'ldiring!');
        return;
    }

    if (selectedPendingItem) {
      const totalDist = calculateTotalDistributed() - Object.values(sizes).reduce((a,b)=>a+(b||0),0);
      if (totalDist !== selectedPendingItem.totalCount) {
        setIsSaving(false); isSavingRef.current = false;
        return toast.error(`Xatolik: Taqsimlangan (${totalDist}) umumiy kutilayotgan songa (${selectedPendingItem.totalCount}) teng emas!`);
      }
    }

    let totalSaved = 0;
    let totalSumma = 0;
    
    // Stable idempotency key based on cart and metadata
    const cartKey = JSON.stringify([...cart].sort((a,b) => a.id.localeCompare(b.id)));
    const txGroupId = `${kimdan}_${sana}_${cartKey}`;
    const txVaqt = getNowStr();

    try {
      setDb(produce((draft: DbState) => {
        // Idempotency check: prevent duplicate transactions
        if (draft[currentOmbor].transactions.some(t => t.groupId === txGroupId)) return;

        cart.forEach(item => {
          const targetOmbor: WarehouseName = item.ombor || (item.sort === '2' ? 'sort2' : currentOmbor);
          if (!draft[targetOmbor]) {
            draft[targetOmbor] = { stock: {}, transactions: [] };
          }
          const stock = draft[targetOmbor].stock;
          if (!stock[item.model]) stock[item.model] = {};

          const isItem2Sort = item.sort === '2' || targetOmbor === 'sort2';

          const unitCost = (item.costPrice !== undefined && item.costPrice > 0)
            ? item.costPrice
            : (isItem2Sort ? 0 : (draft.prices?.[item.model]?.cost || 0));

          // Auto-sync cost to price catalog ONLY for standard 1-sort goods
          if (!isItem2Sort && unitCost > 0) {
            if (!draft.prices) draft.prices = {};
            if (!draft.prices[item.model]) {
              draft.prices[item.model] = {
                cost: unitCost,
                sale: 0,
                history: [{
                  date: sana,
                  cost: unitCost,
                  sale: 0,
                  changedBy: `${currentUser?.ism || 'Xodim'} (Kirim hujjati)`
                }]
              };
            } else if (draft.prices[item.model].cost !== unitCost) {
              draft.prices[item.model].cost = unitCost;
              if (!draft.prices[item.model].history) draft.prices[item.model].history = [];
              draft.prices[item.model].history.push({
                date: sana,
                cost: unitCost,
                sale: draft.prices[item.model].sale || 0,
                changedBy: `${currentUser?.ism || 'Xodim'} (Kirim hujjati)`
              });
            }

            // Backfill past unpriced 1-sort kirims of this model across standard warehouses
            (['tepa', 'kotta'] as const).forEach(wKey => {
              if (!draft[wKey]?.transactions) return;
              draft[wKey].transactions.forEach(t => {
                if (t.amal === 'kirim' && t.sort !== '2' && t.model === item.model && (!t.summa || t.summa === 0) && t.soni > 0) {
                  t.summa = unitCost * Number(t.soni || 0);
                }
              });
            });
          }
          
          Object.entries(item.sizes).forEach(([sz, qty]) => {
            if ((qty as number) > 0) {
              stock[item.model][sz] = (stock[item.model][sz] || 0) + (qty as number);
              const newTxId = generateId();
              const summa = (qty as number) * unitCost;
              draft[targetOmbor].transactions.push({
                id: newTxId,
                vaqt: txVaqt,
                sana,
                amal: 'kirim',
                model: item.model,
                olcham: sz,
                soni: qty as number,
                kimdan,
                izoh,
                xodim: currentUser!.ism,
                summa,
                groupId: txGroupId,
                sort: isItem2Sort ? '2' : '1',
                ombor: targetOmbor
              });
              if (!draft.auditLogs) draft.auditLogs = [];
              const log = createAuditLog(
                currentUser!, 
                'kirim', 
                'Kirim', 
                `Kirim (${isItem2Sort ? '2-sort' : '1-sort'} -> ${targetOmbor.toUpperCase()}): ${item.model} (${sz}° x ${qty} ta = ${summa.toLocaleString()} so'm) | Kimdan: ${kimdan}`
              );
              draft.auditLogs.push(log);
              totalSaved += (qty as number);
              totalSumma += summa;
            }
          });
        });

        // Mark pending item as processed
        if (selectedPendingItem) {
          if (selectedPendingItem.isRealtime && selectedPendingItem.originalPartyId) {
            const pId = selectedPendingItem.originalPartyId;
            if (!draft.partiyaQabulTarixi) draft.partiyaQabulTarixi = {};
            const prevEntry = draft.partiyaQabulTarixi[pId] || { jamiQabul: 0, oxirgiSana: sana, kirimTarixi: [] };
            const newTotalAccepted = (prevEntry.jamiQabul || 0) + totalSaved;
            const targetOmborName: WarehouseName = cart[0]?.ombor || (cart[0]?.sort === '2' ? 'sort2' : currentOmbor);

            draft.partiyaQabulTarixi[pId] = {
              jamiQabul: newTotalAccepted,
              oxirgiSana: sana,
              oxirgiVaqt: txVaqt,
              kirimTarixi: [
                ...(prevEntry.kirimTarixi || []),
                {
                  sana,
                  vaqt: txVaqt,
                  soni: totalSaved,
                  ombor: targetOmborName,
                  xodim: currentUser?.ism || 'Omborchi'
                }
              ]
            };

            const expectedTotal = selectedPendingItem.totalDelivered || ((prevEntry.jamiQabul || 0) + selectedPendingItem.totalCount);

            if (newTotalAccepted >= expectedTotal) {
              if (!draft.qabulQilinganPartiyaIds) draft.qabulQilinganPartiyaIds = [];
              if (!draft.qabulQilinganPartiyaIds.includes(pId)) {
                draft.qabulQilinganPartiyaIds.push(pId);
              }
            } else {
              // Still has remaining pending pairs, ensure not blocked from future continuation deliveries!
              if (draft.qabulQilinganPartiyaIds) {
                draft.qabulQilinganPartiyaIds = draft.qabulQilinganPartiyaIds.filter(id => id !== pId);
              }
            }

            // Also notify RTDB in background with updated quantities
            markPartyAsReceivedInProduction(pId, { 
              worker: currentUser?.ism, 
              note: izoh,
              receivedQty: newTotalAccepted,
              totalExpectedQty: expectedTotal
            });
          } else if (draft.pendingKirim) {
            draft.pendingKirim = draft.pendingKirim.filter(p => p.id !== selectedPendingItemId);
          }
        }
      }));

      setReceiptData({
        kimdan,
        sana,
        cart: [...cart],
        totalQty: totalSaved,
        totalSumma
      });

      // Dispatch Telegram notification
      if (db.telegramConfig?.isEnabled) {
        const itemSummary = cart.map(c => {
          const szTotal = Object.values(c.sizes || {}).reduce((a, b) => a + Number(b || 0), 0);
          return `${c.model} (${szTotal} juft)`;
        }).join(', ');

        notifyKirimAlert(db, {
          manba: kimdan || undefined,
          totalQty: totalSaved,
          ombor: currentOmbor,
          xodim: currentUser?.ism || 'Omborchi',
          itemSummary,
          partyId: selectedPendingItem?.originalPartyId || undefined
        }, setDb).catch(console.warn);
      }

      toast.success(`✅ ${totalSaved} ta tovar (${formatUzs(totalSumma)} so'm) kirim qilindi`);
      clearForm();
      setIsSaving(false);
      isSavingRef.current = false;
    } catch (error) {
      setIsSaving(false);
      isSavingRef.current = false;
      toast.error("Xatolik yuz berdi: " + error);
    }
  };

  const [rejectId, setRejectId] = useState<string | null>(null);

  const clearForm = () => {
    setModel('');
    setCostPrice('');
    setKimdan('');
    setIzoh('');
    setSizes({});
    setCart([]);
    setSelectedPendingItemId(null);
    setIsManualFormOpen(false);
    setSortType('1');
  };

  const groupedCartItems = React.useMemo(() => {
    if (!receiptData) return [];
    const map = new Map<string, { model: string; sizes: Record<string, number>; totalQty: number; price: number; totalCost: number; is2Sort?: boolean }>();
    
    receiptData.cart.forEach((item: any) => {
      const is2Sort = item.sort === '2' || item.ombor === 'sort2';
      const displayName = is2Sort 
        ? (item.model.includes('(2-sort)') ? item.model : `${item.model} (2-sort)`) 
        : item.model;
      const groupKey = `${displayName}_${is2Sort ? '2' : '1'}`;

      const price = (item.costPrice !== undefined && item.costPrice > 0)
        ? item.costPrice
        : (is2Sort ? 0 : (db.prices?.[item.model]?.cost || 0));

      const existing = map.get(groupKey) || {
        model: displayName,
        sizes: {},
        totalQty: 0,
        price,
        totalCost: 0,
        is2Sort
      };
      
      Object.entries(item.sizes).forEach(([sz, qty]) => {
        if ((qty as number) > 0) {
          existing.sizes[sz] = (existing.sizes[sz] || 0) + (qty as number);
          existing.totalQty += (qty as number);
        }
      });

      existing.totalCost = existing.totalQty * price;
      map.set(groupKey, existing);
    });
    
    return Array.from(map.values());
  }, [receiptData, db.prices]);

  const prepareCloneForHtml2Canvas = (clonedDoc: Document) => {
    const images = clonedDoc.getElementsByTagName('img');
    for (let i = 0; i < images.length; i++) {
      images[i].crossOrigin = 'anonymous';
    }
    const receiptEl = clonedDoc.getElementById('print-receipt');
    if (receiptEl) {
      receiptEl.style.transform = 'none';
      receiptEl.style.position = 'static';
    }
  };

  const handleDownloadPDF = async () => {
    if (!receiptData) return;
    const toastId = toast.loading("Yuqori sifatli PDF tayyorlanmoqda...");
    const node = document.getElementById('print-receipt');
    if (!node) {
      toast.dismiss(toastId);
      toast.error("Chek hujjati topilmadi");
      return;
    }

    try {
      const imgData = await htmlToImage.toPng(node, { 
        pixelRatio: 3, 
        quality: 1.0, 
        backgroundColor: '#ffffff', 
        skipFonts: true,
        cacheBust: true,
        style: { 
          overflow: 'visible', 
          maxHeight: 'none',
          transform: 'none'
        } 
      });
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = 210;
      const pageHeight = 297;
      const marginX = 10;
      const marginY = 10;
      const contentWidth = pageWidth - (marginX * 2); // 190mm
      const contentHeight = (node.offsetHeight * contentWidth) / node.offsetWidth;
      
      if (contentHeight <= pageHeight - (marginY * 2)) {
        pdf.addImage(imgData, 'PNG', marginX, marginY, contentWidth, contentHeight, undefined, 'FAST');
      } else {
        let heightLeft = contentHeight;
        let positionY = marginY;
        let page = 1;
        
        while (heightLeft > 0) {
          if (page > 1) pdf.addPage();
          pdf.addImage(imgData, 'PNG', marginX, positionY, contentWidth, contentHeight, undefined, 'FAST');
          heightLeft -= (pageHeight - (marginY * 2));
          positionY -= (pageHeight - (marginY * 2));
          page++;
        }
      }

      const safeName = (receiptData.kimdan || 'Kirim').replace(/[^a-zA-Z0-9_\-]/g, '_');
      pdf.save(`Kirim_Yuk_Xati-${safeName}-${Date.now().toString().slice(-6)}.pdf`);
      
      toast.dismiss(toastId);
      toast.success("Yuqori sifatli PDF muvaffaqiyatli yuklab olindi!");
    } catch (e) {
      console.error("PDF generation error:", e);
      toast.dismiss(toastId);
      toast.error("PDF yaratishda xatolik yuz berdi");
    }
  };

  const showGroupReceipt = (g: any) => {
    setReceiptData({
      kimdan: g.kimdan,
      sana: g.sana + (g.vaqt ? ` ${g.vaqt}` : ''),
      cart: g.items.map((i: any) => ({
        model: i.model,
        sizes: { [i.olcham]: i.soni },
        totalQty: i.soni,
        totalSale: i.summa,
        costPrice: i.summa && i.soni ? Math.round(i.summa / i.soni) : undefined,
        sort: i.sort || (i.ombor === 'sort2' ? '2' : '1'),
        ombor: i.ombor
      })),
      totalQty: g.jamiSoni,
      totalSumma: g.jamiSumma
    });
  };

  const handleShare = async () => {
    if (!receiptData) return;
    const node = document.getElementById('print-receipt');
    if (!node) return;

    const toastId = toast.loading("Telegram / Ulashish tayyorlanmoqda...");

    let textMsg = `📋 YUK XATI (KIRIM)\n`;
    textMsg += `👤 Yuboruvchi: ${receiptData.kimdan}\n`;
    textMsg += `📅 Sana: ${receiptData.sana}\n\n`;
    textMsg += `📦 TOVARLAR:\n`;

    groupedCartItems.forEach((item, i) => {
      const sizeStr = Object.entries(item.sizes).map(([sz, q]) => `${sz}°:${q}ta`).join(' ');
      textMsg += `${i + 1}. ${item.model} — ${item.totalQty} juft (${sizeStr})\n`;
    });

    textMsg += `\n📊 Jami soni: ${receiptData.totalQty} juft\n`;
    if (receiptData.totalSumma) {
      textMsg += `💰 Jami summa: ${receiptData.totalSumma.toLocaleString()} so'm`;
    }

    try {
      const canvas = await htmlToImage.toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, style: { overflow: 'visible', maxHeight: 'none' } });

      canvas.toBlob(async (blob) => {
        toast.dismiss(toastId);
        if (!blob) {
          await copyTextToClipboard(textMsg);
          toast.success("Telegram uchun nakladnoy matni nusxalandi!");
          return;
        }

        const safeName = receiptData.kimdan.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const file = new File([blob], `YukXati-${safeName}-${receiptData.sana}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `Yuk Xati - ${receiptData.kimdan}`,
              text: textMsg,
              files: [file]
            });
            toast.success("Muvaffaqiyatli ulashildi!");
            return;
          } catch (shareErr) {
            // User cancelled share
          }
        }

        await copyTextToClipboard(textMsg);
        const link = document.createElement('a');
        link.download = `YukXati-${safeName}-${receiptData.sana}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast.success("Nakladnoy rasmi yuklab olindi va Telegram matni nusxalandi!");
      });
    } catch (e) {
      console.error("Share error:", e);
      toast.dismiss(toastId);
      await copyTextToClipboard(textMsg);
      toast.success("Telegram uchun nakladnoy matni nusxalandi!");
    }
  };

  const handleRejectPendingItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (rejectId !== id) {
      setRejectId(id);
      setTimeout(() => setRejectId(null), 3000);
      return;
    }
    
    const targetItem = pendingItems.find(p => p.id === id);

    setDb(produce((draft: DbState) => {
      if (targetItem?.isRealtime && targetItem.originalPartyId) {
        if (!draft.qabulQilinganPartiyaIds) draft.qabulQilinganPartiyaIds = [];
        draft.qabulQilinganPartiyaIds.push(targetItem.originalPartyId);
      } else if (draft.pendingKirim) {
        const item = draft.pendingKirim.find(p => p.id === id);
        if (item) item.status = 'rejected';
      }
    }));
    
    if (selectedPendingItemId === id) {
      setSelectedPendingItemId(null);
      setModel('');
      setKimdan('');
      setIzoh('');
      setSizes({});
    }
    setRejectId(null);
    toast.success("Kutilayotgan tovar ro'yxatdan olib tashlandi");
  };

  const groupedTxs = React.useMemo(() => {
    const groups: Record<string, any> = {};
    const txList = [...(db[currentOmbor]?.transactions || [])]
      .filter(t => t.amal === 'kirim' && !isCorrectionTx(t) && (!startDate || t.sana >= startDate));
    
    txList.forEach(t => {
      const kimdanVal = t.kimdan || t.izoh || '';
      const key = t.groupId || `${t.sana}_${kimdanVal}_${t.vaqt?.slice(0, 16) || ''}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          groupId: t.groupId,
          sana: t.sana,
          vaqt: t.vaqt,
          kimdan: kimdanVal,
          items: [],
          jamiSoni: 0,
          jamiSumma: 0
        };
      } else {
        if (t.sana && (!groups[key].sana || t.sana > groups[key].sana)) {
          groups[key].sana = t.sana;
        }
        if (t.vaqt && (!groups[key].vaqt || t.vaqt > groups[key].vaqt)) {
          groups[key].vaqt = t.vaqt;
        }
      }
      
      groups[key].items.push(t);
      groups[key].jamiSoni += Number(t.soni || 0);
      groups[key].jamiSumma += Number(t.summa || 0);
    });
    
    return Object.values(groups).sort(compareTxLatestFirst);
  }, [db, currentOmbor, startDate]);

  const filteredGroups = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return groupedTxs;
    return groupedTxs.filter(g => 
      String(g.kimdan || '').toLowerCase().includes(s) || 
      String(g.sana || '').includes(s) ||
      (g.items || []).some((t: any) => 
        String(t?.model || '').toLowerCase().includes(s) || 
        String(t?.olcham ?? '').toLowerCase().includes(s)
      )
    );
  }, [groupedTxs, search]);

  const displayedGroups = filteredGroups.slice(0, visibleCount);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({...prev, [id]: !prev[id]}));
  };

  const handleDeleteGroupClick = (groupId: string) => {
    if (deleteId === groupId) {
      deleteGroupTx(groupId);
      setDeleteId(null);
    } else {
      setDeleteId(groupId);
      setTimeout(() => setDeleteId(null), 3000);
    }
  };

  const cartTotalCost = cart.reduce((total, item) => {
    const totalPairs = Object.values(item.sizes).reduce((a, b) => (a as number) + (b as number), 0);
    const cost = (item.costPrice !== undefined && item.costPrice > 0) ? item.costPrice : (db.prices?.[item.model]?.cost || 0);
    return total + (totalPairs * cost);
  }, 0);

  const handleRemoveFromCart = (id: string) => { setCart(prev => prev.filter((c: any) => c.id !== id)); };

  const isFormVisible = isManualFormOpen || !!selectedPendingItemId || cart.length > 0;

  return (
    <div className={cn("flex flex-col gap-6", receiptData && "print:hidden")}>


      {/* Production Realtime Sync Bar & Pending Batches (Collapsible Accordion - Closed by default) */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col gap-3 transition-all">
        {/* Header with Title, Stats, Sync status and Expand/Collapse Toggle */}
        <div 
          onClick={() => setIsPendingSectionOpen(v => !v)}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors flex items-center justify-center font-bold shrink-0">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-black text-[var(--text)] tracking-tight group-hover:text-blue-500 transition-colors">
                  Sexdan Kutilayotgan Partiyalar
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-black border border-blue-500/20">
                  {pendingItems.length} ta partiya / {totalAllPendingPairs} juft
                </span>
                {!isPendingSectionOpen && pendingItems.length > 0 && (
                  <span className="text-[11px] font-semibold text-blue-500 hidden md:inline">
                    (Ko'rish uchun bosing)
                  </span>
                )}
              </div>
              {isPendingSectionOpen && (
                <p className="text-xs font-semibold text-[var(--text3)] mt-0.5 animate-in fade-in duration-200">
                  Ishlab chiqarish (Tikuv / Pardoz) bosqichidan tasdiqlangan va sotuv omboriga topshirilgan partiyalar
                </p>
              )}
            </div>
          </div>

          {/* Skaner Button, Sverka Button, Connection Status Badge & Toggle Button */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
            {/* Sex bilan Sverka (Reconciliation) button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSverkaOpen(true);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl shadow-xs shadow-amber-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs active:scale-95"
              title="Sex bilan to'liq taqqoslash va qoldiqlarni tekshirish (Sverka)"
            >
              <FileSpreadsheet size={15} />
              <span>Sex bilan Sverka</span>
            </button>

            {/* Camera Barcode / QR Scanner button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsScannerOpen(true);
              }}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs shadow-purple-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs active:scale-95"
              title="Kameradan shtrix-kod yoki QR-kod skanerlash"
            >
              <Camera size={15} />
              <span>Skaner</span>
            </button>

            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
              isProdSyncing 
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                : prodSyncError 
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isProdSyncing 
                  ? 'bg-amber-500 animate-ping' 
                  : prodSyncError 
                    ? 'bg-rose-500' 
                    : 'bg-emerald-500 animate-pulse'
              }`} />
              <span className="hidden sm:inline">
                {isProdSyncing 
                  ? 'Ulanmoqda...' 
                  : prodSyncError 
                    ? 'Ulanishda xato' 
                    : 'Sex ilovasi (Realtime)'}
              </span>
              <span className="sm:hidden">
                {isProdSyncing ? 'Ulanmoqda' : prodSyncError ? 'Xato' : 'Realtime'}
              </span>
              {lastSyncTime && !prodSyncError && (
                <span className="text-[10px] text-emerald-600/70 font-semibold ml-1">({lastSyncTime})</span>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPendingSectionOpen(v => !v);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--bg)] hover:bg-blue-500 hover:text-white border border-[var(--border)] text-xs font-bold text-[var(--text2)] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title={isPendingSectionOpen ? "Oynani berkitish" : "Oynani ochish"}
            >
              <span>{isPendingSectionOpen ? "Berkitish" : "Ochish"}</span>
              {isPendingSectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* Collapsible Content Body */}
        {isPendingSectionOpen && (
          <div className="flex flex-col gap-4 pt-3 border-t border-[var(--border)] animate-in fade-in zoom-in-95 duration-200">
            {/* Filter Controls Bar (Visible whenever there are items or active filters) */}
        {pendingItems.length > 0 && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
            {/* Left: Search input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="Model, partiya yoki sex xodimini qidirish..."
                className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl pl-9 pr-8 py-1.5 text-xs font-medium text-[var(--text)] placeholder-[var(--text3)] focus:outline-hidden focus:border-blue-500 transition-colors"
              />
              {pendingSearch && (
                <button
                  onClick={() => setPendingSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Middle: Date Quick Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap pb-1 md:pb-0">
              {[
                { key: 'all', label: 'Barchasi' },
                { key: 'today', label: 'Bugun' },
                { key: 'yesterday', label: 'Kecha' },
                { key: 'week', label: 'Oxirgi 7 kun' }
              ].map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setPendingDateFilter(btn.key as any)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap shrink-0 transition-all ${
                    pendingDateFilter === btn.key
                      ? 'bg-blue-500 text-white shadow-xs'
                      : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg3)] border border-[var(--border)]'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Right: Sender filter & Sorting */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {/* Sender Select */}
              {distinctSenders.length > 0 && (
                <select
                  value={pendingSenderFilter}
                  onChange={(e) => setPendingSenderFilter(e.target.value)}
                  aria-label="Jo'natuvchi bo'yicha saralash"
                  className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-[var(--text)] focus:outline-hidden focus:border-blue-500 transition-colors"
                >
                  <option value="all">Barcha sexlar</option>
                  {distinctSenders.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}

              {/* Sorting Select */}
              <div className="flex items-center gap-1 bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5">
                <ArrowUpDown size={13} className="text-[var(--text3)] shrink-0" />
                <select
                  value={pendingSortBy}
                  onChange={(e) => setPendingSortBy(e.target.value as any)}
                  aria-label="Tartiblash turi"
                  className="bg-transparent text-xs font-bold text-[var(--text)] focus:outline-hidden border-none p-0 cursor-pointer"
                >
                  <option value="newest">Eng yangilari</option>
                  <option value="qty_desc">Miqdor (Ko'pdan ozga)</option>
                  <option value="qty_asc">Miqdor (Ozdan ko'pga)</option>
                  <option value="model_asc">Model nomi (A-Z)</option>
                </select>
              </div>

              {/* Reset filter button if anything is applied */}
              {(pendingSearch || pendingDateFilter !== 'all' || pendingSenderFilter !== 'all' || pendingSortBy !== 'newest') && (
                <button
                  onClick={() => {
                    setPendingSearch('');
                    setPendingDateFilter('all');
                    setPendingSenderFilter('all');
                    setPendingSortBy('newest');
                  }}
                  className="p-1.5 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-bold transition-colors flex items-center gap-1"
                  title="Filtrlarni tozalash"
                >
                  <X size={14} />
                  <span className="hidden xl:inline">Tozalash</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter Summary Status */}
        {pendingItems.length > 0 && (
          <div className="flex items-center justify-between text-xs text-[var(--text3)] px-1 font-semibold">
            <span>
              Ko'rsatilmoqda: <b className="text-[var(--text)]">{filteredPendingItems.length}</b> / {pendingItems.length} ta partiya 
              (<b className="text-blue-500">{totalFilteredPendingPairs}</b> / {totalAllPendingPairs} juft)
            </span>
            {selectedPendingItemId && (
              <span className="text-blue-500 font-bold flex items-center gap-1">
                <CheckCircle2 size={13} /> 1 ta partiya tanlangan
              </span>
            )}
          </div>
        )}

        {/* Pending Items Grid */}
        {pendingItems.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] flex flex-col items-center justify-center gap-2">
            <PackageCheck size={28} className="text-emerald-500/60" />
            <p className="text-xs font-bold">Ayni paytda kutilayotgan yangi partiyalar yo'q.</p>
            <p className="text-[11px] font-medium text-[var(--text3)]">
              Sex ilovasida mahsulot "Sotuv omboriga" topshirilganda, bu yerda avtomatik real-vaqtda paydo bo'ladi.
            </p>
          </div>
        ) : filteredPendingItems.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] flex flex-col items-center justify-center gap-2">
            <Filter size={24} className="text-[var(--text3)]" />
            <p className="text-xs font-bold">Filtr bo'yicha hech qanday partiya topilmadi.</p>
            <button
              onClick={() => {
                setPendingSearch('');
                setPendingDateFilter('all');
                setPendingSenderFilter('all');
              }}
              className="text-xs font-bold text-blue-500 hover:underline mt-1"
            >
              Filtrlarni tozalash
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredPendingItems.map((item, pIdx) => {
              const isSelected = selectedPendingItemId === item.id;
              return (
                <div 
                  key={`${item.id || 'pending'}_${pIdx}`} 
                  onClick={() => handleSelectPendingItemForKirim(item)}
                  className={`group relative p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                    isSelected 
                      ? 'bg-blue-500/15 border-blue-500 ring-2 ring-blue-500/30 shadow-md' 
                      : 'bg-[var(--bg)] border-[var(--border)] hover:border-blue-500/50 hover:bg-[var(--bg3)] shadow-xs'
                  }`}
                >
                  <div>
                    {/* Action Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${
                          item.isRealtime 
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                            : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                        }`}>
                          <Radio size={10} className={item.isRealtime ? 'animate-pulse text-emerald-500' : ''} />
                          {item.isRealtime ? 'Realtime RTDB' : 'Mahalliy'}
                        </span>

                        {item.isContinuation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 animate-pulse">
                            <Sparkles size={10} /> Partiya davomi
                          </span>
                        )}
                      </div>

                      {currentUser?.rol === 'admin' && (
                        <button 
                          onClick={(e) => handleRejectPendingItem(e, item.id)}
                          className={`p-1 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold ${
                            rejectId === item.id 
                              ? 'bg-rose-500 text-white shadow-xs' 
                              : 'text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/10'
                          }`}
                          title="Ro'yxatdan chiqarish"
                        >
                          <X size={13} />
                          {rejectId === item.id && <span>O'chirish</span>}
                        </button>
                      )}
                    </div>

                    {/* Model & Sender Info */}
                    <h4 className="font-extrabold text-[14px] text-[var(--text)] mb-1 group-hover:text-blue-500 transition-colors">
                      {item.model}
                    </h4>
                    <p className="text-[11px] font-semibold text-[var(--text3)] truncate mb-2">
                      {item.sender || 'Pardoz / Tikuv sexi'}
                    </p>

                    {item.isContinuation && (
                      <div className="text-[10px] font-semibold text-[var(--text3)] mb-2 p-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)]">
                        Sexda jami: <b className="text-[var(--text)]">{item.totalDelivered} juft</b> | Avval olingan: <b className="text-emerald-500">{item.alreadyReceived} juft</b>
                      </div>
                    )}

                    {/* Footer Stats */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
                      <span className="text-[11px] font-medium text-[var(--text3)]">{item.date}</span>
                      <span className={`font-black px-2.5 py-1 rounded-xl ${
                        item.isContinuation
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                          : 'text-blue-600 dark:text-blue-400 bg-blue-500/10'
                      }`}>
                        {item.isContinuation ? `+${item.totalCount} juft kutilmoqda` : `${item.totalCount} juft`}
                      </span>
                    </div>
                  </div>

                  {/* Prominent Kirim Qilish Action Button */}
                  <div className="mt-3 pt-2.5 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPendingItemForKirim(item);
                      }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98 ${
                        isSelected
                          ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500/40'
                          : item.isContinuation
                            ? 'bg-amber-500/15 hover:bg-amber-500 text-amber-600 dark:text-amber-400 hover:text-white border border-amber-500/30'
                            : 'bg-blue-500/10 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-500/25'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>✓ Tanlangan (Oynaga o'tish)</span>
                        </>
                      ) : (
                        <>
                          {item.isContinuation ? <Sparkles size={13} /> : <ShoppingCart size={13} />}
                          <span>{item.isContinuation ? `Davomini qabul qilish (+${item.totalCount})` : 'Kirim qilish'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </div>
        )}
      </div>

      {/* Closed State Banner with "+ Yangi Kirim Yaratish (Qo'lda)" */}
      {!isFormVisible ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--active-soft)] text-[var(--active-color)] flex items-center justify-center shrink-0 font-black shadow-xs">
              <ShoppingCart size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                  Yangi Kirim Hujjati & Savat
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
                  Yopiq holatda
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] mt-1">
                {pendingItems.length > 0 
                  ? "Sexdan kutilayotgan partiyadagi «Kirim qilish» tugmasini bosing yoki mustaqil yangi kirim hujjati oching." 
                  : "Omborga yangi tovar yoki xomashyo kirim qilish uchun hujjat oching."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsManualFormOpen(true);
                setSelectedPendingItemId(null);
                setTimeout(() => {
                  formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>Yangi Kirim Yaratish (Qo'lda)</span>
            </button>
          </div>
        </div>
      ) : (
        <div ref={formRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Form (Left side 2 cols) */}
          <div className="lg:col-span-2 bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[var(--border)]">
              <div>
                <h2 className="text-xl font-black text-[var(--text)] flex items-center gap-2.5 tracking-tight">
                  <span className="w-9 h-9 rounded-xl bg-[var(--active-soft)] text-[var(--active-color)] flex items-center justify-center">
                    <ShoppingCart size={20} />
                  </span>
                  {selectedPendingItem ? 'Kutilayotgan tovarni taqsimlash' : 'Yangi Kirim Hujjati'}
                </h2>
                <p className="text-xs font-semibold text-[var(--text3)] mt-1">
                  {selectedPendingItem 
                    ? `«${selectedPendingItem.model}» partiyasini omborga qabul qilish va o'lchamlarga taqsimlash` 
                    : 'Omborga yangi ishlab chiqarilgan yoki xomashyo tovarlarini qabul qilish'}
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {cart.length > 0 && (
                  <span className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    Savatda: {cart.reduce((sum, item) => sum + Object.values(item.sizes).reduce((a, b) => (a as number) + (b as number), 0), 0)} juft
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (cart.length > 0) {
                      if (!window.confirm("Savatda hali saqlanmagan tovarlar mavjud. Oynani berkitishni tasdiqlaysizmi?")) return;
                    }
                    setIsManualFormOpen(false);
                    setSelectedPendingItemId(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[var(--bg)] hover:bg-rose-500/10 hover:text-rose-500 border border-[var(--border)] text-xs font-bold text-[var(--text3)] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Oynani berkitish"
                >
                  <X size={14} />
                  <span>Berkitish</span>
                </button>
              </div>
            </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Hujjat Sanasi</label>
              <input 
                type="date" 
                value={sana}
                onChange={e => setSana(e.target.value)}
                className="p-3 border border-[var(--border)] rounded-xl text-sm font-bold bg-[var(--bg)] text-[var(--text)] outline-none transition-all focus:border-[var(--active-color)] focus:ring-2 focus:ring-[var(--active-soft)]" 
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Kimdan / Manba <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                value={kimdan}
                onChange={e => setKimdan(e.target.value)}
                placeholder="Pardoz, Tikuv sex, Ishlab chiqarish..."
                className="p-3 border border-[var(--border)] rounded-xl text-sm font-semibold bg-[var(--bg)] text-[var(--text)] outline-none transition-all focus:border-[var(--active-color)] focus:ring-2 focus:ring-[var(--active-soft)] placeholder:text-[var(--text3)]" 
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Izoh</label>
              <input 
                type="text" 
                value={izoh}
                onChange={e => setIzoh(e.target.value)}
                placeholder="Partiya raqami yoki eslatma..."
                className="p-3 border border-[var(--border)] rounded-xl text-sm font-semibold bg-[var(--bg)] text-[var(--text)] outline-none transition-all focus:border-[var(--active-color)] focus:ring-2 focus:ring-[var(--active-soft)] placeholder:text-[var(--text3)]" 
              />
            </div>
          </div>

          <div className="pt-5 border-t border-[var(--border)] space-y-4">
            {/* Selected Pending Party Banner & Distribution Control */}
            {selectedPendingItem && (
              <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/30 p-4 sm:p-5 rounded-2xl flex flex-col gap-3.5 shadow-xs">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-blue-500/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      <Zap size={11} /> Sex Partiyasi
                    </span>
                    <span className="font-black text-[13px] text-[var(--text)]">
                      {selectedPendingItem.partiyaNomi || selectedPendingItem.id}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text3)]">
                      • {selectedPendingItem.sender}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPendingItemId(null);
                      setModel('');
                      setSizes({});
                    }}
                    className="self-start sm:self-auto text-xs text-rose-500 hover:bg-rose-500/10 px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center gap-1 cursor-pointer border border-transparent hover:border-rose-500/20"
                  >
                    <X size={14} />
                    <span>Partiyadan chiqish</span>
                  </button>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[var(--bg)]/90 p-3 rounded-xl border border-[var(--border)] shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Sexdagi Asl Nomi</span>
                    <span className="text-xs font-black text-[var(--text)] truncate block mt-0.5" title={selectedPendingItem.model}>
                      🏭 {selectedPendingItem.model}
                    </span>
                  </div>

                  <div className="bg-[var(--bg)]/90 p-3 rounded-xl border border-[var(--border)] shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Kutilayotgan Jami</span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 block mt-0.5">
                      📦 {selectedPendingItem.totalCount} juft
                    </span>
                  </div>

                  <div className="bg-[var(--bg)]/90 p-3 rounded-xl border border-[var(--border)] shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Taqsimlangan (Savat + Forma)</span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={`text-xs font-black ${
                        calculateTotalDistributed() === selectedPendingItem.totalCount
                          ? 'text-emerald-500'
                          : calculateTotalDistributed() > selectedPendingItem.totalCount
                            ? 'text-rose-500'
                            : 'text-amber-500'
                      }`}>
                        {calculateTotalDistributed()} / {selectedPendingItem.totalCount} juft
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text3)]">
                        {selectedPendingItem.totalCount - calculateTotalDistributed() > 0 
                          ? `(Qoldi: ${selectedPendingItem.totalCount - calculateTotalDistributed()})`
                          : selectedPendingItem.totalCount === calculateTotalDistributed()
                            ? '✓ To\'liq'
                            : `(+${calculateTotalDistributed() - selectedPendingItem.totalCount} ortiqcha)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[var(--bg)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      calculateTotalDistributed() === selectedPendingItem.totalCount 
                        ? 'bg-emerald-500' 
                        : calculateTotalDistributed() > selectedPendingItem.totalCount
                          ? 'bg-rose-500'
                          : 'bg-blue-500'
                    }`}
                    style={{ 
                      width: `${Math.min(100, Math.round((calculateTotalDistributed() / (selectedPendingItem.totalCount || 1)) * 100))}%` 
                    }}
                  />
                </div>
              </div>
            )}

            {/* 1-sort / 2-sort Selector Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-[var(--bg3)] border border-[var(--border2)] rounded-2xl shadow-xs">
              <div className="flex flex-col">
                <span className="text-xs font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-2">
                  <span>📦</span>
                  <span>Mahsulot Navi (Sort):</span>
                </span>
                <span className="text-[11px] text-[var(--text3)] font-medium mt-0.5">
                  {sortType === '1' 
                    ? "🟢 1-sort standart mahsulot (tannarx avtomatik katalogdan qo'yiladi)" 
                    : "🟡 2-sort nuqsonli/utsenka (alohida 2-Sort omboriga tushadi, maxsus tannarx yoziladi)"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSortType('1');
                    if (currentOmbor === 'sort2') {
                      setCurrentOmbor('tepa');
                    }
                    if (model) {
                      const catCost = db.prices?.[model]?.cost || 0;
                      setCostPrice(catCost > 0 ? catCost : '');
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer select-none",
                    sortType === '1'
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", sortType === '1' ? "bg-white" : "bg-emerald-500")}></span>
                  <span>1-sort (Standart)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSortType('2');
                    if (currentOmbor !== 'sort2') {
                      setCurrentOmbor('sort2');
                      toast.info("🟡 2-sort tanlandi: tovarlar 2-Sort omboriga qabul qilinadi");
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer select-none",
                    sortType === '2'
                      ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                      : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", sortType === '2' ? "bg-white animate-pulse" : "bg-amber-500")}></span>
                  <span>2-sort (Nuqsonli)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-extrabold text-[var(--text)] uppercase tracking-wide">Tovar Tanlash & O'lchamlar</h3>
              {model && (
                <span className="text-xs font-bold text-[var(--active-color)] bg-[var(--active-soft)] px-2.5 py-1 rounded-lg">
                  Tanlangan Model: {model} {sortType === '2' ? '(2-sort)' : ''}
                </span>
              )}
            </div>

            {/* Model Selector & Tan Narx Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
              {/* Model Selector (2 cols on large screen) */}
              <div className="lg:col-span-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
                    Model Nomi (Ombor Uchun) <span className="text-rose-500">*</span>
                  </label>
                  {selectedPendingItem && model !== selectedPendingItem.model && (
                    <button
                      type="button"
                      onClick={() => {
                        setModel(selectedPendingItem.model);
                        if (sortType === '1') {
                          const catCost = db.prices?.[selectedPendingItem.model]?.cost || 0;
                          setCostPrice(catCost > 0 ? catCost : '');
                        }
                      }}
                      className="text-[11px] font-bold text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={11} /> Sex nomini qaytarish ("{selectedPendingItem.model}")
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ModelSelect 
                      value={model} 
                      onChange={(newModel) => {
                        setModel(newModel);
                        if (sortType === '1') {
                          const catCost = db.prices?.[newModel]?.cost || 0;
                          if (catCost > 0) {
                            setCostPrice(catCost);
                          } else if (costPrice === '' || costPrice === 0) {
                            setCostPrice('');
                          }
                        }
                      }} 
                      options={allModels} 
                      placeholder="Ombordagi modelni tanlang yoki nomini tahrirlang..." 
                    />
                  </div>

                  {/* QR Label Generator button for current model */}
                  {model && (
                    <button
                      type="button"
                      onClick={() => setGeneratorModel(model)}
                      className="p-3 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text2)] border border-[var(--border)] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
                      title="Ushbu model uchun QR / Shtrix-kod yorliq chiqarish"
                    >
                      <QrCode size={16} className="text-purple-500" />
                      <span className="hidden sm:inline">Yorliq</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tan Narx Input (1 col) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
                    {sortType === '2' ? "2-Sort Tan Narxi" : "Tan Narxi (1 juft)"}
                  </label>
                  {sortType === '2' ? (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      2-sort maxsus narx
                    </span>
                  ) : model && db.prices?.[model]?.cost ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      Katalog: {formatCompact(db.prices[model].cost)}
                    </span>
                  ) : null}
                </div>

                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={sortType === '2' ? "2-sort arzonlashtirilgan narx..." : "Masalan: 120 000"}
                    className={cn(
                      "w-full px-3.5 py-2.5 bg-[var(--bg3)] border rounded-xl text-[var(--text)] font-extrabold text-sm outline-none transition-all pr-12 shadow-xs",
                      sortType === '2'
                        ? "border-amber-500/40 focus:border-amber-500 focus:ring-[3px] focus:ring-amber-500/20"
                        : "border-[var(--border2)] focus:border-[var(--active-color)] focus:ring-[3px] focus:ring-[var(--active-soft)]"
                    )}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text3)] pointer-events-none">
                    so'm
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Status / Mapping Feedback & Live Cost Calculator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold">
              <div className="flex items-center gap-2 flex-wrap">
                {model && (
                  <>
                    {allModels.includes(model) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                        <CheckCircle2 size={12} /> Omborda mavjud model (Mavjud zaxira: {Object.values(stock[model] || {}).reduce((a, b) => a + b, 0)} juft)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold">
                        ✨ Yangi model nomi sifatida yaratiladi
                      </span>
                    )}

                    {selectedPendingItem && model !== selectedPendingItem.model && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] font-bold">
                        🔄 Sexdagi «{selectedPendingItem.model}» ➔ Ombordagi «{model}»ga biriktirilmoqda
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Live Form Subtotal */}
              {Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0) > 0 && Number(costPrice) > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs font-black self-start sm:self-auto shadow-xs flex items-center gap-1.5">
                  <span>💰 Qiymat:</span>
                  <span>{Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0)} juft × {Number(costPrice).toLocaleString()} = {(Object.values(sizes).reduce((a, b) => a + (Number(b) || 0), 0) * Number(costPrice)).toLocaleString()} so'm</span>
                </div>
              )}
            </div>

            <div className="bg-[var(--bg)] p-4 sm:p-5 rounded-2xl border border-[var(--border)] shadow-xs">
              <QuickSizeGrid model={model} ombor={currentOmbor} value={sizes} onChange={setSizes} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[var(--border)] items-center justify-between">
            <button 
              onClick={handleAddToCart} 
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-extrabold cursor-pointer bg-[var(--active-color)] text-white hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md shadow-[var(--active-soft)]"
            >
              <ShoppingCart size={18} /> Savatga Qo'shish
            </button>
            <span className="text-xs font-medium text-[var(--text3)] italic">
              💡 Har bir modelni savatga to'plab, bitta yuk xati bilan kirim qilishingiz mumkin.
            </span>
          </div>
        </div>

        {/* Cart (Right side 1 col) */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex flex-col h-[600px] lg:sticky lg:top-6">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-[var(--border)] shrink-0">
            <div>
              <h2 className="text-base font-black text-[var(--text)] flex items-center gap-2">
                <ShoppingCart size={18} className="text-blue-500" /> Savat (Yuk Xati)
              </h2>
              <span className="text-[11px] font-semibold text-[var(--text3)]">Kirim qilinadigan tovarlar</span>
            </div>
            <span className="bg-blue-500/10 text-blue-500 text-xs px-2.5 py-1 rounded-lg font-black border border-blue-500/20">
              {cart.length} xil model
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--border)] rounded-2xl">
                <div className="w-12 h-12 rounded-2xl bg-[var(--bg)] flex items-center justify-center text-[var(--text3)] mb-3">
                  <ShoppingCart size={24} className="opacity-40" />
                </div>
                <span className="text-sm font-bold text-[var(--text)]">Savat bo'sh</span>
                <span className="text-xs text-[var(--text3)] mt-1 max-w-[200px]">Modellarni tanlab "Savatga qo'shish" tugmasini bosing</span>
              </div>
            ) : (
              cart.map((item, idx) => {
                const totalPairs = Object.values(item.sizes).reduce((a, b) => (a as number) + (b as number), 0);
                const itemUnitCost = (item.costPrice !== undefined && item.costPrice > 0)
                  ? item.costPrice
                  : (db.prices?.[item.model]?.cost || 0);
                return (
                  <div key={`${item.id || 'cart'}_${idx}`} className="bg-[var(--bg)] rounded-2xl p-4 relative group border border-[var(--border)] hover:border-blue-500/40 transition-all shadow-xs">
                    <button 
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="absolute top-3 right-3 text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                      title="O'chirish"
                    >
                      <X size={15} />
                    </button>
                    <div className="flex items-center gap-2 pr-7 flex-wrap">
                      <span className="font-extrabold text-[14px] text-[var(--text)]">{idx + 1}. {item.model}</span>
                      {item.sort === '2' ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black border border-amber-500/30">
                          🟡 2-sort
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/30">
                          🟢 1-sort
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {Object.entries(item.sizes).filter(([, q]) => (q as number) > 0).map(([sz, q]) => (
                        <span key={sz} className="text-[11px] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded-md text-[var(--text2)] font-bold">
                          {sz}°: <strong className="text-blue-500">{q as number}</strong>
                        </span>
                      ))}
                    </div>
                    <div className="text-right mt-3 pt-2.5 border-t border-[var(--border)] text-xs font-bold text-blue-500 flex justify-between items-center">
                      <span className="text-[var(--text3)] font-semibold text-[11px]">
                        {itemUnitCost > 0 ? `${(totalPairs * itemUnitCost).toLocaleString()} so'm (${formatCompact(itemUnitCost)}/d)` : "Tan narx belgilanmagan"}
                      </span>
                      <span className="bg-blue-500/10 px-2 py-0.5 rounded-md text-blue-500 font-black">{totalPairs} juft</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 p-3.5 bg-[var(--bg)] rounded-2xl border border-[var(--border)] space-y-2 shrink-0">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-[var(--text3)] uppercase tracking-wider text-[10px]">Jami Kirim Miqdori:</span>
              <span className="font-black text-sm text-[var(--text)]">
                {cart.reduce((sum, item) => sum + Object.values(item.sizes).reduce((a, b) => (a as number) + (b as number), 0), 0)} juft
              </span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-[var(--border)] pt-2">
              <span className="font-bold text-[var(--text3)] uppercase tracking-wider text-[10px]">Umumiy Qiymati:</span>
              <span className="font-black text-base text-emerald-500">
                {formatCompact(cartTotalCost)} so'm
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2 shrink-0">
            <button 
              onClick={handleSave} 
              disabled={cart.length === 0 || isSaving}
              className="w-full py-3.5 rounded-xl text-sm font-black cursor-pointer bg-blue-600 text-white hover:bg-blue-700 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 uppercase tracking-wide"
            >
              <Save size={16} /> Barchasini Kirim Qilish
            </button>
            <button 
              onClick={clearForm} 
              className="w-full py-2.5 rounded-xl text-xs font-bold cursor-pointer bg-[var(--bg)] text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 border border-[var(--border)] transition-colors"
            >
              Formani Tozalash
            </button>
          </div>
        </div>

        {/* Floating Mobile Sticky Cart Bar for Kirim */}
        {cart.length > 0 && (
          <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30 bg-[var(--bg2)]/95 backdrop-blur-md p-3.5 rounded-2xl border border-blue-500/40 shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black text-[var(--text)] block">
                  {cart.reduce((sum, item) => sum + Object.values(item.sizes).reduce((a, b) => (a as number) + (b as number), 0), 0)} juft • {cart.length} xil
                </span>
                <span className="text-[10px] text-[var(--text3)] font-semibold">
                  {kimdan ? kimdan : "Manba kiritilmagan"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Save size={14} />
              <span>Kirim qilish</span>
            </button>
          </div>
        )}
      </div>
      )}

      {/* Qabul qilingan partiyalar tarixi (Kirimlar ro'yxati) - Accordion */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col gap-3 transition-all">
        {/* Accordion Header */}
        <div 
          onClick={() => setIsHistorySectionOpen(v => !v)}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center font-bold shrink-0">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-black text-[var(--text)] tracking-tight group-hover:text-blue-600 transition-colors">
                  Qabul Qilingan Partiyalar Tarixi (Kirimlar Ro'yxati)
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-black border border-blue-500/20">
                  {displayedGroups.length} ta hujjat
                </span>
                {!isHistorySectionOpen && displayedGroups.length > 0 && (
                  <span className="text-[11px] font-semibold text-blue-600 hidden md:inline">
                    (Ko'rish uchun bosing)
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
                Omborga qabul qilingan barcha yuk xatlari va kirim partiyalari arxivi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openKirimPriceModal()}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Eski kirimlarga narxlarni kiritish va sinxronlash oynasi"
            >
              <DollarSign size={13} />
              <span className="hidden sm:inline">Eski kirimlarga narx qo'yish</span>
              {unpricedStats.unpricedKirimCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white text-[10px] font-black">
                  {unpricedStats.unpricedKirimCount}
                </span>
              )}
            </button>
            {unpricedStats.resolvableKirimCount > 0 && (
              <button
                type="button"
                onClick={handleSyncAllPastKirims}
                disabled={isSyncingPastKirims}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                title="Avvalgi narxsiz kirimlarga model narxlarini avtomatik biriktirish"
              >
                <RefreshCw size={13} className={isSyncingPastKirims ? "animate-spin" : ""} />
                <span className="hidden md:inline">Avto-biriktirish ({unpricedStats.resolvableKirimCount})</span>
              </button>
            )}
            {currentUser?.rol === 'admin' && displayedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                title="Barcha kirim tarixini tozalash"
              >
                <Trash2 size={13} />
                <span className="hidden lg:inline">Tarixni tozalash</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsHistorySectionOpen(v => !v)}
              className="px-3.5 py-1.5 rounded-xl bg-[var(--bg)] hover:bg-blue-600 hover:text-white border border-[var(--border)] text-xs font-bold text-[var(--text2)] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>{isHistorySectionOpen ? "Yig'ish" : "Ochish"}</span>
              {isHistorySectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* Collapsible Accordion Content */}
        {isHistorySectionOpen && (
          <div className="flex flex-col gap-3 pt-3 border-t border-[var(--border)] animate-in fade-in duration-200">
            {displayedGroups.length === 0 && otherOmborKirimCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                <span>
                  ℹ️ Hozirgi tanlangan omborda kirimlar yo'q, lekin <strong>{otherOmborName}</strong>da {otherOmborKirimCount} ta kirim amaliyoti mavjud.
                </span>
              </div>
            )}

            <div className="p-4 sm:p-5 border border-[var(--border)] rounded-2xl bg-[var(--bg)] flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text3)]">Filtr va qidiruv:</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="p-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm outline-none text-[var(--text)] w-full sm:w-auto"
                  />
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input 
                      type="text" 
                      placeholder="Qidirish..." 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-[var(--text3)]">Filtr:</span>
                <button
                  type="button"
                  onClick={() => setQuickDate('all')}
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    !startDate
                      ? 'bg-blue-500/15 text-blue-600 border-blue-500/30 font-bold'
                      : 'bg-[var(--bg2)] text-[var(--text3)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  Barcha kirimlar
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate('today')}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Bugun
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate('7days')}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Oxirgi 7 kun
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate('month')}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Shu oy
                </button>
              </div>
            </div>

            <div className="border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--bg)] shadow-xs">
              {/* DESKTOP TABLE VIEW - 100% untouched for desktop computers */}
              <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-[var(--bg)] text-[var(--text3)] text-[11px] uppercase tracking-wider sticky top-0 border-b border-[var(--border)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-6 py-4 font-semibold">Vaqt</th>
                <th className="px-6 py-4 font-semibold">Manba (Kimdan)</th>
                <th className="px-6 py-4 font-semibold text-right">Jami Soni</th>
                <th className="px-6 py-4 font-semibold text-right">Summa</th>
                <th className="px-6 py-4 font-semibold text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {displayedGroups.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-[var(--text3)] p-12 italic text-[13px] font-medium">{search ? "Hech narsa topilmadi" : "Kirim yo'q"}</td></tr>
              ) : displayedGroups.map((g, gIdx) => (
                <React.Fragment key={`${g.id || 'kirim_group'}_${gIdx}`}>
                  <tr className="hover:bg-[var(--bg)] transition-colors group cursor-pointer" onClick={() => toggleGroup(g.id)}>
                    <td className="px-6 py-4 text-xs text-[var(--text3)]">
                      <div className="font-bold text-[var(--text)] mb-0.5">{g.sana}</div>
                      <div className="text-[10px] font-medium">{g.vaqt && g.vaqt.length > 5 ? g.vaqt.slice(-5) : g.vaqt}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-[14px]">{g.kimdan}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-500 tabular-nums text-[15px]">+{g.jamiSoni}</td>
                    <td className="px-6 py-4 text-right font-medium text-[var(--text)] text-[13px] whitespace-nowrap">
                      {Number(g.jamiSumma || 0) > 0 ? (
                        <span title={`${formatUzs(g.jamiSumma || 0)} so\'m`}>{formatCompact(g.jamiSumma || 0)} so\'m</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openKirimPriceModal(); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold cursor-pointer transition-colors"
                          title="Eski kirimlarga narx qo'yish"
                        >
                          <DollarSign size={12} />
                          <span>Narxsiz (Narx qo'yish)</span>
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end items-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); showGroupReceipt(g); }}
                          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Yuk xati (Check) chiqarish"
                        >
                          <FileText size={14} />
                          <span>Yuk xati</span>
                        </button>
                        {currentUser?.rol === 'admin' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteGroupClick(g.id); }} 
                            className={deleteId === g.id ? "bg-rose-500 text-white border border-rose-500 cursor-pointer px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-colors" : "bg-[var(--bg)] border border-[var(--border)] cursor-pointer text-[var(--text3)] hover:text-rose-500 hover:border-rose-500/30 transition-colors p-1.5 rounded-lg opacity-0 group-hover:opacity-100"} 
                            title={deleteId === g.id ? "Tasdiqlash" : "O'chirish"}
                          >
                            {deleteId === g.id ? 'O\'chirish' : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                        <button className="text-[var(--text3)] p-1.5">
                          {expandedGroups[g.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {expandedGroups[g.id] && g.items.map((t: any, tIdx: number) => (
                    <tr key={`${t.id || ''}_${tIdx}`} className="bg-[var(--bg2)] border-t border-[var(--border)]/50 border-dashed">
                      <td colSpan={2} className="pl-12 py-3 text-[13px] font-medium text-[var(--text)] opacity-80 border-l-2 border-l-emerald-500/50">
                        {t.model} <span className="ml-2 bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px]">{t.olcham}°</span>
                        {t.izoh && <span className="ml-2 text-xs text-[var(--text3)] block mt-1">{t.izoh}</span>}
                      </td>
                      <td className="py-3 px-6 text-right tabular-nums text-[13px] font-semibold text-emerald-500/80">+{t.soni}</td>
                      <td className="py-3 px-6 text-right text-[12px] text-[var(--text3)]">
                        {Number(t.summa || 0) > 0 ? (
                          <span title={`${formatUzs(t.summa || 0)} so\'m`}>{formatCompact(t.summa || 0)} so\'m</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openKirimPriceModal(t.model); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 text-[11px] font-bold cursor-pointer transition-colors"
                            title="Ushbu modelga tan narx qo'yish"
                          >
                            <DollarSign size={11} />
                            <span>0 so'm (Narx qo'yish)</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right">
                          {currentUser?.rol === 'admin' && (
                            <button 
                              onClick={() => {
                                const unitPrice = t.summa && t.soni ? Math.round(t.summa / t.soni) : (findModelPrice(db.prices, t.model)?.cost || '');
                                setEditingTx({ ...t, costPrice: unitPrice });
                              }}
                              className="text-[var(--text3)] hover:text-blue-500 transition-colors p-1 rounded-md cursor-pointer"
                              title="Tahrirlash"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
              </div>

              {/* MOBILE CARDS VIEW - Purpose-built for phones (Zero horizontal scroll, touch-friendly) */}
              <div className="md:hidden p-3 space-y-3">
                {displayedGroups.length === 0 ? (
                  <div className="text-center text-[var(--text3)] p-8 italic text-xs font-medium">
                    {search ? "Hech narsa topilmadi" : "Kirim yo'q"}
                  </div>
                ) : (
                  displayedGroups.map((g, gIdx) => (
                    <div 
                      key={`${g.id || 'kirim_group'}_${gIdx}`} 
                      className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex flex-col gap-3 transition-all"
                    >
                      {/* Top: Sender & Total Count */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-sm text-[var(--text)]">
                            {g.kimdan || "Noma'lum manba"}
                          </div>
                          <div className="text-[11px] font-semibold text-[var(--text3)] mt-0.5">
                            📅 {g.sana} • {g.vaqt && g.vaqt.length > 5 ? g.vaqt.slice(-5) : g.vaqt}
                          </div>
                        </div>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl text-sm border border-emerald-500/20 tabular-nums shrink-0">
                          +{g.jamiSoni} juft
                        </span>
                      </div>

                      {/* Summa & Price Info */}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
                        <span className="text-[11px] font-bold text-[var(--text3)]">Summa:</span>
                        {Number(g.jamiSumma || 0) > 0 ? (
                          <span className="font-black text-[var(--text)] text-sm tabular-nums">
                            {formatCompact(g.jamiSumma || 0)} so'm
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openKirimPriceModal(); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold cursor-pointer"
                          >
                            <DollarSign size={12} />
                            <span>Narxsiz (Narx qo'yish)</span>
                          </button>
                        )}
                      </div>

                      {/* Action Buttons Row */}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => showGroupReceipt(g)}
                            className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-500/20 cursor-pointer"
                            title="Yuk xati chiqarish"
                          >
                            <FileText size={13} />
                            <span>Yuk xati</span>
                          </button>

                          {currentUser?.rol === 'admin' && (
                            <button 
                              type="button"
                              onClick={() => handleDeleteGroupClick(g.id)} 
                              className={deleteId === g.id ? "bg-rose-500 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-colors cursor-pointer" : "bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-rose-500 p-1.5 rounded-xl cursor-pointer"} 
                              title={deleteId === g.id ? "Tasdiqlash" : "O'chirish"}
                            >
                              {deleteId === g.id ? 'Tasdiqlash' : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>

                        <button 
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="px-3 py-1.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text2)] flex items-center gap-1 cursor-pointer"
                        >
                          <span>{expandedGroups[g.id] ? "Yopish" : `Tafsilot (${g.items?.length || 0})`}</span>
                          {expandedGroups[g.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {/* Expanded Models List on Mobile */}
                      {expandedGroups[g.id] && (
                        <div className="pt-2 border-t border-[var(--border)] space-y-2 animate-in fade-in duration-150">
                          {g.items.map((t: any, tIdx: number) => {
                            const unitPrice = t.summa && t.soni ? Math.round(t.summa / t.soni) : (findModelPrice(db.prices, t.model)?.cost || '');
                            return (
                              <div key={`${t.id || ''}_${tIdx}`} className="bg-[var(--bg)] p-2.5 rounded-xl border border-[var(--border)] flex items-center justify-between text-xs">
                                <div>
                                  <div className="font-extrabold text-[var(--text)]">
                                    {t.model} <span className="ml-1 bg-[var(--bg2)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[10px] font-bold">{t.olcham}°</span>
                                  </div>
                                  {t.izoh && <span className="text-[10px] text-[var(--text3)] block mt-0.5">{t.izoh}</span>}
                                </div>
                                <div className="text-right flex items-center gap-2">
                                  <div>
                                    <span className="font-black text-emerald-600 block">+{t.soni} juft</span>
                                    <span className="text-[10px] text-[var(--text3)]">
                                      {Number(t.summa || 0) > 0 ? `${formatCompact(t.summa)} so'm` : "0 so'm"}
                                    </span>
                                  </div>
                                  {currentUser?.rol === 'admin' && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTx({ ...t, costPrice: unitPrice })}
                                      className="text-[var(--text3)] hover:text-blue-500 p-1 rounded-md"
                                      title="Tahrirlash"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

          {filteredGroups.length > visibleCount && (
            <div className="p-4 flex justify-center border-t border-[var(--border)] bg-[var(--bg2)]">
               <button 
                 onClick={() => setVisibleCount(v => v + 50)} 
                 className="px-6 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] hover:text-blue-500 hover:border-blue-500 transition-colors shadow-sm cursor-pointer"
               >
                 Yana ko'rsatish ({filteredGroups.length - visibleCount} ta qoldi)
               </button>
            </div>
          )}
        </div>
      </div>
        )}
      </div>

      {editingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] rounded-2xl w-full max-w-md p-6 shadow-2xl border border-[var(--border)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--text)]">Kirimni tahrirlash</h3>
              <button onClick={() => setEditingTx(null)} className="text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)] p-1.5 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Sana</label>
                <input type="date" value={editingTx.sana} onChange={e => setEditingTx({...editingTx, sana: e.target.value})} className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Model</label>
                  <ModelSelect 
                    value={editingTx.model} 
                    onChange={v => {
                      const newCost = db.prices?.[v]?.cost || 0;
                      setEditingTx({
                        ...editingTx, 
                        model: v, 
                        costPrice: newCost > 0 ? newCost : editingTx.costPrice 
                      });
                    }} 
                    options={allModels} 
                    placeholder="Qidirish..." 
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">O'lcham</label>
                  <select value={editingTx.olcham} onChange={e => setEditingTx({...editingTx, olcham: e.target.value})} className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" required>
                    <option value="">Tanlang...</option>
                    {ALL_SIZES.map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Soni</label>
                  <input type="number" min="1" value={editingTx.soni} onChange={e => setEditingTx({...editingTx, soni: e.target.value})} className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Tan Narxi (so'm)</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="1000"
                    placeholder="0"
                    value={editingTx.costPrice || ''} 
                    onChange={e => setEditingTx({...editingTx, costPrice: e.target.value === '' ? '' : Number(e.target.value)})} 
                    className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] font-bold outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" 
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Mijoz / Manba</label>
                <input type="text" value={editingTx.kimdan} onChange={e => setEditingTx({...editingTx, kimdan: e.target.value})} className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Izoh</label>
                <input type="text" value={editingTx.izoh || ''} onChange={e => setEditingTx({...editingTx, izoh: e.target.value})} className="p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--active-color)] focus:ring-4 focus:ring-[var(--active-soft)] transition-all" />
              </div>

              {Number(editingTx.soni) > 0 && Number(editingTx.costPrice) > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 flex justify-between items-center">
                  <span>Jami qiymat:</span>
                  <span className="text-sm font-black">{(Number(editingTx.soni) * Number(editingTx.costPrice)).toLocaleString()} so'm</span>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button type="submit" className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 cursor-pointer">Saqlash</button>
                <button type="button" onClick={() => setEditingTx(null)} className="flex-1 py-3.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl text-[13px] font-semibold hover:bg-[var(--border)] transition-colors cursor-pointer">Bekor qilish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 print-receipt-modal print:fixed print:inset-0 print:bg-white print:p-0 print:m-0 print:z-[99999]">
          <div className="bg-white text-black p-0 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col h-[90vh] max-h-[92vh] min-h-0 relative print-modal-card print:shadow-none print:w-full print:max-w-none print:rounded-none print:h-auto print:block overflow-hidden">
            
            <div className="absolute top-4 right-4 print:hidden z-10">
              <button onClick={() => setReceiptData(null)} className="w-8 h-8 flex items-center justify-center bg-gray-100/80 hover:bg-gray-200 text-gray-600 rounded-full transition-colors cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto w-full p-4 sm:p-8 print:p-0 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
              <div id="print-receipt" className="bg-white mx-auto print:w-full p-2 sm:p-4 space-y-6 text-gray-900" style={{ maxWidth: '800px' }}>
                
                {/* 1. PROFESSIONAL DOCUMENT HEADER */}
                <div className="border-b-2 border-gray-900 pb-5">
                  <div className="flex justify-between items-start gap-4">
                    {/* Left: Organization & Warehouse Branding */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-750 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-black text-sm tracking-wider shadow-sm">
                          OP
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">OMBOR PRO TIZIMI</h2>
                          <p className="text-[11px] font-medium text-gray-500 mt-1">Poyabzal ishlab chiqarish va ombor boshqaruvi</p>
                        </div>
                      </div>
                      
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg text-xs font-bold text-gray-800 border border-gray-200">
                        <span className="text-gray-500 font-medium">🏢 Qabul ombori:</span>
                        <span className="uppercase font-black text-gray-900">{currentOmbor} OMBORI</span>
                      </div>
                    </div>

                    {/* Right: Document Type, Number & Date */}
                    <div className="text-right space-y-1">
                      <div className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-black uppercase tracking-wider mb-0.5">
                        Kirim Yuk Xati
                      </div>
                      <div className="text-xl font-black text-gray-900 tracking-tight">
                        № KR-{Date.now().toString().slice(-6)}
                      </div>
                      <div className="text-xs font-semibold text-gray-500">
                        Sana: <span className="text-gray-900 font-bold">{receiptData.sana}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. SENDER & RECEIVER INFO CARDS */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Sender info */}
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Yuboruvchi (Manba / Ta'minotchi)</span>
                    <div className="text-base font-black text-gray-900 leading-tight">{receiptData.kimdan}</div>
                    <div className="text-[11px] text-gray-600 font-medium">Hujjat turi: Tovar qabuli / Kirim hujjati</div>
                  </div>

                  {/* Receiver info */}
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1 text-right">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Qabul qiluvchi (Ombor)</span>
                    <div className="text-base font-black text-gray-900 leading-tight">{currentOmbor.toUpperCase()} OMBORI</div>
                    <div className="text-[11px] text-emerald-700 font-bold">Status: Omborga to'liq qabul qilindi</div>
                  </div>
                </div>

                {/* 3. PRODUCTS TABLE */}
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="p-3 w-8 text-center border-r border-gray-200">#</th>
                        <th className="p-3 border-r border-gray-200">Model nomi</th>
                        <th className="p-3 border-r border-gray-200">O'lchamlar taqsimoti</th>
                        <th className="p-3 text-right border-r border-gray-200 w-24">Miqdori</th>
                        <th className="p-3 text-right border-r border-gray-200 w-28">Tan Narxi</th>
                        <th className="p-3 text-right w-32">Jami Summa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-semibold bg-white">
                      {groupedCartItems.map((item, i) => {
                        const sizeDetails = Object.entries(item.sizes)
                          .filter(([, q]) => (q as number) > 0)
                          .map(([sz, q]) => `${sz}°: ${q}`)
                          .join(', ');
                        return (
                          <tr key={i} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                            <td className="p-3 text-center border-r border-gray-200 text-gray-400 font-bold">{i + 1}</td>
                            <td className="p-3 border-r border-gray-200 font-black text-gray-900">{item.model}</td>
                            <td className="p-3 border-r border-gray-200 font-mono text-[11px] text-gray-700">{sizeDetails}</td>
                            <td className="p-3 border-r border-gray-200 text-right font-black text-gray-900">{item.totalQty} juft</td>
                            <td className="p-3 border-r border-gray-200 text-right text-gray-700">
                              {item.price > 0 ? `${formatCompact(item.price)}` : '-'}
                            </td>
                            <td className="p-3 text-right font-black text-emerald-700">
                              {item.totalCost > 0 ? `${formatUzs(item.totalCost)} UZS` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 4. TOTALS & FINANCIAL SUMMARY */}
                <div className="flex justify-between items-end pt-2">
                  <div className="text-[11px] text-gray-500 space-y-0.5">
                    <p className="font-bold text-gray-700">Elektron kirim-qabul hujjati</p>
                    <p className="text-[10px] text-gray-400">OmborPro avtomatlashtirilgan boshqaruv tizimi</p>
                  </div>

                  <div className="w-80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-700 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200">
                      <span className="whitespace-nowrap uppercase text-gray-600 font-bold">Jami Miqdor:</span>
                      <span className="font-black text-gray-900 text-sm whitespace-nowrap">{receiptData.totalQty} juft</span>
                    </div>
                    {receiptData.totalSumma > 0 && (
                      <div className="flex items-center justify-between text-sm font-black text-gray-900 bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-200">
                        <span className="whitespace-nowrap uppercase text-xs text-emerald-900">Umumiy Qiymat:</span>
                        <span className="text-base font-black text-emerald-700 whitespace-nowrap">{formatUzs(receiptData.totalSumma)} UZS</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. SIGNATURES */}
                <div className="flex justify-between items-end border-t border-gray-300 pt-8 mt-6">
                  <div className="text-left w-52 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Topshirdi (Yuboruvchi):</span>
                    <div className="border-b border-gray-400 pb-5 pt-3"></div>
                    <span className="text-[10px] text-gray-400">Imzo / F.I.SH</span>
                  </div>
                  <div className="text-right w-52 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Qabul qildi (Omborchi):</span>
                    <div className="border-b border-gray-400 pb-5 pt-3"></div>
                    <span className="text-[10px] text-gray-400">Imzo / F.I.SH</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap sm:flex-nowrap gap-3 shrink-0 print:hidden rounded-b-2xl">
              <button onClick={handleDownloadPDF} className="flex-1 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 shadow-sm transition-all flex items-center justify-center gap-2">
                <FileText size={16} />
                PDF yuklab olish
              </button>
              <button onClick={handleShare} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                <Share2 size={16} />
                Telegram / Ulashish
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Kirim Tarixini Tozalash</h3>
                <p className="text-xs text-[var(--text3)]">{currentOmbor.toUpperCase()} ombori kirimlari</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium leading-relaxed">
              Diqqat! Ushbu ombordagi barcha kirim ro'yxatlari va kutilayotgan kirimlar tarixi to'liq o'chiriladi. Ombordagi joriy tovar qoldiqlari o'zgarishsiz saqlanadi.
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
                onClick={handleClearAllKirimHistory}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tozalashni tasdiqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Kirim Pricing & Price Synchronization Modal */}
      {isKirimPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Eski Kirimlarga Narx Qo'yish</h3>
                  <p className="text-xs text-[var(--text3)]">
                    {unpricedKirimGroups.length > 0 
                      ? `${unpricedKirimGroups.length} ta model bo'yicha narxsiz kirimlar mavjud`
                      : "Barcha kirimlarga tan narx belgilangan"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsKirimPriceModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--bg)] hover:bg-[var(--border)] text-[var(--text2)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Actions & Tips */}
            <div className="py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-[var(--text2)]">
                Modellar uchun <strong>1 juft tan narxini (so'm)</strong> kiriting. Saqlanganda barcha eski narxsiz kirimlarga avtomatik o'rnatiladi.
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated: Record<string, number | ''> = { ...customKirimPrices };
                  unpricedKirimGroups.forEach(g => {
                    const found = findModelPrice(db.prices, g.model);
                    if (found && found.cost > 0) {
                      updated[g.model] = found.cost;
                    } else if (g.catalogCost > 0) {
                      updated[g.model] = g.catalogCost;
                    } else if (g.suggestedCost > 0) {
                      updated[g.model] = g.suggestedCost;
                    }
                  });
                  setCustomKirimPrices(updated);
                  toast.success("Katalogdagi mavjud narxlar kiritildi!");
                }}
                className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 border border-blue-500/30 text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                <Zap size={13} />
                <span>Katalog narxlarini to'ldirish</span>
              </button>
            </div>

            {/* Model List Table */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {unpricedKirimGroups.length === 0 ? (
                <div className="p-10 text-center text-[var(--text3)] space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto opacity-80" />
                  <div className="font-bold text-sm text-[var(--text)]">Barcha kirimlarga narx to'liq qo'yilgan!</div>
                  <div className="text-xs">Omborda narxsiz qolgan kirim amaliyoti mavjud emas.</div>
                </div>
              ) : (
                unpricedKirimGroups.map((group) => {
                  const unitPrice = customKirimPrices[group.model] !== undefined ? customKirimPrices[group.model] : '';
                  const numUnitPrice = Number(unitPrice || 0);
                  const lineTotal = numUnitPrice * group.unpricedQty;

                  return (
                    <div 
                      key={group.model} 
                      className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] hover:border-amber-500/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-[var(--text)] truncate">{group.model}</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-bold">
                            {group.unpricedQty} juft ({group.unpricedCount} ta kirim)
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text3)] mt-1 flex items-center gap-2 flex-wrap">
                          {group.catalogCost > 0 ? (
                            <span className="text-emerald-600 font-semibold">Katalog tan narxi: {formatUzs(group.catalogCost)} so'm</span>
                          ) : (
                            <span className="text-amber-600">Katalogda tan narx yo'q</span>
                          )}
                          {group.catalogSale > 0 && (
                            <span className="text-gray-400">• Sotuv: {formatUzs(group.catalogSale)} so'm</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[var(--text3)] font-bold">1 juft:</span>
                            <div className="relative">
                              <input
                                type="number"
                                placeholder="Tan narx (UZS)"
                                value={unitPrice}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                  setCustomKirimPrices(prev => ({
                                    ...prev,
                                    [group.model]: val
                                  }));
                                }}
                                className="w-32 px-3 py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm font-bold text-right text-[var(--text)] outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                              />
                            </div>
                          </div>
                          {lineTotal > 0 && (
                            <span className="text-[11px] font-black text-emerald-600 mt-1">
                              Jami: +{formatUzs(lineTotal)} so'm
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer / Submit Bar */}
            <div className="pt-4 mt-3 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-[var(--text3)] text-center sm:text-left">
                {(() => {
                  let totalCalc = 0;
                  let filledCount = 0;
                  unpricedKirimGroups.forEach(g => {
                    const price = Number(customKirimPrices[g.model] || 0);
                    if (price > 0) {
                      totalCalc += price * g.unpricedQty;
                      filledCount++;
                    }
                  });
                  return (
                    <span>
                      To'ldirildi: <strong className="text-[var(--text)]">{filledCount} / {unpricedKirimGroups.length} ta model</strong>
                      {totalCalc > 0 && (
                        <span className="ml-2 text-emerald-600 font-bold">• Jami qiymat: +{formatUzs(totalCalc)} so'm</span>
                      )}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsKirimPriceModalOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
                >
                  Yopish
                </button>
                <button
                  type="button"
                  onClick={handleApplyBatchKirimPrices}
                  disabled={isSyncingPastKirims || unpricedKirimGroups.length === 0}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Save size={15} />
                  <span>{isSyncingPastKirims ? "Saqlanmoqda..." : "Narxlarni Qo'yish & Saqlash"}</span>
                </button>
              </div>
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
        title="Kirim Skaneri (Kamera)"
        description="Poyabzal qutilaridagi shtrix-kod yoki QR-kodni skanerlang"
      />

      {/* Barcode & QR Label Generator Modal */}
      {generatorModel && (
        <BarcodeGeneratorModal
          isOpen={!!generatorModel}
          onClose={() => setGeneratorModel(null)}
          model={generatorModel}
          price={db.prices?.[generatorModel]?.cost || 0}
          availableSizes={ALL_SIZES}
        />
      )}

      {/* Production Reconciliation & Sverka Modal */}
      <ProductionSverkaModal
        isOpen={isSverkaOpen}
        onClose={() => setIsSverkaOpen(false)}
        prodParties={prodParties}
        db={db}
        onSelectForKirim={handleSelectFromSverka}
      />
    </div>
  );
}
