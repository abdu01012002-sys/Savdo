import React, { useState, useMemo, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { cn, getTodayStr, generateId, getNowStr, formatCompact, formatUzs, UZBEKISTAN_REGIONS, formatPhoneNumber, formatPhoneInput } from '../lib/utils';
import { toast } from 'sonner';
import { VirtuosoGrid } from 'react-virtuoso';
import { 
  Trash2, User, Download, Users, ShoppingBag, Search, Plus, X, 
  Phone, MapPin, Tag, ChevronDown, Edit2, Wallet, DollarSign, 
  AlertTriangle, Crown, Flame, CheckSquare, Square, PhoneCall, 
  Send, Sparkles, Clock, ArrowUpDown, Check, ShieldAlert, Zap,
  FileSpreadsheet, Copy, ExternalLink, ArrowRight, RotateCcw,
  Receipt, MessageSquare, CheckCircle2, LayoutGrid, Table as TableIcon,
  List, Globe, BarChart3, TrendingUp, ChevronRight, Layers, CreditCard,
  RefreshCw
} from 'lucide-react';
import { Kontragent } from '../types';
import { exportToExcel } from '../lib/exportUtils';
import { ClientReassignModal } from './ClientReassignModal';
import { recalculateAllClientBalances, getUnpricedSalesStats, syncUnpricedTransactionsWithCurrentPrices } from '../lib/balanceUtils';

export function KontragentlarView({ onSelectClient, selectedId }: { onSelectClient: (k: Kontragent) => void, selectedId?: string }) {
  const { db, setDb, currentUser, currentOmbor } = useDb();
  const isOmborchi = currentUser?.rol === 'omborchi';
  const { logAudit } = useAudit();
  
  // View Mode: Grid (Cards), Table (Jadval), Compact (Kompakt)
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'compact'>('grid');

  // Search, Filter, Regional & Sort State
  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState<'all' | 'debtor' | 'overdue' | 'vip' | 'clean' | 'sleeping' | 'ulgurji' | 'chakana'>('all');
  const [selectedViloyat, setSelectedViloyat] = useState<string>('all');
  const [showRegionPanel, setShowRegionPanel] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'balans_desc' | 'balans_asc' | 'jami_desc' | 'xaridlar_desc' | 'oxirgiXarid_desc' | 'ism_asc'>('balans_desc');
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Reset pagination when search, filter, or sort changes
  useEffect(() => {
    setVisibleCount(50);
  }, [search, activePill, selectedViloyat, sortBy]);
  
  // Selection State for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showUnpricedModal, setShowUnpricedModal] = useState(false);
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Quick Payment Modal State
  const [quickPayClient, setQuickPayClient] = useState<Kontragent | null>(null);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payNote, setPayNote] = useState('');
  const [payKassa, setPayKassa] = useState<'naqd' | 'karta' | 'bank' | 'dollar'>('naqd');

  // Telegram Integration Modal State
  const [telegramClient, setTelegramClient] = useState<Kontragent | null>(null);
  const [telegramTemplate, setTelegramTemplate] = useState<'debt' | 'overdue' | 'promo' | 'aktsverka'>('debt');
  const [customTelegramText, setCustomTelegramText] = useState('');

  // Form Fields for Add/Edit
  const [newIsm, setNewIsm] = useState('');
  const [newTel, setNewTel] = useState('');
  const [newManzil, setNewManzil] = useState('');
  const [newViloyat, setNewViloyat] = useState('');
  const [newKategoriya, setNewKategoriya] = useState('');
  const [newIzoh, setNewIzoh] = useState('');
  const [newBalans, setNewBalans] = useState<number | ''>('');

  const kontragentlar = db.kontragentlar || [];
  const nowTime = new Date().getTime();

  // Helper metrics calculation
  const totalDebt = kontragentlar.reduce((acc, k) => acc + ((k.balans || 0) > 0 ? k.balans! : 0), 0);
  const debtorsCount = kontragentlar.filter(k => (k.balans || 0) > 0).length;
  const cleanCount = kontragentlar.filter(k => (k.balans || 0) <= 0).length;
  
  // Overdue List (30+ days without settlement)
  const overdueList = kontragentlar.filter(k => {
    if ((k.balans || 0) <= 0) return false;
    if (!k.oxirgiXarid) return true;
    const diffDays = (nowTime - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24);
    return diffDays > 30;
  });
  const overdueCount = overdueList.length;
  const overdueTotalDebt = overdueList.reduce((acc, k) => acc + (k.balans || 0), 0);

  // New clients in last 30 days
  const newClientsLast30Days = kontragentlar.filter(k => {
    if (!k.qoshilganSana) return false;
    const diffDays = (nowTime - new Date(k.qoshilganSana).getTime()) / (1000 * 3600 * 24);
    return diffDays <= 30;
  }).length;

  const vipList = kontragentlar.filter(k => (k.jami || 0) >= 150 || (k.xaridlarSoni || 0) >= 5);
  const vipCount = vipList.length;

  const sleepingList = kontragentlar.filter(k => {
    if (!k.oxirgiXarid) return false;
    const diffDays = (nowTime - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24);
    return diffDays >= 25;
  });
  const sleepingCount = sleepingList.length;

  const ulgurjiCount = kontragentlar.filter(k => k.kategoriya === 'Ulgurji').length;
  const chakanaCount = kontragentlar.filter(k => k.kategoriya === 'Chakana').length;
  const totalVolume = kontragentlar.reduce((acc, k) => acc + (k.jami || 0), 0);
  const avgVolumePerClient = kontragentlar.length > 0 ? Math.round(totalVolume / kontragentlar.length) : 0;

  // Regional Breakdown Stats
  const regionStats = useMemo(() => {
    const map: Record<string, { count: number; debt: number; volume: number }> = {};
    kontragentlar.forEach(k => {
      const reg = k.viloyat || 'Belgilanmagan';
      if (!map[reg]) map[reg] = { count: 0, debt: 0, volume: 0 };
      map[reg].count += 1;
      map[reg].debt += (k.balans || 0) > 0 ? k.balans! : 0;
      map[reg].volume += k.jami || 0;
    });
    return Object.entries(map)
      .map(([region, stats]) => ({ region, ...stats }))
      .sort((a, b) => b.count - a.count);
  }, [kontragentlar]);

  // Smart Search & Filter Logic
  const filteredList = kontragentlar.filter(k => {
    const rawSearch = search.trim().toLowerCase();
    
    // Regional filter
    if (selectedViloyat !== 'all') {
      const clientReg = k.viloyat || 'Belgilanmagan';
      if (clientReg !== selectedViloyat) return false;
    }

    // Smart Search matching
    let sMatch = true;
    if (rawSearch) {
      const isNumSearch = !isNaN(Number(rawSearch.replace(/[^\d]/g, ''))) && rawSearch.replace(/[^\d]/g, '').length >= 3;
      const numVal = isNumSearch ? Number(rawSearch.replace(/[^\d]/g, '')) : null;

      const cleanDigits = rawSearch.replace(/\D/g, '');
      const textMatch = 
        k.ism.toLowerCase().includes(rawSearch) || 
        (k.tel && (k.tel.toLowerCase().includes(rawSearch) || (cleanDigits.length >= 3 && k.tel.replace(/\D/g, '').includes(cleanDigits)))) || 
        (k.manzil && k.manzil.toLowerCase().includes(rawSearch)) ||
        (k.viloyat && k.viloyat.toLowerCase().includes(rawSearch)) ||
        (k.izoh && k.izoh.toLowerCase().includes(rawSearch)) ||
        (k.kategoriya && k.kategoriya.toLowerCase().includes(rawSearch));

      // Check debt threshold search (e.g. ">1000000" or direct number match with balance)
      let debtMatch = false;
      if (rawSearch.startsWith('>') && !isNaN(Number(rawSearch.slice(1).trim()))) {
        const threshold = Number(rawSearch.slice(1).trim());
        debtMatch = (k.balans || 0) >= threshold;
      } else if (rawSearch.startsWith('<') && !isNaN(Number(rawSearch.slice(1).trim()))) {
        const threshold = Number(rawSearch.slice(1).trim());
        debtMatch = (k.balans || 0) <= threshold;
      } else if (numVal !== null && (k.balans || 0).toString().includes(numVal.toString())) {
        debtMatch = true;
      }

      sMatch = textMatch || debtMatch;
    }
    
    if (!sMatch) return false;

    const diffDays = k.oxirgiXarid ? (nowTime - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24) : 999;

    if (activePill === 'debtor') return (k.balans || 0) > 0;
    if (activePill === 'overdue') return (k.balans || 0) > 0 && (diffDays > 30 || !k.oxirgiXarid);
    if (activePill === 'vip') return (k.jami || 0) >= 150 || (k.xaridlarSoni || 0) >= 5;
    if (activePill === 'clean') return (k.balans || 0) <= 0;
    if (activePill === 'sleeping') return diffDays >= 25;
    if (activePill === 'ulgurji') return k.kategoriya === 'Ulgurji';
    if (activePill === 'chakana') return k.kategoriya === 'Chakana';
    return true;
  });

  const sortedList = [...filteredList].sort((a, b) => {
    if (sortBy === 'balans_desc') return (b.balans || 0) - (a.balans || 0);
    if (sortBy === 'balans_asc') return (a.balans || 0) - (b.balans || 0);
    if (sortBy === 'jami_desc') return (b.jami || 0) - (a.jami || 0);
    if (sortBy === 'xaridlar_desc') return (b.xaridlarSoni || 0) - (a.xaridlarSoni || 0);
    if (sortBy === 'oxirgiXarid_desc') {
      const dateA = a.oxirgiXarid ? new Date(a.oxirgiXarid).getTime() : 0;
      const dateB = b.oxirgiXarid ? new Date(b.oxirgiXarid).getTime() : 0;
      return dateB - dateA;
    }
    if (sortBy === 'ism_asc') return a.ism.localeCompare(b.ism);
    return 0;
  });

  // Multi-Select Handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === sortedList.length && sortedList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedList.map(k => k.id)));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Actions
  const handleBulkChangeCategory = (cat: 'Ulgurji' | 'Chakana') => {
    if (selectedIds.size === 0) return;
    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      draft.kontragentlar = draft.kontragentlar.map(k => {
        if (selectedIds.has(k.id)) {
          return { ...k, kategoriya: cat };
        }
        return k;
      });
      return draft;
    });
    toast.success(`${selectedIds.size} ta mijoz toifasi "${cat}" ga o'zgartirildi`);
    setSelectedIds(new Set());
  };

  // Excel Export
  const handleExportExcel = (exportOnlySelected: boolean = false, onlyDebtors: boolean = false) => {
    let targetList = exportOnlySelected 
      ? sortedList.filter(k => selectedIds.has(k.id))
      : sortedList;

    if (onlyDebtors) {
      targetList = targetList.filter(k => (k.balans || 0) > 0);
    }

    if (targetList.length === 0) {
      toast.error("Eksport qilish uchun mijozlar topilmadi");
      return;
    }

    const headers = [
      '№',
      'Mijoz / Do\'kon Nomi',
      'Telefon Raqami',
      'Shahar / Manzil',
      'Toifa',
      'Holati',
      'Balans (UZS)',
      'Xaridlar Soni',
      'Jami Olingan (Juft)',
      'Oxirgi Xarid Sanasi',
      'Qo\'shilgan Sana',
      'Izoh'
    ];

    const rows = targetList.map((k, idx) => {
      const diffDays = k.oxirgiXarid ? (nowTime - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24) : 999;
      let status = 'Oddiy';
      if ((k.balans || 0) > 0 && diffDays > 30) status = 'Muddati o\'tgan qarz (30+ kun)';
      else if ((k.balans || 0) > 0) status = 'Qarzdor';
      else if ((k.jami || 0) >= 150 || (k.xaridlarSoni || 0) >= 5) status = 'VIP / Faol';
      else if (diffDays >= 25) status = 'Uxlayotgan (Faol emas)';

      return [
        idx + 1,
        k.ism,
        k.tel || '—',
        k.manzil || '—',
        k.kategoriya || '—',
        status,
        k.balans || 0,
        k.xaridlarSoni || 0,
        k.jami || 0,
        k.oxirgiXarid ? k.oxirgiXarid.substring(0, 10) : '—',
        k.qoshilganSana ? k.qoshilganSana.substring(0, 10) : '—',
        k.izoh || ''
      ];
    });

    const filename = onlyDebtors
      ? `Qarzdorlar_Royxati_${targetList.length}_ta_${getTodayStr()}`
      : exportOnlySelected
        ? `Tanlangan_Mijozlar_${selectedIds.size}_ta`
        : activePill !== 'all'
          ? `Mijozlar_${activePill.toUpperCase()}_${targetList.length}_ta`
          : `Mijozlar_Bazasi_Jami_${targetList.length}_ta`;

    exportToExcel([headers, ...rows], filename, 'Mijozlar');
    toast.success("Excel hisoboti muvaffaqiyatli yuklab olindi!");
  };

  // Telegram Modal Setup
  const openTelegramModal = (k: Kontragent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTelegramClient(k);
    setTelegramTemplate('debt');
    updateTelegramMessageText(k, 'debt');
  };

  const updateTelegramMessageText = (k: Kontragent, type: 'debt' | 'overdue' | 'promo' | 'aktsverka') => {
    const today = getTodayStr();
    const balans = k.balans || 0;
    const absBalans = Math.abs(balans).toLocaleString();

    let text = '';
    if (type === 'debt') {
      text = `Assalomu alaykum, hurmatli ${k.ism}!\n\n🏢 «FALAK SHOE» poyabzal fabrikasidan hisob-kitob eslatmasi:\n📅 Sana: ${today}\n💰 Qoldiq qarzdorlik: ${absBalans} UZS\n\nIltimos, hisob-kitobni amalga oshirishingizni so'raymiz. Savollar bo'lsa, quyidagi raqamga murojaat qiling:\n📞 +998 90 123 45 67\n\nRahmat!`;
    } else if (type === 'overdue') {
      text = `DIQQAT! Hurmatli ${k.ism}!\n\n«FALAK SHOE» korxonasi oldidagi ${absBalans} UZS miqdoridagi qarzdorligingiz muddati 30 kundan oshgan.\n\nIltimos, zudlik bilan hisob-kitobni amalga oshiring yoki rahbar bilan bog'laning:\n📞 +998 90 123 45 67`;
    } else if (type === 'promo') {
      text = `Assalomu alaykum, hurmatli ${k.ism}!\n\n✨ «FALAK SHOE» poyabzal fabrikasiga yangi mavsum uchun sara modellar omborga keldi!\n📦 Eng xaridorgir erkaklar va bolalar modellari ulgurji narxlarda.\n\nKatalog va buyurtma uchun biz bilan bog'laning:\n📞 +998 90 123 45 67`;
    } else if (type === 'aktsverka') {
      text = `📄 AKTSVERKA (Hisob-kitob solishtirma dalolatnomasi)\n👤 Mijoz: ${k.ism}\n📅 Sana: ${today}\n📦 Jami olingan: ${(k.jami || 0).toLocaleString()} juft\n💰 Hozirgi qoldiq: ${balans > 0 ? `Qarz: ${absBalans} UZS` : balans < 0 ? `Haqdorlik: ${absBalans} UZS` : '0 UZS'}\n\n«FALAK SHOE» Boshqaruv bo'limi`;
    }

    setCustomTelegramText(text);
  };

  const handleSendTelegram = () => {
    if (!customTelegramText.trim()) {
      toast.error("Xabar matni bo'sh bo'lishi mumkin emas!");
      return;
    }
    const encoded = encodeURIComponent(customTelegramText);
    window.open(`https://t.me/share/url?url=&text=${encoded}`, '_blank');
    toast.success("Telegram oynasi ochildi");
    setTelegramClient(null);
  };

  const handleCopyTelegramText = async () => {
    try {
      await navigator.clipboard.writeText(customTelegramText);
      toast.success("Xabar matni nusxalandi!");
    } catch {
      toast.error("Nusxalashda xatolik yuz berdi");
    }
  };

  const handleDirectCall = (tel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tel) {
      toast.error("Ushbu mijozda telefon raqami kiritilmagan");
      return;
    }
    const clean = tel.replace(/[^\d+]/g, '');
    window.location.href = `tel:${clean}`;
  };

  // Add / Edit Handlers
  const openAdd = () => {
    setEditingId(null);
    setNewIsm(''); setNewTel(''); setNewManzil(''); setNewViloyat(''); setNewKategoriya(''); setNewIzoh(''); setNewBalans('');
    setShowAddForm(true);
  };

  const openEdit = (k: Kontragent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOmborchi) {
      toast.error("Omborchi roliga mijozni tahrirlash ruxsati berilmagan!");
      return;
    }
    setEditingId(k.id);
    setNewIsm(k.ism); 
    setNewTel(formatPhoneNumber(k.tel || '')); 
    setNewManzil(k.manzil || ''); 
    setNewViloyat(k.viloyat || ''); 
    setNewKategoriya(k.kategoriya || ''); 
    setNewIzoh(k.izoh || ''); 
    setNewBalans(k.balans || 0);
    setShowAddForm(true);
  };

  const handleSaveKontragent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && isOmborchi) {
      toast.error("Omborchi roliga mijoz ma'lumotlarini tahrirlash taqiqlangan!");
      return;
    }
    if (!newIsm.trim()) return;

    const parsedBalans = Number(newBalans);
    if (isNaN(parsedBalans) && newBalans !== '') {
      toast.error('Balans miqdori xato kiritildi!');
      return;
    }

    const oldKontragent = editingId 
      ? (db.kontragentlar || []).find(k => String(k.id) === String(editingId)) || (db.kontragentlar || []).find(k => k.ism.trim().toLowerCase() === newIsm.trim().toLowerCase())
      : null;

    if (editingId && oldKontragent) {
      const oldBal = oldKontragent.balans || 0;
      const newBal = parsedBalans || 0;
      const diff = Math.abs(oldBal - newBal);
      if (diff > 1000000) {
        logAudit('Qarzni tahrirlash (Katta miqdor)', `Mijoz: ${oldKontragent.ism}`, `Qoldiq qarz ${oldBal} so'mdan ${newBal} so'mga (Farq: ${diff}) o'zgartirildi.`, 'high');
      } else if (diff > 0) {
        logAudit('Qarzni tahrirlash', `Mijoz: ${oldKontragent.ism}`, `Qoldiq qarz ${oldBal} so'mdan ${newBal} so'mga o'zgartirildi.`, 'warning');
      }

      const selectedRegion = newViloyat ? newViloyat.trim() : '';
      if ((oldKontragent.viloyat || '') !== selectedRegion) {
        logAudit("Mijoz hududini o'zgartirish", `Mijoz: ${newIsm.trim()}`, `Hudud: "${oldKontragent.viloyat || 'Belgilanmagan'}" -> "${selectedRegion || 'Belgilanmagan'}"`, 'info');
      }
    }

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      if (!draft.kontragentlar) draft.kontragentlar = [];
      const cleanViloyat = newViloyat && newViloyat.trim() ? newViloyat.trim() : '';
      const cleanTel = formatPhoneNumber(newTel.trim());

      if (editingId) {
        let idx = draft.kontragentlar.findIndex(k => String(k.id) === String(editingId));
        if (idx === -1 && oldKontragent) {
          idx = draft.kontragentlar.findIndex(k => k.ism.trim().toLowerCase() === oldKontragent.ism.trim().toLowerCase());
        }

        if (idx >= 0) {
          draft.kontragentlar[idx] = {
            ...draft.kontragentlar[idx],
            ism: newIsm.trim(),
            tel: cleanTel,
            manzil: newManzil.trim(),
            viloyat: cleanViloyat,
            kategoriya: newKategoriya || 'Ulgurji',
            izoh: newIzoh.trim(),
            balans: parsedBalans || 0
          };
        } else {
          // If not found in array by ID, add it
          draft.kontragentlar.unshift({
            id: String(editingId),
            ism: newIsm.trim(),
            tel: cleanTel,
            manzil: newManzil.trim(),
            viloyat: cleanViloyat,
            kategoriya: newKategoriya || 'Ulgurji',
            izoh: newIzoh.trim(),
            balans: parsedBalans || 0,
            jami: 0,
            xaridlarSoni: 0,
            birinchiXarid: '',
            oxirgiXarid: '',
            qoshilganSana: new Date().toISOString()
          });
        }
      } else {
        const newKontragent: Kontragent = {
          id: `k-${Date.now()}-${generateId()}`,
          ism: newIsm.trim(),
          tel: cleanTel,
          manzil: newManzil.trim(),
          viloyat: cleanViloyat,
          kategoriya: newKategoriya || 'Ulgurji',
          izoh: newIzoh.trim(),
          balans: parsedBalans || 0,
          jami: 0,
          xaridlarSoni: 0,
          birinchiXarid: '',
          oxirgiXarid: '',
          qoshilganSana: new Date().toISOString()
        };
        draft.kontragentlar.unshift(newKontragent);
      }
      return draft;
    });

    toast.success(editingId ? "Mijoz ma'lumotlari muvaffaqiyatli saqlandi" : "Yangi mijoz bazaga qo'shildi");
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const deletedClient = db.kontragentlar.find(k => k.id === id);
    if (deletedClient && currentUser?.rol === 'admin') {
      logAudit('Mijozni o\'chirish', `Mijoz: ${deletedClient.ism}`, `Mijoz o'chirib yuborildi. Qoldiq balansi: ${deletedClient.balans || 0} so'm.`, 'high');
    }
    setDb(prev => ({
      ...prev,
      kontragentlar: (prev.kontragentlar || []).filter(k => k.id !== id)
    }));
    toast.success("Mijoz muvaffaqiyatli o'chirildi");
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOmborchi) {
      toast.error("Omborchi roliga mijozni o'chirish ruxsati berilmagan!");
      return;
    }
    if (deleteId === id) {
      handleDelete(id);
      setDeleteId(null);
    } else {
      setDeleteId(id);
      setTimeout(() => setDeleteId(null), 3000);
    }
  };

  // Quick Payment Execution
  const handleQuickPaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOmborchi) {
      toast.error("Omborchi roliga qarz to'lovi kiritish ruxsati berilmagan!");
      return;
    }
    if (!quickPayClient) return;

    const amount = Number(payAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      toast.error("To'lov miqdorini to'g'ri kiriting!");
      return;
    }

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const idx = draft.kontragentlar.findIndex(k => k.id === quickPayClient.id);
      if (idx !== -1) {
        draft.kontragentlar[idx].balans = (draft.kontragentlar[idx].balans || 0) - amount;
      }

      const newTx = {
        id: generateId(),
        vaqt: getNowStr(),
        sana: getTodayStr(),
        amal: 'tolov' as const,
        model: "To'lov",
        olcham: "-",
        soni: 0,
        kimdan: quickPayClient.ism,
        izoh: payNote.trim() || `Qarz to'lovi (${payKassa.toUpperCase()})`,
        xodim: currentUser?.ism || "Kassir",
        summa: amount,
        foyda: 0
      };

      if (!draft[currentOmbor].transactions) {
        draft[currentOmbor].transactions = [];
      }
      draft[currentOmbor].transactions.push(newTx);

      return draft;
    });

    logAudit('Qarz to\'lovi qabul qilindi', `Mijoz: ${quickPayClient.ism}`, `${amount.toLocaleString()} UZS qarz so'ndirildi. Kassa: ${payKassa}.`, 'info');
    toast.success(`${quickPayClient.ism} hisobiga ${amount.toLocaleString()} UZS to'lov kiritildi`);
    
    setQuickPayClient(null);
    setPayAmount('');
    setPayNote('');
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  // Helper for Badge Tag Styling & Data
  const getClientBadges = (k: Kontragent) => {
    const diffDays = k.oxirgiXarid ? (nowTime - new Date(k.oxirgiXarid).getTime()) / (1000 * 3600 * 24) : 999;
    const isOverdue = (k.balans || 0) > 0 && (diffDays > 30 || !k.oxirgiXarid);
    const isVip = (k.jami || 0) >= 150 || (k.xaridlarSoni || 0) >= 5;
    const isSleeping = diffDays >= 25 && !isOverdue;
    const isNew = k.qoshilganSana && (nowTime - new Date(k.qoshilganSana).getTime()) / (1000 * 3600 * 24) <= 15;
    const isRecentActive = diffDays <= 10;

    return { diffDays, isOverdue, isVip, isSleeping, isNew, isRecentActive };
  };

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddForm) {
          setShowAddForm(false);
          setEditingId(null);
        } else if (telegramClient) {
          setTelegramClient(null);
        } else if (quickPayClient) {
          setQuickPayClient(null);
        } else if (showReassignModal) {
          setShowReassignModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm, telegramClient, quickPayClient, showReassignModal]);

  return (
    <div className="flex flex-col gap-5 relative">
      
      {/* 1. BENTO-GRID KPI KARTALARI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        
        {/* Card 1: Jami Mijozlar Soni */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
              <Users size={14} className="text-blue-500" />
              Jami Mijozlar Bazasi
            </span>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight">
                {kontragentlar.length}
              </span>
              <span className="text-xs font-bold text-[var(--text3)]">mijoz</span>
              {newClientsLast30Days > 0 && (
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] flex items-center gap-1">
                  <Sparkles size={11} /> +{newClientsLast30Days} yangi
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
              <span className="text-purple-600 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span> {ulgurjiCount} Ulgurji
              </span>
              <span>•</span>
              <span className="text-emerald-600 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {chakanaCount} Chakana
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Umumiy Qarzdorlik */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
              <Wallet size={14} className="text-rose-500" />
              Umumiy Qarzdorlik
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
                {formatCompact(totalDebt)}
              </span>
              <span className="text-xs font-black text-rose-500/80">UZS</span>
              <span className="ml-auto px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 font-black text-[10px] flex items-center gap-1">
                <AlertTriangle size={11} /> {debtorsCount} qarzdor
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
              <span>To'liq summa:</span>
              <span className="text-rose-600 dark:text-rose-400 font-extrabold tabular-nums">
                {totalDebt.toLocaleString()} UZS
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: O'rtacha Xarid Hajmi & VIP */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag size={14} className="text-amber-500" />
              O'rtacha Xarid Hajmi
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight tabular-nums">
                {avgVolumePerClient.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-[var(--text3)]">juft / mijoz</span>
              <span className="ml-auto px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 font-extrabold text-[10px]">
                {vipCount} ta VIP
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
              <span>Umumiy yetkazilgan:</span>
              <span className="text-[var(--text)] font-extrabold tabular-nums">
                {totalVolume.toLocaleString()} juft
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Muddati O'tgan Qarzlar (30+ kun) */}
        <div className={cn(
          "bg-[var(--bg2)] border rounded-3xl p-5 flex flex-col justify-between shadow-xs relative overflow-hidden group transition-all",
          overdueCount > 0 
            ? "border-rose-500/40 bg-gradient-to-br from-rose-500/5 via-[var(--bg2)] to-rose-500/10" 
            : "border-[var(--border)] hover:border-emerald-500/40"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} className={overdueCount > 0 ? "animate-spin" : ""} />
              Muddati O'tgan Qarz
            </span>
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center font-black transition-transform group-hover:scale-105",
              overdueCount > 0 ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse" : "bg-emerald-500/15 text-emerald-600"
            )}>
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
                {formatCompact(overdueTotalDebt)}
              </span>
              <span className="text-xs font-black text-rose-500/80">UZS</span>
              {overdueCount > 0 ? (
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-rose-600 text-white font-black text-[10px] animate-pulse">
                  {overdueCount} ta (30+ kun)
                </span>
              ) : (
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 font-extrabold text-[10px]">
                  Xavfsiz
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-[11px] font-bold text-[var(--text3)]">
              <span>Zudlik bilan undirish:</span>
              <span className="text-rose-600 dark:text-rose-400 font-black tabular-nums">
                {overdueTotalDebt.toLocaleString()} UZS
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 2. ADD / EDIT CLIENT MODAL DIALOG (BOTTOM SHEET ON MOBILE) */}
      {showAddForm && (!isOmborchi || !editingId) && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[210] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddForm(false);
              setEditingId(null);
            }
          }}
        >
          <div 
            className="bg-[var(--bg2)] text-[var(--text)] border-t sm:border border-[var(--border)] p-5 sm:p-7 rounded-t-[28px] sm:rounded-3xl shadow-2xl relative w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator */}
            <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

            <div className="flex justify-between items-center mb-5 pb-3 border-b border-[var(--border)]">
              <h3 className="font-black text-base sm:text-lg text-[var(--text)] flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                  <User size={20} />
                </div>
                {editingId ? "Mijoz Ma'lumotlarini Tahrirlash" : "Yangi Mijoz Qo'shish"}
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowAddForm(false);
                  setEditingId(null);
                }} 
                className="text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 bg-[var(--bg)] p-2 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveKontragent} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">ISM / DO'KON NOMI *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 w-4 h-4" />
                    <input 
                      type="text" 
                      value={newIsm}
                      onChange={e => setNewIsm(e.target.value)}
                      required
                      placeholder="Mijoz ismi yoki do'kon nomi"
                      className="w-full pl-10 pr-4 py-3 border border-[var(--border)] bg-[var(--bg)] rounded-xl text-sm text-[var(--text)] outline-none focus:border-blue-500 transition-all font-bold"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">TELEFON RAQAMI</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
                    <input 
                      type="text" 
                      value={newTel}
                      onChange={e => setNewTel(formatPhoneInput(e.target.value))}
                      placeholder="+998 94 398 42 50"
                      className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">HUDUD / VILOYAT *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 w-4 h-4" />
                    <select
                      value={newViloyat}
                      onChange={e => setNewViloyat(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 appearance-none border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 transition-all cursor-pointer font-bold"
                    >
                      <option value="">— Hudud / Viloyatni tanlang —</option>
                      {newViloyat && !UZBEKISTAN_REGIONS.includes(newViloyat as any) && (
                        <option value={newViloyat}>{newViloyat} (Mavjud)</option>
                      )}
                      <optgroup label="O'zbekiston hududlari">
                        {UZBEKISTAN_REGIONS.filter(r => !r.includes('Respublikasi') && !r.includes('Eksport') || r === 'Qoraqalpog‘iston Respublikasi').map(reg => (
                          <option key={reg} value={reg}>{reg}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Xorijiy / Eksport Respublikalari">
                        {UZBEKISTAN_REGIONS.filter(r => (r.includes('Respublikasi') && r !== 'Qoraqalpog‘iston Respublikasi') || r.includes('Federatsiyasi') || r.includes('Eksport')).map(reg => (
                          <option key={reg} value={reg}>{reg}</option>
                        ))}
                      </optgroup>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">SHAHAR / BOZOR / ANIQLI MANZIL</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
                    <input 
                      type="text" 
                      value={newManzil}
                      onChange={e => setNewManzil(e.target.value)}
                      placeholder="Qo'qon bozori, Urgut, Chorsu..."
                      className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">MIJOZ TOIFASI</label>
                  <div className="relative">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
                    <select
                      value={newKategoriya}
                      onChange={e => setNewKategoriya(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 appearance-none border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 transition-all cursor-pointer font-bold"
                    >
                      <option value="">— Tanlang —</option>
                      <option value="Ulgurji">⭐️ Ulgurji</option>
                      <option value="Chakana">🛍️ Chakana</option>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">
                    QARZ / BALANS (UZS)
                  </label>
                  <input 
                    type="number" 
                    value={newBalans}
                    onChange={e => setNewBalans(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-rose-500 transition-all font-black text-rose-600 placeholder:text-rose-500/40"
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">QO'SHIMCHA IZOH / ESLATMA</label>
                  <textarea 
                    rows={2}
                    value={newIzoh}
                    onChange={e => setNewIzoh(e.target.value)}
                    placeholder="Mijoz haqida maxsus eslatma yoki ma'lumotlar..."
                    className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 transition-all font-semibold resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)] mt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-[var(--text)] bg-[var(--bg)] hover:bg-[var(--border)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer"
                >
                  <Check size={16} />
                  {editingId ? "O'zgarishlarni Saqlash" : "Mijozni Qo'shish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. TELEGRAM INTEGRATSIYA VA ESALATMA MODALI (BOTTOM SHEET ON MOBILE) */}
      {telegramClient && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[220] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTelegramClient(null);
          }}
        >
          <div 
            className="bg-[var(--bg2)] text-[var(--text)] w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl border-t sm:border border-[var(--border)] p-5 sm:p-6 shadow-2xl relative mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator */}
            <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-500 flex items-center justify-center font-black">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Telegram orqali Xabar Yuborish</h3>
                  <p className="text-xs font-semibold text-[var(--text3)]">{telegramClient.ism} {telegramClient.tel ? `(${formatPhoneNumber(telegramClient.tel)})` : ''}</p>
                </div>
              </div>
              <button 
                onClick={() => setTelegramClient(null)} 
                className="p-2 bg-[var(--bg)] hover:bg-[var(--border)] rounded-xl text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 mt-4">
              {/* Template selector pills */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase">TAYYOR SHABLONNI TANLANG</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'debt', label: '💰 Qarz eslatmasi' },
                    { id: 'overdue', label: '⏰ 30+ kun talabnoma' },
                    { id: 'promo', label: '✨ Yangi modellar' },
                    { id: 'aktsverka', label: '📄 Akt-sverka' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTelegramTemplate(t.id as any);
                        updateTelegramMessageText(telegramClient, t.id as any);
                      }}
                      className={cn(
                        "py-2 px-2.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border text-center",
                        telegramTemplate === t.id
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                          : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message text area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase flex justify-between">
                  <span>XABAR MATNI (TAHRIRLASH MUMKIN)</span>
                  <span className="text-[10px] text-sky-500 font-bold">1-Click Send</span>
                </label>
                <textarea
                  rows={7}
                  value={customTelegramText}
                  onChange={e => setCustomTelegramText(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] outline-none focus:border-sky-500 leading-relaxed font-mono resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleCopyTelegramText}
                  className="px-4 py-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Copy size={15} /> Nusxalash
                </button>
                <button
                  type="button"
                  onClick={handleSendTelegram}
                  className="flex-1 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-black transition-all shadow-md shadow-sky-500/25 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send size={15} /> Telegram orqali Yuborish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. QUICK PAYMENT MODAL ($) (BOTTOM SHEET ON MOBILE) */}
      {quickPayClient && !isOmborchi && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[200] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickPayClient(null);
          }}
        >
          <div 
            className="bg-[var(--bg2)] text-[var(--text)] w-full max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl border-t sm:border border-[var(--border)] p-5 sm:p-6 shadow-2xl relative mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator */}
            <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-black">
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Qarz To'lovi Kiritish</h3>
                  <p className="text-xs font-semibold text-[var(--text3)]">{quickPayClient.ism}</p>
                </div>
              </div>
              <button 
                onClick={() => setQuickPayClient(null)} 
                className="p-2 bg-[var(--bg)] hover:bg-[var(--border)] rounded-xl text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickPaySubmit} className="flex flex-col gap-4 mt-4">
              {/* Current balance reminder */}
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3.5 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-600 uppercase">Hozirgi Qoldiq Qarz:</span>
                <span className="text-base font-black text-rose-600 tabular-nums">
                  {((quickPayClient.balans || 0)).toLocaleString()} UZS
                </span>
              </div>

              {/* Amount input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase">TO'LOV SUMMASI (UZS) *</label>
                <input 
                  type="number" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={payAmount} 
                  onChange={e => setPayAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Masalan: 5 000 000"
                  required
                  autoFocus
                  className="w-full h-12 min-h-[44px] px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-lg font-black text-emerald-600 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Kassa Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase">TO'LOV USULI / KASSA</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'naqd', label: 'Naqd' },
                    { id: 'karta', label: 'Plastik' },
                    { id: 'bank', label: 'Bank' },
                    { id: 'dollar', label: 'Dollar' }
                  ].map(k => (
                    <button
                      type="button"
                      key={k.id}
                      onClick={() => setPayKassa(k.id as any)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                        payKassa === k.id
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[var(--text3)] uppercase">QO'SHIMCHA IZOH</label>
                <input 
                  type="text" 
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  placeholder="Kvitansiya yoki eslatma..."
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--text)] outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-[var(--border)] mt-2">
                <button
                  type="button"
                  onClick={() => setQuickPayClient(null)}
                  className="flex-1 py-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  To'lovni Qabul Qilish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.5. NARXSIZ CHIQIMLARNI HISOBLASH & QARZLARNI YANGILASH MODALI */}
      {showUnpricedModal && (() => {
        const stats = getUnpricedSalesStats(db);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[230] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-[var(--bg2)] text-[var(--text)] w-full max-w-xl max-h-[90vh] sm:max-h-[85vh] rounded-3xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
              {/* Fixed Header */}
              <div className="px-6 py-4.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg2)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp size={20} className={isSyncingPrices ? "animate-pulse" : ""} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--text)]">Narxsiz Chiqimlarni Hisoblash & Qarzlarga O'tkazish</h3>
                    <p className="text-xs text-[var(--text3)]">Modellar narxi bo'yicha mijozlar qarzdorligini avtomatik to'g'rilash</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowUnpricedModal(false)} 
                  className="p-1.5 bg-[var(--bg)] hover:bg-[var(--border)] rounded-xl text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-6 overflow-y-auto min-h-0 flex-1 space-y-5 overscroll-contain">
                {/* Quick KPI Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Hisoblanadigan Chiqimlar</span>
                    <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">
                      {stats.resolvableChiqimCount} ta
                    </p>
                    <span className="text-[11px] text-[var(--text3)]">({stats.resolvableChiqimQty} juft)</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Ta'sir qiluvchi mijozlar</span>
                    <p className="text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                      {stats.impactedClients.length} mijoz
                    </p>
                    <span className="text-[11px] text-[var(--text3)]">CRM hisobida</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--text3)]">Jami Hisoblanadigan Summa</span>
                    <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                      +{formatUzs(stats.estimatedTotalSum)}
                    </p>
                    <span className="text-[10px] font-bold text-emerald-500">UZS</span>
                  </div>
                </div>

                {/* Explanatory note */}
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 text-xs font-medium leading-relaxed flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <strong>Qanday amalga oshiriladi?</strong>
                    <p className="mt-0.5">
                      Mijozlar mahsulot olgan vaqtda narx kiritilmagan bo'lsa (summasi 0), hozir kiritilgan model narxlari bo'yicha har bir savdo hisoblab chiqiladi va mijozning umumiy balansi va qarzi to'g'ri ko'rsatiladi.
                    </p>
                  </div>
                </div>

                {/* List of sample items */}
                {stats.details.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-black uppercase text-[var(--text3)]">Aniqlangan chiqimlar ({stats.details.length} ta):</span>
                    <div className="max-h-64 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)] text-xs">
                      {stats.details.map(item => (
                        <div key={item.id} className="p-2.5 flex items-center justify-between hover:bg-[var(--bg2)] transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[var(--text)]">{item.model} ({item.olcham}°)</span>
                              <span className="text-[var(--text3)]">• {item.soni} juft</span>
                            </div>
                            <p className="text-[11px] text-[var(--text3)]">
                              Mijoz: <span className="font-semibold text-[var(--text2)]">{item.kimdan}</span> ({item.sana})
                            </p>
                          </div>
                          <div className="text-right">
                            {item.canResolve ? (
                              <>
                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">+{formatUzs(item.newSumma)} UZS</span>
                                <p className="text-[10px] text-[var(--text3)]">@{formatUzs(item.unitPrice)} UZS</p>
                              </>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                Model narxi kiritilmagan
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
                  onClick={() => setShowUnpricedModal(false)}
                  disabled={isSyncingPrices}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg2)] transition-all cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSyncingPrices(true);
                    try {
                      const { newDb, updatedChiqimCount, updatedChiqimQty, totalRecalculatedSum, impactedClientsCount } = syncUnpricedTransactionsWithCurrentPrices(db, currentUser);
                      setDb(newDb);
                      toast.success(
                        `Muvaffaqiyatli: ${updatedChiqimCount} ta chiqim (${updatedChiqimQty} juft) bo'yicha jami +${formatUzs(totalRecalculatedSum)} UZS hisoblandi va ${impactedClientsCount} ta mijoz qarzi to'liq yangilandi!`,
                        { duration: 6000 }
                      );
                      setShowUnpricedModal(false);
                    } catch (e: any) {
                      toast.error("Xatolik yuz berdi: " + (e?.message || e));
                    } finally {
                      setIsSyncingPrices(false);
                    }
                  }}
                  disabled={isSyncingPrices || stats.resolvableChiqimCount === 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-emerald-600/25 transition-all cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw size={14} className={isSyncingPrices ? "animate-spin" : ""} />
                  <span>{isSyncingPrices ? "Hisoblanmoqda..." : "Ha, hisoblash va qarzlarga qo'shish"}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. MAIN CLIENTS DATABASE CARD */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl flex flex-col shadow-xs overflow-hidden">
        
        {/* Top Filter and Search Bar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] bg-[var(--bg)] flex flex-col gap-3.5">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black">
                <Users size={20} />
              </div>
              <div>
                <h3 className="font-black text-[var(--text)] text-base sm:text-lg flex items-center gap-2">
                  Mijozlar Bazasi & CRM
                </h3>
                <p className="text-xs font-semibold text-[var(--text3)]">
                  Jami {sortedList.length} ta ko'rsatilmoqda (Jami {kontragentlar.length})
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View Mode Switcher (Grid / Table / Compact) */}
              <div className="flex items-center bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                    viewMode === 'grid' 
                      ? "bg-blue-600 text-white shadow-xs" 
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Karta ko'rinishi (Grid)"
                >
                  <LayoutGrid size={14} />
                  <span className="hidden sm:inline">Kartalar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                    viewMode === 'table' 
                      ? "bg-blue-600 text-white shadow-xs" 
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Jadval ko'rinishi (Table)"
                >
                  <TableIcon size={14} />
                  <span className="hidden sm:inline">Jadval</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                    viewMode === 'compact' 
                      ? "bg-blue-600 text-white shadow-xs" 
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Kompakt ro'yxat"
                >
                  <List size={14} />
                  <span className="hidden sm:inline">Kompakt</span>
                </button>
              </div>

              {/* Regional Dashboard Toggle */}
              <button
                type="button"
                onClick={() => setShowRegionPanel(prev => !prev)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border",
                  showRegionPanel || selectedViloyat !== 'all'
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                    : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--border)]"
                )}
                title="Hududlar bo'yicha tahlil va filtr"
              >
                <Globe size={14} />
                <span>Hududlar</span>
                {selectedViloyat !== 'all' && (
                  <span className="px-1.5 py-0.2 rounded bg-white/20 text-white text-[10px] font-black">
                    {selectedViloyat}
                  </span>
                )}
              </button>

              {/* Smart Filter Dropdown (All 8 filters unified into single compact dropdown) */}
              <div className="relative">
                <select
                  value={activePill}
                  onChange={e => setActivePill(e.target.value as any)}
                  className={cn(
                    "px-3 py-1.5 appearance-none rounded-xl text-xs font-extrabold outline-none cursor-pointer pr-7 transition-all border",
                    activePill === 'all'
                      ? "bg-[var(--bg2)] border-[var(--border)] text-[var(--text)] focus:border-blue-500"
                      : activePill === 'debtor' || activePill === 'overdue'
                        ? "bg-rose-500/10 border-rose-500/50 text-rose-600 dark:text-rose-400 font-black shadow-2xs ring-1 ring-rose-500/30"
                        : activePill === 'vip'
                          ? "bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400 font-black shadow-2xs"
                          : "bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400 font-black shadow-2xs"
                  )}
                >
                  <option value="all">🎯 Barcha mijozlar ({kontragentlar.length})</option>
                  <option value="debtor">🔴 Qarzdorlar ({debtorsCount})</option>
                  <option value="overdue">⏰ 30+ kun qarz ({overdueCount})</option>
                  <option value="vip">💎 VIP / Top ({vipCount})</option>
                  <option value="clean">🟢 0 Balans / Haqdor ({cleanCount})</option>
                  <option value="sleeping">⏳ Uxlayotganlar ({sleepingCount})</option>
                  <option value="ulgurji">⭐️ Ulgurji ({ulgurjiCount})</option>
                  <option value="chakana">🛍️ Chakana ({chakanaCount})</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
              </div>

              {/* Sorting dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="px-3 py-1.5 appearance-none bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-blue-500 cursor-pointer pr-7"
                >
                  <option value="balans_desc">💰 Eng katta qarz</option>
                  <option value="balans_asc">🟢 Kam qarz / Haqdor</option>
                  <option value="jami_desc">📦 Xarid hajmi (Juft)</option>
                  <option value="xaridlar_desc">🔄 Xaridlar soni</option>
                  <option value="oxirgiXarid_desc">📅 Oxirgi xarid sanasi</option>
                  <option value="ism_asc">🔤 Ism bo'yicha (A-Z)</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
              </div>

              {/* Recalculate & Reassign Tools */}
              {(() => {
                const unpriced = getUnpricedSalesStats(db);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowUnpricedModal(true)}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border border-emerald-500/20"
                      title="Narxsiz amalga oshirilgan savdolarni joriy narxlar bilan hisoblab qarzlarga o'tkazish"
                    >
                      <TrendingUp size={13} className={unpriced.resolvableChiqimCount > 0 ? "text-emerald-500 animate-pulse" : ""} />
                      <span>Narxsiz Chiqimlarni Hisoblash</span>
                      {unpriced.resolvableChiqimCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                          {unpriced.resolvableChiqimCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowReassignModal(true)}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-blue-400 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border border-blue-500/20"
                      title="Chiqimlarni mijozlarga taqsimlash va balanslarni to'g'rilash"
                    >
                      <Users size={14} />
                      <span className="hidden md:inline">Taqsimlash & Tiklash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const updated = recalculateAllClientBalances(db);
                          setDb(updated);
                          toast.success("Barcha mijozlar balansi va xarid hajmlari 100% qayta hisoblab to'g'rilandi!");
                        } catch (e: any) {
                          toast.error("Xatolik: " + e.message);
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-500/10 hover:bg-slate-700 hover:text-white text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border border-slate-500/20"
                      title="Barcha mijozlar balansini avtomatik qayta hisoblash"
                    >
                      <RefreshCw size={13} />
                      <span className="hidden lg:inline">Balanslarni Qayta Hisoblash</span>
                    </button>
                  </>
                );
              })()}

              {/* Excel Export Button */}
              <button 
                onClick={() => handleExportExcel(false)}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Barcha ko'rsatilganlarni Excelga yuklash"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Excel</span>
              </button>

              {/* Add Client Button (Compact '+' Icon Button) */}
              <button 
                type="button"
                onClick={openAdd}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl flex items-center justify-center shadow-sm shadow-blue-500/25 cursor-pointer transition-all shrink-0"
                title="Yangi mijoz qo'shish"
              >
                <Plus size={17} className="stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Full-width Large Search Bar (Kengaytirilgan pastki qidiruv paneli) */}
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4 sm:w-5 sm:h-5" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Mijoz ismi, telefon raqami, viloyati yoki '>1000000' (qarz bo'yicha) qidirish..." 
              className="w-full pl-10 sm:pl-11 pr-10 py-2 sm:py-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl text-xs sm:text-sm font-medium text-[var(--text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs placeholder:text-[var(--text3)]"
            />
            {search && (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg hover:bg-[var(--bg)] transition-colors cursor-pointer"
                title="Qidiruvni tozalash"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Quick Filter Horizontal Scrollable Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mt-1 text-xs">
            {[
              { id: 'all', label: 'Barchasi', count: kontragentlar.length, color: 'blue' },
              { id: 'debtor', label: 'Qarzdorlar', count: debtorsCount, color: 'rose', badge: '🔴' },
              { id: 'overdue', label: '30+ kun qarz', count: overdueCount, color: 'rose', badge: '🚨' },
              { id: 'vip', label: 'VIP / Top', count: vipCount, color: 'amber', badge: '💎' },
              { id: 'clean', label: '0 Balans / Haqdor', count: cleanCount, color: 'emerald', badge: '🟢' },
              { id: 'sleeping', label: 'Uxlayotgan', count: sleepingCount, color: 'zinc', badge: '⏳' },
              { id: 'ulgurji', label: 'Ulgurji', count: ulgurjiCount, color: 'blue', badge: '⭐️' },
              { id: 'chakana', label: 'Chakana', count: chakanaCount, color: 'emerald', badge: '🛍️' },
            ].map(tab => {
              const isActive = activePill === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePill(tab.id as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border shrink-0 text-[11px] sm:text-xs",
                    isActive
                      ? tab.color === 'rose'
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs shadow-rose-500/20"
                        : tab.color === 'amber'
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs shadow-amber-500/20"
                          : tab.color === 'emerald'
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs shadow-emerald-500/20"
                            : "bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-500/20"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:border-blue-500/30"
                  )}
                >
                  {tab.badge && <span>{tab.badge}</span>}
                  <span>{tab.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                    isActive ? "bg-white/25 text-white" : "bg-[var(--bg)] text-[var(--text3)]"
                  )}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Regional Dashboard Panel (Collapsible) */}
          {showRegionPanel && (
            <div className="p-3.5 bg-[var(--bg2)] rounded-2xl border border-indigo-500/30 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={14} />
                  Hududlar Bo'yicha Mijozlar va Qarzdorlik Taqsimoti
                </span>
                {selectedViloyat !== 'all' && (
                  <button
                    onClick={() => setSelectedViloyat('all')}
                    className="text-[11px] font-bold text-indigo-500 hover:underline cursor-pointer"
                  >
                    Filtrni tozalash
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedViloyat('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                    selectedViloyat === 'all'
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  <span>Barcha viloyatlar</span>
                  <span className="px-1.5 py-0.2 rounded bg-black/15 text-[10px] font-black">{kontragentlar.length}</span>
                </button>

                {regionStats.map(stat => (
                  <button
                    key={stat.region}
                    type="button"
                    onClick={() => setSelectedViloyat(stat.region)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-2",
                      selectedViloyat === stat.region
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-indigo-500/40"
                    )}
                  >
                    <span>{stat.region}</span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black">
                      {stat.count} ta
                    </span>
                    {stat.debt > 0 && (
                      <span className="text-[10px] font-black text-rose-500">
                        {formatCompact(stat.debt)} UZS
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* 6. STICKY BULK ACTIONS FLOATING BAR (If items selected) */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-600 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 font-black text-xs">
              <CheckSquare size={16} />
              <span>{selectedIds.size} ta mijoz tanlandi</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleBulkChangeCategory('Ulgurji')}
                className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
              >
                ⭐️ Ulgurjiga o'tkazish
              </button>
              <button
                onClick={() => handleBulkChangeCategory('Chakana')}
                className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
              >
                🛍️ Chakanaga o'tkazish
              </button>
              <button
                onClick={() => handleExportExcel(true)}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
              >
                <Download size={13} /> Tanlanganlarni Excelga
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        )}
        
        {/* 7. VIEW MODES DISPATCHER */}
        
        {/* === MODE A: MODERN GRID CARDS VIEW === */}
        {viewMode === 'grid' && (
          <div className="p-4 sm:p-5">
            {sortedList.length === 0 ? (
              <div className="text-center py-16 text-[var(--text3)]">
                <Users size={44} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-bold">Mijozlar topilmadi</p>
                <p className="text-xs mt-0.5">Filtr yoki qidiruv so'zini o'zgartirib ko'ring</p>
              </div>
            ) : (
              <div>
              <VirtuosoGrid
                style={{ height: '700px' }}
                totalCount={sortedList.length}
                listClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                itemContent={(kIdx) => {
                  const k = sortedList[kIdx];
                  const { diffDays, isOverdue, isVip, isSleeping, isNew, isRecentActive } = getClientBadges(k);
                  const isSelected = selectedIds.has(k.id);
                  const balans = k.balans || 0;
                  const isDangerousDebt = isOverdue || (balans > 10000000);
                  const creditLimit = k.kreditLimiti || 0;
                  const limitUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((Math.max(0, balans) / creditLimit) * 100)) : 0;

                  return (
                    <div
                      key={`${k.id || 'client'}_${kIdx}`}
                      onClick={() => onSelectClient(k)}
                      className={cn(
                        "bg-[var(--bg)] border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all cursor-pointer group hover:shadow-md relative overflow-hidden",
                        isSelected 
                          ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/5" 
                          : isDangerousDebt 
                            ? "border-rose-500/40 hover:border-rose-500" 
                            : "border-[var(--border)] hover:border-blue-500/40"
                      )}
                    >
                      {/* === OMBORCHI KO'RINISHI (OMBORCHI UCHUN O'ZGARMAYDI) === */}
                      {isOmborchi ? (
                        <>
                          {/* Omborchi Top Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Avatar */}
                              <div className={cn(
                                "w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs relative",
                                isDangerousDebt 
                                  ? 'bg-rose-600 shadow-rose-500/30 ring-2 ring-rose-500/40' 
                                  : isVip 
                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20' 
                                    : 'bg-gradient-to-br from-blue-600 to-indigo-600'
                              )}>
                                {getInitials(k.ism)}
                                {isDangerousDebt && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900 animate-ping"></span>
                                )}
                              </div>

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-sm text-[var(--text)] group-hover:text-blue-600 transition-colors truncate">
                                    {k.ism}
                                  </span>
                                  {isVip && (
                                    <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[9px] font-black uppercase rounded-md flex items-center gap-0.5 shrink-0">
                                      <Crown size={10} /> VIP
                                    </span>
                                  )}
                                  {isDangerousDebt && (
                                    <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-black uppercase rounded-md animate-pulse shrink-0">
                                      30+ kun
                                    </span>
                                  )}
                                </div>

                                <span className="text-xs font-semibold text-[var(--text3)] flex items-center gap-1.5 mt-0.5">
                                  {k.viloyat && (
                                    <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[10px] shrink-0">
                                      {k.viloyat}
                                    </span>
                                  )}
                                  <span className="truncate max-w-[140px]">{k.manzil || 'Manzil yo\'q'}</span>
                                </span>
                              </div>
                            </div>

                            {/* Omborchi Direct Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                              <a
                                href={`tel:${k.tel}`}
                                className="flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-black text-xs transition-colors"
                                title={`Qo'ng'iroq qilish: ${k.tel}`}
                              >
                                <Phone size={14} /> <span className="hidden sm:inline">Tel</span>
                              </a>
                              <a
                                href={`https://t.me/${k.tel?.replace('+', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 font-black text-xs transition-colors"
                                title="Telegram orqali yozish"
                              >
                                <Send size={14} /> <span className="hidden sm:inline">TG</span>
                              </a>
                            </div>
                          </div>

                          {/* Omborchi Balans Ko'rinishi */}
                          {balans > 0 ? (
                            <div className="bg-rose-500/10 dark:bg-rose-500/15 border-2 border-rose-500/30 rounded-2xl p-3 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                  <AlertTriangle size={12} /> Qoldiq Qarz
                                </span>
                                <div className="text-lg font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                                  -{balans.toLocaleString()} <span className="text-xs font-bold">UZS</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-[var(--text3)] uppercase block">Xaridlar</span>
                                <span className="font-extrabold text-xs text-[var(--text2)] font-mono">
                                  {(k.jami || 0).toLocaleString()} juft
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                                  <CheckCircle2 size={16} />
                                </div>
                                <div>
                                  <div className="text-xs font-black text-emerald-600">Qarz yo'q (0 UZS)</div>
                                  <span className="text-[10px] font-bold text-[var(--text3)]">
                                    Xaridlar: {(k.jami || 0).toLocaleString()} juft
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Omborchi Pastki Aloqa Tugmalari */}
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
                            {k.tel ? (
                              <button
                                type="button"
                                onClick={(e) => handleDirectCall(k.tel, e)}
                                className="h-10 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-300 hover:text-white border border-emerald-500/30 flex items-center justify-center gap-1.5 font-black text-xs transition-all cursor-pointer"
                              >
                                <PhoneCall size={14} className="shrink-0" />
                                <span className="truncate">{formatPhoneNumber(k.tel) || "Qo'ng'iroq"}</span>
                              </button>
                            ) : (
                              <div className="h-10 px-2.5 rounded-xl bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)] opacity-50 flex items-center justify-center gap-1.5 font-bold text-xs">
                                <Phone size={14} /> Tel yo'q
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => openTelegramModal(k, e)}
                              className="h-10 px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-600 dark:text-sky-300 hover:text-white border border-sky-500/30 flex items-center justify-center gap-1.5 font-black text-xs transition-all cursor-pointer"
                            >
                              <Send size={14} className="shrink-0" />
                              <span>Telegram</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        /* === ADMIN KO'RINISHI (ANIQ, TARTIBLI, TAHRIRLASH VA O'CHIRISH TUGMALARI BILAN) === */
                        <div className="flex flex-col gap-3.5">
                          {/* 1. Header: Selection, Avatar, Ism, Badges va Admin Tugmalari */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* Selection Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleSelect(k.id, e)}
                                className="text-[var(--text3)] hover:text-blue-600 p-0.5 mt-1 shrink-0 cursor-pointer"
                                title={isSelected ? "Tanlovni bekor qilish" : "Tanlash"}
                              >
                                {isSelected ? (
                                  <CheckSquare size={18} className="text-blue-600" />
                                ) : (
                                  <Square size={18} className="opacity-40 group-hover:opacity-100" />
                                )}
                              </button>

                              {/* Avatar */}
                              <div className={cn(
                                "w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs relative mt-0.5",
                                isDangerousDebt 
                                  ? 'bg-rose-600 shadow-rose-500/30 ring-2 ring-rose-500/40' 
                                  : isVip 
                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20' 
                                    : 'bg-gradient-to-br from-blue-600 to-indigo-600'
                              )}>
                                {getInitials(k.ism)}
                                {isDangerousDebt && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900 animate-ping"></span>
                                )}
                              </div>

                              {/* Ism va Tafsilotlar (Keng joy ajratilgan, mijoz ismi aniq ko'rinadi) */}
                              <div className="flex flex-col min-w-0 flex-1">
                                <div 
                                  className="font-black text-base sm:text-[15px] text-[var(--text)] group-hover:text-blue-600 transition-colors leading-tight break-words line-clamp-2"
                                  title={k.ism}
                                >
                                  {k.ism || 'Nomsiz Mijoz'}
                                </div>

                                {/* Status nishonlari & Manzil qatori */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs text-[var(--text3)]">
                                  {k.viloyat && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[10px] shrink-0">
                                      {k.viloyat}
                                    </span>
                                  )}
                                  {k.kategoriya === 'Ulgurji' ? (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-600 font-bold uppercase shrink-0">
                                      ⭐️ Ulgurji
                                    </span>
                                  ) : k.kategoriya === 'Chakana' ? (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 font-bold uppercase shrink-0">
                                      🛍️ Chakana
                                    </span>
                                  ) : null}
                                  {isVip && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[10px] font-bold uppercase rounded-md flex items-center gap-0.5 shrink-0">
                                      <Crown size={10} /> VIP
                                    </span>
                                  )}
                                  {isDangerousDebt && (
                                    <span className="px-1.5 py-0.5 bg-rose-600 text-white text-[10px] font-black uppercase rounded-md animate-pulse shrink-0">
                                      30+ kun
                                    </span>
                                  )}
                                  <span className="truncate max-w-[150px] font-medium text-[11px] text-[var(--text3)]">
                                    {k.manzil || "Manzil yo'q"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Admin Action Buttons (Ixcham va to'sqinlik qilmaydigan Tahrirlash & O'chirish) */}
                            <div className="flex items-center gap-1 shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
                              {/* Tahrirlash Tugmasi */}
                              <button
                                type="button"
                                onClick={(e) => openEdit(k, e)}
                                className="w-8 h-8 rounded-xl bg-blue-500/10 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-500/20 flex items-center justify-center transition-all cursor-pointer shadow-2xs group/edit"
                                title="Mijoz ma'lumotlarini tahrirlash"
                                aria-label="Tahrirlash"
                              >
                                <Edit2 size={14} className="group-hover/edit:scale-110 transition-transform" />
                              </button>
                              
                              {/* O'chirish Tugmasi (Ikki bosqichli tasdiq bilan) */}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteClick(k.id, e)}
                                className={cn(
                                  "h-8 rounded-xl font-bold text-xs flex items-center justify-center transition-all cursor-pointer shadow-2xs group/del",
                                  deleteId === k.id 
                                    ? "px-2.5 bg-rose-600 text-white shadow-rose-600/30 animate-pulse gap-1" 
                                    : "w-8 bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-500/20"
                                )}
                                title={deleteId === k.id ? "O'chirishni tasdiqlash uchun bosing" : "Mijozni bazadan o'chirish"}
                                aria-label={deleteId === k.id ? "O'chirishni tasdiqlash" : "O'chirish"}
                              >
                                {deleteId === k.id ? (
                                  <>
                                    <Check size={13} />
                                    <span>Tasdiq</span>
                                  </>
                                ) : (
                                  <Trash2 size={14} className="group-hover/del:scale-110 transition-transform" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* 2. Admin Financial Status / Balans Kartasi */}
                          {balans > 0 ? (
                            <div className="bg-rose-500/10 dark:bg-rose-500/15 border-2 border-rose-500/30 dark:border-rose-500/40 rounded-2xl p-3 sm:p-3.5 flex flex-col gap-2.5 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                                  <AlertTriangle size={13} /> Qoldiq Qarz
                                </span>
                                {isOverdue ? (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[9px] uppercase animate-pulse">
                                    30+ kun kechikkan
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-rose-600/85">
                                    To'lov kutilmoqda
                                  </span>
                                )}
                              </div>

                              <div className="flex items-baseline justify-between gap-2">
                                <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums tracking-tight">
                                  -{balans.toLocaleString()} <span className="text-xs sm:text-sm font-black uppercase text-rose-500">UZS</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-bold text-[var(--text3)] uppercase block">Xaridlar</span>
                                  <span className="font-extrabold text-xs text-[var(--text2)] font-mono">
                                    {(k.jami || 0).toLocaleString()} <span className="text-[10px] font-bold text-[var(--text3)]">juft</span>
                                  </span>
                                </div>
                              </div>

                              {/* Tezkor Qarz To'lash Tugmasi */}
                              <div onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickPayClient(k);
                                    setPayAmount(balans);
                                  }}
                                  className="w-full h-11 min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/25 active:scale-98 transition-all"
                                  title="Qarzni so'ndirish uchun to'lov kiritish"
                                >
                                  <DollarSign size={18} className="stroke-[3]" />
                                  <span>Qarzni To'lash ({formatCompact(balans)} UZS)</span>
                                </button>
                              </div>
                            </div>
                          ) : balans === 0 ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                                  <CheckCircle2 size={18} />
                                </div>
                                <div>
                                  <div className="text-xs font-black text-emerald-600">Qarz yo'q (0 UZS)</div>
                                  <span className="text-[10px] font-bold text-[var(--text3)]">
                                    Xaridlar: {(k.jami || 0).toLocaleString()} juft
                                  </span>
                                </div>
                              </div>
                              <div onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickPayClient(k);
                                    setPayAmount('');
                                  }}
                                  className="px-3.5 h-9 rounded-xl bg-emerald-600/15 hover:bg-emerald-600 hover:text-white text-emerald-600 font-black text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                >
                                  <Plus size={14} /> To'lov
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-blue-500/10 border border-blue-500/25 rounded-2xl p-3 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Mijoz haqdori (Avans)</span>
                                <div className="text-base font-black text-blue-600 font-mono tabular-nums">
                                  +{Math.abs(balans).toLocaleString()} UZS
                                </div>
                                <span className="text-[10px] font-bold text-[var(--text3)]">
                                  Xaridlar: {(k.jami || 0).toLocaleString()} juft
                                </span>
                              </div>
                              <div onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickPayClient(k);
                                    setPayAmount('');
                                  }}
                                  className="px-3.5 h-9 rounded-xl bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-600 font-black text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                >
                                  <Plus size={14} /> To'lov
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Kredit Limiti Indikatori (agar mavjud bo'lsa) */}
                          {creditLimit > 0 && (
                            <div className="bg-[var(--bg2)] rounded-xl p-2.5 border border-[var(--border)] flex flex-col gap-1">
                              <div className="flex justify-between text-[10px] font-extrabold text-[var(--text3)]">
                                <span>Kredit limiti: {formatCompact(creditLimit)} UZS</span>
                                <span className={cn(limitUsagePercent >= 90 ? "text-rose-600 font-black" : "")}>
                                  {limitUsagePercent}% band
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    limitUsagePercent >= 90 ? "bg-rose-500" : limitUsagePercent >= 60 ? "bg-amber-500" : "bg-emerald-500"
                                  )}
                                  style={{ width: `${limitUsagePercent}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* 3. Pastki Aloqa Tugmalari (Qo'ng'iroq va Telegram) */}
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
                            {k.tel ? (
                              <button
                                type="button"
                                onClick={(e) => handleDirectCall(k.tel, e)}
                                className="h-10 sm:h-11 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-300 hover:text-white border border-emerald-500/30 flex items-center justify-center gap-1.5 font-black text-xs sm:text-sm active:scale-95 transition-all shadow-2xs cursor-pointer group/call"
                                title={`To'g'ridan-to'g'ri qo'ng'iroq qilish: ${k.tel}`}
                              >
                                <PhoneCall size={15} className="text-emerald-600 dark:text-emerald-400 group-hover/call:text-white shrink-0" />
                                <span className="truncate">{formatPhoneNumber(k.tel) || "Qo'ng'iroq"}</span>
                              </button>
                            ) : (
                              <div className="h-10 sm:h-11 px-2.5 rounded-xl bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)] opacity-50 flex items-center justify-center gap-1.5 font-bold text-xs">
                                <Phone size={14} />
                                <span>Tel yo'q</span>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={(e) => openTelegramModal(k, e)}
                              className="h-10 sm:h-11 px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-600 dark:text-sky-300 hover:text-white border border-sky-500/30 flex items-center justify-center gap-1.5 font-black text-xs sm:text-sm active:scale-95 transition-all shadow-2xs cursor-pointer group/tg"
                              title="Telegram orqali eslatma yoki xabar yuborish"
                            >
                              <Send size={15} className="text-sky-500 dark:text-sky-300 group-hover/tg:text-white shrink-0" />
                              <span>Telegram</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          )}
        </div>
      )}

        {/* === MODE B: RICH TABLE VIEW === */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left border-collapse text-xs">
              <thead className="bg-[var(--bg)] text-[var(--text3)] text-[11px] font-black uppercase tracking-wider sticky top-0 border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3.5 text-center w-12" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={handleToggleSelectAll}
                      className="p-1 hover:text-blue-500 cursor-pointer"
                    >
                      {selectedIds.size > 0 && selectedIds.size === sortedList.length ? (
                        <CheckSquare size={16} className="text-blue-600" />
                      ) : (
                        <Square size={16} className="text-[var(--text3)]" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5">Mijoz / Do'kon & Status</th>
                  <th className="px-4 py-3.5">Aloqa & Manzil</th>
                  <th className="px-4 py-3.5 text-center">Toifa</th>
                  <th className="px-4 py-3.5 text-right">Balans (Qarz / Haq)</th>
                  <th className="px-4 py-3.5 text-center">Xaridlar</th>
                  <th className="px-4 py-3.5 text-right">Jami Olingan</th>
                  <th className="px-4 py-3.5 text-center">Aloqa (Telegram & Tel)</th>
                  <th className="px-4 py-3.5 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {sortedList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-[var(--text3)]">
                      <Users size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-bold">Mijozlar topilmadi</p>
                      <p className="text-xs mt-0.5">Filtr yoki qidiruv so'zini o'zgartirib ko'ring</p>
                    </td>
                  </tr>
                ) : (
                  sortedList.slice(0, visibleCount).map((k, kIdx) => {
                    const { diffDays, isOverdue, isVip, isSleeping, isNew, isRecentActive } = getClientBadges(k);
                    const isSelected = selectedIds.has(k.id);
                    const balans = k.balans || 0;
                    const isDangerousDebt = isOverdue || (balans > 10000000);
                    const isMediumDebt = balans > 0 && !isDangerousDebt;
                    const isPrepaid = balans < 0;

                    return (
                      <tr 
                        key={`${k.id || 'client'}_${kIdx}`} 
                        className={cn(
                          "transition-colors cursor-pointer group hover:bg-[var(--bg)]",
                          isSelected ? "bg-blue-500/10" : "",
                          (!isSelected && isDangerousDebt) ? "bg-rose-500/5" : ""
                        )}
                        onClick={() => onSelectClient(k)}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3.5 text-center" onClick={(e) => handleToggleSelect(k.id, e)}>
                          <button className="p-1 hover:text-blue-500 cursor-pointer">
                            {isSelected ? (
                              <CheckSquare size={16} className="text-blue-600" />
                            ) : (
                              <Square size={16} className="text-[var(--text3)] opacity-40 group-hover:opacity-100" />
                            )}
                          </button>
                        </td>

                        {/* Client Info with Multi-State Activity Badges */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs relative",
                              isDangerousDebt 
                                ? 'bg-rose-600 shadow-rose-500/30 ring-2 ring-rose-500/40' 
                                : isVip 
                                  ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20' 
                                  : 'bg-gradient-to-br from-blue-600 to-indigo-600'
                            )}>
                              {getInitials(k.ism)}
                              {isDangerousDebt && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900 animate-ping"></span>
                              )}
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-sm text-[var(--text)] group-hover:text-blue-600 transition-colors">
                                  {k.ism}
                                </span>

                                {isDangerousDebt && (
                                  <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded-md animate-pulse shadow-xs">
                                    30+ kun qarz
                                  </span>
                                )}

                                {isVip && !isDangerousDebt && (
                                  <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-0.5">
                                    <Crown size={10} /> VIP
                                  </span>
                                )}

                                {isRecentActive && !isDangerousDebt && !isVip && (
                                  <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider rounded-md flex items-center gap-0.5">
                                    <Flame size={10} /> Faol
                                  </span>
                                )}

                                {isSleeping && (
                                  <span className="px-1.5 py-0.2 bg-zinc-500/15 text-zinc-500 text-[9px] font-extrabold uppercase rounded-md">
                                    ⏳ Uxlayotgan
                                  </span>
                                )}
                              </div>

                              {k.izoh && <div className="text-[11px] font-medium text-[var(--text3)] truncate max-w-[200px]">{k.izoh}</div>}
                            </div>
                          </div>
                        </td>

                        {/* Phone & Address */}
                        <td className="px-4 py-3.5">
                          <div className="font-extrabold text-xs text-[var(--text)] tracking-wide">{formatPhoneNumber(k.tel) || '—'}</div>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text3)] mt-0.5">
                            {k.viloyat && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                                {k.viloyat}
                              </span>
                            )}
                            <span>{k.manzil || (k.viloyat ? '' : '—')}</span>
                          </div>
                        </td>

                        {/* Category Badge */}
                        <td className="px-4 py-3.5 text-center">
                          {k.kategoriya === 'Ulgurji' ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-600 font-black uppercase">
                              ⭐️ Ulgurji
                            </span>
                          ) : k.kategoriya === 'Chakana' ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 font-black uppercase">
                              🛍️ Chakana
                            </span>
                          ) : (
                            <span className="text-[var(--text3)]">—</span>
                          )}
                        </td>

                        {/* Balance (Debt / Credit) */}
                        <td className="px-4 py-3.5 text-right font-black tabular-nums text-sm">
                          {isDangerousDebt ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-400 animate-pulse">
                              <AlertTriangle size={13} />
                              <span>-{balans.toLocaleString()}</span>
                            </div>
                          ) : isMediumDebt ? (
                            <span className="text-rose-600 dark:text-rose-400 font-black">
                              -{balans.toLocaleString()}
                            </span>
                          ) : isPrepaid ? (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black">
                              +{Math.abs(balans).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-emerald-600/70 font-extrabold text-xs">
                              0 UZS
                            </span>
                          )}
                        </td>

                        {/* Total visits */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[11px] font-extrabold text-[var(--text)]">
                            {k.xaridlarSoni || 0} marta
                          </span>
                        </td>

                        {/* Total volume */}
                        <td className="px-4 py-3.5 text-right font-black text-sm text-blue-600 dark:text-blue-400 tabular-nums">
                          {(k.jami || 0).toLocaleString()} <span className="text-[10px] font-bold text-[var(--text3)]">j.</span>
                        </td>

                        {/* Direct Communication Buttons */}
                        <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {k.tel ? (
                              <button
                                onClick={(e) => handleDirectCall(k.tel, e)}
                                className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
                                title="Qo'ng'iroq qilish"
                              >
                                <PhoneCall size={14} />
                              </button>
                            ) : null}
                            
                            <button
                              onClick={(e) => openTelegramModal(k, e)}
                              className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
                              title="Telegram orqali eslatma / xabar yuborish"
                            >
                              <Send size={14} />
                            </button>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {!isOmborchi && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setQuickPayClient(k); setPayAmount(k.balans && k.balans > 0 ? k.balans : ''); }}
                                className="p-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl transition-all cursor-pointer font-bold"
                                title="To'lov kiritish ($)"
                              >
                                <DollarSign size={14} />
                              </button>
                            )}
                            
                            {!isOmborchi && (
                              <button 
                                onClick={(e) => openEdit(k, e)}
                                className="p-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-blue-600 hover:border-blue-500/40 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer shadow-xs"
                                title="Mijozni tahrirlash"
                              >
                                <Edit2 size={14} className="text-blue-500" />
                              </button>
                            )}

                            {!isOmborchi && (
                              <button 
                                onClick={(e) => handleDeleteClick(k.id, e)}
                                className={cn(
                                  "p-2 rounded-xl transition-colors cursor-pointer text-xs font-bold",
                                  deleteId === k.id 
                                    ? "bg-rose-500 text-white" 
                                    : "bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-rose-500"
                                )}
                                title={deleteId === k.id ? "Tasdiqlash uchun bosing" : "O'chirish"}
                              >
                                {deleteId === k.id ? 'Tasdiq' : <Trash2 size={14} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {sortedList.length > visibleCount && (
              <div className="p-3.5 bg-[var(--bg2)]/60 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)]">
                <span className="font-semibold text-[var(--text3)]">
                  Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(visibleCount, sortedList.length)}</strong> / {sortedList.length} ta mijoz
                </span>
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + 50)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  Yana 50 ta ko'rsatish ({sortedList.length - visibleCount} qoldi)
                </button>
              </div>
            )}
          </div>
        )}

        {/* === MODE C: COMPACT LIST VIEW === */}
        {viewMode === 'compact' && (
          <div className="divide-y divide-[var(--border)]">
            {sortedList.length === 0 ? (
              <div className="text-center py-16 text-[var(--text3)]">
                <Users size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-bold">Mijozlar topilmadi</p>
              </div>
            ) : (
              sortedList.slice(0, visibleCount).map((k, kIdx) => {
                const { diffDays, isOverdue, isVip } = getClientBadges(k);
                const isSelected = selectedIds.has(k.id);
                const balans = k.balans || 0;
                const isDangerousDebt = isOverdue || (balans > 10000000);

                return (
                  <div
                    key={`${k.id || 'client'}_${kIdx}`}
                    onClick={() => onSelectClient(k)}
                    className={cn(
                      "px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg)] transition-colors cursor-pointer group",
                      isSelected ? "bg-blue-500/10" : "",
                      isDangerousDebt ? "bg-rose-500/5" : ""
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleSelect(k.id, e)}
                        className="text-[var(--text3)] hover:text-blue-600 p-0.5 shrink-0"
                      >
                        {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                      </button>

                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 font-black text-xs flex items-center justify-center shrink-0">
                        {getInitials(k.ism)}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-[var(--text)] group-hover:text-blue-600 transition-colors truncate">
                            {k.ism}
                          </span>
                          {isVip && (
                            <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 text-[9px] font-black rounded">VIP</span>
                          )}
                          {isDangerousDebt && (
                            <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-black rounded animate-pulse">30+ kun</span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--text3)] truncate">
                          {formatPhoneNumber(k.tel) || 'Tel yo\'q'} {k.viloyat ? `• ${k.viloyat}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className={cn(
                          "font-black text-xs tabular-nums",
                          isDangerousDebt ? "text-rose-600" : balans > 0 ? "text-rose-600" : "text-emerald-600"
                        )}>
                          {balans ? `${balans > 0 ? '-' : '+'}${Math.abs(balans).toLocaleString()} UZS` : '0 UZS'}
                        </div>
                        <div className="text-[10px] font-bold text-[var(--text3)]">
                          {(k.jami || 0).toLocaleString()} juft
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {/* Direct Call Button */}
                        {k.tel && (
                          <button
                            type="button"
                            onClick={(e) => handleDirectCall(k.tel, e)}
                            className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title={`Qo'ng'iroq: ${k.tel}`}
                          >
                            <PhoneCall size={14} />
                          </button>
                        )}
                        {/* Telegram Button */}
                        <button
                          type="button"
                          onClick={(e) => openTelegramModal(k, e)}
                          className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 hover:bg-sky-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                          title="Telegram xabar"
                        >
                          <Send size={14} />
                        </button>
                        {/* Quick Pay Button */}
                        {!isOmborchi && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setQuickPayClient(k); setPayAmount(k.balans && k.balans > 0 ? k.balans : ''); }}
                            className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer font-black shadow-2xs",
                              balans > 0
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                            )}
                            title="To'lov kiritish"
                          >
                            <DollarSign size={14} className="stroke-[3]" />
                          </button>
                        )}
                        {/* Edit Button */}
                        {!isOmborchi && (
                          <button
                            type="button"
                            onClick={(e) => openEdit(k, e)}
                            className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-blue-600 hover:border-blue-500/30 flex items-center justify-center transition-all cursor-pointer"
                            title="Tahrirlash"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {sortedList.length > visibleCount && (
              <div className="p-3.5 bg-[var(--bg2)]/60 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)]">
                <span className="font-semibold text-[var(--text3)]">
                  Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(visibleCount, sortedList.length)}</strong> / {sortedList.length} ta mijoz
                </span>
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + 50)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  Yana 50 ta ko'rsatish ({sortedList.length - visibleCount} qoldi)
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      <ClientReassignModal 
        isOpen={showReassignModal} 
        onClose={() => setShowReassignModal(false)} 
      />

    </div>
  );
}
