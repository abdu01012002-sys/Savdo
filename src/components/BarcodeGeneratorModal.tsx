import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Printer, 
  QrCode, 
  Barcode, 
  Copy, 
  Download, 
  CheckCircle2, 
  Layers, 
  Tag, 
  Sparkles,
  Grid
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatCompact } from '../lib/utils';
import { printLabels } from '../lib/labelPrintUtil';

interface BarcodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: string;
  price?: number;
  availableSizes?: string[];
}

export const BarcodeGeneratorModal: React.FC<BarcodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  model,
  price = 0,
  availableSizes = ['39', '40', '41', '42', '43', '44']
}) => {
  const [labelType, setLabelType] = useState<'single_size' | 'series_qr' | 'model_only'>('series_qr');
  const [paperFormat, setPaperFormat] = useState<'thermal-80' | 'thermal-82x20' | 'thermal-58'>('thermal-80');
  const [selectedSize, setSelectedSize] = useState<string>('41');
  const [seriesCounts, setSeriesCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    availableSizes.forEach(sz => {
      initial[sz] = sz === '41' || sz === '42' ? 2 : 1;
    });
    return initial;
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [printCopies, setPrintCopies] = useState<number>(1);

  // Generate payload string
  const getPayloadString = () => {
    if (labelType === 'series_qr') {
      const filteredSizes: Record<string, number> = {};
      Object.entries(seriesCounts).forEach(([sz, qty]) => {
        if (qty > 0) filteredSizes[sz] = qty;
      });
      return JSON.stringify({
        model,
        sizes: filteredSizes,
        price: price > 0 ? price : undefined
      });
    } else if (labelType === 'single_size') {
      return `${model}|${selectedSize}`;
    } else {
      return model;
    }
  };

  useEffect(() => {
    if (!isOpen || !model) return;
    const payload = getPayloadString();
    QRCode.toDataURL(payload, {
      width: 260,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }).then(url => {
      setQrDataUrl(url);
    }).catch(err => {
      console.error("QR Code generate error:", err);
    });
  }, [isOpen, model, labelType, selectedSize, seriesCounts, price]);

  if (!isOpen) return null;

  const totalSeriesQuantity = Object.values(seriesCounts).reduce((a, b) => a + Number(b || 0), 0);

  const handlePrint = async () => {
    toast.info("Chop etishga tayyorlanmoqda...");
    await printLabels({
      model,
      labelType: labelType === 'series_qr' ? 'series' : 'single',
      size: selectedSize,
      sizesObject: seriesCounts,
      price,
      showPrice: price > 0,
      showDate: true,
      paperFormat: paperFormat,
      copies: printCopies,
      qrDataUrl
    });
  };

  const handleCopyCode = () => {
    const payload = getPayloadString();
    navigator.clipboard.writeText(payload);
    toast.success("Kodni nusxalandi!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)] leading-tight">Yorliq & QR-kod Generatori</h3>
              <p className="text-[11px] text-[var(--text3)]">Poyabzal qutilari va seriyalar uchun yorliq bosish</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Label Type Selector */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl">
            <button
              onClick={() => setLabelType('series_qr')}
              className={cn(
                "py-2 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center gap-1",
                labelType === 'series_qr'
                  ? "bg-[var(--bg2)] text-purple-600 dark:text-purple-400 shadow-xs border border-[var(--border)]"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <Layers className="w-4 h-4" />
              <span>Karobka (Seriya)</span>
            </button>

            <button
              onClick={() => setLabelType('single_size')}
              className={cn(
                "py-2 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center gap-1",
                labelType === 'single_size'
                  ? "bg-[var(--bg2)] text-purple-600 dark:text-purple-400 shadow-xs border border-[var(--border)]"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <Tag className="w-4 h-4" />
              <span>Dona Razmer</span>
            </button>

            <button
              onClick={() => setLabelType('model_only')}
              className={cn(
                "py-2 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center gap-1",
                labelType === 'model_only'
                  ? "bg-[var(--bg2)] text-purple-600 dark:text-purple-400 shadow-xs border border-[var(--border)]"
                  : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <Barcode className="w-4 h-4" />
              <span>Faqat Model</span>
            </button>
          </div>

          {/* Size Pickers for Single Size */}
          {labelType === 'single_size' && (
            <div className="space-y-1.5 bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)]">
              <label className="text-[11px] font-bold text-[var(--text3)] block">O'lchamni tanlang:</label>
              <div className="flex flex-wrap gap-2">
                {availableSizes.map(sz => (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(sz)}
                    className={cn(
                      "w-10 h-10 rounded-xl font-black text-xs transition-all cursor-pointer border",
                      selectedSize === sz
                        ? "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/20"
                        : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text)] hover:border-purple-500/40"
                    )}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Series Quantity Breakdown Configurator */}
          {labelType === 'series_qr' && (
            <div className="space-y-2 bg-[var(--bg)] p-3 rounded-2xl border border-[var(--border)]">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text2)]">
                <span>Karobkadagi o'lchamlar taqsimoti:</span>
                <span className="text-purple-600 font-black">Jami: {totalSeriesQuantity} juft</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {availableSizes.map(sz => (
                  <div key={sz} className="flex flex-col items-center bg-[var(--bg2)] p-1.5 rounded-xl border border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text3)]">{sz}</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={seriesCounts[sz] ?? 0}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setSeriesCounts(prev => ({ ...prev, [sz]: Math.max(0, val) }));
                      }}
                      className="w-full text-center font-black text-xs bg-transparent text-[var(--text)] py-0.5 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paper Format Selector */}
          <div className="space-y-1 bg-[var(--bg)] p-2.5 rounded-2xl border border-[var(--border)]">
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)] mb-1">
              <span>Printer formati:</span>
              <span className="text-purple-600 font-extrabold">{paperFormat === 'thermal-80' ? '80×60 mm' : paperFormat === 'thermal-82x20' ? '82×20 mm (20-82 mm)' : '58×40 mm'}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'thermal-80', label: '80×60 mm' },
                { id: 'thermal-82x20', label: '82×20 mm (20-82)' },
                { id: 'thermal-58', label: '58×40 mm' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPaperFormat(f.id as any)}
                  className={cn(
                    "py-1.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer border text-center",
                    paperFormat === f.id
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Label Preview Card (Ready for Thermal Sticker Printing) */}
          <div className="flex flex-col items-center justify-center p-4 bg-white text-gray-900 rounded-2xl border-2 border-dashed border-gray-300 shadow-inner">
            <div className="w-full max-w-[280px] bg-white p-3 border-2 border-gray-900 rounded-xl flex flex-col items-center text-center shadow-md">
              
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">OMBOR PRO • FACTORY</div>
              <div className="text-base font-black text-gray-900 leading-tight mt-0.5">{model}</div>
              
              {labelType === 'single_size' && (
                <div className="mt-1 px-3 py-0.5 bg-gray-900 text-white rounded-lg font-black text-sm">
                  O'LCHAM: {selectedSize}
                </div>
              )}

              {labelType === 'series_qr' && (
                <div className="mt-1 text-[11px] font-bold text-gray-700 font-mono">
                  {Object.entries(seriesCounts)
                    .filter(([_, q]) => q > 0)
                    .map(([s, q]) => `${s}:${q}`)
                    .join(' | ')}
                  <span className="ml-1 text-[10px] font-black text-gray-900">({totalSeriesQuantity} juft)</span>
                </div>
              )}

              {/* QR Image */}
              {qrDataUrl && (
                <img 
                  src={qrDataUrl} 
                  alt="QR Code" 
                  className="w-36 h-36 my-2 object-contain"
                />
              )}

              {price > 0 && (
                <div className="text-xs font-black text-gray-900">
                  {formatCompact(price)} UZS
                </div>
              )}

              <div className="text-[9px] font-mono text-gray-500 truncate w-full mt-1">
                {getPayloadString()}
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between gap-3">
          <button
            onClick={handleCopyCode}
            className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--text2)] bg-[var(--bg2)] hover:bg-[var(--bg)] border border-[var(--border)] transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Nusxalash</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-purple-500/20 cursor-pointer flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Yorliqni Chop Etish</span>
          </button>
        </div>

      </div>
    </div>
  );
};
