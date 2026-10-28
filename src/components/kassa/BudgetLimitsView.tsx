import React, { useState, useMemo } from 'react';
import { useDb } from '../../context/DbContext';
import { useAudit } from '../../hooks/useAudit';
import { produce } from 'immer';
import { XarajatKategoriya, DbState } from '../../types';
import { 
  formatUzs, 
  formatCompact, 
  getTodayStr, 
  cn 
} from '../../lib/utils';
import { 
  XARAJAT_KATEGORIYALARI 
} from '../../pages/KassaPage';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Target, 
  Edit3, 
  Save, 
  X, 
  TrendingUp, 
  ShieldAlert,
  Sparkles,
  Layers,
  Percent
} from 'lucide-react';
import { toast } from 'sonner';

export const BudgetLimitsView: React.FC = () => {
  const { db, setDb, currentUser } = useDb();
  const { logAudit } = useAudit();
  const isAdmin = currentUser?.rol === 'admin';

  const valyutaKursi = db.valyutaKursi || 12850;
  const currentMonthStr = getTodayStr().slice(0, 7); // e.g. "2026-09"

  // Mavjud budjet limitlari (agar o'rnatilmagan bo'lsa standart tavsiya etilgan qiymatlar)
  const defaultLimits: Record<string, number> = {
    ish_haqi: 40000000,
    ijara: 10000000,
    transport: 3000000,
    marketing: 5000000,
    kommunal: 1500000,
    tushlik_xojalik: 4000000,
    postavshik: 50000000,
    soliq_bank: 2000000,
    boshqa: 2000000
  };

  const storedLimits = db.xarajatBudjetlari || defaultLimits;

  // Joriy oyda qilingan xarajatlarni toifalar bo'yicha hisoblash
  const currentMonthExpenses = useMemo(() => {
    const map: Record<string, number> = {};

    (db.kassaHarakatlari || []).forEach(h => {
      if (h.tur === 'chiqim' && h.sana.startsWith(currentMonthStr)) {
        const sumUzs = h.summaUzs || (h.valyuta === 'USD' ? h.summa * (h.kurs || valyutaKursi) : h.summa);
        map[h.kategoriya] = (map[h.kategoriya] || 0) + sumUzs;
      }
    });

    return map;
  }, [db.kassaHarakatlari, currentMonthStr, valyutaKursi]);

  // Edit modal holati
  const [isEditing, setIsEditing] = useState(false);
  const [tempLimits, setTempLimits] = useState<Record<string, string>>(() => {
    const res: Record<string, string> = {};
    XARAJAT_KATEGORIYALARI.forEach(c => {
      res[c.id] = (storedLimits[c.id] || 0).toString();
    });
    return res;
  });

  // Limitlarni saqlash
  const handleSaveLimits = () => {
    if (!isAdmin) return;
    const updated: Record<string, number> = {};
    Object.entries(tempLimits).forEach(([k, v]) => {
      updated[k] = parseFloat(v) || 0;
    });

    setDb(produce((draft: DbState) => {
      draft.xarajatBudjetlari = updated;
    }));

    logAudit('update_budget_limits', 'Moliya', "Oylik xarajat budjet limitlari yangilandi");
    toast.success("✅ Oylik xarajat limitlari muvaffaqiyatli saqlandi!");
    setIsEditing(false);
  };

  // Limitdan oshib ketgan xarajatlar tahlili
  const exceededCategories = useMemo(() => {
    return XARAJAT_KATEGORIYALARI.filter(c => {
      const limit = storedLimits[c.id] || 0;
      const spent = currentMonthExpenses[c.id] || 0;
      return limit > 0 && spent > limit;
    });
  }, [storedLimits, currentMonthExpenses]);

  // Jami limit va jami sarf
  const totalBudgetLimit = Object.values(storedLimits).reduce((a, b) => a + b, 0);
  const totalMonthSpent = Object.values(currentMonthExpenses).reduce((a, b) => a + b, 0);
  const totalPercentage = totalBudgetLimit > 0 ? (totalMonthSpent / totalBudgetLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      
      {/* ========================================================================= */}
      {/* 1. BUDJET VA OGOHLANTIRISHLAR BANNERI */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight">
                Rejali Xarajatlar & Budjet Limitlari ({currentMonthStr})
              </h2>
              <p className="text-xs text-[var(--text3)]">
                Oylik xarajat me'yorlari va limitdan oshib ketishni avtomatik nazorat qilish
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  const res: Record<string, string> = {};
                  XARAJAT_KATEGORIYALARI.forEach(c => {
                    res[c.id] = (storedLimits[c.id] || 0).toString();
                  });
                  setTempLimits(res);
                  setIsEditing(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Edit3 size={13} />
                <span>Limitlarni Tahrirlash</span>
              </button>
            )}
          </div>
        </div>

        {/* Ogohlantirishlar agar biron kategoriya limitdan oshgan bo'lsa */}
        {exceededCategories.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-1.5">
            <div className="flex items-center gap-2 font-black text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Diqqat! {exceededCategories.length} ta xarajat toifasida oylik limit oshib ketdi:</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {exceededCategories.map(c => {
                const limit = storedLimits[c.id] || 0;
                const spent = currentMonthExpenses[c.id] || 0;
                const diff = spent - limit;

                return (
                  <span key={c.id} className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-800 dark:text-rose-200 border border-rose-500/30">
                    {c.label}: +{formatUzs(diff)} UZS oshdi ({((spent / limit) * 100).toFixed(0)}%)
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Jami Budjet Sarfi Progress Bari */}
        <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[var(--text)]">Jami Oylik Budjet Sarfi:</span>
            <span className="font-black text-[var(--text)] tabular-nums">
              {formatUzs(totalMonthSpent)} / {formatUzs(totalBudgetLimit)} UZS ({totalPercentage.toFixed(1)}%)
            </span>
          </div>

          <div className="w-full h-3 bg-[var(--border)] rounded-full overflow-hidden p-0.5">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                totalPercentage > 100 ? "bg-rose-500" :
                totalPercentage > 80 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(100, Math.max(2, totalPercentage))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TAHRIRLASH REJIMI YOKI KO'RISH JADVALI */}
      {/* ========================================================================= */}
      {isEditing ? (
        <div className="bg-[var(--bg2)] border border-purple-500/40 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h3 className="font-black text-sm text-[var(--text)]">Kategoriyalar bo'yicha oylik limitlarni belgilang (UZS)</h3>
            <button onClick={() => setIsEditing(false)} className="text-[var(--text3)] hover:text-[var(--text)] p-1 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {XARAJAT_KATEGORIYALARI.map(c => {
              const Icon = c.icon;
              return (
                <div key={c.id} className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", c.bg, c.color)}>
                      <Icon size={14} />
                    </div>
                    <span className="text-xs font-bold text-[var(--text)]">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="100000"
                      value={tempLimits[c.id] || ''}
                      onChange={e => setTempLimits(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="0 UZS"
                      className="w-full px-3 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 tabular-nums"
                    />
                    <span className="text-[10px] font-bold text-[var(--text3)]">UZS</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={handleSaveLimits}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Save size={14} />
              <span>Limitlarni Saqlash</span>
            </button>
          </div>
        </div>
      ) : (
        /* KATEGORIYALAR BO'YICHA BUDJET HOLATI KARTALARI */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {XARAJAT_KATEGORIYALARI.map(c => {
            const Icon = c.icon;
            const limit = storedLimits[c.id] || 0;
            const spent = currentMonthExpenses[c.id] || 0;
            const percentage = limit > 0 ? (spent / limit) * 100 : 0;
            const remaining = limit - spent;
            const isExceeded = limit > 0 && spent > limit;

            return (
              <div 
                key={c.id} 
                className={cn(
                  "p-4 rounded-3xl bg-[var(--bg2)] border transition-all flex flex-col justify-between shadow-xs",
                  isExceeded ? "border-rose-500/50 bg-rose-500/5" : "border-[var(--border)] hover:border-purple-500/30"
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", c.bg, c.color)}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[var(--text)] block">{c.label}</span>
                      <span className="text-[10px] text-[var(--text3)]">
                        Limit: {limit > 0 ? `${formatCompact(limit)} UZS` : 'Belgilanmagan'}
                      </span>
                    </div>
                  </div>

                  <span className={cn(
                    "text-xs font-black px-2 py-0.5 rounded-lg tabular-nums",
                    isExceeded ? "bg-rose-500/20 text-rose-600" :
                    percentage > 80 ? "bg-amber-500/20 text-amber-600" :
                    "bg-emerald-500/10 text-emerald-600"
                  )}>
                    {percentage.toFixed(0)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="my-3 space-y-1.5">
                  <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        isExceeded ? "bg-rose-500" :
                        percentage > 80 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, Math.max(3, percentage))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="font-black text-[var(--text)]">{formatUzs(spent)} UZS</span>
                    <span className={cn(
                      "text-[10px] font-bold",
                      isExceeded ? "text-rose-600 font-black" : "text-[var(--text3)]"
                    )}>
                      {isExceeded 
                        ? `+${formatUzs(Math.abs(remaining))} UZS OSHDI` 
                        : `${formatUzs(remaining)} UZS qoldi`}
                    </span>
                  </div>
                </div>

                {/* Footer status */}
                <div className="pt-2 border-t border-[var(--border)] text-[10px] flex items-center justify-between text-[var(--text3)]">
                  <span>Holat:</span>
                  <span className={cn(
                    "font-bold",
                    isExceeded ? "text-rose-600 font-black" :
                    percentage > 80 ? "text-amber-600" : "text-emerald-600"
                  )}>
                    {isExceeded ? "⚠️ Limitdan oshgan" : percentage > 80 ? "⚡ Limitga yaqin" : "✅ Me'yorda"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
