import React, { useState, useRef } from 'react';
import { useDb } from '@/context/DbContext';
import { 
  isCollectionsArchitectureEnabled, 
  setCollectionsArchitectureEnabled 
} from '@/lib/firestoreCollectionSync';
import { executeMigration, MigrationReport } from '@/lib/migrationService';
import { cn } from '@/lib/utils';
import { Database, ShieldCheck, Play, CheckCircle2, AlertTriangle, RefreshCw, Layers, Upload, FileJson } from 'lucide-react';
import { toast } from 'sonner';

export const MigrationControlPanel: React.FC = () => {
  const { currentUser } = useDb();
  const isAdmin = currentUser?.rol === 'admin';

  const [collectionsEnabled, setCollectionsEnabled] = useState(isCollectionsArchitectureEnabled());
  const [isDryRun, setIsDryRun] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [report, setReport] = useState<MigrationReport | null>(null);

  // Migration Source Selection
  const [sourceType, setSourceType] = useState<'indexeddb' | 'backup_file'>('indexeddb');
  const [backupData, setBackupData] = useState<any | null>(null);
  const [backupFileName, setBackupFileName] = useState<string | null>(null);
  const [backupFileStats, setBackupFileStats] = useState<{
    transactions: number;
    kottaTransactions: number;
    otkazmalar: number;
    kassaHarakatlari: number;
    kontragentlar: number;
    auditLogs: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) return null;

  const handleToggleArchitecture = (enabled: boolean) => {
    setCollectionsArchitectureEnabled(enabled);
    setCollectionsEnabled(enabled);
    toast.success(enabled ? "Yangi kolleksiyalar arxitekturasi yoqildi" : "Eski rejimga qaytildi");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        
        // Fayl ichidagi indexedDbData kaliti yoki to'g'ridan-to'g'ri db
        const dbContent = parsed?.indexedDbData || parsed;

        if (!dbContent || typeof dbContent !== 'object') {
          toast.error("JSON fayl tuzilishi noto'g'ri: ma'lumotlar obyekti topilmadi");
          return;
        }

        setBackupData(dbContent);
        setBackupFileName(file.name);

        // Tezkor sonlarni hisoblash
        const tepaTx = Array.isArray(dbContent.tepa?.transactions) 
          ? dbContent.tepa.transactions.length 
          : Object.keys(dbContent.tepa?.transactions || {}).length;
        const tepaTopTx = Array.isArray(dbContent.tepaTransactions)
          ? dbContent.tepaTransactions.length
          : Object.keys(dbContent.tepaTransactions || {}).length;
        const kottaTx = Array.isArray(dbContent.kotta?.transactions) 
          ? dbContent.kotta.transactions.length 
          : Object.keys(dbContent.kotta?.transactions || {}).length;
        const kottaTopTx = Array.isArray(dbContent.kottaTransactions) 
          ? dbContent.kottaTransactions.length 
          : Object.keys(dbContent.kottaTransactions || {}).length;
        const sort2Tx = Array.isArray(dbContent.sort2?.transactions)
          ? dbContent.sort2.transactions.length
          : Object.keys(dbContent.sort2?.transactions || {}).length;
        const sort2TopTx = Array.isArray(dbContent.sort2Transactions)
          ? dbContent.sort2Transactions.length
          : Object.keys(dbContent.sort2Transactions || {}).length;

        const otkazmalar = Array.isArray(dbContent.otkazmalar) 
          ? dbContent.otkazmalar.length 
          : Object.keys(dbContent.otkazmalar || {}).length;
        const kassa = Array.isArray(dbContent.kassaHarakatlari) 
          ? dbContent.kassaHarakatlari.length 
          : Object.keys(dbContent.kassaHarakatlari || {}).length;
        const kontragent = Array.isArray(dbContent.kontragentlar) 
          ? dbContent.kontragentlar.length 
          : Object.keys(dbContent.kontragentlar || {}).length;
        const rawAudit = dbContent.auditLogs || dbContent.audit_logs || dbContent.audit || [];
        const audit = Array.isArray(rawAudit) 
          ? rawAudit.length 
          : Object.keys(rawAudit || {}).length;

        setBackupFileStats({
          transactions: tepaTx + tepaTopTx + kottaTx + sort2Tx + sort2TopTx,
          kottaTransactions: kottaTopTx,
          otkazmalar,
          kassaHarakatlari: kassa,
          kontragentlar: kontragent,
          auditLogs: audit,
        });

        toast.success(`Zaxira fayli muvaffaqiyatli yuklandi: ${file.name}`);
      } catch (err: any) {
        toast.error(`JSON faylni o'qishda xatolik: ${err?.message || err}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRunMigration = async (dryRun: boolean) => {
    if (sourceType === 'backup_file' && !backupData) {
      toast.error("Iltimos, avval zaxira JSON faylini tanlang!");
      return;
    }

    setMigrating(true);
    setReport(null);
    setProgressMsg('Migratsiya boshlanmoqda...');
    setProgressPercent(5);

    try {
      const res = await executeMigration(
        dryRun, 
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(pct);
        },
        sourceType === 'backup_file' ? backupData : undefined
      );
      setReport(res);
      if (res.success) {
        toast.success(dryRun ? "Dry-run tahlili muvaffaqiyatli yakunlandi!" : "Migratsiya muvaffaqiyatli yakunlandi!");
      } else {
        toast.error(`Migratsiyada xatolik: ${res.error}`);
      }
    } catch (e: any) {
      toast.error(`Xatolik: ${e.message || e}`);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 my-6 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Firestore Kolleksiyalar Migratsiyasi (Feature Flag)</h3>
            <p className="text-sm text-slate-500">
              IndexedDB (FalakOmborDB) dagi 6,700+ yozuvlarni yangi Firestore kolleksiyalariga o'tkazish va 1 MiB limit muammosini hal qilish.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-3 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
            Admin Only
          </span>
        </div>
      </div>

      {/* Feature Flag Toggle */}
      <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h4 className="font-semibold text-slate-800">Yangi Arxitekturani Yoqish (`use_collections_architecture`)</h4>
          <p className="text-xs text-slate-500">Yoqilganda ilova barcha ma'lumotlarni yagona `app_db/main` o'rniga alohida kolleksiyalardan o'qiydi.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={collectionsEnabled} 
            onChange={(e) => handleToggleArchitecture(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      {/* Mapping Table Reference */}
      <div className="space-y-2">
        <h4 className="font-semibold text-slate-800 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span>Xaritalash (Mapping) Qoidalari</span>
        </h4>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">IndexedDB Manba</th>
                <th className="p-3">Firestore Maqsad (Koll / Hujjat)</th>
                <th className="p-3">Qoidalar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              <tr>
                <td className="p-3 font-medium">tepa.transactions</td>
                <td className="p-3 text-indigo-600 font-medium">transactions</td>
                <td className="p-3">Hujjat ID = tx.id, ombor: 'tepa'</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">kotta.transactions</td>
                <td className="p-3 text-indigo-600 font-medium">transactions</td>
                <td className="p-3">Hujjat ID = tx.id, ombor: 'kotta' (kottaTransactions bilan aralashmaydi)</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">kottaTransactions (top)</td>
                <td className="p-3 text-indigo-600 font-medium">kottaTransactions</td>
                <td className="p-3">Hujjat ID = tx.id</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">otkazmalar, kassaHarakatlari, kontragentlar, auditLogs</td>
                <td className="p-3 text-indigo-600 font-medium">otkazmalar, kassaHarakatlari, kontragentlar, auditLogs</td>
                <td className="p-3">Har biri o'z kolleksiyasiga alohida hujjat bo'lib yoziladi</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">stock, prices, users, templates, valyutaKursi va boshqalar</td>
                <td className="p-3 text-indigo-600 font-medium">settings / main</td>
                <td className="p-3">Kichik sozlamalar bitta `settings/main` hujjatida saqlanadi</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Selection */}
      <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600" />
          <span>Migratsiya Manbasi</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={cn(
            "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all",
            sourceType === 'indexeddb' 
              ? "bg-white border-indigo-500 shadow-xs ring-1 ring-indigo-500" 
              : "bg-white/60 border-slate-200 hover:border-slate-300"
          )}>
            <input 
              type="radio" 
              name="sourceType" 
              value="indexeddb" 
              checked={sourceType === 'indexeddb'} 
              onChange={() => setSourceType('indexeddb')}
              className="mt-1 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-bold text-xs sm:text-sm text-slate-800">Brauzer IndexedDB (FalakOmborDB)</div>
              <div className="text-xs text-slate-500 mt-0.5">Ushbu brauzer xotirasidagi mavjud lokal ma'lumotlar bazasi</div>
            </div>
          </label>

          <label className={cn(
            "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all",
            sourceType === 'backup_file' 
              ? "bg-white border-indigo-500 shadow-xs ring-1 ring-indigo-500" 
              : "bg-white/60 border-slate-200 hover:border-slate-300"
          )}>
            <input 
              type="radio" 
              name="sourceType" 
              value="backup_file" 
              checked={sourceType === 'backup_file'} 
              onChange={() => setSourceType('backup_file')}
              className="mt-1 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="font-bold text-xs sm:text-sm text-slate-800">Zaxira fayldan (JSON)</div>
              <div className="text-xs text-slate-500 mt-0.5">Falak_Toliq_Kop_Manbali_Zaxira_*.json faylini yuklash</div>
            </div>
          </label>
        </div>

        {sourceType === 'backup_file' && (
          <div className="mt-3 p-4 bg-white rounded-xl border border-indigo-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 block">Zaxira JSON faylini tanlang:</span>
                <p className="text-[11px] text-slate-500">
                  Fayl brauzerda FileReader yordamida lokal o'qiladi, serverga yuborilmaydi.
                </p>
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".json"
                onChange={handleFileChange}
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>{backupFileName ? "Boshqa fayl tanlash" : "JSON faylni tanlash"}</span>
              </button>
            </div>

            {backupFileName && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold truncate max-w-xs sm:max-w-md">{backupFileName}</span>
                </div>
                <span className="text-[11px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded">
                  Yuklandi
                </span>
              </div>
            )}

            {backupFileStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 text-xs">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Tranzaksiyalar</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.transactions.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Kotta Tx</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.kottaTransactions.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">O'tkazmalar</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.otkazmalar.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Kassa</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.kassaHarakatlari.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Mijozlar</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.kontragentlar.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400 block font-medium">Audit Logs</span>
                  <strong className="text-indigo-600 font-bold">{backupFileStats.auditLogs.toLocaleString()}</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Migration Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isDryRun} 
              onChange={(e) => setIsDryRun(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">Dry Run (Faqat tahlil qilish, yozmaslik)</span>
          </label>
        </div>

        <button
          onClick={() => handleRunMigration(isDryRun)}
          disabled={migrating || (sourceType === 'backup_file' && !backupData)}
          className="ml-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
        >
          {migrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span>{isDryRun ? "Dry-Run Tahlilni Boshlash" : "Haqiqiy Migratsiyani Boshlash"}</span>
        </button>
      </div>

      {/* Progress Bar */}
      {migrating && (
        <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="flex justify-between text-xs font-medium text-slate-600">
            <span>{progressMsg}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Report View */}
      {report && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 flex items-center space-x-2">
              {report.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
              <span>Migratsiya Natijalari Hisoboti ({report.dryRun ? 'Dry-Run Rejimi' : 'Bajarildi'})</span>
            </h4>
            <span className={cn(
              "text-xs px-3 py-1 rounded-full font-semibold",
              report.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
            )}>
              {report.success ? "Muvaffaqiyatli" : "Xatolik yuz berdi"}
            </span>
          </div>

          {report.error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
              Xato: {report.error}
            </div>
          )}

          {Object.values(report.collections).some(c => c.mismatch) && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs flex items-center space-x-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>
                <b>Diqqat (Ogohlantirish):</b> Manbadagi yozuvlar soni kutilgan miqdorga mos kelmadi! Qizil bilan belgilangan qatorlarni tekshiring.
              </span>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
               <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Kolleksiya</th>
                  <th className="p-3 text-right">Kutilgan (Expected)</th>
                  <th className="p-3 text-right">{sourceType === 'backup_file' ? "Zaxira Fayl (Manba)" : "IndexedDB (Manba)"}</th>
                  <th className="p-3 text-right">Firestore (Mavjud)</th>
                  <th className="p-3 text-right">Yoziladigan</th>
                  <th className="p-3 text-right">O'tkazib yuborilgan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {Object.entries(report.collections).map(([col, stats]) => (
                  <tr key={col} className={cn("hover:bg-slate-50/50", stats.mismatch && "bg-rose-50/60")}>
                    <td className="p-3 font-semibold text-indigo-600 flex items-center space-x-1.5">
                      <span>{col}</span>
                      {stats.mismatch && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-300">
                          Farq bor!
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-500">
                      {stats.expectedCount !== undefined ? stats.expectedCount.toLocaleString() : '-'}
                    </td>
                    <td className={cn("p-3 text-right font-medium", stats.mismatch ? "text-rose-700 font-bold" : "")}>
                      {stats.idbCount.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">{stats.existingFirestoreCount.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-emerald-600">{stats.toWriteCount.toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-500">{stats.skippedCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invalid Dates Report */}
          {report.invalidDates.length > 0 && (
            <div className="space-y-2 bg-amber-50 p-4 rounded-xl border border-amber-200">
              <h5 className="font-semibold text-amber-900 text-xs flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>Sana formati noto'g'ri yoki topilmagan yozuvlar ({report.invalidDates.length} ta):</span>
              </h5>
              <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-amber-800">
                {report.invalidDates.slice(0, 20).map((inv, idx) => (
                  <div key={idx} className="bg-white/80 p-2 rounded border border-amber-100 flex justify-between">
                    <span><b>{inv.collection}</b> (ID: {inv.id})</span>
                    <span className="text-rose-600">Sana: {String(inv.sana)}</span>
                  </div>
                ))}
                {report.invalidDates.length > 20 && (
                  <p className="text-center text-amber-700 font-medium pt-1">...va yana {report.invalidDates.length - 20} ta yozuv</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
