import { formatCompact, formatUzs, cn, isCorrectionTx, compareTxLatestFirst } from '../lib/utils';
import { usePrint } from '../hooks/usePrint';
import React, { useState, useRef, useMemo, useCallback } from 'react';
import { produce } from 'immer';
import { useDb } from '../context/DbContext';
import { useStock } from '../hooks/useStock';
import { DbState, WarehouseName, Kontragent, KassaHarakati, KassaTuri } from '../types';
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
  Download, 
  Share2, 
  Save, 
  LayoutGrid, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  User, 
  Calendar, 
  AlertCircle, 
  Check, 
  ArrowRight, 
  ShieldAlert, 
  Sparkles, 
  Users, 
  RefreshCw, 
  Tag,
  Plus,
  Minus,
  Printer,
  Receipt,
  UserPlus,
  Phone,
  ArrowUpRight,
  TrendingUp,
  PackageCheck,
  CheckCircle2,
  Clock,
  Layers,
  Percent,
  SlidersHorizontal,
  ChevronRight,
  RotateCcw,
  Camera,
  QrCode,
  Barcode,
  Wallet
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { toast } from 'sonner';
import { notifyBigSaleAlert, notifyLowStockAlert } from '../services/telegramService';
import { ClientReassignModal } from '../components/ClientReassignModal';
import { recalculateAllClientBalances } from '../lib/balanceUtils';
import { generateA4InvoicePdf, generateThermalReceiptPdf } from '../lib/invoicePdf';
import { ClientSearchSelect } from '../components/ClientSearchSelect';

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

const ALL_WAREHOUSES: WarehouseName[] = ['tepa', 'kotta', 'sort2'];

type CartItem = {
  id: string;
  model: string;
  sizes: Record<string, number>;
  ombor?: WarehouseName;
  is2Sort?: boolean;
  price?: number;
};

export type EditableGroupItem = {
  id: string;
  model: string;
  ombor: WarehouseName;
  is2Sort: boolean;
  price: number;
  sizes: Record<string, number>;
  totalQty: number;
  totalSumma: number;
  originalSizes: Record<string, number>;
};

