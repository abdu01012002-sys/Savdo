import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Printer, 
  ArrowRight, 
  Layers, 
  Calendar, 
  User, 
  TrendingUp, 
  Radio, 
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import { ProductionParty } from '../lib/productionIntegration';
import { DbState } from '../types';
import { formatUzs } from '../lib/utils';
import { toast } from 'sonner';

interface ProductionSverkaModalProps {
  isOpen: boolean;
  onClose: () => void;
  prodParties: ProductionParty[];
  db: DbState;
  onSelectForKirim: (party: ProductionParty, remainingQty: number, isContinuation: boolean) => void;
}

export const ProductionSverkaModal: React.FC<ProductionSverkaModalProps> = ({
  isOpen,
  onClose,
  prodParties,
  db,
  onSelectForKirim
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'diff' | 'partial' | 'pending' | 'completed'>('diff');
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null);

  // Combine all transactions for accurate matching
  const allKirimTransactions = useMemo(() => {
    const list: any[] = [];
    (['tepa', 'kotta', 'sort2'] as const).forEach(wKey => {
      (db[wKey]?.transactions || []).forEach(t => {
        if (t.amal === 'kirim') list.push(t);
      });
    });
    return list;
  }, [db.tepa, db.kotta, db.sort2]);

  // Analyze each party from Realtime Database
  const analyzedParties = useMemo(() => {
    return prodParties.map((party) => {
      const pId = party.id || party.partiyaId || '';
      const sotuvStage = party.stages?.sotuv_ombori || party.stages?.ombor || party.stages?.sotuv;
      const modelName = party.model || party.modelNomi || party.partiyaNomi || party.nomi || 'Nomsiz model';
      
      const totalDelivered = Number(sotuvStage?.inQty || sotuvStage?.outQty || party.soni || party.jamiSoni || 0);
      const stageDate = sotuvStage?.date || party.sana || party.createdDate || '-';
      const workerName = sotuvStage?.workerName || sotuvStage?.sender || sotuvStage?.worker || 'Pardoz sexi';
      const inHistory = Array.isArray(sotuvStage?.inHistory) ? sotuvStage.inHistory : [];

      // Find how much was accepted in our app
      const historyRecord = db.partiyaQabulTarixi?.[pId];
      const recordedQty = historyRecord?.jamiQabul || 0;

      // Also check transaction counts matching party ID or partiyaNomi
      const matchingTxs = allKirimTransactions.filter(t => {
        const izoh = (t.izoh || '').toLowerCase();
        const pIdLower = pId.toLowerCase();
        const partyNomiLower = (party.partiyaNomi || '').toLowerCase();
        return (
          izoh.includes(`partiya: ${pIdLower}`) ||
          izoh.includes(`partiya:${pIdLower}`) ||
          (pIdLower && izoh.includes(pIdLower)) ||
          (partyNomiLower && izoh.includes(partyNomiLower))
        );
      });
      const txSumQty = matchingTxs.reduce((sum, t) => sum + Number(t.soni || 0), 0);

      // Total actually received in sales warehouse
      const actualReceived = Math.max(recordedQty, txSumQty);
      const diff = totalDelivered - actualReceived;

      let status: 'completed' | 'partial' | 'pending' | 'overflow';
      if (diff === 0 && totalDelivered > 0) {
        status = 'completed';
      } else if (actualReceived > 0 && diff > 0) {
        status = 'partial'; // Has previous deliveries, but continuation pending!
      } else if (actualReceived === 0) {
        status = 'pending'; // Nothing received yet
      } else {
        status = 'overflow'; // More received than recorded in RTDB
      }

      return {
        party,
        pId,
        modelName,
        totalDelivered,
        actualReceived,
        diff,
        stageDate,
        workerName,
        inHistory,
        matchingTxs,
        historyRecord,
        status
      };
    });
  }, [prodParties, db.partiyaQabulTarixi, allKirimTransactions]);

  // Global Statistics
  const stats = useMemo(() => {
    let totalProdDelivered = 0;
    let totalWarehouseReceived = 0;
    let totalMissing = 0;
    let completedCount = 0;
    let partialCount = 0;
    let pendingCount = 0;

    analyzedParties.forEach(item => {
      totalProdDelivered += item.totalDelivered;
      totalWarehouseReceived += item.actualReceived;
      if (item.diff > 0) {
        totalMissing += item.diff;
      }
      if (item.status === 'completed') completedCount++;
      else if (item.status === 'partial') partialCount++;
      else if (item.status === 'pending') pendingCount++;
    });

    return {
      totalProdDelivered,
      totalWarehouseReceived,
      totalMissing,
      completedCount,
      partialCount,
      pendingCount,
      totalParties: analyzedParties.length
    };
  }, [analyzedParties]);

  // Filtered List
  const filteredList = useMemo(() => {
    return analyzedParties.filter(item => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesModel = item.modelName.toLowerCase().includes(q);
        const matchesId = item.pId.toLowerCase().includes(q);
        const matchesWorker = item.workerName.toLowerCase().includes(q);
        if (!matchesModel && !matchesId && !matchesWorker) return false;
      }

      // Status filter
      if (statusFilter === 'diff') {
        return item.diff > 0;
      } else if (statusFilter === 'partial') {
        return item.status === 'partial';
      } else if (statusFilter === 'pending') {
        return item.status === 'pending';
      } else if (statusFilter === 'completed') {
        return item.status === 'completed';
      }
      return true;
    }).sort((a, b) => {
      // Prioritize ones with diff > 0, then newest date
      if (a.diff > 0 && b.diff <= 0) return -1;
      if (b.diff > 0 && a.diff <= 0) return 1;
      return (b.stageDate || '').localeCompare(a.stageDate || '');
    });
  }, [analyzedParties, search, statusFilter]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Partiya ID',
      'Model',
      'Sana',
      'Usta/Sex Mas\'ul',
      'Sex Jo\'natgan (juft)',
      'Ombor Qabul Qilgan (juft)',
      'Tafovut (Qoldiq)',
      'Holat'
    ];

    const rows = filteredList.map(item => [
      item.pId,
      `"${item.modelName.replace(/"/g, '""')}"`,
      item.stageDate,
      `"${item.workerName.replace(/"/g, '""')}"`,
      item.totalDelivered,
      item.actualReceived,
      item.diff,
      item.status === 'completed' 
        ? 'To\'liq qabul qilingan' 
        : item.status === 'partial' 
          ? 'Davomi kutilmoqda' 
          : 'Hali olinmagan'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Sex_Sverka_Taqqoslama_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Sverka hisoboti CSV formatida yuklab olindi!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[var(--border)] flex items-center justify-between gap-4 bg-[var(--bg)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 font-black shadow-xs">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                  Sex va Sotuv Ombori Taqqoslama Dalolatnomasi (Sverka)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 flex items-center gap-1">
                  <Radio size={10} className="animate-pulse" /> Realtime RTDB
                </span>
              </div>
              <p className="text-xs text-[var(--text3)] font-medium mt-0.5">
                Ishlab chiqarishdan yuborilgan partiyalar va omborga amalda kirim qilingan tovarlarni o'zaro solishtirish
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--border)] transition-colors flex items-center gap-1.5 shadow-xs"
              title="CSV (Excel) eksport"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Eksport</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Global Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 bg-[var(--bg3)] border-b border-[var(--border)]">
          <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-xs">
            <div className="text-[11px] font-bold text-[var(--text3)]">Sex Jami Jo'natgan</div>
            <div className="text-lg sm:text-xl font-black text-blue-500 mt-1">
              {stats.totalProdDelivered.toLocaleString()} <span className="text-xs font-medium text-[var(--text3)]">juft</span>
            </div>
            <div className="text-[10px] font-semibold text-[var(--text3)] mt-0.5">
              {stats.totalParties} ta partiya
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-xs">
            <div className="text-[11px] font-bold text-[var(--text3)]">Ombor Qabul Qilgan</div>
            <div className="text-lg sm:text-xl font-black text-emerald-500 mt-1">
              {stats.totalWarehouseReceived.toLocaleString()} <span className="text-xs font-medium text-[var(--text3)]">juft</span>
            </div>
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.completedCount} ta to'liq yopilgan
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-xs">
            <div className="text-[11px] font-bold text-[var(--text3)]">Yetishmayotgan (Tafovut)</div>
            <div className="text-lg sm:text-xl font-black text-rose-500 mt-1">
              {stats.totalMissing.toLocaleString()} <span className="text-xs font-medium text-[var(--text3)]">juft</span>
            </div>
            <div className="text-[10px] font-semibold text-rose-500/80 mt-0.5">
              Sexdan omborga kirmagan
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-xs">
            <div className="text-[11px] font-bold text-[var(--text3)]">Davomi Kutilayotgan</div>
            <div className="text-lg sm:text-xl font-black text-amber-500 mt-1">
              {stats.partialCount} <span className="text-xs font-medium text-[var(--text3)]">partiya</span>
            </div>
            <div className="text-[10px] font-semibold text-amber-500/80 mt-0.5">
              Bo'lib-bo'lib kelayotgan
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-[var(--bg)]">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Model nomi, partiya ID yoki usta ismi bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs font-bold text-[var(--text)] placeholder:text-[var(--text3)] focus:border-blue-500 outline-hidden transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setStatusFilter('diff')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'diff'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <AlertTriangle size={13} />
              <span>Tafovut borlar ({stats.partialCount + stats.pendingCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('partial')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'partial'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <Sparkles size={13} />
              <span>Davomi bor ({stats.partialCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>To'liq yopilgan ({stats.completedCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              Barchasi ({analyzedParties.length})
            </button>
          </div>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {filteredList.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] flex flex-col items-center justify-center gap-2">
              <CheckCircle2 size={36} className="text-emerald-500/70" />
              <p className="text-sm font-bold text-[var(--text)]">Hech qanday tafovut yoki partiya topilmadi!</p>
              <p className="text-xs text-[var(--text3)] max-w-sm">
                Filtr mezonlariga mos keladigan partiyalar mavjud emas yoki ishlab chiqarish bilan barcha hisob-kitoblar to'liq tenglashgan.
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isExpanded = expandedPartyId === item.pId;
              const hasContinuation = item.status === 'partial';
              const isMissingAll = item.status === 'pending';

              return (
                <div
                  key={item.pId}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    item.diff > 0
                      ? hasContinuation
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : 'bg-rose-500/5 border-rose-500/30'
                      : 'bg-[var(--bg)] border-[var(--border)]'
                  }`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Party info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--border)] text-[11px] font-black text-[var(--text)]">
                          {item.pId}
                        </span>
                        <h4 className="font-black text-sm text-[var(--text)] truncate">
                          {item.modelName}
                        </h4>

                        {/* Status Badges */}
                        {item.status === 'completed' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-black flex items-center gap-1">
                            <CheckCircle2 size={11} /> To'liq qabul qilingan
                          </span>
                        )}
                        {hasContinuation && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black flex items-center gap-1 animate-pulse">
                            <Sparkles size={11} /> Partiya davomi (+{item.diff} juft kutilmoqda)
                          </span>
                        )}
                        {isMissingAll && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black flex items-center gap-1">
                            <AlertTriangle size={11} /> Qabul qilinmagan ({item.diff} juft)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[var(--text3)] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> {item.stageDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <User size={12} /> {item.workerName}
                        </span>
                        {item.inHistory.length > 1 && (
                          <span className="text-blue-500 font-bold">
                            {item.inHistory.length} ta jo'natma reysi
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Quantitative comparison */}
                    <div className="flex items-center gap-4 sm:gap-6 bg-[var(--bg2)] px-4 py-2.5 rounded-xl border border-[var(--border)] shrink-0">
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-[var(--text3)]">Sexda</div>
                        <div className="text-sm font-black text-blue-500">
                          {item.totalDelivered} <span className="text-[10px] font-normal">juft</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-[var(--text3)]">Omborda</div>
                        <div className="text-sm font-black text-emerald-500">
                          {item.actualReceived} <span className="text-[10px] font-normal">juft</span>
                        </div>
                      </div>
                      <div className="text-center pl-2 border-l border-[var(--border)]">
                        <div className="text-[10px] font-bold text-[var(--text3)]">Tafovut</div>
                        <div className={`text-sm font-black ${
                          item.diff > 0 
                            ? 'text-rose-500' 
                            : item.diff < 0 
                              ? 'text-blue-500' 
                              : 'text-emerald-500'
                        }`}>
                          {item.diff > 0 ? `+${item.diff}` : item.diff} <span className="text-[10px] font-normal">juft</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {item.diff > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectForKirim(item.party, item.diff, hasContinuation);
                            onClose();
                            toast.info(`«${item.modelName}» partiyasining ${item.diff} juft qoldig'i kirim oynasiga yuklandi!`);
                          }}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98 ${
                            hasContinuation
                              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                          }`}
                        >
                          <ArrowRight size={13} />
                          <span>{hasContinuation ? `Davomini qabul qilish (+${item.diff})` : 'Kirim qilish'}</span>
                        </button>
                      )}

                      {/* Expand inHistory details */}
                      {item.inHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedPartyId(isExpanded ? null : item.pId)}
                          className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                          title="Jo'natmalar tarixini ko'rish"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded inHistory breakdown */}
                  {isExpanded && item.inHistory.length > 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] bg-[var(--bg2)]/50 animate-in fade-in duration-150">
                      <div className="text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
                        <Clock size={13} className="text-blue-500" />
                        Ishlab chiqarishdan yuborilgan jo'natmalar tarixi (Reyslar):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {item.inHistory.map((h: any, hIdx: number) => (
                          <div 
                            key={hIdx}
                            className="p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-[var(--text)]">{hIdx + 1}-jo'natma:</span>
                              <span className="text-[var(--text3)] ml-1.5">{h.date || '-'}</span>
                            </div>
                            <span className="font-black text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-lg">
                              {h.qty} juft
                            </span>
                          </div>
                        ))}
                      </div>

                      {item.matchingTxs.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[var(--border)]/60 text-xs text-[var(--text3)]">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            ✓ Ombordagi kirimlar ({item.matchingTxs.length} ta yozuv):
                          </span>{' '}
                          {item.matchingTxs.map(t => `${t.sana}: ${t.soni} ta (${t.olcham}°)`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between text-xs text-[var(--text3)]">
          <div className="font-semibold">
            Jami ko'rsatilmoqda: <b className="text-[var(--text)]">{filteredList.length}</b> ta partiya
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--border)] text-[var(--text)] hover:bg-[var(--border)]/80 font-bold transition-colors cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
};
