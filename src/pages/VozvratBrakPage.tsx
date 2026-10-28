import React, { useState, useMemo, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { produce } from 'immer';
import { 
  DbState, 
  VozvratItem, 
  BrakItem, 
  VozvratSabab, 
  VozvratHolat, 
  VozvratTolovTuri, 
  BrakNuqsonTuri, 
  BrakStatus, 
  BrakManba,
  KassaTuri,
  WarehouseName
} from '../types';
import { 
  RotateCcw, 
  ShieldAlert, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ArrowRight, 
  Layers, 
  Package, 
  Building2, 
  Calendar, 
  User, 
  Tag, 
  Clock, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart, 
  DollarSign, 
  Truck, 
  Trash2, 
  Check, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { ALL_SIZES, formatCompact, formatUzs, generateId, getNowStr, getTodayStr, cn } from '../lib/utils';
import { ModelSelect, SizeInputs } from '../components/SharedComponents';
import { ClientSearchSelect } from '../components/ClientSearchSelect';
import { createAuditLog } from '../lib/auditUtils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { notifyVozvratAlert, notifyBrakAlert } from '../services/telegramService';
import { LazyViewport } from '../components/common/LazyViewport';
import { Suspense, lazy } from 'react';

const LazyVozvratBrakAnalyticsCharts = lazy(() => import('../components/vozvrat/VozvratBrakAnalyticsCharts'));

export const VOZVRAT_SABABLAR: { id: VozvratSabab; label: string; color: string }[] = [
  { id: 'olcham_togri_kelmadi', label: "O'lcham to'g'ri kelmadi", color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { id: 'ortiqcha_olingan', label: "Ortiqcha xarid qilingan", color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  { id: 'brak_nuqsonli', label: "Brak / Nuqson aniqlandi", color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  { id: 'model_almashish', label: "Model almashtirish", color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  { id: 'mijoz_rad_etdi', label: "Mijoz rad etdi", color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  { id: 'boshqa', label: "Boshqa sabab", color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
];

export const BRAK_NUQSON_TURLARI: { id: BrakNuqsonTuri; label: string; desc: string }[] = [
  { id: 'chok_tutilishi', label: "Chok / Tikuv tutilishi", desc: "Yon va orqa choklarning so'kilishi" },
  { id: 'taglik_kochinishi', label: "Taglik (podoshva) ko'chishi", desc: "Yelim ajralishi yoki podoshva yorilishi" },
  { id: 'teri_yirtilishi', label: "Teri / Material yirtilishi", desc: "Yuzasi yoki astar zararlanishi" },
  { id: 'rang_dog', label: "Rang farqi / Dog'", desc: "Bo'yoq sifati yoki dog' izlari" },
  { id: 'razmer_notogri', label: "Noto'g'ri razmer (Parovka)", desc: "O'ng va chap poyafzal razmeri mos emas" },
  { id: 'furnitura_nuqson', label: "Zamok / Furnitura nuqsoni", desc: "Ip, tana yoki ilgak sinishi" },
  { id: 'boshqa', label: "Boshqa nuqson", desc: "Nostandart nosozlik" }
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function VozvratBrakPage() {
  const { db, setDb, currentUser, currentOmbor, setCurrentOmbor } = useDb();
  const [activeTab, setActiveTab] = useState<'vozvrat' | 'brak' | 'analitika'>('vozvrat');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOmborFilter, setSelectedOmborFilter] = useState<'all' | 'tepa' | 'kotta'>('all');
  const [selectedReasonFilter, setSelectedReasonFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  const [vozvratVisibleCount, setVozvratVisibleCount] = useState(50);
  const [brakVisibleCount, setBrakVisibleCount] = useState(50);

  // Reset pagination on filter change
  React.useEffect(() => {
    setVozvratVisibleCount(50);
  }, [searchQuery, selectedOmborFilter, selectedReasonFilter, dateRange]);

  React.useEffect(() => {
    setBrakVisibleCount(50);
  }, [searchQuery, selectedOmborFilter, selectedStatusFilter, dateRange]);

  // Modal States
  const [isVozvratModalOpen, setIsVozvratModalOpen] = useState(false);
  const [isBrakModalOpen, setIsBrakModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [selectedBrakForAction, setSelectedBrakForAction] = useState<BrakItem | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'fabrika' | 'utsenka' | 'spisanie'>('fabrika');
  const [actionNotes, setActionNotes] = useState('');
  const [actionUtsenkaPrice, setActionUtsenkaPrice] = useState<number | ''>('');
  const [actionKassaTuri, setActionKassaTuri] = useState<KassaTuri>('naqd_uzs');

  // Receipt Modal
  const [selectedVozvratReceipt, setSelectedVozvratReceipt] = useState<VozvratItem | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isVozvratModalOpen) setIsVozvratModalOpen(false);
        else if (isBrakModalOpen) setIsBrakModalOpen(false);
        else if (isActionModalOpen) setIsActionModalOpen(false);
        else if (selectedVozvratReceipt) setSelectedVozvratReceipt(null);
        else if (isClearAllModalOpen) setIsClearAllModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVozvratModalOpen, isBrakModalOpen, isActionModalOpen, selectedVozvratReceipt, isClearAllModalOpen]);

  // New Vozvrat Form State
  const [vOmbor, setVOmbor] = useState<WarehouseName>(currentOmbor || 'tepa');
  const [vModel, setVModel] = useState('');
  const [vSizes, setVSizes] = useState<Record<string, number>>({});
  const [vMijoz, setVMijoz] = useState('');
  const [vSabab, setVSabab] = useState<VozvratSabab>('olcham_togri_kelmadi');
  const [vHolat, setVHolat] = useState<VozvratHolat>('yaroqli');
  const [vSumma, setVSumma] = useState<number | ''>('');
  const [vTolovTuri, setVTolovTuri] = useState<VozvratTolovTuri>('qarzdan_ayirish');
  const [vKassaTuri, setVKassaTuri] = useState<KassaTuri>('naqd_uzs');
  const [vIzoh, setVIzoh] = useState('');
  const [vNuqsonTuri, setVNuqsonTuri] = useState<BrakNuqsonTuri>('chok_tutilishi');

  // New Brak Form State (Ombor yoki Fabrikadan)
  const [bOmbor, setBOmbor] = useState<WarehouseName>(currentOmbor || 'tepa');
  const [bModel, setBModel] = useState('');
  const [bSizes, setBSizes] = useState<Record<string, number>>({});
  const [bManba, setBManba] = useState<BrakManba>('ombor_aniqlangan');
  const [bNuqsonTuri, setBNuqsonTuri] = useState<BrakNuqsonTuri>('chok_tutilishi');
  const [bTannarx, setBTannarx] = useState<number | ''>('');
  const [bIzoh, setBIzoh] = useState('');

  // All Available Models
  const allModels = useMemo(() => {
    const tepa = Object.keys(db.tepa?.stock || {});
    const kotta = Object.keys(db.kotta?.stock || {});
    return Array.from(new Set([...tepa, ...kotta])).filter(Boolean);
  }, [db]);

  // All Existing Clients (Sorted A-Z)
  const allClients = useMemo(() => {
    return (db.kontragentlar || [])
      .map(k => k.ism)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'uz', { sensitivity: 'base' }));
  }, [db.kontragentlar]);

  // List of Vozvratlar
  const vozvratList = useMemo(() => {
    return (db.vozvratlar || []).slice().reverse();
  }, [db.vozvratlar]);

  // List of Braklar
  const brakList = useMemo(() => {
    return (db.braklar || []).slice().reverse();
  }, [db.braklar]);

  // Filtered Vozvratlar
  const filteredVozvratlar = useMemo(() => {
    return vozvratList.filter(item => {
      if (selectedOmborFilter !== 'all' && item.ombor !== selectedOmborFilter) return false;
      if (selectedReasonFilter !== 'all' && item.sabab !== selectedReasonFilter) return false;
      if (dateRange.start && item.sana < dateRange.start) return false;
      if (dateRange.end && item.sana > dateRange.end) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchModel = item.model.toLowerCase().includes(q);
        const matchMijoz = item.mijoz.toLowerCase().includes(q);
        const matchIzoh = (item.izoh || '').toLowerCase().includes(q);
        if (!matchModel && !matchMijoz && !matchIzoh) return false;
      }
      return true;
    });
  }, [vozvratList, selectedOmborFilter, selectedReasonFilter, dateRange, searchQuery]);

  // Filtered Braklar
  const filteredBraklar = useMemo(() => {
    return brakList.filter(item => {
      if (selectedOmborFilter !== 'all' && item.ombor !== selectedOmborFilter) return false;
      if (selectedStatusFilter !== 'all' && item.status !== selectedStatusFilter) return false;
      if (dateRange.start && item.sana < dateRange.start) return false;
      if (dateRange.end && item.sana > dateRange.end) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchModel = item.model.toLowerCase().includes(q);
        const matchMijoz = (item.mijoz || '').toLowerCase().includes(q);
        const matchIzoh = (item.izoh || '').toLowerCase().includes(q);
        if (!matchModel && !matchMijoz && !matchIzoh) return false;
      }
      return true;
    });
  }, [brakList, selectedOmborFilter, selectedStatusFilter, dateRange, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const jamiVozvratJuft = vozvratList.reduce((acc, v) => acc + (v.jamiSoni || 0), 0);
    const jamiVozvratSumma = vozvratList.reduce((acc, v) => acc + (v.summa || 0), 0);

    const ombordagiBraklar = brakList.filter(b => b.status === 'omborda');
    const ombordagiBrakJuft = ombordagiBraklar.reduce((acc, b) => acc + (b.jamiSoni || 0), 0);
    const ombordagiBrakSumma = ombordagiBraklar.reduce((acc, b) => {
      const unitPrice = b.tannarx || (db.prices && db.prices[b.model]?.cost) || 90000;
      return acc + (b.jamiSoni || 0) * unitPrice;
    }, 0);

    const fabrikagaYuborilganJuft = brakList
      .filter(b => b.status === 'fabrikaga_yuborildi')
      .reduce((acc, b) => acc + (b.jamiSoni || 0), 0);

    const utsenkaTushum = brakList
      .filter(b => b.status === 'utsenka_sotildi')
      .reduce((acc, b) => acc + (b.utsenkaNarxi || 0), 0);

    return {
      jamiVozvratJuft,
      jamiVozvratSumma,
      ombordagiBrakJuft,
      ombordagiBrakSumma,
      fabrikagaYuborilganJuft,
      utsenkaTushum
    };
  }, [vozvratList, brakList, db.prices]);

  // Analytics Aggregations
  const analyticsData = useMemo(() => {
    // Model bo'yicha vozvrat & brak
    const modelStats: Record<string, { model: string; vozvrat: number; brak: number }> = {};
    vozvratList.forEach(v => {
      if (!modelStats[v.model]) modelStats[v.model] = { model: v.model, vozvrat: 0, brak: 0 };
      modelStats[v.model].vozvrat += v.jamiSoni || 0;
    });
    brakList.forEach(b => {
      if (!modelStats[b.model]) modelStats[b.model] = { model: b.model, vozvrat: 0, brak: 0 };
      modelStats[b.model].brak += b.jamiSoni || 0;
    });

    const topDefectiveModels = Object.values(modelStats)
      .sort((a, b) => (b.vozvrat + b.brak) - (a.vozvrat + a.brak))
      .slice(0, 7);

    // Nuqson turlari taqsimoti
    const nuqsonStats: Record<string, number> = {};
    brakList.forEach(b => {
      const typeLabel = BRAK_NUQSON_TURLARI.find(n => n.id === b.nuqsonTuri)?.label || 'Boshqa';
      nuqsonStats[typeLabel] = (nuqsonStats[typeLabel] || 0) + (b.jamiSoni || 0);
    });
    const pieNuqsonData = Object.entries(nuqsonStats).map(([name, value]) => ({ name, value }));

    // Sabablar taqsimoti
    const sababStats: Record<string, number> = {};
    vozvratList.forEach(v => {
      const reasonLabel = VOZVRAT_SABABLAR.find(s => s.id === v.sabab)?.label || 'Boshqa';
      sababStats[reasonLabel] = (sababStats[reasonLabel] || 0) + (v.jamiSoni || 0);
    });
    const pieSababData = Object.entries(sababStats).map(([name, value]) => ({ name, value }));

    return {
      topDefectiveModels,
      pieNuqsonData,
      pieSababData
    };
  }, [vozvratList, brakList]);

  // Handle Model Change for Vozvrat (auto-populate calculated total price based on catalog)
  const handleVozvratModelChange = (modelName: string) => {
    setVModel(modelName);
    const salePrice = db.prices?.[modelName]?.sale || 0;
    const totalQty = Object.values(vSizes).reduce((a, b) => a + (Number(b) || 0), 0);
    if (salePrice > 0 && totalQty > 0) {
      setVSumma(salePrice * totalQty);
    }
  };

  // Recalculate price when size qty changes
  const handleVozvratSizesChange = (newSizes: Record<string, number>) => {
    setVSizes(newSizes);
    const totalQty = Object.values(newSizes).reduce((a, b) => a + (Number(b) || 0), 0);
    const salePrice = db.prices?.[vModel]?.sale || 0;
    if (salePrice > 0 && totalQty > 0) {
      setVSumma(salePrice * totalQty);
    }
  };

  // SAVE VOZVRAT ACTION
  const handleSaveVozvrat = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vModel.trim()) {
      toast.error("Iltimos, mahsulot modelini tanlang!");
      return;
    }

    const totalQty = Object.values(vSizes).reduce((a, b) => a + (Number(b) || 0), 0);
    if (totalQty <= 0) {
      toast.error("Kamida 1 juft poyafzal miqdorini kiriting!");
      return;
    }

    if (!vMijoz.trim()) {
      toast.error("Iltimos, mijoz / kontragent ismini kiriting!");
      return;
    }

    const summaVal = Number(vSumma) || 0;
    const now = getNowStr();
    const today = getTodayStr();
    const vozvratId = `voz-${generateId()}`;

    const newVozvrat: VozvratItem = {
      id: vozvratId,
      sana: today,
      vaqt: now.split(' ')[1] || '12:00',
      ombor: vOmbor,
      model: vModel,
      sizes: vSizes,
      jamiSoni: totalQty,
      mijoz: vMijoz,
      sabab: vSabab,
      holat: vHolat,
      summa: summaVal,
      tolovQaytarishTuri: vTolovTuri,
      kassaTuri: vTolovTuri === 'kassa_chiqim' ? vKassaTuri : undefined,
      xodim: currentUser?.ism || 'Admin',
      izoh: vIzoh
    };

    setDb(
      produce((draft: DbState) => {
        // 1. Vozvratlar ro'yxatiga qo'shish
        if (!Array.isArray(draft.vozvratlar)) draft.vozvratlar = [];
        draft.vozvratlar.push(newVozvrat);

        // 2. Agar holat 'yaroqli' bo'lsa -> Ombor qoldig'iga (stock) qo'shish va tranzaksiya yozish
        if (vHolat === 'yaroqli') {
          if (!draft[vOmbor].stock[vModel]) {
            draft[vOmbor].stock[vModel] = {};
          }
          Object.entries(vSizes).forEach(([sz, qty]) => {
            const num = Number(qty) || 0;
            if (num > 0) {
              const currentVal = draft[vOmbor].stock[vModel][sz] || 0;
              draft[vOmbor].stock[vModel][sz] = currentVal + num;
            }
          });

          // Tranzaksiyalar tarixiga qayd etish
          Object.entries(vSizes).forEach(([sz, qty]) => {
            const num = Number(qty) || 0;
            if (num > 0) {
              draft[vOmbor].transactions.push({
                id: `tx-voz-${generateId()}`,
                vaqt: now,
                sana: today,
                amal: 'kirim',
                model: vModel,
                olcham: sz,
                soni: num,
                kimdan: `Mijozdan qaytgan (${vMijoz})`,
                izoh: `Vozvrat: ${VOZVRAT_SABABLAR.find(s => s.id === vSabab)?.label || ''}. ${vIzoh}`,
                xodim: currentUser?.ism || 'Admin',
                summa: summaVal
              });
            }
          });
        }

        // 3. Agar holat 'brak' bo'lsa -> Braklar fondiga qo'shish
        if (vHolat === 'brak') {
          if (!Array.isArray(draft.braklar)) draft.braklar = [];
          const brakRecord: BrakItem = {
            id: `brak-${generateId()}`,
            sana: today,
            vaqt: now.split(' ')[1] || '12:00',
            ombor: vOmbor,
            model: vModel,
            sizes: vSizes,
            jamiSoni: totalQty,
            manba: 'mijoz_vozvrat',
            nuqsonTuri: vNuqsonTuri,
            status: 'omborda',
            xodim: currentUser?.ism || 'Admin',
            izoh: `Mijozdan qaytgan brak: ${vIzoh}`,
            vozvratId: vozvratId,
            mijoz: vMijoz,
            tannarx: draft.prices?.[vModel]?.cost || 90000
          };
          draft.braklar.push(brakRecord);
        }

        // 4. Moliya: Agar kassadan pul qaytarilgan bo'lsa -> Kassa chiqim
        if (vTolovTuri === 'kassa_chiqim' && summaVal > 0) {
          if (!Array.isArray(draft.kassaHarakatlari)) draft.kassaHarakatlari = [];
          if (!draft.kassaBalansi) {
            draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
          }

          // Balansdan ayirish
          draft.kassaBalansi[vKassaTuri] = (draft.kassaBalansi[vKassaTuri] || 0) - summaVal;

          draft.kassaHarakatlari.unshift({
            id: `k-voz-${generateId()}`,
            sana: today,
            vaqt: now.split(' ')[1] || '12:00',
            tur: 'chiqim',
            kategoriya: 'boshqa',
            summa: summaVal,
            valyuta: 'UZS',
            kurs: draft.valyutaKursi || 12850,
            summaUzs: summaVal,
            kassaTuri: vKassaTuri,
            kimgaKimdan: `Vozvrat to'lovi: ${vMijoz}`,
            izoh: `Qaytarilgan tovar (${vModel}, ${totalQty} juft) uchun to'lov qaytarildi`,
            xodim: currentUser?.ism || 'Admin',
            boglanishId: vozvratId
          });
        }

        // 5. Agar mijozning qarzidan ayirish tanlansa -> Mijoz balansi kamaytiriladi
        if (vTolovTuri === 'qarzdan_ayirish' && summaVal > 0 && Array.isArray(draft.kontragentlar)) {
          const clientIndex = draft.kontragentlar.findIndex(k => k.ism.toLowerCase() === vMijoz.toLowerCase());
          if (clientIndex !== -1) {
            draft.kontragentlar[clientIndex].balans = (draft.kontragentlar[clientIndex].balans || 0) - summaVal;
          }
        }

        // 6. Audit Log
        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            'Vozvrat qabul qilindi',
            'Vozvrat',
            `${vMijoz} dan ${vModel} (${totalQty} juft) qaytarildi. Holat: ${vHolat}, Summa: ${formatUzs(summaVal)} UZS`,
            'info'
          )
        );
      })
    );

    toast.success("Mijozdan tovar muvaffaqiyatli qabul qilindi!");
    
    // Dispatch Telegram alert
    if (db.telegramConfig?.isEnabled) {
      notifyVozvratAlert(db, {
        mijoz: vMijoz,
        model: vModel,
        totalQty,
        holat: vHolat,
        summa: summaVal,
        tolovQaytarishTuri: vTolovTuri === 'qarzdan_ayirish' 
          ? 'Mijoz qarzidan ayirish' 
          : vTolovTuri === 'kassa_chiqim' 
            ? `Kassadan pul qaytarish (${vKassaTuri})` 
            : 'Keyingi xarid uchun depozit',
        xodim: currentUser?.ism || 'Admin'
      }, setDb).catch(console.warn);
    }

    setIsVozvratModalOpen(false);

    // Reset Form
    setVModel('');
    setVSizes({});
    setVMijoz('');
    setVSumma('');
    setVIzoh('');
  };

  // SAVE BRAK (From warehouse or incoming shipment)
  const handleSaveBrakDirect = (e: React.FormEvent) => {
    e.preventDefault();

    if (!bModel.trim()) {
      toast.error("Iltimos, mahsulot modelini tanlang!");
      return;
    }

    const totalQty = Object.values(bSizes).reduce((a, b) => a + (Number(b) || 0), 0);
    if (totalQty <= 0) {
      toast.error("Kamida 1 juft miqdorini kiriting!");
      return;
    }

    const now = getNowStr();
    const today = getTodayStr();
    const tannarxVal = Number(bTannarx) || db.prices?.[bModel]?.cost || 90000;

    const newBrak: BrakItem = {
      id: `brak-${generateId()}`,
      sana: today,
      vaqt: now.split(' ')[1] || '12:00',
      ombor: bOmbor,
      model: bModel,
      sizes: bSizes,
      jamiSoni: totalQty,
      manba: bManba,
      nuqsonTuri: bNuqsonTuri,
      status: 'omborda',
      tannarx: tannarxVal,
      xodim: currentUser?.ism || 'Admin',
      izoh: bIzoh
    };

    setDb(
      produce((draft: DbState) => {
        if (!Array.isArray(draft.braklar)) draft.braklar = [];
        draft.braklar.push(newBrak);

        // Agar bu ombordan aniqlangan bo'lsa -> asosiy ombor qoldig'idan chiqarish
        if (bManba === 'ombor_aniqlangan') {
          if (draft[bOmbor].stock[bModel]) {
            Object.entries(bSizes).forEach(([sz, qty]) => {
              const num = Number(qty) || 0;
              const cur = draft[bOmbor].stock[bModel][sz] || 0;
              draft[bOmbor].stock[bModel][sz] = Math.max(0, cur - num);
            });
          }

          // Tranzaksiya yozish
          Object.entries(bSizes).forEach(([sz, qty]) => {
            const num = Number(qty) || 0;
            if (num > 0) {
              draft[bOmbor].transactions.push({
                id: `tx-brak-${generateId()}`,
                vaqt: now,
                sana: today,
                amal: 'chiqim',
                model: bModel,
                olcham: sz,
                soni: num,
                kimdan: `Brak fondiga o'tkazildi`,
                izoh: `Nuqson: ${BRAK_NUQSON_TURLARI.find(n => n.id === bNuqsonTuri)?.label || ''}. ${bIzoh}`,
                xodim: currentUser?.ism || 'Admin'
              });
            }
          });
        }

        // Audit Log
        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            'Brak qayd etildi',
            'Brak',
            `${bModel} (${totalQty} juft) nuqsonli tovar sifatida qayd etildi (${bManba})`,
            'warning'
          )
        );
      })
    );

    toast.success("Brak tovar fondga muvaffaqiyatli qo'shildi!");
    
    // Dispatch Telegram alert
    if (db.telegramConfig?.isEnabled) {
      notifyBrakAlert(db, {
        model: bModel,
        totalQty,
        manba: bManba === 'fabrika_kirim' 
          ? 'Fabrikadan kirimda' 
          : bManba === 'ombor_aniqlangan' 
            ? 'Omborda aniqlangan' 
            : 'Mijoz vozvratida',
        nuqsonTuri: bNuqsonTuri.replace(/_/g, ' '),
        ombor: bOmbor === 'tepa' ? 'Tepa ombor' : 'Kotta ombor',
        xodim: currentUser?.ism || 'Admin'
      }, setDb).catch(console.warn);
    }

    setIsBrakModalOpen(false);

    // Reset
    setBModel('');
    setBSizes({});
    setBIzoh('');
    setBTannarx('');
  };

  // EXECUTE BRAK ACTION (Fabrika, Utsenka, Spisanie)
  const handleExecuteBrakAction = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBrakForAction) return;

    const today = getTodayStr();
    const now = getNowStr();
    const brakId = selectedBrakForAction.id;

    setDb(
      produce((draft: DbState) => {
        if (!Array.isArray(draft.braklar)) return;
        const index = draft.braklar.findIndex(b => b.id === brakId);
        if (index === -1) return;

        if (actionType === 'fabrika') {
          draft.braklar[index].status = 'fabrikaga_yuborildi';
          draft.braklar[index].halQilinganSana = today;
          draft.braklar[index].halQilinganIzoh = `Fabrikaga qaytarildi: ${actionNotes}`;
        } else if (actionType === 'utsenka') {
          const price = Number(actionUtsenkaPrice) || 0;
          draft.braklar[index].status = 'utsenka_sotildi';
          draft.braklar[index].halQilinganSana = today;
          draft.braklar[index].utsenkaNarxi = price;
          draft.braklar[index].kassaTuri = actionKassaTuri;
          draft.braklar[index].halQilinganIzoh = `Utsenka bilan sotildi (${formatUzs(price)} UZS): ${actionNotes}`;

          // Kassaga tushum qilish
          if (price > 0) {
            if (!Array.isArray(draft.kassaHarakatlari)) draft.kassaHarakatlari = [];
            if (!draft.kassaBalansi) {
              draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
            }
            draft.kassaBalansi[actionKassaTuri] = (draft.kassaBalansi[actionKassaTuri] || 0) + price;

            draft.kassaHarakatlari.unshift({
              id: `k-utsenka-${generateId()}`,
              sana: today,
              vaqt: now.split(' ')[1] || '12:00',
              tur: 'kirim',
              kategoriya: 'savdo_tushumi',
              summa: price,
              valyuta: 'UZS',
              kurs: draft.valyutaKursi || 12850,
              summaUzs: price,
              kassaTuri: actionKassaTuri,
              kimgaKimdan: `Utsenka sotuv: ${selectedBrakForAction.model} (${selectedBrakForAction.jamiSoni} juft)`,
              izoh: `Nuqsonli tovar arzonlashtirilib sotildi. ${actionNotes}`,
              xodim: currentUser?.ism || 'Admin',
              boglanishId: brakId
            });
          }
        } else if (actionType === 'spisanie') {
          draft.braklar[index].status = 'hisobdan_chiqarildi';
          draft.braklar[index].halQilinganSana = today;
          draft.braklar[index].halQilinganIzoh = `Zararga hisobdan chiqarildi: ${actionNotes}`;
        }

        // Audit Log
        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            `Brak ${actionType} qilindi`,
            'Brak',
            `${selectedBrakForAction.model} (${selectedBrakForAction.jamiSoni} juft) -> ${actionType}`,
            'info'
          )
        );
      })
    );

    toast.success("Brak tovar bo'yicha amal muvaffaqiyatli bajarildi!");
    setIsActionModalOpen(false);
    setSelectedBrakForAction(null);
    setActionNotes('');
    setActionUtsenkaPrice('');
  };

  // EXPORT TO EXCEL
  const handleExportExcel = () => {
    if (activeTab === 'vozvrat') {
      const dataToExport = filteredVozvratlar.map((v, i) => ({
        '№': i + 1,
        'Sana': v.sana,
        'Vaqt': v.vaqt,
        'Ombor': v.ombor === 'tepa' ? 'Tepa Ombor' : 'Kotta Ombor',
        'Model': v.model,
        'O\'lchamlar': Object.entries(v.sizes).map(([sz, qty]) => `${sz}:${qty}`).join(', '),
        'Jami Juft': v.jamiSoni,
        'Mijoz': v.mijoz,
        'Sabab': VOZVRAT_SABABLAR.find(s => s.id === v.sabab)?.label || v.sabab,
        'Holat': v.holat === 'yaroqli' ? 'Yaroqli (Omborga qaytdi)' : 'Brak (Brakka olindi)',
        'Summa (UZS)': v.summa,
        'To\'lov turi': v.tolovQaytarishTuri,
        'Xodim': v.xodim,
        'Izoh': v.izoh || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vozvratlar");
      XLSX.writeFile(wb, `Falak_Vozvratlar_${getTodayStr()}.xlsx`);
      toast.success("Vozvratlar hisoboti Excel faylga yuklab olindi!");
    } else {
      const dataToExport = filteredBraklar.map((b, i) => ({
        '№': i + 1,
        'Sana': b.sana,
        'Ombor': b.ombor === 'tepa' ? 'Tepa Ombor' : 'Kotta Ombor',
        'Model': b.model,
        'O\'lchamlar': Object.entries(b.sizes).map(([sz, qty]) => `${sz}:${qty}`).join(', '),
        'Jami Juft': b.jamiSoni,
        'Manba': b.manba,
        'Nuqson Turi': BRAK_NUQSON_TURLARI.find(n => n.id === b.nuqsonTuri)?.label || b.nuqsonTuri,
        'Status': b.status,
        'Tannarx (UZS)': b.tannarx || 0,
        'Hal qilingan sana': b.halQilinganSana || '-',
        'Utsenka Narxi': b.utsenkaNarxi || '-',
        'Xodim': b.xodim,
        'Izoh': b.izoh || '',
        'Natija': b.halQilinganIzoh || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Braklar");
      XLSX.writeFile(wb, `Falak_Braklar_${getTodayStr()}.xlsx`);
      toast.success("Braklar hisoboti Excel faylga yuklab olindi!");
    }
  };

  // PRINT RECEIPT (Dalolatnoma)
  const handlePrintReceipt = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(receiptRef.current, { 
        quality: 1.0,
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        skipFonts: true,
        cacheBust: true
      });
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 150]
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, 80, 150);
      pdf.save(`Vozvrat_Chek_${selectedVozvratReceipt?.id}.pdf`);
      toast.success("Dalolatnoma cheki yuklandi!");
    } catch (err) {
      window.print();
    }
  };

  // CLEAR ALL VOZVRAT & BRAK (Admin)
  const handleClearAllVozvratBrak = () => {
    if (currentUser?.rol !== 'admin') {
      toast.error("Faqat admin barcha vozvrat va braklarni tozalay oladi!");
      return;
    }

    setDb(produce((draft: DbState) => {
      draft.vozvratlar = [];
      draft.braklar = [];
      if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
      draft.auditLogs.unshift(
        createAuditLog(
          currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
          'Vozvrat va braklar tozalandi',
          'Vozvrat/Brak',
          `Barcha vozvrat va brak tovarlar tarixi to'liq tozalandi`,
          'high'
        )
      );
    }));

    toast.success("Vozvrat va brak ro'yxatlari muvaffaqiyatli tozalandi!");
    setIsClearAllModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">
                Vozvrat & Brak Tovarlar Hisobi
              </h1>
              <p className="text-xs text-[var(--text3)] font-medium">
                Mijozlardan qaytgan tovarlar, nuqsonli mahsulotlar fondi, fabrikaga qaytarish va utsenka boshqaruvi
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {currentUser?.rol === 'admin' && (vozvratList.length > 0 || brakList.length > 0) && (
            <button
              onClick={() => setIsClearAllModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Vozvrat va brak ro'yxatini tozalash"
            >
              <Trash2 className="w-4 h-4" />
              <span>Tarixni tozalash</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--bg2)] hover:bg-[var(--bg3)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Excel Eksport</span>
          </button>

          <button
            onClick={() => setIsBrakModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 transition-all cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Brak Qayd Etish</span>
          </button>

          <button
            onClick={() => setIsVozvratModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-rose-600/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi Vozvrat Qabul Qilish</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Vozvratlar */}
        <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text3)]">Jami Vozvratlar</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--text)]">{metrics.jamiVozvratJuft}</span>
            <span className="text-xs font-medium text-[var(--text3)]">juft</span>
          </div>
          <div className="mt-1 text-xs font-bold text-blue-500">
            {formatUzs(metrics.jamiVozvratSumma)} <span className="text-[10px] text-[var(--text3)]">UZS qiymati</span>
          </div>
        </div>

        {/* Card 2: Ombordagi Brak Fondi */}
        <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text3)]">Ombordagi Braklar</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-500">{metrics.ombordagiBrakJuft}</span>
            <span className="text-xs font-medium text-[var(--text3)]">juft</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[var(--text2)]">
            ≈ {formatUzs(metrics.ombordagiBrakSumma)} <span className="text-[10px] text-[var(--text3)]">tannarxda</span>
          </div>
        </div>

        {/* Card 3: Fabrikaga Yuborilgan */}
        <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text3)]">Fabrikaga Qaytarilgan</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-500">{metrics.fabrikagaYuborilganJuft}</span>
            <span className="text-xs font-medium text-[var(--text3)]">juft</span>
          </div>
          <div className="mt-1 text-xs font-medium text-[var(--text3)]">
            Ishlab chiqaruvchi almashtirishi kutilmoqda
          </div>
        </div>

        {/* Card 4: Utsenka Tushum */}
        <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text3)]">Utsenka Tushumi</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCompact(metrics.utsenkaTushum)}
            </span>
            <span className="text-xs font-medium text-[var(--text3)]">so'm</span>
          </div>
          <div className="mt-1 text-xs font-bold text-emerald-500">
            {formatUzs(metrics.utsenkaTushum)} UZS kassaga tushgan
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2 p-1 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl">
          <button
            onClick={() => setActiveTab('vozvrat')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'vozvrat'
                ? "bg-[var(--bg)] text-rose-500 shadow-sm"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Mijozdan Qaytganlar (Vozvrat)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/15 text-rose-500 font-black">
              {vozvratList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('brak')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'brak'
                ? "bg-[var(--bg)] text-amber-500 shadow-sm"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Brak Ombori & Boshqaruvi</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-500 font-black">
              {metrics.ombordagiBrakJuft} juft
            </span>
          </button>

          <button
            onClick={() => setActiveTab('analitika')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'analitika'
                ? "bg-[var(--bg)] text-blue-500 shadow-sm"
                : "text-[var(--text3)] hover:text-[var(--text)]"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Sifat & Tahlil</span>
          </button>
        </div>

        {/* Global Search & Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              type="text"
              placeholder="Model yoki mijoz qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] placeholder:text-[var(--text3)] focus:border-rose-500 focus:outline-none w-56"
            />
          </div>

          <select
            value={selectedOmborFilter}
            onChange={(e: any) => setSelectedOmborFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:outline-none"
          >
            <option value="all">Barcha Omborlar</option>
            <option value="tepa">Tepa Ombor</option>
            <option value="kotta">Kotta Ombor</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: VOZVRATLAR (CUSTOMER RETURNS) */}
      {/* ========================================================================= */}
      {activeTab === 'vozvrat' && (
        <div className="space-y-4">
          {filteredVozvratlar.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[var(--bg2)] border border-[var(--border)] space-y-3">
              <RotateCcw className="w-12 h-12 text-[var(--text3)] mx-auto opacity-40" />
              <h3 className="text-base font-bold text-[var(--text)]">Hozircha vozvratlar mavjud emas</h3>
              <p className="text-xs text-[var(--text3)] max-w-sm mx-auto">
                Mijozdan qaytgan tovarlarni qayd etish uchun yuqoridagi "Yangi Vozvrat Qabul Qilish" tugmasini bosing.
              </p>
            </div>
          ) : (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Sana & Vaqt</th>
                      <th className="py-3.5 px-4">Ombor</th>
                      <th className="py-3.5 px-4">Model & O'lchamlar</th>
                      <th className="py-3.5 px-4">Mijoz</th>
                      <th className="py-3.5 px-4">Sabab</th>
                      <th className="py-3.5 px-4">Holati</th>
                      <th className="py-3.5 px-4 text-right">Summa & To'lov</th>
                      <th className="py-3.5 px-4 text-center">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredVozvratlar.slice(0, vozvratVisibleCount).map((item, vIdx) => {
                      const reasonObj = VOZVRAT_SABABLAR.find(s => s.id === item.sabab);
                      return (
                        <tr key={`${item.id || 'vozvrat'}_${vIdx}`} className="hover:bg-[var(--bg)]/50 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-[var(--text)]">{item.sana}</div>
                            <div className="text-[10px] text-[var(--text3)]">{item.vaqt} • {item.xodim}</div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[11px] font-bold border",
                              item.ombor === 'tepa' 
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            )}>
                              {item.ombor === 'tepa' ? 'Tepa' : 'Kotta'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-[var(--text)] text-sm">{item.model}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(item.sizes).map(([sz, qty]) => {
                                const num = Number(qty);
                                if (num <= 0) return null;
                                return (
                                  <span key={sz} className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[10px] font-mono text-[var(--text2)]">
                                    {sz}: <strong className="text-[var(--text)]">{num}</strong>
                                  </span>
                                );
                              })}
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black">
                                Jami: {item.jamiSoni} juft
                              </span>
                            </div>
                            {item.izoh && (
                              <p className="text-[11px] text-[var(--text3)] mt-1 italic">"{item.izoh}"</p>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-bold text-[var(--text)] whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-blue-500" />
                              <span>{item.mijoz}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border", reasonObj?.color)}>
                              {reasonObj?.label || item.sabab}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {item.holat === 'yaroqli' ? (
                              <span className="flex items-center gap-1 text-emerald-500 font-bold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Omborga qaytdi</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-rose-500 font-bold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Brakka olindi</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-black text-sm text-[var(--text)]">
                              {formatUzs(item.summa)} UZS
                            </div>
                            <div className="text-[10px] font-medium text-[var(--text3)] capitalize mt-0.5">
                              {item.tolovQaytarishTuri.replace(/_/g, ' ')}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedVozvratReceipt(item)}
                              className="p-2 rounded-xl bg-[var(--bg)] hover:bg-blue-500/15 border border-[var(--border)] hover:border-blue-500/30 text-[var(--text2)] hover:text-blue-500 transition-all cursor-pointer"
                              title="Dalolatnoma / Chekni ko'rish va chop etish"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredVozvratlar.length > vozvratVisibleCount && (
                  <div className="p-3.5 bg-[var(--bg2)]/60 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)]">
                    <span className="font-semibold text-[var(--text3)]">
                      Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(vozvratVisibleCount, filteredVozvratlar.length)}</strong> / {filteredVozvratlar.length} ta vozvrat
                    </span>
                    <button
                      type="button"
                      onClick={() => setVozvratVisibleCount(v => v + 50)}
                      className="px-4 py-1.5 bg-rose-500/15 hover:bg-rose-500 hover:text-white border border-rose-500/30 text-rose-500 font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                    >
                      Yana 50 tasini ko'rsatish ({filteredVozvratlar.length - vozvratVisibleCount} qoldi)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BRAK TOVARLAR OMBORI & BOSHQARUVI */}
      {/* ========================================================================= */}
      {activeTab === 'brak' && (
        <div className="space-y-4">
          {/* Sub-status filter */}
          <div className="flex items-center gap-2 flex-wrap pb-1">
            {[
              { id: 'all', label: 'Barchasi' },
              { id: 'omborda', label: 'Omborda (Mavjud)', color: 'text-amber-500' },
              { id: 'fabrikaga_yuborildi', label: 'Fabrikaga yuborilgan', color: 'text-blue-500' },
              { id: 'utsenka_sotildi', label: 'Utsenka sotilgan', color: 'text-emerald-500' },
              { id: 'hisobdan_chiqarildi', label: 'Hisobdan chiqarilgan', color: 'text-zinc-400' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusFilter(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                  selectedStatusFilter === tab.id
                    ? "bg-[var(--bg2)] border-amber-500 text-amber-500 shadow-xs"
                    : "bg-transparent border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredBraklar.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[var(--bg2)] border border-[var(--border)] space-y-3">
              <ShieldAlert className="w-12 h-12 text-amber-500/40 mx-auto" />
              <h3 className="text-base font-bold text-[var(--text)]">Brak tovarlar mavjud emas</h3>
              <p className="text-xs text-[var(--text3)] max-w-sm mx-auto">
                Brak tovarlarni qo'shish uchun "Brak Qayd Etish" tugmasini bosing yoki mijozdan qaytgan nuqsonli tovarlarni qabul qiling.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBraklar.slice(0, brakVisibleCount).map((brak, bIdx) => {
                const nuqsonObj = BRAK_NUQSON_TURLARI.find(n => n.id === brak.nuqsonTuri);
                const isOmborda = brak.status === 'omborda';

                return (
                  <div
                    key={`${brak.id || 'brak'}_${bIdx}`}
                    className={cn(
                      "p-5 rounded-2xl bg-[var(--bg2)] border transition-all duration-200 flex flex-col justify-between space-y-4",
                      isOmborda ? "border-amber-500/40 shadow-xs" : "border-[var(--border)] opacity-80"
                    )}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                            brak.ombor === 'tepa' ? "bg-purple-500/15 text-purple-600" : "bg-emerald-500/15 text-emerald-600"
                          )}>
                            {brak.ombor === 'tepa' ? 'Tepa Ombor' : 'Kotta Ombor'}
                          </span>
                          <h3 className="text-base font-black text-[var(--text)] mt-1">{brak.model}</h3>
                        </div>

                        {/* Status Badge */}
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-black border",
                          brak.status === 'omborda' && "bg-amber-500/15 text-amber-500 border-amber-500/30",
                          brak.status === 'fabrikaga_yuborildi' && "bg-blue-500/15 text-blue-500 border-blue-500/30",
                          brak.status === 'utsenka_sotildi' && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
                          brak.status === 'hisobdan_chiqarildi' && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                        )}>
                          {brak.status === 'omborda' && 'Omborda'}
                          {brak.status === 'fabrikaga_yuborildi' && 'Fabrikaga ketgan'}
                          {brak.status === 'utsenka_sotildi' && 'Utsenka sotilgan'}
                          {brak.status === 'hisobdan_chiqarildi' && 'Hisobdan chiqqan'}
                        </span>
                      </div>

                      {/* Nuqson details */}
                      <div className="mt-3 p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text3)]">Nuqson turi:</span>
                          <span className="font-bold text-rose-500">{nuqsonObj?.label || brak.nuqsonTuri}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text3)]">Manba:</span>
                          <span className="font-bold text-[var(--text)] capitalize">{brak.manba.replace(/_/g, ' ')}</span>
                        </div>
                        {brak.mijoz && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text3)]">Mijoz:</span>
                            <span className="font-bold text-blue-500">{brak.mijoz}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text3)]">Sana:</span>
                          <span className="font-medium text-[var(--text2)]">{brak.sana}</span>
                        </div>
                      </div>

                      {/* Sizes Distribution */}
                      <div className="mt-3">
                        <div className="text-[11px] font-bold text-[var(--text3)] mb-1">Razmerlar:</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(brak.sizes).map(([sz, qty]) => {
                            const num = Number(qty);
                            if (num <= 0) return null;
                            return (
                              <span key={sz} className="px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text)]">
                                {sz}: <strong className="text-amber-500">{num}</strong>
                              </span>
                            );
                          })}
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-black">
                            Jami: {brak.jamiSoni} juft
                          </span>
                        </div>
                      </div>

                      {brak.izoh && (
                        <p className="text-xs text-[var(--text3)] mt-2 italic">"{brak.izoh}"</p>
                      )}

                      {brak.halQilinganIzoh && (
                        <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {brak.halQilinganIzoh} ({brak.halQilinganSana})
                        </div>
                      )}
                    </div>

                    {/* Action Button if still in warehouse */}
                    {isOmborda && (
                      <div className="pt-2 border-t border-[var(--border)] flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedBrakForAction(brak);
                            setIsActionModalOpen(true);
                          }}
                          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Amal Tanlash (Fabrika / Utsenka)</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {filteredBraklar.length > brakVisibleCount && (
              <div className="p-3.5 bg-[var(--bg2)] rounded-2xl border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)] mt-4">
                <span className="font-semibold text-[var(--text3)]">
                  Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(brakVisibleCount, filteredBraklar.length)}</strong> / {filteredBraklar.length} ta brak tovar
                </span>
                <button
                  type="button"
                  onClick={() => setBrakVisibleCount(v => v + 50)}
                  className="px-4 py-1.5 bg-amber-500/15 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  Yana 50 tasini ko'rsatish ({filteredBraklar.length - brakVisibleCount} qoldi)
                </button>
              </div>
            )}
          </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ANALITIKA & SFAT TAHLILI */}
      {/* ========================================================================= */}
      {activeTab === 'analitika' && (
        <LazyViewport fallbackHeight="420px" placeholderLabel="Vozvrat va sifat tahlillari yuklanmoqda...">
          <Suspense fallback={
            <div className="w-full h-[420px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
            </div>
          }>
            <LazyVozvratBrakAnalyticsCharts analyticsData={analyticsData} />
          </Suspense>
        </LazyViewport>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: YANGI VOZVRAT QABUL QILISH */}
      {/* ========================================================================= */}
      {isVozvratModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsVozvratModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-rose-500/10 sticky top-0 z-10 backdrop-blur-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Mijozdan Vozvrat Qabul Qilish</h3>
                  <p className="text-[11px] text-[var(--text3)]">Qaytgan tovarlarni omborga yoki brak fondiga olish</p>
                </div>
              </div>
              <button 
                onClick={() => setIsVozvratModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVozvrat} className="p-5 space-y-4">
              {/* Ombor tanlash */}
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qabul qilinadigan ombor:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVOmbor('tepa')}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      vOmbor === 'tepa' 
                        ? "bg-purple-500/15 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    Tepa Ombor
                  </button>
                  <button
                    type="button"
                    onClick={() => setVOmbor('kotta')}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      vOmbor === 'kotta' 
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    Kotta Ombor
                  </button>
                </div>
              </div>

              {/* Model Select */}
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Model tanlang:</label>
                <ModelSelect
                  value={vModel}
                  onChange={handleVozvratModelChange}
                  options={allModels}
                  placeholder="Model nomini yozing yoki tanlang..."
                />
              </div>

              {/* Sizes Inputs */}
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">O'lchamlar & Juft soni:</label>
                <SizeInputs
                  model={vModel}
                  ombor={vOmbor}
                  value={vSizes}
                  onChange={handleVozvratSizesChange}
                />
              </div>

              {/* Mijoz tanlash */}
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Mijoz (Kimdan qaytdi) *</label>
                <ClientSearchSelect
                  value={vMijoz}
                  onChange={(name) => setVMijoz(name)}
                  required
                  placeholder="Mijoz ismi yoki do'kon nomini yozing / tanlang..."
                  inputClassName="py-2.5 rounded-xl text-xs font-bold"
                />
              </div>

              {/* Sabab & Holat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qaytarish sababi:</label>
                  <select
                    value={vSabab}
                    onChange={(e: any) => {
                      setVSabab(e.target.value);
                      if (e.target.value === 'brak_nuqsonli') setVHolat('brak');
                    }}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:outline-none"
                  >
                    {VOZVRAT_SABABLAR.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Tovar holati:</label>
                  <select
                    value={vHolat}
                    onChange={(e: any) => setVHolat(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:outline-none"
                  >
                    <option value="yaroqli"> Yaroqli (Ombor qoldig'iga qaytadi)</option>
                    <option value="brak"> Brak / Nuqsonli (Brak fondiga o'tadi)</option>
                  </select>
                </div>
              </div>

              {/* If Brak -> Nuqson turi */}
              {vHolat === 'brak' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                  <label className="text-xs font-black text-rose-600 dark:text-rose-400 block">Nuqson turi:</label>
                  <select
                    value={vNuqsonTuri}
                    onChange={(e: any) => setVNuqsonTuri(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)]"
                  >
                    {BRAK_NUQSON_TURLARI.map(n => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Moliya va Hisob-kitob turi */}
              <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--text2)]">Qaytarilgan tovar summasi (UZS):</label>
                  <span className="text-[10px] text-[var(--text3)]">Katalog narxi bo'yicha</span>
                </div>
                <input
                  type="number"
                  placeholder="0 UZS"
                  value={vSumma}
                  onChange={(e) => setVSumma(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-sm font-mono font-black text-[var(--text)] focus:border-rose-500 focus:outline-none"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--text3)] block mb-1">Hisob-kitob turi:</label>
                    <select
                      value={vTolovTuri}
                      onChange={(e: any) => setVTolovTuri(e.target.value)}
                      className="w-full px-2.5 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)]"
                    >
                      <option value="qarzdan_ayirish">Mijoz qarzidan ayirish</option>
                      <option value="kassa_chiqim">Kassadan pul qaytarish</option>
                      <option value="almashtirish">Boshqa tovar bilan almashish</option>
                      <option value="tolanmadi">To'lanmadi (Nasiya)</option>
                    </select>
                  </div>

                  {vTolovTuri === 'kassa_chiqim' && (
                    <div>
                      <label className="text-[11px] font-bold text-[var(--text3)] block mb-1">Chiqim kassasi:</label>
                      <select
                        value={vKassaTuri}
                        onChange={(e: any) => setVKassaTuri(e.target.value)}
                        className="w-full px-2.5 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)]"
                      >
                        <option value="naqd_uzs">Naqd (So'm)</option>
                        <option value="karta_uzs">Plastik Karta (UZS)</option>
                        <option value="bank_uzs">Bank hisob raqami</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Izoh */}
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qo'shimcha izoh:</label>
                <input
                  type="text"
                  placeholder="Masalan: 41 razmer siqqanligi sababli qaytardi..."
                  value={vIzoh}
                  onChange={(e) => setVIzoh(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)]"
                />
              </div>

              {/* Buttons (Sticky Footer) */}
              <div className="sticky bottom-0 bg-[var(--bg2)] pt-3 pb-1 border-t border-[var(--border)] flex items-center gap-2.5 z-10">
                <button
                  type="button"
                  onClick={() => setIsVozvratModalOpen(false)}
                  className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl hover:bg-[var(--bg3)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md shadow-rose-600/25 cursor-pointer"
                >
                  Qabul qilishni Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: BRAK QAYD ETISH (OMBOR / FABRIKA) */}
      {/* ========================================================================= */}
      {isBrakModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBrakModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-amber-500/10 sticky top-0 z-10 backdrop-blur-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Brak Qayd Etish</h3>
                  <p className="text-[11px] text-[var(--text3)]">Ombordan yoki fabrikadan chiqqan nuqsonli tovarlar</p>
                </div>
              </div>
              <button 
                onClick={() => setIsBrakModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBrakDirect} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Omborni tanlang:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBOmbor('tepa')}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      bOmbor === 'tepa' 
                        ? "bg-purple-500/15 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    Tepa Ombor
                  </button>
                  <button
                    type="button"
                    onClick={() => setBOmbor('kotta')}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      bOmbor === 'kotta' 
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    Kotta Ombor
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Model tanlang:</label>
                <ModelSelect
                  value={bModel}
                  onChange={(val) => {
                    setBModel(val);
                    const cost = db.prices?.[val]?.cost || 90000;
                    setBTannarx(cost);
                  }}
                  options={allModels}
                  placeholder="Nuqsonli model nomi..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">O'lchamlar & Juft soni:</label>
                <SizeInputs
                  model={bModel}
                  ombor={bOmbor}
                  value={bSizes}
                  onChange={setBSizes}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Brak manbasi:</label>
                  <select
                    value={bManba}
                    onChange={(e: any) => setBManba(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:outline-none"
                  >
                    <option value="ombor_aniqlangan">Ombor ichida aniqlangan (Stockdan ayiradi)</option>
                    <option value="fabrika_kirim">Fabrikadan kelganda aniqlangan</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Nuqson turi:</label>
                  <select
                    value={bNuqsonTuri}
                    onChange={(e: any) => setBNuqsonTuri(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:outline-none"
                  >
                    {BRAK_NUQSON_TURLARI.map(n => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Tannarx (Bir juft uchun, UZS):</label>
                <input
                  type="number"
                  placeholder="90000"
                  value={bTannarx}
                  onChange={(e) => setBTannarx(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Izoh & Nuqson ta'rifi:</label>
                <input
                  type="text"
                  placeholder="Masalan: Podoshva yelimida yoriq bor..."
                  value={bIzoh}
                  onChange={(e) => setBIzoh(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)]"
                />
              </div>

              <div className="sticky bottom-0 bg-[var(--bg2)] pt-3 pb-1 border-t border-[var(--border)] flex items-center gap-2.5 z-10">
                <button
                  type="button"
                  onClick={() => setIsBrakModalOpen(false)}
                  className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl hover:bg-[var(--bg3)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-black rounded-xl shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  Brak Fondiga Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BRAKNI HAL QILISH (AMAL BAJARISH) */}
      {/* ========================================================================= */}
      {isActionModalOpen && selectedBrakForAction && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsActionModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sticky top-0 bg-[var(--bg2)] z-10 backdrop-blur-xs">
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Brak tovar bilan amal bajarish</h3>
                <p className="text-xs text-[var(--text3)]">{selectedBrakForAction.model} ({selectedBrakForAction.jamiSoni} juft)</p>
              </div>
              <button 
                onClick={() => setIsActionModalOpen(false)}
                className="text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteBrakAction} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Qilinadigan amal:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setActionType('fabrika')}
                    className={cn(
                      "p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all",
                      actionType === 'fabrika' ? "bg-blue-500/15 border-blue-500 text-blue-500" : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Fabrikaga</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('utsenka')}
                    className={cn(
                      "p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all",
                      actionType === 'utsenka' ? "bg-emerald-500/15 border-emerald-500 text-emerald-500" : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Utsenka (Sotuv)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionType('spisanie')}
                    className={cn(
                      "p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all",
                      actionType === 'spisanie' ? "bg-rose-500/15 border-rose-500 text-rose-500" : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]"
                    )}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Spisanie</span>
                  </button>
                </div>
              </div>

              {actionType === 'utsenka' && (
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5 animate-in fade-in">
                  <div>
                    <label className="text-xs font-bold text-[var(--text2)] block mb-1">Utsenka sotuv summasi (Jami, UZS):</label>
                    <input
                      type="number"
                      required
                      placeholder="Masalan: 70000"
                      value={actionUtsenkaPrice}
                      onChange={(e) => setActionUtsenkaPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-sm font-mono font-black text-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text2)] block mb-1">Tushum kassasi:</label>
                    <select
                      value={actionKassaTuri}
                      onChange={(e: any) => setActionKassaTuri(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)]"
                    >
                      <option value="naqd_uzs">Naqd Kassa (So'm)</option>
                      <option value="karta_uzs">Plastik Karta (UZS)</option>
                      <option value="bank_uzs">Bank hisob raqami</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[var(--text2)] block mb-1.5">Natija izohi:</label>
                <input
                  type="text"
                  placeholder="Masalan: Fabrikaga almashtirish uchun topshirildi..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)]"
                />
              </div>

              <div className="sticky bottom-0 bg-[var(--bg2)] pt-3 pb-1 border-t border-[var(--border)] flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(false)}
                  className="flex-1 py-2.5 bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl cursor-pointer hover:bg-[var(--bg3)]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/25 cursor-pointer"
                >
                  Tasdiqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DALOLATNOMA / RECEIPT CHEK PREVIEW */}
      {/* ========================================================================= */}
      {selectedVozvratReceipt && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedVozvratReceipt(null);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 sticky top-0 bg-[var(--bg2)] z-10 backdrop-blur-xs">
              <h3 className="text-base font-black text-[var(--text)]">Qabul Dalolatnomasi</h3>
              <button 
                onClick={() => setSelectedVozvratReceipt(null)}
                className="text-[var(--text3)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Area */}
            <div ref={receiptRef} className="p-4 bg-white text-black rounded-xl border border-zinc-200 space-y-3 text-xs font-mono">
              <div className="text-center pb-2 border-b border-dashed border-zinc-400">
                <h2 className="text-base font-black tracking-tight">FALAK SHOE</h2>
                <p className="text-[10px] text-zinc-600">VOZVRAT QABUL CHEKI</p>
                <p className="text-[9px] text-zinc-500 mt-0.5">ID: {selectedVozvratReceipt.id}</p>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Sana & Vaqt:</span>
                  <span className="font-bold">{selectedVozvratReceipt.sana} {selectedVozvratReceipt.vaqt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Mijoz:</span>
                  <span className="font-bold">{selectedVozvratReceipt.mijoz}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Ombor:</span>
                  <span className="font-bold">{selectedVozvratReceipt.ombor === 'tepa' ? 'Tepa' : 'Kotta'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Xodim:</span>
                  <span className="font-bold">{selectedVozvratReceipt.xodim}</span>
                </div>
              </div>

              <div className="border-t border-b border-dashed border-zinc-400 py-2 space-y-1">
                <div className="font-bold">{selectedVozvratReceipt.model}</div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {Object.entries(selectedVozvratReceipt.sizes).map(([sz, qty]) => {
                    const num = Number(qty);
                    if (num <= 0) return null;
                    return <span key={sz} className="border border-zinc-300 px-1 rounded">{sz}:{num}</span>;
                  })}
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span>Jami miqdor:</span>
                  <span className="font-bold">{selectedVozvratReceipt.jamiSoni} juft</span>
                </div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Qaytarilgan summa:</span>
                  <span className="font-bold text-sm">{formatUzs(selectedVozvratReceipt.summa)} UZS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">To'lov holati:</span>
                  <span className="font-bold capitalize">{selectedVozvratReceipt.tolovQaytarishTuri.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Tovar holati:</span>
                  <span className="font-bold">{selectedVozvratReceipt.holat === 'yaroqli' ? 'Yaroqli' : 'Brak'}</span>
                </div>
              </div>

              {selectedVozvratReceipt.izoh && (
                <div className="text-[10px] text-zinc-600 italic border-t border-zinc-200 pt-1">
                  "{selectedVozvratReceipt.izoh}"
                </div>
              )}

              <div className="text-center pt-2 border-t border-dashed border-zinc-400 text-[9px] text-zinc-500">
                Imzo: ___________________
              </div>
            </div>

            <div className="sticky bottom-0 bg-[var(--bg2)] pt-3 pb-1 border-t border-[var(--border)] flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>PDF / Chop etish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL CONFIRMATION MODAL */}
      {isClearAllModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsClearAllModalOpen(false);
          }}
        >
          <div 
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Tarixni tozalash</h3>
                <p className="text-xs text-[var(--text3)]">Barcha vozvrat va brak ro'yxatlari</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium leading-relaxed">
              Diqqat! Barcha <b>Vozvratlar ({vozvratList.length} ta)</b> va <b>Braklar ({brakList.length} ta)</b> yozuvlari butunlay o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi.
            </div>

            <div className="sticky bottom-0 bg-[var(--bg2)] pt-3 pb-1 border-t border-[var(--border)] flex items-center justify-end gap-3 z-10">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleClearAllVozvratBrak}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tozalashni tasdiqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
