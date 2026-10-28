import React, { useState, useEffect, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { getCat, getGender, cn, getTodayStr, generateId, getNowStr, formatUzs, formatCompact, isCorrectionTx, formatPhoneNumber } from '../lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { 
  Trash2, User, Download, Users, Briefcase, ShoppingBag, Award, Search, Plus, X, 
  Phone, MapPin, Tag, ChevronDown, Edit2, TrendingUp, BarChart3, Star, Box, 
  ShieldAlert, ArrowRight, Wallet, Calendar, DollarSign, AlertTriangle, CheckCircle2, 
  Clock, Sparkles, Layers, ShieldCheck, MessageCircle, Crown, PieChart, Percent, 
  ExternalLink, Flame, CheckSquare, Square, PhoneCall, Send, Printer, ArrowUpDown, 
  SlidersHorizontal, Check, Building2, Store, Zap
} from 'lucide-react';
import { KontragentlarView } from '../components/KontragentlarView';
import { DashboardQuickActionsModal } from '../components/DashboardQuickActionsModal';
import { SmartSummaryWidget } from '../components/SmartSummaryWidget';
import { BusinessHealthWidget } from '../components/BusinessHealthWidget';
import { IndustryShoeMetricsWidget } from '../components/IndustryShoeMetricsWidget';
import { ModelDrillDownModal } from '../components/ModelDrillDownModal';
import { SecurityAlertModal } from '../components/SecurityAlertModal';
import { DebtCollectionHealthWidget } from '../components/DebtCollectionHealthWidget';
import { Kontragent } from '../types';
import { exportToExcel } from '../lib/exportUtils';
import { LazyViewport } from '../components/common/LazyViewport';
import { Suspense, lazy } from 'react';

// Lazy load heavy recharts analytics views
const LazyKontragentAnaliz = lazy(() => import('../components/KontragentAnaliz'));
const LazyAnalitikaCharts = lazy(() => import('../components/AnalitikaCharts'));
const LazyAdvancedAnalyticsView = lazy(() => import('../components/AdvancedAnalyticsView').then(m => ({ default: m.AdvancedAnalyticsView })));

