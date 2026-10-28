import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDb } from '../context/DbContext';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Barcode, 
  Printer, 
  Download, 
  Copy, 
  Layers, 
  Tag, 
  Sparkles, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Settings2, 
  Sliders, 
  Eye, 
  CheckCircle2, 
  FileText,
  Boxes,
  LayoutGrid,
  Check,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { ALL_SIZES, formatCompact, formatUzs, cn, getCat } from '../lib/utils';
import { ACTIVE_BOX_PRESETS } from '../utils/boxCalculations';
import { printLabels, generateBarcodeDataUrl } from '../lib/labelPrintUtil';

type LabelType = 'series' | 'single' | 'barcode';
type PaperFormat = 'thermal-58' | 'thermal-80' | 'thermal-82x20' | 'a4-sheet';

interface BatchPrintItem {
  id: string;
  model: string;
  labelType: LabelType;
  size?: string;
  sizesObject?: Record<string, number>;
  price: number;
  quantity: number; // number of stickers to print
  showPrice: boolean;
  showDate: boolean;
  orgName: string;
  barcodeDataUrl?: string;
  qrDataUrl?: string;
}

export default function BarcodePage() {
  const { db, currentOmbor, currentUser } = useDb();

  // All models from stock & prices
  const allModels = useMemo(() => {
    const set = new Set<string>([
      ...Object.keys(db.prices || {}),
      ...Object.keys(db.tepa?.stock || {}),
      ...Object.keys(db.kotta?.stock || {}),
      ...Object.keys(db.sort2?.stock || {}),
    ]);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [db]);

  // Active form state
  const [selectedModel, setSelectedModel] = useState<string>(allModels[0] || 'CLASSIC-01');
  const [customModelName, setCustomModelName] = useState<string>('');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const activeModelName = isCustomModel ? customModelName : selectedModel;

  const [labelType, setLabelType] = useState<LabelType>('series');
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('thermal-80');
  const [singleSize, setSingleSize] = useState<string>('41');
  
  // Series distribution
  const [seriesPresetKey, setSeriesPresetKey] = useState<string>('std8');
  const [customSizes, setCustomSizes] = useState<Record<string, number>>({
    '39': 1, '40': 1, '41': 2, '42': 2, '43': 1, '44': 1
  });

  // Display Settings
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [priceType, setPriceType] = useState<'sale' | 'cost' | 'custom'>('sale');
  const [customPriceVal, setCustomPriceVal] = useState<string>('');
  const [showDate, setShowDate] = useState<boolean>(true);
  const [showOrgName, setShowOrgName] = useState<boolean>(true);
  const [orgName, setOrgName] = useState<string>('FALAK SHOES');
  const [printCopies, setPrintCopies] = useState<number>(1);

  // Batch Print Queue
  const [batchQueue, setBatchQueue] = useState<BatchPrintItem[]>([]);

  // Live QR Code Data URL
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  // Live Barcode Code128 Data URL
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string>('');

  // Calculate effective price
  const effectivePrice = useMemo(() => {
    if (priceType === 'custom') return Number(customPriceVal) || 0;
    const p = db.prices?.[activeModelName];
    if (priceType === 'sale') return p?.sale || 0;
    if (priceType === 'cost') return p?.cost || 0;
    return 0;
  }, [db.prices, activeModelName, priceType, customPriceVal]);

  // Payload for QR Code
  const qrPayloadData = useMemo(() => {
    if (labelType === 'series') {
      const activeSizes = Object.fromEntries(
        Object.entries(customSizes).filter(([, q]) => Number(q) > 0)
      );
      const totalInBox = Object.values(activeSizes).reduce((a, b) => a + Number(b), 0);
      return {
        type: 'series',
        model: activeModelName,
        sizes: activeSizes,
        total: totalInBox,
        price: showPrice && effectivePrice > 0 ? effectivePrice : undefined,
        org: orgName,
        date: showDate ? new Date().toISOString().slice(0, 10) : undefined
      };
    } else {
      return {
        type: 'single',
        model: activeModelName,
        size: singleSize,
        quantity: 1,
        price: showPrice && effectivePrice > 0 ? effectivePrice : undefined,
        org: orgName
      };
    }
  }, [labelType, activeModelName, customSizes, singleSize, showPrice, effectivePrice, orgName, showDate]);

  // Barcode text for linear Code128 format
  const barcodeText = useMemo(() => {
    const cleanModel = (activeModelName || 'MODEL').trim().replace(/[\s/\\|#%]+/g, '-').toUpperCase();
    return `${cleanModel}-${singleSize}`;
  }, [activeModelName, singleSize]);

  // Generate QR image
  useEffect(() => {
    if (labelType !== 'barcode') {
      const rawString = JSON.stringify(qrPayloadData);
      QRCode.toDataURL(rawString, {
        width: 260,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error(err));
    }
  }, [qrPayloadData, labelType]);

  // Generate Linear Barcode Code128 image
  useEffect(() => {
    if (labelType === 'barcode' && barcodeText) {
      const is58 = paperFormat === 'thermal-58';
      const is82x20 = paperFormat === 'thermal-82x20';
      const url = generateBarcodeDataUrl(barcodeText, {
        height: is82x20 ? 32 : is58 ? 40 : 52,
        fontSize: is82x20 ? 10 : is58 ? 11 : 13,
        width: is82x20 ? 1.4 : is58 ? 1.5 : 1.9
      });
      setBarcodeDataUrl(url);
    }
  }, [barcodeText, labelType, paperFormat]);

  // Handle Preset change
  const handlePresetChange = (presetKey: string) => {
    setSeriesPresetKey(presetKey);
    const preset = ACTIVE_BOX_PRESETS.find(p => p.id === presetKey);
    if (preset) {
      setCustomSizes({ ...preset.sizes });
    }
  };

  // Add to batch queue
  const handleAddToBatch = () => {
    if (!activeModelName.trim()) {
      return toast.error("Iltimos, model nomini kiriting!");
    }

    const newItem: BatchPrintItem = {
      id: Math.random().toString(36).substring(2, 9),
      model: activeModelName.trim(),
      labelType,
      size: labelType !== 'series' ? singleSize : undefined,
      sizesObject: labelType === 'series' ? { ...customSizes } : undefined,
      price: effectivePrice,
      quantity: Math.max(1, printCopies),
      showPrice,
      showDate,
      orgName,
      qrDataUrl: labelType !== 'barcode' ? qrDataUrl : undefined,
      barcodeDataUrl: labelType === 'barcode' ? barcodeDataUrl : undefined
    };

    setBatchQueue(prev => [newItem, ...prev]);
    toast.success(`"${activeModelName}" (${printCopies} ta yorliq) chop etish navbatiga qo'shildi!`);
  };

  // Direct Single Print
  const handleDirectPrint = async () => {
    if (!activeModelName.trim()) {
      return toast.error("Model nomi kiritilmagan!");
    }
    toast.info("Chop etishga tayyorlanmoqda...");
    await printLabels({
      model: activeModelName,
      labelType,
      size: singleSize,
      sizesObject: customSizes,
      price: effectivePrice,
      showPrice,
      showDate,
      orgName,
      paperFormat,
      copies: printCopies,
      qrDataUrl,
      barcodeDataUrl
    });
  };

  // Download PNG
  const handleDownloadCode = () => {
    const isBarcode = labelType === 'barcode';
    const targetUrl = isBarcode ? barcodeDataUrl : qrDataUrl;
    if (!targetUrl) {
      return toast.error("Rasm hali tayyor emas!");
    }
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = isBarcode 
      ? `BARCODE_${activeModelName}_${singleSize}.png`
      : `QR_${activeModelName}_${labelType}.png`;
    a.click();
    toast.success(isBarcode ? "Shtrix-kod rasmi yuklab olindi!" : "QR-kod rasmi yuklab olindi!");
  };

  const totalSeriesPairs = useMemo(() => {
    return Object.values(customSizes).reduce((a, b) => a + Number(b || 0), 0);
  }, [customSizes]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg2)] p-5 rounded-3xl border border-[var(--border)] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
            <QrCode size={26} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--text)] flex items-center gap-2">
              QR va Shtrix-kod Yorliqlar Studiyasi
              <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 text-[11px] font-black uppercase tracking-wider">
                Admin
              </span>
            </h1>
            <p className="text-xs font-semibold text-[var(--text3)] mt-0.5">
              Qutilar, seriya karobkalar va yakka juftlar uchun professional termo-etiketkalar yaratish va chop etish
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleDirectPrint}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-md shadow-purple-500/20 transition-all cursor-pointer active:scale-95"
          >
            <Printer size={16} />
            <span>Chop Etish (Ctrl + P)</span>
          </button>
        </div>
      </div>

      {/* Main Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form & Configuration (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Card 1: Model va Yorliq Turi */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-2">
              <Tag size={16} className="text-purple-600" />
              1. Mahsulot va Yorliq Formati
            </h3>

            {/* Label Type Selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLabelType('series')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1",
                  labelType === 'series'
                    ? "bg-purple-500/10 border-purple-500 text-purple-600 font-black shadow-xs ring-2 ring-purple-500/20"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] font-semibold hover:border-purple-500/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <Boxes size={18} />
                  {labelType === 'series' && <CheckCircle2 size={14} />}
                </div>
                <span className="text-xs mt-1">Seriya (Quti/Box)</span>
                <span className="text-[10px] text-[var(--text3)]">Barcha o'lchamlar bilan</span>
              </button>

              <button
                type="button"
                onClick={() => setLabelType('single')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1",
                  labelType === 'single'
                    ? "bg-purple-500/10 border-purple-500 text-purple-600 font-black shadow-xs ring-2 ring-purple-500/20"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] font-semibold hover:border-purple-500/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <QrCode size={18} />
                  {labelType === 'single' && <CheckCircle2 size={14} />}
                </div>
                <span className="text-xs mt-1">Yakka Juft (QR)</span>
                <span className="text-[10px] text-[var(--text3)]">1 ta o'lcham uchun</span>
              </button>

              <button
                type="button"
                onClick={() => setLabelType('barcode')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1",
                  labelType === 'barcode'
                    ? "bg-purple-500/10 border-purple-500 text-purple-600 font-black shadow-xs ring-2 ring-purple-500/20"
                    : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] font-semibold hover:border-purple-500/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <Barcode size={18} />
                  {labelType === 'barcode' && <CheckCircle2 size={14} />}
                </div>
                <span className="text-xs mt-1">Klassik Shtrix-kod</span>
                <span className="text-[10px] text-[var(--text3)]">Chiziqli skaner formati</span>
              </button>
            </div>

            {/* Model Selector / Custom Name */}
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--text3)]">Model Nomi</label>
                <button
                  type="button"
                  onClick={() => setIsCustomModel(!isCustomModel)}
                  className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer"
                >
                  {isCustomModel ? "Katalogdan tanlash" : "+ Yangi model nomi yozish"}
                </button>
              </div>

              {isCustomModel ? (
                <input
                  type="text"
                  placeholder="Yangi model nomini kiriting (masalan: MOKASIN-LUX)..."
                  value={customModelName}
                  onChange={e => setCustomModelName(e.target.value.toUpperCase())}
                  className="w-full h-10 px-3.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                />
              ) : (
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full h-10 px-3.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  {allModels.map(m => (
                    <option key={m} value={m}>
                      {m} {db.prices?.[m]?.sale ? `(${formatCompact(db.prices[m].sale)} so'm)` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Size breakdown for Series OR Single size */}
            {labelType === 'series' ? (
              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text3)]">Quti Taqsimoti (Seriya)</span>
                  <span className="text-xs font-black text-purple-600 px-2 py-0.5 bg-purple-500/10 rounded-lg">
                    Jami: {totalSeriesPairs} juft
                  </span>
                </div>

                {/* Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ACTIVE_BOX_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePresetChange(p.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border",
                        seriesPresetKey === p.id 
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs" 
                          : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/40"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* Sizes Grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {ALL_SIZES.map(sz => (
                    <div key={sz} className="flex flex-col items-center bg-[var(--bg)] p-1.5 rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text3)]">{sz}°</span>
                      <input
                        type="number"
                        min="0"
                        value={customSizes[sz] || 0}
                        onChange={e => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setCustomSizes(prev => ({ ...prev, [sz]: val }));
                        }}
                        className="w-full text-center font-black text-xs bg-transparent outline-none text-[var(--text)] pt-0.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <label className="text-xs font-bold text-[var(--text3)]">Poyabzal O'lchami</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ALL_SIZES.map(sz => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSingleSize(sz)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-black transition-all cursor-pointer border",
                        singleSize === sz
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs ring-2 ring-purple-500/30"
                          : "bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/40"
                      )}
                    >
                      {sz}°
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Card 2: Tashqi Ko'rinish va Chop etish Sozlamalari */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-2">
              <Sliders size={16} className="text-purple-600" />
              2. Yorliq Ko'rinishi va Printer Sozlamalari
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Paper Format */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text3)]">Qog'oz / Printer formati</label>
                <select
                  value={paperFormat}
                  onChange={e => setPaperFormat(e.target.value as PaperFormat)}
                  className="w-full h-10 px-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="thermal-80">Termoprinter 80×60 mm (Katta yorliq)</option>
                  <option value="thermal-82x20">Termoprinter 82×20 mm (20-82 mm format / Lenta)</option>
                  <option value="thermal-58">Termoprinter 58×40 mm (Kichik yorliq)</option>
                  <option value="a4-sheet">A4 Qog'ozi (Stikerlar varag'i)</option>
                </select>
              </div>

              {/* Organization Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text3)]">Brend / Korxona nomi</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="FALAK SHOES"
                  className="w-full h-10 px-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500"
                />
              </div>

              {/* Price Type & Value */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--text3)]">Narx Ko'rsatish</label>
                  <label className="flex items-center gap-1 text-[11px] text-[var(--text)] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={e => setShowPrice(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-purple-600"
                    />
                    <span>Chiqarilsin</span>
                  </label>
                </div>
                {showPrice && (
                  <div className="flex items-center gap-2">
                    <select
                      value={priceType}
                      onChange={e => setPriceType(e.target.value as any)}
                      className="h-10 px-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="sale">Sotuv narxi</option>
                      <option value="cost">Tan narxi</option>
                      <option value="custom">Boshqa narx</option>
                    </select>
                    {priceType === 'custom' && (
                      <input
                        type="number"
                        placeholder="Narx..."
                        value={customPriceVal}
                        onChange={e => setCustomPriceVal(e.target.value)}
                        className="flex-1 h-10 px-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Print copies & Add to Batch */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text3)]">Nusxalar soni (dona)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={printCopies}
                    onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 h-10 px-3 text-center bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-black text-[var(--text)] outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddToBatch}
                    className="flex-1 h-10 flex items-center justify-center gap-1.5 bg-[var(--bg)] hover:bg-purple-500/10 text-purple-600 border border-purple-500/30 hover:border-purple-500/60 rounded-xl text-xs font-black transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Navbatga Qo'shish</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: Live Preview & Printable Label (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Live Preview Card */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-4 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-2">
                <Eye size={16} className="text-purple-600" />
                Jonli Ko'rinish (Preview)
              </h3>
              <span className="text-[11px] font-bold text-[var(--text3)] px-2.5 py-0.5 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
                {paperFormat === 'thermal-80' ? '80×60 mm' : paperFormat === 'thermal-82x20' ? '82×20 mm (20-82 mm)' : paperFormat === 'thermal-58' ? '58×40 mm' : 'A4 Format'}
              </span>
            </div>

            {/* Rendered Label (Styled like real physical sticker) */}
            <div className="flex justify-center p-4 bg-slate-900/10 dark:bg-slate-950/40 rounded-2xl border border-dashed border-[var(--border)] overflow-x-auto">
              {paperFormat === 'thermal-82x20' ? (
                /* Specialized 82x20 mm Horizontal Ribbon Sticker Preview */
                <div
                  id="printable-label-card"
                  className="bg-white text-gray-900 border-2 border-gray-900 rounded-lg p-2.5 shadow-xl w-[360px] min-h-[96px] flex items-center justify-between gap-2.5 transition-all text-xs"
                >
                  {/* Left Column: Brand, Model, Size/Series */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center leading-tight">
                    <div className="text-[9px] font-black uppercase tracking-wider text-gray-500 truncate">
                      {orgName || 'FALAK SHOES'}
                    </div>
                    <div className="text-sm font-black uppercase tracking-tight text-gray-900 truncate my-0.5" title={activeModelName}>
                      {activeModelName}
                    </div>
                    {labelType === 'series' ? (
                      <div className="text-[9px] font-mono font-bold text-gray-700 truncate bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 mt-0.5">
                        {totalSeriesPairs}j: {Object.entries(customSizes).filter(([, q]) => Number(q) > 0).map(([sz, q]) => `${sz}:${q}`).join(' ')}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-800">
                        <span>O'lcham: <b className="text-xs font-black">{singleSize}°</b></span>
                        {getCat(activeModelName) !== 'umumiy' && (
                          <span className="text-[8px] px-1 py-0.2 bg-gray-100 rounded border border-gray-300 font-bold uppercase">
                            {getCat(activeModelName) === 'qishki' ? '❄️ Qish' : '☀️ Yoz'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Middle / Barcode or Price */}
                  {labelType === 'barcode' ? (
                    <div className="w-36 flex flex-col items-center justify-center shrink-0">
                      {barcodeDataUrl ? (
                        <img src={barcodeDataUrl} alt="Barcode" className="max-h-12 w-full object-contain" />
                      ) : (
                        <div className="w-full h-10 bg-gray-100 animate-pulse rounded text-[9px] text-gray-400 flex items-center justify-center">
                          Shtrix-kod...
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Right Column: Price, Date & QR */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-end justify-center leading-tight">
                      {showPrice && effectivePrice > 0 ? (
                        <div className="font-black text-xs text-gray-900 whitespace-nowrap">
                          {formatUzs(effectivePrice)} <span className="text-[8px] text-gray-500">UZS</span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-gray-400 font-bold">Standart</span>
                      )}
                      {showDate && (
                        <span className="text-gray-500 font-mono text-[8px] mt-0.5">
                          {new Date().toISOString().slice(0, 10)}
                        </span>
                      )}
                    </div>

                    {labelType !== 'barcode' && (
                      <div className="w-14 h-14 p-0.5 bg-white border border-gray-300 rounded flex items-center justify-center shrink-0">
                        {qrDataUrl ? (
                          <img src={qrDataUrl} alt="QR Code" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full bg-gray-100 animate-pulse rounded text-[8px] text-gray-400 flex items-center justify-center">
                            QR
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Standard Box Label Card (80x60, 58x40, A4) */
                <div 
                  id="printable-label-card"
                  className={cn(
                    "bg-white text-gray-900 border-2 border-gray-900 rounded-xl p-4 shadow-xl flex flex-col justify-between transition-all",
                    paperFormat === 'thermal-58' ? "w-[240px] text-[10px]" : "w-[300px] text-xs"
                  )}
                >
                  {/* Header: Org & Model */}
                  <div className="border-b-2 border-gray-900 pb-2 text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      {orgName || 'FALAK SHOES'}
                    </div>
                    <div className="text-lg font-black tracking-tight uppercase text-gray-900 mt-0.5 leading-tight">
                      {activeModelName}
                    </div>
                    {getCat(activeModelName) !== 'umumiy' && (
                      <span className="inline-block mt-0.5 px-2 py-0.2 bg-gray-100 border border-gray-300 rounded text-[9px] font-black uppercase text-gray-700">
                        {getCat(activeModelName) === 'qishki' ? '❄️ Qishki' : '☀️ Yozgi'}
                      </span>
                    )}
                  </div>

                  {/* Body: Conditional based on Label Type */}
                  {labelType === 'barcode' ? (
                    /* Classic Linear Barcode View */
                    <div className="py-3 flex flex-col items-center justify-center gap-2">
                      <div className="flex items-center justify-between w-full px-1">
                        <div className="text-xs font-bold text-gray-700">
                          O'lchami: <span className="text-base font-black text-gray-900">{singleSize}°</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                          1 Juft
                        </span>
                      </div>

                      {/* Barcode Image Container */}
                      <div className="w-full bg-white p-1 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden">
                        {barcodeDataUrl ? (
                          <img 
                            src={barcodeDataUrl} 
                            alt="Klassik Shtrix-kod" 
                            className="w-full h-auto max-h-16 object-contain" 
                          />
                        ) : (
                          <div className="w-full h-12 bg-gray-100 animate-pulse rounded flex items-center justify-center text-[10px] text-gray-400 font-mono">
                            Shtrix-kod tayyorlanmoqda...
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* QR Code View (Series or Single) */
                    <div className="py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        {labelType === 'series' ? (
                          <>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">Seriya Qutisi:</div>
                            <div className="text-sm font-black text-gray-900">{totalSeriesPairs} juft</div>
                            <div className="grid grid-cols-3 gap-0.5 text-[9px] font-mono font-bold bg-gray-100 p-1 rounded border border-gray-200 mt-1">
                              {Object.entries(customSizes).filter(([, q]) => Number(q) > 0).map(([sz, q]) => (
                                <span key={sz}>{sz}°:{q}</span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">O'lchami:</div>
                            <div className="text-2xl font-black text-gray-900">{singleSize}°</div>
                            <div className="text-[10px] font-bold text-gray-600">1 Juft</div>
                          </>
                        )}
                      </div>

                      {/* QR Display */}
                      <div className="shrink-0 p-1 bg-white border border-gray-300 rounded-lg">
                        {qrDataUrl ? (
                          <img src={qrDataUrl} alt="QR Code" className={paperFormat === 'thermal-58' ? "w-20 h-20" : "w-24 h-24"} />
                        ) : (
                          <div className="w-24 h-24 bg-gray-100 animate-pulse rounded flex items-center justify-center text-gray-400">
                            QR...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer: Price & Date */}
                  <div className="border-t-2 border-gray-900 pt-2 flex items-center justify-between text-[10px] font-bold">
                    {showPrice && effectivePrice > 0 ? (
                      <div className="font-black text-xs text-gray-900">
                        {formatUzs(effectivePrice)} <span className="text-[9px] text-gray-500">UZS</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Standart Quti</span>
                    )}
                    {showDate && (
                      <span className="text-gray-500 font-mono text-[9px]">
                        {new Date().toISOString().slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleDownloadCode}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-[var(--bg)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>PNG Saqlash</span>
              </button>

              <button
                type="button"
                onClick={handleDirectPrint}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-md shadow-purple-500/20 transition-all cursor-pointer"
              >
                <Printer size={14} />
                <span>Chop Etish</span>
              </button>
            </div>

          </div>

          {/* Batch Print Queue Card */}
          {batchQueue.length > 0 && (
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-purple-600" />
                  Chop Etish Navbati ({batchQueue.length} ta)
                </h4>
                <button
                  type="button"
                  onClick={() => setBatchQueue([])}
                  className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer"
                >
                  Tozalash
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                {batchQueue.map((item, bIdx) => (
                  <div key={`${item.id || 'bq'}_${bIdx}`} className="p-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black text-[var(--text)]">{item.model}</span>
                      <span className="text-[10px] text-[var(--text3)] ml-2">
                        {item.labelType === 'series' ? 'Seriya Quti' : item.labelType === 'barcode' ? `Shtrix-kod (${item.size}°)` : `${item.size}°`} × {item.quantity} dona
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBatchQueue(prev => prev.filter(x => x.id !== item.id))}
                      className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={async () => {
                  toast.info("Ommaviy yorliqlar tayyorlanmoqda...");
                  await printLabels(batchQueue.map(item => ({
                    model: item.model,
                    labelType: item.labelType,
                    size: item.size,
                    sizesObject: item.sizesObject,
                    price: item.price,
                    showPrice: item.showPrice,
                    showDate: item.showDate,
                    orgName: item.orgName,
                    paperFormat,
                    copies: item.quantity,
                    qrDataUrl: item.qrDataUrl,
                    barcodeDataUrl: item.barcodeDataUrl
                  })));
                  toast.success("Ommaviy yorliqlar printerga yuborildi!");
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer size={15} />
                <span>Barcha {batchQueue.reduce((a, b) => a + b.quantity, 0)} ta Yorliqni Chop Etish</span>
              </button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
