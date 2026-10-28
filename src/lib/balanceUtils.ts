import { DbState, User, Transaction, Kontragent, ModelPrice, WarehouseName } from '../types';
import { createAuditLog } from './auditUtils';

const ALL_WAREHOUSES: WarehouseName[] = ['tepa', 'kotta', 'sort2'];

/**
 * Recalculates all clients' total volume (jami), balances (balans), 
 * purchase count (xaridlarSoni), first purchase date and last purchase date 
 * based strictly on all transactions (chiqim, tolov, vozvrat) and kassa movements.
 */
export const recalculateAllClientBalances = (db: DbState): DbState => {
  const kontragentlar = [...(db.kontragentlar || [])];
  
  const clientStats: Record<string, {
    totalQty: number;
    totalSale: number;
    totalPayment: number;
    purchaseCount: number;
    firstDate?: string;
    lastDate?: string;
  }> = {};

  const allTxs: Transaction[] = [
    ...(db.tepa?.transactions || []),
    ...(db.kotta?.transactions || []),
    ...(db.sort2?.transactions || [])
  ];

  const processedPaymentIds = new Set<string>();

  allTxs.forEach((t) => {
    const clientName = (t.kimdan || t.izoh || '').trim();
    if (!clientName) return;

    if (!clientStats[clientName]) {
      clientStats[clientName] = {
        totalQty: 0,
        totalSale: 0,
        totalPayment: 0,
        purchaseCount: 0,
      };
    }

    const stat = clientStats[clientName];
    if (t.amal === 'chiqim') {
      stat.totalQty += Number(t.soni || 0);
      stat.totalSale += Number(t.summa || 0);
      stat.purchaseCount += 1;
      if (t.sana) {
        if (!stat.firstDate || t.sana < stat.firstDate) stat.firstDate = t.sana;
        if (!stat.lastDate || t.sana > stat.lastDate) stat.lastDate = t.sana;
      }
    } else if (t.amal === 'tolov') {
      stat.totalPayment += Number(t.summa || 0);
      if (t.id) processedPaymentIds.add(t.id);
      if ((t as any).boglanishId) processedPaymentIds.add((t as any).boglanishId);
    }
  });

  // Also include vozvrat deductions if any
  (db.vozvratlar || []).forEach((v) => {
    const clientName = (v.mijoz || '').trim();
    if (!clientName) return;
    if (!clientStats[clientName]) {
      clientStats[clientName] = {
        totalQty: 0,
        totalSale: 0,
        totalPayment: 0,
        purchaseCount: 0,
      };
    }
    const stat = clientStats[clientName];
    stat.totalQty = Math.max(0, stat.totalQty - Number(v.jamiSoni || 0));
    if (v.tolovQaytarishTuri === 'qarzdan_ayirish') {
      stat.totalSale = Math.max(0, stat.totalSale - Number(v.summa || 0));
    }
  });

  // Include kassa incoming payments, deduplicated
  (db.kassaHarakatlari || []).forEach((k) => {
    const clientName = (k.kimgaKimdan || '').trim();
    if (!clientName) return;
    if (!clientStats[clientName]) {
      clientStats[clientName] = {
        totalQty: 0,
        totalSale: 0,
        totalPayment: 0,
        purchaseCount: 0,
      };
    }
    if (k.tur === 'kirim' && (k.kategoriya === 'savdo_tushumi' || k.kategoriya === 'qarz_tolovi')) {
      const isAlreadyCounted = (k.id && processedPaymentIds.has(k.id)) || (k.boglanishId && processedPaymentIds.has(k.boglanishId));
      if (!isAlreadyCounted) {
        const amount = Number(k.summaUzs || k.summa || 0);
        clientStats[clientName].totalPayment += amount;
        if (k.id) processedPaymentIds.add(k.id);
        if (k.boglanishId) processedPaymentIds.add(k.boglanishId);
      }
    }
  });

  // Update existing clients
  const updatedKontragentlar = kontragentlar.map((k) => {
    const name = k.ism.trim();
    const stat = clientStats[name];
    if (stat) {
      return {
        ...k,
        jami: stat.totalQty,
        balans: stat.totalSale - stat.totalPayment,
        xaridlarSoni: stat.purchaseCount,
        birinchiXarid: stat.firstDate || k.birinchiXarid || k.qoshilganSana,
        oxirgiXarid: stat.lastDate || k.oxirgiXarid || k.qoshilganSana
      };
    }
    return {
      ...k,
      jami: 0,
      balans: 0,
      xaridlarSoni: 0
    };
  });

  return {
    ...db,
    kontragentlar: updatedKontragentlar
  };
};

