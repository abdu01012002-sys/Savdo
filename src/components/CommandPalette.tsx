import React, { useState, useEffect, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { Search, FileText, User, Package, Settings, LayoutDashboard, DollarSign, LogIn, LogOut, ArrowRightLeft, History, ClipboardList, TrendingUp, UserCheck, Wallet, RotateCcw, Users, QrCode } from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'asosiy' | 'ombor' | 'olcham' | 'kirim' | 'chiqim' | 'otkazma' | 'tarix' | 'dashboard' | 'sozlamalar' | 'narxlar' | 'inventarizatsiya' | 'audit' | 'profil' | 'kassa' | 'vozvrat-brak' | 'mijozlar' | 'shtrix-kod';

interface CommandPaletteProps {
  setActiveTab: (tab: Tab) => void;
}

export function CommandPalette({ setActiveTab }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { db, currentOmbor, currentUser } = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const tabs = [
    { id: 'asosiy', label: 'Asosiy Sahifa (Tezkor Ombor)', icon: LayoutDashboard },
    ...(currentUser?.rol === 'admin' ? [{ id: 'dashboard', label: 'Dashboard Boshqaruv', icon: LayoutDashboard }] : []),
    { id: 'ombor', label: 'Ombor Qoldiqlari', icon: Package },
    { id: 'olcham', label: "O'lcham bo'yicha", icon: FileText },
    { id: 'kirim', label: 'Tovarlar Kirimi', icon: LogIn },
    { id: 'chiqim', label: 'Tovarlar Chiqimi', icon: LogOut },
    { id: 'otkazma', label: "Omborlararo O'tkazma", icon: ArrowRightLeft },
    { id: 'vozvrat-brak', label: 'Vozvrat & Brak Tovarlar', icon: RotateCcw },
    { id: 'mijozlar', label: 'Mijozlar Bazasi & CRM', icon: Users },
    { id: 'tarix', label: 'Amaliyotlar Tarixi', icon: History },
    ...(currentUser?.rol === 'admin' ? [
      { id: 'kassa', label: 'Kassa & Sof Foyda Moliya', icon: Wallet },
      { id: 'shtrix-kod', label: 'QR va Shtrix-kod Yorliqlar', icon: QrCode },
      { id: 'inventarizatsiya', label: 'Inventarizatsiya', icon: ClipboardList },
      { id: 'narxlar', label: 'Narxlar va Kategoriya', icon: DollarSign },
      { id: 'audit', label: 'Xavfsizlik (Audit)', icon: History },
      { id: 'sozlamalar', label: 'Sozlamalar va Filiallar', icon: Settings },
      { id: 'profil', label: 'Profil & Xodimlar Tarixi', icon: UserCheck },
    ] : [
      { id: 'narxlar', label: 'Narxlar va Kategoriya', icon: DollarSign },
    ])
  ];

  // Get models
  const stock = db[currentOmbor]?.stock || {};
  const models = Object.keys(stock).map(model => ({
    type: 'model',
    id: model,
    label: model,
    icon: Package
  }));

  // Get clients
  const kontragentlar = currentUser?.rol === 'admin' ? (db.kontragentlar || []).map(k => ({
    type: 'client',
    id: k.id,
    label: k.ism,
    phone: k.tel,
    icon: User
  })) : [];

  const allItems = [
    ...tabs.map(t => ({ ...t, type: 'tab' })),
    ...models,
    ...kontragentlar
  ];

  const filteredItems = allItems.filter(item => {
    if (!query) return true; // Show all (or maybe top default) when empty
    const q = query.toLowerCase();
    if (item.type === 'tab' && item.label.toLowerCase().includes(q)) return true;
    if (item.type === 'model' && item.label.toLowerCase().includes(q)) return true;
    if (item.type === 'client' && (item.label.toLowerCase().includes(q) || (item as any).phone?.includes(q))) return true;
    return false;
  }).slice(0, 15); // Limit to 15 results

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: any) => {
    if (item.type === 'tab') {
      setActiveTab(item.id as Tab);
    } else if (item.type === 'model') {
      setActiveTab('ombor');
      // In a real app, we might pass the search query to the Ombor page, 
      // but for now navigating to the page is good enough.
    } else if (item.type === 'client') {
      setActiveTab('dashboard');
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter' && filteredItems.length > 0) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 backdrop-blur-sm bg-black/40" onClick={() => setIsOpen(false)}>
      <div 
        className="bg-[var(--bg2)] w-full max-w-xl rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--border)]">
          <Search className="w-5 h-5 text-[var(--text3)] mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Sahifa, model yoki mijozni qidirish..."
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-[var(--text)] placeholder:text-[var(--text3)]"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="px-2 py-1 text-[10px] font-bold bg-[var(--bg)] border border-[var(--border)] rounded-md text-[var(--text3)]">
            ESC
          </div>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-[var(--text3)] text-[14px]">
              Hech narsa topilmadi.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredItems.map((item, i) => {
                const isSelected = i === selectedIndex;
                const Icon = item.icon as any;
                return (
                  <button
                    key={`${item.type}-${item.id || item.label}-${i}`}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer",
                      isSelected ? "bg-blue-500/10 text-blue-500" : "hover:bg-[var(--bg)] text-[var(--text)]"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected ? "bg-blue-500/20" : "bg-[var(--bg)]"
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold">{item.label}</span>
                      {item.type === 'tab' && <span className="text-[11px] text-[var(--text3)] uppercase tracking-wider">Sahifa</span>}
                      {item.type === 'model' && <span className="text-[11px] text-[var(--text3)] uppercase tracking-wider">Model (Ombor)</span>}
                      {item.type === 'client' && <span className="text-[11px] text-[var(--text3)] uppercase tracking-wider">Mijoz {(item as any).phone ? `· ${(item as any).phone}` : ''}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
