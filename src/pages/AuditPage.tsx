import React, { useState, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Bot, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Send, 
  RefreshCw, 
  Eye, 
  Trash2, 
  Check, 
  ChevronRight,
  TrendingUp,
  Package,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import { TelegramLog, TelegramMessageType, TelegramLogStatus } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { sendTelegramMessage } from '../services/telegramService';

export default function AuditPage() {
  const { db, setDb, currentUser } = useDb();
  const [activeTab, setActiveTab] = useState<'system' | 'telegram'>('system');

  // SYSTEM AUDIT LOGS
  const systemLogs = useMemo(() => {
    return [...(db.auditLogs || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [db.auditLogs]);

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'warning' | 'info'>('all');

  const filteredSystemLogs = useMemo(() => {
    return systemLogs.filter(log => {
      const matchesSearch = log.user?.toLowerCase().includes(search.toLowerCase()) || 
                            log.action?.toLowerCase().includes(search.toLowerCase()) || 
                            log.entity?.toLowerCase().includes(search.toLowerCase()) ||
                            log.details?.toLowerCase().includes(search.toLowerCase());
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [systemLogs, search, severityFilter]);

  // TELEGRAM BOT LOGS
  const telegramLogs: TelegramLog[] = useMemo(() => {
    return [...(db.telegramLogs || [])].sort((a, b) => new Date(b.vaqt).getTime() - new Date(a.vaqt).getTime());
  }, [db.telegramLogs]);

  const [tgSearch, setTgSearch] = useState('');
  const [tgStatusFilter, setTgStatusFilter] = useState<'all' | 'yuborildi' | 'xato'>('all');
  const [tgTypeFilter, setTgTypeFilter] = useState<string>('all');
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<TelegramLog | null>(null);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);

  const filteredTelegramLogs = useMemo(() => {
    return telegramLogs.filter(log => {
      const textMatch = (log.matn || '').toLowerCase().includes(tgSearch.toLowerCase()) ||
                        (log.xatolik || '').toLowerCase().includes(tgSearch.toLowerCase()) ||
                        (log.chatId || '').toLowerCase().includes(tgSearch.toLowerCase()) ||
                        (log.xodim || '').toLowerCase().includes(tgSearch.toLowerCase()) ||
                        (log.ombor || '').toLowerCase().includes(tgSearch.toLowerCase());
      const statusMatch = tgStatusFilter === 'all' || log.status === tgStatusFilter;
      const typeMatch = tgTypeFilter === 'all' || log.turi === tgTypeFilter;
      return textMatch && statusMatch && typeMatch;
    });
  }, [telegramLogs, tgSearch, tgStatusFilter, tgTypeFilter]);

  // Stats for Telegram Logs
  const tgStats = useMemo(() => {
    const total = telegramLogs.length;
    const success = telegramLogs.filter(l => l.status === 'yuborildi').length;
    const errors = telegramLogs.filter(l => l.status === 'xato').length;
    const rate = total > 0 ? Math.round((success / total) * 100) : 100;
    return { total, success, errors, rate };
  }, [telegramLogs]);

  const getSeverityIcon = (sev: string) => {
    switch(sev) {
      case 'high': return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityClass = (sev: string) => {
    switch(sev) {
      case 'high': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getMessageTypeBadge = (turi: TelegramMessageType) => {
    switch(turi) {
      case 'kirim':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Kirim</span>
          </span>
        );
      case 'chiqim':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Chiqim (Savdo)</span>
          </span>
        );
      case 'qoldiq':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Package className="w-3.5 h-3.5" />
            <span>Qoldiq Hisoboti</span>
          </span>
        );
      case 'kunlik_hisobot':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Kunlik Hisobot</span>
          </span>
        );
      case 'kam_qolgan':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Kam Qolgan</span>
          </span>
        );
      case 'kassa':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Kassa Harakati</span>
          </span>
        );
      case 'vozvrat':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Vozvrat</span>
          </span>
        );
      case 'brak':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Brak</span>
          </span>
        );
      case 'test':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-gray-500/10 text-gray-600 dark:text-gray-300 border border-gray-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Test Tekshiruv</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-[var(--bg)] text-[var(--text2)] border border-[var(--border)]">
            <Send className="w-3.5 h-3.5" />
            <span>Boshqa</span>
          </span>
        );
    }
  };

  const handleRetrySend = async (log: TelegramLog) => {
    if (!db.telegramConfig?.botToken) {
      toast.error("Bot Token topilmadi. Avval Sozlamalardan botni ulang!");
      return;
    }
    if (!log.matn) {
      toast.error("Ushbu logda yuborish uchun matn saqlanmagan!");
      return;
    }

    setIsRetrying(log.id);
    try {
      const res = await sendTelegramMessage(
        db.telegramConfig.botToken,
        log.chatId || db.telegramConfig.chatId,
        log.matn,
        {
          turi: log.turi,
          xodim: log.xodim,
          ombor: log.ombor,
          setDb,
          meta: log.meta
        }
      );

      if (res.success) {
        toast.success("✅ Xabar Telegramga qayta muvaffaqiyatli yuborildi!");
      } else {
        toast.error(`Qayta yuborishda xatolik: ${res.message}`);
      }
    } catch (err: any) {
      toast.error(`Xatolik: ${err?.message || 'Tarmoq xatosi'}`);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleClearTelegramLogs = () => {
    if (window.confirm("Barcha Telegram loglarini o'chirishni tasdiqlaysizmi?")) {
      setDb(prev => ({
        ...prev,
        telegramLogs: []
      }));
      toast.success("Telegram loglari tozalandi!");
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-rose-500/10 via-[var(--bg2)] to-blue-500/10 border border-rose-500/20 p-5 rounded-3xl shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/30 shadow-xs">
            {activeTab === 'system' ? <ShieldAlert size={28} /> : <Bot size={28} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--text)]">
                {activeTab === 'system' ? "Xavfsizlik Jurnali (Audit)" : "Telegram Bot Loglari & Monitoring"}
              </h1>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                Admin
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[var(--text3)] mt-0.5">
              {activeTab === 'system' 
                ? "Tizimdagi barcha muhim va xavfli amaliyotlar tarixi va o'zgarishlar"
                : "Telegram bot orqali yuborilgan barcha xabarnomalar, ombor qoldiqlari, kirim/chiqimlar va yuzaga kelgan xatoliklar"}
            </p>
          </div>
        </div>

        {/* Top Tab Pill Switcher */}
        <div className="flex items-center p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2",
              activeTab === 'system'
                ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                : "text-[var(--text2)] hover:text-[var(--text)]"
            )}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Tizim Auditi</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-black",
              activeTab === 'system' ? "bg-white/20 text-white" : "bg-[var(--bg2)] text-[var(--text3)]"
            )}>
              {systemLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2",
              activeTab === 'telegram'
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-[var(--text2)] hover:text-[var(--text)]"
            )}
          >
            <Bot className="w-4 h-4" />
            <span>Telegram Loglar</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.2 rounded-full font-black",
              activeTab === 'telegram' ? "bg-white/20 text-white" : "bg-[var(--bg2)] text-[var(--text3)]"
            )}>
              {telegramLogs.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: SYSTEM AUDIT LOGS */}
      {activeTab === 'system' && (
        <>
          <div className="flex flex-col sm:flex-row gap-4 items-center bg-[var(--bg2)] p-4 rounded-2xl border border-[var(--border)] shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
              <input 
                type="text" 
                placeholder="Xodim ismi, harakat yoki ma'lumotni qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-[var(--border)] rounded-xl text-[14px] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all"
              />
            </div>
            <div className="relative w-full sm:w-48">
              <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="w-full pl-10 pr-10 py-3 appearance-none border border-[var(--border)] rounded-xl text-[14px] font-bold bg-[var(--bg)] text-[var(--text)] outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all cursor-pointer"
              >
                <option value="all">Barcha darajalar</option>
                <option value="high">Xavfli (Qizil)</option>
                <option value="warning">Ogohlantirish (Sariq)</option>
                <option value="info">Ma'lumot (Ko'k)</option>
              </select>
            </div>
          </div>

          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            {filteredSystemLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">
                    <tr>
                      <th className="p-4 w-[160px]">Sana & Vaqt</th>
                      <th className="p-4 w-[180px]">Xodim</th>
                      <th className="p-4">Amaliyot (Harakat)</th>
                      <th className="p-4">Tafsilotlar</th>
                      <th className="p-4 w-[120px] text-center">Daraja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[14px]">
                    {filteredSystemLogs.map((log, lIdx) => (
                      <tr key={`${log.id || 'syslog'}_${lIdx}`} className="hover:bg-[var(--bg)] transition-colors">
                        <td className="p-4 text-[var(--text3)] font-medium text-xs">
                          {log.date ? format(new Date(log.date), "dd.MM.yyyy HH:mm", { locale: uz }) : 'Noma\'lum'}
                        </td>
                        <td className="p-4 font-bold text-[var(--text)]">{log.user}</td>
                        <td className="p-4">
                          <div className="font-semibold text-[var(--text)]">{log.action}</div>
                          <div className="text-[12px] text-[var(--text3)]">{log.entity}</div>
                        </td>
                        <td className="p-4 text-[var(--text2)] max-w-md truncate text-xs" title={log.details}>
                          {log.details}
                        </td>
                        <td className="p-4">
                          <div className={`mx-auto w-fit px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${getSeverityClass(log.severity)}`}>
                            {getSeverityIcon(log.severity)}
                            <span className="text-[10px] font-bold uppercase tracking-wider">{log.severity}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center text-[var(--text3)]">
                <ShieldAlert size={48} className="mb-4 opacity-20 text-rose-500" />
                <p className="font-semibold text-sm">Hozircha xavfsizlik jurnali bo'sh yoki qidiruv bo'yicha ma'lumot topilmadi.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: TELEGRAM BOT LOGS */}
      {activeTab === 'telegram' && (
        <>
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-[var(--text3)] block">Jami Xabarlar</span>
                <span className="text-xl sm:text-2xl font-black text-[var(--text)] block mt-0.5">{tgStats.total}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-emerald-500/20 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">Yuborildi</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">{tgStats.success}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-rose-500/20 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-rose-600 dark:text-rose-400 block">Xatoliklar</span>
                <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 block mt-0.5">{tgStats.errors}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-[var(--text3)] block">Muvaffaqiyat</span>
                <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 block mt-0.5">{tgStats.rate}%</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center bg-[var(--bg2)] p-4 rounded-2xl border border-[var(--border)] shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
              <input 
                type="text" 
                placeholder="Xabar matni, xato, xodim, ombor yoki Chat ID qidirish..."
                value={tgSearch}
                onChange={(e) => setTgSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-xl text-xs font-semibold bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-48">
              <select
                value={tgStatusFilter}
                onChange={(e) => setTgStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Barcha Statuslar</option>
                <option value="yuborildi">✅ Yuborildi (Muvaffaqiyatli)</option>
                <option value="xato">❌ Xato (Yuborilmadi)</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="w-full sm:w-48">
              <select
                value={tgTypeFilter}
                onChange={(e) => setTgTypeFilter(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border)] rounded-xl text-xs font-bold bg-[var(--bg)] text-[var(--text)] outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Barcha Xabar Turlari</option>
                <option value="kirim">📥 Kirim (Omborga qabul)</option>
                <option value="chiqim">🛍 Chiqim (Ulgurji savdo)</option>
                <option value="qoldiq">📦 Qoldiq Hisoboti</option>
                <option value="kunlik_hisobot">📊 Kunlik Hisobot</option>
                <option value="kam_qolgan">⚠️ Kam Qolgan Model</option>
                <option value="kassa">💰 Kassa Harakati</option>
                <option value="vozvrat">🔄 Vozvrat</option>
                <option value="brak">🚫 Brak</option>
                <option value="test">🧪 Test Tekshiruv</option>
                <option value="boshqa">💬 Boshqa</option>
              </select>
            </div>

            {/* Clear logs button */}
            {telegramLogs.length > 0 && (
              <button
                type="button"
                onClick={handleClearTelegramLogs}
                className="px-3.5 py-2.5 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                title="Loglarni tozalash"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tozalash</span>
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            {filteredTelegramLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">
                    <tr>
                      <th className="p-4 w-[160px]">Yuborilgan Vaqti</th>
                      <th className="p-4 w-[170px]">Xabar Turi</th>
                      <th className="p-4 w-[130px] text-center">Status</th>
                      <th className="p-4 w-[160px]">Qayerga / Chat ID</th>
                      <th className="p-4">Xabar Mazmuni / Tafsilot</th>
                      <th className="p-4 w-[120px] text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[13px]">
                    {filteredTelegramLogs.map((log, lIdx) => {
                      const isSuccess = log.status === 'yuborildi';
                      const cleanTextPreview = (log.matn || '')
                        .replace(/<[^>]*>?/gm, '')
                        .replace(/\n+/g, ' ')
                        .slice(0, 110);

                      return (
                        <tr 
                          key={`${log.id || 'tlog'}_${lIdx}`} 
                          className="hover:bg-[var(--bg)]/80 transition-colors group cursor-pointer"
                          onClick={() => setSelectedLogForDetail(log)}
                        >
                          {/* Time */}
                          <td className="p-4 text-[var(--text2)] font-medium text-xs whitespace-nowrap">
                            <div className="font-bold text-[var(--text)]">
                              {log.vaqt ? format(new Date(log.vaqt), "HH:mm:ss", { locale: uz }) : 'Noma\'lum'}
                            </div>
                            <div className="text-[10px] text-[var(--text3)]">
                              {log.vaqt ? format(new Date(log.vaqt), "dd.MM.yyyy", { locale: uz }) : ''}
                            </div>
                          </td>

                          {/* Message Type */}
                          <td className="p-4 whitespace-nowrap">
                            {getMessageTypeBadge(log.turi)}
                            {log.ombor && (
                              <div className="text-[10px] text-[var(--text3)] font-semibold mt-1">
                                🏢 {log.ombor}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-4 text-center whitespace-nowrap">
                            {isSuccess ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Yuborildi</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Xato</span>
                              </div>
                            )}
                          </td>

                          {/* Chat ID */}
                          <td className="p-4 text-xs font-mono text-[var(--text2)] whitespace-nowrap">
                            <span className="px-2 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px]">
                              {log.chatId}
                            </span>
                            {log.xodim && (
                              <div className="text-[10px] text-[var(--text3)] font-medium mt-1">
                                👤 {log.xodim}
                              </div>
                            )}
                          </td>

                          {/* Message Preview or Error */}
                          <td className="p-4 max-w-md">
                            {log.xatolik ? (
                              <div className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-start gap-1.5 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{log.xatolik}</span>
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--text2)] line-clamp-2 font-medium">
                                {cleanTextPreview || "Matn saqlanmagan"}
                              </p>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedLogForDetail(log)}
                                className="p-2 rounded-xl bg-[var(--bg)] hover:bg-blue-500/10 hover:text-blue-500 border border-[var(--border)] text-[var(--text3)] transition-colors cursor-pointer"
                                title="Batafsil ko'rish"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {!isSuccess && log.matn && (
                                <button
                                  type="button"
                                  disabled={isRetrying === log.id}
                                  onClick={() => handleRetrySend(log)}
                                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/30 text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Qayta yuborish"
                                >
                                  {isRetrying === log.id ? (
                                    <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center text-[var(--text3)]">
                <Bot size={52} className="mb-4 opacity-25 text-blue-500" />
                <p className="font-bold text-base text-[var(--text)]">Hozircha Telegram loglari mavjud emas</p>
                <p className="text-xs text-[var(--text3)] max-w-sm mt-1">
                  Telegram bot integratsiyasi orqali biror yangi tovar kirimi, savdo yoki kunlik hisobot yuborilganda barcha yozuvlar shu yerda paydo bo'ladi.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* DETAIL MODAL */}
      {selectedLogForDetail && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedLogForDetail(null)}
        >
          <div 
            className="w-full max-w-2xl bg-[var(--bg2)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-blue-500/10 via-[var(--bg2)] to-[var(--bg2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Telegram Xabar Tafsilotlari</h3>
                  <p className="text-xs text-[var(--text3)]">ID: <code className="font-mono">{selectedLogForDetail.id}</code></p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLogForDetail(null)}
                className="w-8 h-8 rounded-full bg-[var(--bg)] hover:bg-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Meta information row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-[var(--bg)] border border-[var(--border)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Vaqt:</span>
                  <span className="font-bold text-[var(--text)] mt-0.5 block">
                    {format(new Date(selectedLogForDetail.vaqt), "dd.MM.yyyy HH:mm:ss")}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Turi:</span>
                  <div className="mt-1">{getMessageTypeBadge(selectedLogForDetail.turi)}</div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Status:</span>
                  <span className={cn(
                    "font-black text-xs block mt-0.5",
                    selectedLogForDetail.status === 'yuborildi' ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {selectedLogForDetail.status === 'yuborildi' ? "✅ YUBORILDI" : "❌ XATOLIK"}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text3)] block">Chat ID:</span>
                  <span className="font-mono font-bold text-[var(--text)] block mt-0.5">
                    {selectedLogForDetail.chatId}
                  </span>
                </div>
              </div>

              {/* Error notice if failed */}
              {selectedLogForDetail.xatolik && (
                <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 space-y-1">
                  <div className="font-black flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Yuzaga kelgan xatolik:</span>
                  </div>
                  <p className="font-mono text-xs">{selectedLogForDetail.xatolik}</p>
                </div>
              )}

              {/* HTML Message Preview */}
              {selectedLogForDetail.matn ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)]">
                      Yuborilgan HTML Telegram Xabari:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedLogForDetail.matn || '');
                        toast.success("Xabar nusxalandi!");
                      }}
                      className="text-[10px] font-bold text-blue-500 hover:underline cursor-pointer"
                    >
                      Nusxa olish
                    </button>
                  </div>
                  <div 
                    className="p-4 rounded-2xl bg-blue-500/5 dark:bg-black/30 border border-blue-500/20 text-[var(--text)] font-sans leading-relaxed whitespace-pre-wrap selection:bg-blue-500/30"
                    dangerouslySetInnerHTML={{ __html: selectedLogForDetail.matn }}
                  />
                </div>
              ) : (
                <p className="text-center text-[var(--text3)] py-4">Xabar matni saqlanmagan</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedLogForDetail(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
              >
                Yopish
              </button>

              {selectedLogForDetail.status === 'xato' && selectedLogForDetail.matn && (
                <button
                  type="button"
                  disabled={isRetrying === selectedLogForDetail.id}
                  onClick={() => handleRetrySend(selectedLogForDetail)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {isRetrying === selectedLogForDetail.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Qayta Yuborish</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
