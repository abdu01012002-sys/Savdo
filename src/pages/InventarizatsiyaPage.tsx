import React, { useState, useMemo, useCallback } from 'react';
import { useDb } from '../context/DbContext';
import { Search, Save, ClipboardCheck, AlertTriangle, Camera, QrCode, RotateCcw, CheckCircle2 } from 'lucide-react';
import { generateId, getNowStr, getTodayStr } from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';
import { toast } from 'sonner';
import { BarcodeScannerModal, ScanResult } from '../components/BarcodeScannerModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

type CountData = Record<string, Record<string, number>>;

export default function InventarizatsiyaPage() {
  const { db, currentOmbor, currentUser, setDb } = useDb();
  const [search, setSearch] = useState('');
  
  // actualCounts: { [model]: { [size]: count } }
  const [actualCounts, setActualCounts] = useState<CountData>({});
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const stock = db[currentOmbor].stock || {};
  const allStockModels = useMemo(() => Object.keys(stock), [stock]);

  // Handle Barcode/QR scan in Inventarizatsiya (increment count)
  const handleInventoryScan = useCallback((res: ScanResult) => {
    if (!res.model) return;
    
    // Check if model exists in current warehouse stock
    const targetModel = allStockModels.find(m => m.toLowerCase() === res.model.toLowerCase()) || res.model;

    setActualCounts(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as CountData;
      if (!draft[targetModel]) draft[targetModel] = {};

      if (res.sizesObject && Object.keys(res.sizesObject).length > 0) {
        // Increment for all sizes in box
        Object.entries(res.sizesObject).forEach(([sz, qty]) => {
          draft[targetModel][sz] = (draft[targetModel][sz] || 0) + Number(qty || 0);
        });
        toast.success(`📦 "${targetModel}" seriya qutisi sanaldi!`);
      } else if (res.size) {
        const addQty = res.quantity || 1;
        draft[targetModel][res.size] = (draft[targetModel][res.size] || 0) + addQty;
        toast.success(`👞 "${targetModel}" ${res.size}°: +${addQty} juft sanaldi!`);
      } else {
        // If only model without size, set search to focus
        setSearch(targetModel);
        toast.info(`🔍 "${targetModel}" modeli topildi.`);
      }
      return draft;
    });
  }, [allStockModels]);

  // Global hardware scanner listener
  useBarcodeScanner({
    onScan: handleInventoryScan,
    availableModels: allStockModels,
    enabled: true
  });
  
  const filteredModels = useMemo(() => {
    return Object.keys(stock).filter(m => !search || m.toLowerCase().includes(search.toLowerCase()));
  }, [stock, search]);

  const handleCountChange = (model: string, size: string, value: string) => {
    const num = parseInt(value);
    if (isNaN(num) && value !== '') return;
    if (num < 0) return toast.error("Manfiy qoldiq kiritish mumkin emas!");
    
    setActualCounts(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as CountData;
      if (!draft[model]) draft[model] = {};
      
      if (value === '') {
        delete draft[model][size];
      } else {
        draft[model][size] = num;
      }
      return draft;
    });
  };

  const calculateDifferences = () => {
    const diffs: { model: string, size: string, systemCount: number, actualCount: number, difference: number }[] = [];
    
    Object.keys(stock).forEach(model => {
      Object.keys(stock[model]).forEach(size => {
        const systemCount = stock[model][size] || 0;
        const actualCount = actualCounts[model]?.[size];
        
        if (actualCount !== undefined && actualCount !== systemCount) {
          diffs.push({
            model,
            size,
            systemCount,
            actualCount,
            difference: actualCount - systemCount
          });
        }
      });
    });
    
    return diffs;
  };

  const differences = calculateDifferences();

  const handleSave = () => {
    if (differences.length === 0) {
      return toast.info("Hozircha hech qanday farq kiritilmagan");
    }
    
    if (!window.confirm(`Haqiqatan ham ${differences.length} ta farqni saqlab bazani yangilamoqchimisiz?`)) return;

    const txGroupId = generateId();
    const txVaqt = getNowStr();
    const sana = getTodayStr();
    
    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const dStock = draft[currentOmbor].stock;
      
      differences.forEach(diff => {
        // Adjust stock
        if (!dStock[diff.model]) dStock[diff.model] = {};
        dStock[diff.model][diff.size] = Math.max(0, diff.actualCount);
        
        const isKirim = diff.difference > 0;
        const amalType = isKirim ? 'kirim' : 'chiqim';
        const qty = Math.abs(diff.difference);
        
        // Add transaction
        draft[currentOmbor].transactions.push({
          id: generateId(),
          vaqt: txVaqt,
          sana,
          amal: amalType,
          model: diff.model,
          olcham: diff.size,
          soni: qty,
          kimdan: isKirim ? 'Inventarizatsiya (Ortiqcha)' : 'Inventarizatsiya (Kamomad/Spisaniya)',
          izoh: 'Avtomatik inventarizatsiya farqi',
          xodim: currentUser!.ism,
          summa: qty * (draft.prices?.[diff.model]?.[isKirim ? 'cost' : 'sale'] || 0),
          groupId: txGroupId
        });
        
        // Add audit log
        if (!draft.auditLogs) draft.auditLogs = [];
        const log = createAuditLog(currentUser!, amalType, 'Inventarizatsiya', `Inventarizatsiya: ${diff.model} (${diff.size}°). Tizimda: ${diff.systemCount}, Haqiqatda: ${diff.actualCount}. Farq: ${diff.difference > 0 ? '+' : ''}${diff.difference}`);
        draft.auditLogs.push(log);
      });
      
      return draft;
    });
    
    setActualCounts({});
    toast.success("✅ Baza muvaffaqiyatli yangilandi va tarixga yozildi!");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
        <h1 className="text-2xl font-black text-[var(--text)] tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
            <ClipboardCheck size={22} />
          </div>
          Inventarizatsiya (Reviyzya)
        </h1>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Camera Scanner Trigger */}
          <button 
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl text-[14px] font-bold hover:bg-purple-700 transition-colors shadow-md shadow-purple-500/20 cursor-pointer active:scale-95"
          >
            <Camera size={18} />
            <span>Kamera Skaner</span>
          </button>

          <button 
            onClick={handleSave}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-[14px] font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Save size={18} />
            <span>Saqlash</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="md:col-span-2 bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text3)]" size={18} />
              <input
                type="text"
                placeholder="Model nomini qidiring..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-[14px] text-[var(--text)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-4">
            {filteredModels.map(model => (
              <div key={model} className="p-5 border border-[var(--border)] rounded-2xl bg-[var(--bg)]">
                <h3 className="font-bold text-[16px] text-[var(--text)] mb-4 pb-3 border-b border-[var(--border)]">{model}</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {Object.entries(stock[model]).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).map(([size, systemCount]) => {
                    const actualCount = actualCounts[model]?.[size];
                    const isDiff = actualCount !== undefined && actualCount !== systemCount;
                    
                    return (
                      <div key={size} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${isDiff ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[var(--bg2)] border-[var(--border)]'}`}>
                        <div className="flex justify-between w-full items-center">
                          <span className="text-[13px] font-bold text-[var(--text3)]">{size}°</span>
                          <span className="text-[12px] font-bold text-[var(--text)] px-2 py-0.5 bg-[var(--bg)] rounded-md border border-[var(--border)]">{systemCount}</span>
                        </div>
                        <input
                          type="number"
                          placeholder="Haqiqiy"
                          value={actualCount !== undefined ? actualCount : ''}
                          onChange={(e) => handleCountChange(model, size, e.target.value)}
                          className={`w-full p-2 text-center text-[15px] font-bold rounded-lg border outline-none transition-colors ${
                            isDiff 
                              ? 'bg-white border-rose-400 text-rose-600 focus:ring-2 focus:ring-rose-500/20' 
                              : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] focus:border-blue-500'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {filteredModels.length === 0 && (
              <div className="p-8 text-center text-[var(--text3)]">Modellar topilmadi</div>
            )}
          </div>
        </div>

        {/* Differences Sidebar */}
        <div className="flex flex-col gap-6">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 shadow-sm sticky top-6">
            <h3 className="font-bold text-[16px] text-[var(--text)] mb-4 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              Aniqlangan Farqlar
            </h3>
            
            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2" style={{scrollbarWidth: 'thin'}}>
              {differences.length === 0 ? (
                <div className="text-[13px] text-[var(--text3)] text-center py-6 border border-dashed border-[var(--border)] rounded-xl">
                  Hozircha farqlar yo'q
                </div>
              ) : (
                differences.map((diff, i) => (
                  <div key={i} className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[13px] text-[var(--text)]">{diff.model} <span className="text-[var(--text3)]">({diff.size}°)</span></div>
                      <div className="text-[11px] text-[var(--text3)] mt-0.5">Tizim: {diff.systemCount} → Haqiqiy: {diff.actualCount}</div>
                    </div>
                    <div className={`text-[14px] font-black px-2.5 py-1 rounded-lg ${diff.difference > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {diff.difference > 0 ? '+' : ''}{diff.difference}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {differences.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                <button
                  type="button"
                  onClick={() => setActualCounts({})}
                  className="w-full py-2 bg-[var(--bg)] hover:bg-rose-500/10 text-rose-600 border border-[var(--border)] hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Kiritilgan sonlarni tozalash</span>
                </button>
                <p className="text-[12px] text-[var(--text3)] leading-relaxed">
                  Saqlash tugmasi bosilganda barcha farqlar avtomatik ravishda <strong className="text-[var(--text)]">kirim</strong> (ortiqcha) yoki <strong className="text-[var(--text)]">chiqim</strong> (kamomad) sifatida tarixga yoziladi va baza to'g'rilanadi.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barcode & QR Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleInventoryScan}
        availableModels={allStockModels}
        title="Inventarizatsiya Skaneri (Kamera)"
        description="Poyabzal qutilaridagi shtrix-kod yoki QR-kodni ketma-ket skanerlab sanang"
        autoCloseOnSuccess={false}
      />
    </div>
  );
}