/**
 * Re-assigns selected transactions to a target client and recalculates balances.
 */
export const reassignTransactionsToClient = (
  db: DbState,
  transactionIds: string[],
  targetClientName: string,
  user: User
): DbState => {
  const newDb = { ...db };
  const idSet = new Set(transactionIds);
  const cleanTargetName = targetClientName.trim();
  if (!cleanTargetName) return db;

  let changedCount = 0;
  let totalQty = 0;
  let totalSum = 0;

  ALL_WAREHOUSES.forEach((ombor) => {
    if (newDb[ombor]?.transactions) {
      newDb[ombor] = {
        ...newDb[ombor],
        transactions: newDb[ombor].transactions.map((t) => {
          if (idSet.has(t.id)) {
            changedCount++;
            return {
              ...t,
              kimdan: cleanTargetName
            };
          }
          return t;
        })
      };
    }
  });

  // Ensure target client exists in kontragentlar
  if (!newDb.kontragentlar) newDb.kontragentlar = [];
  const existingClient = newDb.kontragentlar.find(
    k => k.ism.trim().toLowerCase() === cleanTargetName.toLowerCase()
  );
  if (!existingClient) {
    newDb.kontragentlar.push({
      id: `client_${Date.now()}`,
      ism: cleanTargetName,
      tel: '',
      manzil: '',
      izoh: '',
      jami: totalQty,
      balans: totalSum,
      qoshilganSana: new Date().toISOString().split('T')[0],
      birinchiXarid: new Date().toISOString().split('T')[0],
      oxirgiXarid: new Date().toISOString().split('T')[0],
      xaridlarSoni: 1,
      kategoriya: 'Ulgurji'
    });
  }

  // Recalculate all client stats
  const recalculatedDb = recalculateAllClientBalances(newDb);

  if (!recalculatedDb.auditLogs) recalculatedDb.auditLogs = [];
  recalculatedDb.auditLogs.unshift(
    createAuditLog(
      user,
      'reassign_transactions',
      'Chiqim',
      `${changedCount} ta chiqim operatsiyasi "${cleanTargetName}" mijoziga biriktirildi (${totalQty} juft, ${totalSum.toLocaleString()} so'm)`
    )
  );

  return recalculatedDb;
};

/**
 * Tries to detect original client names from audit logs, izoh, or notes.
 */
export const findClientRestorationSuggestions = (db: DbState) => {
  const suggestions: Array<{
    txId: string;
    sana: string;
    model: string;
    soni: number;
    currentKimdan: string;
    suggestedKimdan: string;
    reason: string;
  }> = [];

  const knownClientNames = (db.kontragentlar || []).map(k => k.ism.trim());
  const auditLogs = db.auditLogs || [];

  const allTxs: Transaction[] = [
    ...(db.tepa?.transactions || []),
    ...(db.kotta?.transactions || []),
    ...(db.sort2?.transactions || [])
  ];

  allTxs.forEach(t => {
    if (t.amal !== 'chiqim') return;
    const current = (t.kimdan || '').trim();

    // 1. Check if izoh mentions a known client name
    if (t.izoh) {
      for (const clientName of knownClientNames) {
        if (
          clientName.toLowerCase() !== current.toLowerCase() &&
          t.izoh.toLowerCase().includes(clientName.toLowerCase())
        ) {
          suggestions.push({
            txId: t.id,
            sana: t.sana,
            model: t.model,
            soni: t.soni,
            currentKimdan: current,
            suggestedKimdan: clientName,
            reason: `Izohda "${clientName}" mijoz nomi mavjud`
          });
          return;
        }
      }
    }

    // 2. Check audit logs for mentions of original client on the same date
    for (const log of auditLogs) {
      if (log.details && log.date && log.date.includes(t.sana)) {
        for (const clientName of knownClientNames) {
          if (
            clientName.toLowerCase() !== current.toLowerCase() &&
            log.details.includes(clientName)
          ) {
            suggestions.push({
              txId: t.id,
              sana: t.sana,
              model: t.model,
              soni: t.soni,
              currentKimdan: current,
              suggestedKimdan: clientName,
              reason: `Audit logida (${log.details.slice(0, 40)}...) qayd etilgan`
            });
            return;
          }
        }
      }
    }
  });

  return suggestions;
};

