import React, { useState, useMemo } from 'react';
import AktSverka from './AktSverka';
import { X, User, Phone, MapPin, Tag, Calendar, ShoppingBag, ArrowUpRight, ArrowDownRight, Activity, BarChart2, FileSpreadsheet, ListOrdered, TrendingDown, TrendingUp, Wallet, Banknote, Search, Printer, Maximize2, Minimize2, ChevronDown, ChevronUp, AlertTriangle, Edit3, Send, Check, ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Kontragent, Transaction } from '../types';
import { exportToExcel } from '../lib/exportUtils';
import { cn, formatCompact, formatUzs, generateId, getTodayStr, getNowStr, isCorrectionTx, formatPhoneNumber } from '../lib/utils';
import { useDb } from '../context/DbContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export default function KontragentAnaliz({ kontragent, db, onClose }: { kontragent: Kontragent, db: any, onClose: () => void }) {
  const { setDb, currentOmbor, currentUser } = useDb();
  const isOmborchi = currentUser?.rol === 'omborchi';
  const [activeTab, setActiveTab] = useState<'umumiy' | 'statistika' | 'tarix' | 'hujjatlar'>('umumiy');
  const [searchTx, setSearchTx] = useState('');
  const [filterAmal, setFilterAmal] = useState<'all' | 'kirim' | 'chiqim'>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [showPayment, setShowPayment] = useState(false);
  const [showAktSverka, setShowAktSverka] = useState(false);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  
  // Limit o'rnatish uchun
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const currentKontragentInitial = db.kontragentlar?.find((k: Kontragent) => k.id === kontragent.id) || kontragent;
  const [limitAmount, setLimitAmount] = useState<number | ''>(currentKontragentInitial.kreditLimiti || '');

  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const toggleDate = (dateStr: string) => {
    setExpandedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  // Mijozning eng so'nggi ma'lumotlari
  const currentKontragent = db.kontragentlar?.find((k: Kontragent) => k.id === kontragent.id) || kontragent;

  const allTxs = useMemo(() => {
    const normalizeMatch = (str?: string) => (str || '').toLowerCase().replace(/\s+/g, '');
    const clientKey = normalizeMatch(currentKontragent.ism);

    const warehouseTxs = [
      ...(db.tepa?.transactions || []),
      ...(db.kotta?.transactions || []),
      ...(db.sort2?.transactions || [])
    ];

    const existingTxIds = new Set(warehouseTxs.map(t => t.id));
    const existingKassaIds = new Set(warehouseTxs.map(t => t.kassaId).filter(Boolean));

    const kassaPaymentsAsTxs: Transaction[] = (db.kassaHarakatlari || [])
      .filter(k => k.tur === 'kirim' && (k.kategoriya === 'savdo_tushumi' || k.kategoriya === 'qarz_tolovi' || !k.kategoriya))
      .filter(k => !existingTxIds.has(k.id) && !existingKassaIds.has(k.id))
      .map(k => {
        const kassaLabel = k.kassaTuri === 'naqd_uzs' ? 'Naqd' : k.kassaTuri === 'naqd_usd' ? 'USD' : k.kassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';
        return {
          id: k.id,
          kassaId: k.id,
          sana: k.sana || '',
          vaqt: k.vaqt || '',
          amal: 'tolov' as const,
          model: `To'lov (${kassaLabel})`,
          olcham: k.valyuta === 'USD' ? 'USD' : 'UZS',
          soni: 0,
          summa: Number(k.summaUzs || k.summa || 0),
          kimdan: k.kimgaKimdan || 'Mijoz',
          izoh: k.izoh || (k.boglanishId ? `Faktura #${k.boglanishId.slice(-6)} to'lovi` : "Kassaga to'lov"),
          xodim: k.xodim || 'Admin',
          ombor: 'tepa' as const,
          groupId: k.boglanishId || k.id,
          foyda: 0
        };
      });

    return [...warehouseTxs, ...kassaPaymentsAsTxs]
      .filter((t: Transaction) => {
        if (isCorrectionTx(t)) return false;
        if (!clientKey) return false;
        const txKimdanKey = normalizeMatch(t.kimdan);
        const txIzohKey = normalizeMatch(t.izoh);
        return (
          t.kimdan === currentKontragent.ism ||
          t.izoh?.includes(currentKontragent.ism) ||
          txKimdanKey === clientKey ||
          (txKimdanKey.length > 3 && clientKey.includes(txKimdanKey)) ||
          (txIzohKey.length > 3 && txIzohKey.includes(clientKey))
        );
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.sana}T${a.vaqt || '00:00'}`);
        const dateB = new Date(`${b.sana}T${b.vaqt || '00:00'}`);
        return dateB.getTime() - dateA.getTime();
      });
  }, [db, currentKontragent.ism]);

  const chiqimTxs = allTxs.filter(t => t.amal === 'chiqim');
  const kirimTxs = allTxs.filter(t => t.amal === 'kirim');

  // Moliya va Qoldiq hisoblari
  const jamiSotilgan = chiqimTxs.reduce((a, t) => a + t.soni, 0);
  const jamiSumma = chiqimTxs.reduce((a, t) => a + (t.summa || 0), 0);
  
  const jamiQaytarilgan = kirimTxs.reduce((a, t) => a + t.soni, 0);
  const vozvratSumma = kirimTxs.reduce((a, t) => a + (t.summa || 0), 0);
  
  const sofSotilgan = jamiSotilgan - jamiQaytarilgan;
  const sofSumma = jamiSumma - vozvratSumma;

  const chartDataOylar = useMemo(() => {
    const oylar = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const data: Record<string, number> = {};
    chiqimTxs.forEach(t => {
      const parts = t.sana.split('-');
      if (parts.length === 3) {
        const oyIdx = parseInt(parts[1]) - 1;
        const oy = oylar[oyIdx];
        data[oy] = (data[oy] || 0) + t.soni;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [chiqimTxs]);

  const topModels = useMemo(() => {
    const data: Record<string, number> = {};
    chiqimTxs.forEach(t => {
      data[t.model] = (data[t.model] || 0) + t.soni;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [chiqimTxs]);

  const heatmapSizes = useMemo(() => {
    const data: Record<string, number> = {};
    let maxCount = 0;
    chiqimTxs.forEach(t => {
      const size = t.olcham.toString();
      data[size] = (data[size] || 0) + t.soni;
      if (data[size] > maxCount) maxCount = data[size];
    });
    
    // Default range 39-45, expand if data has other sizes
    const sizesNum = Object.keys(data).map(Number).filter(n => !isNaN(n));
    const minSize = sizesNum.length > 0 ? Math.min(...sizesNum, 39) : 39;
    const maxSize = sizesNum.length > 0 ? Math.max(...sizesNum, 45) : 45;
    
    const result = [];
    for (let s = minSize; s <= maxSize; s++) {
      const count = data[s.toString()] || 0;
      const intensity = maxCount > 0 ? count / maxCount : 0;
      result.push({ size: s.toString(), count, intensity });
    }
    return { data: result, maxCount };
  }, [chiqimTxs]);

  const filteredTransactions = allTxs.filter(t => {
    const matchAmal = filterAmal === 'all' || t.amal === filterAmal;
    const matchSearch = !searchTx || 
      t.model.toLowerCase().includes(searchTx.toLowerCase()) || 
      t.olcham.toString().includes(searchTx);
    return matchAmal && matchSearch;
  });

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    filteredTransactions.forEach(t => {
      if (!groups[t.sana]) groups[t.sana] = [];
      groups[t.sana].push(t);
    });

    const today = getTodayStr();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    return Object.entries(groups)
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .map(([sana, txs]) => {
        let label = sana;
        if (sana === today) label = 'Bugun';
        else if (sana === yesterday) label = 'Kecha';
        else {
          const d = new Date(sana);
          if (!isNaN(d.getTime())) {
            label = d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
          }
        }

        const jamiSoni = txs.reduce((sum, t) => sum + (t.amal === 'chiqim' ? t.soni : (t.amal === 'kirim' ? -t.soni : 0)), 0);
        const jamiSumma = txs.reduce((sum, t) => sum + (t.amal === 'chiqim' ? (t.summa || 0) : (t.amal === 'kirim' ? -(t.summa || 0) : 0)), 0);

        return {
          sana,
          label,
          transactions: txs,
          jamiSoni,
          jamiSumma
        };
      });
  }, [filteredTransactions]);

  const handleExportTx = () => {
    const headers = ['ID', 'Sana', 'Vaqt', 'Amal', 'Model', "O'lcham", 'Soni', 'Summa (UZS)', 'Xodim'];
    const rows = filteredTransactions.map(t => [
      t.id.slice(0,6), t.sana, t.vaqt, 
      t.amal === 'chiqim' ? 'Xarid qildi' : 'Qaytardi', 
      t.model, t.olcham, t.soni, t.summa || 0, t.xodim
    ]);
    exportToExcel([headers, ...rows], `Mijoz_Tarix_${currentKontragent.ism}`, `Tarix - ${currentKontragent.ism}`);
  };

  const handleSaveLimit = () => {
    if (isOmborchi) {
      toast.error("Omborchi roliga kredit limitini o'zgartirish ruxsati berilmagan!");
      return;
    }
    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const idx = draft.kontragentlar.findIndex((k: any) => k.id === currentKontragent.id);
      if (idx !== -1) {
        draft.kontragentlar[idx].kreditLimiti = limitAmount === '' ? undefined : Number(limitAmount);
      }
      return draft;
    });
    setIsEditingLimit(false);
    toast.success("Kredit limiti muvaffaqiyatli saqlandi!");
  };

  const handleSendTelegramAktSverka = () => {
    const totalXaridSoni = allTxs.filter(t => t.amal === 'chiqim').reduce((a, t) => a + t.soni, 0);
    const totalXaridSumma = allTxs.filter(t => t.amal === 'chiqim').reduce((a, t) => a + (t.summa || 0), 0);
    const totalTolov = allTxs.filter(t => t.amal === 'tolov').reduce((a, t) => a + (t.summa || 0), 0);
    const balans = currentKontragent.balans || 0;

    const message = `📄 *Akt-Sverka (Solishtirma dalolatnoma)*
👤 *Mijoz:* ${currentKontragent.ism}
📅 *Sana:* ${getTodayStr()}

📈 *Umumiy xaridlar:* ${totalXaridSoni} juft (${formatCompact(totalXaridSumma)} UZS)
💰 *Qilingan to'lovlar:* ${formatCompact(totalTolov)} UZS
-------------------
📊 *Hozirgi qoldiq:* ${balans > 0 ? `Qarzdorlik ${formatCompact(balans)} UZS` : balans < 0 ? `Haqdorlik ${formatCompact(Math.abs(balans))} UZS` : '0 UZS'}

_Xaridlar tarixi va to'lovlar bo'yicha batafsil ma'lumotni ushbu raqam orqali olishingiz mumkin._`;

    // URI format and opening telegram
    const encodedMessage = encodeURIComponent(message);
    let tel = currentKontragent.tel || '';
    // Format if needed
    if (tel.startsWith('+')) {
      tel = tel.replace(/\+/g, '');
    }
    
    // Fallback to t.me share link
    window.open(`https://t.me/share/url?url=&text=${encodedMessage}`, '_blank');
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOmborchi) {
      toast.error("Omborchi roliga to'lov qabul qilish ruxsati berilmagan!");
      return;
    }
    const amount = Number(payAmount);
    if (!payAmount || isNaN(amount) || amount <= 0) {
      toast.error("To'lov miqdori noto'g'ri kiritildi!");
      return;
    }

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const idx = draft.kontragentlar.findIndex((k: any) => k.id === currentKontragent.id);
      if (idx !== -1) {
        draft.kontragentlar[idx].balans = (draft.kontragentlar[idx].balans || 0) - Number(payAmount);
      }
      
      const newTx = {
        id: generateId(),
        vaqt: getNowStr(),
        sana: getTodayStr(),
        amal: 'tolov' as const,
        model: "To'lov",
        olcham: "-",
        soni: 0,
        kimdan: currentKontragent.ism,
        izoh: "Qarz to'lovi",
        xodim: currentUser?.ism || "Noma'lum",
        summa: Number(payAmount),
        foyda: 0
      };
      
      if (!draft[currentOmbor].transactions) {
        draft[currentOmbor].transactions = [];
      }
      draft[currentOmbor].transactions.push(newTx);

      return draft;
    });

    toast.success(`${Number(payAmount).toLocaleString()} UZS to'lov qabul qilindi`);
    setPayAmount('');
    setShowPayment(false);
  };

  return (
    <div className="w-full bg-[var(--bg2)] flex flex-col rounded-3xl border border-[var(--border)] shadow-sm mb-8">
      {/* HEADER */}
      <div className="bg-[var(--bg)] border-b border-[var(--border)] p-5 sm:p-6 sm:px-8 shrink-0 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg2)] hover:bg-[#8b5cf6]/10 hover:text-[#8b5cf6] text-[var(--text)] rounded-xl transition-colors cursor-pointer font-bold text-[14px]"
          >
            <ArrowLeft size={18} /> Orqaga
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-purple-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-purple-500/30 shrink-0 relative">
              {currentKontragent.ism.slice(0,2).toUpperCase()}
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[var(--bg)] flex items-center justify-center text-[10px] text-white shadow" title="Faol mijoz">✓</span>
            </div>
            <div className="flex flex-col gap-2 flex-1 pr-16 md:pr-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight leading-none">
                  {currentKontragent.ism}
                </h2>
                
                {jamiSotilgan > 50 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    ⭐ VIP Doimiy
                  </span>
                ) : (currentKontragent.balans || 0) > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    ⚠️ Qarzi bor
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    🟢 Ishonchli
                  </span>
                )}

                {currentKontragent.kategoriya && (
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${currentKontragent.kategoriya === 'Ulgurji' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'}`}>
                    {currentKontragent.kategoriya}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[12px] sm:text-[13px] font-semibold text-[var(--text3)]">
                {currentKontragent.tel && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-bold text-[var(--text)] tracking-wide"><Phone size={14} className="text-[#8b5cf6]" /> {formatPhoneNumber(currentKontragent.tel)}</span>
                    <div className="flex items-center gap-1.5 ml-1">
                      <a 
                        href={`tel:${currentKontragent.tel.replace(/[^\d+]/g, '')}`} 
                        className="px-2 py-0.5 bg-[#8b5cf6]/10 hover:bg-[#8b5cf6] hover:text-white text-[#8b5cf6] rounded-md text-[11px] font-bold transition-all flex items-center gap-1"
                        title="Qo'ng'iroq qilish"
                      >
                        <Phone size={11} /> Qo'ng'iroq
                      </a>
                      <a 
                        href={`https://t.me/${currentKontragent.tel.replace(/[^\d+]/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500 hover:text-white text-sky-500 rounded-md text-[11px] font-bold transition-all flex items-center gap-1"
                        title="Telegram orqali yozish"
                      >
                        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.012-1.252-.242-1.865-.442-.752-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.119.098.152.228.163.331.01.102.024.331.01.508z"/></svg>
                        Telegram
                      </a>
                    </div>
                  </div>
                )}
                {currentKontragent.viloyat && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[12px] font-bold border border-blue-500/20">
                    <MapPin size={13} className="text-blue-500" /> {currentKontragent.viloyat}
                  </span>
                )}
                {currentKontragent.manzil && <span className="flex items-center gap-1.5"><MapPin size={14} className="text-amber-500" /> {currentKontragent.manzil}</span>}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            <div className={cn(
              "border px-5 py-3.5 rounded-2xl flex-1 flex justify-between items-center transition-all shadow-xs",
              (currentKontragent.balans || 0) > 0 
                ? "bg-rose-500/5 border-rose-500/30 text-rose-600 dark:text-rose-400" 
                : (currentKontragent.balans || 0) < 0 
                ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text)]"
            )}>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text3)] flex items-center gap-1">
                  <Wallet size={12} /> Hozirgi Balans / Qoldiq
                </span>
                <span className="text-[11px] font-medium opacity-80 mt-0.5">
                  {(currentKontragent.balans || 0) > 0 ? "⚠️ Qarzdorlik mavjud (Muddati: 14 kun)" : (currentKontragent.balans || 0) < 0 ? "🟢 Ortiqcha qoldiq (Avans)" : "Balans teng"}
                </span>
              </div>
              <span className="text-[17px] font-black tabular-nums">
                {(currentKontragent.balans || 0) > 0 ? '-' : (currentKontragent.balans || 0) < 0 ? '+' : ''}
                <span title={`${formatUzs(Math.abs(currentKontragent.balans || 0))} UZS`}>{formatCompact(Math.abs(currentKontragent.balans || 0))} UZS</span>
              </span>
            </div>
            
            {!isOmborchi && (
              <button 
                onClick={() => setShowPayment(true)}
                className="px-5 py-3 sm:py-0 sm:h-12 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
              >
                <Wallet size={18} /> To'lov Qabul Qilish
              </button>
            )}
            <button 
              onClick={() => setShowAktSverka(true)}
              className="px-5 py-3 sm:py-0 sm:h-12 bg-blue-500 text-white hover:bg-blue-600 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
            >
              <Printer size={18} /> Akt-Sverka
            </button>
          </div>

          {/* Kredit Limiti Block */}
          <div className="mt-4 flex flex-col gap-2">
            {!isEditingLimit ? (
              <div className={cn(
                "border px-5 py-4 rounded-2xl flex items-center justify-between transition-all",
                (currentKontragent.kreditLimiti && (currentKontragent.balans || 0) > currentKontragent.kreditLimiti)
                  ? "bg-rose-500/10 border-rose-500/40" 
                  : "bg-[var(--bg2)] border-[var(--border)]"
              )}>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                    (currentKontragent.kreditLimiti && (currentKontragent.balans || 0) > currentKontragent.kreditLimiti)
                      ? "bg-rose-500 text-white"
                      : "bg-[#8b5cf6]/10 text-[#8b5cf6]"
                  )}>
                    {currentKontragent.kreditLimiti && (currentKontragent.balans || 0) > currentKontragent.kreditLimiti 
                      ? <AlertTriangle size={20} /> 
                      : <Activity size={20} />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Kredit Limiti</span>
                    {currentKontragent.kreditLimiti ? (
                      <span className={cn(
                        "text-[15px] font-black",
                        ((currentKontragent.balans || 0) > currentKontragent.kreditLimiti) ? "text-rose-500" : "text-[var(--text)]"
                      )}>
                        {formatCompact(currentKontragent.kreditLimiti)} UZS
                        {((currentKontragent.balans || 0) > currentKontragent.kreditLimiti) && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-600 px-2 py-0.5 rounded shadow-sm border border-rose-500/30">Limit oshgan!</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[13px] font-bold text-[var(--text3)]">Cheklanmagan (Limit yo'q)</span>
                    )}
                  </div>
                </div>
                
                {!isOmborchi && (
                  <button 
                    onClick={() => setIsEditingLimit(true)}
                    className="p-2.5 text-[var(--text3)] hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 rounded-xl transition-colors cursor-pointer"
                    title="Limitni o'zgartirish"
                  >
                    <Edit3 size={18} />
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-[#8b5cf6]/50 bg-[#8b5cf6]/5 px-5 py-4 rounded-2xl flex flex-col sm:flex-row gap-3 items-center transition-all shadow-sm">
                <div className="flex-1 w-full relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] font-black text-[13px]">UZS</span>
                  <input 
                    type="number" 
                    value={limitAmount}
                    onChange={(e) => setLimitAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Masalan: 50000000"
                    className="w-full bg-[var(--bg)] border border-[#8b5cf6]/30 rounded-xl py-2.5 pl-14 pr-4 text-[14px] font-black text-[var(--text)] outline-none focus:border-[#8b5cf6] shadow-inner"
                  />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => {
                      setIsEditingLimit(false);
                      setLimitAmount(currentKontragent.kreditLimiti || '');
                    }}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-[13px] font-bold text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    Bekor qilish
                  </button>
                  <button 
                    onClick={handleSaveLimit}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[#8b5cf6] text-white rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#8b5cf6]/25 hover:bg-[#7c3aed] transition-colors cursor-pointer"
                  >
                    <Check size={16} /> Saqlash
                  </button>
                </div>
              </div>
            )}
            
            {/* Progress bar agar limit bo'lsa */}
            {currentKontragent.kreditLimiti && !isEditingLimit && (
              <div className="w-full h-2 bg-[var(--bg2)] rounded-full overflow-hidden border border-[var(--border)] p-0.5 mt-1">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    ((currentKontragent.balans || 0) > currentKontragent.kreditLimiti) ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, ((currentKontragent.balans || 0) / currentKontragent.kreditLimiti) * 100))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* AKT-SVERKA MODAL */}
        {showAktSverka && (
          <AktSverka kontragent={currentKontragent} allTxs={allTxs} onClose={() => setShowAktSverka(false)} />
        )}

        {/* PAYMENT MODAL (OVERLAY) */}
        {showPayment && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-[400px] rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-[18px] flex items-center gap-2">
                  <span className="bg-emerald-500/10 text-emerald-500 p-2 rounded-xl"><Banknote size={20} /></span>
                  To'lov qabul qilish
                </h3>
                <button onClick={() => setShowPayment(false)} className="p-2 bg-[var(--bg2)] text-[var(--text3)] hover:text-rose-500 rounded-xl cursor-pointer">
                  <X size={18}/>
                </button>
              </div>
              <form onSubmit={handlePayment} className="flex flex-col gap-4">
                <div>
                  <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2 block">To'lov Summasi (UZS)</label>
                  <input 
                    type="number"
                    autoFocus
                    required
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value ? Number(e.target.value) : '')}
                    className="w-full p-4 border border-[var(--border)] rounded-xl bg-[var(--bg2)] text-xl font-black text-emerald-500 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                    placeholder="Masalan: 500000"
                  />
                </div>
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setShowPayment(false)} className="flex-1 py-3.5 rounded-xl font-bold bg-[var(--bg2)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer">Bekor qilish</button>
                  <button type="submit" className="flex-1 py-3.5 rounded-xl font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/20 cursor-pointer">Tasdiqlash</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="px-4 sm:px-6 pt-4 border-b border-[var(--border)] bg-[var(--bg2)] shrink-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-6 w-max">
            {[
              { id: 'umumiy', label: 'Umumiy' },
              { id: 'statistika', label: 'Statistika' },
              { id: 'tarix', label: `Tarix (${allTxs.length} ta operatsiya)` },
              { id: 'hujjatlar', label: 'Hujjatlar (Akt-sverka)' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "pb-3 text-[13px] font-bold uppercase tracking-wider transition-colors relative cursor-pointer",
                  activeTab === tab.id ? "text-[#8b5cf6]" : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8b5cf6] rounded-t-full shadow-[0_-2px_8px_rgba(139,92,246,0.5)]"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 p-4 sm:p-6 bg-[var(--bg2)] rounded-b-3xl">
          
          {/* TAB: UMUMIY */}
          {activeTab === 'umumiy' && (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* VOZVRAT KOEFFITSIYENTI INDIKATORI */}
              <div className="bg-[var(--bg)] p-5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                    <Activity size={14} className="text-amber-500" /> Vozvrat Darajasi Koeffitsiyenti
                  </span>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider",
                    (jamiSotilgan > 0 ? (jamiQaytarilgan / jamiSotilgan) * 100 : 0) <= 3 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  )}>
                    {((jamiSotilgan > 0 ? (jamiQaytarilgan / jamiSotilgan) * 100 : 0) <= 3) ? "✨ A'lo daraja" : "⚡ O'rtacha"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-black text-[var(--text)] tabular-nums">
                    {jamiSotilgan > 0 ? ((jamiQaytarilgan / jamiSotilgan) * 100).toFixed(1) : '0'}%
                  </div>
                  <div className="text-xs text-[var(--text3)] font-semibold">
                    {jamiQaytarilgan} ta qaytgan / {jamiSotilgan} ta jami olingan
                  </div>
                </div>
                <div className="w-full h-2.5 bg-[var(--bg2)] rounded-full overflow-hidden p-0.5 border border-[var(--border)]">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      (jamiSotilgan > 0 ? (jamiQaytarilgan / jamiSotilgan) * 100 : 0) <= 3 ? "bg-emerald-500" : "bg-amber-500"
                    )}
                    style={{ width: `${Math.min(100, jamiSotilgan > 0 ? (jamiQaytarilgan / jamiSotilgan) * 100 : 0)}%` }}
                  />
                </div>
              </div>

              <div className={cn("grid grid-cols-1 gap-4", isExpanded ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                <div className="bg-[var(--bg)] p-6 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform"><ShoppingBag size={100} /></div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] flex items-center gap-2"><ArrowUpRight size={14} className="text-[#8b5cf6]" /> Jami Olingan Mol</div>
                  <div className="text-2xl font-black text-[var(--text)] tabular-nums">{jamiSotilgan.toLocaleString()} <span className="text-sm font-semibold text-[var(--text3)]">juft</span></div>
                  {jamiSumma > 0 && <div className="text-[13px] font-bold text-[#8b5cf6] mt-1"><span title={`${formatUzs(jamiSumma)} UZS`}>{formatCompact(jamiSumma)} UZS</span></div>}
                </div>
                
                <div className="bg-[var(--bg)] p-6 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform"><ArrowDownRight size={100} /></div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] flex items-center gap-2"><ArrowDownRight size={14} className="text-amber-500" /> Qaytarilgan Mol (Vozvrat)</div>
                  <div className="text-2xl font-black text-[var(--text)] tabular-nums">{jamiQaytarilgan.toLocaleString()} <span className="text-sm font-semibold text-[var(--text3)]">juft</span></div>
                  {vozvratSumma > 0 && <div className="text-[13px] font-bold text-amber-500 mt-1"><span title={`${formatUzs(vozvratSumma)} UZS`}>{formatCompact(vozvratSumma)} UZS</span></div>}
                </div>

                <div className={cn("bg-[var(--bg)] p-6 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent flex flex-col gap-2", isExpanded ? "sm:col-span-1" : "sm:col-span-2")}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Sof Xaridlar (Vozvratsiz)</div>
                  <div className="text-3xl font-black text-[var(--text)] tabular-nums flex items-baseline gap-2">
                    {sofSotilgan.toLocaleString()} <span className="text-sm font-semibold text-[var(--text3)]">juft</span>
                  </div>
                  {sofSumma > 0 && <div className="text-[15px] font-black text-emerald-500 mt-1"><span title={`${formatUzs(sofSumma)} UZS`}>{formatCompact(sofSumma)} UZS</span></div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--bg)] p-5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent">
                  <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] mb-2">Tranzaksiyalar</div>
                  <div className="text-xl font-black text-[var(--text)]">{chiqimTxs.length + kirimTxs.length} ta</div>
                </div>
                <div className="bg-[var(--bg)] p-5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent">
                  <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--text3)] mb-2">O'rtacha Chek</div>
                  <div className="text-xl font-black text-[#8b5cf6]">
                    {chiqimTxs.length ? Math.round(jamiSotilgan / chiqimTxs.length).toLocaleString() : 0} juft
                  </div>
                </div>
              </div>
              
              {currentKontragent.izoh && (
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl text-[13px] text-amber-600/90 flex gap-3">
                  <Tag size={16} className="shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{currentKontragent.izoh}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: STATISTIKA */}
          {activeTab === 'statistika' && (
            <div className={cn("grid gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300", isExpanded ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
              {/* Oylar Chart */}
              <div className="bg-[var(--bg)] rounded-2xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent">
                <h3 className="font-bold text-[var(--text)] mb-6 text-[14px] sm:text-[15px] flex items-center gap-2">📈 Oylar bo'yicha xarid (Juft)</h3>
                {chartDataOylar.length === 0 ? (
                  <div className="text-center text-[var(--text3)] text-sm py-12 flex flex-col items-center gap-3">
                    <BarChart2 size={32} className="opacity-20" />
                    Ma'lumot yetarli emas
                  </div>
                ) : (
                  <div className="h-[220px] sm:h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataOylar} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text3)' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                        <Tooltip 
                          cursor={{ fill: 'var(--bg2)' }}
                          contentStyle={{ backgroundColor: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelStyle={{ color: 'var(--text3)', fontWeight: 'bold', marginBottom: '4px' }}
                          itemStyle={{ color: '#8b5cf6', fontWeight: '900' }}
                        />
                        <Bar dataKey="value" name="Sotilgan juft" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Vizual Analitika va O'lchamlar Taqsimoti */}
              <div className="flex flex-col gap-6">
                {/* Top-5 Modellar */}
                <div className="bg-[var(--bg)] rounded-2xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent">
                  <h3 className="font-bold text-[var(--text)] mb-5 text-[14px] sm:text-[15px] flex items-center gap-2">⭐ Top-5 Xarid qilingan Modellar</h3>
                  {topModels.length === 0 ? (
                    <div className="text-center text-[var(--text3)] text-sm py-8 flex flex-col items-center gap-3">
                      <ShoppingBag size={24} className="opacity-20" />
                      Ma'lumot yetarli emas
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {topModels.map((model, index) => (
                        <div key={model.name} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] transition-colors hover:border-[#8b5cf6]/30">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm",
                              index === 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                              index === 1 ? "bg-slate-400/15 text-slate-500 dark:text-slate-300" :
                              index === 2 ? "bg-amber-700/15 text-amber-700 dark:text-amber-500" :
                              "bg-[var(--bg)] text-[var(--text3)]"
                            )}>
                              {index + 1}
                            </div>
                            <span className="font-bold text-[14px] text-[var(--text)]">{model.name}</span>
                          </div>
                          <div className="font-black text-[#8b5cf6]">{model.value} <span className="text-[11px] text-[var(--text3)] font-semibold">juft</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* O'lchamlar Matritsasi (Heatmap) */}
                <div className="bg-[var(--bg)] rounded-2xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-transparent">
                  <h3 className="font-bold text-[var(--text)] mb-5 text-[14px] sm:text-[15px] flex items-center gap-2">📏 O'lchamlar Matritsasi</h3>
                  {heatmapSizes.data.length === 0 ? (
                    <div className="text-center text-[var(--text3)] text-sm py-8 flex flex-col items-center gap-3">
                      <Activity size={24} className="opacity-20" />
                      Ma'lumot yetarli emas
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                      {heatmapSizes.data.map(item => (
                        <div 
                          key={item.size}
                          className="relative flex flex-col items-center justify-center p-3 rounded-xl border border-[var(--border)] overflow-hidden transition-all hover:scale-105"
                          style={{
                            backgroundColor: item.intensity > 0 ? `rgba(139, 92, 246, ${item.intensity * 0.8 + 0.1})` : 'var(--bg2)'
                          }}
                        >
                          <span className={cn(
                            "text-[15px] font-black z-10", 
                            item.intensity > 0.4 ? "text-white" : "text-[var(--text)]"
                          )}>
                            {item.size}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold mt-1 z-10",
                            item.intensity > 0.4 ? "text-white/90" : "text-[var(--text3)]"
                          )}>
                            {item.count} ta
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TARIX */}
          {activeTab === 'tarix' && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-[var(--bg)] p-2 rounded-xl border border-[var(--border)]">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  <input 
                    type="text" 
                    placeholder="Model yoki o'lcham..."
                    value={searchTx}
                    onChange={(e) => setSearchTx(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 sm:py-2.5 bg-transparent text-[13px] outline-none text-[var(--text)] transition-colors placeholder-[var(--text3)]"
                  />
                </div>
                <div className="w-full h-[1px] sm:w-[1px] sm:h-auto bg-[var(--border)] my-0 sm:my-1"></div>
                <select 
                  value={filterAmal}
                  onChange={(e) => setFilterAmal(e.target.value as any)}
                  className="px-3 py-2 sm:py-2.5 bg-transparent text-[13px] outline-none text-[var(--text)] cursor-pointer font-medium w-full sm:w-auto"
                >
                  <option value="all">Barcha amallar</option>
                  <option value="chiqim">Faqat xaridlar</option>
                  <option value="kirim">Faqat vozvratlar</option>
                </select>
                <button 
                  onClick={handleExportTx}
                  className="px-4 py-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 transition-colors w-full sm:w-auto cursor-pointer"
                >
                  <FileSpreadsheet size={16} /> Excel
                </button>
              </div>

              <div className="space-y-4 pb-8">
                {groupedTransactions.length === 0 ? (
                  <div className="text-center py-16 flex flex-col items-center gap-4 text-[var(--text3)] text-[13px] bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
                    <ListOrdered size={40} className="opacity-20" />
                    Tranzaksiyalar topilmadi.
                  </div>
                ) : (
                  groupedTransactions.map(group => (
                    <div key={group.sana} className="bg-[var(--bg)] rounded-2xl border border-[var(--border)] overflow-hidden transition-all hover:border-[#8b5cf6]/30 shadow-sm">
                      <button 
                        onClick={() => toggleDate(group.sana)} 
                        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-[var(--bg2)] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className={cn(
                            "p-2.5 sm:p-3 rounded-xl flex items-center justify-center shrink-0",
                            group.sana === getTodayStr() 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : group.label === 'Kecha' 
                                ? "bg-amber-500/10 text-amber-500" 
                                : "bg-blue-500/10 text-blue-500"
                          )}>
                            <Calendar size={20} className="sm:w-6 sm:h-6" />
                          </div>
                          <div className="text-left flex flex-col gap-0.5">
                            <div className="font-black text-[15px] sm:text-[16px] text-[var(--text)]">{group.label}</div>
                            <div className="text-[12px] sm:text-[13px] text-[var(--text3)] font-semibold flex items-center gap-2">
                              <span>{group.transactions.length} ta chek</span>
                              {group.transactions.some(t => t.amal === 'kirim') && (
                                <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-500 rounded text-[10px] font-bold uppercase tracking-wide">
                                  Vozvrat bor
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className="text-right hidden sm:flex flex-col gap-0.5">
                            <div className="font-black text-[15px] text-[var(--text)]">
                              {group.jamiSoni > 0 ? '+' : ''}{group.jamiSoni} <span className="text-[11px] font-semibold text-[var(--text3)]">juft</span>
                            </div>
                            <div className={cn("text-[13px] font-bold", group.jamiSumma > 0 ? "text-emerald-500" : (group.jamiSumma < 0 ? "text-rose-500" : "text-[var(--text3)]"))}>
                              {group.jamiSumma > 0 ? '+' : (group.jamiSumma < 0 ? '-' : '')}
                              <span title={`${formatUzs(Math.abs(group.jamiSumma))} UZS`}>{formatCompact(Math.abs(group.jamiSumma))} UZS</span>
                            </div>
                          </div>
                          <div className={cn(
                            "text-[var(--text3)] p-1.5 rounded-lg transition-colors",
                            expandedDates[group.sana] ? "bg-[var(--bg2)] text-[var(--text)]" : ""
                          )}>
                            {expandedDates[group.sana] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {expandedDates[group.sana] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg2)]/50 space-y-2.5">
                              {/* Group Info for Mobile */}
                              <div className="sm:hidden flex justify-between items-center mb-4 p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                                <span className="text-[12px] font-bold text-[var(--text3)] uppercase">Kunlik hisob:</span>
                                <div className="text-right">
                                  <div className="font-black text-[14px] text-[var(--text)]">{group.jamiSoni > 0 ? '+' : ''}{group.jamiSoni} <span className="text-[10px] font-semibold text-[var(--text3)]">juft</span></div>
                                  <div className={cn("text-[12px] font-bold", group.jamiSumma > 0 ? "text-emerald-500" : (group.jamiSumma < 0 ? "text-rose-500" : "text-[var(--text3)]"))}>
                                    {group.jamiSumma > 0 ? '+' : (group.jamiSumma < 0 ? '-' : '')}{formatCompact(Math.abs(group.jamiSumma))} UZS
                                  </div>
                                </div>
                              </div>

                              {group.transactions.map((t, tIdx) => (
                                <div key={`${t.id || 'tx'}_${tIdx}`} className="bg-[var(--bg)] p-3.5 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between border border-[var(--border)] hover:border-[#8b5cf6]/50 transition-colors gap-3 group/item">
                                  <div className="flex items-center gap-3 sm:gap-4">
                                    <div className={cn(
                                      "w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0",
                                      t.amal === 'kirim' ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                                    )}>
                                      {t.amal === 'kirim' ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                                    </div>
                                    <div>
                                      <div className="font-bold text-[var(--text)] text-[14px] mb-0.5">{t.model} <span className="text-[var(--text3)] ml-1 font-semibold text-xs">{t.olcham}°</span></div>
                                      <div className="text-[11px] text-[var(--text3)] flex items-center gap-1.5 font-medium">
                                        <span>{t.vaqt && t.vaqt.length > 5 ? t.vaqt.slice(-5) : t.vaqt}</span>
                                        <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                                        <span className={cn("uppercase tracking-wider font-bold", t.amal === 'kirim' ? "text-rose-500" : "text-emerald-500")}>
                                          {t.amal === 'chiqim' ? 'XARID' : 'QAYTARDI'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end border-t border-[var(--border)] sm:border-0 pt-2 sm:pt-0 mt-1 sm:mt-0">
                                    <div className={cn("font-black text-[15px] sm:text-[16px]", t.amal === 'kirim' ? "text-rose-500" : "text-[var(--text)]")}>
                                      {t.amal === 'kirim' ? '-' : '+'}{t.soni} <span className="text-[11px] font-bold opacity-60">juft</span>
                                    </div>
                                    {t.summa > 0 && (
                                      <div className={cn("text-[12px] font-bold mt-0.5", t.amal === 'kirim' ? "text-rose-500/80" : "text-[#8b5cf6]")}>
                                        <span title={`${formatUzs(t.summa)} UZS`}>{formatCompact(t.summa)} UZS</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: HUJJATLAR */}
          {activeTab === 'hujjatlar' && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col items-center justify-center text-center max-w-md mx-auto mt-10">
                <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6">
                  <FileSpreadsheet size={40} />
                </div>
                <h3 className="text-xl font-black text-[var(--text)] mb-2">Akt-Sverka (Solishtirma dalolatnoma)</h3>
                <p className="text-[13px] text-[var(--text3)] mb-8 font-medium leading-relaxed">
                  Ushbu hujjat mijoz {currentKontragent.ism} bilan barcha xarid, vozvrat va to'lov operatsiyalarining xronologik tartibdagi hisob-kitobini o'z ichiga oladi.
                </p>
                <div className="flex flex-col gap-3 w-full">
                  <button 
                    onClick={() => setShowAktSverka(true)}
                    className="w-full py-3.5 bg-blue-500 text-white hover:bg-blue-600 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                  >
                    <Printer size={18} /> Hujjatni ochish va chop etish
                  </button>
                  <button 
                    onClick={handleSendTelegramAktSverka}
                    className="w-full py-3.5 bg-[#0088cc] text-white hover:bg-[#0077b3] rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#0088cc]/25 transition-all cursor-pointer"
                  >
                    <Send size={18} /> Telegram orqali yuborish
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
