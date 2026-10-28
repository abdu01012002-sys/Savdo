import React, { useState } from 'react';
import { 
  APP_VERSION_CONFIG, 
  checkForAppUpdates 
} from '../version';
import { 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Calendar, 
  Zap,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ChangelogModal } from './ChangelogModal';

export const AppVersionCard: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

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

  return (
    <>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 shadow-sm flex flex-col gap-5 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[var(--text)]">
                  Dastur Versiyasi va Yangilanishlar
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-black border border-emerald-500/20">
                  v{APP_VERSION_CONFIG.version} Pro
                </span>
              </div>
              <p className="text-xs text-[var(--text3)] font-semibold mt-0.5">
                OmborPro CRM tizimining joriy versiyasi va holati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCheckUpdate}
              disabled={isChecking}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(isChecking && "animate-spin text-blue-500")} />
              <span>{isChecking ? "Tekshirilmoqda..." : "Yangilanishlarni tekshirish"}</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95"
            >
              <Zap size={14} />
              <span>Nimalar yangilandi?</span>
            </button>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              Versiya Holati
            </span>
            <div className="flex items-center gap-1.5 mt-2">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span className="text-xs font-extrabold text-[var(--text)]">
                Eng so'nggi barqaror versiya
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              Chiqarilgan Sana
            </span>
            <div className="flex items-center gap-1.5 mt-2">
              <Calendar size={16} className="text-blue-500 shrink-0" />
              <span className="text-xs font-extrabold text-[var(--text)]">
                {APP_VERSION_CONFIG.releaseDate} ({APP_VERSION_CONFIG.releaseTime || '10:00'})
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between">
            <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">
              Build Kodi
            </span>
            <div className="flex items-center gap-1.5 mt-2">
              <ShieldCheck size={16} className="text-purple-500 shrink-0" />
              <span className="text-xs font-extrabold text-[var(--text)]">
                Build #{APP_VERSION_CONFIG.versionCode} · Sparkles Engine
              </span>
            </div>
          </div>
        </div>

        {/* Quick Highlights Summary */}
        <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Zap size={14} />
              v{APP_VERSION_CONFIG.version} dagi asosiy o'zgarishlar:
            </span>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Barchasini ko'rish</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {APP_VERSION_CONFIG.changelog.slice(0, 3).map((item, idx) => (
              <span 
                key={idx}
                className="px-2.5 py-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[11px] font-bold text-[var(--text2)] flex items-center gap-1.5 shadow-2xs"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {item.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ChangelogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