export interface UnpricedStats {
  unpricedChiqimCount: number;
  unpricedChiqimQty: number;
  resolvableChiqimCount: number;
  resolvableChiqimQty: number;
  estimatedTotalSum: number;
  impactedClients: string[];
  impactedModels: string[];
  unpricedKirimCount: number;
  unpricedKirimQty: number;
  resolvableKirimCount: number;
  resolvableKirimQty: number;
  estimatedTotalKirimCost: number;
  details: Array<{
    id: string;
    ombor: WarehouseName;
    amal: 'chiqim' | 'kirim';
    model: string;
    olcham: string;
    soni: number;
    kimdan: string;
    sana: string;
    currentSumma: number;
    unitPrice: number;
    newSumma: number;
    canResolve: boolean;
  }>;
}

/**
 * Robust case-insensitive and whitespace-trimmed model price finder
 */
export const findModelPrice = (
  prices: Record<string, ModelPrice> | undefined,
  modelName: string
): ModelPrice | undefined => {
  if (!prices || !modelName) return undefined;
  if (prices[modelName]) return prices[modelName];

  const trimmed = modelName.trim();
  if (prices[trimmed]) return prices[trimmed];

  const lower = trimmed.toLowerCase();
  const foundKey = Object.keys(prices).find(k => k.trim().toLowerCase() === lower);
  if (foundKey && prices[foundKey]) return prices[foundKey];

  return undefined;
};

export interface UnpricedKirimModelGroup {
  model: string;
  totalQty: number;
  txCount: number;
  unpricedQty: number;
  unpricedCount: number;
  warehouses: Array<WarehouseName>;
  dates: string[];
  catalogCost: number;
  catalogSale: number;
  suggestedCost: number;
}

/**
 * Groups all unpriced kirim transactions by model name
 */
export const getUnpricedKirimModelGroups = (db: DbState): UnpricedKirimModelGroup[] => {
  const prices = db.prices || {};
  const groups: Record<string, {
    model: string;
    totalQty: number;
    txCount: number;
    warehouses: Set<WarehouseName>;
    dates: Set<string>;
    catalogCost: number;
    catalogSale: number;
  }> = {};

  ALL_WAREHOUSES.forEach(omborKey => {
    const txs = db[omborKey]?.transactions || [];
    txs.forEach(t => {
      if (t.amal !== 'kirim') return;
      const summa = Number(t.summa || 0);
      const soni = Number(t.soni || 0);
      if (summa === 0 && soni > 0 && t.model) {
        const mKey = t.model.trim();
        if (!groups[mKey]) {
          const mPrice = findModelPrice(prices, t.model);
          groups[mKey] = {
            model: t.model,
            totalQty: 0,
            txCount: 0,
            warehouses: new Set(),
            dates: new Set(),
            catalogCost: Number(mPrice?.cost || 0),
            catalogSale: Number(mPrice?.sale || 0),
          };
        }
        groups[mKey].totalQty += soni;
        groups[mKey].txCount += 1;
        groups[mKey].warehouses.add(omborKey);
        if (t.sana) groups[mKey].dates.add(t.sana);
      }
    });
  });

  return Object.values(groups).map(g => ({
    model: g.model,
    totalQty: g.totalQty,
    txCount: g.txCount,
    unpricedQty: g.totalQty,
    unpricedCount: g.txCount,
    warehouses: Array.from(g.warehouses),
    dates: Array.from(g.dates),
    catalogCost: g.catalogCost,
    catalogSale: g.catalogSale,
    suggestedCost: g.catalogCost > 0 ? g.catalogCost : (g.catalogSale > 0 ? Math.round(g.catalogSale * 0.75) : 0),
  }));
};

/**
 * Analyses transactions to see how many 0-sum transactions exist and can be priced based on db.prices.
 */
