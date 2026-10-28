import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Plus, 
  Users, 
  Menu, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  GitCompareArrows, 
  RotateCcw, 
  QrCode, 
  Wallet, 
  X,
  ChevronRight
} from 'lucide-react';
import { useDb } from '../context/DbContext';
import { cn } from '../lib/utils';

export type Tab = 
  | 'asosiy' 
  | 'ombor' 
  | 'olcham' 
  | 'kirim' 
  | 'chiqim' 
  | 'otkazma' 
  | 'tarix' 
  | 'dashboard' 
  | 'sozlamalar' 
  | 'narxlar' 
  | 'inventarizatsiya' 
  | 'audit' 
  | 'profil' 
  | 'kassa' 
  | 'vozvrat-brak' 
  | 'mijozlar' 
  | 'shtrix-kod';

interface MobileBottomNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onOpenSidebar: () => void;
  onOpenScanner?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenSidebar,
  onOpenScanner,
}) => {
  const { currentUser } = useDb();
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  // Close actions sheet on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!currentUser || (currentUser.rol as string) === 'admin') return null;

  const isAdmin = (currentUser.rol as string) === 'admin';
  const homeTab: Tab = isAdmin ? 'dashboard' : 'asosiy';

  // Check if current tab is one of the secondary action tabs
  const isActionTab = ['kirim', 'chiqim', 'otkazma', 'vozvrat-brak'].includes(activeTab);

  const handleSelectTab = (tab: Tab) => {
    setActiveTab(tab);
    setIsActionsOpen(false);
  };

  return (
    <>
      {/* QUICK ACTIONS BOTTOM SHEET MODAL (MOBILE ONLY) */}
      {isActionsOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsActionsOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          />

          {/* Sheet Container */}
          <div className="relative z-10 bg-[var(--bg2)] rounded-t-3xl border-t border-[var(--border)] shadow-2xl p-4 sm:p-5 max-w-lg mx-auto w-full animate-in slide-in-from-bottom-6 duration-200">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 rounded-full bg-[var(--border)] mx-auto mb-3" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text)] tracking-tight">
                  Tezkor Amallar
                </h3>
                <p className="text-xs text-[var(--text3)]">
                  Quyidagi operatsiyalardan birini tanlang
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsActionsOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] flex items-center justify-center text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                title="Yopish"
              >
                <X size={16} />
              </button>
            </div>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {/* 1. Kirim */}
              <button
                type="button"
                onClick={() => handleSelectTab('kirim')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer active:scale-97",
                  activeTab === 'kirim'
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-emerald-500/40"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ArrowDownToLine size={20} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black leading-tight">Kirim</div>
                  <div className="text-[11px] text-[var(--text3)] truncate">Tovar qabuli</div>
                </div>
              </button>

              {/* 2. Chiqim */}
              <button
                type="button"
                onClick={() => handleSelectTab('chiqim')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer active:scale-97",
                  activeTab === 'chiqim'
                    ? "bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 font-extrabold"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-blue-500/40"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <ArrowUpFromLine size={20} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black leading-tight">Chiqim</div>
                  <div className="text-[11px] text-[var(--text3)] truncate">Sotuv fakturasi</div>
                </div>
              </button>

              {/* 3. O'tkazma */}
              <button
                type="button"
                onClick={() => handleSelectTab('otkazma')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer active:scale-97",
                  activeTab === 'otkazma'
                    ? "bg-purple-500/15 border-purple-500 text-purple-600 dark:text-purple-400 font-extrabold"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/40"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <GitCompareArrows size={20} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black leading-tight">O'tkazma</div>
                  <div className="text-[11px] text-[var(--text3)] truncate">Omborlararo</div>
                </div>
              </button>

              {/* 4. Vozvrat & Brak */}
              <button
                type="button"
                onClick={() => handleSelectTab('vozvrat-brak')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer active:scale-97",
                  activeTab === 'vozvrat-brak'
                    ? "bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-extrabold"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-rose-500/40"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <RotateCcw size={20} strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black leading-tight">Vozvrat</div>
                  <div className="text-[11px] text-[var(--text3)] truncate">Brak & Qaytarish</div>
                </div>
              </button>
            </div>

            {/* Extra Shortcuts: Barcode Scanner or Kassa */}
            <div className="space-y-2 pt-1 border-t border-[var(--border)]">
              {onOpenScanner && (
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsOpen(false);
                    onOpenScanner();
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 hover:border-blue-500/40 text-blue-600 dark:text-blue-400 flex items-center justify-between font-bold text-xs transition-all cursor-pointer active:scale-98"
                >
                  <div className="flex items-center gap-2.5">
                    <QrCode size={18} />
                    <span>Kamera orqali Shtrix-kod / QR Skaner</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('kassa')}
                  className={cn(
                    "w-full py-2.5 px-3.5 rounded-xl border flex items-center justify-between font-bold text-xs transition-all cursor-pointer active:scale-98",
                    activeTab === 'kassa'
                      ? "bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400"
                      : "bg-[var(--bg)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Wallet size={18} className="text-amber-500" />
                    <span>Kassa & Moliyaviy Holat</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav 
        aria-label="Mobil navigatsiya"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--bg2)]/95 backdrop-blur-md border-t border-[var(--border)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] select-none"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-items-center">
          
          {/* TAB 1: ASOSIY / DASHBOARD */}
          <button
            type="button"
            onClick={() => setActiveTab(homeTab)}
            className={cn(
              "flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all cursor-pointer active:scale-90",
              (activeTab === 'asosiy' || activeTab === 'dashboard')
                ? "text-[#0066f5] dark:text-blue-400 font-extrabold"
                : "text-[var(--text3)] hover:text-[var(--text)] font-semibold"
            )}
          >
            <div className="relative">
              <LayoutDashboard 
                size={22} 
                strokeWidth={(activeTab === 'asosiy' || activeTab === 'dashboard') ? 2.6 : 2} 
              />
              {(activeTab === 'asosiy' || activeTab === 'dashboard') && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0066f5] dark:bg-blue-400" />
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-1">
              Asosiy
            </span>
          </button>

          {/* TAB 2: OMBOR */}
          <button
            type="button"
            onClick={() => setActiveTab('ombor')}
            className={cn(
              "flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all cursor-pointer active:scale-90",
              (activeTab === 'ombor' || activeTab === 'olcham')
                ? "text-[#0066f5] dark:text-blue-400 font-extrabold"
                : "text-[var(--text3)] hover:text-[var(--text)] font-semibold"
            )}
          >
            <div className="relative">
              <Package 
                size={22} 
                strokeWidth={(activeTab === 'ombor' || activeTab === 'olcham') ? 2.6 : 2} 
              />
              {(activeTab === 'ombor' || activeTab === 'olcham') && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0066f5] dark:bg-blue-400" />
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-1">
              Ombor
            </span>
          </button>

          {/* TAB 3: CENTER ELEVATED "AMALLAR" BUTTON */}
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className={cn(
                "w-12 h-12 -mt-4 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-90 cursor-pointer ring-4 ring-[var(--bg2)]",
                isActionsOpen
                  ? "bg-rose-500 shadow-rose-500/30 rotate-45"
                  : isActionTab
                    ? "bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-emerald-500/35"
                    : "bg-gradient-to-tr from-[#0066f5] to-blue-400 shadow-blue-500/35 hover:scale-105"
              )}
              title="Tezkor amallar (Kirim, Chiqim, O'tkazma)"
            >
              <Plus size={26} strokeWidth={2.8} />
            </button>
            <span className={cn(
              "absolute -bottom-4 text-[9px] font-bold tracking-tight",
              isActionTab ? "text-emerald-500 font-black" : "text-[var(--text3)]"
            )}>
              Amallar
            </span>
          </div>

          {/* TAB 4: MIJOZLAR / CRM */}
          <button
            type="button"
            onClick={() => setActiveTab('mijozlar')}
            className={cn(
              "flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all cursor-pointer active:scale-90",
              activeTab === 'mijozlar'
                ? "text-[#0066f5] dark:text-blue-400 font-extrabold"
                : "text-[var(--text3)] hover:text-[var(--text)] font-semibold"
            )}
          >
            <div className="relative">
              <Users 
                size={22} 
                strokeWidth={activeTab === 'mijozlar' ? 2.6 : 2} 
              />
              {activeTab === 'mijozlar' && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0066f5] dark:bg-blue-400" />
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-1">
              Mijozlar
            </span>
          </button>

          {/* TAB 5: MENYU (SIDEBAR DRAWER TOGGLE) */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="flex flex-col items-center justify-center w-full py-1 rounded-xl text-[var(--text3)] hover:text-[var(--text)] font-semibold transition-all cursor-pointer active:scale-90"
            title="Barcha bo'limlar"
          >
            <Menu size={22} strokeWidth={2} />
            <span className="text-[10px] tracking-tight mt-1">
              Menyu
            </span>
          </button>

        </div>
      </nav>
    </>
  );
};
