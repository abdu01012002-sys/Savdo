import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Users, 
  Boxes, 
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadSampleExcelTemplate, parseExcelDataToDb, ExcelImportResult } from '../lib/excelImportUtils';
import { createAuditLog } from '../lib/auditUtils';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose }) => {
  const { db, setDb, currentUser } = useDb();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [parsedPreview, setParsedPreview] = useState<{
    updatedDb: any;
    result: ExcelImportResult;
    fileName: string;
  } | null>(null);

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const { updatedDb, result } = await parseExcelDataToDb(file, db, importMode);
      setParsedPreview({
        updatedDb,
        result,
        fileName: file.name
      });
      toast.success("Excel fayli tahlil qilindi. Tasdiqlashdan oldin natijani ko'ring.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Excel faylini o'qib bo'lmadi!");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!parsedPreview) return;

    try {
      const finalDb = parsedPreview.updatedDb;
      if (!finalDb.auditLogs) finalDb.auditLogs = [];
      finalDb.auditLogs.unshift(
        createAuditLog(
          currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
          'Excel Ommaviy Import',
          'Baza',
          `Excel faylidan (${parsedPreview.fileName}) ${parsedPreview.result.importedCounts.models} ta model, ${parsedPreview.result.importedCounts.totalStockPairs} juft tovar va ${parsedPreview.result.importedCounts.kontragents} ta kontragent bazaga kiritildi. Rejim: ${importMode === 'replace' ? "Barchasini almashtirish" : "Qo'shish (Birlashtirish)"}`,
          'high'
        )
      );

      setDb(finalDb);
      toast.success("🎉 Barcha ma'lumotlar muvaffaqiyatli bazaga yuklandi va sinxronlandi!");
      setParsedPreview(null);
      onClose();
    } catch (err: any) {
      toast.error("Bazada saqlashda xatolik: " + err.message);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[120] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Excel Orqali Ommaviy Import</h2>
              <p className="text-xs text-[var(--text3)]">Eski daftarlar va dasturlardagi ma'lumotlarni bir zumda yuklash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-[var(--text)]">
          {!parsedPreview ? (
            <>
              {/* Step 1: Download Template */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-500 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">1-Qadam: Namuna Excel Shablonini Oling</h4>
                    <p className="text-xs text-[var(--text3)] mt-0.5">
                      To'g'ri ustunlar bilan to'ldirish uchun tayyor Excel shablonini yuklab oling.
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadSampleExcelTemplate}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Shablonni Yuklab Olish
                </button>
              </div>

              {/* Step 2: Import Options */}
              <div>
                <label className="text-xs font-bold text-[var(--text3)] uppercase tracking-wider block mb-2">
                  2-Qadam: Yuklash Rejimini Tanlang
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setImportMode('merge')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'merge'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4" />
                      <span className="text-xs">Mavjud Bazaga Qo'shish (Merge)</span>
                    </div>
                    <p className="text-[11px] font-normal text-[var(--text3)]">
                      Bazada bor tovar va mijozlar o'chirilmaydi, yangi qoldiqlar ustiga qo'shiladi. (Xavfsiz)
                    </p>
                  </div>

                  <div
                    onClick={() => setImportMode('replace')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'replace'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text3)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="w-4 h-4" />
                      <span className="text-xs">Boshidan Yangilash (Replace)</span>
                    </div>
                    <p className="text-[11px] font-normal text-[var(--text3)]">
                      Eski ombor qoldiqlari va mijozlar tozalanadi, faqat Exceldagilar yoziladi.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3: Upload Box */}
              <div>
                <label className="text-xs font-bold text-[var(--text3)] uppercase tracking-wider block mb-2">
                  3-Qadam: To'ldirilgan Excel Faylni Yuklang (.xlsx, .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border)] hover:border-emerald-500/50 bg-[var(--bg)] hover:bg-emerald-500/5 transition-all rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isProcessing ? (
                      <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                    ) : (
                      <Upload className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[var(--text)] group-hover:text-emerald-500 transition-colors">
                      {isProcessing ? "Excel tahlil qilinmoqda..." : "Excel faylni tanlang yoki shu yerga tashlang"}
                    </span>
                    <p className="text-xs text-[var(--text3)] mt-1">
                      .XLSX, .XLS yoki .CSV formatidagi fayllar qabul qilinadi
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Preview Screen */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-500">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">{parsedPreview.fileName} muvaffaqiyatli o'qildi</h4>
                  <p className="text-xs text-[var(--text3)]">Quyidagi hisob-kitoblar bilan tanishib, tasdiqlang:</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center gap-2 text-indigo-400 mb-1">
                    <Boxes className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Modellar</span>
                  </div>
                  <div className="text-lg font-black text-[var(--text)]">
                    {parsedPreview.result.importedCounts.models} ta
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-400 mb-1">
                    <Layers className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Jami Juft Tovar</span>
                  </div>
                  <div className="text-lg font-black text-emerald-500">
                    {parsedPreview.result.importedCounts.totalStockPairs.toLocaleString()} juft
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center gap-2 text-cyan-400 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Mijozlar</span>
                  </div>
                  <div className="text-lg font-black text-[var(--text)]">
                    {parsedPreview.result.importedCounts.kontragents} nafar
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center gap-2 text-amber-400 mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Narxlar</span>
                  </div>
                  <div className="text-lg font-black text-[var(--text)]">
                    {parsedPreview.result.importedCounts.prices} ta
                  </div>
                </div>
              </div>

              {parsedPreview.result.details.length > 0 && (
                <div className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs space-y-1">
                  {parsedPreview.result.details.map((d, i) => (
                    <div key={i} className="text-[var(--text3)] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-end gap-3">
          {parsedPreview ? (
            <>
              <button
                onClick={() => setParsedPreview(null)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--border)] text-xs font-bold transition-all cursor-pointer"
              >
                Orqaga
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
              >
                <span>Bazaga Saqlash va Qo'llash</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--border)] text-xs font-bold transition-all cursor-pointer"
            >
              Yopish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