export default function ChiqimPage() {
  const { db, currentOmbor, currentUser, setDb, saveTemplate, flushSaveToFirestore, atomicCheckout, pullLatestFromCloud } = useDb();
  const isOmborchi = currentUser?.rol === 'omborchi';
  const { print: printReceipt, isPrinting: isReceiptPrinting } = usePrint();
  const [selectedOmbor, setSelectedOmbor] = useState<WarehouseName>(currentOmbor);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [historyOmborScope, setHistoryOmborScope] = useState<'current' | 'all'>('current');
  const [isCloudRefreshing, setIsCloudRefreshing] = useState(false);

  React.useEffect(() => {
    setSelectedOmbor(currentOmbor);
  }, [currentOmbor]);

  const activeStock = db[selectedOmbor]?.stock || {};
  const [showAllModels, setShowAllModels] = useState(false);
  
  // In-stock models for selection in selected warehouse, excluding archived ones by default
  const inStockModels = useMemo(() => {
    const archived = db.archivedModels || [];
    return Object.keys(activeStock)
      .filter(m => Boolean(m) && !archived.includes(m))
      .filter(m => {
        const stockObj = activeStock[m] || {};
        return Object.values(stockObj).reduce((a, b) => a + Number(b || 0), 0) > 0;
      })
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [activeStock, db.archivedModels]);

  // Models list for POS selection
  const allModels = useMemo(() => {
    if (!showAllModels) {
      return inStockModels;
    }
    const set = new Set([
      ...Object.keys(activeStock),
      ...Object.keys(db.prices || {}),
      ...(db[selectedOmbor]?.transactions || []).map(t => t?.model).filter(Boolean)
    ]);
    return Array.from(set).filter(Boolean).map(m => String(m)).sort((a, b) => a.localeCompare(b));
  }, [activeStock, db.prices, db[selectedOmbor]?.transactions, showAllModels, inStockModels]);

  // Hot / Top models currently in stock for rapid POS selection
  const hotModels = useMemo(() => {
    const archived = db.archivedModels || [];
    return inStockModels
      .filter(m => !archived.includes(m))
      .map(m => {
        const stockObj = activeStock[m] || {};
        const total = Object.values(stockObj).reduce((a, b) => a + Number(b || 0), 0);
        const price = db.prices?.[m]?.sale || 0;
        return { model: m, total, price };
      })
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [inStockModels, activeStock, db.prices, db.archivedModels]);

  const [sana, setSana] = useState(getTodayStr());
  const [model, setModel] = useState('');
  const [kimga, setKimga] = useState('');
  const [izoh, setIzoh] = useState('');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Barcode / QR Scanner & Generator Modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [generatorModel, setGeneratorModel] = useState<string | null>(null);

  // Handle incoming camera barcode scan in Chiqim
  const handleBarcodeScan = useCallback((res: ScanResult) => {
    if (!res.model) return;
    setModel(res.model);
    setModelSearchQuery(res.model);
    setIsModelDropdownOpen(false);

    // Auto-fetch catalog sale price if available
    const catSale = db.prices?.[res.model]?.sale || 0;
    if (catSale > 0) {
      setCustomPrice(String(catSale));
    }

    // If QR code contained a full box/series of sizes
    if (res.sizesObject && Object.keys(res.sizesObject).length > 0) {
      setSizes(prev => ({
        ...prev,
        ...res.sizesObject
      }));
      toast.success(`📦 "${res.model}" seriya o'lchamlari savatga yuklandi!`);
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

  // Quick Client Creation Modal State inside POS
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientCategory, setNewClientCategory] = useState<'Ulgurji' | 'Chakana'>('Ulgurji');

  // Edit group state (Full invoice editing with products, stock diff, and payments)
  const [editingGroup, setEditingGroup] = useState<{
    id: string;
    groupId?: string;
    sana: string;
    vaqt?: string;
    kimga: string;
    xodim: string;
    izoh: string;
    items: any[];
    editableItems: EditableGroupItem[];
    jamiSoni: number;
    jamiSumma: number;
    enablePayment: boolean;
    paymentAmount: string;
    paymentSana: string;
    paymentKassaTuri: KassaTuri;
    paymentIzoh: string;
    existingPayments: KassaHarakati[];
    deletedPaymentIds: string[];
  } | null>(null);

  // States for editing an existing payment inside invoice edit modal
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentData, setEditingPaymentData] = useState<{
    summa: string;
    kassaTuri: KassaTuri;
    sana: string;
    izoh: string;
  } | null>(null);

  // Sub-panel state for adding an omitted/forgotten product inside invoice edit modal
  const [editAddOpen, setEditAddOpen] = useState(false);
  const [editAddModel, setEditAddModel] = useState('');
  const [editAddOmbor, setEditAddOmbor] = useState<WarehouseName>(currentOmbor);
  const [editAddIs2Sort, setEditAddIs2Sort] = useState(false);
  const [editAddPrice, setEditAddPrice] = useState('');
  const [editAddSizes, setEditAddSizes] = useState<Record<string, number>>({});

  // Quick Standalone Payment Modal from history list
  const [quickPaymentGroup, setQuickPaymentGroup] = useState<{
    group: any;
    sana: string;
    amount: string;
    kassaTuri: KassaTuri;
    izoh: string;
    existingPayments: KassaHarakati[];
  } | null>(null);

  const [templateName, setTemplateName] = useState('');
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);

  // Receipt Modal State
  const [receiptData, setReceiptData] = useState<{
    sana: string;
    kimga: string;
    cart: CartItem[];
    totalQty: number;
    totals: { sale: number; profit: number };
    discount?: number;
    originalSale?: number;
    oldBalance?: number;
    shipmentTotal?: number;
    totalDue?: number;
    paidAmount?: number;
    remainingDebt?: number;
    paymentMethod?: string;
  } | null>(null);
  const [receiptViewMode, setReceiptViewMode] = useState<'standard' | 'thermal'>('standard');

  // Discount & Final Agreed Total State
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [customFinalTotalInput, setCustomFinalTotalInput] = useState<string>('');

  // Payment Collection State (Mijozdan to'lov qabul qilish)
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [paymentKassaTuri, setPaymentKassaTuri] = useState<'naqd_uzs' | 'karta_uzs' | 'bank_uzs'>('naqd_uzs');

  // Fast series filler state
  const [customSeriesInput, setCustomSeriesInput] = useState<string>('');

  // History & Filters
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Model size inputs handling
  const existingSizes = model && activeStock[model] ? Object.keys(activeStock[model]) : [];
  const availableSizesList = useMemo(() => {
    return Array.from(new Set([...ALL_SIZES, ...existingSizes])).sort((a, b) => parseInt(a) - parseInt(b));
  }, [existingSizes]);

  // Clients sorted alphabetically A-Z for all dropdown selects
  const sortedKontragentlar = useMemo(() => {
    return [...(db.kontragentlar || [])].sort((a, b) => 
      String(a?.ism || '').localeCompare(String(b?.ism || ''), 'uz', { sensitivity: 'base' })
    );
  }, [db.kontragentlar]);

  // Current model price
  const activeCatalogSalePrice = model ? (db.prices?.[model]?.sale || 0) : 0;
  const effectivePrice = selectedOmbor === 'sort2' 
    ? (customPrice.trim() ? Number(customPrice) : activeCatalogSalePrice)
    : (customPrice.trim() ? Number(customPrice) : activeCatalogSalePrice);

  // Total quantity selected in current inputs
  const currentInputQty = useMemo(() => {
    return Object.values(sizes).reduce((acc, qty) => acc + Number(qty || 0), 0);
  }, [sizes]);

  // Quick series fillers
  const handleFillSeries = (amountPerSize: number) => {
    if (!model) {
      toast.info("Avval modelni tanlang!");
      return;
    }
    const newSizes: Record<string, number> = {};
    availableSizesList.forEach(sz => {
      newSizes[sz] = amountPerSize;
    });
    setSizes(newSizes);
    toast.success(`Har bir o'lchamga ${amountPerSize} tadan kiritildi`);
  };

  const handleFillMaxAvailable = () => {
    if (!model) {
      toast.info("Avval modelni tanlang!");
      return;
    }
    const modelStock = activeStock[model] || {};
    const newSizes: Record<string, number> = {};
    let totalAdded = 0;
    availableSizesList.forEach(sz => {
      const avail = modelStock[sz] || 0;
      if (avail > 0) {
        newSizes[sz] = avail;
        totalAdded += avail;
      }
    });
    if (totalAdded === 0) {
      toast.warning("Ushbu model bo'yicha omborda qoldiq yo'q!");
      return;
    }
    setSizes(newSizes);
    toast.success(`Mavjud qoldiq to'liq olindi (${totalAdded} juft)`);
  };

  const handleClearSizes = () => {
    setSizes({});
  };

  const handleSizeQtyChange = (sz: string, valStr: string) => {
    const val = parseInt(valStr) || 0;
    setSizes(prev => {
      const copy = { ...prev };
      if (val <= 0) {
        delete copy[sz];
      } else {
        copy[sz] = val;
      }
      return copy;
    });
  };

  const handleSizeStep = (sz: string, delta: number) => {
    setSizes(prev => {
      const current = prev[sz] || 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[sz];
      } else {
        copy[sz] = next;
      }
      return copy;
    });
  };

  // Quick Client Creation
  const handleCreateQuickClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      toast.error("Mijoz ismini kiriting!");
      return;
    }

    const trimmedName = newClientName.trim();
    const existing = (db.kontragentlar || []).find(k => k?.ism && String(k.ism).toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      setKimga(existing.ism);
      setIsQuickClientOpen(false);
      setNewClientName('');
      setNewClientPhone('');
      toast.info(`"${existing.ism}" tanlandi!`);
      return;
    }

    const newClientObj: Kontragent = {
      id: generateId(),
      ism: trimmedName,
      tel: newClientPhone.trim(),
      manzil: '',
      izoh: "Chiqim oynasidan tezkor qo'shildi",
      jami: 0,
      balans: 0,
      qoshilganSana: sana || getTodayStr(),
      birinchiXarid: '',
      oxirgiXarid: '',
      xaridlarSoni: 0,
      kategoriya: newClientCategory
    };

    setDb(produce((draft: DbState) => {
      if (!draft.kontragentlar) draft.kontragentlar = [];
      draft.kontragentlar.push(newClientObj);
    }));

    setKimga(trimmedName);
    setIsQuickClientOpen(false);
    setNewClientName('');
    setNewClientPhone('');
    toast.success(`Yangi mijoz: "${trimmedName}" muvaffaqiyatli qo'shildi va tanlandi!`);
  };

  // Handle Add To Cart
  const handleAddToCart = () => {
    if (!model) {
      toast.error('Model nomini tanlang!');
      return;
    }
    const sizeEntries = Object.entries(sizes).filter(([, qty]) => Number(qty) > 0);
    if (sizeEntries.length === 0) {
      toast.error("Kamida bitta o'lcham va miqdorini kiriting!");
      return;
    }
    
    if (Object.values(sizes).some(qty => Number(qty) < 0)) {
      toast.error("Soni manfiy bo'lishi mumkin emas!");
      return;
    }

    const is2Sort = selectedOmbor === 'sort2';
    const parsedCustom = customPrice.trim() ? Number(customPrice) : 0;
    const catalogSale = db.prices?.[model]?.sale || 0;
    const salePrice = parsedCustom > 0 ? parsedCustom : catalogSale;

    if (salePrice <= 0) {
      toast.error(`❌ "${model}" uchun sotuv narxi belgilanmagan. Narx kiriting!`);
      return;
    }

    // Stock validation against selected ombor
    const targetStock = db[selectedOmbor]?.stock || {};
    for (const [sz, qty] of sizeEntries) {
      const cartQty = cart
        .filter(c => c.model === model && c.ombor === selectedOmbor)
        .reduce((acc, c) => acc + (c.sizes[sz] || 0), 0);
      const avail = targetStock[model]?.[sz] || 0;
      if (Number(qty) + cartQty > avail) {
        toast.error(`❌ ${model} (${sz}°) uchun ${selectedOmbor === 'sort2' ? '2-Sort' : selectedOmbor.toUpperCase()} omborda faqat ${avail} juft mavjud! (Savatda: ${cartQty} ta)`);
        return;
      }
    }

    setCart(prev => [...prev, {
      id: generateId(),
      model,
      sizes: { ...sizes },
      ombor: selectedOmbor,
      is2Sort,
      price: salePrice
    }]);

    setSizes({});
    setModel('');
    setCustomPrice('');
    setModelSearchQuery('');
    toast.success(`"${model}" savatga qo'shildi!`);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateCartItemQty = (id: string, sz: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const current = item.sizes[sz] || 0;
      const next = Math.max(0, current + delta);
      const newSizes = { ...item.sizes };
      if (next === 0) {
        delete newSizes[sz];
      } else {
        newSizes[sz] = next;
      }
      return { ...item, sizes: newSizes };
    }).filter(item => Object.keys(item.sizes).length > 0));
  };

  const clearForm = () => {
    setCart([]);
    setSizes({});
    setModel('');
    setKimga('');
    setIzoh('');
    setCustomPrice('');
    setDiscountAmount(0);
    setCustomFinalTotalInput('');
    toast.info("Forma tozalandi");
  };

  // Cart totals calculations
  const cartTotalSale = useMemo(() => {
    return cart.reduce((acc, item) => {
      const price = item.price !== undefined ? item.price : (db.prices?.[item.model]?.sale || 0);
      const qty = Object.values(item.sizes).reduce((a, b) => a + Number(b || 0), 0);
      return acc + (price * qty);
    }, 0);
  }, [cart, db.prices]);

  const cartTotalUnits = useMemo(() => {
    return cart.reduce((acc, item) => acc + Object.values(item.sizes).reduce((a, b) => a + Number(b || 0), 0), 0);
  }, [cart]);

  // Final Payable Total and Effective Discount calculations
  const finalPayableTotal = useMemo(() => {
    if (customFinalTotalInput.trim() !== '') {
      const parsed = Number(customFinalTotalInput);
      return isNaN(parsed) || parsed < 0 ? cartTotalSale : parsed;
    }
    return Math.max(0, cartTotalSale - (discountAmount || 0));
  }, [cartTotalSale, customFinalTotalInput, discountAmount]);

  const effectiveDiscount = useMemo(() => {
    return Math.max(0, cartTotalSale - finalPayableTotal);
  }, [cartTotalSale, finalPayableTotal]);

  const selectedCustomerObj = useMemo(() => {
    return (db.kontragentlar || []).find(k => k.ism === kimga);
  }, [db.kontragentlar, kimga]);

  // Client debt, credit limit, and projected debt calculations
  const clientCurrentDebt = selectedCustomerObj?.balans || 0;
  const clientLimit = selectedCustomerObj?.kreditLimiti || 0;

  // Received payment from customer
  const receivedPayment = useMemo(() => {
    if (!paidAmountInput || paidAmountInput.trim() === '') return 0;
    const val = Number(paidAmountInput);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [paidAmountInput]);

  // Total balance with this shipment: Avvalgi qarz + Berilayotgan yuk puli
  const totalAccountDue = clientCurrentDebt + finalPayableTotal;

  // Qoldiq qarz: Jami hisob - Qabul qilingan to'lov
  const remainingDebtAfterPayment = totalAccountDue - receivedPayment;

  const clientNewProjectedDebt = remainingDebtAfterPayment;
  const isLimitExceeded = clientLimit > 0 && clientNewProjectedDebt > clientLimit;
  const limitUsagePercent = clientLimit > 0 ? Math.min(100, Math.round((clientNewProjectedDebt / clientLimit) * 100)) : 0;

  // Handle Save Transaction
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const handleSave = async () => {
    if (isSavingRef.current) return;

    let currentCart = [...cart];
    // If cart is empty, but user already selected model and entered sizes on the left:
    if (currentCart.length === 0 && model) {
      const sizeEntries = Object.entries(sizes).filter(([, qty]) => Number(qty) > 0);
      if (sizeEntries.length > 0) {
        const is2Sort = selectedOmbor === 'sort2';
        const parsedCustom = customPrice.trim() ? Number(customPrice) : 0;
        const catalogSale = db.prices?.[model]?.sale || 0;
        const salePrice = parsedCustom > 0 ? parsedCustom : catalogSale;
        if (salePrice > 0) {
          const autoItem: CartItem = {
            id: generateId(),
            model,
            sizes: { ...sizes },
            ombor: selectedOmbor,
            is2Sort,
            price: salePrice
          };
          currentCart = [autoItem];
          setCart([autoItem]);
          setSizes({});
          setModel('');
          setCustomPrice('');
          toast.info(`"${model}" avtomatik savatga olindi.`);
        }
      }
    }

    if (currentCart.length === 0) {
      toast.error("⚠️ Savat bo'sh! Chap tomondan model va o'lchamlarni tanlab «Savatga Qo'shish» tugmasini bosing.");
      return;
    }
    if (!sana) {
      toast.error('⚠️ Hujjat sanasini kiriting!');
      return;
    }
    if (!kimga || !kimga.trim()) {
      toast.error('⚠️ Xaridor (mijoz) tanlanmagan! Iltimos, ro\'yxatdan mijozni tanlang yoki «+ Yangi Mijoz» tugmasi orqali qo\'shing.');
      return;
    }
    
    isSavingRef.current = true;
    setIsSaving(true);
    setTimeout(() => { isSavingRef.current = false; setIsSaving(false); }, 3000);

    const trimmedKimga = kimga.trim();
    const selectedMijoz = (db.kontragentlar || []).find(
      k => k?.ism && String(k.ism).trim().toLowerCase() === trimmedKimga.toLowerCase()
    );

    const officialKimga = selectedMijoz ? selectedMijoz.ism : trimmedKimga;
    
    // Final stock and price validation
    for (const item of currentCart) {
      const itemOmbor: WarehouseName = item.ombor || currentOmbor;
      const omborStock = db[itemOmbor]?.stock || {};
      const salePrice = item.price !== undefined ? item.price : (db.prices?.[item.model]?.sale || 0);
      if (salePrice <= 0) {
        setIsSaving(false); isSavingRef.current = false;
        return toast.error(`❌ "${item.model}" uchun sotuv narxi belgilanmagan. Iltimos, narx kiriting.`);
      }
      for (const [sz, qty] of Object.entries(item.sizes)) {
        const avail = omborStock[item.model]?.[sz] || 0;
        if (Number(qty) > avail) {
          setIsSaving(false); isSavingRef.current = false;
          return toast.error(`❌ "${item.model}" (${sz}°) uchun ${itemOmbor === 'sort2' ? '2-Sort' : itemOmbor.toUpperCase()} omborda faqat ${avail} juft mavjud! (Kiritilgan: ${qty} ta)`);
        }
      }
    }

    // Race Condition Guard: Cross-device atomic stock verification
    const atomicRes = await atomicCheckout(currentOmbor, currentCart);
    if (!atomicRes.ok && atomicRes.conflict) {
      setIsSaving(false);
      isSavingRef.current = false;
      const details = (atomicRes.conflicts || []).map(c => `• ${c.model} (${c.size}°): qoldiq ${c.available} juft, so'ralgan ${c.requested} juft`).join('\n');
      return toast.error(`⚠️ Diqqat: Omborda qoldiq o'zgargan! Boshqa qurilmadan sotilgan bo'lishi mumkin:\n${details}`, { duration: 8000 });
    }

    const cartKey = JSON.stringify([...currentCart].sort((a,b) => a.id.localeCompare(b.id)));
    const txGroupId = `${officialKimga}_${sana}_${cartKey}_${Date.now()}`;
    const txVaqt = getNowStr();
    let totalQty = 0;
    let totalSale = 0;
    let totalProfit = 0;

    const discountFactor = cartTotalSale > 0 ? (finalPayableTotal / cartTotalSale) : 1;
    const finalSale = finalPayableTotal;
    const discount = effectiveDiscount;

    try {
      const nextDb = produce(db, (draft: DbState) => {
        if (!draft[currentOmbor]) draft[currentOmbor] = { stock: {}, transactions: [] };
        if (draft[currentOmbor].transactions.some(t => t.groupId === txGroupId)) return;
        
        // Auto-register client if newly typed and not present in DB
        if (!draft.kontragentlar) draft.kontragentlar = [];
        let mijozIndex = draft.kontragentlar.findIndex(k => k?.ism && String(k.ism).trim().toLowerCase() === officialKimga.toLowerCase());
        if (mijozIndex < 0) {
          const newClient: Kontragent = {
            id: 'k-' + generateId(),
            ism: officialKimga,
            tel: '',
            manzil: '',
            izoh: 'Chiqim vaqtida avtomatik qo\'shilgan',
            kategoriya: 'Ulgurji',
            jami: 0,
            xaridlarSoni: 0,
            balans: 0,
            birinchiXarid: sana,
            oxirgiXarid: sana,
            qoshilganSana: sana
          };
          draft.kontragentlar.push(newClient);
          mijozIndex = draft.kontragentlar.length - 1;
        }

        const addedTxDetails: { id: string; ombor: WarehouseName }[] = [];

        currentCart.forEach(item => {
          const targetOmbor: WarehouseName = item.ombor || currentOmbor;
          if (!draft[targetOmbor]) draft[targetOmbor] = { stock: {}, transactions: [] };
          if (!draft[targetOmbor].stock) draft[targetOmbor].stock = {};
          if (!draft[targetOmbor].transactions) draft[targetOmbor].transactions = [];
          if (!draft[targetOmbor].stock[item.model]) draft[targetOmbor].stock[item.model] = {};
          
          Object.entries(item.sizes).forEach(([sz, qty]) => {
            if (Number(qty) > 0) {
              const currentStockVal = draft[targetOmbor].stock[item.model][sz] || 0;
              draft[targetOmbor].stock[item.model][sz] = Math.max(0, currentStockVal - Number(qty));
              
              const cost = draft.prices?.[item.model]?.cost || 0;
              const originalSale = item.price !== undefined ? item.price : (draft.prices?.[item.model]?.sale || 0);
              const effectiveSalePrice = Math.round(originalSale * discountFactor);
              const itemTotalSale = effectiveSalePrice * Number(qty);
              const itemTotalProfit = (effectiveSalePrice - cost) * Number(qty);

              totalQty += Number(qty);
              totalSale += itemTotalSale;
              totalProfit += itemTotalProfit;

              const isItem2Sort = Boolean(item.is2Sort || targetOmbor === 'sort2');
              const discountNote = discount > 0 ? `[Chegirma: ${formatCompact(discount)} so'm]` : '';
              const itemIzoh = [isItem2Sort ? '(2-sort)' : '', izoh, discountNote].filter(Boolean).join(' ');

              const newTxId = generateId();
              addedTxDetails.push({ id: newTxId, ombor: targetOmbor });

              draft[targetOmbor].transactions.push({
                id: newTxId,
                vaqt: txVaqt,
                sana,
                amal: 'chiqim',
                model: item.model,
                olcham: sz,
                soni: Number(qty),
                kimdan: officialKimga,
                kimga: officialKimga,
                izoh: itemIzoh,
                xodim: currentUser?.ism || "Admin",
                summa: itemTotalSale,
                foyda: itemTotalProfit,
                groupId: txGroupId,
                ombor: targetOmbor,
                sort: isItem2Sort ? '2' : '1'
              });
            }
          });
        });

        // Exact rounding adjustment so sum of transactions strictly equals finalSale
        const roundingDiff = finalSale - totalSale;
        if (roundingDiff !== 0 && addedTxDetails.length > 0) {
          const lastDetail = addedTxDetails[addedTxDetails.length - 1];
          const tx = (draft[lastDetail.ombor]?.transactions || []).find(t => t.id === lastDetail.id);
          if (tx) {
            tx.summa = (tx.summa || 0) + roundingDiff;
            tx.foyda = (tx.foyda || 0) + roundingDiff;
            totalSale += roundingDiff;
            totalProfit += roundingDiff;
          }
        }

        // Update Client balance (incorporating received payment)
        if (mijozIndex >= 0 && draft.kontragentlar[mijozIndex]) {
          draft.kontragentlar[mijozIndex].jami += totalQty;
          draft.kontragentlar[mijozIndex].xaridlarSoni = (draft.kontragentlar[mijozIndex].xaridlarSoni || 0) + 1;
          const currentOxirgiXarid = draft.kontragentlar[mijozIndex].oxirgiXarid;
          if (!currentOxirgiXarid || new Date(sana) > new Date(currentOxirgiXarid)) {
            draft.kontragentlar[mijozIndex].oxirgiXarid = sana;
          }
          const prevBal = Number(draft.kontragentlar[mijozIndex].balans) || 0;
          draft.kontragentlar[mijozIndex].balans = prevBal + finalSale - receivedPayment;
        }

        // Auto-register payment in Kassa if receivedPayment > 0
        if (receivedPayment > 0) {
          if (!draft.kassaHarakatlari) draft.kassaHarakatlari = [];
          if (!draft.kassaBalansi) {
            draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
          }

          const kassaMethodName = paymentKassaTuri === 'naqd_uzs' ? 'Naqd' : paymentKassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';
          const newKassaEntry: KassaHarakati = {
            id: 'kh-' + generateId(),
            sana,
            vaqt: txVaqt,
            tur: 'kirim',
            kategoriya: 'savdo_tushumi',
            summa: receivedPayment,
            valyuta: 'UZS',
            kurs: 1,
            summaUzs: receivedPayment,
            kassaTuri: paymentKassaTuri,
            kimgaKimdan: officialKimga,
            izoh: `Sotuv vaqtida to'lov (${kassaMethodName}): ${officialKimga} (${totalQty} juft yuk)`,
            xodim: currentUser?.ism || 'Admin',
            boglanishId: txGroupId
          };

          draft.kassaHarakatlari.unshift(newKassaEntry);
          draft.kassaBalansi[paymentKassaTuri] = (Number(draft.kassaBalansi[paymentKassaTuri]) || 0) + receivedPayment;
        }

        // Add audit log
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(createAuditLog(
          currentUser!,
          'add_chiqim',
          'Chiqim',
          `Sotuv amalga oshirildi: ${officialKimga}, ${totalQty} juft, Yuk puli: ${totalSale.toLocaleString()} so'm${discount > 0 ? ` (Asl: ${cartTotalSale.toLocaleString()}, Chegirma: ${discount.toLocaleString()} so'm)` : ''}${receivedPayment > 0 ? `, Qabul qilingan to'lov: ${receivedPayment.toLocaleString()} so'm, Qoldiq qarz: ${remainingDebtAfterPayment.toLocaleString()} so'm` : `, Qoldiq qarz: ${remainingDebtAfterPayment.toLocaleString()} so'm`}`
        ));
      });

      setDb(nextDb);

      // Immediately sync with server & Firestore cloud without debounce delay
      flushSaveToFirestore(nextDb).catch(e => console.warn("Firestore flush notice:", e));

      toast.success(
        receivedPayment > 0 
          ? `Chiqim va ${formatCompact(receivedPayment)} so'm to'lov muvaffaqiyatli saqlandi!`
          : 'Chiqim muvaffaqiyatli saqlandi!'
      );
      
      // Dispatch Telegram notifications
      if (db.telegramConfig?.isEnabled) {
        const itemSummary = currentCart.map(c => {
          const szTotal = Object.values(c.sizes || {}).reduce((a, b) => a + Number(b || 0), 0);
          return `${c.model} (${szTotal} juft)`;
        }).join(', ');

        notifyBigSaleAlert(db, {
          mijoz: officialKimga,
          totalQty,
          totalSumma: totalSale,
          ombor: currentOmbor,
          xodim: currentUser?.ism || "Omborchi",
          itemSummary
        }, setDb).catch(console.warn);

        currentCart.forEach(item => {
          const currentStockModel = db[currentOmbor]?.stock?.[item.model] || {};
          const soldForModel = Object.values(item.sizes || {}).reduce((a, b) => a + Number(b || 0), 0);
          const currentTotal = Object.values(currentStockModel).reduce((a, b) => a + Number(b || 0), 0);
          const remaining = Math.max(0, currentTotal - soldForModel);
          notifyLowStockAlert(db, item.model, currentOmbor, remaining, setDb).catch(console.warn);
        });
      }

      // Open Receipt Modal with full financial parameters
      setReceiptData({
        sana,
        kimga: officialKimga,
        cart: [...currentCart],
        totalQty,
        totals: { sale: totalSale, profit: totalProfit },
        discount,
        originalSale: cartTotalSale,
        oldBalance: clientCurrentDebt,
        shipmentTotal: finalPayableTotal,
        totalDue: totalAccountDue,
        paidAmount: receivedPayment,
        remainingDebt: remainingDebtAfterPayment,
        paymentMethod: paymentKassaTuri === 'naqd_uzs' ? 'Naqd pul' : paymentKassaTuri === 'karta_uzs' ? 'Karta' : 'Bank hisobi'
      });

      // Clear current cart & inputs
      setCart([]);
      setSizes({});
      setModel('');
      setCustomPrice('');
      setDiscountAmount(0);
      setCustomFinalTotalInput('');
      setPaidAmountInput('');
      setKimga('');
      setIzoh('');
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  // Grouped transactions for history
  const otherOmborKey = currentOmbor === 'tepa' ? 'kotta' : 'tepa';
  const otherOmborName = currentOmbor === 'tepa' ? 'Kotta ombor' : 'Tepa ombor';
  const otherOmborChiqimCount = (db[otherOmborKey]?.transactions || []).filter(t => t.amal === 'chiqim' && !isCorrectionTx(t)).length;

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

  const groupedTxs = useMemo(() => {
    const groups: Record<string, any> = {};
    const sourceTxs = historyOmborScope === 'all'
      ? [
          ...(db.tepa?.transactions || []).map(t => ({ ...t, ombor: t.ombor || 'tepa' })),
          ...(db.kotta?.transactions || []).map(t => ({ ...t, ombor: t.ombor || 'kotta' })),
          ...(db.sort2?.transactions || []).map(t => ({ ...t, ombor: t.ombor || 'sort2' }))
        ]
      : [...(db[currentOmbor]?.transactions || []).map(t => ({ ...t, ombor: t.ombor || currentOmbor }))];

    const txList = sourceTxs
      .filter(t => t && t.amal === 'chiqim' && !isCorrectionTx(t) && (!startDate || String(t.sana || '') >= startDate));

    txList.forEach(t => {
      if (!t) return;
      const kimgaVal = String(t.kimdan || t.izoh || "Noma'lum");
      const vaqtStr = String(t.vaqt || '');
      const key = String(t.groupId || `${t.sana || ''}_${kimgaVal}_${vaqtStr.slice(0, 16)}`);

      if (!groups[key]) {
        groups[key] = {
          id: key,
          groupId: t.groupId ? String(t.groupId) : undefined,
          sana: String(t.sana || ''),
          vaqt: vaqtStr,
          kimga: kimgaVal,
          xodim: String(t.xodim || "Noma'lum"),
          ombor: t.ombor || currentOmbor,
          items: [],
          cartItems: [],
          jamiSoni: 0,
          jamiSumma: 0,
          jamiFoyda: 0
        };
      } else {
        if (t.sana && (!groups[key].sana || String(t.sana) > String(groups[key].sana))) {
          groups[key].sana = String(t.sana);
        }
        if (t.vaqt && (!groups[key].vaqt || String(t.vaqt) > String(groups[key].vaqt))) {
          groups[key].vaqt = String(t.vaqt);
        }
      }

      groups[key].items.push(t);
      groups[key].jamiSoni += Number(t.soni || 0);
      groups[key].jamiSumma += Number(t.summa || 0);
      groups[key].jamiFoyda += Number(t.foyda || 0);
    });

    Object.values(groups).forEach((g: any) => {
      const cartMap = new Map<string, Record<string, number>>();
      (g.items || []).forEach((t: any) => {
        if (!t) return;
        const modelName = String(t.model || "Noma'lum");
        const olchamName = String(t.olcham ?? '');
        if (!cartMap.has(modelName)) cartMap.set(modelName, {});
        const szObj = cartMap.get(modelName)!;
        if (olchamName) {
          szObj[olchamName] = (szObj[olchamName] || 0) + Number(t.soni || 0);
        }
      });
      g.cartItems = Array.from(cartMap.entries()).map(([m, szs], idx) => ({
        id: `reconstructed-${idx}-${m}`,
        model: m,
        sizes: szs || {}
      }));
    });

    // Har doim eng oxirgi sana va eng yangi operatsiyalar yuqorida (kamayish tartibida)
    return Object.values(groups).sort(compareTxLatestFirst);
  }, [db, currentOmbor, startDate, historyOmborScope]);

  const filteredGroups = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return groupedTxs;
    return groupedTxs.filter(g => {
      const kimga = String(g.kimga || '').toLowerCase();
      const sana = String(g.sana || '');
      if (kimga.includes(s) || sana.includes(s)) return true;
      return (g.items || []).some((t: any) => {
        if (!t) return false;
        const m = String(t.model || '').toLowerCase();
        const o = String(t.olcham ?? '').toLowerCase();
        const iz = String(t.izoh || '').toLowerCase();
        return m.includes(s) || o.includes(s) || iz.includes(s);
      });
    });
  }, [groupedTxs, search]);

  const displayedGroups = filteredGroups.slice(0, visibleCount);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const findInvoicePayments = (g: any, kassaList: KassaHarakati[] = []) => {
    if (!kassaList || kassaList.length === 0 || !g) return [];
    const itemGroupIds = new Set((g.items || []).map((t: any) => t?.groupId ? String(t.groupId) : '').filter(Boolean));
    const itemTxIds = new Set((g.items || []).map((t: any) => t?.id ? String(t.id) : '').filter(Boolean));
    const gNormalizedClient = String(g.kimga || '').trim().toLowerCase();
    const gGroupId = g.groupId ? String(g.groupId) : '';

    return kassaList.filter(k => {
      if (!k || k.tur !== 'kirim') return false;
      const kLink = k.boglanishId ? String(k.boglanishId) : '';
      // 1. Direct groupId linkage
      if (gGroupId && kLink === gGroupId) return true;
      // 2. Linkage to any item in group
      if (kLink && (itemGroupIds.has(kLink) || itemTxIds.has(kLink))) return true;
      // 3. Client and note/date match
      const kClient = String(k.kimgaKimdan || '').trim().toLowerCase();
      if (kClient && kClient === gNormalizedClient) {
        const kIzoh = String(k.izoh || '');
        if (gGroupId && kIzoh && kIzoh.includes(gGroupId.slice(-6))) return true;
        if (g.sana && String(k.sana || '') === String(g.sana)) return true;
      }
      return false;
    });
  };

  const handleOpenEditGroup = (g: any) => {
    if (isOmborchi) {
      toast.error("Omborchi roliga chiqim fakturasini tahrirlash ruxsati berilmagan!");
      return;
    }
    // Reset sub-panel for adding new product
    setEditAddOpen(false);
    setEditAddModel('');
    setEditAddOmbor(currentOmbor);
    setEditAddIs2Sort(false);
    setEditAddPrice('');
    setEditAddSizes({});

    // Reconstruct editableItems from transactions
    const rowMap = new Map<string, EditableGroupItem>();
    (g.items || []).forEach((t: any) => {
      const is2Sort = Boolean(t.sort === '2' || (typeof t.izoh === 'string' && t.izoh.includes('(2-sort)')) || t.ombor === 'sort2');
      const targetOmbor: WarehouseName = t.ombor || currentOmbor;
      const unitPrice = t.summa && t.soni ? Math.round(t.summa / t.soni) : (db.prices?.[t.model]?.sale || 0);
      const rowKey = `${t.model}___${targetOmbor}___${is2Sort ? '2' : '1'}___${unitPrice}`;

      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          id: `row-${rowKey}-${generateId()}`,
          model: t.model,
          ombor: targetOmbor,
          is2Sort,
          price: unitPrice,
          sizes: {},
          totalQty: 0,
          totalSumma: 0,
          originalSizes: {}
        });
      }

      const row = rowMap.get(rowKey)!;
      const qty = Number(t.soni || 0);
      row.sizes[t.olcham] = (row.sizes[t.olcham] || 0) + qty;
      row.originalSizes[t.olcham] = (row.originalSizes[t.olcham] || 0) + qty;
      row.totalQty += qty;
      row.totalSumma += Number(t.summa || (qty * unitPrice));
    });

    const editableItems = Array.from(rowMap.values());
    const existingPayments = findInvoicePayments(g, db.kassaHarakatlari || []);

    const totalPaidSoFar = existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
    const remainingDue = Math.max(0, (g.jamiSumma || 0) - totalPaidSoFar);

    setEditingPaymentId(null);
    setEditingPaymentData(null);

    setEditingGroup({
      id: g.id,
      groupId: g.groupId ? String(g.groupId) : undefined,
      sana: String(g.sana || ''),
      vaqt: String(g.vaqt || ''),
      kimga: String(g.kimga || ''),
      xodim: String(g.xodim || currentUser?.ism || "Noma'lum"),
      izoh: String(g.items?.[0]?.izoh || '').replace(/\(2-sort\)/g, '').replace(/\[Chegirma:[^\]]+\]/g, '').trim(),
      items: g.items || [],
      editableItems,
      jamiSoni: g.jamiSoni || 0,
      jamiSumma: g.jamiSumma || 0,
      enablePayment: false,
      paymentAmount: remainingDue > 0 ? String(remainingDue) : '',
      paymentSana: g.sana || getTodayStr(),
      paymentKassaTuri: 'naqd_uzs',
      paymentIzoh: `Faktura #${String(g.groupId || '').slice(-6)} to'lovi (${g.kimga || ''})`,
      existingPayments: existingPayments.map(p => ({ ...p })),
      deletedPaymentIds: []
    });
  };

  const handleStartEditExistingPayment = (payment: KassaHarakati) => {
    setEditingPaymentId(payment.id);
    setEditingPaymentData({
      summa: String(payment.summa || payment.summaUzs || 0),
      kassaTuri: payment.kassaTuri || 'naqd_uzs',
      sana: payment.sana || getTodayStr(),
      izoh: payment.izoh || ''
    });
  };

  const handleSaveExistingPayment = (paymentId: string) => {
    if (!editingPaymentData) return;
    const newSum = Number(editingPaymentData.summa);
    if (isNaN(newSum) || newSum <= 0) {
      toast.error("Iltimos, to'g'ri to'lov summasini kiriting!");
      return;
    }

    setEditingGroup(prev => {
      if (!prev) return null;
      const isUsd = editingPaymentData.kassaTuri === 'naqd_usd';
      const joriyKurs = db.valyutaKursi || 12850;
      const summaUzs = isUsd ? Math.round(newSum * joriyKurs) : newSum;

      const nextPayments = prev.existingPayments.map(p => {
        if (p.id !== paymentId) return p;
        return {
          ...p,
          summa: newSum,
          summaUzs,
          valyuta: isUsd ? ('USD' as const) : ('UZS' as const),
          kurs: isUsd ? joriyKurs : 1,
          kassaTuri: editingPaymentData.kassaTuri,
          sana: editingPaymentData.sana,
          izoh: editingPaymentData.izoh
        };
      });

      return {
        ...prev,
        existingPayments: nextPayments
      };
    });

    setEditingPaymentId(null);
    setEditingPaymentData(null);
    toast.success("To'lov ma'lumotlari yangilandi!");
  };

  const handleCancelEditExistingPayment = () => {
    setEditingPaymentId(null);
    setEditingPaymentData(null);
  };

  const handleDeleteExistingPayment = (paymentId: string) => {
    if (!window.confirm("Haqiqatan ham ushbu to'lov yozuvini o'chirmoqchimisiz?")) return;

    setEditingGroup(prev => {
      if (!prev) return null;
      const nextPayments = prev.existingPayments.filter(p => p.id !== paymentId);
      const nextDeleted = [...(prev.deletedPaymentIds || []), paymentId];
      return {
        ...prev,
        existingPayments: nextPayments,
        deletedPaymentIds: nextDeleted
      };
    });

    if (editingPaymentId === paymentId) {
      setEditingPaymentId(null);
      setEditingPaymentData(null);
    }
    toast.info("To'lov o'chirildi (Faktura saqlanganda kassa va balansdan ayiriladi)");
  };

  const handleUpdateItemSize = (rowId: string, sz: string, val: number) => {
    setEditingGroup(prev => {
      if (!prev) return null;
      const nextItems = prev.editableItems.map(item => {
        if (item.id !== rowId) return item;
        const newSizes = { ...item.sizes };
        if (val <= 0) {
          delete newSizes[sz];
        } else {
          newSizes[sz] = val;
        }
        const totalQty = Object.values(newSizes).reduce((a, b) => a + Number(b || 0), 0);
        const totalSumma = totalQty * item.price;
        return {
          ...item,
          sizes: newSizes,
          totalQty,
          totalSumma
        };
      });

      const jamiSoni = nextItems.reduce((acc, item) => acc + item.totalQty, 0);
      const jamiSumma = nextItems.reduce((acc, item) => acc + item.totalSumma, 0);

      return {
        ...prev,
        editableItems: nextItems,
        jamiSoni,
        jamiSumma
      };
    });
  };

  const handleUpdateItemPrice = (rowId: string, newPrice: number) => {
    setEditingGroup(prev => {
      if (!prev) return null;
      const safePrice = Math.max(0, newPrice);
      const nextItems = prev.editableItems.map(item => {
        if (item.id !== rowId) return item;
        return {
          ...item,
          price: safePrice,
          totalSumma: item.totalQty * safePrice
        };
      });

      const jamiSumma = nextItems.reduce((acc, item) => acc + item.totalSumma, 0);

      return {
        ...prev,
        editableItems: nextItems,
        jamiSumma
      };
    });
  };

  const handleRemoveItem = (rowId: string) => {
    setEditingGroup(prev => {
      if (!prev) return null;
      const nextItems = prev.editableItems.filter(item => item.id !== rowId);
      const jamiSoni = nextItems.reduce((acc, item) => acc + item.totalQty, 0);
      const jamiSumma = nextItems.reduce((acc, item) => acc + item.totalSumma, 0);
      return {
        ...prev,
        editableItems: nextItems,
        jamiSoni,
        jamiSumma
      };
    });
  };

  const handleConfirmAddProduct = () => {
    if (!editAddModel) {
      toast.error("Mahsulot modelini tanlang!");
      return;
    }
    const sizeEntries = Object.entries(editAddSizes).filter(([, q]) => Number(q) > 0);
    if (sizeEntries.length === 0) {
      toast.error("Kamida bitta o'lcham va miqdorini kiriting!");
      return;
    }
    const parsedPrice = Number(editAddPrice) || db.prices?.[editAddModel]?.sale || 0;
    if (parsedPrice <= 0) {
      toast.error("Iltimos, sotuv narxini kiriting!");
      return;
    }

    const rowTotalQty = sizeEntries.reduce((acc, [, q]) => acc + Number(q), 0);
    const rowTotalSumma = rowTotalQty * parsedPrice;

    const newItem: EditableGroupItem = {
      id: `new-row-${generateId()}`,
      model: editAddModel,
      ombor: editAddOmbor,
      is2Sort: editAddIs2Sort || editAddOmbor === 'sort2',
      price: parsedPrice,
      sizes: { ...editAddSizes },
      totalQty: rowTotalQty,
      totalSumma: rowTotalSumma,
      originalSizes: {} // New item, so delta is +qty
    };

    setEditingGroup(prev => {
      if (!prev) return null;
      const nextItems = [...prev.editableItems, newItem];
      const jamiSoni = nextItems.reduce((acc, it) => acc + it.totalQty, 0);
      const jamiSumma = nextItems.reduce((acc, it) => acc + it.totalSumma, 0);
      return {
        ...prev,
        editableItems: nextItems,
        jamiSoni,
        jamiSumma
      };
    });

    toast.success(`"${editAddModel}" (${rowTotalQty} juft) fakturaga qo'shildi!`);
    setEditAddOpen(false);
    setEditAddModel('');
    setEditAddSizes({});
    setEditAddPrice('');
  };

  const handleSaveEditGroup = () => {
    if (isOmborchi) {
      toast.error("Omborchi roliga fakturani saqlash ruxsati berilmagan!");
      return;
    }
    if (!editingGroup) return;
    if (!editingGroup.sana) return toast.error("Sana kiritilishi shart!");
    if (!editingGroup.kimga.trim()) return toast.error("Mijoz nomi kiritilishi shart!");

    const validItems = editingGroup.editableItems.filter(item => {
      return Object.values(item.sizes).some(q => Number(q) > 0);
    });

    if (validItems.length === 0) {
      return toast.error("Fakturada kamida bitta mahsulot va o'lcham bo'lishi shart!");
    }

    const newKimga = editingGroup.kimga.trim();
    const newSana = editingGroup.sana;
    const newXodim = editingGroup.xodim.trim() || currentUser?.ism || "Noma'lum";
    const newIzoh = editingGroup.izoh.trim();
    const invoiceGroupId = editingGroup.groupId || generateId();

    let calculatedTotalQty = 0;
    let calculatedTotalSale = 0;

    try {
      setDb(produce((draft: DbState) => {
        // 1. Calculate stock difference between original items and updated items
        const oldGroupQuantities: Record<string, number> = {};
        (editingGroup.items || []).forEach((t: any) => {
          const targetOmbor: WarehouseName = t.ombor || currentOmbor;
          const key = `${targetOmbor}___${t.model}___${t.olcham}`;
          oldGroupQuantities[key] = (oldGroupQuantities[key] || 0) + Number(t.soni || 0);
        });

        const newGroupQuantities: Record<string, number> = {};
        calculatedTotalQty = 0;
        calculatedTotalSale = 0;

        validItems.forEach(item => {
          Object.entries(item.sizes).forEach(([sz, qty]) => {
            const q = Number(qty || 0);
            if (q > 0) {
              const key = `${item.ombor}___${item.model}___${sz}`;
              newGroupQuantities[key] = (newGroupQuantities[key] || 0) + q;
              calculatedTotalQty += q;
              calculatedTotalSale += q * item.price;
            }
          });
        });

        // Apply deltas to warehouse stocks
        const allStockKeys = new Set([...Object.keys(oldGroupQuantities), ...Object.keys(newGroupQuantities)]);
        allStockKeys.forEach(key => {
          const [wName, modelName, sizeName] = key.split('___') as [WarehouseName, string, string];
          const oldQ = oldGroupQuantities[key] || 0;
          const newQ = newGroupQuantities[key] || 0;
          const delta = newQ - oldQ;

          if (delta !== 0) {
            if (!draft[wName]) draft[wName] = { stock: {}, transactions: [] };
            if (!draft[wName].stock) draft[wName].stock = {};
            if (!draft[wName].stock[modelName]) draft[wName].stock[modelName] = {};
            const curStock = draft[wName].stock[modelName][sizeName] || 0;
            draft[wName].stock[modelName][sizeName] = Math.max(0, curStock - delta);
          }
        });

        // 2. Remove old transactions belonging to this group
        const oldTxIds = new Set((editingGroup.items || []).map((t: any) => t.id).filter(Boolean));
        ALL_WAREHOUSES.forEach(w => {
          if (draft[w]?.transactions) {
            draft[w].transactions = draft[w].transactions.filter(t => !oldTxIds.has(t.id));
          }
        });

        // 3. Add updated transactions
        const txVaqt = editingGroup.vaqt || getNowStr();
        validItems.forEach(item => {
          const targetOmbor: WarehouseName = item.ombor || currentOmbor;
          if (!draft[targetOmbor]) draft[targetOmbor] = { stock: {}, transactions: [] };
          if (!draft[targetOmbor].transactions) draft[targetOmbor].transactions = [];

          Object.entries(item.sizes).forEach(([sz, qty]) => {
            const q = Number(qty || 0);
            if (q > 0) {
              const cost = draft.prices?.[item.model]?.cost || 0;
              const itemTotalSale = q * item.price;
              const itemTotalProfit = (item.price - cost) * q;
              const isItem2Sort = Boolean(item.is2Sort || targetOmbor === 'sort2');
              const itemIzoh = [isItem2Sort ? '(2-sort)' : '', newIzoh].filter(Boolean).join(' ');

              draft[targetOmbor].transactions.push({
                id: generateId(),
                vaqt: txVaqt,
                sana: newSana,
                amal: 'chiqim',
                model: item.model,
                olcham: sz,
                soni: q,
                kimdan: newKimga,
                kimga: newKimga,
                izoh: itemIzoh,
                xodim: newXodim,
                summa: itemTotalSale,
                foyda: itemTotalProfit,
                groupId: invoiceGroupId,
                ombor: targetOmbor,
                sort: isItem2Sort ? '2' : '1'
              });
            }
          });
        });

        // 4. Payments Handling (Deleted, Updated, and New)
        if (!draft.kassaHarakatlari) draft.kassaHarakatlari = [];
        if (!draft.kassaBalansi) {
          draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
        }

        // 4a. Process deleted payments
        let paymentsDeletedText = '';
        if (editingGroup.deletedPaymentIds && editingGroup.deletedPaymentIds.length > 0) {
          const toDeleteSet = new Set(editingGroup.deletedPaymentIds);
          let delSum = 0;
          draft.kassaHarakatlari = draft.kassaHarakatlari.filter(kh => {
            if (toDeleteSet.has(kh.id)) {
              const kType = kh.kassaTuri || 'naqd_uzs';
              if (draft.kassaBalansi[kType] !== undefined) {
                draft.kassaBalansi[kType] = Math.max(0, (Number(draft.kassaBalansi[kType]) || 0) - Number(kh.summa || 0));
              }
              delSum += Number(kh.summaUzs || kh.summa || 0);
              return false;
            }
            return true;
          });
          if (delSum > 0) {
            paymentsDeletedText = `, To'lov o'chirildi: ${formatUzs(delSum)} UZS`;
          }
        }

        // 4b. Process updated existing payments
        let paymentsUpdatedText = '';
        if (editingGroup.existingPayments && editingGroup.existingPayments.length > 0) {
          editingGroup.existingPayments.forEach(updatedP => {
            const idx = draft.kassaHarakatlari.findIndex(kh => kh.id === updatedP.id);
            if (idx >= 0) {
              const oldKh = draft.kassaHarakatlari[idx];
              const oldKType = oldKh.kassaTuri || 'naqd_uzs';
              const newKType = updatedP.kassaTuri || 'naqd_uzs';
              const oldSum = Number(oldKh.summa || 0);
              const newSum = Number(updatedP.summa || 0);

              if (oldKType === newKType) {
                const diff = newSum - oldSum;
                draft.kassaBalansi[newKType] = (Number(draft.kassaBalansi[newKType]) || 0) + diff;
              } else {
                draft.kassaBalansi[oldKType] = Math.max(0, (Number(draft.kassaBalansi[oldKType]) || 0) - oldSum);
                draft.kassaBalansi[newKType] = (Number(draft.kassaBalansi[newKType]) || 0) + newSum;
              }

              draft.kassaHarakatlari[idx] = {
                ...oldKh,
                ...updatedP,
                kimgaKimdan: newKimga,
                xodim: newXodim
              };
              if (oldSum !== newSum || oldKType !== newKType) {
                paymentsUpdatedText = `, To'lov yangilandi: ${formatUzs(updatedP.summaUzs || updatedP.summa)} UZS`;
              }
            }
          });
        }

        // 4c. Record new payment if enabled
        let paymentAddedText = '';
        if (editingGroup.enablePayment && Number(editingGroup.paymentAmount) > 0) {
          const payAmount = Number(editingGroup.paymentAmount);
          const paySana = editingGroup.paymentSana || newSana;
          const payKassaTuri = editingGroup.paymentKassaTuri;
          const isUsd = payKassaTuri === 'naqd_usd';
          const joriyKurs = db.valyutaKursi || 12850;
          const summaUzs = isUsd ? Math.round(payAmount * joriyKurs) : payAmount;
          const kassaMethodName = payKassaTuri === 'naqd_uzs' ? 'Naqd so\'m' : payKassaTuri === 'naqd_usd' ? 'Naqd USD' : payKassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';

          const newKassaEntry: KassaHarakati = {
            id: 'kh-' + generateId(),
            sana: paySana,
            vaqt: getNowStr(),
            tur: 'kirim',
            kategoriya: 'savdo_tushumi',
            summa: payAmount,
            valyuta: isUsd ? 'USD' : 'UZS',
            kurs: isUsd ? joriyKurs : 1,
            summaUzs,
            kassaTuri: payKassaTuri,
            kimgaKimdan: newKimga,
            izoh: editingGroup.paymentIzoh || `Faktura #${invoiceGroupId.slice(-6)} to'lovi (${kassaMethodName}): ${newKimga}`,
            xodim: newXodim,
            boglanishId: invoiceGroupId
          };

          draft.kassaHarakatlari.unshift(newKassaEntry);
          draft.kassaBalansi[payKassaTuri] = (Number(draft.kassaBalansi[payKassaTuri]) || 0) + payAmount;
          paymentAddedText = `, Yangi to'lov: ${formatUzs(summaUzs)} UZS (${kassaMethodName})`;
        }

        // 5. Ensure client exists in kontragentlar
        if (!draft.kontragentlar) draft.kontragentlar = [];
        const clientExists = draft.kontragentlar.some(k => k.ism.trim().toLowerCase() === newKimga.toLowerCase());
        if (!clientExists) {
          draft.kontragentlar.push({
            id: 'k-' + generateId(),
            ism: newKimga,
            tel: '',
            manzil: '',
            izoh: 'Chiqim tahrirlashda qo\'shildi',
            kategoriya: 'Ulgurji',
            jami: calculatedTotalQty,
            xaridlarSoni: 1,
            balans: calculatedTotalSale,
            birinchiXarid: newSana,
            oxirgiXarid: newSana,
            qoshilganSana: newSana
          });
        }

        // 6. Recalculate ALL client balances and stats accurately
        const updatedDb = recalculateAllClientBalances(draft);
        draft.kontragentlar = updatedDb.kontragentlar;

        // 7. Audit log
        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(createAuditLog(
          currentUser!,
          'edit_chiqim_group',
          'Chiqim',
          `Faktura tahrirlandi: "${newKimga}", Sana: ${newSana}, Jami: ${calculatedTotalQty} juft (${formatUzs(calculatedTotalSale)} UZS)${paymentsDeletedText}${paymentsUpdatedText}${paymentAddedText}`
        ));
      }));

      flushSaveToFirestore().catch(e => console.warn(e));
      toast.success(`Faktura muvaffaqiyatli saqlandi! (${newKimga}, ${calculatedTotalQty} juft)`);
      setEditingGroup(null);
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const handleOpenQuickPayment = (g: any) => {
    const existingPayments = findInvoicePayments(g, db.kassaHarakatlari || []);
    const totalPaidSoFar = existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
    const remainingDue = Math.max(0, (g.jamiSumma || 0) - totalPaidSoFar);

    setQuickPaymentGroup({
      group: g,
      sana: g.sana || getTodayStr(),
      amount: remainingDue > 0 ? String(remainingDue) : '',
      kassaTuri: 'naqd_uzs',
      izoh: `Faktura #${String(g.groupId || '').slice(-6)} to'lovi (${g.kimga || ''})`,
      existingPayments
    });
  };

  const handleDeletePaymentFromQuickModal = (paymentId: string) => {
    if (!window.confirm("Haqiqatan ham ushbu to'lovni o'chirmoqchimisiz?")) return;
    try {
      setDb(produce((draft: DbState) => {
        if (!draft.kassaHarakatlari) return;
        const idx = draft.kassaHarakatlari.findIndex(k => k.id === paymentId);
        if (idx >= 0) {
          const kh = draft.kassaHarakatlari[idx];
          const kType = kh.kassaTuri || 'naqd_uzs';
          if (draft.kassaBalansi && draft.kassaBalansi[kType] !== undefined) {
            draft.kassaBalansi[kType] = Math.max(0, (Number(draft.kassaBalansi[kType]) || 0) - (Number(kh.summa) || 0));
          }
          draft.kassaHarakatlari.splice(idx, 1);
        }
        const updatedDb = recalculateAllClientBalances(draft);
        draft.kontragentlar = updatedDb.kontragentlar;
      }));
      setQuickPaymentGroup(prev => {
        if (!prev) return null;
        const nextList = prev.existingPayments.filter(p => p.id !== paymentId);
        return {
          ...prev,
          existingPayments: nextList
        };
      });
      flushSaveToFirestore().catch(e => console.warn(e));
      toast.success("To'lov o'chirildi va mijoz qarzi to'g'rilandi!");
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const handleSaveQuickPayment = () => {
    if (!quickPaymentGroup) return;
    const payAmount = Number(quickPaymentGroup.amount);
    if (!payAmount || payAmount <= 0) {
      toast.error("Iltimos, to'lov summasini kiriting!");
      return;
    }
    const clientName = quickPaymentGroup.group.kimga;
    const paySana = quickPaymentGroup.sana || getTodayStr();
    const payKassaTuri = quickPaymentGroup.kassaTuri;
    const isUsd = payKassaTuri === 'naqd_usd';
    const joriyKurs = db.valyutaKursi || 12850;
    const summaUzs = isUsd ? Math.round(payAmount * joriyKurs) : payAmount;
    const kassaMethodName = payKassaTuri === 'naqd_uzs' ? 'Naqd so\'m' : payKassaTuri === 'naqd_usd' ? 'Naqd USD' : payKassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';
    const invoiceGroupId = quickPaymentGroup.group.groupId || generateId();

    try {
      setDb(produce((draft: DbState) => {
        if (!draft.kassaHarakatlari) draft.kassaHarakatlari = [];
        if (!draft.kassaBalansi) {
          draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
        }

        const newKassaEntry: KassaHarakati = {
          id: 'kh-' + generateId(),
          sana: paySana,
          vaqt: getNowStr(),
          tur: 'kirim',
          kategoriya: 'savdo_tushumi',
          summa: payAmount,
          valyuta: isUsd ? 'USD' : 'UZS',
          kurs: isUsd ? joriyKurs : 1,
          summaUzs,
          kassaTuri: payKassaTuri,
          kimgaKimdan: clientName,
          izoh: quickPaymentGroup.izoh || `Faktura #${invoiceGroupId.slice(-6)} to'lovi (${kassaMethodName}): ${clientName}`,
          xodim: currentUser?.ism || 'Admin',
          boglanishId: invoiceGroupId
        };

        draft.kassaHarakatlari.unshift(newKassaEntry);
        draft.kassaBalansi[payKassaTuri] = (Number(draft.kassaBalansi[payKassaTuri]) || 0) + payAmount;

        const updatedDb = recalculateAllClientBalances(draft);
        draft.kontragentlar = updatedDb.kontragentlar;

        if (!draft.auditLogs) draft.auditLogs = [];
        draft.auditLogs.unshift(createAuditLog(
          currentUser!,
          'add_payment',
          'Kassa',
          `Faktura bo'yicha to'lov qabul qilindi: "${clientName}", Summa: ${formatUzs(summaUzs)} UZS (${kassaMethodName}), Sana: ${paySana}`
        ));
      }));

      flushSaveToFirestore().catch(e => console.warn(e));
      toast.success(`${clientName} uchun ${formatUzs(summaUzs)} UZS to'lov muvaffaqiyatli qabul qilindi!`);
      setQuickPaymentGroup(null);
    } catch (err: any) {
      toast.error("Xatolik: " + err.message);
    }
  };

  const showGroupReceipt = (g: any) => {
    const client = (db.kontragentlar || []).find(k => k.ism === g.kimga);
    const matchingPayments = findInvoicePayments(g, db.kassaHarakatlari || []);
    const paidAmount = matchingPayments.reduce((sum, k) => sum + (Number(k.summaUzs || k.summa) || 0), 0);
    const paymentMethods = Array.from(new Set(matchingPayments.map(k => 
      k.kassaTuri === 'naqd_uzs' ? 'Naqd pul' : k.kassaTuri === 'naqd_usd' ? 'Naqd USD' : k.kassaTuri === 'karta_uzs' ? 'Karta' : 'Bank hisobi'
    ))).join(', ') || undefined;

    const oldBalance = client ? Math.max(0, (client.balans || 0) - (g.jamiSumma - paidAmount)) : 0;
    const totalDue = oldBalance + g.jamiSumma;
    const remainingDebt = Math.max(0, totalDue - paidAmount);

    setReceiptData({
      sana: g.vaqt,
      kimga: g.kimga,
      cart: g.items.map((i: any) => ({
        model: i.model,
        sizes: { [i.olcham]: i.soni },
        totalQty: i.soni,
        totalSale: i.summa,
        price: i.summa && i.soni ? Math.round(i.summa / i.soni) : undefined,
        is2Sort: Boolean(i.sort === '2' || (typeof i.izoh === 'string' && i.izoh.includes('(2-sort)')) || i.ombor === 'sort2')
      })),
      totalQty: g.jamiSoni,
      totals: { sale: g.jamiSumma, profit: 0 },
      shipmentTotal: g.jamiSumma,
      oldBalance,
      totalDue,
      paidAmount,
      remainingDebt,
      paymentMethod: paymentMethods
    });
  };

  const groupedCartItems = useMemo(() => {
    if (!receiptData) return [];
    const grp: Record<string, any> = {};
    (receiptData.cart || []).forEach((c: any) => {
      const qty = Object.values(c.sizes || {}).reduce((a: any, b: any) => a + (b as number), 0) as number;
      const is2Sort = Boolean(c.is2Sort || c.ombor === 'sort2' || (typeof c.model === 'string' && c.model.includes('(2-sort)')));
      const rawModel = String(c.model || '').replace(/\s*\(2-sort\)/i, '').trim();
      const displayName = is2Sort ? `${rawModel} (2-sort)` : rawModel;
      const price = c.price !== undefined ? c.price : (db.prices?.[rawModel]?.sale || 0);
      const key = `${displayName}_${price}`;

      if (!grp[key]) {
        grp[key] = {
          model: rawModel,
          displayName,
          is2Sort,
          sizes: { ...(c.sizes || {}) },
          totalQty: qty,
          price
        };
      } else {
        Object.entries(c.sizes || {}).forEach(([sz, q]) => {
          grp[key].sizes[sz] = (grp[key].sizes[sz] || 0) + (q as number);
        });
        grp[key].totalQty += qty;
      }
    });
    return Object.values(grp);
  }, [receiptData, db.prices]);

  // Download PDF (Vector Razor-Sharp Quality - 100% Crisp & Fully Visible)
  const handleDownloadPDF = async () => {
    if (!receiptData) return;
    const toastId = toast.loading("Yuqori sifatli PDF faktura tayyorlanmoqda...");
    try {
      const clientObj = (db.kontragentlar || []).find(k => k.ism === receiptData.kimga) || selectedCustomerObj;
      if (receiptViewMode === 'thermal') {
        await generateThermalReceiptPdf({
          receiptData,
          groupedCartItems,
          currentOmbor,
          currentUser,
          customer: clientObj,
        });
      } else {
        await generateA4InvoicePdf({
          receiptData,
          groupedCartItems,
          currentOmbor,
          currentUser,
          customer: clientObj,
        });
      }

      toast.dismiss(toastId);
      toast.success("Yuqori sifatli PDF faktura muvaffaqiyatli yuklab olindi!");
    } catch (e: any) {
      console.error("PDF generation error:", e);
      toast.dismiss(toastId);
      toast.error("PDF yaratishda xatolik yuz berdi: " + (e?.message || ''));
    }
  };

  // Telegram Share (Ultra High Quality Image)
  const handleShare = async () => {
    if (!receiptData) return;
    const toastId = toast.loading("Telegram xabari tayyorlanmoqda...");

    const clientObj = (db.kontragentlar || []).find(k => k.ism === receiptData.kimga);
    const oldBalance = clientObj ? (clientObj.balans || 0) - receiptData.totals.sale : 0;
    const newBalance = clientObj ? clientObj.balans || 0 : receiptData.totals.sale;

    let itemsStr = "";
    groupedCartItems.forEach((item, idx) => {
      const szList = Object.entries(item.sizes)
        .filter(([, q]) => Number(q) > 0)
        .map(([sz, q]) => `${sz}°:${q}`)
        .join(', ');
      const rowSum = item.totalQty * item.price;
      itemsStr += `${idx + 1}. *${item.displayName}* (${szList})\n   └ ${item.totalQty} juft × ${formatCompact(item.price)} = *${formatCompact(rowSum)} so'm*\n`;
    });

    const textMsg = `📄 *YUK XATI (FAKTURA)*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Mijoz:* ${receiptData.kimga}\n` +
      `📅 *Sana:* ${receiptData.sana}\n` +
      `🏢 *Ombor:* ${currentOmbor.toUpperCase()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${itemsStr}` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 *Jami Miqdor:* ${receiptData.totalQty} juft\n` +
      (receiptData.discount && receiptData.discount > 0
        ? `💵 *Asl Summa:* ${formatUzs(receiptData.originalSale || receiptData.totals.sale + receiptData.discount)} UZS\n` +
          `🎁 *Chegirma:* -${formatUzs(receiptData.discount)} UZS\n` +
          `📦 *Berilayotgan yuk puli:* ${formatUzs(receiptData.shipmentTotal ?? receiptData.totals.sale)} UZS\n`
        : `📦 *Berilayotgan yuk puli:* ${formatUzs(receiptData.shipmentTotal ?? receiptData.totals.sale)} UZS\n`
      ) +
      `💳 *Avvalgi qarz:* ${formatUzs(receiptData.oldBalance ?? oldBalance)} UZS\n` +
      ((receiptData.paidAmount ?? 0) > 0 ? `💵 *Qabul qilingan to'lov (${receiptData.paymentMethod || 'Naqd'}):* -${formatUzs(receiptData.paidAmount || 0)} UZS\n` : '') +
      `🔥 *Qoldiq qarz:* ${formatUzs(receiptData.remainingDebt ?? newBalance)} UZS\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_OmborPro boshqaruv tizimi_`;

    try {
      const element = document.getElementById('print-receipt');
      if (!element) throw new Error("Element topilmadi");
      const imgData = await htmlToImage.toPng(element, { 
        pixelRatio: 2.5, 
        quality: 1.0, 
        backgroundColor: '#ffffff',
        skipFonts: true,
        cacheBust: true,
        width: element.scrollWidth,
        height: element.scrollHeight,
        style: {
          transform: 'none',
          maxHeight: 'none',
          overflow: 'visible'
        }
      });

      await copyTextToClipboard(textMsg);
      toast.dismiss(toastId);

      const blob = await (await fetch(imgData)).blob();
      const file = new File([blob], `Faktura_${receiptData.kimga}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Faktura - ${receiptData.kimga}`,
          text: textMsg,
          files: [file]
        });
        toast.success("Yuk xati Telegram orqali yuborildi!");
      } else {
        const link = document.createElement('a');
        link.download = `Faktura_${receiptData.kimga}.png`;
        link.href = imgData;
        link.click();
        toast.success("Yuk xati rasmi yuklab olindi va matni nusxalandi!");
      }
    } catch (e) {
      toast.dismiss(toastId);
      await copyTextToClipboard(textMsg);
      toast.success("Faktura matni nusxalandi!");
    }
  };

  // Today stats
  const todayStr = getTodayStr();
  const todayTransactions = useMemo(() => {
    return (db[currentOmbor]?.transactions || []).filter(t => t.amal === 'chiqim' && t.sana === todayStr && !isCorrectionTx(t));
  }, [db, currentOmbor, todayStr]);

  const todayTotalUnits = useMemo(() => todayTransactions.reduce((acc, t) => acc + Number(t.soni || 0), 0), [todayTransactions]);
  const todayTotalSales = useMemo(() => todayTransactions.reduce((acc, t) => acc + Number(t.summa || 0), 0), [todayTransactions]);

  return (
    <div className={cn("max-w-7xl mx-auto space-y-5 animate-in fade-in duration-200", receiptData && "print:hidden")}>
      
      {/* 1. TOP STATS & WAREHOUSE BAR */}
      <div className="bg-[var(--bg2)] p-4 sm:p-5 rounded-3xl border border-[var(--border)] shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center font-black shadow-md shadow-rose-500/20 shrink-0">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight">
                Savdo & Chiqim Kvitansiyasi
              </h1>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                POS KASSA
              </span>
            </div>
            <p className="text-xs text-[var(--text3)] font-medium mt-0.5">
              Mijozlarga tovar berish, narxlarni hisoblash va zudlik bilan kassa cheki chiqarish
            </p>
          </div>
        </div>

        {/* Live Today Metrics & Warehouse Switcher */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Today Sales Stat Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-2xl">
            <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="text-left leading-tight">
              <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Bugungi sotuv:</span>
              <span className="text-xs font-black text-[var(--text)]">
                {todayTotalUnits} <span className="font-normal text-[var(--text3)]">juft</span> • <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCompact(todayTotalSales)}</span>
              </span>
            </div>
          </div>

          {/* Warehouse Segmented Control */}
          <div className="flex items-center gap-1 bg-[var(--bg)] p-1 rounded-2xl border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setSelectedOmbor('tepa')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                selectedOmbor === 'tepa' 
                  ? "bg-amber-500 text-white shadow-xs" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <span>🏢</span>
              <span>TEPA</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedOmbor('kotta')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                selectedOmbor === 'kotta' 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <span>🏭</span>
              <span>KOTTA</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedOmbor('sort2')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                selectedOmbor === 'sort2' 
                  ? "bg-amber-500 text-white shadow-xs" 
                  : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              )}
            >
              <span>🟡</span>
              <span>2-SORT</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN POS WORKSPACE (SPLIT LAYOUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* LEFT PANEL: PRODUCT SELECTOR & SIZE MATRIX (7 COLS) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[var(--bg2)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-5">
            
            {/* Quick Selected Client Indicator on Left Workspace */}
            {selectedCustomerObj && (
              <div className="p-3 bg-gradient-to-r from-blue-500/10 via-[var(--bg)] to-purple-500/10 rounded-2xl border border-blue-500/20 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[var(--text)]">{selectedCustomerObj.ism}</span>
                    <span className="text-[10px] text-[var(--text3)] font-semibold">({selectedCustomerObj.kategoriya || 'Ulgurji'})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[11px] font-black px-2.5 py-0.5 rounded-lg border",
                    clientCurrentDebt > 0 ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  )}>
                    Qarz: {formatCompact(clientCurrentDebt)} so'm
                  </span>
                  {clientLimit > 0 && (
                    <span className={cn(
                      "text-[11px] font-black px-2.5 py-0.5 rounded-lg border",
                      isLimitExceeded ? "bg-rose-500 text-white border-rose-600 animate-pulse" : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    )}>
                      Limit: {formatCompact(clientLimit)} so'm
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Top row: Date & Model Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              <div className="sm:col-span-4 flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sotuv Sanasi</span>
                </label>
                <input 
                  type="date" 
                  value={sana} 
                  onChange={e => setSana(e.target.value)} 
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 text-xs font-black text-[var(--text)] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all cursor-pointer" 
                />
              </div>

              <div className="sm:col-span-8 flex flex-col gap-1.5 relative">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-rose-500" />
                    <span>Model Tanlang</span>
                  </span>
                  {model && (
                    <span className="text-[11px] font-bold text-rose-500">
                      Sotuv: {formatCompact(activeCatalogSalePrice)} so'm
                    </span>
                  )}
                </label>

                {/* Custom Searchable Model Autocomplete with Camera Scanner */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={modelSearchQuery || model}
                      placeholder="Model nomini yozing yoki tanlang..."
                      onChange={e => {
                        setModelSearchQuery(e.target.value);
                        setModel(e.target.value);
                        setIsModelDropdownOpen(true);
                      }}
                      onFocus={() => setIsModelDropdownOpen(true)}
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-4 py-2.5 pr-10 text-xs sm:text-sm font-black text-[var(--text)] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all placeholder:font-normal placeholder:text-[var(--text3)]"
                    />
                    {model && (
                      <button
                        type="button"
                        onClick={() => {
                          setModel('');
                          setModelSearchQuery('');
                          setSizes({});
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Camera Barcode / QR Scanner button */}
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="p-2.5 sm:px-3.5 sm:py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-black text-xs active:scale-95"
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
                      className="p-2.5 sm:px-3 sm:py-2.5 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text2)] border border-[var(--border)] rounded-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
                      title="Ushbu model uchun QR / Shtrix-kod yorliq chiqarish"
                    >
                      <QrCode size={16} className="text-purple-500" />
                      <span className="hidden sm:inline">Yorliq</span>
                    </button>
                  )}
                </div>

                {/* Dropdown with stock indicators */}
                {isModelDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-2xl p-2 z-50 max-h-72 overflow-y-auto space-y-1">
                    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase text-[var(--text3)] border-b border-[var(--border)]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text)] font-extrabold">
                          {showAllModels ? `Barcha modellar (${allModels.length})` : `Omborda borlar (${allModels.length})`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAllModels(prev => !prev)}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer border",
                            showAllModels
                              ? "bg-amber-500/20 text-amber-600 border-amber-500/40"
                              : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                          )}
                        >
                          {showAllModels ? "Faqat borlar" : "Barchasi"}
                        </button>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setIsModelDropdownOpen(false)}
                        className="text-rose-500 hover:underline cursor-pointer font-bold"
                      >
                        Yopish
                      </button>
                    </div>

                    {allModels.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[var(--text3)]">
                        Ushbu omborda qoldig'i mavjud modellar topilmadi.
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setShowAllModels(true)}
                            className="text-[11px] font-bold text-blue-500 hover:underline cursor-pointer"
                          >
                            Barcha modellarni ko'rsatish
                          </button>
                        </div>
                      </div>
                    ) : (
                      allModels
                        .filter(m => !modelSearchQuery || m.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                        .map(m => {
                          const mStock = activeStock[m] || {};
                          const totalMStock = Object.values(mStock).reduce((a, b) => a + Number(b || 0), 0);
                          const price = db.prices?.[m]?.sale || 0;
                          const isSelected = model === m;
                          const isArchived = (db.archivedModels || []).includes(m);

                          return (
                            <div
                              key={m}
                              onClick={() => {
                                setModel(m);
                                setModelSearchQuery('');
                                setIsModelDropdownOpen(false);
                              }}
                              className={cn(
                                "px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all",
                                isSelected 
                                  ? "bg-rose-500 text-white font-black" 
                                  : "hover:bg-[var(--bg)] text-[var(--text)]"
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold">{m}</span>
                                {isArchived && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-500/20 text-zinc-500 font-bold">
                                    Arxiv
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {price > 0 && (
                                  <span className={cn(
                                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                                    isSelected ? "bg-white/20 text-white" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  )}>
                                    {formatCompact(price)}
                                  </span>
                                )}
                                <span className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded-md",
                                  isSelected 
                                    ? "bg-white text-rose-600" 
                                    : totalMStock > 0 
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                                      : "bg-zinc-500/10 text-zinc-400"
                                )}>
                                  {totalMStock} juft
                                </span>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Hot Models Bar (Tavsiya etilgan qoldiqli modellar) */}
            {hotModels.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Qoldig'i bor mashhur modellar (Tezkor tanlash):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hotModels.map(hm => (
                    <button
                      key={hm.model}
                      type="button"
                      onClick={() => {
                        setModel(hm.model);
                        setModelSearchQuery('');
                        setIsModelDropdownOpen(false);
                      }}
                      className={cn(
                        "px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border",
                        model === hm.model
                          ? "bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-500/25 scale-105"
                          : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-rose-500/40"
                      )}
                    >
                      <span>{hm.model}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-md",
                        model === hm.model ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}>
                        {hm.total} ta
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2-Sort yoki Maxsus Narx Belgilash */}
            {(selectedOmbor === 'sort2' || model) && (
              <div className={cn(
                "p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors",
                selectedOmbor === 'sort2' ? "bg-amber-500/10 border-amber-500/25" : "bg-[var(--bg)] border-[var(--border)]"
              )}>
                <div>
                  <div className="text-xs font-black flex items-center gap-1.5 text-[var(--text)]">
                    <Tag className="w-4 h-4 text-rose-500" />
                    <span>Sotuv Narxi (Juftiga)</span>
                    {selectedOmbor === 'sort2' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500 text-white font-black">2-SORT</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-0.5">
                    {activeCatalogSalePrice > 0 
                      ? `Standart katalog narxi: ${formatCompact(activeCatalogSalePrice)} so'm`
                      : "Ushbu model uchun katalogda narx kiritilmagan"}
                  </div>
                </div>
                <div className="w-full sm:w-44 flex items-center gap-1.5">
                  <input
                    type="number"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    placeholder={activeCatalogSalePrice > 0 ? String(activeCatalogSalePrice) : "Narx (so'm)"}
                    className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs sm:text-sm font-black text-right text-[var(--text)] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  />
                  <span className="text-xs font-bold text-[var(--text3)]">so'm</span>
                </div>
              </div>
            )}

            {/* 3. SIZE MATRIX & POS COUNTERS */}
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5">
                    <span>📐</span>
                    <span>O'lchamlar va Chiqim Miqdori</span>
                  </h3>
                  <span className="text-[11px] font-medium text-[var(--text3)]">
                    Katakchalarga yozing (39-41 yuqorida, 42-44 pastda) yoki tezkor seriyani bosing
                  </span>
                </div>

                {currentInputQty > 0 && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleClearSizes}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw size={13} />
                    <span>Tozalash (0)</span>
                  </button>
                )}
              </div>

              {/* Fast Action Buttons / Seriya bo'yicha to'ldirish */}
              <div className="bg-[var(--bg)] p-2.5 sm:p-3 rounded-2xl border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text2)] flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    <span>Seriya bo'yicha to'ldirish (Tezkor tugmalar):</span>
                  </span>
                  <span className="text-[10px] text-[var(--text3)] font-medium">
                    Barcha kataklar bir zumda to'ladi
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* USER REQUEST: Har biriga 8 ta */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleFillSeries(8)}
                    className="px-3 py-2 text-xs font-black bg-rose-600 text-white hover:bg-rose-700 border border-rose-500 rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-600/25 active:scale-95 flex items-center gap-1"
                    title="Barcha o'lchamlarga 8 tadan qo'yish"
                  >
                    <span>★ Har biriga 8 ta</span>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleFillSeries(6)}
                    className="px-2.5 py-2 text-xs font-extrabold bg-[var(--bg2)] hover:bg-rose-500 hover:text-white border border-[var(--border)] text-[var(--text)] rounded-xl transition-all cursor-pointer active:scale-95"
                    title="Barcha o'lchamlarga 6 tadan qo'yish"
                  >
                    Har biriga 6 ta
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleFillSeries(10)}
                    className="px-2.5 py-2 text-xs font-extrabold bg-[var(--bg2)] hover:bg-rose-500 hover:text-white border border-[var(--border)] text-[var(--text)] rounded-xl transition-all cursor-pointer active:scale-95"
                    title="Barcha o'lchamlarga 10 tadan qo'yish"
                  >
                    Har biriga 10 ta
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleFillSeries(12)}
                    className="px-2.5 py-2 text-xs font-extrabold bg-[var(--bg2)] hover:bg-rose-500 hover:text-white border border-[var(--border)] text-[var(--text)] rounded-xl transition-all cursor-pointer active:scale-95"
                    title="Barcha o'lchamlarga 12 tadan qo'yish"
                  >
                    Har biriga 12 ta
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleFillSeries(1)}
                    className="px-2.5 py-2 text-xs font-bold bg-[var(--bg2)] hover:bg-rose-500 hover:text-white border border-[var(--border)] text-[var(--text2)] rounded-xl transition-all cursor-pointer active:scale-95"
                    title="Barcha o'lchamlarga 1 tadan qo'yish"
                  >
                    +1 Seriya
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleFillMaxAvailable}
                    className="px-2.5 py-2 text-xs font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/25 rounded-xl transition-all cursor-pointer active:scale-95 shadow-2xs"
                    title="Mavjud ombor qoldig'ini to'liq tanlash"
                  >
                    Max Borini Olish
                  </button>

                  {/* Custom Series Input: "Har biriga [ N ] ta" */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const num = parseInt(customSeriesInput, 10);
                      if (!isNaN(num) && num > 0) {
                        handleFillSeries(num);
                        setCustomSeriesInput('');
                      }
                    }} 
                    className="flex items-center gap-1 ml-auto"
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="1"
                      placeholder="Son..."
                      value={customSeriesInput}
                      onChange={e => setCustomSeriesInput(e.target.value)}
                      className="w-16 px-2 py-1.5 text-xs font-black bg-[var(--bg2)] border border-[var(--border)] rounded-xl outline-none focus:border-rose-500 text-center text-[var(--text)]"
                    />
                    <button
                      type="submit"
                      disabled={!customSeriesInput}
                      className="px-2.5 py-1.5 text-xs font-bold bg-[var(--bg2)] hover:bg-rose-600 hover:text-white disabled:opacity-40 border border-[var(--border)] rounded-xl transition-all cursor-pointer active:scale-95 text-[var(--text)]"
                    >
                      Qo'yish
                    </button>
                  </form>
                </div>
              </div>

              {/* Responsive Size Grid: 3 columns on mobile (39,40,41 top row | 42,43,44 bottom row), 44px+ height */}
              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-7 gap-2.5 sm:gap-3">
                {availableSizesList.map((sz, szIdx) => {
                  const val = sizes[sz] || 0;
                  const isSelected = val > 0;
                  const modelStock = model && activeStock[model] ? (activeStock[model][sz] || 0) : 0;
                  
                  return (
                    <div
                      key={sz}
                      className={cn(
                        "flex flex-col items-center justify-between p-2.5 sm:p-3 rounded-2xl border-2 transition-all duration-150 relative select-none min-h-[96px]",
                        isSelected
                          ? "bg-rose-500/10 border-rose-500 shadow-md shadow-rose-500/15 ring-2 ring-rose-500/20"
                          : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border2)]"
                      )}
                    >
                      {/* Size Badge & Available in Stock */}
                      <div className="w-full flex items-center justify-between mb-1.5">
                        <span className={cn(
                          "text-sm sm:text-base font-black tracking-tight",
                          isSelected ? "text-rose-600 dark:text-rose-400 font-black" : "text-[var(--text)]"
                        )}>
                          {sz}°
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                          modelStock > 0 
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                            : "bg-[var(--bg2)] text-[var(--text3)] opacity-60"
                        )}>
                          {modelStock} ta
                        </span>
                      </div>

                      {/* Number Input Field: inputMode="numeric", 44px min height for touch */}
                      <input
                        id={`size-input-${sz}`}
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        value={val === 0 ? '' : val}
                        onChange={e => handleSizeQtyChange(sz, e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const nextIdx = szIdx + 1;
                            if (nextIdx < availableSizesList.length) {
                              const nextEl = document.getElementById(`size-input-${availableSizesList[nextIdx]}`);
                              nextEl?.focus();
                            } else {
                              document.getElementById('btn-add-to-cart')?.focus();
                            }
                          }
                        }}
                        placeholder="0"
                        className={cn(
                          "w-full h-11 sm:h-12 min-h-[44px] text-center font-mono font-black text-lg sm:text-xl rounded-xl outline-none transition-all border",
                          isSelected 
                            ? "bg-rose-500 text-white font-black shadow-xs border-rose-600" 
                            : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text)] placeholder-[var(--text3)]/40 hover:bg-[var(--border)]/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                        )}
                      />

                      {/* POS Step Buttons */}
                      <div className="w-full flex items-center justify-between gap-1 mt-1.5">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => handleSizeStep(sz, -1)}
                          disabled={val <= 0}
                          className="flex-1 h-7 sm:h-8 bg-[var(--bg2)] hover:bg-rose-500/20 text-[var(--text3)] hover:text-rose-600 disabled:opacity-30 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => handleSizeStep(sz, 1)}
                          className="flex-1 h-7 sm:h-8 bg-[var(--bg2)] hover:bg-rose-500/20 text-[var(--text)] hover:text-rose-600 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add To Cart Big Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs font-semibold text-[var(--text3)]">
                  {currentInputQty > 0 ? (
                    <span>Tanlandi: <strong className="text-[var(--text)] font-black">{currentInputQty} juft</strong> • Summa: <strong className="text-rose-500 font-black">{formatCompact(currentInputQty * effectivePrice)} so'm</strong></span>
                  ) : (
                    <span>Miqdor kiriting va savatga qo'shing</span>
                  )}
                </div>

                <button
                  id="btn-add-to-cart"
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!model || currentInputQty <= 0}
                  className={cn(
                    "w-full sm:w-auto px-8 py-3.5 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg select-none",
                    !model || currentInputQty <= 0
                      ? "bg-rose-500/40 text-white cursor-not-allowed opacity-60"
                      : "bg-rose-500 hover:bg-rose-600 text-white active:scale-95 cursor-pointer shadow-rose-500/25"
                  )}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Savatga Qo'shish</span>
                </button>
              </div>

            </div>

          </div>

          {/* SAVATDAGI MODELLAR RO'YXATI */}
          {cart.length > 0 && (
            <div className="bg-[var(--bg2)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-black">
                    <PackageCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[var(--text)]">
                      Savatdagi Tovarlar ({cart.length} xil)
                    </h2>
                    <p className="text-[11px] text-[var(--text3)] font-medium">Ushbu chiqim hujjati uchun kiritilgan modellar</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-rose-500 px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    {cartTotalUnits} juft • {formatCompact(cartTotalSale)} UZS
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                {cart.map((item, idx) => {
                  const total = Object.values(item.sizes).reduce((a, b) => a + Number(b || 0), 0);
                  const itemPrice = item.price !== undefined ? item.price : (db.prices?.[item.model]?.sale || 0);
                  const isItem2Sort = Boolean(item.is2Sort || item.ombor === 'sort2');

                  return (
                    <div 
                      key={`${item.id || 'cart'}_${idx}`} 
                      className="bg-[var(--bg)] p-3.5 sm:p-4 rounded-2xl border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group hover:border-rose-500/40 transition-all shadow-2xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center font-black text-rose-500 text-xs shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-black text-sm text-[var(--text)] flex items-center gap-2 flex-wrap">
                            <span>{item.model}</span>
                            {isItem2Sort && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500 text-white">
                                2-Sort
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-[var(--text3)] uppercase">
                              ({(item.ombor || currentOmbor).toUpperCase()})
                            </span>
                            <span className="text-xs font-bold text-rose-500">
                              @{formatCompact(itemPrice)} so'm
                            </span>
                          </div>

                          {/* Size badges with quick +/- counters */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.entries(item.sizes).filter(([, q]) => Number(q) > 0).map(([sz, q]) => (
                              <div 
                                key={sz} 
                                className="inline-flex items-center gap-1.5 text-[11px] font-black bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded-lg"
                              >
                                <span className="text-[var(--text2)]">{sz}°:</span>
                                <span className="text-rose-500 font-extrabold">{q}ta</span>
                                <div className="flex items-center gap-0.5 ml-1 border-l border-[var(--border)] pl-1">
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => handleUpdateCartItemQty(item.id, sz, -1)}
                                    className="p-0.5 hover:text-rose-500 rounded cursor-pointer"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => handleUpdateCartItemQty(item.id, sz, 1)}
                                    className="p-0.5 hover:text-rose-500 rounded cursor-pointer"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                        <div className="text-left sm:text-right">
                          <div className="font-black text-sm text-[var(--text)]">
                            {total} <span className="text-xs font-normal text-[var(--text3)]">juft</span>
                          </div>
                          <div className="text-xs font-black text-rose-500">
                            {formatUzs(itemPrice * total)} UZS
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)} 
                          className="w-8 h-8 flex items-center justify-center bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                          title="Savatdan o'chirish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT PANEL: LIVE STICKY CHECKOUT & CLIENT CRM (5 COLS) */}
        <div className="lg:col-span-5 space-y-4" id="checkout-panel">
          <div className="bg-[var(--bg2)] p-5 sm:p-6 rounded-3xl border border-[var(--border)] shadow-md lg:sticky lg:top-4 z-20 space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                    Savdo Savati & Kassa
                  </h2>
                  <p className="text-[10px] text-[var(--text3)] font-medium">
                    {cart.length > 0 ? `${cartTotalUnits} juft • ${cart.length} ta model tanlandi` : "Savat hozircha bo'sh"}
                  </p>
                </div>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearForm}
                  className="text-[11px] font-bold text-[var(--text3)] hover:text-rose-500 flex items-center gap-1 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-500/10"
                  title="Savatni tozalash"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Tozalash</span>
                </button>
              )}
            </div>

            {/* 1. XARIDOR (MIJOZ) TANLASH & QARZ / LIMIT MONITORINGI */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-rose-500" />
                  <span>Xaridor (Mijoz / Do'kon) *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(true)}
                  className="text-[11px] font-black text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Yangi Mijoz</span>
                </button>
              </div>

              <ClientSearchSelect
                value={kimga}
                onChange={(name) => setKimga(name)}
                placeholder="Xaridor nomini yozing yoki ro'yxatdan tanlang..."
                inputClassName="font-black text-xs sm:text-sm focus:border-rose-500 focus:ring-rose-500/20"
              />

              {/* DYNAMIC CLIENT DEBT & LIMIT CARD */}
              {selectedCustomerObj ? (
                <div className="p-3.5 bg-[var(--bg)] rounded-2xl border border-[var(--border)] space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-black text-xs flex items-center justify-center shrink-0">
                        {selectedCustomerObj.ism[0]?.toUpperCase()}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-black text-[var(--text)] block truncate">{selectedCustomerObj.ism}</span>
                        <span className="text-[10px] text-[var(--text3)] font-semibold">{selectedCustomerObj.kategoriya || 'Ulgurji xaridor'}</span>
                      </div>
                    </div>
                    {selectedCustomerObj.tel && (
                      <span className="text-[11px] font-bold text-[var(--text3)] flex items-center gap-1 shrink-0">
                        <Phone className="w-3 h-3 text-emerald-500" />
                        {selectedCustomerObj.tel}
                      </span>
                    )}
                  </div>

                  {/* 3-Part Financial Status: Current Debt, Credit Limit, Projected Debt */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
                    <div className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
                      <span className="text-[9px] font-bold uppercase text-[var(--text3)] block">Joriy Qarzi:</span>
                      <span className={cn(
                        "text-xs font-black block mt-0.5",
                        clientCurrentDebt > 0 ? "text-rose-500" : clientCurrentDebt < 0 ? "text-emerald-500" : "text-[var(--text3)]"
                      )}>
                        {formatCompact(clientCurrentDebt)}
                      </span>
                      <span className="text-[9px] text-[var(--text3)]">
                        {clientCurrentDebt > 0 ? "Qarzdorlik" : clientCurrentDebt < 0 ? "Avans" : "Nol"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
                      <span className="text-[9px] font-bold uppercase text-[var(--text3)] block">Kredit Limiti:</span>
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 block mt-0.5">
                        {clientLimit > 0 ? formatCompact(clientLimit) : "Cheklovsiz"}
                      </span>
                      <span className="text-[9px] text-[var(--text3)]">
                        {clientLimit > 0 ? `${limitUsagePercent}% band` : "Ruxsat etilgan"}
                      </span>
                    </div>

                    <div className={cn(
                      "p-2 rounded-xl border transition-colors",
                      isLimitExceeded 
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-600" 
                        : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                    )}>
                      <span className="text-[9px] font-bold uppercase block">Kutilayotgan Qarz:</span>
                      <span className="text-xs font-black block mt-0.5">
                        {formatCompact(clientNewProjectedDebt)}
                      </span>
                      <span className="text-[9px] font-semibold">
                        +{formatCompact(finalPayableTotal)} so'm
                      </span>
                    </div>
                  </div>

                  {/* Credit Limit Progress & Over-limit Warning */}
                  {clientLimit > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-[var(--text3)]">Limit sarflanishi:</span>
                        <span className={cn(
                          isLimitExceeded ? "text-rose-600 dark:text-rose-400 font-black" : "text-[var(--text2)]"
                        )}>
                          {limitUsagePercent}% ({formatCompact(clientNewProjectedDebt)} / {formatCompact(clientLimit)} so'm)
                        </span>
                      </div>
                      <div className="w-full bg-[var(--bg2)] h-1.5 rounded-full overflow-hidden border border-[var(--border)]">
                        <div 
                          className={cn(
                            "h-full transition-all duration-300",
                            isLimitExceeded ? "bg-rose-500" : limitUsagePercent > 80 ? "bg-amber-500" : "bg-blue-500"
                          )}
                          style={{ width: `${Math.min(100, limitUsagePercent)}%` }}
                        />
                      </div>

                      {isLimitExceeded && (
                        <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>
                            Diqqat: Ushbu sotuv mijoz kredit limitidan <strong>{formatCompact(clientNewProjectedDebt - clientLimit)} so'm</strong>ga oshib ketmoqda!
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2.5 bg-[var(--bg)] rounded-xl border border-dashed border-[var(--border)] text-center text-[11px] text-[var(--text3)]">
                  ℹ️ Xaridorni tanlang — uning joriy qarzi va kredit limiti shu yerda aks etadi
                </div>
              )}
            </div>

            {/* 2. SAVATDAGI MODELLAR RO'YXATI (COMPACT CART) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5 text-rose-500" />
                  <span>Savatdagi Tovarlar ({cart.length})</span>
                </span>
                {cart.length > 0 && (
                  <span className="text-[10px] font-bold text-[var(--text3)]">
                    Jami: {cartTotalUnits} juft
                  </span>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-5 bg-[var(--bg)] rounded-2xl border border-dashed border-[var(--border)] text-center space-y-1.5">
                  <ShoppingCart className="w-6 h-6 text-[var(--text3)] mx-auto opacity-40" />
                  <p className="text-xs font-black text-[var(--text2)]">Savat bo'sh</p>
                  <p className="text-[11px] text-[var(--text3)]">
                    Chap tomondan model va o'lchamlarni tanlab «Savatga Qo'shish» tugmasini bosing
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {cart.map((item, idx) => {
                    const total = Object.values(item.sizes).reduce((a, b) => a + Number(b || 0), 0);
                    const itemPrice = item.price !== undefined ? item.price : (db.prices?.[item.model]?.sale || 0);
                    const isItem2Sort = Boolean(item.is2Sort || item.ombor === 'sort2');

                    return (
                      <div 
                        key={`${item.id || 'cart'}_${idx}`} 
                        className="bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)] flex flex-col gap-2 hover:border-rose-500/40 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-5 h-5 rounded-md bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center font-black text-[10px] text-rose-500 shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-black text-xs text-[var(--text)]">{item.model}</span>
                            {isItem2Sort && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500 text-white">
                                2-Sort
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-[var(--text3)] uppercase">
                              ({(item.ombor || currentOmbor).toUpperCase()})
                            </span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleRemoveFromCart(item.id)} 
                            className="text-[var(--text3)] hover:text-rose-500 p-1 rounded-md transition-colors cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Size bubbles with quick +/- stepper */}
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(item.sizes).filter(([, q]) => Number(q) > 0).map(([sz, q]) => (
                            <div 
                              key={sz} 
                              className="inline-flex items-center gap-1 text-[10px] font-bold bg-[var(--bg2)] border border-[var(--border)] px-1.5 py-0.5 rounded-md"
                            >
                              <span className="text-[var(--text3)]">{sz}°:</span>
                              <span className="text-rose-500 font-extrabold">{q}ta</span>
                              <div className="flex items-center gap-0.5 ml-0.5 border-l border-[var(--border)] pl-0.5">
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onClick={() => handleUpdateCartItemQty(item.id, sz, -1)}
                                  className="hover:text-rose-500 cursor-pointer"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onClick={() => handleUpdateCartItemQty(item.id, sz, 1)}
                                  className="hover:text-rose-500 cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Subtotal row */}
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border)]">
                          <span className="text-[var(--text3)] font-semibold">
                            {total} juft × {formatCompact(itemPrice)} so'm
                          </span>
                          <span className="font-black text-rose-500">
                            {formatUzs(itemPrice * total)} UZS
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. SAVDO NARXI, CHEGIRMA VA KELISHILGAN SUMMA KALKULYATORI */}
            <div className="p-3.5 bg-[var(--bg)] rounded-2xl border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-rose-500" />
                  <span>Savdo Narxi va Chegirma</span>
                </span>
                {effectiveDiscount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountAmount(0);
                      setCustomFinalTotalInput('');
                    }}
                    className="text-[10px] font-bold text-rose-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Bekor qilish</span>
                  </button>
                )}
              </div>

              {/* Direct Final Price or Discount input */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--text3)] block">
                    Kelishilgan Yakuniy Summa:
                  </label>
                  <input
                    type="number"
                    value={customFinalTotalInput}
                    onChange={e => {
                      setCustomFinalTotalInput(e.target.value);
                      setDiscountAmount(0);
                    }}
                    placeholder={cartTotalSale > 0 ? String(cartTotalSale) : "0"}
                    className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs font-black text-[var(--text)] outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-[var(--text3)] block">
                    Chegirma Summasi (so'm):
                  </label>
                  <input
                    type="number"
                    value={discountAmount || ''}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setDiscountAmount(isNaN(val) ? 0 : val);
                      setCustomFinalTotalInput('');
                    }}
                    placeholder="0"
                    className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs font-black text-emerald-600 outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Quick Discount Presets */}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[9px] font-bold uppercase text-[var(--text3)] mr-0.5">Tezkor:</span>
                {[
                  { label: "-10 ming", amount: 10000 },
                  { label: "-20 ming", amount: 20000 },
                  { label: "-50 ming", amount: 50000 },
                  { label: "-100 ming", amount: 100000 },
                  { label: "-3%", pct: 0.03 },
                  { label: "-5%", pct: 0.05 },
                  { label: "-10%", pct: 0.10 }
                ].map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      if (preset.amount) {
                        setDiscountAmount(preset.amount);
                        setCustomFinalTotalInput('');
                      } else if (preset.pct && cartTotalSale > 0) {
                        const calculated = Math.round(cartTotalSale * preset.pct);
                        setDiscountAmount(calculated);
                        setCustomFinalTotalInput('');
                      }
                    }}
                    className="px-2 py-0.5 rounded-md bg-[var(--bg2)] hover:bg-rose-500/10 hover:text-rose-500 border border-[var(--border)] text-[10px] font-bold text-[var(--text2)] transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Active discount notice */}
              {effectiveDiscount > 0 && (
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span>🎁</span>
                    <span>Chegirma berildi:</span>
                  </span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">
                    -{formatUzs(effectiveDiscount)} UZS ({cartTotalSale > 0 ? Math.round((effectiveDiscount / cartTotalSale) * 100) : 0}%)
                  </span>
                </div>
              )}

              {/* MIJOZDAN PUL QABUL QILISH OYNASI */}
              <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Mijozdan To'lov Qabul Qilish</span>
                  </span>
                  {receivedPayment > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidAmountInput('')}
                      className="text-[10px] font-bold text-rose-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Tozalash (0)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[var(--text3)] block">
                      Qabul qilinayotgan summa:
                    </label>
                    <input
                      type="number"
                      value={paidAmountInput}
                      onChange={e => setPaidAmountInput(e.target.value)}
                      placeholder="0 (qarzga)"
                      className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-[var(--text3)] block">
                      To'lov turi (Kassa):
                    </label>
                    <select
                      value={paymentKassaTuri}
                      onChange={e => setPaymentKassaTuri(e.target.value as any)}
                      className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="naqd_uzs">💵 Naqd pul</option>
                      <option value="karta_uzs">💳 Karta / Terminal</option>
                      <option value="bank_uzs">🏦 Bank hisob raqami</option>
                    </select>
                  </div>
                </div>

                {/* Quick Payment Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-[var(--text3)] mr-0.5">Tezkor:</span>
                  <button
                    type="button"
                    onClick={() => setPaidAmountInput(String(finalPayableTotal))}
                    className="px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer"
                  >
                    ✓ Yuk pulini to'ladi ({formatCompact(finalPayableTotal)})
                  </button>
                  {clientCurrentDebt > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidAmountInput(String(totalAccountDue))}
                      className="px-2 py-0.5 rounded-md bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-[10px] font-bold text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
                    >
                      ★ Yuk + Eski qarz ({formatCompact(totalAccountDue)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPaidAmountInput(String(Math.round(finalPayableTotal / 2)))}
                    className="px-2 py-0.5 rounded-md bg-[var(--bg2)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-bold text-[var(--text2)] transition-colors cursor-pointer"
                  >
                    ½ Yarmi (50%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidAmountInput('0')}
                    className="px-2 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-[10px] font-bold text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                  >
                    0 (Qarzga)
                  </button>
                </div>

                {/* Live Financial Breakdown Card */}
                <div className="p-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] space-y-1 text-xs">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text3)]">Avvalgi qarz:</span>
                    <span className={cn(
                      "font-bold",
                      clientCurrentDebt > 0 ? "text-rose-500" : clientCurrentDebt < 0 ? "text-emerald-500" : "text-[var(--text3)]"
                    )}>
                      {formatUzs(clientCurrentDebt)} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text3)]">Berilayotgan yuk puli:</span>
                    <span className="font-bold text-[var(--text)]">{formatUzs(finalPayableTotal)} UZS</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold border-t border-[var(--border)] pt-1">
                    <span className="text-[var(--text2)]">Jami hisob:</span>
                    <span className="text-[var(--text)]">{formatUzs(totalAccountDue)} UZS</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Qabul qilinayotgan summa:</span>
                    <span>-{formatUzs(receivedPayment)} UZS</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black border-t border-[var(--border)] pt-1">
                    <span className="uppercase tracking-wider">Qoldiq qarz:</span>
                    <span className={cn(
                      "font-black",
                      remainingDebtAfterPayment > 0 ? "text-rose-500" : remainingDebtAfterPayment < 0 ? "text-blue-500" : "text-emerald-500"
                    )}>
                      {remainingDebtAfterPayment > 0 
                        ? `${formatUzs(remainingDebtAfterPayment)} UZS`
                        : remainingDebtAfterPayment < 0 
                          ? `${formatUzs(Math.abs(remainingDebtAfterPayment))} UZS (Haqqi)`
                          : "0 UZS (To'liq yopildi)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Note Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)]">
                Izoh / Haydovchi / Bozor
              </label>
              <input 
                type="text" 
                value={izoh} 
                onChange={e => setIzoh(e.target.value)} 
                placeholder="Masalan: Qo'qon bozoriga berildi, haydovchi Akmal..." 
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 placeholder:text-[var(--text3)]" 
              />
            </div>

            {/* TOTAL SUMMARY BLOCK */}
            <div className="p-4 bg-gradient-to-tr from-rose-500/10 via-[var(--bg)] to-purple-500/10 rounded-2xl border border-rose-500/25 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[var(--text3)] uppercase text-[10px] tracking-wider">Jami Chiqim Miqdori:</span>
                <span className="font-black text-sm text-[var(--text)]">
                  {cartTotalUnits} <span className="text-[11px] font-semibold text-[var(--text3)]">juft</span>
                </span>
              </div>

              {effectiveDiscount > 0 && (
                <div className="flex justify-between items-center text-xs border-t border-[var(--border)] pt-1.5">
                  <span className="font-bold text-[var(--text3)] uppercase text-[10px] tracking-wider">Asl Tovar Summasi:</span>
                  <span className="font-bold text-xs text-[var(--text3)] line-through">
                    {formatUzs(cartTotalSale)} UZS
                  </span>
                </div>
              )}

              {effectiveDiscount > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase text-[10px] tracking-wider">Chegirma:</span>
                  <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">
                    -{formatUzs(effectiveDiscount)} UZS
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center text-xs border-t border-[var(--border)] pt-2">
                <span className="font-bold text-[var(--text3)] uppercase text-[10px] tracking-wider">Berilayotgan yuk puli:</span>
                <span className="font-black text-base text-rose-500">
                  {formatUzs(finalPayableTotal)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
                </span>
              </div>

              {receivedPayment > 0 && (
                <div className="flex justify-between items-center text-xs text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold uppercase text-[10px] tracking-wider">Qabul qilinayotgan to'lov ({paymentKassaTuri === 'naqd_uzs' ? 'Naqd' : paymentKassaTuri === 'karta_uzs' ? 'Karta' : 'Bank'}):</span>
                  <span className="font-black text-sm">
                    -{formatUzs(receivedPayment)} UZS
                  </span>
                </div>
              )}

              {selectedCustomerObj && (
                <div className="flex justify-between items-center text-xs border-t border-[var(--border)] pt-2">
                  <span className="font-bold text-[var(--text3)] uppercase text-[10px] tracking-wider">Hisobdan so'ng Qoldiq Qarz:</span>
                  <span className={cn(
                    "font-black text-base",
                    remainingDebtAfterPayment > 0 ? "text-rose-500" : remainingDebtAfterPayment < 0 ? "text-blue-500" : "text-emerald-500"
                  )}>
                    {formatUzs(remainingDebtAfterPayment)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
                  </span>
                </div>
              )}
            </div>

            {/* Submit / Save & Print Buttons */}
            <div className="space-y-2 pt-1">
              <button 
                type="button"
                onClick={handleSave} 
                disabled={isSaving}
                className={cn(
                  "w-full py-4 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 shadow-xl flex items-center justify-center gap-2 select-none",
                  isSaving
                    ? "bg-rose-500/40 text-white cursor-not-allowed opacity-60"
                    : cart.length === 0 || !kimga
                      ? "bg-rose-600/80 hover:bg-rose-600 active:scale-98 text-white cursor-pointer shadow-rose-600/20"
                      : "bg-rose-600 hover:bg-rose-700 active:scale-98 text-white cursor-pointer shadow-rose-600/30"
                )}
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Sotuvni Saqlash & Chek Chiqarish</span>
                  </>
                )}
              </button>

              {!kimga && cart.length > 0 && (
                <p className="text-[11px] text-center font-bold text-amber-500 animate-pulse">
                  ⚠️ Iltimos, yuqoridagi ro'yxatdan xaridorni (mijozni) tanlang
                </p>
              )}
              {cart.length === 0 && (
                <p className="text-[11px] text-center font-medium text-[var(--text3)]">
                  💡 Chap tomondan model va o'lchamlarni tanlab «Savatga Qo'shish» tugmasini bosing
                </p>
              )}
            </div>

            {/* Templates Quick Save */}
            <div className="pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3 text-purple-500" />
                  <span>Savatni Shablon Qilish:</span>
                </span>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={templateName} 
                  onChange={e => setTemplateName(e.target.value)} 
                  placeholder="Shablon nomi..." 
                  className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text)] outline-none focus:border-rose-500" 
                />
                <button 
                  type="button"
                  onClick={() => {
                    if (!templateName.trim()) return toast.error("Shablon nomini kiriting!");
                    if (cart.length === 0) return toast.error("Savat bo'sh!");
                    const templateItems = cart.map(item => ({
                      model: item.model,
                      olcham: Object.keys(item.sizes)[0],
                      soni: Object.values(item.sizes).reduce((a, b) => a + Number(b || 0), 0)
                    }));
                    saveTemplate(templateName, templateItems);
                    setTemplateName('');
                    toast.success("Shablon saqlandi!");
                  }} 
                  className="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] hover:bg-rose-500 hover:text-white rounded-xl text-xs font-black transition-colors cursor-pointer"
                >
                  Saqlash
                </button>
              </div>

              {db.templates && db.templates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {db.templates.map((t, tIdx) => (
                    <button 
                      key={`${t.id || 'tmpl'}_${tIdx}`} 
                      type="button"
                      onClick={() => {
                        const newItems: CartItem[] = t.items.map(item => ({
                          id: generateId(),
                          model: item.model,
                          sizes: { [item.olcham]: item.soni }
                        }));
                        setCart(prev => [...prev, ...newItems]);
                        toast.success(`"${t.name}" shabloni savatga qo'shildi!`);
                      }} 
                      className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] hover:border-rose-500 text-[11px] font-bold text-[var(--text2)] rounded-lg transition-colors cursor-pointer"
                    >
                      + {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Floating Mobile Sticky Cart Bar */}
        {cart.length > 0 && (
          <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30 bg-[var(--bg2)]/95 backdrop-blur-md p-3.5 rounded-2xl border border-rose-500/40 shadow-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black text-[var(--text)] block">
                  {cartTotalUnits} juft • {formatCompact(finalPayableTotal)} UZS
                </span>
                <span className="text-[10px] text-[var(--text3)] font-semibold">
                  {kimga ? kimga : "Mijoz tanlanmagan"} {effectiveDiscount > 0 ? `(-${formatCompact(effectiveDiscount)})` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                document.getElementById('checkout-panel')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md"
            >
              Kassa ⬇️
            </button>
          </div>
        )}

      </div>

      {/* 3. SOTUVLAR TARIXI JADVALI */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        {displayedGroups.length === 0 && otherOmborChiqimCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
            <span>
              ℹ️ Hozirgi tanlangan omborda chiqimlar yo'q, lekin <strong>{otherOmborName}</strong>da {otherOmborChiqimCount} ta chiqim (sotuv) amaliyoti mavjud.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 pb-3 border-b border-[var(--border)]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight flex items-center gap-2">
                  <span>📤</span> Sotuvlar Tarixi & Fakturalar
                </h2>
                <p className="text-xs text-[var(--text3)] font-medium">Barcha kassa chiqimlari va mijozlar yuk xatlari</p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                {displayedGroups.length} ta operatsiya
              </span>

              {/* Client Reassignment & Recalculate Tools */}
              <button
                type="button"
                onClick={() => setIsReassignModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-600 hover:text-white border border-blue-500/25 transition-all cursor-pointer flex items-center gap-1.5"
                title="Sotuvlarni boshqa mijozga o'tkazish"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Mijozlarga Taqsimlash</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    const updated = recalculateAllClientBalances(db);
                    setDb(updated);
                    toast.success("Barcha mijozlar balansi qayta hisoblab to'g'rilandi!");
                  } catch (e: any) {
                    toast.error("Xatolik: " + e.message);
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-600 hover:text-white border border-emerald-500/25 transition-all cursor-pointer flex items-center gap-1.5"
                title="Balanslarni qayta tekshirish"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Balanslarni Yangilash</span>
              </button>
            </div>

            {/* Date and Text Search */}
            <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs sm:text-sm font-bold outline-none text-[var(--text)] focus:border-rose-500"
              />
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                <input 
                  type="text" 
                  placeholder="Mijoz, model, sana bo'yicha..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-xs sm:text-sm font-semibold text-[var(--text)] outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          {/* Quick Date Presets & Ombor Scope Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)] mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-[var(--text3)]">Sana:</span>
              <button
                type="button"
                onClick={() => setQuickDate('all')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer",
                  !startDate ? "bg-rose-500 text-white border-rose-500" : "bg-[var(--bg)] text-[var(--text3)] border-[var(--border)]"
                )}
              >
                Hammasi
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('today')}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] cursor-pointer"
              >
                Bugun
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('7days')}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] cursor-pointer"
              >
                Oxirgi 7 kun
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('month')}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] cursor-pointer"
              >
                Shu oy
              </button>
            </div>

            {/* Cross-device Ombor Scope & Live Cloud Refresh */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-[var(--bg)] p-0.5 rounded-xl border border-[var(--border)] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setHistoryOmborScope('current')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                    historyOmborScope === 'current'
                      ? "bg-rose-600 text-white shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title={`Faqat ${currentOmbor.toUpperCase()} ombori chiqimlari`}
                >
                  {currentOmbor === 'tepa' ? 'Tepa' : currentOmbor === 'kotta' ? 'Kotta' : '2-Sort'} ombor
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOmborScope('all')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                    historyOmborScope === 'all'
                      ? "bg-rose-600 text-white shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Barcha omborlar (Tepa + Kotta + 2-Sort) bo'yicha barcha qurilmalar chiqimlarini ko'rish"
                >
                  Barcha omborlar
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setIsCloudRefreshing(true);
                  try {
                    await pullLatestFromCloud(true);
                  } finally {
                    setIsCloudRefreshing(false);
                  }
                }}
                disabled={isCloudRefreshing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="Boshqa qurilmalardagi yangi chiqimlarni darhol bulutdan tekshirish va yangilash"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isCloudRefreshing && "animate-spin")} />
                <span className="hidden sm:inline">Yangilash</span>
              </button>
            </div>
          </div>
        </div>

        {/* History Table */}
        {/* DESKTOP TABLE - 100% untouched for desktop computers */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] font-black uppercase tracking-wider text-[var(--text3)] bg-[var(--bg)]">
                <th className="px-4 py-3 rounded-l-2xl">Sana / Vaqt</th>
                <th className="px-4 py-3">Mijoz (Kimga)</th>
                <th className="px-4 py-3">Xodim</th>
                <th className="px-4 py-3 text-right">Jami Juft</th>
                <th className="px-4 py-3 text-right">Umumiy Summa</th>
                <th className="px-4 py-3 text-right rounded-r-2xl">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {displayedGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--text3)] py-12 italic text-sm font-medium">
                    {search ? "Qidiruv bo'yicha hech narsa topilmadi" : "Hali hech qanday chiqim (sotuv) bajarilmagan"}
                  </td>
                </tr>
              ) : (
                displayedGroups.map((g, gIdx) => (
                  <React.Fragment key={`${g.id || 'group'}_${gIdx}`}>
                    <tr 
                      onClick={() => toggleGroup(g.id)}
                      className="hover:bg-[var(--bg)] transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5 text-xs text-[var(--text3)]">
                        <div className="font-black text-[var(--text)] text-xs sm:text-sm">{g.sana}</div>
                        <div className="text-[11px] font-medium opacity-75">{String(g.vaqt || '').slice(-8) || String(g.vaqt || '')}</div>
                      </td>
                      <td className="px-4 py-3.5 font-extrabold text-[var(--text)] text-xs sm:text-sm">{g.kimga}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-[var(--text3)]">{g.xodim}</td>
                      <td className="px-4 py-3.5 text-right font-black text-rose-500 text-xs sm:text-sm">{g.jamiSoni} juft</td>
                      <td className="px-4 py-3.5 text-right font-black text-[var(--text)] text-xs sm:text-sm">
                        <div>
                          <span>{formatUzs(g.jamiSumma || 0)}</span> <span className="text-[10px] font-normal text-[var(--text3)]">UZS</span>
                        </div>
                        {(() => {
                          const gPayments = findInvoicePayments(g, db.kassaHarakatlari || []);
                          const gPaid = gPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
                          const gRem = Math.max(0, (g.jamiSumma || 0) - gPaid);
                          if (gPaid <= 0) return null;
                          return (
                            <div className="flex flex-col items-end gap-0.5 mt-0.5">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                                To'langan: {formatCompact(gPaid)}
                              </span>
                              {gRem > 0 && (
                                <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                                  Qoldiq: {formatCompact(gRem)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenQuickPayment(g)}
                            className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-emerald-500/20"
                            title="To'lov qabul qilish"
                          >
                            <Wallet size={13} />
                            <span className="hidden sm:inline">To'lov</span>
                          </button>

                          {!isOmborchi && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditGroup(g)}
                              className="px-2.5 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="Tahrirlash"
                            >
                              <Edit2 size={13} />
                              <span className="hidden sm:inline">Tahrirlash</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => showGroupReceipt(g)}
                            className="px-2.5 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                            title="Chek / Faktura chiqarish"
                          >
                            <Printer size={13} />
                            <span>Chek</span>
                          </button>

                          <button 
                            onClick={() => toggleGroup(g.id)}
                            className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                          >
                            {expandedGroups[g.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedGroups[g.id] && (
                      <tr className="bg-[var(--bg)]/70">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                            <div className="text-xs font-black uppercase tracking-wider text-[var(--text3)] mb-2">Tafsilotlar (Modellar bo'yicha)</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {(g.cartItems || []).map((item: any, idx: number) => {
                                const sizesRecord = (item?.sizes || {}) as Record<string, number>;
                                const sizeStr = Object.entries(sizesRecord)
                                  .filter(([, q]) => Number(q) > 0)
                                  .map(([sz, q]) => `${sz}°: ${q}ta`)
                                  .join(', ');
                                const itemTotalQty = Object.values(sizesRecord).reduce((a, b) => a + Number(b || 0), 0);
                                const price = Number(db.prices?.[item?.model]?.sale || 0);

                                return (
                                  <div key={idx} className="bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] flex items-center justify-between">
                                    <div>
                                      <div className="font-extrabold text-xs text-[var(--text)]">{item?.model}</div>
                                      <div className="text-[11px] text-[var(--text3)] font-medium mt-0.5">{sizeStr}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-black text-xs text-rose-500">{itemTotalQty} juft</div>
                                      <div className="text-[10px] text-[var(--text3)] font-semibold">{formatCompact(price * itemTotalQty)} UZS</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS - Purpose-built for phones (Zero horizontal scroll, touch-friendly) */}
        <div className="md:hidden space-y-3">
          {displayedGroups.length === 0 ? (
            <div className="text-center text-[var(--text3)] py-12 italic text-xs font-medium">
              {search ? "Qidiruv bo'yicha hech narsa topilmadi" : "Hali hech qanday chiqim (sotuv) bajarilmagan"}
            </div>
          ) : (
            displayedGroups.map((g, gIdx) => (
              <div 
                key={`${g.id || 'group'}_${gIdx}`} 
                className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex flex-col gap-3 transition-all"
              >
                {/* Header: Client & Date */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base text-[var(--text)]">
                      {g.kimga || "Noma'lum mijoz"}
                    </h4>
                    <div className="text-[11px] font-semibold text-[var(--text3)] mt-0.5">
                      📅 {g.sana} • {String(g.vaqt || '').slice(-8) || String(g.vaqt || '')}
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[10px] font-bold text-[var(--text3)]">
                    {g.xodim}
                  </span>
                </div>

                {/* Key Metrics: Pairs & Total Sum */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
                  <div className="bg-[var(--bg2)] p-2.5 rounded-xl border border-[var(--border)] flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Jami Juft</span>
                    <span className="font-black text-rose-500 text-sm tabular-nums mt-0.5">
                      {g.jamiSoni} juft
                    </span>
                  </div>
                  <div className="bg-[var(--bg2)] p-2.5 rounded-xl border border-[var(--border)] flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Umumiy Summa</span>
                    <span className="font-black text-[var(--text)] text-sm tabular-nums mt-0.5">
                      {formatUzs(g.jamiSumma || 0)} <span className="text-[10px] font-normal text-[var(--text3)]">UZS</span>
                    </span>
                    {(() => {
                      const gPayments = findInvoicePayments(g, db.kassaHarakatlari || []);
                      const gPaid = gPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
                      const gRem = Math.max(0, (g.jamiSumma || 0) - gPaid);
                      if (gPaid <= 0) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-[var(--border)] text-[10px] font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">To'landi: {formatCompact(gPaid)}</span>
                          {gRem > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">Qoldiq: {formatCompact(gRem)}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenQuickPayment(g)}
                      className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-emerald-500/20"
                      title="To'lov kiritish"
                    >
                      <Wallet size={13} />
                      <span>To'lov</span>
                    </button>

                    {!isOmborchi && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditGroup(g)}
                        className="px-2.5 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-blue-500/20"
                        title="Tahrirlash"
                      >
                        <Edit2 size={13} />
                        <span>Tahrirlash</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => showGroupReceipt(g)}
                      className="px-2.5 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-rose-500/20"
                      title="Chek chiqarish"
                    >
                      <Printer size={13} />
                      <span>Chek</span>
                    </button>
                  </div>

                  <button 
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className="px-3 py-1.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text2)] flex items-center gap-1 cursor-pointer"
                  >
                    <span>{expandedGroups[g.id] ? "Yopish" : `Tafsilot (${g.cartItems?.length || 0})`}</span>
                    {expandedGroups[g.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Expanded Details: Cart items in this sale */}
                {expandedGroups[g.id] && (
                  <div className="pt-2 border-t border-[var(--border)] space-y-2 animate-in fade-in duration-150">
                    {(g.cartItems || []).map((item: any, idx: number) => {
                      const sizesRecord = (item?.sizes || {}) as Record<string, number>;
                      const sizeStr = Object.entries(sizesRecord)
                        .filter(([, q]) => Number(q) > 0)
                        .map(([sz, q]) => `${sz}°: ${q}ta`)
                        .join(', ');
                      const itemTotalQty = Object.values(sizesRecord).reduce((a, b) => a + Number(b || 0), 0);
                      const price = Number(db.prices?.[item?.model]?.sale || 0);

                      return (
                        <div key={idx} className="bg-[var(--bg2)] p-2.5 rounded-xl border border-[var(--border)] flex items-center justify-between text-xs">
                          <div>
                            <div className="font-extrabold text-[var(--text)]">{item?.model}</div>
                            <div className="text-[10px] text-[var(--text3)] font-medium mt-0.5">{sizeStr}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-xs text-rose-500">{itemTotalQty} juft</div>
                            <div className="text-[10px] text-[var(--text3)] font-semibold">{formatCompact(price * itemTotalQty)} UZS</div>
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
            <div className="p-4 flex justify-center border-t border-[var(--border)] bg-[var(--bg)]">
              <button 
                onClick={() => setVisibleCount(v => v + 50)} 
                className="px-6 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] hover:text-rose-500 hover:border-rose-500 transition-colors cursor-pointer"
              >
                Yana ko'rsatish ({filteredGroups.length - visibleCount} ta qoldi)
              </button>
            </div>
          )}
      </div>

      {/* 4. RECEIPT & INVOICE MODAL (WITH POS 80MM / A4 TOGGLE) */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 print-receipt-modal print:fixed print:inset-0 print:bg-white print:p-0 print:m-0 print:z-[99999]">
          <div className="bg-white text-black rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col h-[90vh] max-h-[92vh] min-h-0 relative print-modal-card print:shadow-none print:w-full print:max-w-none print:rounded-none print:h-auto print:block overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 print:hidden bg-gray-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Yuk Xati & Savdo Cheki</h3>
                  <p className="text-xs text-gray-500">Mijoz: {receiptData.kimga} • {receiptData.totalQty} juft</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-200 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setReceiptViewMode('standard')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      receiptViewMode === 'standard' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600"
                    )}
                  >
                    A4 Faktura
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptViewMode('thermal')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      receiptViewMode === 'thermal' ? "bg-white text-gray-900 shadow-xs" : "text-gray-600"
                    )}
                  >
                    80mm Kassa Cheki
                  </button>
                </div>

                <button 
                  onClick={() => setReceiptData(null)} 
                  className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Printable Content Area */}
            <div className="min-h-0 flex-1 overflow-y-auto w-full p-3 sm:p-6 bg-gray-100/70 print:p-0 print:bg-white flex justify-center overscroll-contain">
              <div 
                id="print-receipt" 
                className="bg-white relative w-full max-w-[820px] shadow-md rounded-2xl print:shadow-none print:rounded-none print:max-w-none print:w-full print:m-0 h-fit"
              >
                
                {receiptViewMode === 'thermal' ? (
                  /* 80mm THERMAL RECEIPT VIEW */
                  <div className="max-w-[380px] mx-auto text-black font-mono text-xs border border-gray-300 p-4 rounded-xl shadow-xs thermal-receipt-container">
                    <div className="text-center pb-3 border-b border-dashed border-gray-400">
                      <h2 className="text-base font-black uppercase">OMBOR PRO</h2>
                      <p className="text-[11px]">Poyabzal ishlab chiqarish va ombori</p>
                      <p className="text-[10px] text-gray-600 mt-1">Tel: +998 90 000-00-00</p>
                    </div>

                    <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Xaridor:</span>
                        <strong className="font-bold">{receiptData.kimga}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Sana:</span>
                        <span>{receiptData.sana}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ombor:</span>
                        <span>{currentOmbor.toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="py-2 border-b border-dashed border-gray-400 space-y-2">
                      {groupedCartItems.map((item, i) => {
                        const szStr = Object.entries(item.sizes)
                          .filter(([, q]) => (q as number) > 0)
                          .map(([sz, q]) => `${sz}:${q}`)
                          .join(' ');
                        const rowSum = item.totalQty * item.price;
                        return (
                          <div key={i} className="text-[11px]">
                            <div className="flex justify-between font-bold">
                              <span>{i + 1}. {item.displayName}</span>
                              <span>{formatCompact(rowSum)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-600">
                              <span>({szStr})</span>
                              <span>{item.totalQty} juft × {formatCompact(item.price)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    <div className="pt-2.5 space-y-1.5 text-[12px]">
                      <div className="flex items-center justify-between font-bold py-1.5 px-2 bg-gray-100 rounded-lg">
                        <span className="whitespace-nowrap">JAMI JUFT:</span>
                        <span className="whitespace-nowrap font-black">{receiptData.totalQty} juft</span>
                      </div>
                      {receiptData.discount && receiptData.discount > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-[11px] text-gray-600 px-2 py-0.5">
                            <span className="whitespace-nowrap">ASL TOVAR SUMMASI:</span>
                            <span className="whitespace-nowrap font-bold">{formatUzs(receiptData.originalSale || (receiptData.totals.sale + receiptData.discount))} UZS</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-red-600 font-bold px-2 py-1 bg-red-50 rounded-lg">
                            <span className="whitespace-nowrap">CHEGIRMA:</span>
                            <span className="whitespace-nowrap">-{formatUzs(receiptData.discount)} UZS</span>
                          </div>
                        </>
                      ) : null}

                      {/* 1. Berilayotgan yuk puli */}
                      <div className="flex items-center justify-between font-bold text-xs px-2 py-1 border-t border-gray-300">
                        <span className="whitespace-nowrap">BERILAYOTGAN YUK PULI:</span>
                        <span className="whitespace-nowrap font-black">{formatUzs(receiptData.shipmentTotal ?? receiptData.totals.sale)} UZS</span>
                      </div>

                      {/* 2. Avvalgi qarz */}
                      <div className="flex items-center justify-between text-[11px] text-gray-700 px-2 py-0.5">
                        <span className="whitespace-nowrap">AVVALGI QARZ:</span>
                        <span className="whitespace-nowrap font-bold">{formatUzs(receiptData.oldBalance ?? 0)} UZS</span>
                      </div>

                      {/* 3. Hozirgi qabul qilingan summa */}
                      <div className="flex items-center justify-between font-bold text-xs text-emerald-800 px-2 py-1 bg-emerald-50 rounded-md">
                        <span className="whitespace-nowrap">QABUL QILINDI ({receiptData.paymentMethod || 'Naqd'}):</span>
                        <span className="whitespace-nowrap font-black">-{formatUzs(receiptData.paidAmount ?? 0)} UZS</span>
                      </div>

                      {/* 4. Qoldiq qarz */}
                      <div className="flex items-center justify-between font-black text-sm pt-1.5 pb-1 px-2 border-t-2 border-gray-900 bg-gray-100 rounded-lg">
                        <span className="whitespace-nowrap">QOLDIQ QARZ:</span>
                        <span className={cn(
                          "whitespace-nowrap font-black",
                          (receiptData.remainingDebt ?? 0) > 0 ? "text-red-600" : "text-emerald-700"
                        )}>
                          {formatUzs(receiptData.remainingDebt ?? 0)} UZS
                        </span>
                      </div>
                    </div>

                    <div className="text-center pt-4 mt-4 border-t border-dashed border-gray-400 text-[10px] text-gray-500">
                      Xaridingiz uchun rahmat!
                    </div>
                  </div>
                ) : (
                  /* STANDARD A4 INVOICE VIEW (FULL-WIDTH, HIGH RESOLUTION VECTOR PRINT) */
                  <div className="p-6 sm:p-8 space-y-6 text-gray-900 bg-white a4-invoice-container w-full">
                    {/* 1. PROFESSIONAL FACTORY & DOCUMENT HEADER */}
                    <div className="border-b-2 border-gray-900 pb-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-sm">
                              F
                            </span>
                            <span className="text-lg font-black tracking-wider uppercase text-gray-900">
                              «FALAK SHOE» MChJ
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 font-semibold mt-1">
                            Poyabzal ishlab chiqarish va ulgurji savdo ombori • {currentOmbor.toUpperCase()}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <div className="inline-block bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg">
                            <span className="text-xs font-black uppercase tracking-widest text-rose-600">
                              YUK XATI (FAKTURA)
                            </span>
                          </div>
                          <div className="text-sm font-black text-gray-900 mt-1">
                            № CH-{Date.now().toString().slice(-6)}
                          </div>
                          <div className="text-xs font-semibold text-gray-500">
                            Sana: {receiptData.sana}
                          </div>
                        </div>
                      </div>

                      {/* Client dossier box */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-gray-200">
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                            👤 Xaridor (Qabul qiluvchi):
                          </span>
                          <div className="text-sm font-black text-gray-900 mt-0.5">
                            {receiptData.kimga}
                          </div>
                          {selectedCustomerObj?.tel && (
                            <div className="text-xs text-gray-600 font-medium mt-0.5">
                              Tel: {selectedCustomerObj.tel}
                            </div>
                          )}
                          {selectedCustomerObj?.manzil && (
                            <div className="text-xs text-gray-600 font-medium mt-0.5">
                              Manzil: {selectedCustomerObj.manzil}
                            </div>
                          )}
                        </div>

                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                              🏢 Jo'natuvchi (Ombor):
                            </span>
                            <div className="text-xs font-black text-gray-800 mt-0.5">
                              «FALAK SHOE» — {currentOmbor.toUpperCase()}
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-500 font-medium mt-1">
                            Mas'ul xodim: <strong className="text-gray-800 font-bold">{currentUser?.ism || 'Omborchi'}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. PRODUCTS TABLE (FULL WIDTH, PERFECT PRINT BORDERS) */}
                    <div className="border border-gray-300 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-gray-100 text-gray-800 font-black uppercase text-[10px] tracking-wider border-b border-gray-300">
                          <tr>
                            <th className="p-2.5 w-8 text-center border-r border-gray-300">#</th>
                            <th className="p-2.5 border-r border-gray-300">Model nomi</th>
                            <th className="p-2.5 border-r border-gray-300">O'lchamlar taqsimoti</th>
                            <th className="p-2.5 text-right border-r border-gray-300 w-24">Miqdori</th>
                            <th className="p-2.5 text-right border-r border-gray-300 w-28">Narxi</th>
                            <th className="p-2.5 text-right w-32">Summa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-300 font-semibold bg-white">
                          {groupedCartItems.map((item, idx) => {
                            const sizeDetails = Object.entries(item.sizes)
                              .filter(([, qty]) => (qty as number) > 0)
                              .map(([sz, qty]) => `${sz}°: ${qty}`)
                              .join(', ');
                            const itemTotalSum = item.totalQty * item.price;
                            return (
                              <tr key={idx} className={idx % 2 === 1 ? "bg-gray-50/50" : ""}>
                                <td className="p-2.5 text-center border-r border-gray-300 text-gray-500 font-bold">{idx + 1}</td>
                                <td className="p-2.5 border-r border-gray-300 font-black text-gray-900">{item.displayName}</td>
                                <td className="p-2.5 border-r border-gray-300 font-mono text-[11px] text-gray-700">{sizeDetails}</td>
                                <td className="p-2.5 border-r border-gray-300 text-right font-black text-gray-900">{item.totalQty} juft</td>
                                <td className="p-2.5 border-r border-gray-300 text-right text-gray-700">{formatCompact(item.price)}</td>
                                <td className="p-2.5 text-right font-black text-gray-900">{formatUzs(itemTotalSum)} UZS</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-100 font-black border-t-2 border-gray-300 text-gray-900">
                          <tr>
                            <td colSpan={3} className="p-2.5 text-right border-r border-gray-300 uppercase text-[11px]">
                              JAMI YUK MIQDORI:
                            </td>
                            <td className="p-2.5 text-right border-r border-gray-300 font-black text-rose-600 text-sm">
                              {receiptData.totalQty} juft
                            </td>
                            <td className="p-2.5 text-right border-r border-gray-300 uppercase text-[11px]">
                              YUK PULI:
                            </td>
                            <td className="p-2.5 text-right font-black text-sm">
                              {formatUzs(receiptData.shipmentTotal ?? receiptData.totals.sale)} UZS
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* 3. TOTALS & FINANCIAL SUMMARY CARD */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-1">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="font-semibold text-gray-700">Hujjat bo'yicha eslatma:</div>
                        <p className="text-[11px] text-gray-500 max-w-sm">
                          Mazkur yuk xati tovarlar topshirilganligini va o'zaro hisob-kitob holatini tasdiqlovchi rasmiy hujjat hisoblanadi.
                        </p>
                      </div>

                      <div className="w-full sm:w-96 space-y-1.5 border border-gray-200 p-3.5 rounded-2xl bg-gray-50/60">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white px-3.5 py-1.5 rounded-xl border border-gray-200">
                          <span className="whitespace-nowrap uppercase text-gray-600 font-bold text-[11px]">Jami Miqdor:</span>
                          <span className="font-black text-gray-900 text-sm whitespace-nowrap">{receiptData.totalQty} juft</span>
                        </div>
                        {receiptData.discount && receiptData.discount > 0 ? (
                          <>
                            <div className="flex items-center justify-between text-xs font-bold text-gray-500 px-3.5 py-0.5">
                              <span className="whitespace-nowrap text-[11px]">ASL TOVAR SUMMASI:</span>
                              <span className="font-bold whitespace-nowrap">{formatUzs(receiptData.originalSale || (receiptData.totals.sale + receiptData.discount))} UZS</span>
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-1 rounded-xl border border-emerald-200">
                              <span className="whitespace-nowrap text-[11px]">CHEGIRMA:</span>
                              <span className="font-black whitespace-nowrap">-{formatUzs(receiptData.discount)} UZS</span>
                            </div>
                          </>
                        ) : null}
                        
                        {/* 1. Berilayotgan yuk puli */}
                        <div className="flex items-center justify-between text-xs font-black text-gray-900 bg-gray-100 px-3.5 py-2 rounded-xl border border-gray-300">
                          <span className="whitespace-nowrap uppercase text-xs text-gray-700">Berilayotgan yuk puli:</span>
                          <span className="text-sm font-black text-gray-900 whitespace-nowrap">{formatUzs(receiptData.shipmentTotal ?? receiptData.totals.sale)} UZS</span>
                        </div>

                        {/* 2. Avvalgi qarz */}
                        <div className="flex items-center justify-between text-xs px-3.5 py-1 text-gray-700">
                          <span className="whitespace-nowrap uppercase text-[11px] text-gray-500 font-bold">Avvalgi qarz:</span>
                          <span className="font-bold text-gray-800 whitespace-nowrap">{formatUzs(receiptData.oldBalance ?? 0)} UZS</span>
                        </div>

                        {/* 3. Hozirgi qabul qilingan summa */}
                        <div className="flex items-center justify-between text-xs px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold">
                          <span className="whitespace-nowrap uppercase text-[11px]">Qabul qilingan to'lov ({receiptData.paymentMethod || 'Naqd'}):</span>
                          <span className="font-black text-emerald-700 whitespace-nowrap">-{formatUzs(receiptData.paidAmount ?? 0)} UZS</span>
                        </div>

                        {/* 4. Qoldiq qarz */}
                        <div className="flex items-center justify-between text-sm font-black bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-sm">
                          <span className="whitespace-nowrap uppercase text-xs text-gray-200">Qoldiq qarz:</span>
                          <span className={cn(
                            "text-base font-black whitespace-nowrap",
                            (receiptData.remainingDebt ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"
                          )}>
                            {formatUzs(receiptData.remainingDebt ?? 0)} UZS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4. SIGNATURES */}
                    <div className="flex justify-between items-end border-t border-gray-300 pt-6 mt-4">
                      <div className="text-left w-52 space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Topshirdi (Omborchi):</span>
                        <div className="border-b border-gray-400 pb-4 pt-2"></div>
                        <span className="text-[10px] text-gray-400">Imzo / F.I.SH</span>
                      </div>
                      <div className="text-right w-52 space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Qabul qildi (Xaridor):</span>
                        <div className="border-b border-gray-400 pb-4 pt-2"></div>
                        <span className="text-[10px] text-gray-400">Imzo / F.I.SH</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap sm:flex-nowrap gap-3 shrink-0 print:hidden">
              <button 
                type="button"
                disabled={isReceiptPrinting}
                onClick={() => {
                  printReceipt('print-receipt', {
                    title: `Yuk Xati - ${receiptData?.kimga || 'Mijoz'}`,
                    pageSize: receiptViewMode === 'thermal' ? 'thermal-80' : 'A4'
                  });
                }} 
                className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-800 rounded-2xl text-xs sm:text-sm font-black hover:bg-gray-100 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
              >
                <Printer size={16} />
                <span>{isReceiptPrinting ? "Tayyorlanmoqda..." : "Chop etish (Print)"}</span>
              </button>

              <button 
                onClick={handleDownloadPDF} 
                className="flex-1 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs sm:text-sm font-black hover:bg-rose-100 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Download size={16} />
                <span>PDF Yuklash</span>
              </button>

              <button 
                onClick={handleShare} 
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-2xl text-xs sm:text-sm font-black hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 size={16} />
                <span>Telegram / Ulashish</span>
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 5. QUICK CLIENT CREATION MODAL */}
      {isQuickClientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-black">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Yangi Mijoz Qo'shish</h3>
                  <p className="text-xs text-[var(--text3)]">Tezkor bazaga kiritish va tanlash</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickClientOpen(false)}
                className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickClient} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-black text-[var(--text)]">Mijoz / Do'kon Nomi *</label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Masalan: Sardor Aka (Qo'qon)"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-black text-[var(--text)] outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-[var(--text)]">Telefon Raqami (Ixtiyoriy)</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[var(--text)] outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-[var(--text)]">Mijoz Toifasi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewClientCategory('Ulgurji')}
                    className={cn(
                      "py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                      newClientCategory === 'Ulgurji' ? "bg-rose-500 text-white border-rose-500" : "bg-[var(--bg)] text-[var(--text2)] border-[var(--border)]"
                    )}
                  >
                    Ulgurji (Optom)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewClientCategory('Chakana')}
                    className={cn(
                      "py-2 rounded-xl text-xs font-black border transition-all cursor-pointer",
                      newClientCategory === 'Chakana' ? "bg-rose-500 text-white border-rose-500" : "bg-[var(--bg)] text-[var(--text2)] border-[var(--border)]"
                    )}
                  >
                    Chakana (Dona)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black cursor-pointer shadow-md shadow-rose-500/25"
                >
                  Saqlash va Tanlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. FULL INVOICE & PRODUCT EDIT MODAL */}
      {editingGroup && !isOmborchi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Fakturani Tahrirlash & Mahsulot Qo'shish</h3>
                  <p className="text-xs text-[var(--text3)]">
                    Faktura #{String(editingGroup.groupId || '').slice(-6) || ''} • Mijoz: <strong className="text-[var(--text)]">{editingGroup.kimga}</strong> • Jami: <strong className="text-rose-500">{editingGroup.jamiSoni} juft</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="p-1.5 rounded-xl text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              
              {/* 1. Header Metadata Section */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text3)] block">
                  📋 Faktura Asosiy Ma'lumotlari
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--text2)] flex items-center gap-1.5">
                      <Calendar size={13} className="text-blue-500" />
                      <span>Sana</span>
                    </label>
                    <input
                      type="date"
                      value={editingGroup.sana}
                      onChange={(e) => setEditingGroup(prev => prev ? { ...prev, sana: e.target.value } : null)}
                      className="w-full p-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--text2)] flex items-center gap-1.5">
                      <User size={13} className="text-blue-500" />
                      <span>Mas'ul xodim</span>
                    </label>
                    <input
                      type="text"
                      value={editingGroup.xodim}
                      onChange={(e) => setEditingGroup(prev => prev ? { ...prev, xodim: e.target.value } : null)}
                      className="w-full p-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--text2)]">Faktura Izohi</label>
                    <input
                      type="text"
                      value={editingGroup.izoh}
                      onChange={(e) => setEditingGroup(prev => prev ? { ...prev, izoh: e.target.value } : null)}
                      placeholder="Izoh yozing..."
                      className="w-full p-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text)] outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-[var(--text2)] flex items-center gap-1.5">
                    <User size={13} className="text-rose-500" />
                    <span>Mijoz (Qabul qiluvchi do'kon / xaridor) *</span>
                  </label>
                  <ClientSearchSelect
                    value={editingGroup.kimga}
                    onChange={(name) => setEditingGroup(prev => prev ? { ...prev, kimga: name } : null)}
                    placeholder="Mijoz nomini yozing yoki tanlang..."
                    inputClassName="py-2.5 rounded-xl text-xs sm:text-sm font-black"
                  />
                </div>
              </div>

              {/* 2. Products List in this Invoice */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
                  <div>
                    <h4 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-rose-500" />
                      <span>Faktura Mahsulotlari ({editingGroup.editableItems.length} ta model)</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text3)]">
                      O'lchamlar sonini o'zgartiring, tovarlarni o'chiring yoki unutilgan mahsulotni qo'shing
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditAddOpen(v => !v);
                      if (!editAddOpen && inStockModels.length > 0 && !editAddModel) {
                        const firstM = inStockModels[0];
                        setEditAddModel(firstM);
                        setEditAddPrice(String(db.prices?.[firstM]?.sale || ''));
                      }
                    }}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs",
                      editAddOpen 
                        ? "bg-rose-500 text-white" 
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                  >
                    {editAddOpen ? (
                      <>
                        <X size={14} />
                        <span>Qo'shishni Yopish</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>+ Unutilgan Mahsulot Qo'shish</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Sub-Panel: Add New Forgotten Product */}
                {editAddOpen && (
                  <div className="bg-[var(--bg2)] border-2 border-blue-500/30 rounded-2xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <Sparkles size={14} />
                        <span>Unutilgan Yangi Mahsulotni Fakturaga Kiritish</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Model Select */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">Model nomi *</label>
                        <select
                          value={editAddModel}
                          onChange={(e) => {
                            const newM = e.target.value;
                            setEditAddModel(newM);
                            setEditAddPrice(String(db.prices?.[newM]?.sale || ''));
                          }}
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-blue-500"
                        >
                          <option value="">-- Modelni tanlang --</option>
                          {allModels.map(m => (
                            <option key={m} value={m}>
                              {m} {activeStock[m] ? `(${Object.values(activeStock[m]).reduce((a, b) => a + Number(b || 0), 0)} juft omborda)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Ombor Select */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">Ombor</label>
                        <select
                          value={editAddOmbor}
                          onChange={(e) => setEditAddOmbor(e.target.value as WarehouseName)}
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-blue-500"
                        >
                          <option value="tepa">Tepa Ombor</option>
                          <option value="kotta">Kotta Ombor</option>
                          <option value="sort2">2-Sort Ombor</option>
                        </select>
                      </div>

                      {/* Sale Price Input */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">Sotuv Narxi (UZS / juft) *</label>
                        <input
                          type="number"
                          value={editAddPrice}
                          onChange={(e) => setEditAddPrice(e.target.value)}
                          placeholder="Narx..."
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Quick fill buttons */}
                    {editAddModel && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const nSizes: Record<string, number> = {};
                            ALL_SIZES.forEach(sz => { nSizes[sz] = 1; });
                            setEditAddSizes(nSizes);
                          }}
                          className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[10px] font-bold text-[var(--text2)] hover:border-blue-500 cursor-pointer"
                        >
                          Barchasiga 1 tadan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const modelStock = db[editAddOmbor]?.stock?.[editAddModel] || {};
                            const nSizes: Record<string, number> = {};
                            ALL_SIZES.forEach(sz => {
                              const avail = modelStock[sz] || 0;
                              if (avail > 0) nSizes[sz] = avail;
                            });
                            setEditAddSizes(nSizes);
                          }}
                          className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[10px] font-bold text-[var(--text2)] hover:border-blue-500 cursor-pointer"
                        >
                          Ombordagi borini to'ldirish
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditAddSizes({})}
                          className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[10px] font-bold text-rose-500 hover:border-rose-500 cursor-pointer"
                        >
                          Tozalash
                        </button>
                      </div>
                    )}

                    {/* Size Inputs Grid */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[var(--text3)] uppercase">O'lchamlar va Juft soni:</label>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {ALL_SIZES.map(sz => {
                          const count = editAddSizes[sz] || 0;
                          const avail = (db[editAddOmbor]?.stock?.[editAddModel]?.[sz]) || 0;
                          return (
                            <div 
                              key={sz} 
                              className={cn(
                                "flex flex-col items-center p-2 rounded-xl border text-center transition-all",
                                count > 0 
                                  ? "bg-blue-500/10 border-blue-500" 
                                  : "bg-[var(--bg)] border-[var(--border)]"
                              )}
                            >
                              <span className="text-[11px] font-black">{sz}°</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min="0"
                                value={count > 0 ? count : ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setEditAddSizes(prev => {
                                    const c = { ...prev };
                                    if (val <= 0) delete c[sz];
                                    else c[sz] = val;
                                    return c;
                                  });
                                }}
                                placeholder="0"
                                className="w-full text-center bg-transparent text-sm font-black outline-none h-10 min-h-[40px] text-[var(--text)]"
                              />
                              <span className="text-[9px] font-medium opacity-60">Qoldiq: {avail}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setEditAddOpen(false)}
                        className="px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text2)] cursor-pointer"
                      >
                        Bekor qilish
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAddProduct}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus size={14} />
                        <span>Fakturaga Qo'shish</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-3">
                  {editingGroup.editableItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--text3)] italic border border-dashed border-[var(--border)] rounded-2xl">
                      Fakturada mahsulot qolmadi. Yuqoridagi tugma orqali mahsulot qo'shing.
                    </div>
                  ) : (
                    editingGroup.editableItems.map((item, idx) => (
                      <div 
                        key={item.id || idx}
                        className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3.5 space-y-3 transition-all hover:border-[var(--border)]/80"
                      >
                        {/* Top info row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="text-sm font-black text-[var(--text)] flex items-center gap-2">
                                <span>{item.model}</span>
                                {item.is2Sort && (
                                  <span className="px-1.5 py-0.2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-[9px] font-black uppercase">
                                    2-Sort
                                  </span>
                                )}
                                <span className="px-1.5 py-0.2 bg-[var(--bg)] border border-[var(--border)] text-[9px] font-bold text-[var(--text3)] rounded uppercase">
                                  {item.ombor}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[var(--text3)] font-medium">Narx:</span>
                              <input
                                type="number"
                                value={item.price}
                                onChange={(e) => handleUpdateItemPrice(item.id, Number(e.target.value) || 0)}
                                className="w-24 p-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs font-black text-right text-[var(--text)] outline-none focus:border-blue-500"
                              />
                              <span className="text-[10px] text-[var(--text3)]">UZS</span>
                            </div>

                            <div className="text-right">
                              <span className="text-xs font-black text-rose-500 block">{item.totalQty} juft</span>
                              <span className="text-[10px] font-bold text-[var(--text3)]">{formatCompact(item.totalSumma)} UZS</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Ushbu modelni fakturadan o'chirish"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Sizes stepper chips */}
                        <div>
                          <div className="text-[10px] font-bold text-[var(--text3)] uppercase mb-1.5">O'lchamlar soni:</div>
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                            {ALL_SIZES.map(sz => {
                              const count = item.sizes[sz] || 0;
                              return (
                                <div 
                                  key={sz}
                                  className={cn(
                                    "flex flex-col items-center p-1.5 rounded-xl border transition-all",
                                    count > 0 
                                      ? "bg-blue-500/10 border-blue-500/40" 
                                      : "bg-[var(--bg)] border-[var(--border)] opacity-60"
                                  )}
                                >
                                  <span className="text-[10px] font-black">{sz}°</span>
                                  <div className="flex items-center gap-1 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemSize(item.id, sz, Math.max(0, count - 1))}
                                      className="w-5 h-5 rounded bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center text-xs font-bold hover:bg-rose-500 hover:text-white cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="w-5 text-center text-xs font-black text-[var(--text)]">
                                      {count}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateItemSize(item.id, sz, count + 1)}
                                      className="w-5 h-5 rounded bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center text-xs font-bold hover:bg-blue-600 hover:text-white cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 3. Invoice Payment Section */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
                  <div>
                    <h4 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-500" />
                      <span>Shu Faktura / Kun Uchun To'lov Qabul Qilish</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text3)]">
                      Kassaga kirim qilib, mijoz qarzdorligidan darhol ayirib tashlash
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-[var(--bg2)] px-3 py-1.5 rounded-xl border border-[var(--border)]">
                    <input
                      type="checkbox"
                      checked={editingGroup.enablePayment}
                      onChange={(e) => setEditingGroup(prev => prev ? { ...prev, enablePayment: e.target.checked } : null)}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-black text-[var(--text)]">To'lov kiritish</span>
                  </label>
                </div>

                {/* Show and manage existing payments on this invoice */}
                {editingGroup.existingPayments.length > 0 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
                      <div className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={14} />
                        <span>Faktura bo'yicha to'lovlar ({editingGroup.existingPayments.length} ta):</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600">
                        Jami to'langan: {formatUzs(editingGroup.existingPayments.reduce((acc, p) => acc + (Number(p.summaUzs || p.summa) || 0), 0))} UZS
                      </span>
                    </div>

                    <div className="space-y-2">
                      {editingGroup.existingPayments.map((p, pIdx) => {
                        const isEditingThis = editingPaymentId === p.id;
                        const kassaLabel = p.kassaTuri === 'naqd_uzs' ? 'Naqd so\'m' : p.kassaTuri === 'naqd_usd' ? 'Naqd USD' : p.kassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';

                        if (isEditingThis && editingPaymentData) {
                          return (
                            <div key={p.id || pIdx} className="bg-[var(--bg)] border border-emerald-500/40 rounded-xl p-3 space-y-2.5 animate-in fade-in duration-150">
                              <div className="text-[11px] font-black text-emerald-600 flex items-center justify-between">
                                <span>✏️ To'lovni tahrirlash:</span>
                                <span className="text-[10px] font-mono text-[var(--text3)]">ID: #{String(p.id || '').slice(-6)}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-[var(--text2)]">Summa *</label>
                                  <input
                                    type="number"
                                    value={editingPaymentData.summa}
                                    onChange={(e) => setEditingPaymentData(prev => prev ? { ...prev, summa: e.target.value } : null)}
                                    placeholder="Summa..."
                                    className="w-full p-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-black text-[var(--text)] outline-none focus:border-emerald-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-[var(--text2)]">Kassa turi</label>
                                  <select
                                    value={editingPaymentData.kassaTuri}
                                    onChange={(e) => setEditingPaymentData(prev => prev ? { ...prev, kassaTuri: e.target.value as KassaTuri } : null)}
                                    className="w-full p-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                                  >
                                    <option value="naqd_uzs">Naqd pul (UZS)</option>
                                    <option value="naqd_usd">Naqd Dollar (USD)</option>
                                    <option value="karta_uzs">Plastik Karta (UzCard/Humo)</option>
                                    <option value="bank_uzs">Bank (Perexod)</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-[var(--text2)]">Sana</label>
                                  <input
                                    type="date"
                                    value={editingPaymentData.sana}
                                    onChange={(e) => setEditingPaymentData(prev => prev ? { ...prev, sana: e.target.value } : null)}
                                    className="w-full p-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-[var(--text2)]">Izoh</label>
                                <input
                                  type="text"
                                  value={editingPaymentData.izoh}
                                  onChange={(e) => setEditingPaymentData(prev => prev ? { ...prev, izoh: e.target.value } : null)}
                                  placeholder="To'lov izohi..."
                                  className="w-full p-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--text)] outline-none focus:border-emerald-500"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleCancelEditExistingPayment}
                                  className="px-2.5 py-1.5 bg-[var(--bg2)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg text-xs font-bold transition-all cursor-pointer"
                                >
                                  Bekor qilish
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveExistingPayment(p.id)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <Check size={13} />
                                  <span>Saqlash</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div 
                            key={p.id || pIdx} 
                            className="bg-[var(--bg)]/90 border border-[var(--border)] hover:border-emerald-500/40 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all shadow-2xs"
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  {kassaLabel}
                                </span>
                                <span className="text-xs font-bold text-[var(--text)]">
                                  📅 {p.sana}
                                </span>
                              </div>
                              {p.izoh && (
                                <span className="text-[11px] text-[var(--text3)] truncate max-w-sm">
                                  {p.izoh}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                              <span className="font-black text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                                +{formatUzs(p.summaUzs || p.summa)} {p.valyuta || 'UZS'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditExistingPayment(p)}
                                  className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                                  title="To'lov summasi yoki turini tahrirlash"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingPayment(p.id)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                                  title="Ushbu to'lovni o'chirish"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment Entry Form */}
                {editingGroup.enablePayment && (
                  <div className="bg-[var(--bg2)] border border-emerald-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">To'lov Summasi (UZS) *</label>
                        <input
                          type="number"
                          value={editingGroup.paymentAmount}
                          onChange={(e) => setEditingGroup(prev => prev ? { ...prev, paymentAmount: e.target.value } : null)}
                          placeholder="Summani kiriting..."
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">To'lov Sanasi</label>
                        <input
                          type="date"
                          value={editingGroup.paymentSana}
                          onChange={(e) => setEditingGroup(prev => prev ? { ...prev, paymentSana: e.target.value } : null)}
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--text2)]">Kassa Turi</label>
                        <select
                          value={editingGroup.paymentKassaTuri}
                          onChange={(e) => setEditingGroup(prev => prev ? { ...prev, paymentKassaTuri: e.target.value as KassaTuri } : null)}
                          className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                        >
                          <option value="naqd_uzs">Naqd pul (UZS)</option>
                          <option value="naqd_usd">Naqd Dollar (USD)</option>
                          <option value="karta_uzs">Plastik Karta (UzCard/Humo)</option>
                          <option value="bank_uzs">Bank Hisob Raqami (Perexod)</option>
                        </select>
                      </div>
                    </div>

                    {/* Quick preset buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-[var(--text3)] mr-1">Tezkor:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const prevPaid = editingGroup.existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
                          const rem = Math.max(0, editingGroup.jamiSumma - prevPaid);
                          setEditingGroup(prev => prev ? { ...prev, paymentAmount: String(rem) } : null);
                        }}
                        className="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] hover:border-emerald-500 rounded text-[10px] font-bold text-[var(--text2)] cursor-pointer"
                      >
                        Qoldiq to'liq
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const prevPaid = editingGroup.existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
                          const rem = Math.max(0, editingGroup.jamiSumma - prevPaid);
                          setEditingGroup(prev => prev ? { ...prev, paymentAmount: String(Math.round(rem / 2)) } : null);
                        }}
                        className="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] hover:border-emerald-500 rounded text-[10px] font-bold text-[var(--text2)] cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(prev => prev ? { ...prev, paymentAmount: '500000' } : null)}
                        className="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] hover:border-emerald-500 rounded text-[10px] font-bold text-[var(--text2)] cursor-pointer"
                      >
                        500,000
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(prev => prev ? { ...prev, paymentAmount: '1000000' } : null)}
                        className="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] hover:border-emerald-500 rounded text-[10px] font-bold text-[var(--text2)] cursor-pointer"
                      >
                        1,000,000
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--text2)]">To'lov Izohi</label>
                      <input
                        type="text"
                        value={editingGroup.paymentIzoh}
                        onChange={(e) => setEditingGroup(prev => prev ? { ...prev, paymentIzoh: e.target.value } : null)}
                        placeholder="To'lov bo'yicha izoh..."
                        className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text)] outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Live Summary & Action Buttons Footer */}
            <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Jami Mahsulot:</span>
                  <strong className="text-sm font-black text-rose-500">{editingGroup.jamiSoni} juft</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Faktura Summasi:</span>
                  <strong className="text-sm font-black text-[var(--text)]">{formatUzs(editingGroup.jamiSumma)} UZS</strong>
                </div>
                {editingGroup.enablePayment && Number(editingGroup.paymentAmount) > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">Kiritilayotgan To'lov:</span>
                    <strong className="text-sm font-black text-emerald-600">{formatUzs(Number(editingGroup.paymentAmount))} UZS</strong>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] cursor-pointer hover:bg-[var(--bg2)]"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditGroup}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/25 cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Fakturani Saqlash</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 6.1 STANDALONE QUICK PAYMENT MODAL */}
      {quickPaymentGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Faktura Bo'yicha To'lov Qabul Qilish</h3>
                  <p className="text-xs text-[var(--text3)]">
                    Mijoz: <strong className="text-[var(--text)]">{quickPaymentGroup.group.kimga}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickPaymentGroup(null)}
                className="p-1.5 rounded-xl text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4">
              
              {/* Invoice stats badge */}
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-[var(--text3)]">Faktura sanasi:</span>
                  <span className="font-bold text-[var(--text)]">{quickPaymentGroup.group.sana}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-[var(--text3)]">Jami yuk puli:</span>
                  <span className="font-bold text-[var(--text)]">{formatUzs(quickPaymentGroup.group.jamiSumma)} UZS</span>
                </div>
                {(() => {
                  const alreadyPaid = quickPaymentGroup.existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0);
                  const remDue = Math.max(0, (quickPaymentGroup.group.jamiSumma || 0) - alreadyPaid);
                  return (
                    <>
                      {alreadyPaid > 0 && (
                        <div className="flex justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <span>Avval to'langan:</span>
                          <span className="font-bold">{formatUzs(alreadyPaid)} UZS</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-[var(--border)]">
                        <span className="text-[var(--text)]">To'lanishi kerak bo'lgan qoldiq:</span>
                        <span className="font-black text-rose-500">{formatUzs(remDue)} UZS</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Show existing payments on this invoice if any */}
              {quickPaymentGroup.existingPayments.length > 0 && (
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--text2)] border-b border-[var(--border)] pb-1.5">
                    <span>Mavjud to'lovlar ({quickPaymentGroup.existingPayments.length} ta):</span>
                    <span className="text-emerald-600 font-black">
                      {formatUzs(quickPaymentGroup.existingPayments.reduce((acc, k) => acc + (Number(k.summaUzs || k.summa) || 0), 0))} UZS
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {quickPaymentGroup.existingPayments.map((p, idx) => (
                      <div key={p.id || idx} className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs">
                        <div>
                          <div className="font-black text-[var(--text)]">
                            +{formatUzs(p.summaUzs || p.summa)} {p.valyuta || 'UZS'}
                          </div>
                          <div className="text-[10px] text-[var(--text3)]">
                            📅 {p.sana} • {p.kassaTuri === 'naqd_uzs' ? 'Naqd' : p.kassaTuri === 'naqd_usd' ? 'USD' : p.kassaTuri === 'karta_uzs' ? 'Karta' : 'Bank'}
                            {p.izoh ? ` • ${p.izoh}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const targetGroup = quickPaymentGroup.group;
                              setQuickPaymentGroup(null);
                              handleOpenEditGroup(targetGroup);
                            }}
                            className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                            title="Tahrirlash oynasida summani to'g'rilash"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePaymentFromQuickModal(p.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                            title="Ushbu to'lovni o'chirish"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form fields */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text2)]">To'lov Summasi (UZS) *</label>
                  <input
                    type="number"
                    value={quickPaymentGroup.amount}
                    onChange={(e) => setQuickPaymentGroup(prev => prev ? { ...prev, amount: e.target.value } : null)}
                    placeholder="Summani kiriting..."
                    className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs sm:text-sm font-black text-[var(--text)] outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text2)]">To'lov Sanasi</label>
                    <input
                      type="date"
                      value={quickPaymentGroup.sana}
                      onChange={(e) => setQuickPaymentGroup(prev => prev ? { ...prev, sana: e.target.value } : null)}
                      className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--text2)]">Kassa Turi</label>
                    <select
                      value={quickPaymentGroup.kassaTuri}
                      onChange={(e) => setQuickPaymentGroup(prev => prev ? { ...prev, kassaTuri: e.target.value as KassaTuri } : null)}
                      className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-emerald-500"
                    >
                      <option value="naqd_uzs">Naqd pul (UZS)</option>
                      <option value="naqd_usd">Naqd Dollar (USD)</option>
                      <option value="karta_uzs">Plastik Karta (UzCard/Humo)</option>
                      <option value="bank_uzs">Bank Hisobi (Perexod)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--text2)]">To'lov Izohi</label>
                  <input
                    type="text"
                    value={quickPaymentGroup.izoh}
                    onChange={(e) => setQuickPaymentGroup(prev => prev ? { ...prev, izoh: e.target.value } : null)}
                    placeholder="Izoh yozing..."
                    className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text)] outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setQuickPaymentGroup(null)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] cursor-pointer hover:bg-[var(--bg2)]"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveQuickPayment}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/25 cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>To'lovni Tasdiqlash</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. REASSIGN MODAL */}
      <ClientReassignModal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
      />

      {/* Camera Barcode / QR-Code Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScan}
        availableModels={allModels}
        title="Chiqim / Savdo Skaneri (Kamera)"
        description="Mahsulot qutisi yoki yorlig'idagi shtrix-kod yoki QR-kodni skanerlang"
      />

      {/* Barcode & QR Label Generator Modal */}
      {generatorModel && (
        <BarcodeGeneratorModal
          isOpen={!!generatorModel}
          onClose={() => setGeneratorModel(null)}
          model={generatorModel}
          price={Number(customPrice) || db.prices?.[generatorModel]?.sale || 0}
          availableSizes={ALL_SIZES}
        />
      )}

    </div>
  );
}