export const getUnpricedSalesStats = (db: DbState): UnpricedStats => {
  const prices = db.prices || {};
  let unpricedChiqimCount = 0;
  let unpricedChiqimQty = 0;
  let resolvableChiqimCount = 0;
  let resolvableChiqimQty = 0;
  let estimatedTotalSum = 0;
  const impactedClients = new Set<string>();
  const impactedModels = new Set<string>();
  let unpricedKirimCount = 0;
  let unpricedKirimQty = 0;
  let resolvableKirimCount = 0;
  let resolvableKirimQty = 0;
  let estimatedTotalKirimCost = 0;
  const details: UnpricedStats['details'] = [];

  ALL_WAREHOUSES.forEach(omborKey => {
    const txs = db[omborKey]?.transactions || [];
    txs.forEach(t => {
      const isChiqim = t.amal === 'chiqim';
      const isKirim = t.amal === 'kirim';
      if (!isChiqim && !isKirim) return;

      const currentSumma = Number(t.summa || 0);
      const soni = Number(t.soni || 0);

      if (currentSumma === 0 && soni > 0) {
        const modelPrice = findModelPrice(prices, t.model);
        if (isChiqim) {
          unpricedChiqimCount++;
          unpricedChiqimQty += soni;
          const salePrice = Number(modelPrice?.sale || 0);
          const canResolve = salePrice > 0;
          if (canResolve) {
            resolvableChiqimCount++;
            resolvableChiqimQty += soni;
            const newSumma = salePrice * soni;
            estimatedTotalSum += newSumma;
            if (t.kimdan) impactedClients.add(t.kimdan);
            impactedModels.add(t.model);
            details.push({
              id: t.id,
              ombor: omborKey,
              amal: 'chiqim',
              model: t.model,
              olcham: t.olcham,
              soni,
              kimdan: t.kimdan || '—',
              sana: t.sana || '',
              currentSumma: 0,
              unitPrice: salePrice,
              newSumma,
              canResolve: true
            });
          } else {
            details.push({
              id: t.id,
              ombor: omborKey,
              amal: 'chiqim',
              model: t.model,
              olcham: t.olcham,
              soni,
              kimdan: t.kimdan || '—',
              sana: t.sana || '',
              currentSumma: 0,
              unitPrice: 0,
              newSumma: 0,
              canResolve: false
            });
          }
        } else if (isKirim) {
          unpricedKirimCount++;
          unpricedKirimQty += soni;
          const costPrice = Number(modelPrice?.cost || 0);
          const canResolve = costPrice > 0;
          if (canResolve) {
            resolvableKirimCount++;
            resolvableKirimQty += soni;
            const newSumma = costPrice * soni;
            estimatedTotalKirimCost += newSumma;
            details.push({
              id: t.id,
              ombor: omborKey,
              amal: 'kirim',
              model: t.model,
              olcham: t.olcham,
              soni,
              kimdan: t.kimdan || '—',
              sana: t.sana || '',
              currentSumma: 0,
              unitPrice: costPrice,
              newSumma,
              canResolve: true
            });
          } else {
            details.push({
              id: t.id,
              ombor: omborKey,
              amal: 'kirim',
              model: t.model,
              olcham: t.olcham,
              soni,
              kimdan: t.kimdan || '—',
              sana: t.sana || '',
              currentSumma: 0,
              unitPrice: 0,
              newSumma: 0,
              canResolve: false
            });
          }
        }
      }
    });
  });

  return {
    unpricedChiqimCount,
    unpricedChiqimQty,
    resolvableChiqimCount,
    resolvableChiqimQty,
    estimatedTotalSum,
    impactedClients: Array.from(impactedClients),
    impactedModels: Array.from(impactedModels),
    unpricedKirimCount,
    unpricedKirimQty,
    resolvableKirimCount,
    resolvableKirimQty,
    estimatedTotalKirimCost,
    details
  };
};

/**
 * Specifically synchronizes all unpriced (0-sum) Kirim transactions with catalog cost prices (db.prices[model].cost).
 */
export const syncUnpricedKirimTransactionsWithPrices = (
  db: DbState,
  user?: User,
  targetModel?: string
): {
  newDb: DbState;
  updatedKirimCount: number;
  updatedKirimQty: number;
  totalRecalculatedCost: number;
  impactedModelsCount: number;
} => {
  const prices = db.prices || {};

  let updatedKirimCount = 0;
  let updatedKirimQty = 0;
  let totalRecalculatedCost = 0;
  const impactedModels = new Set<string>();

  const newWarehouses = { ...db };

  ALL_WAREHOUSES.forEach(omborKey => {
    if (!db[omborKey]?.transactions) return;

    const updatedTransactions = db[omborKey].transactions.map(t => {
      if (t.amal !== 'kirim') return t;
      if (targetModel && t.model?.trim().toLowerCase() !== targetModel.trim().toLowerCase()) return t;

      const soni = Number(t.soni || 0);
      const currentSumma = Number(t.summa || 0);
      const modelPrice = findModelPrice(prices, t.model);
      const costPrice = Number(modelPrice?.cost || 0);

      if (currentSumma === 0 && soni > 0 && costPrice > 0) {
        const newSumma = costPrice * soni;
        updatedKirimCount++;
        updatedKirimQty += soni;
        totalRecalculatedCost += newSumma;
        impactedModels.add(t.model);

        return {
          ...t,
          summa: newSumma
        };
      }

      return t;
    });

    newWarehouses[omborKey] = {
      ...db[omborKey],
      transactions: updatedTransactions
    };
  });

  const newDb: DbState = {
    ...db,
    ...newWarehouses,
    auditLogs: [...(db.auditLogs || [])]
  };

  // Add audit log
  if (updatedKirimCount > 0) {
    const userObj = user || { id: 'sys', ism: 'Tizim / Admin', rol: 'admin', pin: '0000' };
    newDb.auditLogs.unshift(
      createAuditLog(
        userObj,
        'sync_unpriced_kirim',
        'Kirim & Narxlar',
        `Avvalgi ${updatedKirimCount} ta narxsiz kirim tovarlariga tan narxlar o'rnatildi (+${totalRecalculatedCost.toLocaleString()} UZS). ${impactedModels.size} ta model yangilandi.`,
        'info'
      )
    );
  }

  return {
    newDb,
    updatedKirimCount,
    updatedKirimQty,
    totalRecalculatedCost,
    impactedModelsCount: impactedModels.size
  };
};

