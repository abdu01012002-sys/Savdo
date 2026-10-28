import { ValyutaCbuItem, ValyutaKursConfig, ValyutaTarixiItem } from '../types';
import { generateId, getTodayStr, getNowStr } from '../lib/utils';

export interface FetchRateResult {
  success: boolean;
  usdRate: number;
  usdDiff: number;
  date: string;
  source: string;
  allRates?: Record<string, { rate: number; diff: number; name: string }>;
  error?: string;
}

/**
 * Parses CBU item array and returns structured rates
 */
function parseCbuData(data: ValyutaCbuItem[]): FetchRateResult | null {
  if (!Array.isArray(data) || data.length === 0) return null;

  const usdItem = data.find(item => item.Ccy === 'USD');
  const eurItem = data.find(item => item.Ccy === 'EUR');
  const rubItem = data.find(item => item.Ccy === 'RUB');
  const cnyItem = data.find(item => item.Ccy === 'CNY');
  const kztItem = data.find(item => item.Ccy === 'KZT');
  const tryItem = data.find(item => item.Ccy === 'TRY');

  if (usdItem) {
    const usdRate = parseFloat(usdItem.Rate) || 12850;
    const usdDiff = parseFloat(usdItem.Diff) || 0;
    
    const allRates: Record<string, { rate: number; diff: number; name: string }> = {
      USD: { rate: usdRate, diff: usdDiff, name: "AQSH Dollari" },
      EUR: { rate: parseFloat(eurItem?.Rate || '0'), diff: parseFloat(eurItem?.Diff || '0'), name: "Yevro" },
      RUB: { rate: parseFloat(rubItem?.Rate || '0'), diff: parseFloat(rubItem?.Diff || '0'), name: "Rossiya Rubli" },
      CNY: { rate: parseFloat(cnyItem?.Rate || '0'), diff: parseFloat(cnyItem?.Diff || '0'), name: "Xitoy Yuani" },
      KZT: { rate: parseFloat(kztItem?.Rate || '0'), diff: parseFloat(kztItem?.Diff || '0'), name: "Qozog'iston Tengesi" },
      TRY: { rate: parseFloat(tryItem?.Rate || '0'), diff: parseFloat(tryItem?.Diff || '0'), name: "Turk Lirasi" },
    };

    return {
      success: true,
      usdRate,
      usdDiff,
      date: usdItem.Date || getTodayStr(),
      source: "O'zbekiston Markaziy Banki (CBU.uz)",
      allRates
    };
  }
  return null;
}

/**
 * Markaziy Bank (CBU) va zaxira API'laridan eng so'nggi valyuta kurslarini tortib oladi
 */
export async function fetchLiveExchangeRates(): Promise<FetchRateResult> {
  // 1. Birinchi manba: Server proksi orqali CBU API (CORS va tarmoq bloklarini aylanib o'tadi)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const proxyRes = await fetch('/api/currency/rates', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.success && json.data) {
        const parsed = parseCbuData(json.data);
        if (parsed) return parsed;
      }
    }
  } catch {
    // Silent fail over to next direct sources
  }

  // 2. To'g'ridan-to'g'ri CBU API (agar serverdan tashqarida bo'lsa)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: ValyutaCbuItem[] = await response.json();
      const parsed = parseCbuData(data);
      if (parsed) return parsed;
    }
  } catch {
    // Silent fallback to Open Exchange Rates
  }

  // 3. Zaxira manba: Global FX Gateway (Open Exchange Rates)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.rates && data.rates.UZS) {
        const uzsRate = Math.round(data.rates.UZS);
        return {
          success: true,
          usdRate: uzsRate,
          usdDiff: 0,
          date: getTodayStr(),
          source: "Global FX Rate Gateway (Zaxira)",
          allRates: {
            USD: { rate: uzsRate, diff: 0, name: "AQSH Dollari" }
          }
        };
      }
    }
  } catch {
    // Fallback quietly to local calculation
  }

  // 4. Oflayn / Zaxira hisob
  return {
    success: false,
    usdRate: 12850,
    usdDiff: 0,
    date: getTodayStr(),
    source: "Lokal hisob-kitob (Oflayn)",
    error: "Valyuta serveri bilan ulanib bo'lmadi."
  };
}

/**
 * Konfiguratsiyaga qarab amaldagi (effektiv) kursni hisoblaydi
 */
export function calculateEffectiveRate(config: Partial<ValyutaKursConfig>, baseCbuRate: number): number {
  const manba = config.manba || 'cbu_avto';

  if (manba === 'qolda') {
    return Number(config.joriyKurs) || baseCbuRate || 12850;
  }

  if (manba === 'bozor_avto') {
    const ustamaTuri = config.bozorUstamaTuri || 'summa';
    const ustamaQiymati = Number(config.bozorUstamaQiymati) || 0;

    if (ustamaTuri === 'foiz') {
      const calculated = baseCbuRate * (1 + ustamaQiymati / 100);
      return Math.round(calculated);
    } else {
      return Math.round(baseCbuRate + ustamaQiymati);
    }
  }

  return Math.round(baseCbuRate);
}

/**
 * Tarix yozuvi ob'ektini yaratish
 */
export function createRateHistoryItem(
  yangiKurs: number,
  cbuKurs: number,
  manba: 'cbu_avto' | 'bozor_avto' | 'qolda',
  oldingiKurs: number,
  xodim: string
): ValyutaTarixiItem {
  return {
    id: 'rate-' + generateId(),
    sana: getTodayStr(),
    vaqt: getNowStr().split(', ')[1] || new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
    kurs: yangiKurs,
    cbuKurs: cbuKurs,
    manba: manba,
    farq: yangiKurs - oldingiKurs,
    xodim: xodim
  };
}

/**
 * USD dan UZS ga o'tkazish
 */
export function usdToUzs(usdAmount: number, rate: number): number {
  return Math.round((usdAmount || 0) * (rate || 12850));
}

/**
 * UZS dan USD ga o'tkazish
 */
export function uzsToUsd(uzsAmount: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return Number(((uzsAmount || 0) / rate).toFixed(2));
}