export default function DashboardPage() {
  const { db, currentOmbor, currentUser } = useDb();
  const { logAudit } = useAudit();
  const [tab, setTab] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedKontragent, setSelectedKontragent] = useState<Kontragent | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isQuickActionsModalOpen, setIsQuickActionsModalOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  useEffect(() => {
    const handlePdfStatus = (e: any) => {
      setIsExportingPDF(e.detail?.isExporting ?? false);
    };
    window.addEventListener('dashboard-pdf-status', handlePdfStatus);
    return () => window.removeEventListener('dashboard-pdf-status', handlePdfStatus);
  }, []);

  const triggerExportExcel = () => {
    if (tab !== 1) {
      setTab(1);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('export-dashboard-excel'));
      }, 250);
    } else {
      window.dispatchEvent(new CustomEvent('export-dashboard-excel'));
    }
  };

  const triggerExportPDF = () => {
    if (tab !== 1) {
      setTab(1);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('export-dashboard-pdf'));
      }, 250);
    } else {
      window.dispatchEvent(new CustomEvent('export-dashboard-pdf'));
    }
  };

  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'all' | 'custom'>('all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(getTodayStr());

  // Timestamp when user dismissed/acknowledged security alert
  const [dismissedAlertTime, setDismissedAlertTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('falak_last_dismissed_security_alert');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const handleDismissSecurityAlert = () => {
    const now = Date.now();
    setDismissedAlertTime(now);
    try {
      localStorage.setItem('falak_last_dismissed_security_alert', String(now));
    } catch (e) {
      console.error(e);
    }
    toast.success("Xavfsizlik ogohlantirishi ko'rib chiqildi deb belgilandi va yashirildi.");
  };

  const handleResetSecurityAlertDismissal = () => {
    setDismissedAlertTime(0);
    try {
      localStorage.removeItem('falak_last_dismissed_security_alert');
    } catch (e) {
      console.error(e);
    }
    toast.info("Xavfsizlik ogohlantirishi qayta tiklandi.");
  };

  // All high-severity logs in the last 24h (regardless of dismissal)
  const all24hHighLogs = React.useMemo(() => {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    return (db.auditLogs || []).filter(log => {
      if (log.severity !== 'high') return false;
      const logTime = log.date ? new Date(log.date).getTime() : 0;
      return logTime >= cutoff24h;
    });
  }, [db.auditLogs]);

  // Only consider high-severity logs from the last 24 hours that haven't been dismissed
  const active24hHighLogs = React.useMemo(() => {
    return all24hHighLogs.filter(log => {
      const logTime = log.date ? new Date(log.date).getTime() : 0;
      if (dismissedAlertTime && logTime <= dismissedAlertTime) return false;
      return true;
    });
  }, [all24hHighLogs, dismissedAlertTime]);

  const openClientProfile = (ism: string) => {
    let k = db.kontragentlar?.find(x => x.ism.trim().toLowerCase() === ism.trim().toLowerCase());
    if (!k) {
      k = db.kontragentlar?.find(x => x.ism.toLowerCase().includes(ism.toLowerCase()) || ism.toLowerCase().includes(x.ism.toLowerCase()));
    }
    if (k) {
      setSelectedKontragent(k);
    } else {
      // Virtual profile if not explicitly in kontragentlar list yet
      const virtualK: Kontragent = {
        id: `virtual_${Date.now()}`,
        ism: ism,
        tel: '',
        manzil: '',
        kategoriya: 'Ulgurji',
        izoh: "Avtomatik aniqlangan xaridor",
        jami: 0,
        xaridlarSoni: 0,
        birinchiXarid: '',
        oxirgiXarid: '',
        qoshilganSana: getTodayStr(),
        balans: 0
      };
      setSelectedKontragent(virtualK);
    }
  };

  // TO'LIQ ALOHIDA SAHIFA (FULL PAGE NAVIGATION) - Tabiiy Skroll
  if (selectedKontragent) {
    return (
      <div className="w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <Suspense fallback={
          <div className="w-full min-h-[400px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
          </div>
        }>
          <LazyKontragentAnaliz 
            kontragent={selectedKontragent} 
            db={db} 
            onClose={() => setSelectedKontragent(null)} 
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 relative">
      {currentUser?.rol === 'admin' && active24hHighLogs.length > 0 && (
        <div 
          onClick={() => setIsSecurityModalOpen(true)}
          className="bg-gradient-to-r from-rose-500/15 via-rose-500/10 to-amber-500/5 border border-rose-500/30 p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl animate-in fade-in slide-in-from-top-4 cursor-pointer hover:border-rose-500/50 hover:bg-rose-500/20 transition-all shadow-xs group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center animate-pulse shrink-0">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-rose-500 font-extrabold text-[15px] group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                  Xavfsizlik ogohlantirishi
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider">
                  So'nggi 24 soat
                </span>
              </div>
              <p className="text-rose-500/85 dark:text-rose-400/85 text-[12px] font-medium mt-0.5">
                {active24hHighLogs.length} ta yangi xavfli amaliyot (tarixni tozalash, partiyani o'chirish yoki narx o'zgarishi) aniqlandi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDismissSecurityAlert();
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
              title="Ogohlantirishni ko'rib chiqildi deb belgilash va Bosh sahifadan yashirish"
            >
              <CheckCircle2 size={14} />
              <span>Ko'rib chiqildi / Yashirish</span>
            </button>

            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 group-hover:underline flex items-center gap-1 pl-1">
              <span>Batafsil diagnostika</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </div>
      )}

      {/* Security Alert Drill-Down Modal */}
      <SecurityAlertModal 
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        db={db}
        currentUser={currentUser}
        onDismissAlert={handleDismissSecurityAlert}
        isDismissed={Boolean(dismissedAlertTime > 0)}
        onRestoreAlert={handleResetSecurityAlertDismissal}
      />

      {/* Quick Actions Modal */}
      <DashboardQuickActionsModal
        isOpen={isQuickActionsModalOpen}
        onClose={() => setIsQuickActionsModalOpen(false)}
      />

      {/* TOP BAR: Main Navigation Tabs & Global Date Filter */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-[var(--bg2)] border border-[var(--border)] p-2.5 rounded-3xl shadow-xs">
        {/* Main 5 Tabs & Security Quick Access */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 xl:pb-0 hide-scrollbar">
          {[
            { id: 1, label: 'Asosiy Boshqaruv', icon: <BarChart3 size={16} /> },
            { id: 2, label: 'Mijozlar Bazasi', icon: <Users size={16} /> },
            { id: 3, label: 'Mijoz Reytingi', icon: <Star size={16} /> },
            { id: 4, label: 'Top Modellar', icon: <TrendingUp size={16} /> },
            { id: 5, label: 'Hudud & Chuqur Tahlil', icon: <MapPin size={16} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                "px-3.5 py-2 cursor-pointer text-[12px] font-extrabold rounded-2xl whitespace-nowrap shrink-0 transition-all tracking-wide flex items-center gap-2",
                tab === t.id 
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25" 
                  : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
              )}
            >
              <span className={tab === t.id ? "text-white" : "text-blue-500"}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          {/* Quick Access to Security Diagnostics icon-only button */}
          {currentUser?.rol === 'admin' && (
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className={cn(
                "relative p-2.5 cursor-pointer rounded-2xl shrink-0 transition-all flex items-center justify-center ml-1 border group",
                all24hHighLogs.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
                  : "border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
              )}
              title="Xavfsizlik va Audit diagnostikasi"
              aria-label="Xavfsizlik diagnostikasi"
            >
              <ShieldAlert size={17} className={all24hHighLogs.length > 0 ? "text-amber-500 animate-pulse group-hover:scale-110 transition-transform" : "text-[var(--text3)] group-hover:scale-110 transition-transform"} />
              {all24hHighLogs.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-black bg-rose-500 text-white flex items-center justify-center leading-none shadow-xs">
                  {all24hHighLogs.length}
                </span>
              )}
            </button>
          )}

          {/* Tezkor Amallar tugmasi (Qalqon yonida, ixcham va qulay) */}
          <button
            type="button"
            onClick={() => setIsQuickActionsModalOpen(true)}
            className="relative p-2.5 cursor-pointer rounded-2xl shrink-0 transition-all flex items-center justify-center ml-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 group"
            title="Tezkor Amallar Paneli (Mahsulot qo'shish, inventarizatsiya, kassa, kirim, chiqim)"
            aria-label="Tezkor Amallar Paneli"
          >
            <Zap size={17} className="text-amber-500 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Global Date Filter (Relevant for tabs 1, 3, 4) */}
        {tab !== 2 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 xl:pt-0 border-t xl:border-t-0 border-[var(--border)]">
            <div className="flex gap-1 overflow-x-auto max-w-full hide-scrollbar">
              {[
                { id: 'today', label: 'Bugun' },
                { id: 'yesterday', label: 'Kecha' },
                { id: 'this_week', label: 'Shu hafta' },
                { id: 'this_month', label: 'Shu oy' },
                { id: 'this_year', label: 'Yillik' },
                { id: 'all', label: 'Barcha vaqt' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    setDateFilter(f.id as any);
                    if (f.id === 'today' || f.id === 'yesterday') {
                      const d = new Date();
                      if (f.id === 'yesterday') d.setDate(d.getDate() - 1);
                      const str = d.toISOString().slice(0, 10);
                      setStartDate(str);
                      setEndDate(str);
                    } else if (f.id === 'this_week') {
                      const d = new Date();
                      const day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6:1);
                      const start = new Date(d.setDate(diff));
                      setStartDate(start.toISOString().slice(0, 10));
                      setEndDate(getTodayStr());
                    } else if (f.id === 'this_month') {
                      const d = new Date();
                      const start = new Date(d.getFullYear(), d.getMonth(), 1);
                      setStartDate(start.toISOString().slice(0, 10));
                      setEndDate(getTodayStr());
                    } else if (f.id === 'this_year') {
                      const d = new Date();
                      const start = new Date(d.getFullYear(), 0, 1);
                      setStartDate(start.toISOString().slice(0, 10));
                      setEndDate(getTodayStr());
                    }
                  }}
                  className={cn(
                    "px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer",
                    dateFilter === f.id
                      ? "bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] shadow-xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Custom Date Range Picker */}
            <div className="flex items-center gap-1.5 ml-auto xl:ml-0">
              <input 
                type="date" 
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setDateFilter('custom'); }}
                className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-[11px] font-bold rounded-xl px-2.5 py-1 outline-none focus:border-blue-500"
              />
              <span className="text-[var(--text3)] text-xs font-bold">-</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setDateFilter('custom'); }}
                className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-[11px] font-bold rounded-xl px-2.5 py-1 outline-none focus:border-blue-500"
              />
            </div>

            {/* Excel va PDF Hisobotlarni Yuklab Olish */}
            <div className="flex items-center gap-1.5 shrink-0 pl-1 xl:border-l xl:border-[var(--border)]">
              <button 
                type="button"
                onClick={triggerExportExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10 rounded-xl text-[11px] font-bold transition-all shadow-xs cursor-pointer active:scale-98"
                title="Bento Analitika va savdo hisobotini Excel formatida yuklab olish"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Excel</span> Eksport
              </button>
              <button 
                type="button"
                onClick={triggerExportPDF}
                disabled={isExportingPDF}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg)] border border-[var(--border)] text-rose-600 dark:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 rounded-xl text-[11px] font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
                title="Bento Analitika va ko'rsatkichlarni PDF formatida yuklab olish"
              >
                <Download size={13} />
                <span>{isExportingPDF ? 'Yuklanmoqda...' : 'PDF'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Asosiy Boshqaruv */}
      {tab === 1 && (
        <div className="flex flex-col gap-4">
          {/* Executive Business Health Score & AI Briefing */}
          <BusinessHealthWidget dateFilter={dateFilter} startDate={startDate} endDate={endDate} />

          {/* Smart 3-Second Summary KPI Widget */}
          <SmartSummaryWidget dateFilter={dateFilter} startDate={startDate} endDate={endDate} />

          {/* Debt & Collection Dynamics Health Widget (Chiqarilgan yuk vs Undirilgan pul & Qarz o'zgarishi) */}
          <DebtCollectionHealthWidget 
            dateFilter={dateFilter} 
            startDate={startDate} 
            endDate={endDate} 
            onSelectClient={openClientProfile}
          />

          {/* Industry Shoe Specific KPIs: Broken Series, DSI, Return & Defect Rates */}
          <IndustryShoeMetricsWidget dateFilter={dateFilter} startDate={startDate} endDate={endDate} />

          {/* Core Analytics & Smart Operational Signals with Intersection Observer */}
          <LazyViewport fallbackHeight="450px" placeholderLabel="Asosiy analitika grafiki yuklanmoqda...">
            <Suspense fallback={
              <div className="w-full h-[450px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
              </div>
            }>
              <LazyAnalitikaCharts dateFilter={dateFilter} startDate={startDate} endDate={endDate} />
            </Suspense>
          </LazyViewport>
        </div>
      )}

      {/* Tab 2: Mijozlar Bazasi */}
      {tab === 2 && <KontragentlarView onSelectClient={setSelectedKontragent} />}

      {/* Tab 3: Mijoz Reytingi */}
      {tab === 3 && <MijozReytingiView onSelectClient={openClientProfile} dateFilter={dateFilter} startDate={startDate} endDate={endDate} />}

      {/* Tab 4: Top Modellar */}
      {tab === 4 && <TopModellarView dateFilter={dateFilter} startDate={startDate} endDate={endDate} />}

      {/* Tab 5: Hududlar va Chuqur Tahlillar */}
      {tab === 5 && (
        <LazyViewport fallbackHeight="500px" placeholderLabel="Kengaytirilgan hududiy tahlillar yuklanmoqda...">
          <Suspense fallback={
            <div className="w-full h-[500px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
            </div>
          }>
            <LazyAdvancedAnalyticsView dateFilter={dateFilter} startDate={startDate} endDate={endDate} />
          </Suspense>
        </LazyViewport>
      )}
    </div>
  );
}

function MijozReytingiView({ onSelectClient, dateFilter, startDate, endDate }: { onSelectClient: (ism: string) => void, dateFilter?: string, startDate?: string, endDate?: string }) {
  const { db } = useDb();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'jamiSumma' | 'jami' | 'count' | 'qarz' | 'lastPurchase' | 'name'>('jamiSumma');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'regular' | 'sleeping' | 'debtor'>('all');
  
  const allChiqim = useMemo(() => {
    return [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(
      t => t.amal === 'chiqim' && !isCorrectionTx(t)
    );
  }, [db.tepa?.transactions, db.kotta?.transactions]);
  
  const filteredChiqim = useMemo(() => {
    return allChiqim.filter(t => {
      if (dateFilter === 'custom' || (dateFilter && dateFilter !== 'all')) {
        if (startDate && t.sana < startDate) return false;
        if (endDate && t.sana > endDate) return false;
        return true;
      }
      return true;
    });
  }, [allChiqim, dateFilter, startDate, endDate]);
  
  interface ClientAggregate {
    ism: string;
    count: number;
    jami: number;
    jamiSumma: number;
    lastPurchase: Date;
    modelsMap: Record<string, number>;
    tel?: string;
    manzil?: string;
    kategoriya?: string;
    balans: number;
    hasTransactionsInPeriod: boolean;
  }

  const processedList = useMemo(() => {
    const kontragentByName = new Map<string, any>();
    (db.kontragentlar || []).forEach(k => {
      if (k.ism) kontragentByName.set(k.ism.trim().toLowerCase(), k);
    });

    const statsMap = new Map<string, ClientAggregate>();

    // 1. First populate from registered Kontragentlar list if available
    (db.kontragentlar || []).forEach(k => {
      const name = k.ism.trim();
      if (!name) return;
      const key = name.toLowerCase();
      statsMap.set(key, {
        ism: name,
        count: Number(k.xaridlarSoni || 0),
        jami: Number(k.jami || 0),
        jamiSumma: 0,
        lastPurchase: k.oxirgiXarid ? new Date(k.oxirgiXarid) : new Date(k.qoshilganSana || '2024-01-01'),
        modelsMap: {},
        tel: k.tel || '',
        manzil: k.manzil || '',
        kategoriya: k.kategoriya || 'Ulgurji',
        balans: Number(k.balans || 0),
        hasTransactionsInPeriod: false
      });
    });

    // 2. Aggregate from transactions with O(1) Map lookups
    filteredChiqim.forEach(t => {
      const rawName = (t.kimdan || t.izoh || '').trim();
      if (!rawName || rawName === '—') return;
      const key = rawName.toLowerCase();

      let clientRecord = statsMap.get(key);
      if (!clientRecord) {
        const matchedK = kontragentByName.get(key);
        clientRecord = {
          ism: rawName,
          count: 0,
          jami: 0,
          jamiSumma: 0,
          lastPurchase: new Date(t.sana || getTodayStr()),
          modelsMap: {},
          tel: matchedK?.tel || '',
          manzil: matchedK?.manzil || '',
          kategoriya: matchedK?.kategoriya || 'Ulgurji',
          balans: matchedK?.balans || 0,
          hasTransactionsInPeriod: true
        };
        statsMap.set(key, clientRecord);
      }

      clientRecord.hasTransactionsInPeriod = true;
      clientRecord.count++;
      const qty = Number(t.soni || 0);
      clientRecord.jami += qty;

      // Calculate dollar revenue ($)
      let itemSum = Number(t.summa || 0);
      if (itemSum === 0 && db.prices && db.prices[t.model]?.sale) {
        itemSum = Number(db.prices[t.model].sale) * qty;
      }
      clientRecord.jamiSumma += itemSum;

      // Track model counts
      if (t.model) {
        clientRecord.modelsMap[t.model] = (clientRecord.modelsMap[t.model] || 0) + qty;
      }

      if (t.sana) {
        const tDate = new Date(t.sana);
        if (!isNaN(tDate.getTime()) && tDate > clientRecord.lastPurchase) {
          clientRecord.lastPurchase = tDate;
        }
      }
    });

    const now = new Date();

    // Transform and calculate segment statuses
    return Array.from(statsMap.values()).map(s => {
      const diffTime = Math.abs(now.getTime() - s.lastPurchase.getTime());
      const daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Determine Top Model
      let topModelName = '—';
      let topModelCount = 0;
      Object.entries(s.modelsMap).forEach(([mName, mQty]) => {
        if (mQty > topModelCount) {
          topModelCount = mQty;
          topModelName = mName;
        }
      });

      // Automatic Status classification
      let status: 'vip' | 'regular' | 'sleeping' | 'new' = 'regular';
      if (s.jami >= 400 || s.jamiSumma >= 3500) {
        status = 'vip';
      } else if (daysSince >= 25 && s.jami >= 20) {
        status = 'sleeping';
      } else if (s.count <= 2 && daysSince < 25) {
        status = 'new';
      } else {
        status = 'regular';
      }

      return {
        ...s,
        daysSince,
        topModelName,
        topModelCount,
        status
      };
    });
  }, [filteredChiqim, db.kontragentlar, db.prices]);

  // KPI calculations
  const totalActiveClients = processedList.length;
  const totalVolume = processedList.reduce((acc, curr) => acc + curr.jami, 0);
  const totalRevenue = processedList.reduce((acc, curr) => acc + curr.jamiSumma, 0);
  const sleepingCount = processedList.filter(c => c.status === 'sleeping').length;
  const vipCount = processedList.filter(c => c.status === 'vip').length;
  const regularCount = processedList.filter(c => c.status === 'regular').length;
  const debtorsCount = processedList.filter(c => c.balans > 0).length;

  // Average per client
  const avgPairsPerClient = totalActiveClients > 0 ? Math.round(totalVolume / totalActiveClients) : 0;
  const avgRevPerClient = totalActiveClients > 0 ? Math.round(totalRevenue / totalActiveClients) : 0;

  // Pareto principle: Top 20% clients share in revenue
  const sortedByRevAll = [...processedList].sort((a, b) => b.jamiSumma - a.jamiSumma);
  const top20PercentCount = Math.max(1, Math.ceil(totalActiveClients * 0.2));
  const top20Rev = sortedByRevAll.slice(0, top20PercentCount).reduce((acc, c) => acc + c.jamiSumma, 0);
  const paretoPct = totalRevenue > 0 ? Math.round((top20Rev / totalRevenue) * 100) : 0;

  // Podium leaders (Top 3 by currently selected sort or revenue)
  const leadersList = [...processedList].sort((a, b) => {
    if (sortBy === 'jami') return b.jami - a.jami;
    return b.jamiSumma - a.jamiSumma;
  });
  const podium1st = leadersList[0] || null;
  const podium2nd = leadersList[1] || null;
  const podium3rd = leadersList[2] || null;

  // Helper for Telegram / Phone link
  const cleanPhoneForTg = (phone?: string) => {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '').replace('+', '');
  };

  // Filter by search & segment
  const filteredList = processedList
    .filter(item => {
      const matchSearch = !search || 
        item.ism.toLowerCase().includes(search.toLowerCase()) ||
        item.tel?.toLowerCase().includes(search.toLowerCase()) ||
        item.topModelName.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (segmentFilter === 'vip') return item.status === 'vip';
      if (segmentFilter === 'regular') return item.status === 'regular';
      if (segmentFilter === 'sleeping') return item.status === 'sleeping';
      if (segmentFilter === 'debtor') return item.balans > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'jamiSumma') return b.jamiSumma - a.jamiSumma;
      if (sortBy === 'jami') return b.jami - a.jami;
      if (sortBy === 'count') return b.count - a.count;
      if (sortBy === 'qarz') return (b.balans || 0) - (a.balans || 0);
      if (sortBy === 'lastPurchase') return b.lastPurchase.getTime() - a.lastPurchase.getTime();
      if (sortBy === 'name') return a.ism.localeCompare(b.ism);
      return b.jamiSumma - a.jamiSumma;
    });

  const maxJami = Math.max(...processedList.map(l => l.jami), 1);
  const maxRevenue = Math.max(...processedList.map(l => l.jamiSumma), 1);

  const exportData = () => {
    const headers = [
      '№', 
      'Mijoz Ismi', 
      'Telefon', 
      'Maqomi', 
      'Jami Hajm (Juft)', 
      'Jami Summa ($)', 
      'Xaridlar (Marta)', 
      'Sevimli Modeli', 
      'Nasiya Balansi', 
      'Oxirgi Xarid',
      'Oxirgi xarid (kun oldin)'
    ];

    const rows = filteredList.map((item, idx) => [
      idx + 1,
      item.ism,
      item.tel || '—',
      item.status === 'vip' ? 'VIP Mijoz' : item.status === 'sleeping' ? 'Uxlayotgan (Xavfli)' : item.status === 'new' ? 'Yangi' : 'Doimiy',
      item.jami,
      item.jamiSumma.toFixed(2),
      item.count,
      item.topModelName !== '—' ? `${item.topModelName} (${item.topModelCount} juft)` : '—',
      item.balans > 0 ? `${item.balans.toLocaleString()} (Qarz)` : item.balans < 0 ? `${Math.abs(item.balans).toLocaleString()} (Haqdor)` : "Qarzsiz",
      item.lastPurchase.toISOString().slice(0, 10),
      `${item.daysSince} kun oldin`
    ]);

    exportToExcel([headers, ...rows], 'Mijozlar_Reytingi_Tahlili', 'Reyting');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP-3 SHОXSUPA (PODIUM) BLOCK */}
      {leadersList.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              Savdo Yetakchilari (TOP-3 Shoxsupa)
            </h3>
            <span className="text-[11px] font-bold text-[var(--text3)]">
              Eng yuqori aylanmaga ega xaridorlar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-end">
            {/* 2-O'RIN (KUMUSH) */}
            {podium2nd ? (
              <div 
                onClick={() => onSelectClient(podium2nd.ism)}
                className="order-2 md:order-1 relative bg-gradient-to-b from-slate-100 to-slate-200/60 dark:from-slate-800/80 dark:to-slate-900/90 border-2 border-slate-300 dark:border-slate-700 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[190px]"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-2xl bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xl shadow-xs">
                    🥈
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/30">
                    2-O'RIN
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-black text-base text-[var(--text)] group-hover:text-blue-500 transition-colors">
                      {podium2nd.ism}
                    </h4>
                  </div>
                  {podium2nd.topModelName !== '—' && (
                    <p className="text-[11px] font-semibold text-[var(--text3)] mt-0.5 truncate">
                      👞 {podium2nd.topModelName} ({podium2nd.topModelCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-300/60 dark:border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Xarid</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">{podium2nd.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">${podium2nd.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:block order-2 md:order-1" />
            )}

            {/* 1-O'RIN (OLTIN - MARKAZIY & BALANDROQ) */}
            {podium1st && (
              <div 
                onClick={() => onSelectClient(podium1st.ism)}
                className="order-1 md:order-2 relative bg-gradient-to-b from-amber-50 to-amber-100/70 dark:from-amber-950/40 dark:to-amber-900/30 border-2 border-amber-400 dark:border-amber-500/60 rounded-3xl p-5 shadow-md hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between min-h-[220px] ring-4 ring-amber-400/10"
              >
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/25 dark:bg-amber-500/20 border border-amber-400 flex items-center justify-center text-2xl shadow-xs">
                    🥇
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-black bg-amber-500 text-white shadow-xs flex items-center gap-1">
                    <Sparkles size={11} /> 1-O'RIN CHEMPION
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-lg text-[var(--text)] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {podium1st.ism}
                    </h4>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      VIP
                    </span>
                  </div>
                  {podium1st.topModelName !== '—' && (
                    <p className="text-xs font-bold text-amber-800/80 dark:text-amber-300/80 mt-1">
                      👞 Sevimli modeli: {podium1st.topModelName} ({podium1st.topModelCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-amber-300/60 dark:border-amber-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Xarid</span>
                    <span className="text-base font-black text-blue-600 dark:text-blue-400">{podium1st.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">${podium1st.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3-O'RIN (BRONZA) */}
            {podium3rd ? (
              <div 
                onClick={() => onSelectClient(podium3rd.ism)}
                className="order-3 relative bg-gradient-to-b from-orange-50 to-orange-100/60 dark:from-orange-950/30 dark:to-orange-900/30 border-2 border-orange-300 dark:border-orange-700/60 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[190px]"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-2xl bg-orange-200/70 dark:bg-orange-800/40 border border-orange-300 dark:border-orange-600 flex items-center justify-center text-xl shadow-xs">
                    🥉
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-400/30">
                    3-O'RIN
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-black text-base text-[var(--text)] group-hover:text-blue-500 transition-colors">
                      {podium3rd.ism}
                    </h4>
                  </div>
                  {podium3rd.topModelName !== '—' && (
                    <p className="text-[11px] font-semibold text-[var(--text3)] mt-0.5 truncate">
                      👞 {podium3rd.topModelName} ({podium3rd.topModelCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-orange-300/60 dark:border-orange-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Xarid</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">{podium3rd.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">${podium3rd.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:block order-3" />
            )}
          </div>
        </div>
      )}

      {/* 2. KENGAYTIRILGAN MINI-KPI KARTALARI (O'RTACHA & PARETO ULUSHI BILAN) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Faol Mijozlar</span>
            <span className="text-xl sm:text-2xl font-black text-[var(--text)] mt-1">{totalActiveClients} <span className="text-xs font-semibold text-[var(--text3)]">ta</span></span>
            <span className="text-[10px] font-semibold text-emerald-500 mt-0.5">🌟 {vipCount} VIP / ⚠️ {sleepingCount} uxlayotgan</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">O'rtacha Xarid / Mijoz</span>
            <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{avgPairsPerClient.toLocaleString()} <span className="text-xs font-semibold text-[var(--text3)]">juft</span></span>
            <span className="text-[10px] font-semibold text-emerald-500 mt-0.5">≈ ${avgRevPerClient.toLocaleString()} / mijoz</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <Box size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">TOP 20% Ulushi (Pareto)</span>
            <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{paretoPct}%</span>
            <span className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">{top20PercentCount} ta mijoz aylanmasi</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <PieChart size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Jami Savdo Aylanmasi</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            <span className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">{totalVolume.toLocaleString()} juft chiqarilgan</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
        </div>
      </div>

      {/* 3. MAIN CARD: FILTERS, SEGMENTS & DATA TABLE */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 md:p-6 shadow-sm flex flex-col gap-5">
        
        {/* Header with Title and Export Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-black">
                🏆
              </span>
              Mijozlar Reytingi & Biznes Tahlili
            </h2>
            <p className="text-xs font-medium text-[var(--text3)] mt-1">
              Eng faol xaridorlar, savdo hajmi, aylanmasi, sevimli modellari, aloqa va qarz intizomi
            </p>
          </div>
          <button 
            onClick={exportData} 
            className="self-start sm:self-auto px-4 py-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Download size={15}/> Excelga Yuklash
          </button>
        </div>

        {/* Quick Segment Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          {[
            { id: 'all', label: 'Barchasi', count: totalActiveClients },
            { id: 'vip', label: '🌟 VIP Mijozlar', count: vipCount },
            { id: 'regular', label: '🔄 Doimiy', count: regularCount },
            { id: 'sleeping', label: '⚠️ Uxlayotganlar', count: sleepingCount },
            { id: 'debtor', label: '🔴 Nasiyadorlar', count: debtorsCount }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setSegmentFilter(chip.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1.5",
                segmentFilter === chip.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
              )}
            >
              <span>{chip.label}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-black",
                segmentFilter === chip.id ? "bg-white/20 text-white" : "bg-[var(--bg2)] text-[var(--text3)]"
              )}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search and Sort controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
            <input 
              type="text" 
              placeholder="Mijoz ismi, telefon yoki sevimli modeli bo'yicha qidiring..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all cursor-pointer"
          >
            <option value="jamiSumma">💵 Jami aylanma ($) bo'yicha</option>
            <option value="jami">📦 Xarid hajmi (juft) bo'yicha</option>
            <option value="count">🔄 Xaridlar soni (marta)</option>
            <option value="qarz">🔴 Nasiya qarzi bo'yicha</option>
            <option value="lastPurchase">🕒 Oxirgi xarid sanasi</option>
            <option value="name">🔤 Alifbo bo'yicha (A-Z)</option>
          </select>
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden lg:block overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full border-collapse text-left bg-[var(--bg)]">
            <thead className="bg-[var(--bg2)] border-b border-[var(--border)] text-[var(--text3)] text-[11px] font-extrabold uppercase tracking-wider">
              <tr>
                <th className="p-3.5 text-center w-14">#</th>
                <th className="p-3.5 min-w-[200px]">Mijoz & Maqom</th>
                <th className="p-3.5 min-w-[150px]">Sevimli Modeli</th>
                <th className="p-3.5 min-w-[130px]">Qarz Intizomi</th>
                <th className="p-3.5 text-center min-w-[100px]">Xaridlar</th>
                <th className="p-3.5 text-right min-w-[120px]">Jami Juft</th>
                <th className="p-3.5 text-right min-w-[120px]">Savdo ($)</th>
                <th className="p-3.5 min-w-[100px] text-center">Aloqa</th>
                <th className="p-3.5 w-24 text-center">Ulush</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs font-medium">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[var(--text3)] font-semibold">
                    Qidiruv yoki filtr bo'yicha hech qanday mijoz topilmadi.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
                  const pct = Math.round(item.jami / maxJami * 100);
                  const tgPhone = cleanPhoneForTg(item.tel);

                  return (
                    <tr 
                      key={item.ism} 
                      onClick={() => onSelectClient(item.ism)}
                      className={cn(
                        "transition-colors cursor-pointer group hover:bg-[var(--bg2)]",
                        i < 3 ? 'bg-amber-500/5' : ''
                      )}
                    >
                      {/* O'rin */}
                      <td className="p-3.5 text-center font-black text-sm text-[var(--text3)] group-hover:text-blue-500">
                        {medal}
                      </td>

                      {/* Mijoz ismi & Maqom badge */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-[var(--text)] group-hover:text-blue-500 transition-colors">
                              {item.ism}
                            </span>
                            
                            {item.status === 'vip' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
                                <Sparkles size={10} /> VIP
                              </span>
                            )}
                            {item.status === 'sleeping' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 flex items-center gap-1">
                                <AlertTriangle size={10} /> Uxlayotgan ({item.daysSince}k)
                              </span>
                            )}
                            {item.status === 'new' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                                Yangi
                              </span>
                            )}
                            {item.status === 'regular' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                Doimiy
                              </span>
                            )}
                          </div>
                          
                          {item.tel && (
                            <span className="text-[11px] text-[var(--text3)] flex items-center gap-1 font-semibold">
                              <Phone size={11} /> {formatPhoneNumber(item.tel)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sevimli Modeli */}
                      <td className="p-3.5">
                        {item.topModelName !== '—' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[11px] font-bold text-[var(--text)]">
                            <span>👞 {item.topModelName}</span>
                            <span className="text-blue-500 font-extrabold">({item.topModelCount} j.)</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text3)] text-[11px]">—</span>
                        )}
                      </td>

                      {/* Qarz Intizomi */}
                      <td className="p-3.5">
                        {item.balans > 0 ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span>${item.balans.toLocaleString()} Qarz</span>
                          </div>
                        ) : item.balans < 0 ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                            <span>${Math.abs(item.balans).toLocaleString()} Haqdor</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            <CheckCircle2 size={12} />
                            <span>Qarzsiz</span>
                          </div>
                        )}
                      </td>

                      {/* Xaridlar soni & Oxirgi sana */}
                      <td className="p-3.5 text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-extrabold text-[var(--text)]">{item.count} marta</span>
                          <span className="text-[10px] text-[var(--text3)] font-semibold">
                            {item.daysSince === 0 ? 'Bugun' : item.daysSince === 1 ? 'Kecha' : `${item.daysSince} kun oldin`}
                          </span>
                        </div>
                      </td>

                      {/* Jami Juft */}
                      <td className="p-3.5 text-right">
                        <span className="font-black text-sm tabular-nums text-blue-600 dark:text-blue-400">
                          {item.jami.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[var(--text3)] ml-1 font-bold">juft</span>
                      </td>

                      {/* Jami Savdo ($) */}
                      <td className="p-3.5 text-right">
                        <span className="font-black text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                          ${item.jamiSumma.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        </span>
                      </td>

                      {/* Tezkor Harakatlar (Telefon & Telegram) */}
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {item.tel ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <a
                              href={`tel:${item.tel}`}
                              title="Qo'ng'iroq qilish"
                              className="w-8 h-8 rounded-xl bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white flex items-center justify-center transition-all shadow-xs"
                            >
                              <Phone size={13} />
                            </a>
                            <a
                              href={`https://t.me/+${tgPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Telegram orqali yozish"
                              className="w-8 h-8 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-sky-600 hover:text-white flex items-center justify-center transition-all shadow-xs"
                            >
                              <MessageCircle size={13} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text3)]">—</span>
                        )}
                      </td>

                      {/* Ulush progress bari */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden flex-1 relative">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-500", i < 3 ? "bg-amber-500" : "bg-blue-500")} 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text3)] w-6 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS VIEW */}
        <div className="lg:hidden flex flex-col gap-3">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center text-[var(--text3)] font-semibold bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
              Qidiruv yoki filtr bo'yicha hech qanday mijoz topilmadi.
            </div>
          ) : (
            filteredList.map((item, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
              const pct = Math.round(item.jami / maxJami * 100);
              const tgPhone = cleanPhoneForTg(item.tel);

              return (
                <div 
                  key={item.ism} 
                  onClick={() => onSelectClient(item.ism)}
                  className={cn(
                    "p-4 flex flex-col gap-3 rounded-2xl border cursor-pointer active:scale-[0.99] transition-all bg-[var(--bg)] shadow-xs",
                    i < 3 ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)]'
                  )}
                >
                  {/* Top line: Medal, Name, Segment badge */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg font-black shrink-0">{medal}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-[var(--text)]">{item.ism}</span>
                          {item.status === 'vip' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/15 text-amber-600 border border-amber-500/25">
                              VIP
                            </span>
                          )}
                          {item.status === 'sleeping' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/15 text-rose-600 border border-rose-500/25">
                              Uxlayotgan
                            </span>
                          )}
                        </div>
                        {item.tel && (
                          <span className="text-[11px] text-[var(--text3)] font-semibold">{formatPhoneNumber(item.tel)}</span>
                        )}
                      </div>
                    </div>

                    {/* Right side sums */}
                    <div className="text-right shrink-0">
                      <div className="font-black text-sm text-blue-600 dark:text-blue-400">
                        {item.jami.toLocaleString()} <span className="text-[10px] font-bold">j.</span>
                      </div>
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        ${item.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {/* Middle chips: Top model & Debt indicator */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)] text-[11px] flex-wrap">
                    {item.topModelName !== '—' ? (
                      <span className="font-semibold text-[var(--text2)]">
                        👞 {item.topModelName} <b className="text-blue-500">({item.topModelCount} j.)</b>
                      </span>
                    ) : (
                      <span className="text-[var(--text3)]">Model: —</span>
                    )}

                    {item.balans > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 font-bold text-[10px]">
                        🔴 ${item.balans.toLocaleString()} Qarz
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                        🟢 Qarzsiz
                      </span>
                    )}
                  </div>

                  {/* Quick actions for mobile & stats */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                    <div className="flex flex-col text-[10px] font-semibold text-[var(--text3)]">
                      <span>{item.count} marta xarid qildi</span>
                      <span>Oxirgi: {item.daysSince === 0 ? 'Bugun' : `${item.daysSince} kun oldin`}</span>
                    </div>

                    {item.tel && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={`tel:${item.tel}`}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Phone size={12} /> Qo'ng'iroq
                        </a>
                        <a
                          href={`https://t.me/+${tgPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-xl bg-sky-500/10 text-sky-600"
                        >
                          <MessageCircle size={14} />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-full">
                    <div 
                      className={cn("h-full rounded-full", i < 3 ? "bg-amber-500" : "bg-blue-500")} 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}

function TopModellarView({ dateFilter, startDate, endDate }: { dateFilter?: string, startDate?: string, endDate?: string }) {
  const { db } = useDb();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'jamiSumma' | 'jami' | 'count' | 'stock' | 'name'>('jamiSumma');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'qishki' | 'yozgi' | 'erkaklar' | 'ayollar' | 'bestseller' | 'low_stock' | 'out_of_stock'>('all');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  
  const allChiqim = useMemo(() => {
    return [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])].filter(
      t => t.amal === 'chiqim' && !isCorrectionTx(t)
    );
  }, [db.tepa?.transactions, db.kotta?.transactions]);
  
  const filteredChiqim = useMemo(() => {
    return allChiqim.filter(t => {
      if (dateFilter === 'custom' || (dateFilter && dateFilter !== 'all')) {
        if (startDate && t.sana < startDate) return false;
        if (endDate && t.sana > endDate) return false;
        return true;
      }
      return true;
    });
  }, [allChiqim, dateFilter, startDate, endDate]);

  interface ModelAggregate {
    model: string;
    count: number;
    jami: number;
    jamiSumma: number;
    lastPurchase: Date;
    clientsMap: Record<string, number>;
    currentStock: number;
    topBuyerName: string;
    topBuyerCount: number;
    cat: string;
    gender: string;
    status: 'bestseller' | 'trending' | 'slow' | 'regular';
  }
  
  const processedModels = useMemo(() => {
    // Pre-calculate total stock per model across warehouses in O(M)
    const stockMap = new Map<string, number>();
    const countStock = (stockObj?: Record<string, any>) => {
      if (!stockObj) return;
      for (const [modelName, item] of Object.entries(stockObj)) {
        let count = 0;
        if (typeof item === 'number') count = item;
        else if (item && typeof item === 'object') {
          for (const val of Object.values(item)) count += Number(val || 0);
        }
        stockMap.set(modelName, (stockMap.get(modelName) || 0) + count);
      }
    };
    countStock(db.tepa?.stock);
    countStock(db.kotta?.stock);

    const rawStats: Record<string, { count: number, jami: number, jamiSumma: number, lastPurchase: Date, clientsMap: Record<string, number> }> = {};
    
    filteredChiqim.forEach(t => {
      if (!t.model) return;
      const model = t.model.trim();
      if (!rawStats[model]) {
        rawStats[model] = { count: 0, jami: 0, jamiSumma: 0, lastPurchase: new Date(t.sana || getTodayStr()), clientsMap: {} };
      }
      
      rawStats[model].count++;
      const qty = Number(t.soni || 0);
      rawStats[model].jami += qty;

      // Dollar revenue
      let itemSum = Number(t.summa || 0);
      if (itemSum === 0 && db.prices && db.prices[model]?.sale) {
        itemSum = Number(db.prices[model].sale) * qty;
      }
      rawStats[model].jamiSumma += itemSum;

      // Track buyer
      const clientName = (t.kimdan || t.izoh || 'Noma\'lum mijoz').trim();
      rawStats[model].clientsMap[clientName] = (rawStats[model].clientsMap[clientName] || 0) + qty;

      if (t.sana) {
        const tDate = new Date(t.sana);
        if (!isNaN(tDate.getTime()) && tDate > rawStats[model].lastPurchase) {
          rawStats[model].lastPurchase = tDate;
        }
      }
    });

    // Transform processed models
    return Object.entries(rawStats).map(([model, s]) => {
      const currentStock = stockMap.get(model) || 0;
      const cat = getCat(model);
      const gender = getGender(model);

      // Determine top buyer
      let topBuyerName = '—';
      let topBuyerCount = 0;
      Object.entries(s.clientsMap).forEach(([cName, cQty]) => {
        if (cQty > topBuyerCount) {
          topBuyerCount = cQty;
          topBuyerName = cName;
        }
      });

      // Model Status classification
      let status: 'bestseller' | 'trending' | 'slow' | 'regular' = 'regular';
      if (s.jami >= 300 || s.jamiSumma >= 2500) {
        status = 'bestseller';
      } else if (s.count >= 8 && s.jami < 300) {
        status = 'trending';
      } else if (s.jami < 30 && currentStock > 100) {
        status = 'slow';
      } else {
        status = 'regular';
      }

      return {
        model,
        count: s.count,
        jami: s.jami,
        jamiSumma: s.jamiSumma,
        lastPurchase: s.lastPurchase,
        clientsMap: s.clientsMap,
        currentStock,
        topBuyerName,
        topBuyerCount,
        cat,
        gender,
        status
      };
    });
  }, [filteredChiqim, db.prices, db.tepa?.stock, db.kotta?.stock]);

  // KPI Calculations
  const totalActiveModels = processedModels.length;
  const totalSoldPairs = processedModels.reduce((acc, curr) => acc + curr.jami, 0);
  const totalRevenue = processedModels.reduce((acc, curr) => acc + curr.jamiSumma, 0);
  const bestsellerCount = processedModels.filter(m => m.status === 'bestseller').length;
  const lowStockCount = processedModels.filter(m => m.currentStock > 0 && m.currentStock < 50).length;
  const outOfStockCount = processedModels.filter(m => m.currentStock === 0).length;

  // Pareto Principle: Top 20% models share in revenue
  const sortedByRevAll = [...processedModels].sort((a, b) => b.jamiSumma - a.jamiSumma);
  const top20PercentCount = Math.max(1, Math.ceil(totalActiveModels * 0.2));
  const top20Rev = sortedByRevAll.slice(0, top20PercentCount).reduce((acc, c) => acc + c.jamiSumma, 0);
  const paretoPct = totalRevenue > 0 ? Math.round((top20Rev / totalRevenue) * 100) : 0;

  // Podium Leaders (Top 3)
  const leadersList = [...processedModels].sort((a, b) => {
    if (sortBy === 'jami') return b.jami - a.jami;
    return b.jamiSumma - a.jamiSumma;
  });
  const podium1st = leadersList[0] || null;
  const podium2nd = leadersList[1] || null;
  const podium3rd = leadersList[2] || null;

  // Filter and Sort
  const filteredList = processedModels
    .filter(item => {
      const matchesSearch = item.model.toLowerCase().includes(search.toLowerCase()) ||
        item.topBuyerName.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (categoryFilter === 'qishki') return item.cat === 'qishki';
      if (categoryFilter === 'yozgi') return item.cat === 'yozgi';
      if (categoryFilter === 'erkaklar') return item.gender === 'erkaklar';
      if (categoryFilter === 'ayollar') return item.gender === 'ayollar';
      if (categoryFilter === 'bestseller') return item.status === 'bestseller';
      if (categoryFilter === 'low_stock') return item.currentStock > 0 && item.currentStock < 50;
      if (categoryFilter === 'out_of_stock') return item.currentStock === 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'jamiSumma') return b.jamiSumma - a.jamiSumma;
      if (sortBy === 'jami') return b.jami - a.jami;
      if (sortBy === 'count') return b.count - a.count;
      if (sortBy === 'stock') return b.currentStock - a.currentStock;
      if (sortBy === 'name') return a.model.localeCompare(b.model);
      return b.jamiSumma - a.jamiSumma;
    });
    
  const maxJami = Math.max(...processedModels.map(l => l.jami), 1);

  const exportData = () => {
    const headers = [
      '№', 
      'Model Nomi', 
      'Mavsum', 
      'Toifa (Jinsi)',
      'Holati / Maqomi', 
      'Sotilgan Juft', 
      'Savdo Aylanmasi ($)', 
      'Chiqimlar Soni', 
      'Asosiy Xaridor', 
      'Ombordagi Qoldiq (Juft)'
    ];

    const rows = filteredList.map((item, idx) => [
      idx + 1,
      item.model,
      item.cat === 'qishki' ? 'Qishki' : item.cat === 'yozgi' ? 'Yozgi' : 'Umumiy',
      item.gender === 'erkaklar' ? 'Erkaklar' : item.gender === 'ayollar' ? 'Ayollar' : 'Umumiy',
      item.status === 'bestseller' ? 'Bestseller (Xit)' : item.status === 'trending' ? 'O\'sayotgan trend' : item.status === 'slow' ? 'Sekin aylanma' : 'Oddiy',
      item.jami,
      item.jamiSumma.toFixed(2),
      item.count,
      item.topBuyerName !== '—' ? `${item.topBuyerName} (${item.topBuyerCount} j.)` : '—',
      item.currentStock
    ]);

    exportToExcel([headers, ...rows], 'Top_Modellar_Tahlili', 'Modellar');
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. TOP-3 SHОXSUPA (PODIUM) BLOCK FOR BESTSELLER MODELS */}
      {leadersList.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              Eng Xaridorgir Modellar (TOP-3 Xitlar)
            </h3>
            <span className="text-[11px] font-bold text-[var(--text3)]">
              Eng ko'p sotilgan va daromad keltirgan modellar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-end">
            {/* 2-O'RIN (KUMUSH) */}
            {podium2nd ? (
              <div 
                onClick={() => setSelectedModel(podium2nd.model)}
                className="order-2 md:order-1 relative bg-gradient-to-b from-slate-100 to-slate-200/60 dark:from-slate-800/80 dark:to-slate-900/90 border-2 border-slate-300 dark:border-slate-700 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[190px]"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-2xl bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xl shadow-xs">
                    🥈
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-500/15 text-slate-700 dark:text-slate-300 uppercase">
                      {podium2nd.cat}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-400/30">
                      2-O'RIN
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="font-black text-base text-[var(--text)] group-hover:text-blue-500 transition-colors">
                    👞 {podium2nd.model}
                  </h4>
                  {podium2nd.topBuyerName !== '—' && (
                    <p className="text-[11px] font-semibold text-[var(--text3)] mt-0.5 truncate">
                      👤 Asosiy xaridor: {podium2nd.topBuyerName} ({podium2nd.topBuyerCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-300/60 dark:border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Sotildi</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">{podium2nd.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">${podium2nd.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:block order-2 md:order-1" />
            )}

            {/* 1-O'RIN (OLTIN - CHEMPION MODEL) */}
            {podium1st && (
              <div 
                onClick={() => setSelectedModel(podium1st.model)}
                className="order-1 md:order-2 relative bg-gradient-to-b from-amber-50 to-amber-100/70 dark:from-amber-950/40 dark:to-amber-900/30 border-2 border-amber-400 dark:border-amber-500/60 rounded-3xl p-5 shadow-md hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between min-h-[220px] ring-4 ring-amber-400/10"
              >
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/25 dark:bg-amber-500/20 border border-amber-400 flex items-center justify-center text-2xl shadow-xs">
                    🥇
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-black bg-amber-500 text-white shadow-xs flex items-center gap-1">
                    <Flame size={12} /> 1-O'RIN BESTSELLER
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-lg text-[var(--text)] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      👞 {podium1st.model}
                    </h4>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 uppercase">
                      {podium1st.cat}
                    </span>
                  </div>
                  {podium1st.topBuyerName !== '—' && (
                    <p className="text-xs font-bold text-amber-800/80 dark:text-amber-300/80 mt-1">
                      👤 Asosiy xaridor: {podium1st.topBuyerName} ({podium1st.topBuyerCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-amber-300/60 dark:border-amber-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Jami Sotildi</span>
                    <span className="text-base font-black text-blue-600 dark:text-blue-400">{podium1st.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">${podium1st.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3-O'RIN (BRONZA) */}
            {podium3rd ? (
              <div 
                onClick={() => setSelectedModel(podium3rd.model)}
                className="order-3 relative bg-gradient-to-b from-orange-50 to-orange-100/60 dark:from-orange-950/30 dark:to-orange-900/30 border-2 border-orange-300 dark:border-orange-700/60 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[190px]"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-2xl bg-orange-200/70 dark:bg-orange-800/40 border border-orange-300 dark:border-orange-600 flex items-center justify-center text-xl shadow-xs">
                    🥉
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-700 dark:text-orange-300 uppercase">
                      {podium3rd.cat}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-400/30">
                      3-O'RIN
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="font-black text-base text-[var(--text)] group-hover:text-blue-500 transition-colors">
                    👞 {podium3rd.model}
                  </h4>
                  {podium3rd.topBuyerName !== '—' && (
                    <p className="text-[11px] font-semibold text-[var(--text3)] mt-0.5 truncate">
                      👤 Asosiy xaridor: {podium3rd.topBuyerName} ({podium3rd.topBuyerCount} j.)
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-orange-300/60 dark:border-orange-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Sotildi</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">{podium3rd.jami.toLocaleString()} juft</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-[var(--text3)] block">Aylanma ($)</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">${podium3rd.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:block order-3" />
            )}
          </div>
        </div>
      )}

      {/* 2. KENGAYTIRILGAN MINI-KPI KARTALARI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Sotilgan Modellar</span>
            <span className="text-xl sm:text-2xl font-black text-[var(--text)] mt-1">{totalActiveModels} <span className="text-xs font-semibold text-[var(--text3)]">ta</span></span>
            <span className="text-[10px] font-semibold text-amber-500 mt-0.5">🔥 {bestsellerCount} ta bestseller</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Box size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Jami Sotilgan</span>
            <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{totalSoldPairs.toLocaleString()} <span className="text-xs font-semibold text-[var(--text3)]">juft</span></span>
            <span className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">Barcha chiqimlar bo'yicha</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <Layers size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">TOP 20% Xitlar Ulushi</span>
            <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{paretoPct}%</span>
            <span className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">{top20PercentCount} ta model aylanmasi</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <PieChart size={22} />
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Savdo Aylanmasi</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</span>
            <span className="text-[10px] font-semibold text-rose-500 mt-0.5">🔴 {lowStockCount} modelda zaxira kam</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
        </div>
      </div>

      {/* 3. MAIN CARD: FILTERS & DATA TABLE */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 md:p-6 shadow-sm flex flex-col gap-5">
        
        {/* Header with Title and Export Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                <Box size={20} />
              </span>
              Top Modellar & Mahsulotlar Tahlili
            </h2>
            <p className="text-xs font-medium text-[var(--text3)] mt-1">
              Eng xaridorgir modellar, sotilish dinamikasi, ombor zaxirasi va asosiy mijozlar kesimi
            </p>
          </div>
          <button 
            onClick={exportData} 
            className="self-start sm:self-auto px-4 py-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Download size={15}/> Excelga Yuklash
          </button>
        </div>

        {/* Quick Filter Chips (Pill Tabs) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          {[
            { id: 'all', label: 'Barchasi', count: totalActiveModels },
            { id: 'bestseller', label: '🔥 Bestsellerlar', count: bestsellerCount },
            { id: 'qishki', label: '❄️ Qishki', count: processedModels.filter(m => m.cat === 'qishki').length },
            { id: 'yozgi', label: '☀️ Yozgi', count: processedModels.filter(m => m.cat === 'yozgi').length },
            { id: 'erkaklar', label: '👞 Erkaklar', count: processedModels.filter(m => m.gender === 'erkaklar').length },
            { id: 'ayollar', label: '👠 Ayollar', count: processedModels.filter(m => m.gender === 'ayollar').length },
            { id: 'low_stock', label: '🔴 Zaxira kam (< 50)', count: lowStockCount },
            { id: 'out_of_stock', label: '⚫ Tugagan (0)', count: outOfStockCount }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setCategoryFilter(chip.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1.5",
                categoryFilter === chip.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
              )}
            >
              <span>{chip.label}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-black",
                categoryFilter === chip.id ? "bg-white/20 text-white" : "bg-[var(--bg2)] text-[var(--text3)]"
              )}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search and Sort controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
            <input 
              type="text" 
              placeholder="Model nomi yoki asosiy xaridor bo'yicha qidiring..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-blue-500 transition-all cursor-pointer"
          >
            <option value="jamiSumma">💵 Jami aylanma ($) bo'yicha</option>
            <option value="jami">📦 Sotilgani (juft) bo'yicha</option>
            <option value="count">🔄 Chiqimlar soni (marta)</option>
            <option value="stock">📉 Ombordagi qoldiq bo'yicha</option>
            <option value="name">🔤 Alifbo bo'yicha (A-Z)</option>
          </select>
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden lg:block overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="w-full border-collapse text-left bg-[var(--bg)]">
            <thead className="bg-[var(--bg2)] border-b border-[var(--border)] text-[var(--text3)] text-[11px] font-extrabold uppercase tracking-wider">
              <tr>
                <th className="p-3.5 text-center w-14">#</th>
                <th className="p-3.5 min-w-[200px]">Model Nomi & Maqomi</th>
                <th className="p-3.5 min-w-[170px]">Asosiy Xaridor</th>
                <th className="p-3.5 min-w-[140px]">Ombor Qoldig'i</th>
                <th className="p-3.5 text-center min-w-[100px]">Chiqimlar</th>
                <th className="p-3.5 text-right min-w-[120px]">Sotildi (juft)</th>
                <th className="p-3.5 text-right min-w-[120px]">Savdo ($)</th>
                <th className="p-3.5 w-28 text-center">Ulush</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs font-medium">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--text3)] font-semibold">
                    Qidiruv yoki filtr bo'yicha hech qanday model topilmadi.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
                  const pct = Math.round(item.jami / maxJami * 100);

                  return (
                    <tr 
                      key={item.model} 
                      onClick={() => setSelectedModel(item.model)}
                      className={cn(
                        "transition-colors cursor-pointer group hover:bg-[var(--bg2)]",
                        i < 3 ? 'bg-amber-500/5' : ''
                      )}
                    >
                      {/* O'rin */}
                      <td className="p-3.5 text-center font-black text-sm text-[var(--text3)] group-hover:text-blue-500">
                        {medal}
                      </td>

                      {/* Model nomi & Badges */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm text-[var(--text)] group-hover:text-blue-500 transition-colors">
                              👞 {item.model}
                            </span>
                            
                            {item.status === 'bestseller' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
                                <Flame size={10} /> Xit
                              </span>
                            )}
                            {item.status === 'trending' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
                                Trend
                              </span>
                            )}
                          </div>
                          
                          <span className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider">
                            Mavsum: {item.cat}
                          </span>
                        </div>
                      </td>

                      {/* Asosiy Xaridor */}
                      <td className="p-3.5">
                        {item.topBuyerName !== '—' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-[11px] font-bold text-[var(--text)]">
                            <User size={12} className="text-[var(--text3)]" />
                            <span className="truncate max-w-[130px]">{item.topBuyerName}</span>
                            <span className="text-blue-500 font-extrabold">({item.topBuyerCount} j.)</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text3)] text-[11px]">—</span>
                        )}
                      </td>

                      {/* Ombor Qoldig'i & Stock Alert */}
                      <td className="p-3.5">
                        {item.currentStock === 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 font-bold text-[11px]">
                            ⚫ Tugagan (0 j.)
                          </span>
                        ) : item.currentStock < 50 ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 font-bold text-[11px] flex items-center gap-1 w-fit">
                            <AlertTriangle size={11} /> {item.currentStock} juft (Kam)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            🟢 {item.currentStock} juft qoldiq
                          </span>
                        )}
                      </td>

                      {/* Chiqimlar soni */}
                      <td className="p-3.5 text-center">
                        <span className="font-extrabold text-[var(--text)]">{item.count} marta</span>
                      </td>

                      {/* Jami Sotilgan Juft */}
                      <td className="p-3.5 text-right">
                        <span className="font-black text-sm tabular-nums text-blue-600 dark:text-blue-400">
                          {item.jami.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[var(--text3)] ml-1 font-bold">juft</span>
                      </td>

                      {/* Savdo ($) */}
                      <td className="p-3.5 text-right">
                        <span className="font-black text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                          ${item.jamiSumma.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        </span>
                      </td>

                      {/* Ulush progress bari */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden flex-1 relative">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-500", i < 3 ? "bg-amber-500" : "bg-blue-500")} 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text3)] w-6 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS VIEW */}
        <div className="lg:hidden flex flex-col gap-3">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center text-[var(--text3)] font-semibold bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
              Qidiruv yoki filtr bo'yicha hech qanday model topilmadi.
            </div>
          ) : (
            filteredList.map((item, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
              const pct = Math.round(item.jami / maxJami * 100);

              return (
                <div 
                  key={item.model} 
                  onClick={() => setSelectedModel(item.model)}
                  className={cn(
                    "p-4 flex flex-col gap-3 rounded-2xl border cursor-pointer active:scale-[0.99] transition-all bg-[var(--bg)] shadow-xs",
                    i < 3 ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)]'
                  )}
                >
                  {/* Top line: Medal, Model name, Status */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg font-black shrink-0">{medal}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-[var(--text)]">👞 {item.model}</span>
                          {item.status === 'bestseller' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/15 text-amber-600 border border-amber-500/25">
                              Xit
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Mavsum: {item.cat}</span>
                      </div>
                    </div>

                    {/* Right side sums */}
                    <div className="text-right shrink-0">
                      <div className="font-black text-sm text-blue-600 dark:text-blue-400">
                        {item.jami.toLocaleString()} <span className="text-[10px] font-bold">j.</span>
                      </div>
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        ${item.jamiSumma.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {/* Middle chips: Top Buyer & Stock Alert */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)] text-[11px] flex-wrap">
                    {item.topBuyerName !== '—' ? (
                      <span className="font-semibold text-[var(--text2)]">
                        👤 {item.topBuyerName} <b className="text-blue-500">({item.topBuyerCount} j.)</b>
                      </span>
                    ) : (
                      <span className="text-[var(--text3)]">Xaridor: —</span>
                    )}

                    {item.currentStock === 0 ? (
                      <span className="px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-600 font-bold text-[10px]">
                        ⚫ 0 juft
                      </span>
                    ) : item.currentStock < 50 ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 font-bold text-[10px]">
                        🔴 {item.currentStock} j. (Kam)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold text-[10px]">
                        🟢 {item.currentStock} j. qoldiq
                      </span>
                    )}
                  </div>

                  {/* Bottom info & progress bar */}
                  <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--text3)] pt-1">
                    <span>{item.count} marta chiqim bo'lgan</span>
                    <span className="text-blue-500 font-bold flex items-center gap-1">
                      Batafsil ko'rish <ArrowRight size={11} />
                    </span>
                  </div>

                  <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-full">
                    <div 
                      className={cn("h-full rounded-full", i < 3 ? "bg-amber-500" : "bg-blue-500")} 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* MODEL DRILL-DOWN MODAL */}
      {selectedModel && (
        <ModelDrillDownModal 
          modelName={selectedModel} 
          onClose={() => setSelectedModel(null)} 
        />
      )}
    </div>
  );
}