/**
 * Batch applies given cost prices to models and updates all corresponding past unpriced kirims
 */
export const batchApplyCostPricesToKirims = (
  db: DbState,
  modelPricesMap: Record<string, number>, // modelName -> costPrice
  user?: User
): {
  newDb: DbState;
  updatedKirimCount: number;
  updatedKirimQty: number;
  totalRecalculatedCost: number;
  impactedModelsCount: number;
} => {
  const newDb: DbState = JSON.parse(JSON.stringify(db));
  if (!newDb.prices) newDb.prices = {};

  const today = new Date().toISOString().split('T')[0];
  const userName = user?.ism || 'Admin';

  // 1. Update prices catalog for all provided models with cost > 0
  Object.entries(modelPricesMap).forEach(([modelName, costPrice]) => {
    const cost = Number(costPrice || 0);
    if (cost <= 0) return;

    let targetKey = modelName.trim();
    const existing = findModelPrice(newDb.prices, modelName);
    if (existing) {
      const foundKey = Object.keys(newDb.prices!).find(k => k.trim().toLowerCase() === modelName.trim().toLowerCase());
      if (foundKey) targetKey = foundKey;
    }

    if (!newDb.prices![targetKey]) {
      newDb.prices![targetKey] = {
        cost,
        sale: 0,
        history: [{ date: today, cost, sale: 0, changedBy: `${userName} (Eski kirimlar orqali)` }]
      };
    } else {
      newDb.prices![targetKey].cost = cost;
      if (!newDb.prices![targetKey].history) newDb.prices![targetKey].history = [];
      newDb.prices![targetKey].history.push({
        date: today,
        cost,
        sale: newDb.prices![targetKey].sale || 0,
        changedBy: `${userName} (Eski kirimlar orqali)`
      });
    }
  });

  // 2. Update all unpriced transactions for these models
  let updatedKirimCount = 0;
  let updatedKirimQty = 0;
  let totalRecalculatedCost = 0;
  const impactedModels = new Set<string>();

  ALL_WAREHOUSES.forEach(omborKey => {
    if (!newDb[omborKey]?.transactions) return;

    newDb[omborKey].transactions = newDb[omborKey].transactions.map(t => {
      if (t.amal !== 'kirim') return t;
      const soni = Number(t.soni || 0);
      const currentSumma = Number(t.summa || 0);

      if (currentSumma === 0 && soni > 0) {
        let costPrice = 0;
        const tModel = (t.model || '').trim().toLowerCase();
        
        // Check in direct map
        const mapEntry = Object.entries(modelPricesMap).find(
          ([k]) => k.trim().toLowerCase() === tModel
        );
        if (mapEntry && Number(mapEntry[1]) > 0) {
          costPrice = Number(mapEntry[1]);
        } else {
          const p = findModelPrice(newDb.prices, t.model);
          if (p && Number(p.cost || 0) > 0) {
            costPrice = Number(p.cost);
          }
        }

        if (costPrice > 0) {
          const newSumma = costPrice * soni;
          updatedKirimCount++;
          updatedKirimQty += soni;
          totalRecalculatedCost += newSumma;
          impactedModels.add(t.model);

          return {
            ...t,
            summa: newSumma
          };
        }
      }

      return t;
    });
  });

  // Add audit log
  if (updatedKirimCount > 0) {
    if (!newDb.auditLogs) newDb.auditLogs = [];
    const userObj = user || { id: 'sys', ism: 'Tizim / Admin', rol: 'admin', pin: '0000' };
    newDb.auditLogs.unshift(
      createAuditLog(
        userObj,
        'batch_sync_kirim_prices',
        'Kirim & Narxlar',
        `Avvalgi ${updatedKirimCount} ta kirim tovarlariga tan narxlar biriktirildi (+${totalRecalculatedCost.toLocaleString()} UZS). ${impactedModels.size} ta model yangilandi.`,
        'info'
      )
    );
  }

  return {
    newDb,
    updatedKirimCount,
    updatedKirimQty,
    totalRecalculatedCost,
    impactedModelsCount: impactedModels.size
  };
};

