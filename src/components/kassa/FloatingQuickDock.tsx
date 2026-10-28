import React, { useState } from 'react';
import { 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  DollarSign, 
  Clock, 
  Download, 
  ChevronUp, 
  ChevronDown, 
  Sparkles,
  Zap
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface FloatingQuickDockProps {
  valyutaKursi: number;
  hasActiveSmena: boolean;
  onOpenIncome: () => void;
  onOpenExpense: () => void;
  onOpenTransfer: () => void;
  onOpenCurrency: () => void;
  onOpenSmena: () => void;
  onExportExcel: () => void;
}

export const FloatingQuickDock: React.FC<FloatingQuickDockProps> = ({
  valyutaKursi,
  hasActiveSmena,
  onOpenIncome,
  onOpenExpense,
  onOpenTransfer,
  onOpenCurrency,
  onOpenSmena,
  onExportExcel
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <aside aria-label="Tezkor Harakatlar Dock-Paneli" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[95vw]">
      <AnimatePresence>
        {!isMinimized ? (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="flex items-center gap-1.5 sm:gap-2 p-2 bg-[var(--bg2)]/90 backdrop-blur-xl border border-[var(--border)]/90 shadow-2xl rounded-2xl shadow-purple-500/10 text-xs"
          >
            {/* 1. SAVDO TUSHUMI / KIRIM */}
            <button
              onClick={onOpenIncome}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95 whitespace-nowrap text-xs"
              title="Kassaga yangi kirim kiritish"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">+ Savdo Tushumi</span>
              <span className="sm:hidden">+ Kirim</span>
            </button>

            {/* 2. KUNLIK XARAJAT / CHIQIM */}
            <button
              onClick={onOpenExpense}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer active:scale-95 whitespace-nowrap text-xs"
              title="Kassadan yangi xarajat kiritish"
            >
              <Minus className="w-4 h-4" />
              <span className="hidden sm:inline">- Kunlik Xarajat</span>
              <span className="sm:hidden">- Chiqim</span>
            </button>

            {/* 3. MULTI-TRANSFER */}
            <button
              onClick={onOpenTransfer}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95 whitespace-nowrap text-xs"
              title="Kassalararo transfer va valyuta konvertatsiyasi"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span className="hidden md:inline">Transfer / Konvertatsiya</span>
              <span className="md:hidden">Transfer</span>
            </button>

            {/* 4. KURS YANGILASH */}
            <button
              onClick={onOpenCurrency}
              className="px-2.5 py-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border border-[var(--border)] rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap text-xs"
              title="Valyuta kursini yangilash"
            >
              <DollarSign className="w-4 h-4 text-blue-500" />
              <span className="hidden lg:inline">{valyutaKursi.toLocaleString()} UZS</span>
              <span className="lg:hidden">Kurs</span>
            </button>

            {/* 5. SMENA / Z-HISOBOT */}
            <button
              onClick={onOpenSmena}
              className={cn(
                "px-2.5 py-2 rounded-xl font-bold flex items-center gap-1.5 border transition-all cursor-pointer active:scale-95 whitespace-nowrap text-xs",
                hasActiveSmena
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20"
                  : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--bg3)]"
              )}
              title="Kassir smenasi va Z-Hisobot"
            >
              <Clock className="w-4 h-4 text-purple-500" />
              <span className="hidden sm:inline">Z-Hisobot</span>
            </button>

            {/* 6. EXCEL EKSPORT */}
            <button
              onClick={onExportExcel}
              className="p-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl font-bold transition-all cursor-pointer active:scale-95"
              title="Excel formatida hisobot yuklash"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* MINIMIZE TOGGLE */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] rounded-xl transition-all cursor-pointer ml-1"
              title="Dock panelini yashirish"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={() => setIsMinimized(false)}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-black text-xs flex items-center gap-2 shadow-2xl shadow-purple-600/40 cursor-pointer active:scale-95"
            title="Tezkor amallar panelini ochish"
          >
            <Zap className="w-4 h-4" />
            <span>Tezkor Amallar</span>
            <ChevronUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </aside>
  );
};
