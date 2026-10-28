import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { ALL_SIZES, cn, getCat, getNowStr, getTodayStr } from '../lib/utils';
import { toast } from 'sonner';
import {
  PackagePlus,
  ClipboardCheck,
  TrendingUp,
  ArrowRightLeft,
  DollarSign,
  UserPlus,
  Boxes,
  Sparkles,
  Plus,
  X,
  Check,
  Layers,
  ArrowRight,
  Warehouse,
  ShieldCheck,
  Tag,
  Calendar,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Wallet,
  Send,
  RefreshCw
} from 'lucide-react';
import { sendDailyReportNotification } from '../services/telegramService';

interface QuickActionsProps {
  onOpenNewClientModal?: () => void;
}

export const DashboardQuickActions: React.FC<QuickActionsProps> = ({ onOpenNewClientModal }) => {
  const { db, setDb, currentOmbor, currentUser } = useDb();
  const { logAudit } = useAudit();
  const isAdmin = currentUser?.rol === 'admin';

  // Toggle show/hide state with local storage persistence
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dashboard_quick_actions_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const togglePanel = () => {
    setIsOpen(prev => {
      const nextVal = !prev;
      try {
        localStorage.setItem('dashboard_quick_actions_open', String(nextVal));
      } catch (e) {
        console.error(e);
      }
      return nextVal;
    });
  };

  // Modal states
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isInventoryConfirmOpen, setIsInventoryConfirmOpen] = useState(false);

  // New Product Form State
  const [modelName, setModelName] = useState('');
  const [categoryType, setCategoryType] = useState<'auto' | 'qishki' | 'yozgi' | 'umumiy'>('auto');
  const [targetWarehouse, setTargetWarehouse] = useState<'tepa' | 'kotta' | 'both'>('both');
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['39', '40', '41', '42', '43', '44']);
  const [initialQty, setInitialQty] = useState<Record<string, number>>({});
  const [costPrice, setCostPrice] = useState<string>('');
  const [salePrice, setSalePrice] = useState<string>('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTgReport, setIsSendingTgReport] = useState(false);

  const navigateTo = (tab: string) => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
  };

  // Toggle size selection
  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      setSelectedSizes(prev => prev.filter(s => s !== size));
      setInitialQty(prev => {
        const copy = { ...prev };
        delete copy[size];
        return copy;
      });
    } else {
      setSelectedSizes(prev => [...prev, size].sort((a, b) => parseInt(a) - parseInt(b)));
    }
  };

  const handleQtyChange = (size: string, val: string) => {
    const num = parseInt(val);
    setInitialQty(prev => ({
      ...prev,
      [size]: isNaN(num) || num < 0 ? 0 : num
    }));
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanModel = modelName.trim().replace(/[.#$/\[\]]/g, '');

    if (!cleanModel) {
      toast.error("Iltimos, mahsulot / model nomini kiriting!");
      return;
    }

    if (selectedSizes.length === 0) {
      toast.error("Kamida bitta o'lcham tanlang!");
      return;
    }

    // Check if model already exists in either warehouse
    const existsInTepa = !!db.tepa?.stock?.[cleanModel];
    const existsInKotta = !!db.kotta?.stock?.[cleanModel];

    if (existsInTepa || existsInKotta) {
      toast.error(`"${cleanModel}" nomli model tizimda allaqachon mavjud!`);
      return;
    }

    setIsSubmitting(true);

    try {
      const nowStr = getNowStr();
      const todayStr = getTodayStr();

      // Build initial size records
      const initialStockData: Record<string, number> = {};
      selectedSizes.forEach(s => {
        initialStockData[s] = initialQty[s] || 0;
      });

      const costVal = parseFloat(costPrice) || 0;
      const saleVal = parseFloat(salePrice) || 0;

      // Prepare transactions if initial stock was provided
      const totalInitialCount = Object.values(initialStockData).reduce((a, b) => a + b, 0);

      setDb(prev => {
        const next = JSON.parse(JSON.stringify(prev));

        // Update prices table
        if (!next.prices) next.prices = {};
        next.prices[cleanModel] = {
          cost: costVal,
          sale: saleVal,
          history: (costVal > 0 || saleVal > 0) ? [{
            date: new Date().toISOString(),
            cost: costVal,
            sale: saleVal,
            changedBy: currentUser?.ism || 'Admin'
          }] : []
        };

        const targetWarehouses: ('tepa' | 'kotta')[] = 
          targetWarehouse === 'both' ? ['tepa', 'kotta'] : [targetWarehouse];

        targetWarehouses.forEach(wName => {
          if (!next[wName]) next[wName] = { stock: {}, transactions: [] };
          if (!next[wName].stock) next[wName].stock = {};
          
          next[wName].stock[cleanModel] = { ...initialStockData };

          // If initial stock was provided, create an initial 'kirim' transaction
          if (totalInitialCount > 0) {
            selectedSizes.forEach(sz => {
              const count = initialStockData[sz] || 0;
              if (count > 0) {
                next[wName].transactions.unshift({
                  id: `init-${Date.now()}-${sz}-${Math.random().toString(36).slice(2, 6)}`,
                  vaqt: nowStr,
                  sana: todayStr,
                  amal: 'kirim',
                  model: cleanModel,
                  olcham: sz,
                  soni: count,
                  kimdan: 'Boshlang\'ich Zaxira',
                  izoh: note.trim() || 'Yangi mahsulot kartasi ochildi',
                  xodim: currentUser?.ism || 'Admin',
                  summa: count * (saleVal || costVal || 0)
                });
              }
            });
          }
        });

        return next;
      });

      logAudit(
        "Yangi mahsulot qo'shildi",
        "Katalog / Ombor",
        `Model: "${cleanModel}", O'lchamlar: ${selectedSizes.join(',')}, Narxi: Tan $${costVal} / Sotuv $${saleVal}, Ombor: ${targetWarehouse}`,
        'info'
      );

      toast.success(`"${cleanModel}" mahsuloti muvaffaqiyatli qo'shildi!`, {
        description: totalInitialCount > 0 
          ? `${totalInitialCount} juft boshlang'ich zaxira bilan kiritildi.` 
          : "Zaxira bo'sh holda katalogga kiritildi."
      });

      // Reset form
      setModelName('');
      setCategoryType('auto');
      setTargetWarehouse('both');
      setSelectedSizes(['39', '40', '41', '42', '43', '44']);
      setInitialQty({});
      setCostPrice('');
      setSalePrice('');
      setNote('');
      setIsAddProductOpen(false);
    } catch (err: any) {
      console.error("Mahsulot qo'shishda xatolik:", err);
      toast.error("Mahsulotni qo'shishda xatolik yuz berdi!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartInventory = () => {
    setIsInventoryConfirmOpen(false);
    navigateTo('inventarizatsiya');
  };

  // Quick Action card definitions
  const actionCards = [
    {
      id: 'add-product',
      title: "Yangi Mahsulot",
      subtitle: "Katalogga yangi model qo'shish",
      icon: PackagePlus,
      gradient: "from-blue-600 to-indigo-600",
      accentBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      badge: "Admin",
      badgeColor: "bg-blue-500/20 text-blue-600 dark:text-blue-300",
      adminOnly: true,
      onClick: () => setIsAddProductOpen(true)
    },
    {
      id: 'start-inventory',
      title: "Inventarizatsiya",
      subtitle: "Haqiqiy zaxirani solishtirish",
      icon: ClipboardCheck,
      gradient: "from-purple-600 to-pink-600",
      accentBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      badge: "Audit",
      badgeColor: "bg-purple-500/20 text-purple-600 dark:text-purple-300",
      adminOnly: true,
      onClick: () => setIsInventoryConfirmOpen(true)
    },
    {
      id: 'kassa-moliya',
      title: "Kassa & Sof Foyda",
      subtitle: "Xarajatlar va P&L hisoboti",
      icon: Wallet,
      gradient: "from-teal-600 to-emerald-600",
      accentBg: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      badge: "Moliya",
      badgeColor: "bg-teal-500/20 text-teal-600 dark:text-teal-300",
      adminOnly: true,
      onClick: () => navigateTo('kassa')
    },
    {
      id: 'new-kirim',
      title: "Yangi Kirim",
      subtitle: "Fabrikadan tovar qabul qilish",
      icon: TrendingUp,
      gradient: "from-emerald-600 to-teal-600",
      accentBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      badge: "Kirim +",
      badgeColor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300",
      adminOnly: false,
      onClick: () => navigateTo('kirim')
    },
    {
      id: 'new-chiqim',
      title: "Yangi Chiqim / Savdo",
      subtitle: "Mijozga yuk jo'natish & hisob",
      icon: TrendingUp,
      iconClassName: "rotate-180",
      gradient: "from-rose-600 to-orange-600",
      accentBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      badge: "Chiqim -",
      badgeColor: "bg-rose-500/20 text-rose-600 dark:text-rose-300",
      adminOnly: false,
      onClick: () => navigateTo('chiqim')
    },
    {
      id: 'otkazma',
      title: "Ombor O'tkazmasi",
      subtitle: "Tepa & Kotta ombor transferi",
      icon: ArrowRightLeft,
      gradient: "from-amber-600 to-orange-600",
      accentBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      badge: "Transfer",
      badgeColor: "bg-amber-500/20 text-amber-600 dark:text-amber-300",
      adminOnly: false,
      onClick: () => navigateTo('otkazma')
    },
    {
      id: 'narxlar',
      title: "Narxlarni Boshqarish",
      subtitle: "Tannarx va sotuv narxlari",
      icon: DollarSign,
      gradient: "from-cyan-600 to-blue-600",
      accentBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      badge: "Narx",
      badgeColor: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300",
      adminOnly: false,
      onClick: () => navigateTo('narxlar')
    },
    {
      id: 'tg-report',
      title: isSendingTgReport ? "Yuborilmoqda..." : "Telegram Hisobot",
      subtitle: "Hozirgi moliyaviy hisobotni yuborish",
      icon: isSendingTgReport ? RefreshCw : Send,
      gradient: "from-blue-600 to-indigo-600",
      accentBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      badge: db.telegramConfig?.isEnabled ? "Bot Faol" : "Sozlash",
      badgeColor: db.telegramConfig?.isEnabled ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/20 text-amber-600 dark:text-amber-300",
      adminOnly: false,
      onClick: async () => {
        if (!db.telegramConfig?.botToken || !db.telegramConfig?.chatId) {
          toast.info("Telegram bot sozlanmagan. Sozlamalar bo'limiga o'ting.");
          navigateTo('sozlamalar');
          return;
        }
        setIsSendingTgReport(true);
        try {
          const res = await sendDailyReportNotification(db);
          if (res.success) {
            toast.success("✅ Kunlik hisobot Telegramga yuborildi!");
          } else {
            toast.error(`Telegramga yuborilmadi: ${res.message}`);
          }
        } catch (e: any) {
          toast.error("Xatolik yuz berdi");
        } finally {
          setIsSendingTgReport(false);
        }
      }
    }
  ];

  return (
    <div className={cn(
      "bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-sm relative overflow-hidden transition-all duration-200",
      isOpen ? "p-5 md:p-6" : "p-4 md:p-4.5"
    )}>
      {/* Background soft ambient accents */}
      <div className="absolute top-0 right-10 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -mt-20" />
      <div className="absolute bottom-0 left-10 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none -mb-20" />

      {/* Header section */}
      <div className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10",
        isOpen ? "mb-5" : "mb-0"
      )}>
        <div 
          onClick={togglePanel}
          className="flex items-center gap-3 cursor-pointer select-none group flex-1"
          title={isOpen ? "Panelni berkitish uchun bosing" : "Panelni ochish uchun bosing"}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-500 flex items-center justify-center font-black shadow-sm group-hover:scale-105 transition-transform shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base md:text-lg font-black text-[var(--text)] tracking-tight group-hover:text-blue-500 transition-colors">
                Tezkor Amallar Paneli
              </h2>
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                Quick Actions
              </span>
              {!isOpen && (
                <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  Berkitilgan
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text3)] line-clamp-1">
              {isOpen 
                ? "Boshqaruv, yangi mahsulot qo'shish, inventarizatsiya va operatsiyalar uchun tezkor tugmalar"
                : "Tezkor amallarni ko'rish va boshqarish uchun bosing"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {isAdmin && isOpen && (
            <>
              <button
                onClick={() => setIsAddProductOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">Yangi</span> Mahsulot
              </button>
              <button
                onClick={() => setIsInventoryConfirmOpen(true)}
                className="px-3.5 py-2 bg-purple-600/10 hover:bg-purple-600 hover:text-white text-purple-600 dark:text-purple-400 border border-purple-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span className="hidden md:inline">Inventarizatsiya</span>
              </button>
            </>
          )}

          {/* TOGGLE SHOW / HIDE BUTTON */}
          <button
            type="button"
            onClick={togglePanel}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-sm",
              isOpen
                ? "bg-[var(--bg)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg3)]"
                : "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-blue-500/20"
            )}
            title={isOpen ? "Panelni berkitish (yashirish)" : "Panelni ochish (ko'rsatish)"}
          >
            {isOpen ? (
              <>
                <EyeOff className="w-4 h-4 text-[var(--text3)]" />
                <span className="font-bold">Berkitish</span>
                <ChevronUp className="w-3.5 h-3.5 opacity-70" />
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                <span className="font-bold">Panelni Ochish</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid of Action Cards when OPEN */}
      {isOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 relative z-10 animate-in fade-in-50 duration-200">
          {actionCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={card.onClick}
                className="group relative p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:border-blue-500/40 hover:shadow-md transition-all duration-200 text-left flex flex-col justify-between min-h-[120px] cursor-pointer overflow-hidden"
              >
                {/* Subtle top indicator bar on hover */}
                <div className={cn(
                  "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                  card.gradient
                )} />

                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 border",
                    card.accentBg
                  )}>
                    <Icon className={cn("w-5 h-5", card.iconClassName)} />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                    card.badgeColor
                  )}>
                    {card.badge}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-extrabold text-[var(--text)] group-hover:text-blue-500 transition-colors flex items-center justify-between">
                    <span>{card.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-blue-500" />
                  </h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5 leading-snug line-clamp-1">
                    {card.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MODAL 1: YANGI MAHSULOT QO'SHISH */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--text)]">Yangi Poyafzal Modeli Qo'shish</h3>
                  <p className="text-xs text-[var(--text3)]">Katalog va ombor zaxirasiga yangi mahsulot kartasini kiritish</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddProductOpen(false)}
                className="w-8 h-8 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg3)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateProduct} className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Row 1: Model Name & Ombor Target */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-[var(--text2)] mb-1.5">
                    Model Nomi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Classic 401 Qora, Sport 202, Mexli Botinka"
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-[var(--text3)]/50"
                  />
                  <p className="text-[10px] text-[var(--text3)] mt-1">
                    Mavsum aniqlanishi: {getCat(modelName) === 'qishki' ? '❄️ Qishki (Mexli)' : getCat(modelName) === 'yozgi' ? '☀️ Yozgi (Setka/Sariq)' : '👞 Umumiy / Klassik'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-[var(--text2)] mb-1.5">
                    Qaysi Omborga Qo'shilsin?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'both', label: 'Har ikkisi' },
                      { id: 'tepa', label: 'Tepa ombor' },
                      { id: 'kotta', label: 'Kotta ombor' },
                    ].map(item => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setTargetWarehouse(item.id as any)}
                        className={cn(
                          "py-2.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center",
                          targetWarehouse === item.id
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg3)]"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: Prices (Tannarx & Sotuv narxi) */}
              <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-[var(--text)]">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <span>Narxlar Belgilash (Ixtiyoriy, keyinroq ham o'zgartirish mumkin)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text3)] mb-1">
                      Tannarxi (Olingan narx, $)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-black text-[var(--text3)]">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={costPrice}
                        onChange={e => setCostPrice(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-sm font-bold text-[var(--text)] focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text3)] mb-1">
                      Sotuv Narxi (Mijozga, $)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-black text-[var(--text3)]">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={salePrice}
                        onChange={e => setSalePrice(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-sm font-bold text-[var(--text)] focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Sizes & Initial Quantities */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-[var(--text2)] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Mavjud O'lchamlar & Boshlang'ich Zaxira (Juft)</span>
                  </label>
                  <span className="text-[11px] text-[var(--text3)]">
                    {selectedSizes.length} ta o'lcham tanlandi
                  </span>
                </div>

                {/* Available Sizes selection */}
                <div className="flex flex-wrap gap-2">
                  {ALL_SIZES.map(size => {
                    const isSelected = selectedSizes.includes(size);
                    return (
                      <button
                        type="button"
                        key={size}
                        onClick={() => toggleSize(size)}
                        className={cn(
                          "w-11 h-10 rounded-xl text-xs font-black border transition-all flex items-center justify-center cursor-pointer",
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>

                {/* Size quantities inputs */}
                {selectedSizes.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-2">
                    {selectedSizes.map(size => (
                      <div key={size} className="p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-center">
                        <div className="text-xs font-black text-indigo-500 mb-1">{size}-o'lcham</div>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={initialQty[size] !== undefined ? initialQty[size] : ''}
                          onChange={e => handleQtyChange(size, e.target.value)}
                          className="w-full text-center py-1 bg-[var(--bg2)] border border-[var(--border)] rounded-lg text-sm font-black text-[var(--text)] outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 4: Izoh / Note */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-[var(--text2)] mb-1.5">
                  Izoh / Qo'shimcha ma'lumot
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Yangi partiya, yangi qolip yoki ishlab chiqaruvchi haqida..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] focus:border-blue-500 outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? "Saqlanmoqda..." : "Mahsulotni Saqlash"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INVENTARIZATSIYANI BOSHLASH TASDIQLASH */}
      {isInventoryConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center font-black">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Inventarizatsiyani Boshlash</h3>
                <p className="text-xs text-[var(--text3)]">Ombor qoldiqlarini audit qilish va solishtirish</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text2)] space-y-2 leading-relaxed">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>
                  Inventarizatsiya sahifasida siz har bir model va o'lchamning amaldagi haqiqiy sonini kiritib, tizimdagi qoldiqlar bilan farqlarni (kamomad yoki ortiqcha) hisoblashingiz va bir tugma bilan moslashingiz mumkin.
                </span>
              </div>
              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text3)]">
                <span>Hozirgi faol ombor:</span>
                <span className="font-extrabold uppercase text-[var(--text)] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-md">
                  {currentOmbor === 'tepa' ? 'Tepa ombor' : 'Kotta ombor'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsInventoryConfirmOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-bold text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleStartInventory}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md shadow-purple-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Inventarizatsiyaga O'tish</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
