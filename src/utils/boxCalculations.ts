import { ALL_SIZES } from '../lib/utils';

export interface BoxPreset {
  id: string;
  name: string;
  shortName: string;
  sizes: Record<string, number>;
  total: number;
  description: string;
}

export const ACTIVE_BOX_PRESETS: BoxPreset[] = [
  { 
    id: 'standard-8', 
    name: 'Standart 8-lik (40–44)', 
    shortName: '8-lik Standart',
    sizes: { '39': 0, '40': 1, '41': 2, '42': 2, '43': 2, '44': 1, '45': 0 }, 
    total: 8,
    description: '40:1, 41:2, 42:2, 43:2, 44:1'
  },
  { 
    id: 'standard-10-full', 
    name: '10-lik To\'liq Seriya (39–45)', 
    shortName: '10-lik To\'liq (39-45)',
    sizes: { '39': 1, '40': 1, '41': 2, '42': 2, '43': 2, '44': 1, '45': 1 }, 
    total: 10,
    description: '39:1, 40:1, 41:2, 42:2, 43:2, 44:1, 45:1'
  },
  { 
    id: 'standard-10-mid', 
    name: '10-lik Markaziy (39–44)', 
    shortName: '10-lik (39-44)',
    sizes: { '39': 1, '40': 1, '41': 2, '42': 3, '43': 2, '44': 1, '45': 0 }, 
    total: 10,
    description: '39:1, 40:1, 41:2, 42:3, 43:2, 44:1'
  },
  { 
    id: 'full-7', 
    name: '7-lik Komplekt (39–45)', 
    shortName: '7-lik Komplekt',
    sizes: { '39': 1, '40': 1, '41': 1, '42': 1, '43': 1, '44': 1, '45': 1 }, 
    total: 7,
    description: 'Har bir razmerdan 1 juft'
  },
  { 
    id: 'full-14', 
    name: '14-lik Katta Seriya (39–45)', 
    shortName: '14-lik Katta',
    sizes: { '39': 2, '40': 2, '41': 2, '42': 2, '43': 2, '44': 2, '45': 2 }, 
    total: 14,
    description: 'Har bir razmerdan 2 juft'
  },
];

export const BOX_PRESETS = ACTIVE_BOX_PRESETS;

export interface BoxStatsResult {
  fullBoxes: number;
  boxedPairs: number;
  loosePairs: number;
  total: number;
  // Qutilarga kirmay ortiqcha qolgan razmerlar
  looseBySizes: Record<string, number>;
  // Keyingi 1 ta qutini to'ldirish uchun yetishmayotgan razmerlar va nechta juft kerakligi
  neededForNextBox: Record<string, number>;
  // Asosiy to'siq bo'layotgan o'lcham (bottleneck)
  bottleneckSize?: string;
  bottleneckShortage?: number;
  // Seriya qamrovi foizi
  boxedRatioPercent: number;
}

/**
 * Berilgan o'lchamlar zaxirasi va quti shabloni bo'yicha to'liq qutilar va ortiqchalarni hisoblaydi
 */
export function calculateBoxRun(
  stockSizes: Record<string, number | undefined>,
  boxPreset: BoxPreset
): BoxStatsResult {
  const stock: Record<string, number> = {};
  ALL_SIZES.forEach(sz => {
    stock[sz] = Number(stockSizes[sz]) || 0;
  });

  const total = Object.values(stock).reduce((a, b) => a + b, 0);

  // Qaysi o'lchamlar ushbu quti uchun talab qilinadi (talab > 0)
  const requiredSizes = ALL_SIZES.filter(sz => (boxPreset.sizes[sz] || 0) > 0);

  if (requiredSizes.length === 0 || total === 0) {
    return {
      fullBoxes: 0,
      boxedPairs: 0,
      loosePairs: total,
      total,
      looseBySizes: { ...stock },
      neededForNextBox: { ...boxPreset.sizes },
      boxedRatioPercent: 0
    };
  }

  // Har bir talab qilingan o'lcham nechtadan to'liq qutiga yetadi
  const possibleBoxesPerSize = requiredSizes.map(sz => {
    const need = boxPreset.sizes[sz] || 1;
    const have = stock[sz] || 0;
    return Math.floor(have / need);
  });

  const fullBoxes = Math.max(0, Math.min(...possibleBoxesPerSize));
  const boxedPairs = fullBoxes * boxPreset.total;
  const loosePairs = Math.max(0, total - boxedPairs);

  // Ortiqcha qolgan o'lchamlar
  const looseBySizes: Record<string, number> = {};
  ALL_SIZES.forEach(sz => {
    const usedInBoxes = fullBoxes * (boxPreset.sizes[sz] || 0);
    const remaining = Math.max(0, (stock[sz] || 0) - usedInBoxes);
    looseBySizes[sz] = remaining;
  });

  // Keyingi qutini to'ldirish uchun nechta juft kerak
  const neededForNextBox: Record<string, number> = {};
  let worstShortage = 0;
  let worstSize: string | undefined = undefined;

  requiredSizes.forEach(sz => {
    const neededInNext = (fullBoxes + 1) * (boxPreset.sizes[sz] || 0);
    const have = stock[sz] || 0;
    const diff = Math.max(0, neededInNext - have);
    if (diff > 0) {
      neededForNextBox[sz] = diff;
      if (diff > worstShortage) {
        worstShortage = diff;
        worstSize = sz;
      }
    }
  });

  const boxedRatioPercent = total > 0 ? Math.round((boxedPairs / total) * 100) : 0;

  return {
    fullBoxes,
    boxedPairs,
    loosePairs,
    total,
    looseBySizes,
    neededForNextBox,
    bottleneckSize: worstSize,
    bottleneckShortage: worstShortage,
    boxedRatioPercent
  };
}
