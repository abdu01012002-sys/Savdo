import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  User, 
  AlertTriangle, 
  Trash2, 
  Edit3, 
  Lock, 
  Download, 
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Info,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { useDb } from '../../context/DbContext';
import { AuditLog } from '../../types';
import { cn, getTodayStr } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface KassaAuditLogViewProps {
  valyutaKursi: number;
}

export const KassaAuditLogView: React.FC<KassaAuditLogViewProps> = ({ valyutaKursi }) => {
  const { db } = useDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Filter audit logs specifically for Kassa, Xavfsizlik, and financial operations
  const kassaAuditLogs = useMemo(() => {
    const rawLogs = db.auditLogs || [];
    
    // Sort descending by date
    const sorted = [...rawLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const todayStr = getTodayStr();
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const weekAgoStr = d.toISOString().split('T')[0];
    const m = new Date();
    m.setMonth(m.getMonth() - 1);
    const monthAgoStr = m.toISOString().split('T')[0];

    return sorted.filter(log => {
      // Check if related to Kassa or Security
      const isKassaRelated = 
        log.entity?.toLowerCase().includes('kassa') ||
        log.entity?.toLowerCase().includes('xavfsizlik') ||
        log.action?.toLowerCase().includes('kassa') ||
        log.action?.toLowerCase().includes('xarajat') ||
        log.action?.toLowerCase().includes('pin') ||
        log.action?.toLowerCase().includes('kurs') ||
        log.action?.toLowerCase().includes('smena') ||
        log.details?.toLowerCase().includes('kassa') ||
        log.details?.toLowerCase().includes('xarajat') ||
        log.details?.toLowerCase().includes('balans');

      if (!isKassaRelated) return false;

      // Date filtering
      const logDate = log.date.split('T')[0];
      if (filterDateRange === 'today' && logDate !== todayStr) return false;
      if (filterDateRange === 'week' && logDate < weekAgoStr) return false;
      if (filterDateRange === 'month' && logDate < monthAgoStr) return false;

      // Severity filtering
      if (filterSeverity !== 'all' && log.severity !== filterSeverity) return false;

      // Action type filtering
      if (filterAction === 'update' && !log.action.includes('update')) return false;
      if (filterAction === 'delete' && !log.action.includes('delete') && !log.action.includes('clear')) return false;
      if (filterAction === 'pin_verify' && !log.action.includes('pin') && !log.action.includes('auth')) return false;
      if (filterAction === 'fraud_alert' && log.severity !== 'high') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = 
          log.user?.toLowerCase().includes(q) ||
          log.details?.toLowerCase().includes(q) ||
          log.action?.toLowerCase().includes(q) ||
          log.entity?.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [db.auditLogs, filterAction, filterSeverity, filterDateRange, searchQuery]);

  // Statistics KPI counts
  const stats = useMemo(() => {
    const rawLogs = db.auditLogs || [];
    let highRiskCount = 0;
    let editCount = 0;
    let deleteCount = 0;
    let pinAuthorizedCount = 0;

    rawLogs.forEach(log => {
      if (log.severity === 'high') highRiskCount++;
      if (log.action?.includes('update') && (log.entity === 'Kassa' || log.details?.includes('Kassa'))) editCount++;
      if (log.action?.includes('delete') || log.action?.includes('clear')) deleteCount++;
      if (log.action?.includes('pin_authorized')) pinAuthorizedCount++;
    });

    return {
      highRiskCount,
      editCount,
      deleteCount,
      pinAuthorizedCount,
      totalKassaLogs: kassaAuditLogs.length
    };
  }, [db.auditLogs, kassaAuditLogs]);

  // Export audit logs to Excel
  const handleExportAuditExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = kassaAuditLogs.map(log => ({
        "Sana / Vaqt": new Date(log.date).toLocaleString('uz-UZ'),
        "Mas'ul Xodim": log.user,
        "Amal Turi": log.action,
        "Bo'lim / Obyekt": log.entity,
        "Xavflilik Darajasi": log.severity.toUpperCase(),
        "Tafsilotlar & Eski/Yangi Qiymat": log.details
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Kassa Audit Tarixi");
      XLSX.writeFile(wb, `Kassa_Audit_Log_${getTodayStr()}.xlsx`);
      toast.success("Audit tarixi Excel fayliga yuklandi!");
    } catch (e) {
      toast.error("Audit eksport qilishda xatolik yuz berdi");
    }
  };

  // Helper to highlight old vs new values if present (e.g., "100 -> 200")
  const renderLogDetails = (details: string) => {
    if (details.includes('->')) {
      const parts = details.split('->');
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--text)]">{details.split(':')[0]}:</p>
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 line-through">
              {parts[0].replace(/^.*?:/, '').trim()}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text3)]" />
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
              {parts[1].trim()}
            </span>
          </div>
        </div>
      );
    }
    return <p className="text-xs text-[var(--text)] leading-relaxed">{details}</p>;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* ANTI-FRAUD & AUDIT KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. 2-Step Verified */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              2-Bosqichli Tasdiqlangan
            </span>
            <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {stats.pinAuthorizedCount} <span className="text-xs font-normal text-[var(--text3)]">ta amal</span>
            </h3>
            <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> Admin PIN orqali
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold">
            <Lock className="w-6 h-6" />
          </div>
        </div>

        {/* 2. Edits */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              Tahrirlangan Amallar
            </span>
            <h3 className="text-2xl font-black text-blue-500 mt-1">
              {stats.editCount} <span className="text-xs font-normal text-[var(--text3)]">ta</span>
            </h3>
            <span className="text-[10px] text-blue-500 font-bold flex items-center gap-1 mt-1">
              <Edit3 className="w-3 h-3" /> Tarixi saqlangan
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center font-bold">
            <Edit3 className="w-6 h-6" />
          </div>
        </div>

        {/* 3. Deletions */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              O'chirilgan / Bekor Qilingan
            </span>
            <h3 className="text-2xl font-black text-rose-500 mt-1">
              {stats.deleteCount} <span className="text-xs font-normal text-[var(--text3)]">ta</span>
            </h3>
            <span className="text-[10px] text-rose-500 font-bold flex items-center gap-1 mt-1">
              <Trash2 className="w-3 h-3" /> Balans qayta tiklangan
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center font-bold">
            <Trash2 className="w-6 h-6" />
          </div>
        </div>

        {/* 4. High Risk Warnings */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4.5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              Anti-Fraud Ogohlantirish
            </span>
            <h3 className={cn(
              "text-2xl font-black mt-1",
              stats.highRiskCount > 0 ? "text-amber-500" : "text-emerald-500"
            )}>
              {stats.highRiskCount} <span className="text-xs font-normal text-[var(--text3)]">shubhali</span>
            </h3>
            <span className={cn(
              "text-[10px] font-bold flex items-center gap-1 mt-1",
              stats.highRiskCount > 0 ? "text-amber-500" : "text-emerald-500"
            )}>
              {stats.highRiskCount > 0 ? "Diqqat talab etiladi" : "Xavfsizlik darajasi a'lo"}
            </span>
          </div>
          <div className={cn(
            "w-12 h-12 rounded-2xl border flex items-center justify-center font-bold",
            stats.highRiskCount > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          )}>
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--text3)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Xodim, operatsiya ID yoki summa bo'yicha qidirish..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action Filter */}
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">Barcha Harakatlar</option>
            <option value="update">Faqat Tahrirlanganlar</option>
            <option value="delete">Faqat O'chirilganlar</option>
            <option value="pin_verify">PIN Tasdiqlanganlar</option>
            <option value="fraud_alert">Shubhali / Yuqori Xavfli</option>
          </select>

          {/* Severity Filter */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">Barcha Daraja</option>
            <option value="high">🔴 Yuqori (High / Anti-Fraud)</option>
            <option value="warning">🟡 Ogohlantirish (Warning)</option>
            <option value="info">🔵 Oddiy (Info)</option>
          </select>

          {/* Date Filter */}
          <div className="flex items-center bg-[var(--bg)] border border-[var(--border)] p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterDateRange('all')}
              className={cn("px-2.5 py-1 rounded-lg transition-all cursor-pointer", filterDateRange === 'all' ? "bg-purple-600 text-white" : "text-[var(--text3)]")}
            >
              Barchasi
            </button>
            <button
              onClick={() => setFilterDateRange('today')}
              className={cn("px-2.5 py-1 rounded-lg transition-all cursor-pointer", filterDateRange === 'today' ? "bg-purple-600 text-white" : "text-[var(--text3)]")}
            >
              Bugun
            </button>
            <button
              onClick={() => setFilterDateRange('week')}
              className={cn("px-2.5 py-1 rounded-lg transition-all cursor-pointer", filterDateRange === 'week' ? "bg-purple-600 text-white" : "text-[var(--text3)]")}
            >
              Hafta
            </button>
          </div>

          {/* Excel Export */}
          <button
            onClick={handleExportAuditExcel}
            className="px-3 py-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            title="Excel formatida audit tarixini yuklash"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            <span>Excel</span>
          </button>
        </div>

      </div>

      {/* AUDIT LOG ENTRIES LIST */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs sm:text-sm font-black text-[var(--text)] uppercase tracking-wider">
              Xavfsizlik & Anti-Fraud Muhrlangan Voqealar Jurnali
            </h3>
          </div>
          <span className="text-xs font-bold text-[var(--text3)] font-mono">
            {kassaAuditLogs.length} ta yozuv
          </span>
        </div>

        {kassaAuditLogs.length === 0 ? (
          <div className="py-12 text-center text-xs font-bold text-[var(--text3)]">
            Hech qanday audit yoki xavfsizlik yozuvi topilmadi
          </div>
        ) : (
          <div className="space-y-2.5">
            {kassaAuditLogs.map((log, lIdx) => {
              const logDate = new Date(log.date);
              const formattedDate = logDate.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const formattedTime = logDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              const isHigh = log.severity === 'high';
              const isWarning = log.severity === 'warning';
              const isUpdate = log.action?.includes('update');
              const isDelete = log.action?.includes('delete') || log.action?.includes('clear');
              const isPinAuth = log.action?.includes('pin') || log.action?.includes('auth');

              return (
                <div
                  key={`${log.id || 'klog'}_${lIdx}`}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--bg)]",
                    isHigh
                      ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500"
                      : isDelete
                      ? "border-rose-500/30 hover:border-rose-500/50"
                      : isUpdate
                      ? "border-blue-500/30 hover:border-blue-500/50"
                      : "border-[var(--border)] hover:border-purple-500/30"
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Action Icon Badge */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 mt-0.5",
                      isHigh ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                      isDelete ? "bg-rose-500/15 text-rose-500" :
                      isUpdate ? "bg-blue-500/15 text-blue-500" :
                      isPinAuth ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" :
                      "bg-emerald-500/15 text-emerald-500"
                    )}>
                      {isHigh ? <AlertTriangle className="w-5 h-5" /> :
                       isDelete ? <Trash2 className="w-5 h-5" /> :
                       isUpdate ? <Edit3 className="w-5 h-5" /> :
                       isPinAuth ? <Lock className="w-5 h-5" /> :
                       <ShieldCheck className="w-5 h-5" />}
                    </div>

                    {/* Content Details */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[var(--text)]">
                          {log.user || "Tizim"}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg2)] text-[var(--text3)] border border-[var(--border)]">
                          {log.entity}
                        </span>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                          isHigh ? "bg-rose-500/10 text-rose-600 border-rose-500/30" :
                          isWarning ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                          "bg-blue-500/10 text-blue-600 border-blue-500/30"
                        )}>
                          {log.action}
                        </span>
                      </div>

                      {renderLogDetails(log.details)}
                    </div>
                  </div>

                  {/* Timestamp & Meta */}
                  <div className="flex md:flex-col items-center md:items-end justify-between text-right shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-[var(--border)]">
                    <span className="text-xs font-mono font-bold text-[var(--text)]">
                      {formattedDate}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text3)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formattedTime}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
};
