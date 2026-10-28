import React from 'react';
import { AlertTriangle, MapPin } from 'lucide-react';
import { DbState } from '../types';

interface Props {
  db: DbState;
  targetWarehouse?: 'tepa' | 'kotta';
}

export default function LowStockAlert({ db, targetWarehouse }: Props) {
  const threshold = 5; // Kritik daraja
  const lowStockItems: { model: string, size: string, quantity: number, warehouse: string }[] = [];

  const checkWarehouse = (warehouseData: typeof db.tepa, warehouseName: string) => {
    Object.entries(warehouseData.stock).forEach(([model, sizes]) => {
      Object.entries(sizes).forEach(([size, quantity]) => {
        if (quantity > 0 && quantity <= threshold) {
          lowStockItems.push({ model, size, quantity, warehouse: warehouseName });
        }
      });
    });
  };

  if (!targetWarehouse || targetWarehouse === 'tepa') checkWarehouse(db.tepa, 'Tepa');
  if (!targetWarehouse || targetWarehouse === 'kotta') checkWarehouse(db.kotta, 'Kotta');

  // Sort by quantity ascending
  lowStockItems.sort((a, b) => a.quantity - b.quantity);

  if (lowStockItems.length === 0) return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
         <span className="text-2xl">🎉</span>
      </div>
      <h3 className="font-bold text-[var(--text)] text-lg mb-1">Barcha tovarlar yetarli!</h3>
      <p className="text-sm text-[var(--text3)]">Kam qolgan mahsulotlar (≤{threshold} ta) topilmadi.</p>
    </div>
  );

  return (
    <div className="bg-rose-50/50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30 rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-rose-100 dark:border-rose-900/30 flex items-center justify-between bg-rose-100/30 dark:bg-rose-900/20">
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Kam qolgan tovarlar (≤{threshold})</h3>
        </div>
        <div className="bg-rose-200 dark:bg-rose-800/50 text-rose-800 dark:text-rose-200 text-[10px] font-black px-1.5 py-0.5 rounded-md">
          {lowStockItems.length} ta
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-rose-50/50 dark:bg-rose-900/10 text-rose-600/70 dark:text-rose-400/70">
            <tr>
              <th className="px-3 py-1.5 font-semibold">Ombor</th>
              <th className="px-3 py-1.5 font-semibold">Model</th>
              <th className="px-3 py-1.5 font-semibold w-20">O'lcham</th>
              <th className="px-3 py-1.5 font-semibold w-20">Qoldiq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-100 dark:divide-rose-900/30">
            {lowStockItems.map((item, i) => (
              <tr key={i} className="hover:bg-white dark:hover:bg-rose-950/20 transition-colors">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1 text-rose-600/80 dark:text-rose-400/80">
                    <MapPin className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase">{item.warehouse}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 font-bold text-rose-900 dark:text-rose-100">
                  {item.model}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center justify-center bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded text-[9px] font-bold">
                    {item.size}°
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-black text-rose-600 dark:text-rose-400 text-xs">
                    {item.quantity} <span className="text-[9px] text-rose-500/70 font-medium">ta</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
