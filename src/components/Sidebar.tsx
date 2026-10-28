import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { useDb } from '../context/DbContext';
import { 
  Package, Ruler, ArrowDownToLine, ArrowUpFromLine, GitCompareArrows, 
  History, LayoutDashboard, ClipboardCheck, DollarSign, Settings, 
  ShieldAlert, UserCheck, Wallet, RotateCcw, ChevronDown, Boxes,
  CircleDot, Users, QrCode, Sparkles
} from 'lucide-react';
import { APP_VERSION_CONFIG } from '../version';
import { ChangelogModal } from './ChangelogModal';

type Tab = 'asosiy' | 'ombor' | 'olcham' | 'kirim' | 'chiqim' | 'otkazma' | 'tarix' | 'dashboard' | 'sozlamalar' | 'narxlar' | 'inventarizatsiya' | 'audit' | 'profil' | 'kassa' | 'vozvrat-brak' | 'mijozlar' | 'shtrix-kod';

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
}

export const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen }: { activeTab: Tab, setActiveTab: (t: Tab) => void, isOpen: boolean, setIsOpen: (o: boolean) => void }) => {
  const { currentUser } = useDb();

  if (!currentUser) return null;

  const groups: NavGroup[] = [
    {
      id: 'asosiy',
      title: 'Bosh Sahifa',
      icon: <LayoutDashboard size={20} />,
      items: [
        ...(currentUser.rol === 'admin' 
          ? [
              { id: 'dashboard' as Tab, label: 'Dashboard', icon: <LayoutDashboard size={18} /> }
            ] 
          : [
              { id: 'asosiy' as Tab, label: 'Asosiy', icon: <LayoutDashboard size={18} /> }
            ]
        ),
      ]
    },
    {
      id: 'ombor-tovarlar',
      title: 'Ombor va Tovarlar',
      icon: <Package size={20} />,
      items: [
        { id: 'ombor' as Tab, label: 'Ombor Qoldiqlari', icon: <Package size={18} /> },
        { id: 'olcham' as Tab, label: "O'lchamlar Bo'yicha", icon: <Ruler size={18} /> },
        { id: 'narxlar' as Tab, label: 'Narxlar', icon: <DollarSign size={18} /> },
        ...(currentUser.rol === 'admin' ? [
          { id: 'shtrix-kod' as Tab, label: 'QR / Shtrix-kod Yorliqlar', icon: <QrCode size={18} /> },
          { id: 'inventarizatsiya' as Tab, label: 'Inventarizatsiya', icon: <ClipboardCheck size={18} /> }
        ] : []),
      ]
    },
    {
      id: 'tranzaksiyalar',
      title: 'Tranzaksiyalar & Savdo',
      icon: <Boxes size={20} />,
      items: [
        { id: 'kirim' as Tab, label: 'Kirim', icon: <ArrowDownToLine size={18} /> },
        { id: 'chiqim' as Tab, label: 'Chiqim (Sotuv)', icon: <ArrowUpFromLine size={18} /> },
        { id: 'otkazma' as Tab, label: "O'tkazma", icon: <GitCompareArrows size={18} /> },
        { id: 'vozvrat-brak' as Tab, label: 'Vozvrat & Brak', icon: <RotateCcw size={18} /> },
        { id: 'mijozlar' as Tab, label: 'Mijozlar & CRM', icon: <Users size={18} /> },
      ]
    },
    {
      id: 'moliya-hisobotlar',
      title: 'Moliya va Hisobotlar',
      icon: <Wallet size={20} />,
      items: [
        ...(currentUser.rol === 'admin' ? [{ id: 'kassa' as Tab, label: 'Kassa & Moliya', icon: <Wallet size={18} /> }] : []),
        { id: 'tarix' as Tab, label: 'Tranzaksiyalar Tarixi', icon: <History size={18} /> },
      ]
    },
    {
      id: 'tizim-xavfsizlik',
      title: 'Tizim va Xavfsizlik',
      icon: <Settings size={20} />,
      items: [
        ...(currentUser.rol === 'admin' ? [{ id: 'profil' as Tab, label: 'Profil & Tarix', icon: <UserCheck size={18} /> }] : []),
        ...(currentUser.rol === 'admin' ? [{ id: 'audit' as Tab, label: 'Xavfsizlik', icon: <ShieldAlert size={18} /> }] : []),
        ...(currentUser.rol === 'admin' ? [{ id: 'sozlamalar' as Tab, label: 'Sozlamalar', icon: <Settings size={18} /> }] : []),
      ]
    }
  ].filter(g => g.items.length > 0);

  // Determine which group contains the activeTab
  const activeGroupId = groups.find(g => g.items.some(i => i.id === activeTab))?.id || 'asosiy';

  // State to track open/closed state of accordion groups
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Initial state with active group open
    return { [activeGroupId]: true };
  });

  // Auto-expand group when activeTab changes
  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups(prev => ({
        ...prev,
        [activeGroupId]: true
      }));
    }
  }, [activeGroupId]);

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  const toggleGroup = (groupId: string, singleItemTarget?: Tab) => {
    if (singleItemTarget) {
      setActiveTab(singleItemTarget);
      setIsOpen(false);
      return;
    }

    setOpenGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-[270px] bg-[var(--bg2)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[var(--border)] shrink-0 gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[var(--active-color)] to-blue-400 flex items-center justify-center text-white shadow-md shadow-[var(--active-soft)] shrink-0">
            <Package size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-black tracking-tight text-[var(--text)] leading-none">
              Ombor<span className="text-[var(--active-color)]">Pro</span>
            </h1>
            <span className="text-[11px] font-semibold text-[var(--text3)] mt-1">Boshqaruv Tizimi</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-2 scrollbar-hide">
          <div className="text-[10px] font-extrabold text-[var(--text3)] uppercase tracking-wider px-3 pb-1">
            Asosiy Bo'limlar
          </div>

          {groups.map((group) => {
            const hasMultipleItems = group.items.length > 1;
            const isGroupActive = group.items.some(i => i.id === activeTab);
            const isExpanded = !!openGroups[group.id];

            // If it's a single item group (like Bosh Sahifa), clicking directly opens it
            const singleItem = !hasMultipleItems ? group.items[0] : null;
            const isSingleActive = singleItem && activeTab === singleItem.id;

            return (
              <div key={group.id} className="rounded-xl overflow-hidden transition-all">
                {/* Group Header Button */}
                <button
                  onClick={() => toggleGroup(group.id, singleItem ? singleItem.id : undefined)}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-[13.5px] font-bold transition-all duration-200 group relative",
                    isSingleActive
                      ? "text-[var(--active-color)] bg-[var(--active-soft)] shadow-sm"
                      : isGroupActive && !isExpanded
                        ? "text-[var(--active-color)] bg-[var(--bg)] font-extrabold"
                        : "text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                  )}
                >
                  {isSingleActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[var(--active-color)] rounded-r-md"></div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "transition-transform duration-200",
                      (isSingleActive || isGroupActive) ? "text-[var(--active-color)] scale-105" : "text-[var(--text3)] group-hover:text-[var(--text)]"
                    )}>
                      {group.icon}
                    </div>
                    <span className="tracking-tight">{group.title}</span>
                  </div>

                  {hasMultipleItems && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--bg)] text-[var(--text3)] group-hover:text-[var(--text)] border border-[var(--border)]">
                        {group.items.length}
                      </span>
                      <ChevronDown 
                        size={16} 
                        className={cn(
                          "transition-transform duration-200 text-[var(--text3)]",
                          isExpanded ? "transform rotate-180 text-[var(--text)]" : ""
                        )} 
                      />
                    </div>
                  )}
                </button>

                {/* Sub-items (Accordion Content) */}
                {hasMultipleItems && isExpanded && (
                  <div className="mt-1 ml-4 pl-3.5 border-l-2 border-[var(--border)] space-y-1 py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {group.items.map(item => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 relative group",
                            isActive
                              ? "text-[var(--active-color)] bg-[var(--active-soft)] font-bold shadow-xs"
                              : "text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                          )}
                        >
                          <div className={cn(
                            "transition-colors",
                            isActive ? "text-[var(--active-color)]" : "text-[var(--text3)] group-hover:text-[var(--text)]"
                          )}>
                            {item.icon}
                          </div>
                          <span className="truncate">{item.label}</span>

                          {isActive && (
                            <CircleDot size={12} className="ml-auto text-[var(--active-color)] shrink-0 animate-pulse" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer with Version & Changelog Trigger */}
        <div className="p-3 border-t border-[var(--border)] shrink-0 bg-[var(--bg2)]/60">
          <button
            onClick={() => setIsChangelogOpen(true)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] transition-all text-left cursor-pointer group shadow-2xs active:scale-[0.98]"
            title="Yangilanishlar tarixi (Changelog)"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <Sparkles size={13} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-extrabold text-[var(--text)] leading-tight truncate">
                  OmborPro CRM
                </span>
                <span className="text-[9px] font-semibold text-[var(--text3)] truncate">
                  Nimalar yangilandi?
                </span>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 group-hover:scale-105 transition-transform shrink-0 ml-1">
              v{APP_VERSION_CONFIG.version}
            </span>
          </button>
        </div>
      </div>

      {/* Changelog Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />
    </>
  );
};
