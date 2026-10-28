import React, { useState } from 'react';
import { 
  APP_VERSION_CONFIG, 
  VERSION_HISTORY, 
  VersionInfo, 
  checkForAppUpdates,
  markCurrentVersionAsSeen
} from '../version';
import { 
  Sparkles, 
  X, 
  CheckCircle2, 
  History, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  Wrench, 
  PlusCircle, 
  Layers, 
  Calendar,
  ChevronRight,
  Info,
  Check,
  Flame,
  ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'current' | 'history';
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ 
  isOpen, 
  onClose,
  initialTab = 'current'
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>(initialTab);
  const [selectedVersion, setSelectedVersion] = useState<VersionInfo>(APP_VERSION_CONFIG);
  const [isChecking, setIsChecking] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  if (!isOpen) return null;

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    try {
      const result = await checkForAppUpdates();
      if (result.hasUpdate) {
        toast.success("Yangi versiya mavjud! Ilovani yangilang.", { duration: 5000 });
      } else {
        toast.success("✅ " + result.message, { duration: 4000 });
      }
    } catch {
      toast.info("Siz eng so'nggi versiyadasiz: v" + APP_VERSION_CONFIG.version);
    } finally {
      setIsChecking(false);
    }
  };

  const handleClose = () => {
    markCurrentVersionAsSeen();
    onClose();
  };

  const filteredChangelog = selectedVersion.changelog.filter(item => {
    if (filterType === 'all') return true;
    return item.type === filterType;
  });

  const isSelectedCurrent = selectedVersion.version === APP_VERSION_CONFIG.version;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 text-[var(--text)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with App Brand & Current Version Badge */}
        <div className="p-5 sm:p-6 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black tracking-tight leading-none">
                  OmborPro Tizim Versiyasi
                </h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-black tracking-wide border border-emerald-500/25">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  v{APP_VERSION_CONFIG.version} (Joriy)
                </span>
              </div>
              <p className="text-xs text-[var(--text3)] font-semibold mt-1">
                Yangi funksiyalar, optimizatsiya va yangilanishlar jurnali
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2.5 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)] active:scale-95 transition-all cursor-pointer shadow-xs"
            title="Yopish"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab & Version Switcher Header Bar */}
        <div className="px-5 sm:px-6 py-3 border-b border-[var(--border)] bg-[var(--bg)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Main Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shrink-0">
            <button
              onClick={() => {
                setActiveTab('current');
                setSelectedVersion(APP_VERSION_CONFIG);
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === 'current'
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <Zap size={14} />
              <span>Joriy Versiya (v{APP_VERSION_CONFIG.version})</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === 'history'
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <History size={14} />
              <span>Versiyalar Tarixi ({VERSION_HISTORY.length})</span>
            </button>
          </div>

          {/* Quick Check for Update Button */}
          <button
            onClick={handleCheckUpdate}
            disabled={isChecking}
            className="flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--bg2)] hover:bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] transition-all cursor-pointer shrink-0 disabled:opacity-60 active:scale-95"
          >
            <RefreshCw size={13} className={isChecking ? "animate-spin text-blue-500" : "text-emerald-500"} />
            <span>{isChecking ? "Tekshirilmoqda..." : "Yangilanishni tekshirish"}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Active Version Overview Card */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xl font-black text-[var(--text)]">
                    {selectedVersion.title}
                  </span>
                  {isSelectedCurrent ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ✓ Joriy O'rnatilgan Versiya
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                      Tarixiy Versiya
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text2)] leading-relaxed max-w-2xl">
                  {selectedVersion.description}
                </p>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 border-[var(--border)] pt-3 sm:pt-0">
                <div className="flex items-center gap-1.5 text-xs text-[var(--text3)] font-semibold">
                  <Calendar size={13} />
                  <span>{selectedVersion.releaseDate}</span>
                  {selectedVersion.releaseTime && (
                    <span className="text-[10px] text-[var(--text3)] font-mono">({selectedVersion.releaseTime})</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-[var(--text3)] mt-0.5">
                  Build #{selectedVersion.versionCode}
                </span>
              </div>
            </div>
          </div>

          {/* If History Tab Active -> Interactive Version Selector Pills */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-[var(--text3)] tracking-wider">
                Versiyani tanlang:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {VERSION_HISTORY.map((ver) => {
                  const isCurrent = ver.version === APP_VERSION_CONFIG.version;
                  const isSelected = selectedVersion.version === ver.version;
                  return (
                    <button
                      key={ver.version}
                      onClick={() => setSelectedVersion(ver)}
                      className={cn(
                        "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 relative overflow-hidden group",
                        isSelected
                          ? "bg-blue-600/15 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm"
                          : "bg-[var(--bg)] hover:bg-[var(--bg3)] border-[var(--border)] text-[var(--text2)]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black tracking-tight">
                          v{ver.version}
                        </span>
                        {isCurrent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Joriy faol versiya" />
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--text3)] font-medium truncate">
                        {ver.releaseDate}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Pills for Changelog Items */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[var(--text3)] mr-1">Toifa:</span>
              {[
                { id: 'all', label: `Barchasi (${selectedVersion.changelog.length})` },
                { id: 'perf', label: '⚡ Tezlik' },
                { id: 'new', label: '✨ Yangi' },
                { id: 'improved', label: '🚀 Yaxshilanish' },
                { id: 'fixed', label: '🔧 Tuzatish' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    filterType === f.id
                      ? "bg-[var(--text)] text-[var(--bg)] shadow-xs"
                      : "bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-mono text-[var(--text3)]">
              {filteredChangelog.length} ta o'zgarish
            </span>
          </div>

          {/* Changelog Items List */}
          <div className="space-y-3">
            {filteredChangelog.map((item, idx) => {
              const badgeStyle = 
                item.type === 'perf' 
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : item.type === 'new'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : item.type === 'improved'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                  : item.type === 'fixed'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';

              const badgeIcon = 
                item.type === 'perf' ? <Zap size={14} /> :
                item.type === 'new' ? <PlusCircle size={14} /> :
                item.type === 'improved' ? <Flame size={14} /> :
                item.type === 'fixed' ? <Wrench size={14} /> : <ShieldCheck size={14} />;

              return (
                <div 
                  key={idx}
                  className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] hover:border-blue-500/30 transition-all flex gap-3.5 group shadow-2xs"
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5", badgeStyle)}>
                    {badgeIcon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-sm font-black text-[var(--text)] tracking-tight">
                        {item.title}
                      </h4>
                      {item.tag && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)]">
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text2)] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[var(--text3)]">
            <ShieldCheck size={15} className="text-emerald-500 shrink-0" />
            <span>OmborPro Enterprise Cloud Platform & Offline-Sync</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all cursor-pointer text-center"
            >
              Tushundim, davom etish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;
