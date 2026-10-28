import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { DollarSign, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { formatUzs, getTodayStr, getNowStr } from '../lib/utils';
import { CurrencyModal } from './CurrencyModal';
import { fetchLiveExchangeRates, calculateEffectiveRate, createRateHistoryItem } from '../services/currencyService';
import { produce } from 'immer';
import { DbState } from '../types';

export const CurrencyPill: React.FC = () => {
  const { db, setDb, currentUser } = useDb();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const config = db.valyutaKursConfig || {
    joriyKurs: db.valyutaKursi || 12850,
    cbuKurs: 12820,
    cbuDiff: 15.0,
    cbuSana: getTodayStr(),
    manba: 'cbu_avto',
    bozorUstamaTuri: 'summa',
    bozorUstamaQiymati: 30,
    avtoYangilash: true,
    oxirgiYangilanish: getNowStr(),
    tarix: []
  };

  const activeRate = db.valyutaKursi || config.joriyKurs || 12850;
  const diff = config.cbuDiff ?? 0;
  const manba = config.manba || 'cbu_avto';

  // Background daily auto-fetch on mount if auto-update is true
  useEffect(() => {
    const checkAndAutoUpdate = async () => {
      if (config.avtoYangilash === false) return;

      const today = getTodayStr();
      // If already updated today, skip
      if (config.cbuSana === today && config.oxirgiYangilanish?.startsWith(today)) {
        return;
      }

      try {
        const res = await fetchLiveExchangeRates();
        if (res.success && res.usdRate) {
          const effective = calculateEffectiveRate(config, res.usdRate);
          const historyItem = createRateHistoryItem(
            effective,
            res.usdRate,
            config.manba || 'cbu_avto',
            activeRate,
            'Avto-Sinxron (CBU)'
          );

          setDb(
            produce((draft: DbState) => {
              draft.valyutaKursi = effective;
              if (!draft.valyutaKursConfig) {
                draft.valyutaKursConfig = {
                  ...config,
                  joriyKurs: effective,
                  cbuKurs: res.usdRate,
                  cbuDiff: res.usdDiff,
                  cbuSana: res.date,
                  oxirgiYangilanish: getNowStr(),
                  tarix: [historyItem]
                };
              } else {
                draft.valyutaKursConfig.joriyKurs = effective;
                draft.valyutaKursConfig.cbuKurs = res.usdRate;
                draft.valyutaKursConfig.cbuDiff = res.usdDiff;
                draft.valyutaKursConfig.cbuSana = res.date;
                draft.valyutaKursConfig.oxirgiYangilanish = getNowStr();
                if (!Array.isArray(draft.valyutaKursConfig.tarix)) {
                  draft.valyutaKursConfig.tarix = [];
                }
                draft.valyutaKursConfig.tarix.unshift(historyItem);
              }
            })
          );
        }
      } catch (err) {
        console.warn("Kunlik avto-kurs yangilashda xatolik:", err);
      }
    };

    const timer = setTimeout(() => {
      checkAndAutoUpdate();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg2)] border border-[var(--border)] hover:border-emerald-500/50 shadow-xs transition-all duration-200 cursor-pointer group shrink-0 active:scale-95"
        title="Valyuta kursi, Markaziy Bank va tezkor konvertor kalkulyatori"
      >
        <div className="w-5 h-5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
          <DollarSign className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col items-start leading-tight">
          <div className="flex items-center gap-1">
            <span className="text-[11px] sm:text-[12px] font-black text-[var(--text)] tracking-tight">
              {formatUzs(activeRate)}
            </span>
            <span className="hidden sm:inline text-[10px] font-bold text-[var(--text3)]">so'm</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[9px] font-bold mt-0.5">
            {manba === 'cbu_avto' ? (
              <span className="text-blue-500">CBU Rasmiy</span>
            ) : manba === 'bozor_avto' ? (
              <span className="text-emerald-500">Bozor Kursi</span>
            ) : (
              <span className="text-purple-500">Qo'lda</span>
            )}

            {diff !== 0 && (
              <span className={`flex items-center ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {diff > 0 ? <TrendingUp className="w-2.5 h-2.5 ml-0.5" /> : <TrendingDown className="w-2.5 h-2.5 ml-0.5" />}
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </div>
        </div>
      </button>

      <CurrencyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