/**
 * Updates all unpriced (0-sum) transactions (both chiqim and kirim) with current prices from db.prices
 * and automatically recalculates all client balances, purchase volumes, and debts.
 */
export const syncUnpricedTransactionsWithCurrentPrices = (
  db: DbState,
  user?: User,
  targetModel?: string // optional: if passed, only sync this specific model
): {
  newDb: DbState;
  updatedChiqimCount: number;
  updatedChiqimQty: number;
  totalRecalculatedSum: number;
  impactedClientsCount: number;
  updatedKirimCount: number;
  updatedKirimQty: number;
  totalRecalculatedKirimCost: number;
} => {
  const newDb: DbState = JSON.parse(JSON.stringify(db));
  const prices = newDb.prices || {};

  let updatedChiqimCount = 0;
  let updatedChiqimQty = 0;
  let totalRecalculatedSum = 0;
  const impactedClients = new Set<string>();

  let updatedKirimCount = 0;
  let updatedKirimQty = 0;
  let totalRecalculatedKirimCost = 0;

  ALL_WAREHOUSES.forEach(omborKey => {
    if (!newDb[omborKey]?.transactions) return;

    newDb[omborKey].transactions = newDb[omborKey].transactions.map(t => {
      if (targetModel && t.model?.trim().toLowerCase() !== targetModel.trim().toLowerCase()) return t;

      const soni = Number(t.soni || 0);
      const currentSumma = Number(t.summa || 0);
      const modelPrice = findModelPrice(prices, t.model);

      if (t.amal === 'chiqim' && currentSumma === 0 && soni > 0) {
        const salePrice = Number(modelPrice?.sale || 0);
        const costPrice = Number(modelPrice?.cost || 0);

        if (salePrice > 0) {
          const newSumma = salePrice * soni;
          const newFoyda = (salePrice - costPrice) * soni;

          updatedChiqimCount++;
          updatedChiqimQty += soni;
          totalRecalculatedSum += newSumma;
          if (t.kimdan) impactedClients.add(t.kimdan);

          return {
            ...t,
            summa: newSumma,
            foyda: newFoyda
          };
        }
      } else if (t.amal === 'kirim' && currentSumma === 0 && soni > 0) {
        const costPrice = Number(modelPrice?.cost || 0);
        if (costPrice > 0) {
          const newSumma = costPrice * soni;
          updatedKirimCount++;
          updatedKirimQty += soni;
          totalRecalculatedKirimCost += newSumma;
          return {
            ...t,
            summa: newSumma
          };
        }
      }

      return t;
    });
  });

  // Automatically recalculate all client balances, purchase volumes and debts
  const recalculatedDb = recalculateAllClientBalances(newDb);

  // Add audit log
  if (updatedChiqimCount > 0 || updatedKirimCount > 0) {
    if (!recalculatedDb.auditLogs) recalculatedDb.auditLogs = [];
    const userObj = user || { id: 'sys', ism: 'Tizim / Admin', rol: 'admin', pin: '0000' };
    recalculatedDb.auditLogs.unshift(
      createAuditLog(
        userObj,
        'sync_unpriced_transactions',
        'Narxlar & CRM',
        `Eski tranzaksiyalar yangilandi: ${updatedChiqimCount} ta chiqim (+${totalRecalculatedSum.toLocaleString()} UZS), ${updatedKirimCount} ta kirim (+${totalRecalculatedKirimCost.toLocaleString()} UZS).`,
        'high'
      )
    );
  }

  return {
    newDb: recalculatedDb,
    updatedChiqimCount,
    updatedChiqimQty,
    totalRecalculatedSum,
    impactedClientsCount: impactedClients.size,
    updatedKirimCount,
    updatedKirimQty,
    totalRecalculatedKirimCost
  };
};

