import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { 
  FileSpreadsheet, 
  FileText, 
  Database, 
  Upload, 
  Download, 
  Calendar, 
  CheckSquare, 
  Square, 
  Filter, 
  Check, 
  Layers, 
  Clock, 
  ShieldCheck, 
  AlertCircle,
  Users,
  DollarSign,
  Boxes,
  ArrowRightLeft,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  exportToMultiSheetExcel, 
  exportDatabaseToJson, 
  exportToComprehensivePdf, 
  exportFullComprehensiveBackup,
  ExportOptions 
} from '../lib/exportUtils';
import { ExcelImportModal } from './ExcelImportModal';
import { cn } from '../lib/utils';

export const ExportBackupHub: React.FC = () => {
  const { 
    db, 
    setDb, 
    backupsList, 
    refreshBackupsList, 
    createBackupSnapshot, 
    restoreBackupSnapshot 
  } = useDb();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [confirmRestoreFilename, setConfirmRestoreFilename] = useState<string | null>(null);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Filters & Customization
  const [dateRange, setDateRange] = useState<'all' | '7days' | '30days' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [selectedSheets, setSelectedSheets] = useState({
    stock: true,
    kirim: true,
    chiqim: true,
    otkazma: true,
    kontragent: true,
    prices: true,
    users: true,
    audit: true,
  });

  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [importConfirmData, setImportConfirmData] = useState<any>(null);

  // Toggle single sheet
  const toggleSheet = (key: keyof typeof selectedSheets) => {
    setSelectedSheets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Select/Deselect all
  const setAllSheets = (val: boolean) => {
    setSelectedSheets({
      stock: val,
      kirim: val,
      chiqim: val,
      otkazma: val,
      kontragent: val,
      prices: val,
      users: val,
      audit: val,
    });
  };

  const getExportOptions = (): ExportOptions => ({
    dateRange,
    startDate: dateRange === 'custom' ? startDate : undefined,
    endDate: dateRange === 'custom' ? endDate : undefined,
    selectedSheets,
  });

  // Action handlers
  const handleExportExcel = () => {
    setIsExporting('excel');
    try {
      exportToMultiSheetExcel(db, getExportOptions());
      toast.success("Excel (.xlsx) fayli muvaffaqiyatli shakllantirildi va yuklandi!");
    } catch (e: any) {
      console.error(e);
      toast.error("Excel faylini yaratishda xatolik yuz berdi");
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportJson = () => {
    setIsExporting('json');
    try {
      exportDatabaseToJson(db);
      toast.success("To'liq ma'lumotlar bazasi JSON zaxirasi saqlandi!");
    } catch (e: any) {
      console.error(e);
      toast.error("JSON zaxirani yuklab olishda xatolik yuz berdi");
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportFullComprehensive = async () => {
    setIsExporting('full');
    try {
      const res = await exportFullComprehensiveBackup();
      toast.success(`To'liq ko'p manbali zaxira yuklab olindi! (${res.summaryText})`, { duration: 6000 });
    } catch (e: any) {
      console.error(e);
      toast.error("To'liq zaxirani yig'ishda xatolik yuz berdi");
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = () => {
    setIsExporting('pdf');
    try {
      exportToComprehensivePdf(db, getExportOptions());
      toast.success("Rasmiy PDF hisobot fayli yaratildi va yuklab olindi!");
    } catch (e: any) {
      console.error(e);
      toast.error("PDF hisobotini yaratishda xatolik yuz berdi");
    } finally {
      setIsExporting(null);
    }
  };

  // Import JSON handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && (parsed.tepa || parsed.kotta || parsed.users)) {
          setImportConfirmData(parsed);
        } else {
          toast.error("Noto'g'ri zaxira fayl formati!");
        }
      } catch {
        toast.error("Faylni o'qishda xatolik yuz berdi!");
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (importConfirmData) {
      const { backupMetadata, ...restDb } = importConfirmData;
      setDb(restDb);
      toast.success("Baza ma'lumotlari zaxira faylidan to'liq tiklandi!");
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImportConfirmData(null);
    }
  };

  const cancelImport = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setImportConfirmData(null);
  };

  // Stats calculation
  const totalTepa = Object.values(db.tepa?.stock || {}).reduce((acc, szs) => acc + Object.values(szs || {}).reduce((a, b) => a + b, 0), 0);
  const totalKotta = Object.values(db.kotta?.stock || {}).reduce((acc, szs) => acc + Object.values(szs || {}).reduce((a, b) => a + b, 0), 0);
  const totalKirimCount = (db.tepa?.transactions || []).filter(t => t.amal === 'kirim').length + (db.kotta?.transactions || []).filter(t => t.amal === 'kirim').length;
  const totalChiqimCount = (db.tepa?.transactions || []).filter(t => t.amal === 'chiqim').length + (db.kotta?.transactions || []).filter(t => t.amal === 'chiqim').length;

  return (
    <div className="flex flex-col gap-6">
      {/* 3 Main Export Format Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* EXCEL CARD */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] hover:border-emerald-500/40 transition-all rounded-2xl p-5 shadow-sm flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-md">
                Tavsiya etiladi
              </span>
            </div>
            <h3 className="text-base font-bold text-[var(--text)] mb-1.5 flex items-center gap-1.5">
              Excel (.XLSX) To'liq Jadval
            </h3>
            <p className="text-xs text-[var(--text3)] leading-relaxed mb-4">
              Barcha 8 ta bo'limni (Ombor qoldig'i, Kirim, Chiqim, O'tkazma, Mijozlar, Narxlar, Xodimlar) bitta ko'p varaqli Excel faylda yuklab olish.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              disabled={isExporting !== null}
              className="flex-1 py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-emerald-600/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting === 'excel' ? 'Tayyorlanmoqda...' : 'Excel Yuklab Olish'}
            </button>
            <button
              onClick={() => setIsExcelImportOpen(true)}
              className="py-3 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              title="Excel orqali ommaviy yuklash"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
          </div>
        </div>

        {/* JSON BACKUP CARD */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] hover:border-indigo-500/40 transition-all rounded-2xl p-5 shadow-sm flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
                <Database className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-500 px-2.5 py-1 rounded-md">
                100% Zaxira Nusxa
              </span>
            </div>
            <h3 className="text-base font-bold text-[var(--text)] mb-1.5 flex items-center gap-1.5">
              JSON To'liq Baza Nusxasi
            </h3>
            <p className="text-xs text-[var(--text3)] leading-relaxed mb-4">
              Firebase ma'lumotlar bazasining to'liq zaxira nusxasi. Keyinchalik istalgan payt bazani avvalgi holatiga qayta tiklash imkonini beradi.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleExportJson}
                disabled={isExporting !== null}
                className="flex-1 py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-indigo-600/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting === 'json' ? 'Yuklanmoqda...' : 'JSON Saqlash'}
              </button>
              <input 
                type="file" 
                accept=".json" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="JSON zaxiradan bazani qayta tiklash"
              >
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>Tiklash</span>
              </button>
            </div>
            <button
              onClick={handleExportFullComprehensive}
              disabled={isExporting !== null}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {isExporting === 'full' ? 'Barcha manbalar yig\'ilmoqda...' : 'To\'liq zaxira yuklab olish (IDB + LS + FS)'}
            </button>
          </div>
        </div>

        {/* PDF REPORT CARD */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] hover:border-rose-500/40 transition-all rounded-2xl p-5 shadow-sm flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 px-2.5 py-1 rounded-md">
                Chop etish uchun
              </span>
            </div>
            <h3 className="text-base font-bold text-[var(--text)] mb-1.5 flex items-center gap-1.5">
              Rasmiy PDF Hisobot
            </h3>
            <p className="text-xs text-[var(--text3)] leading-relaxed mb-4">
              Jami tovarlar balansi, ombor umumiy qiymati, asosiy modellar va mijozlar holati bilan rasmiy imzo va muhrli PDF hujjati.
            </p>
          </div>
          <button
            onClick={handleExportPdf}
            disabled={isExporting !== null}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm shadow-rose-600/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting === 'pdf' ? 'Yaratilmoqda...' : 'PDF Hisobotini Yuklab Olish'}
          </button>
        </div>
      </div>

      {/* DAILY AUTO-BACKUP & SNAPSHOT RECOVERY SECTION */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2 flex-wrap">
                <span>Kunlik Avtomatik Zaxiralar (Auto-Backups)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                  Faol • Har kuni avtomatik
                </span>
              </h3>
              <p className="text-xs text-[var(--text3)] mt-0.5">
                Har kuni butun tizim ma'lumotlari (qoldiqlar, kassa, qarzlar, amallar) avtomatik arxivlanadi. 1-bosishda tiklash yoki yuklab olishingiz mumkin.
              </p>
            </div>
          </div>

          <button
            onClick={async () => {
              setIsCreatingSnapshot(true);
              try {
                await createBackupSnapshot();
              } finally {
                setIsCreatingSnapshot(false);
              }
            }}
            disabled={isCreatingSnapshot}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
          >
            <Sparkles className={cn("w-4 h-4", isCreatingSnapshot && "animate-spin")} />
            <span>{isCreatingSnapshot ? "Yaratilmoqda..." : "Hozir Yangi Zaxira Olish"}</span>
          </button>
        </div>

        {/* Backups List */}
        <div className="space-y-2">
          {backupsList.length === 0 ? (
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-center text-xs text-[var(--text3)] italic">
              Avtomatik zaxiralar fonda saqlanmoqda yoki yuqoridagi tugma orqali hoziroq birinchi zaxira nusxasini oling.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {backupsList.map((bk) => (
                <div 
                  key={bk.filename}
                  className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-black text-[var(--text)] truncate">{bk.date}</span>
                      </div>
                      <p className="text-[10px] text-[var(--text3)] mt-1">
                        Hajmi: <span className="font-bold text-[var(--text2)]">{bk.sizeKb} KB</span> • {new Date(bk.updatedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                      JSON
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                    <a
                      href={`/api/backup/download/${encodeURIComponent(bk.filename)}`}
                      download={bk.filename}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-[var(--bg2)] hover:bg-[var(--border)] text-[var(--text)] text-[11px] font-bold flex items-center justify-center gap-1 transition-colors text-center"
                      title="Ushbu zaxira faylini yuklab olish"
                    >
                      <Download className="w-3 h-3 text-emerald-500" />
                      <span>Yuklash</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreFilename(bk.filename)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Bazani ushbu kungi holatga qaytarish"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Tiklash</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FILTERS & CUSTOM DATA SELECTOR */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-[var(--border)]">
          <div>
            <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-500" />
              Eksportni Moslashtirish va Sanani Tanlash
            </h3>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Faqat kerakli vaqt oralig'i yoki ma'lum bo'limlarni tanlab yuklab olishingiz mumkin.
            </p>
          </div>

          {/* Quick Date Range Selectors */}
          <div className="flex items-center gap-1.5 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] self-start sm:self-auto">
            <button
              onClick={() => setDateRange('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateRange === 'all' 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Barcha vaqt
            </button>
            <button
              onClick={() => setDateRange('7days')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateRange === '7days' 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Oxirgi 7 kun
            </button>
            <button
              onClick={() => setDateRange('30days')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateRange === '30days' 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              30 kun
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateRange === 'custom' 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Oraliq sana
            </button>
          </div>
        </div>

        {/* Custom Date Inputs */}
        {dateRange === 'custom' && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-wrap items-center gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-[var(--text3)] uppercase tracking-wider">Dan:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] font-semibold outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text3)] uppercase tracking-wider">Gacha:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] font-semibold outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Section Checkboxes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Excelga Kiritiladigan Jadvallar:
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setAllSheets(true)} 
                className="text-[11px] text-emerald-500 font-bold hover:underline cursor-pointer"
              >
                Hammasini tanlash
              </button>
              <span className="text-[var(--text3)] text-xs">•</span>
              <button 
                onClick={() => setAllSheets(false)} 
                className="text-[11px] text-[var(--text3)] font-bold hover:underline cursor-pointer"
              >
                Tozalash
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Stock */}
            <div 
              onClick={() => toggleSheet('stock')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.stock 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Boxes className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Tovarlar Qoldig'i</p>
                  <p className="text-[10px] text-[var(--text3)]">{(totalTepa + totalKotta).toLocaleString()} dona tovar</p>
                </div>
              </div>
              {selectedSheets.stock ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Kirim */}
            <div 
              onClick={() => toggleSheet('kirim')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.kirim 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Kirimlar Tarixi</p>
                  <p className="text-[10px] text-[var(--text3)]">{totalKirimCount} ta operatsiya</p>
                </div>
              </div>
              {selectedSheets.kirim ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Chiqim */}
            <div 
              onClick={() => toggleSheet('chiqim')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.chiqim 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShoppingBag className="w-4 h-4 shrink-0 text-amber-500" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Chiqimlar & Savdo</p>
                  <p className="text-[10px] text-[var(--text3)]">{totalChiqimCount} ta operatsiya</p>
                </div>
              </div>
              {selectedSheets.chiqim ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* O'tkazma */}
            <div 
              onClick={() => toggleSheet('otkazma')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.otkazma 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ArrowRightLeft className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">O'tkazmalar</p>
                  <p className="text-[10px] text-[var(--text3)]">{(db.otkazmalar || []).length} ta o'tkazma</p>
                </div>
              </div>
              {selectedSheets.otkazma ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Kontragent */}
            <div 
              onClick={() => toggleSheet('kontragent')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.kontragent 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Mijozlar & Kontragent</p>
                  <p className="text-[10px] text-[var(--text3)]">{(db.kontragentlar || []).length} ta mijoz</p>
                </div>
              </div>
              {selectedSheets.kontragent ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Narxlar */}
            <div 
              onClick={() => toggleSheet('prices')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.prices 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <DollarSign className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Model Narxlari</p>
                  <p className="text-[10px] text-[var(--text3)]">{Object.keys(db.prices || {}).length} ta model</p>
                </div>
              </div>
              {selectedSheets.prices ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Xodimlar */}
            <div 
              onClick={() => toggleSheet('users')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.users 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className="w-4 h-4 shrink-0 text-purple-500" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Xodimlar Ro'yxati</p>
                  <p className="text-[10px] text-[var(--text3)]">{(db.users || []).length} ta xodim</p>
                </div>
              </div>
              {selectedSheets.users ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>

            {/* Audit */}
            <div 
              onClick={() => toggleSheet('audit')}
              className={cn(
                "p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none",
                selectedSheets.audit 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-500" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">Xavfsizlik Loglari</p>
                  <p className="text-[10px] text-[var(--text3)]">{(db.auditLogs || []).length} ta log</p>
                </div>
              </div>
              {selectedSheets.audit ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
            </div>
          </div>
        </div>
      </div>

      {/* IMPORT CONFIRMATION MODAL */}
      {importConfirmData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-rose-500/30 p-6 sm:p-8 rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[var(--text)] mb-2">
              Ma'lumotlar Bazasini Qayta Tiklash
            </h3>
            <p className="text-xs text-[var(--text3)] leading-relaxed mb-4">
              Yuklangan zaxira fayli Firestore ma'lumotlar bazasi ustiga to'liq yoziladi. Mavjud joriy o'zgarishlar almashtiriladi.
            </p>

            {importConfirmData.backupMetadata && (
              <div className="bg-[var(--bg)] border border-[var(--border)] p-3 rounded-xl text-xs mb-6 space-y-1">
                <div className="text-[var(--text3)] font-medium">
                  Zaxira vaqti: <span className="font-bold text-[var(--text)]">{new Date(importConfirmData.backupMetadata.exportedAt).toLocaleString()}</span>
                </div>
                <div className="text-[var(--text3)] font-medium">
                  Mijozlar: <span className="font-bold text-[var(--text)]">{importConfirmData.backupMetadata.totalClients || 0} ta</span> | Xodimlar: <span className="font-bold text-[var(--text)]">{importConfirmData.backupMetadata.totalUsers || 0} ta</span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={confirmImport}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Ha, Tiklansin
              </button>
              <button 
                onClick={cancelImport}
                className="flex-1 py-3 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Bekor Qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE SNAPSHOT CONFIRMATION MODAL */}
      {confirmRestoreFilename && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-amber-500/40 p-6 sm:p-7 rounded-3xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 mx-auto border border-amber-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-center text-[var(--text)] mb-2">
              Zaxira Nusxasidan Tiklash
            </h3>
            <p className="text-xs text-center text-[var(--text3)] leading-relaxed mb-4">
              Haqiqatan ham ma'lumotlar bazasini <span className="font-bold text-[var(--text)]">"{confirmRestoreFilename}"</span> zaxira holatiga qaytarishni xohlaysizmi?
            </p>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 text-center mb-6 font-medium">
              ⚠️ Ushbu sanadan keyingi kiritilgan yangi ma'lumotlar zaxiradagi holat bilan almashtiriladi.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRestoreFilename(null)}
                className="flex-1 py-3 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)] rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fname = confirmRestoreFilename;
                  setConfirmRestoreFilename(null);
                  if (fname) {
                    await restoreBackupSnapshot(fname);
                  }
                }}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black transition-colors shadow-md shadow-amber-600/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Ha, Tiklansin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
      />
    </div>
  );
};
