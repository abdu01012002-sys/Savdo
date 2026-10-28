import React, { useState, useEffect, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { 
  DollarSign, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Settings2, 
  Calculator, 
  History, 
  Check, 
  Copy, 
  ArrowRightLeft, 
  Building2, 
  Layers, 
  Zap, 
  ShieldCheck,
  Globe2,
  Clock,
  Sparkles,
  Info,
  X
} from 'lucide-react';
import { 
  fetchLiveExchangeRates, 
  calculateEffectiveRate, 
  createRateHistoryItem, 
  usdToUzs, 
  uzsToUsd, 
  FetchRateResult 
} from '../services/currencyService';
import { formatUzs, getNowStr, getTodayStr } from '../lib/utils';
import { toast } from 'sonner';
import { produce } from 'immer';
import { DbState, ValyutaKursConfig } from '../types';

interface CurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CurrencyModal: React.FC<CurrencyModalProps> = ({ isOpen, onClose }) => {
  const { db, setDb, currentUser } = useDb();
  const isAdmin = currentUser?.rol === 'admin';

  const [activeTab, setActiveTab] = useState<'calc' | 'settings' | 'history'>('calc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveCbuData, setLiveCbuData] = useState<FetchRateResult | null>(null);

  // Calculator State
  const [calcUsd, setCalcUsd] = useState<string>('100');
  const [calcUzs, setCalcUzs] = useState<string>('');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Settings State
  const config = useMemo<ValyutaKursConfig>(() => {
    return db.valyutaKursConfig || {
      joriyKurs: db.valyutaKursi || 12850,
      cbuKurs: 12820,
      cbuDiff: 15.0,
      cbuSana: getTodayStr(),
      manba: 'cbu_avto',
      bozorUstamaTuri: 'summa',
      bozorUstamaQiymati: 30,
      avtoYangilash: true,
      oxirgiYangilanish: getNowStr(),
      yangilaganXodim: 'Tizim',
      tarix: []
    };
  }, [db.valyutaKursConfig, db.valyutaKursi]);

  const activeRate = db.valyutaKursi || config.joriyKurs || 12850;

  const [mode, setMode] = useState<'cbu_avto' | 'bozor_avto' | 'qolda'>(config.manba || 'cbu_avto');
  const [customRateInput, setCustomRateInput] = useState<string>(activeRate.toString());
  const [spreadType, setSpreadType] = useState<'foiz' | 'summa'>(config.bozorUstamaTuri || 'summa');
  const [spreadValue, setSpreadValue] = useState<string>((config.bozorUstamaQiymati || 30).toString());
  const [autoUpdate, setAutoUpdate] = useState<boolean>(config.avtoYangilash !== false);

  // Initialize calculator UZS when opening or rate changes
  useEffect(() => {
    const numUsd = parseFloat(calcUsd) || 0;
    setCalcUzs(usdToUzs(numUsd, activeRate).toString());
  }, [activeRate]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Initial fetch when opening
  useEffect(() => {
    if (isOpen && !liveCbuData) {
      handleFetchLiveRates(false);
    }
  }, [isOpen]);

  const handleFetchLiveRates = async (showToast = true) => {
    setIsRefreshing(true);
    try {
      const res = await fetchLiveExchangeRates();
      setLiveCbuData(res);

      if (res.success) {
        if (showToast) {
          toast.success(`Markaziy Bank kursi yangilandi: 1 USD = ${formatUzs(res.usdRate)} so'm (${res.usdDiff >= 0 ? '+' : ''}${res.usdDiff} UZS)`);
        }

        // If in auto mode or auto update is on, sync to DB
        if (autoUpdate) {
          applyRateChange(res.usdRate, res.usdDiff, res.date, mode, spreadType, parseFloat(spreadValue) || 0, autoUpdate);
        }
      } else {
        if (showToast) {
          toast.warning("Markaziy Bank bilan ulanishda cheklov bo'ldi, lokal zaxira kursi ishlatilmoqda.");
        }
      }
    } catch (err) {
      if (showToast) toast.error("Valyuta kursini olishda xatolik yuz berdi");
    } finally {
      setIsRefreshing(false);
    }
  };

  const applyRateChange = (
    cbuRate: number,
    cbuDiff: number,
    cbuSana: string,
    newMode: 'cbu_avto' | 'bozor_avto' | 'qolda',
    newSpreadType: 'foiz' | 'summa',
    newSpreadVal: number,
    newAuto: boolean,
    manualRateVal?: number
  ) => {
    const effective = calculateEffectiveRate(
      {
        manba: newMode,
        bozorUstamaTuri: newSpreadType,
        bozorUstamaQiymati: newSpreadVal,
        joriyKurs: manualRateVal || parseFloat(customRateInput) || activeRate
      },
      cbuRate
    );

    const oldRate = activeRate;
    const historyItem = createRateHistoryItem(
      effective,
      cbuRate,
      newMode,
      oldRate,
      currentUser?.ism || 'Admin'
    );

    setDb(
      produce((draft: DbState) => {
        draft.valyutaKursi = effective;
        
        const currentConfig = draft.valyutaKursConfig || {
          joriyKurs: effective,
          cbuKurs: cbuRate,
          cbuDiff: cbuDiff,
          cbuSana: cbuSana,
          manba: newMode,
          bozorUstamaTuri: newSpreadType,
          bozorUstamaQiymati: newSpreadVal,
          avtoYangilash: newAuto,
          oxirgiYangilanish: getNowStr(),
          yangilaganXodim: currentUser?.ism || 'Admin',
          tarix: []
        };

        currentConfig.joriyKurs = effective;
        currentConfig.cbuKurs = cbuRate;
        currentConfig.cbuDiff = cbuDiff;
        currentConfig.cbuSana = cbuSana;
        currentConfig.manba = newMode;
        currentConfig.bozorUstamaTuri = newSpreadType;
        currentConfig.bozorUstamaQiymati = newSpreadVal;
        currentConfig.avtoYangilash = newAuto;
        currentConfig.oxirgiYangilanish = getNowStr();
        currentConfig.yangilaganXodim = currentUser?.ism || 'Admin';

        if (!Array.isArray(currentConfig.tarix)) {
          currentConfig.tarix = [];
        }
        currentConfig.tarix.unshift(historyItem);
        if (currentConfig.tarix.length > 50) {
          currentConfig.tarix = currentConfig.tarix.slice(0, 50);
        }

        draft.valyutaKursConfig = currentConfig;
      })
    );
  };

  const handleSaveSettings = () => {
    if (!isAdmin) {
      toast.error("Valyuta kursini faqat administrator o'zgartirishi mumkin!");
      return;
    }

    const cbuRate = liveCbuData?.usdRate || config.cbuKurs || 12820;
    const cbuDiff = liveCbuData?.usdDiff ?? config.cbuDiff ?? 0;
    const cbuSana = liveCbuData?.date || config.cbuSana || getTodayStr();
    const manualVal = parseFloat(customRateInput);
    const spreadVal = parseFloat(spreadValue) || 0;

    if (mode === 'qolda' && (isNaN(manualVal) || manualVal <= 0)) {
      toast.error("Iltimos, to'g'ri valyuta kursini kiriting!");
      return;
    }

    applyRateChange(cbuRate, cbuDiff, cbuSana, mode, spreadType, spreadVal, autoUpdate, manualVal);
    toast.success("Valyuta kursi muvaffaqiyatli saqlandi va tizimga tatbiq etildi!");
  };

  const handleUsdChange = (val: string) => {
    setCalcUsd(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setCalcUzs(usdToUzs(num, activeRate).toString());
    } else {
      setCalcUzs('');
    }
  };

  const handleUzsChange = (val: string) => {
    setCalcUzs(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setCalcUsd(uzsToUsd(num, activeRate).toString());
    } else {
      setCalcUsd('');
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    toast.success(`Nusxa olindi: ${text}`);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const calculatedRatePreview = useMemo(() => {
    const baseCbu = liveCbuData?.usdRate || config.cbuKurs || 12820;
    return calculateEffectiveRate(
      {
        manba: mode,
        bozorUstamaTuri: spreadType,
        bozorUstamaQiymati: parseFloat(spreadValue) || 0,
        joriyKurs: parseFloat(customRateInput) || activeRate
      },
      baseCbu
    );
  }, [mode, spreadType, spreadValue, customRateInput, liveCbuData, config.cbuKurs, activeRate]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with High-Impact Currency Badge */}
        <div className="p-5 sm:p-6 border-b border-[var(--border)] bg-gradient-to-r from-emerald-600/10 via-teal-500/5 to-transparent relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-inner">
                <DollarSign className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <span>Valyuta Kursi & Avtomatizatsiya</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                    $ / UZS
                  </span>
                </h3>
                <p className="text-xs text-[var(--text3)] mt-0.5 flex items-center gap-1.5 font-medium">
                  <Globe2 className="w-3.5 h-3.5" />
                  Markaziy Bank (CBU) va Bozor kursi avtomatik integratsiyasi
                </p>
              </div>
            </div>

            {/* Quick Live Exchange Rate Pill */}
            <div className="flex items-center gap-2 self-start sm:self-auto bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2 rounded-xl shadow-sm">
              <div className="text-right">
                <div className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Faol Kurs</div>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  1$ = {formatUzs(activeRate)} <span className="text-[11px] font-medium text-[var(--text2)]">so'm</span>
                </div>
              </div>
              <button
                onClick={() => handleFetchLiveRates(true)}
                disabled={isRefreshing}
                className="p-2 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[var(--text2)] hover:text-emerald-600 hover:border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50"
                title="Markaziy Bankdan eng yangi kursni tortib olish"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-4 pt-2 border-t border-[var(--border)]">
            <button
              onClick={() => setActiveTab('calc')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'calc'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>Tezkor Kalkulyator</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Kurs Sozlamalari</span>
              {isAdmin && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-bold ml-1">Admin</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>O'zgarishlar Tarixi</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Live Interactive Converter & Calculator */}
        {activeTab === 'calc' && (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Live Dual Conversion Card */}
            <div className="bg-[var(--bg)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-[var(--text3)] tracking-wider flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" />
                  Ikki Tomonlama Konvertor (Live ⇄)
                </span>
                <span className="text-xs text-[var(--text3)] font-medium">
                  Kurs: <strong className="text-[var(--text)]">{formatUzs(activeRate)}</strong> UZS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* USD Input */}
                <div className="bg-[var(--bg2)] p-3.5 rounded-xl border border-[var(--border)] focus-within:border-emerald-500 transition-all">
                  <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold mb-1.5">
                    <span>AQSH Dollari ($)</span>
                    <button
                      onClick={() => copyToClipboard(calcUsd, 'usd')}
                      className="hover:text-emerald-500 transition-colors p-1"
                      title="Nusxa olish"
                    >
                      {copiedType === 'usd' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">$</span>
                    <input
                      type="number"
                      value={calcUsd}
                      onChange={(e) => handleUsdChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-xl font-black text-[var(--text)] outline-none"
                    />
                  </div>
                </div>

                {/* UZS Input */}
                <div className="bg-[var(--bg2)] p-3.5 rounded-xl border border-[var(--border)] focus-within:border-emerald-500 transition-all">
                  <div className="flex items-center justify-between text-xs text-[var(--text3)] font-bold mb-1.5">
                    <span>O'zbekiston So'mi (UZS)</span>
                    <button
                      onClick={() => copyToClipboard(calcUzs, 'uzs')}
                      className="hover:text-emerald-500 transition-colors p-1"
                      title="Nusxa olish"
                    >
                      {copiedType === 'uzs' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={calcUzs}
                      onChange={(e) => handleUzsChange(e.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent text-xl font-black text-[var(--text)] outline-none"
                    />
                    <span className="text-xs font-black text-[var(--text3)] uppercase">so'm</span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-[var(--text3)] mr-1">Tezkor Dollar:</span>
                {[10, 50, 100, 250, 500, 1000, 5000].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleUsdChange(val.toString())}
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-emerald-500 hover:text-emerald-600 transition-all cursor-pointer"
                  >
                    ${val}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-[var(--text3)] mr-1">Tezkor So'm:</span>
                {[
                  { label: '1 mln', val: 1000000 },
                  { label: '5 mln', val: 5000000 },
                  { label: '10 mln', val: 10000000 },
                  { label: '25 mln', val: 25000000 },
                  { label: '50 mln', val: 50000000 }
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => handleUzsChange(item.val.toString())}
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-emerald-500 hover:text-emerald-600 transition-all cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Official Central Bank Rates Overview Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-[var(--text3)] tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  Markaziy Bank (CBU) Rasmiy Kurslari
                </h4>
                <span className="text-[11px] text-[var(--text3)] font-medium">
                  Sana: {liveCbuData?.date || config.cbuSana || getTodayStr()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* USD */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-emerald-500/30 shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">USD ($)</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Asosiy
                    </span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.usdRate || config.cbuKurs || 12820)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-bold mt-1">
                    {(liveCbuData?.usdDiff ?? config.cbuDiff ?? 0) >= 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center">
                        <TrendingUp className="w-3 h-3 mr-0.5" />
                        +{(liveCbuData?.usdDiff ?? config.cbuDiff ?? 0)} UZS
                      </span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 flex items-center">
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                        {(liveCbuData?.usdDiff ?? config.cbuDiff ?? 0)} UZS
                      </span>
                    )}
                  </div>
                </div>

                {/* EUR */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">EUR (€)</span>
                    <span className="text-[10px] font-medium text-[var(--text3)]">Yevro</span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.allRates?.EUR?.rate || 13950)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-1">
                    1 EUR ≈ {( (liveCbuData?.allRates?.EUR?.rate || 13950) / (activeRate || 12850) ).toFixed(2)} USD
                  </div>
                </div>

                {/* RUB */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">RUB (₽)</span>
                    <span className="text-[10px] font-medium text-[var(--text3)]">Rubl</span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.allRates?.RUB?.rate || 142.5)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-1">
                    1000 RUB ≈ {formatUzs((liveCbuData?.allRates?.RUB?.rate || 142.5) * 1000)} UZS
                  </div>
                </div>

                {/* CNY */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">CNY (¥)</span>
                    <span className="text-[10px] font-medium text-[var(--text3)]">Yuan</span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.allRates?.CNY?.rate || 1780)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-1">
                    Import xaridlari uchun
                  </div>
                </div>

                {/* KZT */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">KZT (₸)</span>
                    <span className="text-[10px] font-medium text-[var(--text3)]">Tenge</span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.allRates?.KZT?.rate || 26.5)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-1">
                    Mintaqaviy savdo
                  </div>
                </div>

                {/* TRY */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--text)]">TRY (₺)</span>
                    <span className="text-[10px] font-medium text-[var(--text3)]">Lira</span>
                  </div>
                  <div className="text-base font-black text-[var(--text)] mt-1.5">
                    {formatUzs(liveCbuData?.allRates?.TRY?.rate || 375)} <span className="text-[10px] font-medium text-[var(--text3)]">UZS</span>
                  </div>
                  <div className="text-[11px] text-[var(--text3)] font-medium mt-1">
                    Xomashyo & furnitura
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Automation & Modes Settings */}
        {activeTab === 'settings' && (
          <div className="p-5 sm:p-6 space-y-6">
            {!isAdmin && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>Ushbu sozlamalarni faqat <strong>Administrator</strong> o'zgartirishi mumkin. Siz joriy rejimni ko'rishingiz mumkin.</span>
              </div>
            )}

            {/* Mode Selector */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase text-[var(--text3)] tracking-wider">
                Hisob-Kitob Rejimini Tanlang
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. CBU Auto */}
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setMode('cbu_avto')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                    mode === 'cbu_avto'
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--text3)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Building2 className={`w-5 h-5 ${mode === 'cbu_avto' ? 'text-emerald-500' : 'text-[var(--text3)]'}`} />
                    {mode === 'cbu_avto' && <Check className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="text-xs font-black text-[var(--text)]">Markaziy Bank (CBU)</div>
                  <p className="text-[11px] text-[var(--text3)] mt-1 font-medium leading-snug">
                    Har kuni Markaziy Bankning rasmiy kursini to'g'ridan-to'g'ri oladi.
                  </p>
                </button>

                {/* 2. Market Auto (CBU + Spread) */}
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setMode('bozor_avto')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                    mode === 'bozor_avto'
                      ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-500/30'
                      : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--text3)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className={`w-5 h-5 ${mode === 'bozor_avto' ? 'text-blue-500' : 'text-[var(--text3)]'}`} />
                    {mode === 'bozor_avto' && <Check className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="text-xs font-black text-[var(--text)]">Bozor Kursi (Avto + Ustama)</div>
                  <p className="text-[11px] text-[var(--text3)] mt-1 font-medium leading-snug">
                    CBU kursi ustiga belgilangan marja (+so'm yoki +%) qo'shiladi.
                  </p>
                </button>

                {/* 3. Manual */}
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setMode('qolda')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                    mode === 'qolda'
                      ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/30'
                      : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--text3)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Settings2 className={`w-5 h-5 ${mode === 'qolda' ? 'text-purple-500' : 'text-[var(--text3)]'}`} />
                    {mode === 'qolda' && <Check className="w-4 h-4 text-purple-500" />}
                  </div>
                  <div className="text-xs font-black text-[var(--text)]">Qo'lda O'rnatish</div>
                  <p className="text-[11px] text-[var(--text3)] mt-1 font-medium leading-snug">
                    Administrator tomonidan kiritilgan qat'iy kurs ishlatiladi.
                  </p>
                </button>
              </div>
            </div>

            {/* Dynamic Controls based on selected mode */}
            {mode === 'bozor_avto' && (
              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-blue-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    Bozor Ustamasi (Marja) Sozlamasi
                  </span>
                  <div className="flex items-center bg-[var(--bg2)] p-1 rounded-xl border border-[var(--border)]">
                    <button
                      disabled={!isAdmin}
                      onClick={() => setSpreadType('summa')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        spreadType === 'summa' ? 'bg-blue-600 text-white' : 'text-[var(--text3)]'
                      }`}
                    >
                      +So'm
                    </button>
                    <button
                      disabled={!isAdmin}
                      onClick={() => setSpreadType('foiz')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        spreadType === 'foiz' ? 'bg-blue-600 text-white' : 'text-[var(--text3)]'
                      }`}
                    >
                      +% Foiz
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--text3)] block mb-1">
                      {spreadType === 'summa' ? "CBU kursiga qo'shiladigan summa (so'mda)" : "CBU kursiga qo'shiladigan foiz (%)"}
                    </label>
                    <div className="flex items-center gap-2 bg-[var(--bg2)] px-3 py-2 rounded-xl border border-[var(--border)]">
                      <input
                        type="number"
                        disabled={!isAdmin}
                        value={spreadValue}
                        onChange={(e) => setSpreadValue(e.target.value)}
                        className="w-full bg-transparent font-black text-base text-[var(--text)] outline-none"
                        placeholder="30"
                      />
                      <span className="text-xs font-bold text-[var(--text3)]">
                        {spreadType === 'summa' ? "so'm" : "%"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-xs">
                    <span className="text-[var(--text3)] block font-medium">Hisoblangan Bozor Kursi:</span>
                    <div className="text-base font-black text-blue-600 dark:text-blue-400 mt-0.5">
                      1 USD = {formatUzs(calculatedRatePreview)} so'm
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mode === 'qolda' && (
              <div className="p-4 rounded-2xl bg-[var(--bg)] border border-purple-500/30 space-y-3">
                <label className="text-xs font-black text-[var(--text)] block">
                  Qat'iy Valyuta Kursi (1 USD = ? UZS)
                </label>
                <div className="flex items-center gap-3 bg-[var(--bg2)] px-4 py-2.5 rounded-xl border border-[var(--border)] focus-within:border-purple-500">
                  <DollarSign className="w-5 h-5 text-purple-500" />
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={customRateInput}
                    onChange={(e) => setCustomRateInput(e.target.value)}
                    placeholder="12850"
                    className="w-full bg-transparent text-lg font-black text-[var(--text)] outline-none"
                  />
                  <span className="text-xs font-bold text-[var(--text3)]">so'm</span>
                </div>
              </div>
            )}

            {/* Daily Auto Update Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
              <div>
                <div className="text-xs font-black text-[var(--text)] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Har kuni avtomatik yangilash
                </div>
                <p className="text-[11px] text-[var(--text3)] mt-0.5">
                  Dastur har kuni ochilganda eng so'nggi Markaziy Bank kursini avtomatik qabul qiladi.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={autoUpdate}
                  onChange={(e) => setAutoUpdate(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Calculated Result Preview and Save Button */}
            <div className="pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs text-[var(--text3)] font-medium">Yangi faol kurs:</span>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  1 USD = {formatUzs(calculatedRatePreview)} so'm
                </div>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Saqlash va Kursni Qo'llash</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Rate History & Logs */}
        {activeTab === 'history' && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-[var(--text3)] tracking-wider">
                Valyuta Kursi O'zgarishlari Tarixi
              </h4>
              <span className="text-xs text-[var(--text3)] font-medium">
                Oxirgi yangilanish: {config.oxirgiYangilanish || 'Noma\'lum'}
              </span>
            </div>

            {(!config.tarix || config.tarix.length === 0) ? (
              <div className="p-8 text-center bg-[var(--bg)] rounded-2xl border border-[var(--border)] text-[var(--text3)] text-xs">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Hozircha kurs o'zgarishlar tarixi mavjud emas.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {config.tarix.map((item, cIdx) => (
                  <div
                    key={`${item.id || 'cur'}_${cIdx}`}
                    className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg font-black shrink-0 ${
                        item.farq > 0 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                          : item.farq < 0 
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' 
                          : 'bg-gray-500/15 text-[var(--text3)]'
                      }`}>
                        {item.farq > 0 ? <TrendingUp className="w-4 h-4" /> : item.farq < 0 ? <TrendingDown className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="font-black text-[var(--text)] text-sm">
                          1$ = {formatUzs(item.kurs)} <span className="text-[10px] font-normal text-[var(--text3)]">so'm</span>
                        </div>
                        <div className="text-[11px] text-[var(--text3)] flex items-center gap-2 mt-0.5">
                          <span>{item.sana} {item.vaqt}</span>
                          <span>•</span>
                          <span className="capitalize font-medium">
                            {item.manba === 'cbu_avto' ? 'Markaziy Bank' : item.manba === 'bozor_avto' ? 'Bozor Kursi' : "Qo'lda"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-black ${
                        item.farq > 0 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : item.farq < 0 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : 'text-[var(--text3)]'
                      }`}>
                        {item.farq > 0 ? `+${item.farq}` : item.farq < 0 ? `${item.farq}` : '0'} UZS
                      </div>
                      <div className="text-[10px] text-[var(--text3)]">
                        {item.xodim || 'Tizim'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
