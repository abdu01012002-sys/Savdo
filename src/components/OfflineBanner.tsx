import React, { useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, CloudOff } from 'lucide-react';
import { toast } from 'sonner';

interface OfflineBannerProps {
  isOffline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline }) => {
  const [isChecking, setIsChecking] = useState(false);

  if (!isOffline) return null;

  const handleCheckConnection = async () => {
    setIsChecking(true);
    try {
      // Test connectivity by making a lightweight head fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/favicon.ico', { 
        method: 'HEAD', 
        cache: 'no-store',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);

      if (response.ok || response.status >= 200) {
        toast.success("Internet aloqasi tiklandi! Sahifa yangilanmoqda...");
        window.location.reload();
      } else {
        toast.warning("Hali ham oflayn holatdasiz. Tarmoq ulanishini tekshiring.");
      }
    } catch {
      toast.error("Tarmoqqa ulanib bo'lmadi. Internet mavjud emas.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div 
      role="status"
      aria-live="polite"
      className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 bg-[length:200%_auto] animate-gradient text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm font-medium z-[100] border-b border-rose-700/60 sticky top-0 left-0 right-0 w-full"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="relative flex items-center justify-center shrink-0">
          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-white opacity-75" />
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
          <span className="font-extrabold uppercase tracking-wider text-[11px] sm:text-xs bg-black/20 px-2 py-0.5 rounded inline-block shrink-0">
            Oflayn Rejim
          </span>
          <p className="truncate text-white/95 text-[12px] sm:text-[13px] font-semibold">
            Internet aloqasi uzildi — Firebase ma'lumotlar bazasi sinxronizatsiyasi to'xtatildi.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCheckConnection}
          disabled={isChecking}
          className="flex items-center gap-1.5 px-3 py-1 bg-white text-rose-700 hover:bg-white/90 active:scale-95 transition-all rounded-lg text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
          title="Internet ulanishini tekshirish"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isChecking ? "Tekshirilmoqda..." : "Qayta tekshirish"}</span>
          <span className="sm:hidden">{isChecking ? "..." : "Tekshirish"}</span>
        </button>
      </div>
    </div>
  );
};
