import { useDb } from '../context/DbContext';
import { useMemo, useCallback } from 'react';
import { WarehouseName } from '../types';

export const useStock = (warehouseName?: WarehouseName) => {
  const { db, currentOmbor } = useDb();
  const actualWarehouse = warehouseName || currentOmbor;
  const rawStock = db[actualWarehouse]?.stock;
  
  const { stock, totalsMap } = useMemo(() => {
    const sanitized: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    if (rawStock) {
      for (const model in rawStock) {
        sanitized[model] = {};
        let sum = 0;
        const modelSizes = rawStock[model];
        if (modelSizes) {
          for (const size in modelSizes) {
            const val = Math.max(0, Number(modelSizes[size]) || 0);
            sanitized[model][size] = val;
            sum += val;
          }
        }
        totals[model] = sum;
      }
    }
    return { stock: sanitized, totalsMap: totals };
  }, [rawStock]);

  const getStockForModel = useCallback((model: string) => stock[model] || {}, [stock]);

  const getQuantity = useCallback((model: string, size: string) => {
    return stock[model]?.[size] || 0;
  }, [stock]);

  const getTotalQuantity = useCallback((model: string) => {
    return totalsMap[model] || 0;
  }, [totalsMap]);

  return { stock, getStockForModel, getQuantity, getTotalQuantity, totalsMap };
};
