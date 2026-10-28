import React, { useState, useMemo, Suspense, lazy } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { 
  formatUzs, 
  formatCompact, 
  getTodayStr, 
  getNowStr, 
  generateId, 
  cn 
} from '../lib/utils';
import { 
  KassaHarakati, 
  KassaTuri, 
  XarajatKategoriya, 
  KassaHarakatTuri,
  DbState,
  KassirSmena
} from '../types';
import { 
  Wallet, 
  DollarSign, 
  CreditCard, 
  Landmark, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Minus, 
  ArrowDownRight, 
  ArrowUpRight, 
  ArrowDownLeft,
  ArrowDown,
  ArrowUp,
  Filter, 
  Download, 
  Search, 
  Calendar, 
  Tag, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Info, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Users, 
  Building2, 
  Truck, 
  Zap, 
  Receipt, 
  Coins, 
  HelpCircle,
  RefreshCw,
  RotateCcw,
  X,
  ArrowRightLeft,
  Clock,
  Sparkles,
  ShieldCheck,
  Target,
  Printer,
  ShieldAlert,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { CurrencyModal } from '../components/CurrencyModal';
import { KassaTransferModal } from '../components/kassa/KassaTransferModal';
import { KassirSmenaModal } from '../components/kassa/KassirSmenaModal';
import { ZReportModal } from '../components/kassa/ZReportModal';
import { NetLiquidityView } from '../components/kassa/NetLiquidityView';
import { UnitEconomicsView } from '../components/kassa/UnitEconomicsView';
import { BudgetLimitsView } from '../components/kassa/BudgetLimitsView';
import { AppleCardWallets } from '../components/kassa/AppleCardWallets';
import { FloatingQuickDock } from '../components/kassa/FloatingQuickDock';
import { SmartFilterChips, SmartFilterTag } from '../components/kassa/SmartFilterChips';
import { AdminPinVerifyModal } from '../components/kassa/AdminPinVerifyModal';
import { KassaReceiptModal } from '../components/kassa/KassaReceiptModal';
import { KassaAuditLogView } from '../components/kassa/KassaAuditLogView';
import { PnLAccountingStatement } from '../components/kassa/PnLAccountingStatement';
import { exportKassaMultiSheetExcel } from '../utils/exportKassaMultiSheetExcel';
import { notifyKassaAlert } from '../services/telegramService';
import { LazyViewport } from '../components/common/LazyViewport';

// Lazy loaded charts for ultra-fast mobile rendering
const LazyCashFlowSankeyWaterfall = lazy(() => import('../components/kassa/CashFlowSankeyWaterfall').then(m => ({ default: m.CashFlowSankeyWaterfall })));
const LazyKassaPnlTrendChart = lazy(() => import('../components/kassa/KassaPnlTrendChart'));
const LazyKassaExpensePieChart = lazy(() => import('../components/kassa/KassaExpensePieChart'));

// Katta xarajatlar uchun 2-bosqichli tasdiqlash chegarasi
const LARGE_EXPENSE_THRESHOLD_UZS = 5_000_000;
const LARGE_EXPENSE_THRESHOLD_USD = 500;

// Kategoriya nomlari va ranglari
export const XARAJAT_KATEGORIYALARI: { id: XarajatKategoriya; label: string; icon: any; color: string; bg: string; border: string }[] = [
  { id: 'ish_haqi', label: 'Ish haqi / Oylik', icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
  { id: 'ijara', label: 'Bino / Ombor Ijarasi (Arenda)', icon: Building2, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  { id: 'tushlik_xojalik', label: 'Ovqat & Xo\'jalik', icon: Coins, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  { id: 'postavshik', label: 'Xomashyo / Fabrika to\'lovi', icon: Receipt, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  { id: 'transport', label: 'Transport / Dostavka', icon: Truck, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/15', border: 'border-teal-500/30' },
  { id: 'kommunal', label: 'Kommunal & Internet', icon: Zap, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30' },
  { id: 'soliq_bank', label: 'Soliq & Bank xizmati', icon: Landmark, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/15', border: 'border-indigo-500/30' },
  { id: 'marketing', label: 'Reklama & Marketing', icon: TrendingUp, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/30' },
  { id: 'boshqa', label: 'Boshqa xarajatlar', icon: Layers, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
];

export const getTransactionCategoryMeta = (kategoriya: string, tur: KassaHarakatTuri, izoh?: string) => {
  const isTransfer = (izoh && (izoh.toLowerCase().includes('o\'tkazma') || izoh.toLowerCase().includes('transfer') || izoh.toLowerCase().includes('perevod'))) || (kategoriya === 'kapital' && izoh?.toLowerCase().includes('kassa'));
  
  if (isTransfer) {
    return {
      label: "Kassalararo O'tkazma",
      icon: ArrowRightLeft,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/15",
      border: "border-violet-500/30"
    };
  }

  const expCat = XARAJAT_KATEGORIYALARI.find(c => c.id === kategoriya);
  if (expCat) return expCat;

  if (kategoriya === 'savdo_tushumi') {
    return {
      label: "Savdo Tushumi",
      icon: Receipt,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/30"
    };
  }

  if (kategoriya === 'qarz_tolovi') {
    return {
      label: "Mijoz To'lovi (Nasiya)",
      icon: DollarSign,
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-500/15",
      border: "border-teal-500/30"
    };
  }

  if (kategoriya === 'kapital') {
    return {
      label: "Ta'sischi Kapitali",
      icon: ShieldCheck,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/15",
      border: "border-sky-500/30"
    };
  }

  if (kategoriya === 'boshqa_daromad') {
    return {
      label: "Boshqa Daromad",
      icon: TrendingUp,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/30"
    };
  }

  return {
    label: kategoriya || (tur === 'kirim' ? 'Kirim' : 'Xarajat'),
    icon: Layers,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/15",
    border: "border-slate-500/30"
  };
};

export const KASSA_TURLARI: { id: KassaTuri; label: string; icon: any; valyuta: 'UZS' | 'USD' }[] = [
  { id: 'naqd_uzs', label: 'Naqd Pul (So\'m)', icon: Wallet, valyuta: 'UZS' },
  { id: 'naqd_usd', label: 'Naqd Pul (Dollar $)', icon: DollarSign, valyuta: 'USD' },
  { id: 'karta_uzs', label: 'Karta (Humo/Uzcard)', icon: CreditCard, valyuta: 'UZS' },
  { id: 'bank_uzs', label: 'Bank Hisob Raqami', icon: Landmark, valyuta: 'UZS' },
];

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#6366f1', '#64748b'];

export default function KassaPage() {
  const { db, setDb, currentUser, resetKassaToZero } = useDb();
  const { logAudit } = useAudit();
  const isAdmin = currentUser?.rol === 'admin';

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'foyda' | 'xarajatlar' | 'unit_economics' | 'net_worth' | 'budjet' | 'kategoriyalar' | 'audit'>('foyda');
  
  // Date filter for analytics & transactions
  const [dateRange, setDateRange] = useState<'bugun' | 'hafta' | 'oy' | 'yil' | 'barchasi' | 'ixtiyoriy'>('oy');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(getTodayStr());

  // Search & Filters for transaction history
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKategoriya, setFilterKategoriya] = useState<string>('all');
  const [filterKassaTuri, setFilterKassaTuri] = useState<string>('all');
  const [filterTur, setFilterTur] = useState<string>('all');
  const [activeSmartTag, setActiveSmartTag] = useState<SmartFilterTag>('all');

  // Modals state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [presetKassaTuri, setPresetKassaTuri] = useState<KassaTuri | undefined>(undefined);
  const [isKursModalOpen, setIsKursModalOpen] = useState(false);
  const [isEditBalanceOpen, setIsEditBalanceOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSmenaModalOpen, setIsSmenaModalOpen] = useState(false);
  const [selectedZReportSmena, setSelectedZReportSmena] = useState<KassirSmena | null>(null);
  const [editingHarakat, setEditingHarakat] = useState<KassaHarakati | null>(null);
  const [deletingHarakat, setDeletingHarakat] = useState<KassaHarakati | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isResetKassaModalOpen, setIsResetKassaModalOpen] = useState(false);
  
  // Kvitansiya / Chek Generator Modal
  const [selectedReceiptHarakat, setSelectedReceiptHarakat] = useState<KassaHarakati | null>(null);

  // 2-Bosqichli Admin PIN Tasdiqlash Modali (Anti-Fraud)
  const [pinVerifyModal, setPinVerifyModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionDetails?: {
      actionType: 'large_expense' | 'delete' | 'edit' | 'clear_all' | 'balance_edit' | 'transfer';
      amount?: number;
      currency?: 'UZS' | 'USD';
      recipient?: string;
      threshold?: string;
    };
    onSuccess: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onSuccess: () => {}
  });

  // Forms state
  const valyutaKursi = db.valyutaKursi || 12850;
  const [newKurs, setNewKurs] = useState<number>(valyutaKursi);

  // Initial / current balances
  const kassaBalansi = db.kassaBalansi || {
    naqd_uzs: 0,
    naqd_usd: 0,
    karta_uzs: 0,
    bank_uzs: 0
  };



  // Harakatlar ro'yxati (fast ternary string comparison)
  const kassaHarakatlari = useMemo(() => {
    return (db.kassaHarakatlari || []).slice().sort((a, b) => {
      const dateA = `${a.sana} ${a.vaqt || '00:00'}`;
      const dateB = `${b.sana} ${b.vaqt || '00:00'}`;
      if (dateB !== dateA) return dateB > dateA ? -1 : 1;
      const idA = a?.id || '';
      const idB = b?.id || '';
      if (idB !== idA) return idB > idA ? -1 : 1;
      return 0;
    });
  }, [db.kassaHarakatlari]);

  // Yesterday and Week Ago date strings for smart tags
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const weekAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, []);

  // Smart tag counts for badge indicators
  const smartTagCounts = useMemo(() => {
    const counts: Record<SmartFilterTag, number> = {
      all: kassaHarakatlari.length,
      today: 0,
      yesterday: 0,
      this_week: 0,
      usd_only: 0,
      uzs_only: 0,
      large_amount: 0,
      salary: 0,
      factory: 0,
      rent: 0,
      debt_payment: 0,
      transfers: 0
    };
    kassaHarakatlari.forEach(h => {
      if (h.sana === getTodayStr()) counts.today++;
      if (h.sana === yesterdayStr) counts.yesterday++;
      if (h.sana >= weekAgoStr) counts.this_week++;
      if (h.valyuta === 'USD' || h.kassaTuri === 'naqd_usd') counts.usd_only++;
      if (h.valyuta === 'UZS' || h.kassaTuri !== 'naqd_usd') counts.uzs_only++;
      const valInUzs = h.summaUzs || (h.valyuta === 'USD' ? h.summa * valyutaKursi : h.summa);
      if (valInUzs >= 10_000_000) counts.large_amount++;
      if (h.kategoriya === 'ish_haqi') counts.salary++;
      if (h.kategoriya === 'postavshik') counts.factory++;
      if (h.kategoriya === 'ijara') counts.rent++;
      if (h.kategoriya === 'qarz_tolovi' || (h.izoh && h.izoh.toLowerCase().includes('nasiya'))) counts.debt_payment++;
      if ((h.izoh && h.izoh.toLowerCase().includes('transfer')) || h.kategoriya === 'kapital') counts.transfers++;
    });
    return counts;
  }, [kassaHarakatlari, valyutaKursi, yesterdayStr, weekAgoStr]);

  // Helper to match smart tag
  const matchesSmartTag = (item: KassaHarakati, tag: SmartFilterTag) => {
    if (tag === 'all') return true;
    if (tag === 'today') return item.sana === getTodayStr();
    if (tag === 'yesterday') return item.sana === yesterdayStr;
    if (tag === 'this_week') return item.sana >= weekAgoStr;
    if (tag === 'usd_only') return item.valyuta === 'USD' || item.kassaTuri === 'naqd_usd';
    if (tag === 'uzs_only') return item.valyuta === 'UZS' || item.kassaTuri !== 'naqd_usd';
    if (tag === 'large_amount') {
      const valInUzs = item.summaUzs || (item.valyuta === 'USD' ? item.summa * valyutaKursi : item.summa);
      return valInUzs >= 10_000_000;
    }
    if (tag === 'salary') return item.kategoriya === 'ish_haqi';
    if (tag === 'factory') return item.kategoriya === 'postavshik';
    if (tag === 'rent') return item.kategoriya === 'ijara';
    if (tag === 'debt_payment') return item.kategoriya === 'qarz_tolovi' || (item.izoh && item.izoh.toLowerCase().includes('nasiya'));
    if (tag === 'transfers') return (item.izoh && item.izoh.toLowerCase().includes('transfer')) || item.kategoriya === 'kapital';
    return true;
  };

  // Jami Kassa Aktivlari hisoblash
  const totalAssetsUzs = useMemo(() => {
    const naqdSo = Number(kassaBalansi.naqd_uzs || 0);
    const naqdUsdToUzs = Number(kassaBalansi.naqd_usd || 0) * valyutaKursi;
    const kartaSo = Number(kassaBalansi.karta_uzs || 0);
    const bankSo = Number(kassaBalansi.bank_uzs || 0);
    return naqdSo + naqdUsdToUzs + kartaSo + bankSo;
  }, [kassaBalansi, valyutaKursi]);

  const totalAssetsUsd = useMemo(() => {
    return valyutaKursi > 0 ? totalAssetsUzs / valyutaKursi : 0;
  }, [totalAssetsUzs, valyutaKursi]);

  // Sana bo'yicha filtrlash mantiqi
  const isDateInFilter = (sana: string) => {
    if (!sana) return false;
    const today = getTodayStr();
    if (dateRange === 'bugun') {
      return sana === today;
    }
    if (dateRange === 'hafta') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const weekAgo = d.toISOString().split('T')[0];
      return sana >= weekAgo && sana <= today;
    }
    if (dateRange === 'oy') {
      const currentMonth = today.slice(0, 7);
      return sana.startsWith(currentMonth);
    }
    if (dateRange === 'yil') {
      const currentYear = today.slice(0, 4);
      return sana.startsWith(currentYear);
    }
    if (dateRange === 'ixtiyoriy') {
      if (startDate && sana < startDate) return false;
      if (endDate && sana > endDate) return false;
      return true;
    }
    return true; // barchasi
  };

  // Filtered Chiqim (Sales) transactions
  const allSalesTxs = useMemo(() => {
    const tepa = db.tepa?.transactions || [];
    const kotta = db.kotta?.transactions || [];
    return [...tepa, ...kotta].filter(t => t.amal === 'chiqim' && isDateInFilter(t.sana));
  }, [db.tepa, db.kotta, dateRange, startDate, endDate]);

  // Filtered Kassa Harakatlari
  const filteredKassaHarakatlari = useMemo(() => {
    return kassaHarakatlari.filter(item => {
      const matchesDate = isDateInFilter(item.sana);
      if (!matchesDate) return false;

      // Smart Tag filter
      if (!matchesSmartTag(item, activeSmartTag)) return false;

      if (filterTur !== 'all' && item.tur !== filterTur) return false;
      if (filterKategoriya !== 'all' && item.kategoriya !== filterKategoriya) return false;
      if (filterKassaTuri !== 'all' && item.kassaTuri !== filterKassaTuri) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesQuery = 
          (item.kimgaKimdan && item.kimgaKimdan.toLowerCase().includes(q)) ||
          (item.izoh && item.izoh.toLowerCase().includes(q)) ||
          (item.xodim && item.xodim.toLowerCase().includes(q)) ||
          item.summa.toString().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [kassaHarakatlari, dateRange, startDate, endDate, activeSmartTag, filterTur, filterKategoriya, filterKassaTuri, searchQuery, valyutaKursi, yesterdayStr, weekAgoStr]);

  // P&L & SOF FOYDA HISOBLASH MANTIQI
  const pnlData = useMemo(() => {
    // 1. Yalpi Tushum (Gross Revenue) & Sotilgan juftlar
    let jamiSotuvSumma = 0;
    let jamiSotilganJuft = 0;
    let jamiTannarx = 0;

    const modelSalesMap: Record<string, { pairs: number; revenue: number; cost: number; profit: number }> = {};

    allSalesTxs.forEach(t => {
      const qty = Number(t.soni || 0);
      const rev = Number(t.summa || 0);
      const modelCostPerPair = db.prices?.[t.model]?.cost || 0;
      const totalCost = qty * modelCostPerPair;
      const profit = Number(t.foyda || (rev - totalCost));

      jamiSotuvSumma += rev;
      jamiSotilganJuft += qty;
      jamiTannarx += totalCost;

      if (!modelSalesMap[t.model]) {
        modelSalesMap[t.model] = { pairs: 0, revenue: 0, cost: 0, profit: 0 };
      }
      modelSalesMap[t.model].pairs += qty;
      modelSalesMap[t.model].revenue += rev;
      modelSalesMap[t.model].cost += totalCost;
      modelSalesMap[t.model].profit += profit;
    });

    // 2. Yalpi Foyda (Gross Profit)
    const yalpiFoyda = jamiSotuvSumma - jamiTannarx;
    const yalpiMarja = jamiSotuvSumma > 0 ? (yalpiFoyda / jamiSotuvSumma) * 100 : 0;

    // 3. Operatsion Xarajatlar (OpEx)
    let jamiXarajatlarUzs = 0;
    const xarajatByCat: Record<string, number> = {};

    filteredKassaHarakatlari.forEach(k => {
      if (k.tur === 'chiqim') {
        const sumUzs = k.summaUzs || (k.valyuta === 'USD' ? k.summa * (k.kurs || valyutaKursi) : k.summa);
        jamiXarajatlarUzs += sumUzs;
        xarajatByCat[k.kategoriya] = (xarajatByCat[k.kategoriya] || 0) + sumUzs;
      }
    });

    // 4. SOF FOYDA (Net Profit)
    const sofFoyda = yalpiFoyda - jamiXarajatlarUzs;
    const sofMarja = jamiSotuvSumma > 0 ? (sofFoyda / jamiSotuvSumma) * 100 : 0;

    // 5. Nasiya / Debitorlik qarzlar
    const jamiNasiyaQarzlari = (db.kontragentlar || []).reduce((acc, k) => acc + (k.balans && k.balans > 0 ? k.balans : 0), 0);

    // 6. Eng daromadli modellar ro'yxati
    const topProfitableModels = Object.entries(modelSalesMap).map(([model, data]) => ({
      model,
      pairs: data.pairs,
      revenue: data.revenue,
      cost: data.cost,
      profit: data.profit,
      margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0
    })).sort((a, b) => b.profit - a.profit);

    return {
      jamiSotuvSumma,
      jamiSotilganJuft,
      jamiTannarx,
      yalpiFoyda,
      yalpiMarja,
      jamiXarajatlarUzs,
      sofFoyda,
      sofMarja,
      jamiNasiyaQarzlari,
      xarajatByCat,
      topProfitableModels
    };
  }, [allSalesTxs, filteredKassaHarakatlari, db.prices, db.kontragentlar, valyutaKursi]);

  // Chart data: Kunlik/Oylik Dinamika (Tushum, Xarajat, Sof Foyda)
  const pnlChartData = useMemo(() => {
    const dateMap: Record<string, { sana: string; tushum: number; xarajat: number; foyda: number }> = {};

    allSalesTxs.forEach(t => {
      const d = t.sana;
      if (!dateMap[d]) dateMap[d] = { sana: d.slice(5), tushum: 0, xarajat: 0, foyda: 0 };
      dateMap[d].tushum += Number(t.summa || 0);
      dateMap[d].foyda += Number(t.foyda || 0);
    });

    filteredKassaHarakatlari.forEach(k => {
      if (k.tur === 'chiqim') {
        const d = k.sana;
        if (!dateMap[d]) dateMap[d] = { sana: d.slice(5), tushum: 0, xarajat: 0, foyda: 0 };
        const sumUzs = k.summaUzs || (k.valyuta === 'USD' ? k.summa * (k.kurs || valyutaKursi) : k.summa);
        dateMap[d].xarajat += sumUzs;
        dateMap[d].foyda -= sumUzs;
      }
    });

    return Object.entries(dateMap)
      .map(([fullDate, val]) => ({ fullDate, ...val }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
      .slice(-15);
  }, [allSalesTxs, filteredKassaHarakatlari, valyutaKursi]);

  // Pie chart data: Xarajatlar toifalari
  const expensePieData = useMemo(() => {
    return Object.entries(pnlData.xarajatByCat).map(([catId, amount]) => {
      const catObj = XARAJAT_KATEGORIYALARI.find(c => c.id === catId);
      return {
        name: catObj?.label || catId,
        value: amount
      };
    }).filter(d => d.value > 0);
  }, [pnlData.xarajatByCat]);

  // Bajariladigan Xarajat Kiritish (PIN tasdiqlangach yoki kichik xarajatlar uchun)
  const executeAddExpense = (data: {
    kategoriya: XarajatKategoriya;
    summa: number;
    valyuta: 'UZS' | 'USD';
    kassaTuri: KassaTuri;
    kimgaKimdan: string;
    izoh: string;
    sana: string;
  }) => {
    const sumUzs = data.valyuta === 'USD' ? data.summa * valyutaKursi : data.summa;

    const newHarakat: KassaHarakati = {
      id: `k-out-${generateId()}`,
      sana: data.sana || getTodayStr(),
      vaqt: getNowStr().slice(11, 16),
      tur: 'chiqim',
      kategoriya: data.kategoriya,
      summa: data.summa,
      valyuta: data.valyuta,
      kurs: valyutaKursi,
      summaUzs: sumUzs,
      kassaTuri: data.kassaTuri,
      kimgaKimdan: data.kimgaKimdan || "Noma'lum",
      izoh: data.izoh || '',
      xodim: currentUser?.ism || 'Admin'
    };

    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      if (!nextDb.kassaHarakatlari) nextDb.kassaHarakatlari = [];
      nextDb.kassaHarakatlari.unshift(newHarakat);

      // Kassa balansidan ayirish
      if (!nextDb.kassaBalansi) {
        nextDb.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      }
      nextDb.kassaBalansi[data.kassaTuri] = (Number(nextDb.kassaBalansi[data.kassaTuri]) || 0) - data.summa;

      return nextDb;
    });

    const isLarge = (data.valyuta === 'USD' && data.summa >= LARGE_EXPENSE_THRESHOLD_USD) || (data.valyuta === 'UZS' && data.summa >= LARGE_EXPENSE_THRESHOLD_UZS);
    logAudit(
      isLarge ? 'create_large_xarajat' : 'create_xarajat', 
      'Kassa', 
      `Xarajat kiritildi: ${data.summa.toLocaleString()} ${data.valyuta} (${data.kategoriya}) - ${data.kimgaKimdan}${isLarge ? ' [2-BOSQICHLI ADMIN PIN BILAN TASDIQLANDI]' : ''}`,
      isLarge ? 'warning' : 'info'
    );

    // Telegram Bildirishnomasi
    notifyKassaAlert(db, {
      tur: 'chiqim',
      summa: data.summa,
      valyuta: data.valyuta,
      kassaTuri: data.kassaTuri,
      kategoriya: data.kategoriya,
      kimgaKimdan: data.kimgaKimdan,
      xodim: currentUser?.ism || 'Admin',
      izoh: data.izoh
    }, setDb).catch(console.warn);

    toast.success("Xarajat muvaffaqiyatli saqlandi va kassa yangilandi!");
    setIsAddExpenseOpen(false);
  };

  // Yangi Xarajat (Chiqim) Kiritish
  const handleAddExpense = (data: {
    kategoriya: XarajatKategoriya;
    summa: number;
    valyuta: 'UZS' | 'USD';
    kassaTuri: KassaTuri;
    kimgaKimdan: string;
    izoh: string;
    sana: string;
  }) => {
    if (!data.summa || data.summa <= 0) {
      toast.error("Iltimos, xarajat summasini to'g'ri kiriting!");
      return;
    }

    const isLarge = (data.valyuta === 'USD' && data.summa >= LARGE_EXPENSE_THRESHOLD_USD) || (data.valyuta === 'UZS' && data.summa >= LARGE_EXPENSE_THRESHOLD_UZS);

    if (isLarge) {
      // 2-Bosqichli Admin PIN tasdiqlash
      setPinVerifyModal({
        isOpen: true,
        title: "Katta Xarajatni Tasdiqlash",
        description: "Anti-Fraud xavfsizlik qoidalariga ko'ra, 5,000,000 UZS yoki 500 $ dan yuqori bo'lgan chiqimlar Admin PIN-kodi orqali tasdiqlanishi shart.",
        actionDetails: {
          actionType: 'large_expense',
          amount: data.summa,
          currency: data.valyuta,
          recipient: data.kimgaKimdan,
          threshold: "5 000 000 UZS / 500 $"
        },
        onSuccess: () => {
          executeAddExpense(data);
        }
      });
      return;
    }

    executeAddExpense(data);
  };

  // Yangi Kassa Kirimi (Kapital / To'ldirish / Qo'shimcha daromad)
  const handleAddIncome = (data: {
    kategoriya: 'kapital' | 'savdo_tushumi' | 'qarz_tolovi' | 'boshqa_daromad';
    summa: number;
    valyuta: 'UZS' | 'USD';
    kassaTuri: KassaTuri;
    kimgaKimdan: string;
    izoh: string;
    sana: string;
  }) => {
    if (!data.summa || data.summa <= 0) {
      toast.error("Iltimos, kirim summasini to'g'ri kiriting!");
      return;
    }

    const sumUzs = data.valyuta === 'USD' ? data.summa * valyutaKursi : data.summa;

    const newHarakat: KassaHarakati = {
      id: `k-in-${generateId()}`,
      sana: data.sana || getTodayStr(),
      vaqt: getNowStr().slice(11, 16),
      tur: 'kirim',
      kategoriya: data.kategoriya,
      summa: data.summa,
      valyuta: data.valyuta,
      kurs: valyutaKursi,
      summaUzs: sumUzs,
      kassaTuri: data.kassaTuri,
      kimgaKimdan: data.kimgaKimdan || "Ta'sischi / Kassaga kirim",
      izoh: data.izoh || '',
      xodim: currentUser?.ism || 'Admin'
    };

    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      if (!nextDb.kassaHarakatlari) nextDb.kassaHarakatlari = [];
      nextDb.kassaHarakatlari.unshift(newHarakat);

      if (!nextDb.kassaBalansi) {
        nextDb.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      }
      nextDb.kassaBalansi[data.kassaTuri] = (Number(nextDb.kassaBalansi[data.kassaTuri]) || 0) + data.summa;

      return nextDb;
    });

    logAudit('create_kassa_kirim', 'Kassa', `Kassaga pul kirim qilindi: ${data.summa.toLocaleString()} ${data.valyuta} (${data.kategoriya}) - ${data.kimgaKimdan}`);
    
    // Telegram Bildirishnomasi
    notifyKassaAlert(db, {
      tur: 'kirim',
      summa: data.summa,
      valyuta: data.valyuta,
      kassaTuri: data.kassaTuri,
      kategoriya: data.kategoriya,
      kimgaKimdan: data.kimgaKimdan,
      xodim: currentUser?.ism || 'Admin',
      izoh: data.izoh
    }, setDb).catch(console.warn);

    toast.success("Kassaga mablag' qo'shildi!");
    setIsAddIncomeOpen(false);
  };

  // Harakatni tahrirlash (Admin)
  const executeUpdateHarakat = (updatedItem: KassaHarakati) => {
    const oldItem = (db.kassaHarakatlari || []).find(h => h.id === updatedItem.id);
    if (!oldItem) {
      toast.error("Tahrirlanuvchi amal topilmadi!");
      return;
    }

    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      if (!nextDb.kassaBalansi) {
        nextDb.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      }

      // 1. Revert old item from kassa balance
      if (oldItem.kassaTuri) {
        if (oldItem.tur === 'chiqim') {
          // Reverting expense adds back to balance
          nextDb.kassaBalansi[oldItem.kassaTuri] = (Number(nextDb.kassaBalansi[oldItem.kassaTuri]) || 0) + oldItem.summa;
        } else {
          // Reverting income removes from balance
          nextDb.kassaBalansi[oldItem.kassaTuri] = (Number(nextDb.kassaBalansi[oldItem.kassaTuri]) || 0) - oldItem.summa;
        }
      }

      // 2. Apply new updated item to kassa balance
      if (updatedItem.kassaTuri) {
        if (updatedItem.tur === 'chiqim') {
          // Applying new expense subtracts from balance
          nextDb.kassaBalansi[updatedItem.kassaTuri] = (Number(nextDb.kassaBalansi[updatedItem.kassaTuri]) || 0) - updatedItem.summa;
        } else {
          // Applying new income adds to balance
          nextDb.kassaBalansi[updatedItem.kassaTuri] = (Number(nextDb.kassaBalansi[updatedItem.kassaTuri]) || 0) + updatedItem.summa;
        }
      }

      // 3. Update in list
      nextDb.kassaHarakatlari = (nextDb.kassaHarakatlari || []).map(h => 
        h.id === updatedItem.id ? updatedItem : h
      );

      return nextDb;
    });

    logAudit(
      'update_kassa_harakat', 
      'Kassa', 
      `Kassa amali tahrirlandi (${updatedItem.id}): ${oldItem.summa.toLocaleString()} ${oldItem.valyuta} (${oldItem.kimgaKimdan}) -> ${updatedItem.summa.toLocaleString()} ${updatedItem.valyuta} (${updatedItem.kimgaKimdan})`,
      'warning'
    );
    toast.success("Kassa amali muvaffaqiyatli yangilandi va balans to'g'rilandi!");
    setEditingHarakat(null);
  };

  const handleUpdateHarakat = (updatedItem: KassaHarakati) => {
    if (!isAdmin) {
      toast.error("Faqat admin kassa amallarini tahrirlay oladi!");
      return;
    }

    const oldItem = (db.kassaHarakatlari || []).find(h => h.id === updatedItem.id);
    const diffSum = Math.abs(updatedItem.summa - (oldItem?.summa || 0));

    if (diffSum >= LARGE_EXPENSE_THRESHOLD_UZS || (updatedItem.valyuta === 'USD' && diffSum >= LARGE_EXPENSE_THRESHOLD_USD)) {
      setPinVerifyModal({
        isOpen: true,
        title: "Kassa Amalini Tahrirlashni Tasdiqlash",
        description: `Katta miqdordagi kassa amali tahrirlanmoqda. Eski: ${(oldItem?.summa || 0).toLocaleString()} ${oldItem?.valyuta} -> Yangi: ${updatedItem.summa.toLocaleString()} ${updatedItem.valyuta}`,
        actionDetails: {
          actionType: 'edit',
          amount: updatedItem.summa,
          currency: updatedItem.valyuta,
          recipient: updatedItem.kimgaKimdan
        },
        onSuccess: () => {
          executeUpdateHarakat(updatedItem);
        }
      });
      return;
    }

    executeUpdateHarakat(updatedItem);
  };

  // Harakatni bekor qilish / o'chirish (Admin)
  const executeDeleteHarakat = (item: KassaHarakati) => {
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.kassaHarakatlari = (nextDb.kassaHarakatlari || []).filter(h => h.id !== item.id);

      if (nextDb.kassaBalansi && item.kassaTuri) {
        if (item.tur === 'chiqim') {
          // Xarajat bekor qilinsa, kassaga qaytadi (+)
          nextDb.kassaBalansi[item.kassaTuri] = (Number(nextDb.kassaBalansi[item.kassaTuri]) || 0) + item.summa;
        } else {
          // Kirim bekor qilinsa, kassadan kamayadi (-)
          nextDb.kassaBalansi[item.kassaTuri] = (Number(nextDb.kassaBalansi[item.kassaTuri]) || 0) - item.summa;
        }
      }
      return nextDb;
    });

    logAudit(
      'delete_kassa_harakat', 
      'Kassa', 
      `Kassa amali o'chirildi (${item.id}): ${item.tur === 'chiqim' ? 'Chiqim' : 'Kirim'} ${item.summa.toLocaleString()} ${item.valyuta} (${item.kategoriya}) - ${item.kimgaKimdan}`,
      'high'
    );
    toast.success("Kassa amali o'chirildi va balans qayta tiklandi!");
    setDeletingHarakat(null);
  };

  const handleDeleteHarakat = (item: KassaHarakati) => {
    if (!isAdmin) {
      toast.error("Faqat admin kassa amallarini o'chira oladi!");
      return;
    }

    setPinVerifyModal({
      isOpen: true,
      title: "Kassa Amalini O'chirish & Bekor Qilish",
      description: `Anti-Fraud: "${item.kimgaKimdan}" nomidagi ${item.summa.toLocaleString()} ${item.valyuta} lik ${item.tur} operatsiyasini bekor qilish uchun Admin PIN talab etiladi.`,
      actionDetails: {
        actionType: 'delete',
        amount: item.summa,
        currency: item.valyuta,
        recipient: item.kimgaKimdan
      },
      onSuccess: () => {
        executeDeleteHarakat(item);
      }
    });
  };

  // Barcha kassa harakatlari va xarajatlarni tozalash (Admin)
  const executeClearAllHarakatlar = (resetBalances: boolean = false) => {
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.kassaHarakatlari = [];
      if (resetBalances) {
        nextDb.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      }
      return nextDb;
    });

    logAudit(
      'clear_all_kassa_harakat', 
      'Kassa', 
      `Barcha kassa harakatlari tozalab berildi${resetBalances ? ' (balanslar ham 0 ga tushirildi)' : ''}`,
      'high'
    );
    toast.success("Kassa harajatlari va amallari muvaffaqiyatli tozalandi!");
    setIsClearAllModalOpen(false);
  };

  const handleClearAllHarakatlar = (resetBalances: boolean = false) => {
    if (!isAdmin) {
      toast.error("Faqat admin kassa ma'lumotlarini tozalay oladi!");
      return;
    }

    setPinVerifyModal({
      isOpen: true,
      title: "Barcha Kassa Ma'lumotlarini Tozalash",
      description: "O'TA YUQORI XAVF: Barcha kassa harakatlari butunlay o'chiriladi. Ushbu amal faqat Bosh Admin PIN-kodi orqali tasdiqlanishi shart.",
      actionDetails: {
        actionType: 'clear_all'
      },
      onSuccess: () => {
        executeClearAllHarakatlar(resetBalances);
      }
    });
  };

  // Barcha kassa tranzaksiyalarini (kirim va chiqim) va joriy qoldiqni o'chirib, kassani 0 dan boshlash (Admin)
  const executeResetKassaToZero = async () => {
    try {
      await resetKassaToZero();
      logAudit(
        'reset_kassa_to_zero', 
        'Kassa', 
        `Kassa to'liq noldan boshlandi: Barcha kirim-chiqim tranzaksiyalari o'chirildi, barcha hamyonlar qoldig'i 0 ga tushirildi.`,
        'high'
      );
      toast.success("✅ Kassa muvaffaqiyatli noldan boshlandi! Barcha kirim/chiqim amallari va qoldiqlar 0 qilindi.", {
        duration: 5000
      });
      setIsResetKassaModalOpen(false);
      setIsClearAllModalOpen(false);
    } catch (err: any) {
      toast.error("Kassani noldan boshlashda xatolik: " + (err?.message || err));
    }
  };

  const handleResetKassaToZero = () => {
    if (!isAdmin) {
      toast.error("Faqat admin kassani noldan boshlay oladi!");
      return;
    }

    setPinVerifyModal({
      isOpen: true,
      title: "Kassani Noldan (0 dan) Boshlash",
      description: "O'TA MUHIM XAVFSIZLIK: Barcha kirim va chiqim operatsiyalari o'chiriladi hamda joriy qoldiqlar 0 ga tushiriladi. Amalni tasdiqlash uchun Admin PIN-kodini kiriting.",
      actionDetails: {
        actionType: 'clear_all'
      },
      onSuccess: () => {
        executeResetKassaToZero();
      }
    });
  };

  // Valyuta kursini saqlash
  const handleSaveKurs = () => {
    if (!newKurs || newKurs <= 0) {
      toast.error("Valyuta kursi noto'g'ri!");
      return;
    }
    setDb(prev => ({ ...prev, valyutaKursi: Number(newKurs) }));
    logAudit('update_exchange_rate', 'Kassa', `Valyuta kursi yangilandi: 1$ = ${newKurs} UZS`);
    toast.success(`Dollar kursi yangilandi: 1$ = ${newKurs.toLocaleString()} UZS`);
    setIsKursModalOpen(false);
  };

  // Kassa balansini to'g'rilash
  const executeSaveBalances = (newBal: typeof kassaBalansi) => {
    const oldBal = db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
    setDb(prev => ({ ...prev, kassaBalansi: newBal }));
    logAudit(
      'update_kassa_balances', 
      'Kassa', 
      `Kassa qoldiqlari qo'lda tahrirlandi: Naqd UZS: ${oldBal.naqd_uzs} -> ${newBal.naqd_uzs}, Naqd USD: ${oldBal.naqd_usd} -> ${newBal.naqd_usd}`,
      'warning'
    );
    toast.success("Kassa qoldiqlari muvaffaqiyatli saqlandi!");
    setIsEditBalanceOpen(false);
  };

  const handleSaveBalances = (newBal: typeof kassaBalansi) => {
    setPinVerifyModal({
      isOpen: true,
      title: "Kassa Balanslarini Qo'lda O'zgartirish",
      description: "Kassa qoldiqlarini to'g'rilash moliyaviy auditda qayd etiladi. Tasdiqlash uchun Admin PIN-kodini kiriting.",
      actionDetails: {
        actionType: 'balance_edit'
      },
      onSuccess: () => {
        executeSaveBalances(newBal);
      }
    });
  };

  // Professional Multi-Sheet Excel (1: Balans & P&L, 2: Kassa Jurnali, 3: Xarajatlar Tahlili)
  const handleExportExcel = () => {
    try {
      const dateLabel = 
        dateRange === 'bugun' ? 'Bugun' :
        dateRange === 'hafta' ? 'Oxirgi 7 kun' :
        dateRange === 'oy' ? 'Shu oy' :
        dateRange === 'yil' ? 'Shu yil' :
        dateRange === 'ixtiyoriy' ? `${startDate || '...'} — ${endDate || '...'}` : 'Barcha davr';

      exportKassaMultiSheetExcel({
        pnlData,
        kassaBalansi,
        kassaHarakatlari: filteredKassaHarakatlari,
        valyutaKursi,
        dateRangeLabel: dateLabel,
        startDate,
        endDate,
      });
      toast.success("Professional 3-varaqli Excel hisoboti yuklab olindi!");
    } catch (e: any) {
      toast.error("Excel eksport qilishda xatolik: " + (e?.message || e));
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 md:p-6 shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-500 flex items-center justify-center font-black shadow-inner shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-[var(--text)] tracking-tight">
                Kassa & Sof Foyda Boshqaruvi
              </h1>
              <span className="text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                Moliya & P&L
              </span>
            </div>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Kassa oqimi, kundalik xarajatlar, tannarx va to'liq sof foyda hisoboti
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-auto">
          {/* Smena / Z-Hisobot tugmasi */}
          <button
            onClick={() => setIsSmenaModalOpen(true)}
            className={cn(
              "px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer border",
              db.joriySmena 
                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20" 
                : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/40"
            )}
            title="Kassir smenasi va Z-Hisobot"
          >
            <Clock className={cn("w-4 h-4", db.joriySmena ? "text-purple-600 animate-spin-slow" : "text-[var(--text3)]")} />
            <span>
              {db.joriySmena ? (
                <>Smena Ochiq <strong className="font-mono">#Z-{db.joriySmena.zReportNumber}</strong></>
              ) : (
                <>Smena Ochish</>
              )}
            </span>
          </button>

          {/* Multi-Hisoblararo Transfer */}
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-purple-600/20 flex items-center gap-2 cursor-pointer"
            title="Kassalararo transfer va valyuta konvertatsiyasi"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Transfer / Konvertatsiya</span>
          </button>

          {/* Valyuta kursi tugmasi */}
          <button
            onClick={() => setIsKursModalOpen(true)}
            className="px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] hover:border-blue-500/40 rounded-xl text-xs font-bold text-[var(--text)] transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            title="Valyuta kursini o'zgartirish"
          >
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span>1$ = <strong className="text-blue-500">{valyutaKursi.toLocaleString()}</strong> UZS</span>
            <Edit3 className="w-3 h-3 text-[var(--text3)]" />
          </button>

          {/* Yangi Xarajat Chiqimi */}
          <button
            onClick={() => setIsAddExpenseOpen(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer"
          >
            <Minus className="w-4 h-4" />
            <span>Xarajat Kiritish</span>
          </button>

          {/* Kassaga Kirim */}
          <button
            onClick={() => setIsAddIncomeOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Kassaga Kirim</span>
          </button>

          {/* Kassani 0 dan Boshlash (Admin) */}
          {isAdmin && (
            <button
              onClick={() => setIsResetKassaModalOpen(true)}
              className="px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white dark:text-rose-400 dark:hover:text-white border border-rose-500/30 rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              title="Kassadagi barcha kirim/chiqimlarni va qoldiqni o'chirib noldan boshlash"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Kassani 0 dan Boshlash</span>
            </button>
          )}

          {/* Excel Eksport */}
          <button
            onClick={handleExportExcel}
            className="p-2.5 bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--bg3)] text-[var(--text2)] hover:text-[var(--text)] rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Excel formatida hisobot yuklash"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TOP INTERACTIVE APPLE CARD / REVOLUT WALLETS & BALANCES */}
      <AppleCardWallets
        balansi={kassaBalansi}
        valyutaKursi={valyutaKursi}
        harakatlar={kassaHarakatlari}
        isAdmin={isAdmin}
        onOpenIncome={(kassa) => {
          setPresetKassaTuri(kassa);
          setIsAddIncomeOpen(true);
        }}
        onOpenExpense={(kassa) => {
          setPresetKassaTuri(kassa);
          setIsAddExpenseOpen(true);
        }}
        onOpenTransfer={(kassa) => {
          setPresetKassaTuri(kassa);
          setIsTransferModalOpen(true);
        }}
        onEditBalance={() => setIsEditBalanceOpen(true)}
      />

      {/* SUB-TABS & DATE FILTERS BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-2.5 shadow-sm">
        
        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 max-w-full">
          <button
            onClick={() => setActiveTab('foyda')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'foyda'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Sof Foyda & P&L</span>
          </button>

          <button
            onClick={() => setActiveTab('unit_economics')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'unit_economics'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span>Unit Economics (Juft Bo'yicha)</span>
          </button>

          <button
            onClick={() => setActiveTab('net_worth')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'net_worth'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Sof Kapital & Qarzlar</span>
          </button>

          <button
            onClick={() => setActiveTab('budjet')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'budjet'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <Target className="w-4 h-4" />
            <span>Budjet Limitlari</span>
          </button>

          <button
            onClick={() => setActiveTab('xarajatlar')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'xarajatlar'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <Receipt className="w-4 h-4" />
            <span>Kassa Jurnali ({filteredKassaHarakatlari.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('kategoriyalar')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'kategoriyalar'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <PieChartIcon className="w-4 h-4" />
            <span>Xarajat Strukturasi</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'audit'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text2)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            )}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Audit & Anti-Fraud</span>
          </button>
        </div>

        {/* Date Filter Buttons */}
        <div className="flex items-center gap-1.5 self-end md:self-auto overflow-x-auto p-1">
          {[
            { id: 'bugun', label: 'Bugun' },
            { id: 'hafta', label: 'Hafta' },
            { id: 'oy', label: 'Shu oy' },
            { id: 'yil', label: 'Shu yil' },
            { id: 'barchasi', label: 'Barchasi' },
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setDateRange(btn.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap",
                dateRange === btn.id
                  ? "bg-[var(--bg)] text-blue-500 border border-blue-500/30 shadow-sm"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SOF FOYDA & P&L FINANCIAL REPORT */}
      {activeTab === 'foyda' && (
        <div className="space-y-6">
          
          {/* P&L 5 METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* 1. Yalpi Tushum */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] uppercase">
                  <span>1. Yalpi Tushum</span>
                  <ArrowUpRight className="w-4 h-4 text-blue-500" />
                </div>
                <h4 className="text-lg font-black text-blue-500 mt-1">
                  {pnlData.jamiSotuvSumma.toLocaleString()} <span className="text-xs text-[var(--text3)]">UZS</span>
                </h4>
              </div>
              <p className="text-[11px] text-[var(--text3)] mt-2 pt-2 border-t border-[var(--border)]">
                Jami: <strong>{pnlData.jamiSotilganJuft.toLocaleString()}</strong> juft sotildi
              </p>
            </div>

            {/* 2. Mahsulot Tannarxi (COGS) */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] uppercase">
                  <span>2. Tannarx (COGS)</span>
                  <Tag className="w-4 h-4 text-amber-500" />
                </div>
                <h4 className="text-lg font-black text-amber-500 mt-1">
                  {pnlData.jamiTannarx.toLocaleString()} <span className="text-xs text-[var(--text3)]">UZS</span>
                </h4>
              </div>
              <p className="text-[11px] text-[var(--text3)] mt-2 pt-2 border-t border-[var(--border)]">
                Tovarlarni ishlab chiqarish xarajati
              </p>
            </div>

            {/* 3. Yalpi Foyda (Gross Profit) */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] uppercase">
                  <span>3. Yalpi Foyda</span>
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                </div>
                <h4 className="text-lg font-black text-indigo-500 mt-1">
                  {pnlData.yalpiFoyda.toLocaleString()} <span className="text-xs text-[var(--text3)]">UZS</span>
                </h4>
              </div>
              <p className="text-[11px] text-[var(--text3)] mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span>Yalpi Marja:</span>
                <strong className="text-indigo-500">{pnlData.yalpiMarja.toFixed(1)}%</strong>
              </p>
            </div>

            {/* 4. Operatsion Xarajatlar (OpEx) */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] uppercase">
                  <span>4. Xarajatlar (OpEx)</span>
                  <ArrowDownRight className="w-4 h-4 text-rose-500" />
                </div>
                <h4 className="text-lg font-black text-rose-500 mt-1">
                  {pnlData.jamiXarajatlarUzs.toLocaleString()} <span className="text-xs text-[var(--text3)]">UZS</span>
                </h4>
              </div>
              <p className="text-[11px] text-[var(--text3)] mt-2 pt-2 border-t border-[var(--border)]">
                Ish haqi, ijara, transport va boshqalar
              </p>
            </div>

            {/* 5. SOF FOYDA (Net Profit) */}
            <div className={cn(
              "rounded-2xl p-4.5 shadow-sm flex flex-col justify-between border",
              pnlData.sofFoyda >= 0
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : "bg-rose-500/10 border-rose-500/30 text-rose-500"
            )}>
              <div>
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                  <span>5. SOF FOYDA</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="text-xl font-black mt-1">
                  {pnlData.sofFoyda.toLocaleString()} <span className="text-xs font-bold">UZS</span>
                </h4>
              </div>
              <p className="text-[11px] mt-2 pt-2 border-t border-current/20 flex items-center justify-between font-bold">
                <span>Sof Rentabellik:</span>
                <span>{pnlData.sofMarja.toFixed(1)}%</span>
              </p>
            </div>

          </div>

          {/* XALQARO BUXGALTERIYA STANDARTI BO'YICHA P&L TOZA JADVALI */}
          <PnLAccountingStatement
            pnlData={pnlData}
            kassaBalansi={kassaBalansi}
            kassaHarakatlari={filteredKassaHarakatlari}
            valyutaKursi={valyutaKursi}
            dateRange={dateRange}
            startDate={startDate}
            endDate={endDate}
          />

          {/* PUL OQIMI ZANJIRI: SANKEY & WATERFALL CHART */}
          <LazyViewport fallbackHeight="420px" placeholderLabel="Pul oqimi vizualizatsiyasi yuklanmoqda...">
            <Suspense fallback={
              <div className="w-full h-[420px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
              </div>
            }>
              <LazyCashFlowSankeyWaterfall
                pnlData={pnlData}
                kassaBalansi={kassaBalansi}
                valyutaKursi={valyutaKursi}
              />
            </Suspense>
          </LazyViewport>

          {/* P&L CHARTS & EXPLANATION ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart: Trend Dinamikasi */}
            <div className="lg:col-span-2 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Moliyaviy Oqim Dinamikasi</h3>
                  <p className="text-xs text-[var(--text3)]">Tushum, Operatsion xarajat va Sof foyda nisbati</p>
                </div>
                <span className="text-xs font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                  Kunlik / Oylik
                </span>
              </div>

              <LazyViewport fallbackHeight="280px" placeholderLabel="Trend dinamikasi yuklanmoqda...">
                <Suspense fallback={
                  <div className="w-full h-[280px] rounded-xl bg-[var(--bg2)]/60 animate-pulse flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-[var(--text3)] animate-pulse" />
                  </div>
                }>
                  <LazyKassaPnlTrendChart pnlChartData={pnlChartData} />
                </Suspense>
              </LazyViewport>
            </div>

            {/* P&L Formula & Accounting Breakdown Box */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-black text-[var(--text)]">Buxgalteriya Formulalari</h3>
                </div>
                
                <div className="space-y-3 text-xs text-[var(--text2)]">
                  <div className="p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                    <div className="font-bold text-[var(--text)]">1. Yalpi Foyda (Gross Profit):</div>
                    <div className="text-[11px] text-[var(--text3)] mt-0.5 font-mono">
                      Tushum ({formatCompact(pnlData.jamiSotuvSumma)}) - Tannarx ({formatCompact(pnlData.jamiTannarx)}) = <strong className="text-indigo-500">{formatCompact(pnlData.yalpiFoyda)} UZS</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                    <div className="font-bold text-[var(--text)]">2. Sof Foyda (Net Income):</div>
                    <div className="text-[11px] text-[var(--text3)] mt-0.5 font-mono">
                      Yalpi Foyda ({formatCompact(pnlData.yalpiFoyda)}) - Xarajatlar ({formatCompact(pnlData.jamiXarajatlarUzs)}) = <strong className={pnlData.sofFoyda >= 0 ? "text-emerald-500" : "text-rose-500"}>{formatCompact(pnlData.sofFoyda)} UZS</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Kutilayotgan Nasiya Qarzlar:</span>
                    </div>
                    <div className="text-[11px] mt-0.5 font-bold">
                      Mijozlar balansi: {pnlData.jamiNasiyaQarzlari.toLocaleString()} UZS
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text3)]">
                Barcha hisob-kitoblar ombordagi real savdo va kassa chiqimlari asosida avtomatik hisoblanadi.
              </div>
            </div>

          </div>

          {/* TOP PROFITABLE MODELS TABLE */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Eng Ko'p Sof Foyda Keltirgan Modellar</h3>
                <p className="text-xs text-[var(--text3)]">Mahsulotlar bo'yicha savdo marjasi va rentabellik reytingi</p>
              </div>
              <span className="text-xs font-bold text-[var(--text3)]">
                Jami {pnlData.topProfitableModels.length} ta model
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Model Nomi</th>
                    <th className="py-2.5 px-3 text-right">Sotilgan (juft)</th>
                    <th className="py-2.5 px-3 text-right">Jami Tushum</th>
                    <th className="py-2.5 px-3 text-right">Tannarxi (COGS)</th>
                    <th className="py-2.5 px-3 text-right">Sof Foyda</th>
                    <th className="py-2.5 px-3 text-right">Rentabellik (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {pnlData.topProfitableModels.slice(0, 8).map((item, idx) => (
                    <tr key={item.model} className="hover:bg-[var(--bg)] transition-colors">
                      <td className="py-3 px-3 font-bold text-[var(--text3)]">{idx + 1}</td>
                      <td className="py-3 px-3 font-extrabold text-[var(--text)]">{item.model}</td>
                      <td className="py-3 px-3 text-right font-bold text-blue-500">{item.pairs.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text)]">{item.revenue.toLocaleString()} UZS</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text3)]">{item.cost.toLocaleString()} UZS</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-500">
                        +{item.profit.toLocaleString()} UZS
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px]">
                          {item.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pnlData.topProfitableModels.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[var(--text3)]">
                        Bu davr uchun savdolar topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: KASSA HARAKATLARI & XARAJATLAR JURNALI */}
      {activeTab === 'xarajatlar' && (
        <div className="space-y-4">
          
          {/* SEARCH & FILTERS BAR */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                placeholder="Qidirish (kimga, izoh, xodim)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] placeholder:text-[var(--text3)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
              
              {/* Kirim / Chiqim filter */}
              <select
                value={filterTur}
                onChange={(e) => setFilterTur(e.target.value)}
                className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Barcha Turlar</option>
                <option value="chiqim">Faqat Chiqim (Xarajat)</option>
                <option value="kirim">Faqat Kirim</option>
              </select>

              {/* Kategoriya filter */}
              <select
                value={filterKategoriya}
                onChange={(e) => setFilterKategoriya(e.target.value)}
                className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Barcha Toifalar</option>
                {XARAJAT_KATEGORIYALARI.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>

              {/* Kassa turi filter */}
              <select
                value={filterKassaTuri}
                onChange={(e) => setFilterKassaTuri(e.target.value)}
                className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Barcha Kassalar</option>
                {KASSA_TURLARI.map(kt => (
                  <option key={kt.id} value={kt.id}>{kt.label}</option>
                ))}
              </select>

              {/* Admin Clear / Reset Button */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsResetKassaModalOpen(true)}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  title="Barcha kassa harakatlari va qoldiqlarini o'chirib 0 dan boshlash"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Kassani 0 dan Boshlash</span>
                </button>
              )}

            </div>
          </div>

          {/* SMART TAG FILTER CHIPS */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
              <span className="text-[11px] font-extrabold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                Smart Filtrlar & Teglar:
              </span>
              {activeSmartTag !== 'all' && (
                <button
                  onClick={() => setActiveSmartTag('all')}
                  className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                >
                  Filtrni tozalash
                </button>
              )}
            </div>
            <SmartFilterChips
              activeTag={activeSmartTag}
              onSelectTag={setActiveSmartTag}
              counts={smartTagCounts}
            />
          </div>

          {/* TABLE OF TRANSACTIONS */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <TableVirtuoso
              style={{ height: '600px' }}
              data={filteredKassaHarakatlari}
              fixedHeaderContent={() => (
                <tr className="border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase text-[10px] tracking-wider bg-[var(--bg)]">
                    <th className="py-3 px-4">Sana & Vaqt</th>
                    <th className="py-3 px-4">Turi</th>
                    <th className="py-3 px-4">Toifa</th>
                    <th className="py-3 px-4 text-right">Summa</th>
                    <th className="py-3 px-4">Kassa Hamyoni</th>
                    <th className="py-3 px-4">Kimga / Kimdan</th>
                    <th className="py-3 px-4">Mas'ul Xodim</th>
                    <th className="py-3 px-4">Izoh</th>
                    <th className="py-3 px-4 text-right">Kvitansiya & Amal</th>
                </tr>
              )}
              itemContent={(index, item) => {
                const meta = getTransactionCategoryMeta(item.kategoriya, item.tur, item.izoh);
                const kassaObj = KASSA_TURLARI.find(k => k.id === item.kassaTuri);
                const isExpense = item.tur === 'chiqim';
                const isTransfer = (item.izoh && (item.izoh.toLowerCase().includes('o\'tkazma') || item.izoh.toLowerCase().includes('transfer') || item.izoh.toLowerCase().includes('perevod'))) || (item.kategoriya === 'kapital' && item.izoh?.toLowerCase().includes('kassa'));
                const CatIcon = meta.icon || Layers;
                const KassaIcon = kassaObj?.icon || Wallet;

                return (
                  <>
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-[var(--text3)]">
                          <span className="font-extrabold text-[var(--text)] block">{item.sana}</span>
                          <span className="text-[10px] opacity-75">{item.vaqt || '00:00'}</span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isTransfer ? (
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                                <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />
                              </div>
                              <div>
                                <span className="font-black text-xs text-violet-700 dark:text-violet-300 block">
                                  O'TKAZMA
                                </span>
                                <span className="text-[10px] text-[var(--text3)]">Kassalararo</span>
                              </div>
                            </div>
                          ) : isExpense ? (
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                              </div>
                              <div>
                                <span className="font-black text-xs text-rose-600 dark:text-rose-400 block">
                                  CHIQIM
                                </span>
                                <span className="text-[10px] text-[var(--text3)]">Xarajat</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-2xs">
                                <ArrowDown className="w-4 h-4 stroke-[2.5]" />
                              </div>
                              <div>
                                <span className="font-black text-xs text-emerald-600 dark:text-emerald-400 block">
                                  KIRIM
                                </span>
                                <span className="text-[10px] text-[var(--text3)]">Kassaga tushum</span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs whitespace-nowrap",
                            meta.bg,
                            meta.color,
                            meta.border
                          )}>
                            <CatIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{meta.label}</span>
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className={cn(
                            "font-mono font-black text-sm block",
                            isTransfer 
                              ? "text-violet-600 dark:text-violet-400"
                              : isExpense 
                                ? "text-rose-600 dark:text-rose-400" 
                                : "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {isTransfer ? '⇄ ' : isExpense ? '- ' : '+ '}
                            {item.summa.toLocaleString()} {item.valyuta}
                          </span>
                          {item.valyuta === 'USD' && (
                            <div className="text-[10px] text-[var(--text3)] font-mono font-semibold">
                              ≈ {(item.summa * (item.kurs || valyutaKursi)).toLocaleString()} UZS
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[11px] text-[var(--text2)] font-bold">
                            <KassaIcon className="w-3.5 h-3.5 text-[var(--text3)]" />
                            <span>{kassaObj?.label || item.kassaTuri}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap font-bold text-[var(--text)]">
                          {item.kimgaKimdan || '-'}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-xs text-[var(--text3)] font-medium">
                          {item.xodim || '-'}
                        </td>

                        <td className="py-3.5 px-4 text-[11px] text-[var(--text3)] max-w-xs truncate" title={item.izoh}>
                          {item.izoh || '-'}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedReceiptHarakat(item)}
                              className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
                              title="Kvitansiya / Chek (Chop etish yoki Telegram Slip)"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => setEditingHarakat(item)}
                                  className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors cursor-pointer"
                                  title="Tahrirlash"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeletingHarakat(item)}
                                  className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                                  title="O'chirish (Kassadan bekor qilish)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                  </>
                )
              }}
            />
          </div>

        </div>
      )}

      {/* TAB 3: XARAJAT TOIFALARI STRUKTURASI */}
      {activeTab === 'kategoriyalar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Donut Chart */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-black text-[var(--text)] mb-1">Xarajatlar Taqsimoti</h3>
            <p className="text-xs text-[var(--text3)] mb-4">Toifalar bo'yicha sarflangan mablag' ulushi</p>

            <LazyViewport fallbackHeight="280px" placeholderLabel="Xarajatlar taqsimoti yuklanmoqda...">
                <Suspense fallback={
                  <div className="w-full h-[280px] rounded-xl bg-[var(--bg2)]/60 animate-pulse flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-[var(--text3)] animate-pulse" />
                  </div>
                }>
                  <LazyKassaExpensePieChart expensePieData={expensePieData} />
                </Suspense>
              </LazyViewport>
          </div>

          {/* Breakdown List */}
          <div className="lg:col-span-2 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-base font-black text-[var(--text)] mb-3">Xarajat Toifalari Bo'yicha Tafsilot</h3>

            <div className="space-y-2.5">
              {XARAJAT_KATEGORIYALARI.map((cat, idx) => {
                const amount = pnlData.xarajatByCat[cat.id] || 0;
                const percentage = pnlData.jamiXarajatlarUzs > 0 ? (amount / pnlData.jamiXarajatlarUzs) * 100 : 0;
                const Icon = cat.icon;

                return (
                  <div key={cat.id} className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold", cat.bg, cat.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-[var(--text)]">{cat.label}</h4>
                        <div className="w-36 bg-[var(--border)] h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] 
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black font-mono text-[var(--text)]">
                        {amount.toLocaleString()} <span className="text-[10px] text-[var(--text3)]">UZS</span>
                      </div>
                      <div className="text-[11px] font-bold text-blue-500">
                        {percentage.toFixed(1)}% ulush
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: UNIT ECONOMICS (POYABZAL JUFTI BO'YICHA SOF FOYDA) */}
      {activeTab === 'unit_economics' && (
        <UnitEconomicsView
          dateRange={dateRange}
          startDate={startDate}
          endDate={endDate}
          isDateInFilter={isDateInFilter}
        />
      )}

      {/* TAB 4: SOF KAPITAL & QARZLAR BALANSI (NET WORTH) */}
      {activeTab === 'net_worth' && (
        <NetLiquidityView />
      )}

      {/* TAB 5: REJALI XARAJATLAR & BUDJET LIMITLARI */}
      {activeTab === 'budjet' && (
        <BudgetLimitsView />
      )}

      {/* TAB 6: AUDIT & ANTI-FRAUD LOGS */}
      {activeTab === 'audit' && (
        <KassaAuditLogView valyutaKursi={valyutaKursi} />
      )}

      {/* MODAL: MULTI-HISOBLARARO TRANSFER */}
      <KassaTransferModal
        isOpen={isTransferModalOpen}
        initialFromKassa={presetKassaTuri}
        onClose={() => {
          setIsTransferModalOpen(false);
          setPresetKassaTuri(undefined);
        }}
      />

      {/* MODAL: KASSIR SMENASI & Z-HISOBOT */}
      <KassirSmenaModal
        isOpen={isSmenaModalOpen}
        onClose={() => setIsSmenaModalOpen(false)}
        onOpenZReport={(smena) => setSelectedZReportSmena(smena)}
      />

      {/* MODAL: Z-HISOBOT SLIP / KVITANSIYA KO'RISH VA CHOP ETISH */}
      <ZReportModal
        isOpen={Boolean(selectedZReportSmena)}
        smena={selectedZReportSmena}
        onClose={() => setSelectedZReportSmena(null)}
      />
      {isAddExpenseOpen && (
        <AddExpenseModal
          valyutaKursi={valyutaKursi}
          initialKassaTuri={presetKassaTuri}
          onClose={() => {
            setIsAddExpenseOpen(false);
            setPresetKassaTuri(undefined);
          }}
          onSave={handleAddExpense}
        />
      )}

      {/* MODAL 2: KASSAGA PUL KIRIM QILISH */}
      {isAddIncomeOpen && (
        <AddIncomeModal
          valyutaKursi={valyutaKursi}
          initialKassaTuri={presetKassaTuri}
          onClose={() => {
            setIsAddIncomeOpen(false);
            setPresetKassaTuri(undefined);
          }}
          onSave={handleAddIncome}
        />
      )}

      {/* MODAL 3: VALYUTA KURSI & AVTOMATIZATSIYA */}
      <CurrencyModal
        isOpen={isKursModalOpen}
        onClose={() => setIsKursModalOpen(false)}
      />

      {/* MODAL 4: KASSA BALANSLARINI TAHRIRLASH */}
      {isEditBalanceOpen && (
        <EditBalanceModal
          currentBalansi={kassaBalansi}
          onClose={() => setIsEditBalanceOpen(false)}
          onSave={handleSaveBalances}
        />
      )}

      {/* MODAL 5: KASSA HARAKATINI TAHRIRLASH */}
      {editingHarakat && (
        <EditHarakatModal
          item={editingHarakat}
          valyutaKursi={valyutaKursi}
          onClose={() => setEditingHarakat(null)}
          onSave={handleUpdateHarakat}
        />
      )}

      {/* MODAL 6: KASSA HARAKATINI O'CHIRISHNI TASDIQLASH */}
      {deletingHarakat && (
        <DeleteHarakatConfirmModal
          item={deletingHarakat}
          valyutaKursi={valyutaKursi}
          onClose={() => setDeletingHarakat(null)}
          onConfirm={() => handleDeleteHarakat(deletingHarakat)}
        />
      )}

      {/* MODAL 7: BARCHA KASSA HARAKATLARINI TOZALASHNI TASDIQLASH */}
      {isClearAllModalOpen && (
        <ClearAllTransactionsModal
          totalCount={kassaHarakatlari.length}
          onClose={() => setIsClearAllModalOpen(false)}
          onConfirm={handleClearAllHarakatlar}
        />
      )}

      {/* MODAL 7.5: KASSANI NOLDAN (0 DAN) BOSHLASH VA TRANZAKSIYALARNI O'CHIRISH */}
      {isResetKassaModalOpen && (
        <ResetKassaToZeroModal
          totalCount={kassaHarakatlari.length}
          totalAssetsUzs={totalAssetsUzs}
          onClose={() => setIsResetKassaModalOpen(false)}
          onConfirm={handleResetKassaToZero}
        />
      )}

      {/* MODAL 8: KVITANSIYA / CHEK GENERATOR (CHOP ETISH & TELEGRAM SLIP) */}
      <KassaReceiptModal
        isOpen={Boolean(selectedReceiptHarakat)}
        harakat={selectedReceiptHarakat}
        valyutaKursi={valyutaKursi}
        onClose={() => setSelectedReceiptHarakat(null)}
      />

      {/* MODAL 9: 2-BOSQICHLI ADMIN PIN TASDIQLASH (ANTI-FRAUD) */}
      <AdminPinVerifyModal
        isOpen={pinVerifyModal.isOpen}
        title={pinVerifyModal.title}
        description={pinVerifyModal.description}
        actionDetails={pinVerifyModal.actionDetails}
        onSuccess={pinVerifyModal.onSuccess}
        onClose={() => setPinVerifyModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* TEZKOR HARAKATLAR DOCK-PANELI (FLOATING QUICK ACTION BAR) */}
      <FloatingQuickDock
        valyutaKursi={valyutaKursi}
        hasActiveSmena={Boolean((db.smenalar || []).some(s => s.status === 'ochiq') || db.joriySmena?.status === 'ochiq')}
        onOpenIncome={() => {
          setPresetKassaTuri(undefined);
          setIsAddIncomeOpen(true);
        }}
        onOpenExpense={() => {
          setPresetKassaTuri(undefined);
          setIsAddExpenseOpen(true);
        }}
        onOpenTransfer={() => {
          setPresetKassaTuri(undefined);
          setIsTransferModalOpen(true);
        }}
        onOpenCurrency={() => setIsKursModalOpen(true)}
        onOpenSmena={() => setIsSmenaModalOpen(true)}
        onExportExcel={handleExportExcel}
      />

    </div>
  );
}

// SUB-MODAL: XARAJAT QO'SHISH
function AddExpenseModal({ 
  valyutaKursi,
  initialKassaTuri,
  onClose, 
  onSave 
}: { 
  valyutaKursi: number;
  initialKassaTuri?: KassaTuri;
  onClose: () => void; 
  onSave: (data: any) => void;
}) {
  const [kategoriya, setKategoriya] = useState<XarajatKategoriya>('ish_haqi');
  const [summa, setSumma] = useState<number | ''>('');
  const [valyuta, setValyuta] = useState<'UZS' | 'USD'>(initialKassaTuri === 'naqd_usd' ? 'USD' : 'UZS');
  const [kassaTuri, setKassaTuri] = useState<KassaTuri>(initialKassaTuri || 'naqd_uzs');
  const [kimgaKimdan, setKimgaKimdan] = useState('');
  const [izoh, setIzoh] = useState('');
  const [sana, setSana] = useState(getTodayStr());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summa || Number(summa) <= 0) {
      toast.error("Xarajat summasini kiriting!");
      return;
    }
    onSave({
      kategoriya,
      summa: Number(summa),
      valyuta,
      kassaTuri,
      kimgaKimdan,
      izoh,
      sana
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
              <Minus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Yangi Xarajat Kiritish</h3>
              <p className="text-[11px] text-[var(--text3)]">Kassadan chiqim qilingan summani qayd etish</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 overflow-y-auto space-y-4 max-h-[calc(90vh-140px)]">
            
            {/* Kategoriya */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Xarajat Toifasi</label>
              <select
                value={kategoriya}
                onChange={(e) => setKategoriya(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-rose-500 focus:outline-none"
              >
                {XARAJAT_KATEGORIYALARI.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Summa & Valyuta */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Xarajat Summasi</label>
                <input
                  type="number"
                  value={summa}
                  onChange={(e) => setSumma(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  required
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-mono font-black text-[var(--text)] focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Valyuta</label>
                <select
                  value={valyuta}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setValyuta(v);
                    if (v === 'USD') setKassaTuri('naqd_usd');
                    else if (kassaTuri === 'naqd_usd') setKassaTuri('naqd_uzs');
                  }}
                  className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-rose-500 focus:outline-none"
                >
                  <option value="UZS">UZS (So'm)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            {/* Kassa Hamyoni */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qaysi Kassadan Chiqish</label>
              <select
                value={kassaTuri}
                onChange={(e) => setKassaTuri(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-rose-500 focus:outline-none"
              >
                {KASSA_TURLARI.map(kt => (
                  <option key={kt.id} value={kt.id}>{kt.label}</option>
                ))}
              </select>
            </div>

            {/* Kimga to'landi */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kimga To'landi / Qabul Qiluvchi</label>
              <input
                type="text"
                value={kimgaKimdan}
                onChange={(e) => setKimgaKimdan(e.target.value)}
                placeholder="Masalan: Haydovchi Akrom, Ombor ijarasi, Xodim maoshi..."
                required
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-rose-500 focus:outline-none"
              />
            </div>

            {/* Sana */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Xarajat Sanasi</label>
              <input
                type="date"
                value={sana}
                onChange={(e) => setSana(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-rose-500 focus:outline-none"
              />
            </div>

            {/* Izoh */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Izoh / Chek ma'lumoti</label>
              <textarea
                value={izoh}
                onChange={(e) => setIzoh(e.target.value)}
                placeholder="Qo'shimcha izoh yoki chek raqami..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-rose-500 focus:outline-none resize-none"
              />
            </div>

          </div>

          {/* Fixed Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg2)] flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white rounded-xl shadow-md shadow-rose-600/20 cursor-pointer"
            >
              Chiqim Qilish
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

// SUB-MODAL: KASSAGA KIRIM QILISH
function AddIncomeModal({
  valyutaKursi,
  initialKassaTuri,
  onClose,
  onSave
}: {
  valyutaKursi: number;
  initialKassaTuri?: KassaTuri;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [kategoriya, setKategoriya] = useState<'kapital' | 'savdo_tushumi' | 'qarz_tolovi' | 'boshqa_daromad'>('kapital');
  const [summa, setSumma] = useState<number | ''>('');
  const [valyuta, setValyuta] = useState<'UZS' | 'USD'>(initialKassaTuri === 'naqd_usd' ? 'USD' : 'UZS');
  const [kassaTuri, setKassaTuri] = useState<KassaTuri>(initialKassaTuri || 'naqd_uzs');
  const [kimgaKimdan, setKimgaKimdan] = useState('');
  const [izoh, setIzoh] = useState('');
  const [sana, setSana] = useState(getTodayStr());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summa || Number(summa) <= 0) {
      toast.error("Kirim summasini kiriting!");
      return;
    }
    onSave({
      kategoriya,
      summa: Number(summa),
      valyuta,
      kassaTuri,
      kimgaKimdan,
      izoh,
      sana
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Kassaga Mablag' Kirim Qilish</h3>
              <p className="text-[11px] text-[var(--text3)]">Kassa to'ldirish yoki ta'sischidan kapital kiritish</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 overflow-y-auto space-y-4 max-h-[calc(90vh-140px)]">
            
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kirim Turi / Maqsadi</label>
              <select
                value={kategoriya}
                onChange={(e) => setKategoriya(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-emerald-500 focus:outline-none"
              >
                <option value="kapital">Ta'sischi Kapitali / Kassa To'ldirish</option>
                <option value="savdo_tushumi">To'g'ridan-to'g'ri Savdo Tushumi</option>
                <option value="qarz_tolovi">Mijoz Qarz To'lovi</option>
                <option value="boshqa_daromad">Boshqa Qo'shimcha Daromad</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kirim Summasi</label>
                <input
                  type="number"
                  value={summa}
                  onChange={(e) => setSumma(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  required
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-mono font-black text-[var(--text)] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Valyuta</label>
                <select
                  value={valyuta}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setValyuta(v);
                    if (v === 'USD') setKassaTuri('naqd_usd');
                    else if (kassaTuri === 'naqd_usd') setKassaTuri('naqd_uzs');
                  }}
                  className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-emerald-500 focus:outline-none"
                >
                  <option value="UZS">UZS (So'm)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qaysi Kassaga Kirim</label>
              <select
                value={kassaTuri}
                onChange={(e) => setKassaTuri(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-emerald-500 focus:outline-none"
              >
                {KASSA_TURLARI.map(kt => (
                  <option key={kt.id} value={kt.id}>{kt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kimdan Qabul Qilindi</label>
              <input
                type="text"
                value={kimgaKimdan}
                onChange={(e) => setKimgaKimdan(e.target.value)}
                placeholder="Masalan: Ta'sischi, Xaridor, Kassa to'ldirish..."
                required
                className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Sana</label>
              <input
                type="date"
                value={sana}
                onChange={(e) => setSana(e.target.value)}
                className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Izoh</label>
              <textarea
                value={izoh}
                onChange={(e) => setIzoh(e.target.value)}
                placeholder="Kirim sababi yoki qo'shimcha ma'lumot..."
                rows={3}
                className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-emerald-500 focus:outline-none resize-none"
              />
            </div>

          </div>

          {/* Fixed Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg2)] flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-xs font-black text-white rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              Kirim Qilish
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

// SUB-MODAL: KASSA BALANSLARINI TAHRIRLASH
function EditBalanceModal({
  currentBalansi,
  onClose,
  onSave
}: {
  currentBalansi: any;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [naqdUzs, setNaqdUzs] = useState(currentBalansi.naqd_uzs || 0);
  const [naqdUsd, setNaqdUsd] = useState(currentBalansi.naqd_usd || 0);
  const [kartaUzs, setKartaUzs] = useState(currentBalansi.karta_uzs || 0);
  const [bankUzs, setBankUzs] = useState(currentBalansi.bank_uzs || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      naqd_uzs: Number(naqdUzs),
      naqd_usd: Number(naqdUsd),
      karta_uzs: Number(kartaUzs),
      bank_uzs: Number(bankUzs)
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Edit3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-black text-[var(--text)]">Kassa Qoldiqlarini To'g'rilash</h3>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--text3)]">
          Kassadagi haqiqiy boshlang'ich yoki joriy naqd/bank mablag'larini kiriting:
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          
          <div>
            <label className="text-xs font-bold text-[var(--text2)] block mb-1">Naqd Pul (So'm - UZS)</label>
            <input
              type="number"
              value={naqdUzs}
              onChange={(e) => setNaqdUzs(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text2)] block mb-1">Naqd Pul (Dollar - $ USD)</label>
            <input
              type="number"
              value={naqdUsd}
              onChange={(e) => setNaqdUsd(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text2)] block mb-1">Karta Balansi (UZS)</label>
            <input
              type="number"
              value={kartaUzs}
              onChange={(e) => setKartaUzs(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--text2)] block mb-1">Bank Hisob Raqami (UZS)</label>
            <input
              type="number"
              value={bankUzs}
              onChange={(e) => setBankUzs(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text)]"
            />
          </div>

          <div className="flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-xs font-black text-white rounded-xl shadow-md shadow-blue-500/20 cursor-pointer"
            >
              Saqlash
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

// SUB-MODAL: KASSA HARAKATINI TAHRIRLASH
function EditHarakatModal({
  item,
  valyutaKursi,
  onClose,
  onSave
}: {
  item: KassaHarakati;
  valyutaKursi: number;
  onClose: () => void;
  onSave: (updatedItem: KassaHarakati) => void;
}) {
  const [tur, setTur] = useState<KassaHarakatTuri>(item.tur || 'chiqim');
  const [kategoriya, setKategoriya] = useState<any>(item.kategoriya || 'ish_haqi');
  const [summa, setSumma] = useState<number | ''>(item.summa || 0);
  const [valyuta, setValyuta] = useState<'UZS' | 'USD'>(item.valyuta || 'UZS');
  const [kassaTuri, setKassaTuri] = useState<KassaTuri>(item.kassaTuri || 'naqd_uzs');
  const [kimgaKimdan, setKimgaKimdan] = useState(item.kimgaKimdan || '');
  const [izoh, setIzoh] = useState(item.izoh || '');
  const [sana, setSana] = useState(item.sana || getTodayStr());
  const [vaqt, setVaqt] = useState(item.vaqt || getNowStr().slice(11, 16));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summa || Number(summa) <= 0) {
      toast.error("Iltimos, summani to'g'ri kiriting!");
      return;
    }

    const numericSumma = Number(summa);
    const sumUzs = valyuta === 'USD' ? numericSumma * valyutaKursi : numericSumma;

    const updatedItem: KassaHarakati = {
      ...item,
      tur,
      kategoriya,
      summa: numericSumma,
      valyuta,
      kurs: valyutaKursi,
      summaUzs: sumUzs,
      kassaTuri,
      kimgaKimdan,
      izoh,
      sana,
      vaqt
    };

    onSave(updatedItem);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Kassa Harakatini Tahrirlash</h3>
              <p className="text-[11px] text-[var(--text3)]">ID: #{item.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 overflow-y-auto space-y-4 max-h-[calc(90vh-140px)]">
            
            {/* Tur Tanlash: Kirim / Chiqim */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Amal Turi</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTur('chiqim');
                    if (['kapital', 'savdo_tushumi', 'qarz_tolovi', 'boshqa_daromad'].includes(kategoriya)) {
                      setKategoriya('ish_haqi');
                    }
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    tur === 'chiqim'
                      ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                      : 'bg-[var(--bg)] text-[var(--text3)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" /> Chiqim (Xarajat)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTur('kirim');
                    setKategoriya('kapital');
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    tur === 'kirim'
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                      : 'bg-[var(--bg)] text-[var(--text3)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Kirim (Tushum)
                </button>
              </div>
            </div>

            {/* Kategoriya */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Toifa (Kategoriya)</label>
              {tur === 'chiqim' ? (
                <select
                  value={kategoriya}
                  onChange={(e) => setKategoriya(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
                >
                  {XARAJAT_KATEGORIYALARI.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={kategoriya}
                  onChange={(e) => setKategoriya(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
                >
                  <option value="kapital">Ta'sischi Kapitali / Kassa To'ldirish</option>
                  <option value="savdo_tushumi">To'g'ridan-to'g'ri Savdo Tushumi</option>
                  <option value="qarz_tolovi">Mijoz Qarz To'lovi</option>
                  <option value="boshqa_daromad">Boshqa Qo'shimcha Daromad</option>
                </select>
              )}
            </div>

            {/* Summa & Valyuta */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Summa</label>
                <input
                  type="number"
                  value={summa}
                  onChange={(e) => setSumma(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  required
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-mono font-black text-[var(--text)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Valyuta</label>
                <select
                  value={valyuta}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setValyuta(v);
                    if (v === 'USD') setKassaTuri('naqd_usd');
                    else if (kassaTuri === 'naqd_usd') setKassaTuri('naqd_uzs');
                  }}
                  className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
                >
                  <option value="UZS">UZS (So'm)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            {/* Kassa Hamyoni */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kassa Hamyoni</label>
              <select
                value={kassaTuri}
                onChange={(e) => setKassaTuri(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-blue-500 focus:outline-none"
              >
                {KASSA_TURLARI.map(kt => (
                  <option key={kt.id} value={kt.id}>{kt.label}</option>
                ))}
              </select>
            </div>

            {/* Kimga / Kimdan */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Kimga / Kimdan</label>
              <input
                type="text"
                value={kimgaKimdan}
                onChange={(e) => setKimgaKimdan(e.target.value)}
                placeholder="Masalan: Ta'sischi, Haydovchi, Mijoz..."
                required
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Sana & Vaqt */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Sana</label>
                <input
                  type="date"
                  value={sana}
                  onChange={(e) => setSana(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Vaqt</label>
                <input
                  type="text"
                  value={vaqt}
                  onChange={(e) => setVaqt(e.target.value)}
                  placeholder="14:30"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--text)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Izoh */}
            <div>
              <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Izoh</label>
              <textarea
                value={izoh}
                onChange={(e) => setIzoh(e.target.value)}
                placeholder="Qo'shimcha izoh yoki sababi..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

          </div>

          {/* Fixed Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg2)] flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-xs font-black text-white rounded-xl shadow-md shadow-blue-500/20 cursor-pointer"
            >
              Saqlash & Balansni Yangilash
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

// SUB-MODAL: KASSA HARAKATINI O'CHIRISHNI TASDIQLASH
function DeleteHarakatConfirmModal({
  item,
  valyutaKursi,
  onClose,
  onConfirm
}: {
  item: KassaHarakati;
  valyutaKursi: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isExpense = item.tur === 'chiqim';
  const kassaObj = KASSA_TURLARI.find(k => k.id === item.kassaTuri);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-black shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--text)]">Kassa Amalini O'chirish</h3>
            <p className="text-xs text-[var(--text3)]">Ushbu amal kassa balansiga to'g'ridan-to'g'ri ta'sir qiladi</p>
          </div>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[var(--text3)]">Amal turi:</span>
            <span className={`font-bold px-2 py-0.5 rounded-md ${
              isExpense ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
            }`}>
              {isExpense ? 'Chiqim (Xarajat)' : 'Kirim (Tushum)'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[var(--text3)]">Summa:</span>
            <span className={`font-mono font-black text-sm ${isExpense ? 'text-rose-500' : 'text-emerald-500'}`}>
              {item.summa.toLocaleString()} {item.valyuta}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[var(--text3)]">Kassa hamyoni:</span>
            <span className="font-bold text-[var(--text)]">{kassaObj?.label || item.kassaTuri}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[var(--text3)]">Kimga / Kimdan:</span>
            <span className="font-bold text-[var(--text)]">{item.kimgaKimdan}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[var(--text3)]">Sana:</span>
            <span className="font-mono text-[var(--text)]">{item.sana} {item.vaqt}</span>
          </div>

          {item.izoh && (
            <div className="pt-1 border-t border-[var(--border)] text-[var(--text3)] text-[11px]">
              <strong>Izoh:</strong> {item.izoh}
            </div>
          )}
        </div>

        {/* Impact Warning */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {isExpense 
              ? `Ushbu chiqim o'chirilsa, ${item.summa.toLocaleString()} ${item.valyuta} kassa balansiga qaytib qo'shiladi (+).`
              : `Ushbu kirim o'chirilsa, ${item.summa.toLocaleString()} ${item.valyuta} kassa balansidan ayirib tashlanadi (-).`}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white rounded-xl shadow-md shadow-rose-600/20 cursor-pointer"
          >
            Ha, O'chirilsin
          </button>
        </div>

      </div>
    </div>
  );
}

// SUB-MODAL: BARCHA KASSA HARAKATLARINI TOZALASH
function ClearAllTransactionsModal({
  totalCount,
  onClose,
  onConfirm
}: {
  totalCount: number;
  onClose: () => void;
  onConfirm: (resetBalances: boolean) => void;
}) {
  const [resetBalances, setResetBalances] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--text)]">Kassa Tarixini Tozalash</h3>
            <p className="text-xs text-[var(--text3)]">Barcha kirim va chiqim (xarajat) yozuvlarini o'chirish</p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Diqqat! Ushbu amalni ortga qaytarib bo'lmaydi.</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Kassadagi jami <strong className="font-black">{totalCount} ta</strong> amal (barcha xarajatlar va kirimlar) ro'yxatdan butunlay tozalab tashlanadi.
          </p>
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={resetBalances}
            onChange={(e) => setResetBalances(e.target.checked)}
            className="mt-0.5 rounded border-[var(--border)] text-rose-600 focus:ring-rose-500"
          />
          <div className="text-xs">
            <span className="font-bold text-[var(--text)] block">Kassa qoldiqlarini ham 0 ga tushirish</span>
            <span className="text-[11px] text-[var(--text3)]">Naqd so'm, dollar, karta va bank hamyonlari qoldig'i 0 qilib belgilanadi.</span>
          </div>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={() => onConfirm(resetBalances)}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white rounded-xl shadow-md shadow-rose-600/20 cursor-pointer"
          >
            Ha, Hammasini tozalash
          </button>
        </div>

      </div>
    </div>
  );
}

// SUB-MODAL: KASSANI NOLDAN (0 DAN) BOSHLASH
function ResetKassaToZeroModal({
  totalCount,
  totalAssetsUzs,
  onClose,
  onConfirm
}: {
  totalCount: number;
  totalAssetsUzs: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typedConfirm, setTypedConfirm] = useState('');
  const canConfirm = typedConfirm.trim() === '0';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg2)] border border-rose-500/30 rounded-3xl w-full max-w-lg p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold shrink-0 shadow-inner">
            <RotateCcw className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-[var(--text)]">Kassani Noldan (0 dan) Boshlash</h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 border border-rose-500/30">
                Admin
              </span>
            </div>
            <p className="text-xs text-[var(--text3)]">
              Barcha tranzaksiyalarni o'chirish va joriy qoldiqlarni butunlay 0 ga tushirish
            </p>
          </div>
        </div>

        {/* Info Card */}
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs space-y-3">
          <div className="flex items-center gap-2 font-black text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Diqqat! Ushbu amal kassa hisobini to'liq yangidan boshlaydi.</span>
          </div>
          <ul className="space-y-1.5 text-[11px] list-disc list-inside text-[var(--text2)]">
            <li><strong className="text-[var(--text)]">Barcha kirim va chiqimlar:</strong> Kassadagi barcha ({totalCount} ta) tranzaksiyalar tarixi butunlay tozalanadi.</li>
            <li><strong className="text-[var(--text)]">Kassa qoldiqlari:</strong> Naqd so'm, Naqd dollar, Karta va Bank hisoblari qoldig'i <strong className="text-rose-600 dark:text-rose-400">0 ga tenglashtiriladi</strong>.</li>
            <li><strong className="text-[var(--text)]">O'tkazmalar & Smenalar:</strong> Kassalararo transferlar va smena yozuvlari tozalanadi.</li>
            <li><strong className="text-[var(--text)]">Bulutli xotira:</strong> Barcha o'zgarishlar darhol Firebase bulutli bazasida sinxronlanadi.</li>
          </ul>
        </div>

        {/* Current status being cleared */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)]">
          <div>
            <span className="text-[11px] text-[var(--text3)] block">O'chiriladigan amallar:</span>
            <span className="text-sm font-black text-[var(--text)] font-mono">{totalCount} ta tranzaksiya</span>
          </div>
          <div>
            <span className="text-[11px] text-[var(--text3)] block">Nolga tushadigan aktivlar:</span>
            <span className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono">
              {totalAssetsUzs.toLocaleString()} so'm
            </span>
          </div>
        </div>

        {/* Anti-accidental confirmation */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text2)] block">
            Tasdiqlash uchun pastdagi maydonga <strong className="text-rose-600 dark:text-rose-400 font-mono">0</strong> raqamini yozing:
          </label>
          <input
            type="text"
            value={typedConfirm}
            onChange={(e) => setTypedConfirm(e.target.value)}
            placeholder='Raqamni kiriting: 0'
            className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-center text-sm font-mono font-black text-[var(--text)] focus:border-rose-500 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)] transition-colors"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={cn(
              "flex-1 py-3 text-xs font-black text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer",
              canConfirm 
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30 active:scale-98" 
                : "bg-rose-600/40 text-white/50 cursor-not-allowed"
            )}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Ha, Kassani 0 dan Boshlash</span>
          </button>
        </div>

      </div>
    </div>
  );
}
