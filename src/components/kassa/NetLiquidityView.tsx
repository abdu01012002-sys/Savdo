import React, { useState, useMemo } from 'react';
import { useDb } from '../../context/DbContext';
import { useAudit } from '../../hooks/useAudit';
import { produce } from 'immer';
import { PostavshikQarzi, DbState, KassaTuri } from '../../types';
import { 
  formatUzs, 
  formatCompact, 
  getTodayStr, 
  getNowStr, 
  generateId, 
  cn 
} from '../../lib/utils';
import { 
  Building2, 
  Users, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  CheckCircle2, 
  Trash2, 
  DollarSign, 
  Receipt, 
  ShieldCheck, 
  AlertTriangle,
  Layers,
  Phone,
  Calendar,
  X,
  CreditCard
} from 'lucide-react';
import { toast } from 'sonner';

export const NetLiquidityView: React.FC = () => {
  const { db, setDb, currentUser } = useDb();
  const { logAudit } = useAudit();
  const isAdmin = currentUser?.rol === 'admin';

  const valyutaKursi = db.valyutaKursi || 12850;
  const kassaBalansi = db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };

  // 1. Kassa Likvid Aktivlari (UZS)
  const totalCashUzs = useMemo(() => {
    const naqdSo = Number(kassaBalansi.naqd_uzs || 0);
    const naqdUsdToUzs = Number(kassaBalansi.naqd_usd || 0) * valyutaKursi;
    const kartaSo = Number(kassaBalansi.karta_uzs || 0);
    const bankSo = Number(kassaBalansi.bank_uzs || 0);
    return naqdSo + naqdUsdToUzs + kartaSo + bankSo;
  }, [kassaBalansi, valyutaKursi]);

  // 2. Debitorlik (Mijozlarimizning bizga qarzi)
  const debitorlikData = useMemo(() => {
    const debtors = (db.kontragentlar || []).filter(k => (k.balans || 0) > 0);
    const totalDebitorlikUzs = debtors.reduce((acc, k) => acc + (k.balans || 0), 0);
    const topDebtors = debtors.slice().sort((a, b) => (b.balans || 0) - (a.balans || 0)).slice(0, 5);

    return { debtors, totalDebitorlikUzs, topDebtors };
  }, [db.kontragentlar]);

  // 3. Kreditorlik (Bizning postavshik/xomashyo/fasonchilarga qarzimiz)
  const postavshiklar = db.postavshiklar || [];
  const totalKreditorlikUzs = useMemo(() => {
    return postavshiklar.reduce((acc, p) => {
      const sum = p.valyuta === 'USD' 
        ? (p.qarzSummaUsd || p.qarzSummaUzs) * valyutaKursi 
        : p.qarzSummaUzs;
      return acc + sum;
    }, 0);
  }, [postavshiklar, valyutaKursi]);

  // 4. SOF LIKVIDLIK (NET WORTH)
  const netLiquidityUzs = totalCashUzs + debitorlikData.totalDebitorlikUzs - totalKreditorlikUzs;
  const netLiquidityUsd = valyutaKursi > 0 ? netLiquidityUzs / valyutaKursi : 0;

  // Likvidlik koeffitsiyenti (Coverage ratio)
  const liquidityRatio = totalKreditorlikUzs > 0 
    ? (totalCashUzs + debitorlikData.totalDebitorlikUzs) / totalKreditorlikUzs 
    : 10;

  // Modal holatlari
  const [isAddPostavshikOpen, setIsAddPostavshikOpen] = useState(false);
  const [isPayDebtOpen, setIsPayDebtOpen] = useState(false);
  const [selectedPostavshik, setSelectedPostavshik] = useState<PostavshikQarzi | null>(null);

  // Yangi Postavshik qarzi formasi
  const [postavshikForm, setPostavshikForm] = useState({
    nomi: '',
    tel: '',
    xomashyoTuri: 'Taglik (Podoshva)',
    qarzSumma: '',
    valyuta: 'UZS' as 'UZS' | 'USD',
    izoh: ''
  });

  // Qarz to'lash formasi
  const [payForm, setPayForm] = useState({
    summa: '',
    kassaTuri: 'naqd_uzs' as KassaTuri,
    izoh: ''
  });

  const handleCreatePostavshik = (e: React.FormEvent) => {
    e.preventDefault();
    const sum = parseFloat(postavshikForm.qarzSumma) || 0;
    if (!postavshikForm.nomi.trim() || sum <= 0) {
      toast.error("Iltimos, ta'minotchi nomi va qarz summasini to'liq kiriting!");
      return;
    }

    const newRecord: PostavshikQarzi = {
      id: generateId(),
      nomi: postavshikForm.nomi.trim(),
      tel: postavshikForm.tel.trim(),
      xomashyoTuri: postavshikForm.xomashyoTuri,
      qarzSummaUzs: postavshikForm.valyuta === 'USD' ? sum * valyutaKursi : sum,
      qarzSummaUsd: postavshikForm.valyuta === 'USD' ? sum : (sum / valyutaKursi),
      valyuta: postavshikForm.valyuta,
      sana: getTodayStr(),
      izoh: postavshikForm.izoh.trim()
    };

    setDb(produce((draft: DbState) => {
      if (!draft.postavshiklar) draft.postavshiklar = [];
      draft.postavshiklar.unshift(newRecord);
    }));

    logAudit('add_supplier_debt', 'Moliya', `Yangi kreditorlik qarzi: ${newRecord.nomi} (${newRecord.xomashyoTuri}) - ${sum} ${newRecord.valyuta}`);
    toast.success(`✅ Ta'minotchi qarzi muvaffaqiyatli saqlandi!`);
    setIsAddPostavshikOpen(false);
    setPostavshikForm({ nomi: '', tel: '', xomashyoTuri: 'Taglik (Podoshva)', qarzSumma: '', valyuta: 'UZS', izoh: '' });
  };

  const handlePaySupplierDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostavshik) return;
    const paySum = parseFloat(payForm.summa) || 0;
    if (paySum <= 0) {
      toast.error("To'lov summasini kiriting!");
      return;
    }

    const kassaMavjud = kassaBalansi[payForm.kassaTuri] || 0;
    const isUsdKassa = payForm.kassaTuri === 'naqd_usd';
    const paySumInKassaValyuta = isUsdKassa && selectedPostavshik.valyuta === 'UZS' 
      ? paySum / valyutaKursi 
      : !isUsdKassa && selectedPostavshik.valyuta === 'USD'
      ? paySum * valyutaKursi
      : paySum;

    if (paySumInKassaValyuta > kassaMavjud) {
      toast.error(`❌ Tanlangan kassada yetarli mablag' yo'q! Mavjud: ${kassaMavjud.toLocaleString()}`);
      return;
    }

    setDb(produce((draft: DbState) => {
      if (!draft.postavshiklar) draft.postavshiklar = [];
      if (!draft.kassaBalansi) draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      if (!draft.kassaHarakatlari) draft.kassaHarakatlari = [];

      const targetP = draft.postavshiklar.find(p => p.id === selectedPostavshik.id);
      if (targetP) {
        if (targetP.valyuta === 'USD') {
          targetP.qarzSummaUsd = Math.max(0, (targetP.qarzSummaUsd || 0) - paySum);
          targetP.qarzSummaUzs = (targetP.qarzSummaUsd || 0) * valyutaKursi;
        } else {
          targetP.qarzSummaUzs = Math.max(0, targetP.qarzSummaUzs - paySum);
        }
        targetP.oxirgiTolanganSana = getTodayStr();
        targetP.oxirgiTolanganSumma = paySum;
      }

      // Kassa balansini kamaytirish
      draft.kassaBalansi[payForm.kassaTuri] = (draft.kassaBalansi[payForm.kassaTuri] || 0) - paySumInKassaValyuta;

      // Kassa harakatlariga chiqim yozish
      draft.kassaHarakatlari.unshift({
        id: generateId(),
        vaqt: getNowStr(),
        sana: getTodayStr(),
        tur: 'chiqim',
        kategoriya: 'postavshik',
        summa: paySumInKassaValyuta,
        valyuta: isUsdKassa ? 'USD' : 'UZS',
        kurs: valyutaKursi,
        summaUzs: isUsdKassa ? paySumInKassaValyuta * valyutaKursi : paySumInKassaValyuta,
        kassaTuri: payForm.kassaTuri,
        kimgaKimdan: selectedPostavshik.nomi,
        izoh: `Postavshik qarzini to'lash: ${selectedPostavshik.nomi} (${selectedPostavshik.xomashyoTuri}). ${payForm.izoh}`,
        xodim: currentUser?.ism || 'Foydalanuvchi'
      });
    }));

    logAudit('pay_supplier_debt', 'Moliya', `Postavshik qarzi to'landi: ${selectedPostavshik.nomi} - ${paySum} ${selectedPostavshik.valyuta}`);
    toast.success(`✅ Qarz to'lovi muvaffaqiyatli amalga oshirildi!`);
    setIsPayDebtOpen(false);
    setSelectedPostavshik(null);
    setPayForm({ summa: '', kassaTuri: 'naqd_uzs', izoh: '' });
  };

  const handleDeleteSupplier = (id: string) => {
    if (!isAdmin) return;
    setDb(produce((draft: DbState) => {
      draft.postavshiklar = (draft.postavshiklar || []).filter(p => p.id !== id);
    }));
    toast.success("Postavshik o'chirildi");
  };

  return (
    <div className="space-y-6">
      
      {/* ========================================================================= */}
      {/* 1. SOF KAPITAL (NET WORTH & LIQUIDITY) HERO KARTASI */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-purple-900/40 via-[var(--bg2)] to-indigo-950/30 border border-purple-500/30 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight">
                Korxonaning Haqiqiy Sof Likvidligi (Net Worth)
              </h2>
              <p className="text-xs text-[var(--text3)]">
                Formula: Kassa Qoldiqlari + Debitorlik (Mijozlar qarzi) - Kreditorlik (Fabrika qarzlari)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5",
              liquidityRatio >= 1.5 
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" 
                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
            )}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              <span>Likvidlik: {liquidityRatio >= 10 ? 'A\'lo (Qarzsiz)' : `${liquidityRatio.toFixed(2)}x`}</span>
            </span>
          </div>
        </div>

        {/* 4 Asosiy Moliya Ustunlari */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          {/* A) Kassa Aktivlari */}
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1"><Wallet size={13} /> KASSA QOLDIQLARI</span>
              <span className="text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-md">Naqd+Karta+Bank</span>
            </div>
            <div className="my-2">
              <span className="text-xl font-black text-[var(--text)] tabular-nums block">
                {formatUzs(totalCashUzs)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
              </span>
              <span className="text-xs text-[var(--text3)] font-semibold">
                ~${formatCompact(totalCashUzs / valyutaKursi)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text3)]">Hozirgi real likvid pul mablag'lari</span>
          </div>

          {/* B) Debitorlik */}
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-600 dark:text-blue-400">
              <span className="flex items-center gap-1"><Users size={13} /> DEBITORLIK (MIJOZLAR)</span>
              <span className="text-[10px] bg-blue-500/10 px-2 py-0.5 rounded-md">{debitorlikData.debtors.length} ta mijoz</span>
            </div>
            <div className="my-2">
              <span className="text-xl font-black text-blue-600 dark:text-blue-400 tabular-nums block">
                +{formatUzs(debitorlikData.totalDebitorlikUzs)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
              </span>
              <span className="text-xs text-[var(--text3)] font-semibold">
                ~${formatCompact(debitorlikData.totalDebitorlikUzs / valyutaKursi)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text3)]">Bizga kelishi kutilayotgan nasiyalar</span>
          </div>

          {/* C) Kreditorlik */}
          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-bold text-rose-600 dark:text-rose-400">
              <span className="flex items-center gap-1"><Receipt size={13} /> KREDITORLIK (POSTAVSHIK)</span>
              <span className="text-[10px] bg-rose-500/10 px-2 py-0.5 rounded-md">{postavshiklar.length} ta manba</span>
            </div>
            <div className="my-2">
              <span className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums block">
                -{formatUzs(totalKreditorlikUzs)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
              </span>
              <span className="text-xs text-[var(--text3)] font-semibold">
                ~${formatCompact(totalKreditorlikUzs / valyutaKursi)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text3)]">Fabrika va xomashyoga to'lanadigan qarz</span>
          </div>

          {/* D) Haqiqiy Sof Likvidlik */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-600/15 to-indigo-600/15 border border-purple-500/40 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-black text-purple-700 dark:text-purple-300">
              <span className="flex items-center gap-1"><TrendingUp size={13} /> HAQIQIY SOF KAPITAL</span>
              <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-md font-bold">Net Worth</span>
            </div>
            <div className="my-2">
              <span className={cn(
                "text-2xl font-black tabular-nums block",
                netLiquidityUzs >= 0 ? "text-purple-600 dark:text-purple-400" : "text-rose-600"
              )}>
                {formatUzs(netLiquidityUzs)} <span className="text-xs font-bold text-[var(--text3)]">UZS</span>
              </span>
              <span className="text-xs text-[var(--text3)] font-black">
                ~${formatCompact(netLiquidityUsd)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--text3)] font-medium">Barcha qarzlar yopilgandan keyingi sof boylik</span>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DEBITORLIK VA KREDITORLIK DETALLARI GRIDI */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHAP: Debitorlik (Mijozlar Nasiyalari) */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">Debitorlik Qarzlari (Mijozlar)</h3>
                <p className="text-[11px] text-[var(--text3)]">Eng katta nasiyaga ega mijozlar</p>
              </div>
            </div>
            <span className="text-xs font-black text-blue-600 bg-blue-500/10 px-2.5 py-1 rounded-xl">
              {formatCompact(debitorlikData.totalDebitorlikUzs)} UZS
            </span>
          </div>

          <div className="space-y-2">
            {debitorlikData.topDebtors.length === 0 ? (
              <p className="text-xs text-[var(--text3)] text-center py-6">Mijozlarda nasiya qarzlari yo'q 🎉</p>
            ) : (
              debitorlikData.topDebtors.map(m => (
                <div key={m.id} className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[var(--text)] block">{m.ism}</span>
                    <span className="text-[10px] text-[var(--text3)] flex items-center gap-1.5 mt-0.5">
                      {m.tel && <span>📞 {m.tel}</span>}
                      {m.viloyat && <span>📍 {m.viloyat}</span>}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-blue-600 dark:text-blue-400 tabular-nums block">
                      {formatUzs(m.balans || 0)} UZS
                    </span>
                    <span className="text-[10px] text-[var(--text3)]">
                      ~${formatCompact((m.balans || 0) / valyutaKursi)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* O'NG: Kreditorlik (Fabrika & Postavshik Qarzlari) */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">Kreditorlik (Postavshik & Xomashyo)</h3>
                <p className="text-[11px] text-[var(--text3)]">Taglik, teri, furnitura va fabrika qarzlari</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddPostavshikOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Plus size={13} />
              <span>Qarz qo'shish</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {postavshiklar.length === 0 ? (
              <p className="text-xs text-[var(--text3)] text-center py-6">Kreditorlik qarzlari mavjud emas</p>
            ) : (
              postavshiklar.map((p, pIdx) => {
                const isUsd = p.valyuta === 'USD';
                const currentSum = isUsd ? (p.qarzSummaUsd || 0) : p.qarzSummaUzs;

                return (
                  <div key={`${p.id || 'postavshik'}_${pIdx}`} className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs hover:border-purple-500/30 transition-all">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)]">{p.nomi}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          {p.xomashyoTuri}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text3)] flex items-center gap-2 mt-1">
                        {p.tel && <span>📞 {p.tel}</span>}
                        {p.sana && <span>📅 {p.sana}</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums block">
                          {isUsd ? `$${currentSum.toLocaleString()}` : `${formatUzs(currentSum)} UZS`}
                        </span>
                        {isUsd && (
                          <span className="text-[10px] text-[var(--text3)]">
                            ~{formatCompact(currentSum * valyutaKursi)} UZS
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPostavshik(p);
                            setPayForm({ summa: currentSum.toString(), kassaTuri: isUsd ? 'naqd_usd' : 'naqd_uzs', izoh: '' });
                            setIsPayDebtOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
                        >
                          To'lash
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplier(p.id)}
                            className="p-1.5 rounded-xl text-[var(--text3)] hover:text-rose-500 hover:bg-[var(--bg2)] cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. YANGI POSTAVSHIK QARZINI QO'SHISH MODALI */}
      {/* ========================================================================= */}
      {isAddPostavshikOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-black text-sm text-[var(--text)]">Yangi Ta'minotchi / Postavshik Qarzi</h3>
              <button onClick={() => setIsAddPostavshikOpen(false)} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePostavshik} className="space-y-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--text3)]">Ta'minotchi / Korxona nomi *</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Polimer Taglik MCHJ..."
                  value={postavshikForm.nomi}
                  onChange={e => setPostavshikForm(prev => ({ ...prev, nomi: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[var(--text3)]">Xomashyo turi</label>
                  <select
                    value={postavshikForm.xomashyoTuri}
                    onChange={e => setPostavshikForm(prev => ({ ...prev, xomashyoTuri: e.target.value }))}
                    className="w-full px-2.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
                  >
                    <option value="Taglik (Podoshva)">Taglik (Podoshva)</option>
                    <option value="Tabiiy Teri">Tabiiy Teri</option>
                    <option value="Sun'iy Teri / Eko">Sun'iy Teri / Eko</option>
                    <option value="Fason / Model">Fason / Tikuv</option>
                    <option value="Furnitura / Zamok">Furnitura / Zamok</option>
                    <option value="Quti & Paket">Quti & Paket</option>
                    <option value="Boshqa Xomashyo">Boshqa Xomashyo</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[var(--text3)]">Telefon (ixtiyoriy)</label>
                  <input
                    type="text"
                    placeholder="+998 90 123 45 67"
                    value={postavshikForm.tel}
                    onChange={e => setPostavshikForm(prev => ({ ...prev, tel: e.target.value }))}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[var(--text3)]">Qarz summasi *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0"
                    value={postavshikForm.qarzSumma}
                    onChange={e => setPostavshikForm(prev => ({ ...prev, qarzSumma: e.target.value }))}
                    className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[var(--text3)]">Valyuta</label>
                  <select
                    value={postavshikForm.valyuta}
                    onChange={e => setPostavshikForm(prev => ({ ...prev, valyuta: e.target.value as any }))}
                    className="w-full px-2.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500"
                  >
                    <option value="UZS">UZS (So'm)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--text3)]">Izoh</label>
                <input
                  type="text"
                  placeholder="Partiya yoki shartnoma raqami..."
                  value={postavshikForm.izoh}
                  onChange={e => setPostavshikForm(prev => ({ ...prev, izoh: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsAddPostavshikOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-xs cursor-pointer"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. QARZ TO'LASH MODALI */}
      {/* ========================================================================= */}
      {isPayDebtOpen && selectedPostavshik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-black text-sm text-[var(--text)]">Qarzni To'lash</h3>
                <p className="text-xs text-[var(--text3)]">{selectedPostavshik.nomi} ({selectedPostavshik.xomashyoTuri})</p>
              </div>
              <button onClick={() => setIsPayDebtOpen(false)} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaySupplierDebt} className="space-y-3.5">
              <div className="p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs flex justify-between items-center">
                <span className="text-[var(--text3)]">Joriy qarz:</span>
                <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                  {selectedPostavshik.valyuta === 'USD' 
                    ? `$${(selectedPostavshik.qarzSummaUsd || 0).toLocaleString()}` 
                    : `${formatUzs(selectedPostavshik.qarzSummaUzs)} UZS`}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--text3)]">To'lov summasi ({selectedPostavshik.valyuta}) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="0"
                  value={payForm.summa}
                  onChange={e => setPayForm(prev => ({ ...prev, summa: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--text3)]">Qaysi kassadan to'lanadi? *</label>
                <select
                  value={payForm.kassaTuri}
                  onChange={e => setPayForm(prev => ({ ...prev, kassaTuri: e.target.value as KassaTuri }))}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="naqd_uzs">Naqd Pul (So'm) — Mavjud: {Number(kassaBalansi.naqd_uzs || 0).toLocaleString()} UZS</option>
                  <option value="naqd_usd">Naqd Pul (Dollar $) — Mavjud: ${Number(kassaBalansi.naqd_usd || 0).toLocaleString()}</option>
                  <option value="karta_uzs">Karta (Humo/Uzcard) — Mavjud: {Number(kassaBalansi.karta_uzs || 0).toLocaleString()} UZS</option>
                  <option value="bank_uzs">Bank Hisobi — Mavjud: {Number(kassaBalansi.bank_uzs || 0).toLocaleString()} UZS</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[var(--text3)]">To'lov izohi</label>
                <input
                  type="text"
                  placeholder="Masalan: Kvitansiya #104..."
                  value={payForm.izoh}
                  onChange={e => setPayForm(prev => ({ ...prev, izoh: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsPayDebtOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  <span>To'lovni Tasdiqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
