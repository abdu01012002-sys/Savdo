import React, { useEffect, useState } from 'react';
import { useDb } from '../context/DbContext';
import { Moon, Sun, LogOut, Package, Factory, Building, AlertTriangle, Menu, Search, RefreshCw, Cloud, ArrowRightLeft } from 'lucide-react';
import { getNowStr, cn } from '../lib/utils';
import { toast } from 'sonner';
import { CurrencyPill } from './CurrencyPill';
import { FastDeviceSyncModal } from './FastDeviceSyncModal';

export const Topbar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const { 
    currentOmbor, 
    currentUser, 
    theme, 
    toggleTheme, 
    setCurrentUser, 
    setCurrentOmbor, 
    lastSaved, 
    isQuotaExhausted, 
    isSyncing, 
    retryFirestoreSync,
    pullLatestFromCloud
  } = useDb();
  const [time, setTime] = useState(getNowStr());
  const [isFastSyncOpen, setIsFastSyncOpen] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(getNowStr());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentOmbor('tepa');
  };

  const isLight = theme === 'light';

  return (
    <div className="sticky top-0 z-40 transition-colors duration-200 w-full max-w-full min-w-0">
      {/* Primary Topbar Header */}
      <div className="bg-[var(--bg2)] border-b border-[var(--border)] px-2.5 sm:px-5 h-13 sm:h-16 flex items-center justify-between w-full max-w-full min-w-0 gap-1.5 sm:gap-3">
        {/* Left Side: Mobile Menu, Brand, Desktop Warehouse Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button 
            onClick={onMenuClick}
            className="lg:hidden w-9 h-9 rounded-xl text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--bg2)] active:scale-95 transition-all shrink-0 cursor-pointer flex items-center justify-center shadow-2xs"
            title="Menyuni ochish"
          >
            <Menu size={20} className="sm:w-5 sm:h-5 shrink-0" />
          </button>

          {/* Mobile Title / Brand Badge */}
          <div className="hidden xs:flex sm:hidden items-center gap-1.5 shrink-0">
            <span className="text-[13px] font-black tracking-tight text-[var(--text)]">
              FALAK
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              CRM
            </span>
          </div>

          {/* DESKTOP Warehouse Switcher (Clean, compact segmented control) */}
          <div className="hidden sm:inline-flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] shadow-2xs">
            <button
              onClick={() => {
                if (currentOmbor !== 'tepa') {
                  setCurrentOmbor('tepa');
                  toast.info("TEPA ombori tanlandi");
                }
              }}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
                currentOmbor === 'tepa'
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="TEPA Ombori (Asosiy)"
            >
              <Factory className="w-3.5 h-3.5 shrink-0" />
              <span>TEPA</span>
            </button>
            <button
              onClick={() => {
                if (currentOmbor !== 'kotta') {
                  setCurrentOmbor('kotta');
                  toast.info("KOTTA ombori tanlandi");
                }
              }}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
                currentOmbor === 'kotta'
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="KOTTA Ombori"
            >
              <Building className="w-3.5 h-3.5 shrink-0" />
              <span>KOTTA</span>
            </button>
            <button
              onClick={() => {
                if (currentOmbor !== 'sort2') {
                  setCurrentOmbor('sort2');
                  toast.info("2-SORT ombori tanlandi");
                }
              }}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
                currentOmbor === 'sort2'
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)]"
              )}
              title="2-SORT Ombori (Nuqsonli / Utsenka)"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>2-SORT</span>
            </button>
          </div>
        </div>
        
        {/* Right Side: Currency, Search, Unified Sync Pill, Theme, Profile & Logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
          {/* Currency Pill */}
          <CurrencyPill />

          {/* Quick Search Shortcut */}
          <button 
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
              document.dispatchEvent(event);
            }}
            className="hidden md:flex items-center gap-2 px-2.5 py-1.5 bg-[var(--bg)] hover:bg-[var(--bg2)] rounded-xl border border-[var(--border)] hover:border-[var(--text3)] text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer text-xs font-medium"
            title="Qidirish (⌘K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Qidiruv</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg2)] border border-[var(--border)] text-[10px] font-bold text-[var(--text2)]">⌘K</kbd>
          </button>

          {/* Unified Smart Sync Pill (Consolidates status, manual sync and fast sync in one clean action) */}
          <button
            onClick={() => {
              if (isQuotaExhausted) {
                setIsFastSyncOpen(true);
              } else {
                pullLatestFromCloud(true);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0",
              isQuotaExhausted
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                : isSyncing
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:border-[var(--text3)]"
            )}
            title={
              isQuotaExhausted 
                ? "Diqqat: Firebase bepul kvotasi to'lgan. Ma'lumotlar lokal xotirada 100% xavfsiz. Bosish orqali qurilmalararo tezkor sinxronlang."
                : (lastSaved ? `So'nggi saqlangan vaqt: ${lastSaved}. Bosish orqali yangilash.` : "Qurilmalararo sinxronlash")
            }
          >
            <div 
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                isSyncing && "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse",
                !isSyncing && isQuotaExhausted && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse",
                !isSyncing && !isQuotaExhausted && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"
              )} 
            />
            <span className="hidden sm:inline">
              {isSyncing ? "Sinxronlanmoqda..." : isQuotaExhausted ? "Faqat lokal" : (lastSaved ? `Saqlandi: ${lastSaved}` : "Sinxron")}
            </span>
            <span className="sm:hidden text-[10px] font-black">
              {isSyncing ? "..." : isQuotaExhausted ? "Lokal" : "Sinxron"}
            </span>
          </button>

          {/* Fast Device-to-Device Sync Icon (Telegram/JSON) - Desktop / Tablet */}
          <button
            onClick={() => setIsFastSyncOpen(true)}
            className="hidden sm:flex p-1.5 sm:p-2 rounded-xl text-[var(--text2)] hover:text-blue-500 hover:bg-blue-500/10 border border-[var(--border)] bg-[var(--bg)] transition-colors cursor-pointer shrink-0 active:scale-95"
            title="Qurilmalararo tezkor sinxronlash (Telegram yoki Fayl orqali)"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
          </button>

          {/* Theme Toggle Button */}
          <button 
            onClick={toggleTheme}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-[var(--text3)] hover:text-[#8b5cf6] hover:bg-purple-500/10 border border-[var(--border)] bg-[var(--bg)] transition-colors cursor-pointer shrink-0 active:scale-95"
            title={isLight ? "Tungi rejimga o'tish" : "Kunduzgi rejimga o'tish"}
          >
            {isLight ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />}
          </button>

          {/* User Profile & Logout Cluster */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-[var(--bg)] p-0.5 sm:p-1 rounded-xl border border-[var(--border)] shrink-0">
            <button
              onClick={() => {
                if (currentUser?.rol === 'admin') {
                  window.dispatchEvent(new CustomEvent('navigate', { detail: 'profil' }));
                }
              }}
              className="flex items-center gap-1.5 px-1 py-0.5 rounded-lg hover:bg-[var(--bg2)] transition-colors text-left cursor-pointer"
              title="Foydalanuvchi ma'lumotlari"
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                {currentUser?.ism?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-[12px] font-bold text-[var(--text)] leading-tight max-w-[100px] truncate">
                  {currentUser?.ism}
                </span>
                <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 leading-none capitalize">
                  {currentUser?.rol === 'admin' ? 'Admin' : 'Omborchi'}
                </span>
              </div>
            </button>

            <button 
              onClick={handleLogout}
              className="p-1 sm:p-1.5 rounded-lg text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0 active:scale-95"
              title="Chiqish"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE-ONLY WAREHOUSE SELECTOR SUB-BAR (Full-width, thumb-friendly, zero crowding) */}
      <div className="sm:hidden bg-[var(--bg2)]/95 backdrop-blur-md border-b border-[var(--border)] px-2.5 py-1.5 flex items-center gap-1.5 shadow-xs">
        <button
          onClick={() => {
            if (currentOmbor !== 'tepa') {
              setCurrentOmbor('tepa');
              toast.info("TEPA ombori tanlandi");
            }
          }}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
            currentOmbor === 'tepa'
              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400"
              : "bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)]"
          )}
        >
          <Factory className="w-3.5 h-3.5 shrink-0" />
          <span>TEPA</span>
          {currentOmbor === 'tepa' && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => {
            if (currentOmbor !== 'kotta') {
              setCurrentOmbor('kotta');
              toast.info("KOTTA ombori tanlandi");
            }
          }}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
            currentOmbor === 'kotta'
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400"
              : "bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)]"
          )}
        >
          <Building className="w-3.5 h-3.5 shrink-0" />
          <span>KOTTA</span>
          {currentOmbor === 'kotta' && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => {
            if (currentOmbor !== 'sort2') {
              setCurrentOmbor('sort2');
              toast.info("2-SORT ombori tanlandi");
            }
          }}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
            currentOmbor === 'sort2'
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/25 ring-1 ring-amber-400"
              : "bg-[var(--bg)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)]"
          )}
        >
          <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0", currentOmbor === 'sort2' ? "text-amber-200" : "text-amber-500")} />
          <span>2-SORT</span>
          {currentOmbor === 'sort2' && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          )}
        </button>
      </div>
    </div>
  );
};
