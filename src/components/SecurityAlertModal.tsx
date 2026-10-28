import React, { useState } from 'react';
import { DbState, User, AuditLog } from '../types';
import { 
  ShieldAlert, AlertTriangle, AlertCircle, Clock, User as UserIcon, 
  ArrowRight, X, CheckCircle2, ChevronRight, RefreshCw, FileText, 
  ExternalLink, Search, Sparkles, Filter, Info, ShieldCheck, Database
} from 'lucide-react';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import { formatUzs } from '../lib/utils';
import { getUnpricedSalesStats } from '../lib/balanceUtils';

interface SecurityAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DbState;
  currentUser: User | null;
  onDismissAlert?: () => void;
  isDismissed?: boolean;
  onRestoreAlert?: () => void;
}

export const SecurityAlertModal: React.FC<SecurityAlertModalProps> = ({
  isOpen,
  onClose,
  db,
  currentUser,
  onDismissAlert,
  isDismissed,
  onRestoreAlert
}) => {
  const [activeFilter, setActiveFilter] = useState<'24h' | 'all' | 'high' | 'warning'>('24h');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const allLogs: AuditLog[] = db.auditLogs || [];
  const now = Date.now();
  const cutoff24h = now - 24 * 60 * 60 * 1000;

  const isRecent24h = (dateStr?: string) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= cutoff24h;
  };

  const logs24h = allLogs.filter(l => isRecent24h(l.date));
  const highLogs24h = logs24h.filter(l => l.severity === 'high');
  const highLogs = allLogs.filter(l => l.severity === 'high');
  const warningLogs = allLogs.filter(l => l.severity === 'warning');

  // Check unpriced sales
  const unpricedStats = getUnpricedSalesStats(db);

  // Check negative stock
  const negativeStocks: { ombor: string; model: string; olcham: string; qty: number }[] = [];
  const checkOmbor = (omborName: 'tepa' | 'kotta', title: string) => {
    const st = db[omborName] || {};
    Object.entries(st).forEach(([model, sizes]) => {
      if (sizes && typeof sizes === 'object') {
        Object.entries(sizes).forEach(([sz, qty]) => {
          if (typeof qty === 'number' && qty < 0) {
            negativeStocks.push({ ombor: title, model, olcham: sz, qty });
          }
        });
      }
    });
  };
  checkOmbor('tepa', 'Tepa ombor');
  checkOmbor('kotta', 'Kotta ombor');

  // Filter logs
  const filteredLogs = allLogs.filter(log => {
    if (activeFilter === '24h' && !isRecent24h(log.date)) return false;
    if (activeFilter === 'high' && log.severity !== 'high') return false;
    if (activeFilter === 'warning' && log.severity !== 'warning') return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const mUser = (log.user || '').toLowerCase().includes(q);
      const mAction = (log.action || '').toLowerCase().includes(q);
      const mDetails = (log.details || '').toLowerCase().includes(q);
      const mEntity = (log.entity || '').toLowerCase().includes(q);
      if (!mUser && !mAction && !mDetails && !mEntity) return false;
    }
    return true;
  });

  const navigateTo = (tab: string) => {
    onClose();
    window.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
  };

  const getActionExplanation = (action: string, entity: string, details: string) => {
    const act = (action || '').toLowerCase();
    const det = (details || '').toLowerCase();

    if (act.includes('clear_kirim_history')) {
      return {
        title: "Kirim tarixi butunlay tozalandi",
        risk: "Kritik",
        cause: "Omborga kirim qilingan tovarlar tarixi o'chirib yuborilgan. Bu kirimlar asosidagi hisobot va tannarx zanjirini uzishi mumkin.",
        recommendation: "Kirim bo'limida zaxira nusxani tekshiring yoki Audit jurnalida kim tozalaganini tahlil qiling."
      };
    }
    if (act.includes('clear_chiqim_history')) {
      return {
        title: "Sotuvlar (Chiqim) tarixi butunlay tozalandi",
        risk: "Kritik",
        cause: "Barcha savdolar va mijozlarga sotilgan tovarlar tarixi tozalangan. Kassa va sof foyda hisobotlariga ta'sir qiladi.",
        recommendation: "Tarix va Kassa bo'limida tushumlar mosligini tekshiring."
      };
    }
    if (act.includes('delete_kirim_group') || act.includes('delete_kirim')) {
      return {
        title: "Kirim partiyasi bekor qilindi yoki o'chirildi",
        risk: "Yuqori",
        cause: "Avval qabul qilingan tovar partiyasi bekor qilingan va ombor qoldig'i mos ravishda qayta hisoblangan.",
        recommendation: "Ombor qoldig'i haqiqiy mavjud tovarlarga to'g'ri kelishini inventarizatsiya qilib ko'ring."
      };
    }
    if (act.includes('delete_chiqim_group') || act.includes('delete_chiqim')) {
      return {
        title: "Sotuv (Chiqim) bekor qilindi yoki o'chirildi",
        risk: "Yuqori",
        cause: "Sotilgan tovar mijoz yuk xatidan bekor qilingan, tovarlar omborga qaytarilgan bo'lishi mumkin.",
        recommendation: "Mijozning qarz balansi va ombor qoldig'i to'g'rilanganligiga ishonch hosil qiling."
      };
    }
    if (act.includes('clear_module_data')) {
      return {
        title: "Tizim sozlamalari orqali ma'lumotlar o'chirildi",
        risk: "Kritik",
        cause: "Sozlamalar bo'limidan ma'lum bir modul ma'lumotlari tozalangan.",
        recommendation: "Ma'lumotlar bazasi zaxirasidan tiklash kerak bo'lsa, zaxira faylini tekshiring."
      };
    }
    if (act.includes('narx')) {
      return {
        title: "Mahsulot narxlari o'zgartirildi",
        risk: "Ogohlantirish",
        cause: "Katalogdagi model tannarxi yoki sotuv narxi tahrirlangan.",
        recommendation: "Yangi narxlar joriy bozor va kelishuvlarga muvofiqligini nazorat qiling."
      };
    }
    return {
      title: action || 'Muhim amaliyot',
      risk: 'Eslatma',
      cause: details || 'Tizimda muhim o\'zgarish amalga oshirildi.',
      recommendation: "Ushbu operatsiyani amalga oshirgan xodim bilan ma'lumotlarni muvofiqlashtiring."
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-[var(--border)] bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/20">
              <ShieldAlert size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-[var(--text)] tracking-tight">
                  Xavfsizlik va Audit Diagnostikasi
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-black">
                  {highLogs.length} ta xavfli holat
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
                Tizimda o'chirilgan, bekor qilingan yoki moliyaviy muvozanatga ta'sir qiluvchi harakatlar tahlili
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
            title="Yopish"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* Quick Metrics Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Kritik amallar</p>
                <h4 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{highLogs.length} ta</h4>
                <p className="text-[10px] text-rose-500/80 mt-0.5">O'chirish yoki tozalashlar</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Tannarxsiz kirimlar</p>
                <h4 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{unpricedStats.unpricedKirimCount} ta</h4>
                <p className="text-[10px] text-amber-500/80 mt-0.5">Narx belgilanmagan partiyalar</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Manfiy qoldiqlar</p>
                <h4 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{negativeStocks.length} ta</h4>
                <p className="text-[10px] text-blue-500/80 mt-0.5">0 dan past tushgan tovarlar</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center">
                <Database size={20} />
              </div>
            </div>
          </div>

          {/* Negative stocks or Unpriced Kirim Alert inside modal if any */}
          {(unpricedStats.unpricedKirimCount > 0 || negativeStocks.length > 0) && (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-2">
                <Sparkles size={14} className="text-amber-500" />
                <span>Qo'shimcha tekshiruv natijalari</span>
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {unpricedStats.unpricedKirimCount > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-amber-700 dark:text-amber-300">Tannarxi kiritilmagan kirimlar mavjud</p>
                      <p className="text-[11px] text-amber-600/90 dark:text-amber-400/90 mt-0.5">
                        {unpricedStats.unpricedKirimCount} ta partiyada tannarx belgilanmagan. Bu sof foyda hisobini noto'g'ri ko'rsatishi mumkin.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateTo('kirim')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white font-black text-[11px] shrink-0 hover:bg-amber-600 transition-all cursor-pointer shadow-xs"
                    >
                      To'g'rilash
                    </button>
                  </div>
                )}

                {negativeStocks.length > 0 && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-rose-700 dark:text-rose-300">Omborda manfiy qoldiq aniqlandi</p>
                      <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 mt-0.5">
                        {negativeStocks.length} ta o'lchamda qoldiq noldan past (minusda). Kirim qilinmasdan sotilgan bo'lishi mumkin.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateTo('ombor')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white font-black text-[11px] shrink-0 hover:bg-rose-600 transition-all cursor-pointer shadow-xs"
                    >
                      Omborga o'tish
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Log Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: '24h', label: `So'nggi 24 soat (${logs24h.length})` },
                { id: 'high', label: `Kritik (${highLogs.length})` },
                { id: 'warning', label: `Ogohlantirish (${warningLogs.length})` },
                { id: 'all', label: `Barchasi (${allLogs.length})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeFilter === f.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                placeholder="Xodim yoki amalni qidirish..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Detailed Audit Cards List */}
          <div className="space-y-3">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-10 bg-[var(--bg2)] rounded-2xl border border-[var(--border)]">
                <ShieldCheck size={36} className="mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="text-sm font-bold text-[var(--text)]">Mos keluvchi xavfli amaliyotlar topilmadi</p>
                <p className="text-xs text-[var(--text3)] mt-1">Tizim holati barqaror yoki filtrlarga mos amallar yo'q.</p>
              </div>
            ) : (
              filteredLogs.slice(0, 30).map((log, lIdx) => {
                const expl = getActionExplanation(log.action, log.entity, log.details);
                const isHigh = log.severity === 'high';
                const isRecent = isRecent24h(log.date);
                const formattedDate = log.date ? format(new Date(log.date), "dd.MM.yyyy HH:mm", { locale: uz }) : 'Noma\'lum';

                return (
                  <div 
                    key={`${log.id || 'sec'}_${lIdx}`} 
                    className={`p-4 rounded-2xl border transition-all ${
                      isHigh 
                        ? 'bg-rose-500/5 border-rose-500/25 hover:border-rose-500/40 shadow-xs' 
                        : 'bg-[var(--bg2)] border-[var(--border)] hover:border-blue-500/30'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isHigh ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-500'
                        }`}>
                          {isHigh ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm text-[var(--text)]">
                              {expl.title}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isHigh ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            }`}>
                              {expl.risk}
                            </span>
                            {isRecent && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                So'nggi 24 soat
                              </span>
                            )}
                          </div>

                          <p className="text-xs font-semibold text-[var(--text2)] mt-1">
                            {log.details}
                          </p>

                          {/* Cause & Recommendation */}
                          <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[var(--text3)]">
                            <div>
                              <span className="font-bold text-[var(--text)]">Sabab/Oqibat: </span>
                              {expl.cause}
                            </div>
                            <div>
                              <span className="font-bold text-[var(--text)]">Tavsiya: </span>
                              {expl.recommendation}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Meta stats */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 text-xs border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border)] gap-1 text-[var(--text3)]">
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--text)] bg-[var(--bg)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
                          <UserIcon size={12} className="text-blue-500" />
                          {log.user || 'Noma\'lum'}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-[11px]">
                          <Clock size={11} />
                          {formattedDate}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg2)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--text3)] text-center sm:text-left">
            Tizim audit jurnali xavfsizlik maqsadida har bir o'zgarishni avtomatik qayd etadi.
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
            {isDismissed && onRestoreAlert ? (
              <button
                type="button"
                onClick={() => {
                  onRestoreAlert();
                  onClose();
                }}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/25 active:scale-98"
                title="Ogohlantirishni Bosh sahifaga qaytarish"
              >
                <RefreshCw size={14} />
                <span>Bosh sahifaga qaytarish</span>
              </button>
            ) : onDismissAlert ? (
              <button
                type="button"
                onClick={() => {
                  onDismissAlert();
                  onClose();
                }}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/25 active:scale-98"
                title="Bosh sahifadagi ogohlantirishni yashirish"
              >
                <CheckCircle2 size={15} />
                <span>Ko'rib chiqildi / Yashirish</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigateTo('audit')}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/25"
            >
              <FileText size={14} />
              <span>To'liq Audit Jurnali</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] border border-[var(--border)] text-xs font-bold text-[var(--text)] transition-all cursor-pointer"
            >
              Yopish
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
