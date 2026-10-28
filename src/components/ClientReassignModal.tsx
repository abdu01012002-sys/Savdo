import React, { useState, useMemo, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { 
  X, Check, Users, RefreshCw, Sparkles, Filter, Search, 
  ArrowRight, ShieldCheck, CheckSquare, Square, AlertCircle, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCompact, formatUzs } from '../lib/utils';
import { recalculateAllClientBalances, reassignTransactionsToClient, findClientRestorationSuggestions } from '../lib/balanceUtils';
import { Transaction } from '../types';
import { ClientSearchSelect } from './ClientSearchSelect';

interface ClientReassignModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClientReassignModal: React.FC<ClientReassignModalProps> = ({ isOpen, onClose }) => {
  const { db, setDb, currentUser } = useDb();
  
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedOmbor, setSelectedOmbor] = useState<'all' | 'tepa' | 'kotta'>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
  const [bulkTargetClient, setBulkTargetClient] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const kontragentlar = db.kontragentlar || [];
  const clientNames = useMemo(() => {
    return Array.from(new Set(kontragentlar.map(k => k.ism.trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'uz', { sensitivity: 'base' }));
  }, [kontragentlar]);

  // Group all chiqim transactions
  const groupedChiqim = useMemo(() => {
    const groups: Record<string, {
      key: string;
      sana: string;
      vaqt: string;
      ombor: 'tepa' | 'kotta';
      currentClient: string;
      xodim: string;
      totalQty: number;
      totalSum: number;
      txIds: string[];
      models: string[];
    }> = {};

    ['tepa', 'kotta'].forEach(omborKey => {
      if (selectedOmbor !== 'all' && selectedOmbor !== omborKey) return;
      const ombor = omborKey as 'tepa' | 'kotta';
      const txs = (db[ombor]?.transactions || []).filter(t => t.amal === 'chiqim');

      txs.forEach(t => {
        const client = (t.kimdan || t.izoh || "Noma'lum").trim();
        const key = `${ombor}_${t.sana}_${client}_${t.vaqt?.slice(0, 16) || ''}_${t.groupId || ''}`;

        if (!groups[key]) {
          groups[key] = {
            key,
            sana: t.sana,
            vaqt: t.vaqt || '',
            ombor,
            currentClient: client,
            xodim: t.xodim || "Admin",
            totalQty: 0,
            totalSum: 0,
            txIds: [],
            models: []
          };
        }

        groups[key].totalQty += Number(t.soni || 0);
        groups[key].totalSum += Number(t.summa || 0);
        groups[key].txIds.push(t.id);
        if (t.model && !groups[key].models.includes(t.model)) {
          groups[key].models.push(t.model);
        }
      });
    });

    return Object.values(groups).sort((a, b) => (b.sana + b.vaqt).localeCompare(a.sana + a.vaqt));
  }, [db, selectedOmbor]);

  const filteredGroups = useMemo(() => {
    return groupedChiqim.filter(g => {
      if (selectedDate && g.sana !== selectedDate) return false;
      if (filterClient !== 'all' && g.currentClient.toLowerCase() !== filterClient.toLowerCase()) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          g.currentClient.toLowerCase().includes(s) ||
          g.sana.includes(s) ||
          g.models.some(m => m.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [groupedChiqim, selectedDate, filterClient, search]);

  const suggestions = useMemo(() => {
    return findClientRestorationSuggestions(db);
  }, [db]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRecalculateAll = () => {
    setIsProcessing(true);
    try {
      const updated = recalculateAllClientBalances(db);
      setDb(updated);
      toast.success("Barcha mijozlar xaridlari hajmi va qarzdorlik balanslari 100% qayta hisoblab to'g'rilandi!");
    } catch (err: any) {
      toast.error("Xatolik: " + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignSingleGroup = (group: typeof groupedChiqim[0], targetClient: string) => {
    if (!targetClient.trim()) return;
    try {
      const updated = reassignTransactionsToClient(
        db,
        group.txIds,
        targetClient.trim(),
        currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' }
      );
      setDb(updated);
      toast.success(`Ushbu chiqim "${targetClient}" mijoziga biriktirildi!`);
    } catch (err: any) {
      toast.error("Xatolik: " + (err?.message || err));
    }
  };

  const handleBulkAssign = () => {
    if (!bulkTargetClient.trim()) {
      toast.error("Iltimos, tanlangan chiqimlar biriktiriladigan mijozni tanlang!");
      return;
    }
    if (selectedGroupKeys.size === 0) {
      toast.error("Iltimos, kamida bitta chiqim guruhini belgilang!");
      return;
    }

    const allTxIds: string[] = [];
    groupedChiqim.forEach(g => {
      if (selectedGroupKeys.has(g.key)) {
        allTxIds.push(...g.txIds);
      }
    });

    try {
      const updated = reassignTransactionsToClient(
        db,
        allTxIds,
        bulkTargetClient.trim(),
        currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' }
      );
      setDb(updated);
      toast.success(`${selectedGroupKeys.size} ta chiqim guruhi "${bulkTargetClient}" mijoziga o'tkazildi va balanslar yangilandi!`);
      setSelectedGroupKeys(new Set());
      setBulkTargetClient('');
    } catch (err: any) {
      toast.error("Xatolik: " + (err?.message || err));
    }
  };

  const toggleSelectGroup = (key: string) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedGroupKeys.size === filteredGroups.length) {
      setSelectedGroupKeys(new Set());
    } else {
      setSelectedGroupKeys(new Set(filteredGroups.map(g => g.key)));
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg)] border border-[var(--border)] rounded-3xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-[var(--border)] flex items-center justify-between gap-4 bg-[var(--bg2)]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-[var(--text)] tracking-tight">
                Chiqimlarni Mijozlarga Taqsimlash va Tiklash Markazi
              </h3>
              <p className="text-xs text-[var(--text3)] font-medium">
                Sotuvlarni kerakli mijozlarga o'tkazish va barcha mijozlar balansini 1 bosishda to'liq hisoblash
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecalculateAll}
              disabled={isProcessing}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm shadow-emerald-500/20 cursor-pointer transition-all"
              title="Barcha operatsiyalar bo'yicha mijozlar hisob-kitobini boshidan oxirigacha aniq hisoblash"
            >
              <RefreshCw size={14} className={isProcessing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Balanslarni Qayta Hisoblash</span>
              <span className="sm:hidden">Qayta hisoblash</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Suggestion alert if any */}
        {suggestions.length > 0 && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200 font-medium">
              <Sparkles size={16} className="text-amber-500 shrink-0" />
              <span>
                Tizim <strong>{suggestions.length} ta</strong> operatsiyada asl mijoz nomini aniqladi.
              </span>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-4 sm:p-6 border-b border-[var(--border)] bg-[var(--bg)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Mijoz yoki model bo'yicha qidirish..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-blue-500"
              />
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none"
            />

            <select
              value={filterClient}
              onChange={e => setFilterClient(e.target.value)}
              className="px-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none"
            >
              <option value="all">Barcha Mijozlar filtri</option>
              {clientNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Bulk Action Controls */}
          <div className="flex items-center gap-2 bg-[var(--bg2)] p-1.5 rounded-2xl border border-[var(--border)] min-w-[280px]">
            <ClientSearchSelect
              value={bulkTargetClient}
              onChange={(name) => setBulkTargetClient(name)}
              placeholder="Qaysi mijozga o'tkazilsin?..."
              inputClassName="py-1.5 px-3 text-xs font-bold rounded-xl"
            />

            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={selectedGroupKeys.size === 0 || !bulkTargetClient}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-blue-600/20 shrink-0"
            >
              <Check size={13} />
              <span>O'tkazish ({selectedGroupKeys.size})</span>
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] font-bold text-[var(--text3)] uppercase tracking-wider bg-[var(--bg2)]/50">
                <th className="p-3 rounded-l-xl w-10">
                  <button type="button" onClick={toggleSelectAll} className="cursor-pointer">
                    {selectedGroupKeys.size === filteredGroups.length && filteredGroups.length > 0 ? (
                      <CheckSquare size={16} className="text-blue-500" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="p-3">Sana / Vaqt</th>
                <th className="p-3">Ombor</th>
                <th className="p-3">Hozirgi Mijoz</th>
                <th className="p-3">Modellar & Soni</th>
                <th className="p-3 text-right">Summa</th>
                <th className="p-3 text-right rounded-r-xl">Yangi Mijozga Biriktirish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[var(--text3)] italic font-medium">
                    Hech qanday chiqim topilmadi
                  </td>
                </tr>
              ) : (
                filteredGroups.map(group => {
                  const isSelected = selectedGroupKeys.has(group.key);
                  return (
                    <tr 
                      key={group.key}
                      className={`hover:bg-[var(--bg2)]/70 transition-colors ${
                        isSelected ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      <td className="p-3">
                        <button type="button" onClick={() => toggleSelectGroup(group.key)} className="cursor-pointer">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-blue-500" />
                          ) : (
                            <Square size={16} className="text-[var(--text3)]" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 font-semibold text-[var(--text)]">
                        <div>{group.sana}</div>
                        <div className="text-[10px] text-[var(--text3)]">{group.vaqt}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                          group.ombor === 'tepa' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {group.ombor}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-[var(--text)]">
                        <span className="px-2 py-1 bg-[var(--bg2)] rounded-lg border border-[var(--border)]">
                          {group.currentClient}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-rose-500">{group.totalQty} juft</div>
                        <div className="text-[10px] text-[var(--text3)] truncate max-w-[200px]">
                          {group.models.join(', ')}
                        </div>
                      </td>
                      <td className="p-3 text-right font-black text-[var(--text)]">
                        {formatCompact(group.totalSum)} UZS
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssignSingleGroup(group, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="px-2.5 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] outline-none hover:border-blue-500 transition-colors"
                          >
                            <option value="">O'tkazish...</option>
                            {clientNames.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg2)]/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text3)]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span>Har qanday o'tkazishdan so'ng mijozlar balansi avtomatik to'g'rilanadi.</span>
          </div>
          <div className="font-bold text-[var(--text)]">
            Jami: {filteredGroups.length} ta guruh ({filteredGroups.reduce((s, g) => s + g.totalQty, 0)} juft)
          </div>
        </div>

      </div>
    </div>
  );
};
