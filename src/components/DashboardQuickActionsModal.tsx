import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { ALL_SIZES, cn, getNowStr, getTodayStr } from '../lib/utils';
import { toast } from 'sonner';
import {
  PackagePlus,
  ClipboardCheck,
  TrendingUp,
  ArrowRightLeft,
  DollarSign,
  Wallet,
  Send,
  RefreshCw,
  Zap,
  X,
  Plus,
  Info,
  ChevronRight
} from 'lucide-react';
import { sendDailyReportNotification } from '../services/telegramService';

interface QuickActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewClientModal?: () => void;
}

export const DashboardQuickActionsModal: React.FC<QuickActionsModalProps> = ({ isOpen, onClose }) => {
  const { db, setDb, currentOmbor, currentUser } = useDb();
  const { logAudit } = useAudit();
  const isAdmin = currentUser?.rol === 'admin';

  // Sub-modal states
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

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddProductOpen) {
          setIsAddProductOpen(false);
        } else if (isInventoryConfirmOpen) {
          setIsInventoryConfirmOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddProductOpen, isInventoryConfirmOpen, onClose]);

  if (!isOpen) return null;

  const navigateTo = (tab: string) => {
    onClose();
    window.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
  };

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

      const initialStockData: Record<string, number> = {};
      selectedSizes.forEach(s => {
        initialStockData[s] = initialQty[s] || 0;
      });

      const costVal = parseFloat(costPrice) || 0;
      const saleVal = parseFloat(salePrice) || 0;
      const totalInitialCount = Object.values(initialStockData).reduce((a, b) => a + b, 0);

      setDb(prev => {
        const next = JSON.parse(JSON.stringify(prev));

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

  const visibleActions = actionCards.filter(c => !c.adminOnly || isAdmin);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 p-5 sm:p-6 flex flex-col gap-4 relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center font-black shadow-xs">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                  Tezkor Amallar Konsoli
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  Quick Actions
                </span>
              </div>
              <p className="text-xs text-[var(--text3)]">
                Boshqaruv, kirim, chiqim, mahsulot qo'shish va hisobotlar uchun tezkor o'tishlar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-rose-500 hover:border-rose-500/30 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>

        {/* 8 ta Harakat Kartalari Panjarasi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-1">
          {visibleActions.map(action => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                onClick={action.onClick}
                className="group relative bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] hover:border-blue-500/40 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden text-left"
              >
                {/* Yuqori nafis rangli gradient chiziq */}
                <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-70 group-hover:opacity-100 transition-opacity", action.gradient)} />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-110", action.accentBg)}>
                      <Icon className={cn("w-4.5 h-4.5", action.iconClassName)} />
                    </div>
                    <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border border-transparent", action.badgeColor)}>
                      {action.badge}
                    </span>
                  </div>

                  <h4 className="text-sm font-black text-[var(--text)] group-hover:text-blue-500 transition-colors mb-1">
                    {action.title}
                  </h4>
                  <p className="text-[11px] text-[var(--text3)] line-clamp-2 leading-relaxed">
                    {action.subtitle}
                  </p>
                </div>

                <div className="pt-3 mt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-bold text-[var(--text3)] group-hover:text-blue-500">
                  <span>Bajarish</span>
                  <ChevronRight size={13} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>

        {/* SUB-MODAL 1: YANGI MAHSULOT QO'SHISH */}
        {isAddProductOpen && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsAddProductOpen(false);
            }}
          >
            <div
              className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-black">
                    <PackagePlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--text)]">Yangi Mahsulot Kartasi</h3>
                    <p className="text-xs text-[var(--text3)]">Katalog va ombor zaxirasiga yangi poyafzal modeli</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="w-8 h-8 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                    Model Nomi / Artikul <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: M-104 Qora Classic"
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                      Mavsumiy Toifa
                    </label>
                    <select
                      value={categoryType}
                      onChange={e => setCategoryType(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-blue-500"
                    >
                      <option value="auto">Avtomatik (nomiga qarab)</option>
                      <option value="qishki">Qishki poyafzal</option>
                      <option value="yozgi">Yozgi poyafzal</option>
                      <option value="umumiy">Mavsumiy / Umumiy</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                      Katalog Qaysi Omborda Ochilsin?
                    </label>
                    <select
                      value={targetWarehouse}
                      onChange={e => setTargetWarehouse(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-blue-500"
                    >
                      <option value="both">Har ikkala omborda (Tepa & Kotta)</option>
                      <option value="tepa">Faqat Tepa omborda</option>
                      <option value="kotta">Faqat Kotta omborda</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                      Tannarx (Kirim narxi, $)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={costPrice}
                      onChange={e => setCostPrice(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                      Sotuv Narxi ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={salePrice}
                      onChange={e => setSalePrice(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* SIZES */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text2)] mb-1.5">
                    Mavjud O'lchamlar qatori:
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ALL_SIZES.map(s => {
                      const isSel = selectedSizes.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSize(s)}
                          className={cn(
                            "px-2.5 py-1 text-xs font-black rounded-lg border transition-all cursor-pointer",
                            isSel
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>

                  {selectedSizes.length > 0 && (
                    <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                      <div className="text-[11px] font-bold text-[var(--text3)] mb-2">
                        Boshlang'ich qoldiq (ixtiyoriy, juftlarda):
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {selectedSizes.map(sz => (
                          <div key={sz} className="flex flex-col items-center">
                            <span className="text-[10px] font-bold text-[var(--text3)]">{sz}-o'lcham</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={initialQty[sz] !== undefined ? initialQty[sz] : ''}
                              onChange={e => handleQtyChange(sz, e.target.value)}
                              className="w-full text-center py-1 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] outline-none focus:border-blue-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text2)] mb-1">
                    Izoh (ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    placeholder="Masalan: Yangi kolleksiya, quti 8 juftlik"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
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
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isSubmitting ? "Saqlanmoqda..." : "Mahsulotni Saqlash"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUB-MODAL 2: INVENTARIZATSIYA TASDIQLASH */}
        {isInventoryConfirmOpen && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsInventoryConfirmOpen(false);
            }}
          >
            <div
              className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4"
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
    </div>
  );
};
