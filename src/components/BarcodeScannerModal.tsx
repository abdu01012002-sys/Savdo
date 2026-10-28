import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, 
  X, 
  Flashlight, 
  FlashlightOff, 
  SwitchCamera, 
  CheckCircle2, 
  AlertCircle, 
  Barcode, 
  QrCode, 
  Zap, 
  Repeat, 
  Search,
  PackageCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { playScanBeep } from '../utils/audioFeedback';
import { toast } from 'sonner';

export interface ScanResult {
  model: string;
  size?: string;
  quantity?: number;
  sizesObject?: Record<string, number>;
  rawCode: string;
  source: 'qr' | 'barcode' | 'manual';
}

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  availableModels?: string[];
  title?: string;
  description?: string;
  autoCloseOnSuccess?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  availableModels = [],
  title = "Shtrix-kod & QR Skaner",
  description = "Mahsulot qutisi yoki yorlig'idagi shtrix-kod / QR-kodni kameraga qarating",
  autoCloseOnSuccess = true,
}) => {
  const [isStarted, setIsStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorchSupport, setHasTorchSupport] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState<ScanResult | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [scanCount, setScanCount] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = "interactive-barcode-qr-reader";
  const lastScanTimestamp = useRef<number>(0);

  // Parse raw text into structured ScanResult
  const parseBarcodeData = (decodedText: string): ScanResult => {
    const raw = decodedText.trim();

    // 1. Try JSON QR code (e.g., Series / Box package)
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const json = JSON.parse(raw);
        if (json.model) {
          return {
            model: String(json.model).trim(),
            size: json.size ? String(json.size).trim() : undefined,
            quantity: json.quantity ? Number(json.quantity) : 1,
            sizesObject: json.sizes && typeof json.sizes === 'object' ? json.sizes : undefined,
            rawCode: raw,
            source: 'qr'
          };
        }
      } catch (e) {
        // Fall through to plain text parsing
      }
    }

    // 2. Delimited barcode (e.g., "101 Qora|42", "ART-205:41", "102_Jigarrang*40*2")
    const delimiters = ['|', ':', '*', '#', '__'];
    for (const del of delimiters) {
      if (raw.includes(del)) {
        const parts = raw.split(del).map(p => p.trim());
        const modelPart = parts[0];
        const sizePart = parts[1];
        const qtyPart = parts[2] ? parseInt(parts[2], 10) : 1;

        if (modelPart) {
          // Find matching model case-insensitively
          const matchedModel = availableModels.find(
            m => m.toLowerCase() === modelPart.toLowerCase()
          ) || modelPart;

          return {
            model: matchedModel,
            size: sizePart || undefined,
            quantity: !isNaN(qtyPart) && qtyPart > 0 ? qtyPart : 1,
            rawCode: raw,
            source: 'barcode'
          };
        }
      }
    }

    // 3. Size suffixed (e.g., "101-Qora-42")
    const matchSizeSuffix = raw.match(/^(.*)-(\d{2})$/);
    if (matchSizeSuffix) {
      const modelCandidate = matchSizeSuffix[1].trim();
      const sizeCandidate = matchSizeSuffix[2];
      const matchedModel = availableModels.find(
        m => m.toLowerCase() === modelCandidate.toLowerCase()
      ) || modelCandidate;

      return {
        model: matchedModel,
        size: sizeCandidate,
        quantity: 1,
        rawCode: raw,
        source: 'barcode'
      };
    }

    // 4. Exact model name or barcode string match
    const matchedModel = availableModels.find(
      m => m.toLowerCase() === raw.toLowerCase()
    ) || raw;

    return {
      model: matchedModel,
      quantity: 1,
      rawCode: raw,
      source: 'barcode'
    };
  };

  const handleSuccessfulScan = (decodedText: string) => {
    const now = Date.now();
    // Debounce duplicate scans within 1.2s to prevent jitter
    if (now - lastScanTimestamp.current < 1200) {
      return;
    }
    lastScanTimestamp.current = now;

    playScanBeep('success');
    const parsed = parseBarcodeData(decodedText);
    setLastScannedResult(parsed);
    setScanCount(prev => prev + 1);

    onScan(parsed);
    toast.success(`Skanerlandi: ${parsed.model}${parsed.size ? ` (Razmer: ${parsed.size})` : ''}`);

    if (autoCloseOnSuccess && !continuousMode) {
      setTimeout(() => {
        stopScanner();
        onClose();
      }, 400);
    }
  };

  const startScanner = async () => {
    setCameraError(null);
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerElementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF
          ],
          verbose: false
        });
      }

      const config = {
        fps: 20,
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0
      };

      await scannerRef.current.start(
        { facingMode },
        config,
        (decodedText) => {
          handleSuccessfulScan(decodedText);
        },
        () => {
          // Frame scanned without code (benign)
        }
      );

      setIsStarted(true);

      // Check for torch capability
      try {
        const capabilities = scannerRef.current.getRunningTrackCapabilities();
        if ((capabilities as any)?.torch) {
          setHasTorchSupport(true);
        }
      } catch (e) {
        setHasTorchSupport(false);
      }
    } catch (err: any) {
      console.error("Camera init error:", err);
      const errMsg = err?.name === 'NotAllowedError' 
        ? "Kameraga ruxsat berilmadi. Iltimos brauzer sozlamalarida kameraga ruxsat bering."
        : "Kamera ishga tushmadi. Qurilma kamerasini tekshiring yoki kodni qo'lda kiriting.";
      setCameraError(errMsg);
      setIsStarted(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isStarted) {
      try {
        if (isTorchOn) {
          await toggleTorch(false);
        }
        await scannerRef.current.stop();
      } catch (e) {
        console.warn("Stop scanner warning:", e);
      } finally {
        setIsStarted(false);
      }
    }
  };

  const toggleTorch = async (override?: boolean) => {
    if (!scannerRef.current || !isStarted) return;
    const nextState = override !== undefined ? override : !isTorchOn;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }] as any
      });
      setIsTorchOn(nextState);
    } catch (e) {
      console.warn("Torch error:", e);
    }
  };

  const switchCamera = async () => {
    await stopScanner();
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (isOpen) {
      // Small timeout to ensure modal DOM is mounted
      const timer = setTimeout(() => {
        startScanner();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen, facingMode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const parsed = parseBarcodeData(manualInput.trim());
    playScanBeep('success');
    setLastScannedResult(parsed);
    setScanCount(prev => prev + 1);
    onScan(parsed);
    setManualInput('');
    toast.success(`Qo'shildi: ${parsed.model}`);
    if (autoCloseOnSuccess && !continuousMode) {
      stopScanner();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg2)] border-t sm:border border-[var(--border)] rounded-t-[28px] sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[92vh] mt-auto sm:my-auto animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 pb-safe">
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-[var(--text3)]/30 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="px-5 py-3.5 sm:py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)] leading-tight">{title}</h3>
              <p className="text-[11px] text-[var(--text3)]">{description}</p>
            </div>
          </div>
          <button 
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Camera Stream Box */}
        <div className="relative w-full aspect-square bg-black overflow-hidden flex items-center justify-center">
          
          {/* html5-qrcode reader canvas/video container */}
          <div id={readerElementId} className="w-full h-full object-cover" />

          {/* Holographic Aim Overlay */}
          {isStarted && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Target Aim Frame */}
              <div className="relative w-64 h-64 border-2 border-purple-500/60 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                {/* Corner reticles */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-purple-500 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-purple-500 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-purple-500 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-purple-500 rounded-br-lg" />
                
                {/* Animated Laser Scanning Line */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_8px_#a855f7] animate-bounce duration-1000 top-1/2 -translate-y-1/2" />
              </div>

              <div className="mt-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-[11px] font-bold border border-white/20 flex items-center gap-1.5 shadow-lg">
                <Zap className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>Kodni ramka ichiga to'g'rilang</span>
              </div>
            </div>
          )}

          {/* Camera Controls Overlay Bar */}
          {isStarted && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {hasTorchSupport && (
                <button
                  onClick={() => toggleTorch()}
                  className={cn(
                    "p-2.5 rounded-xl backdrop-blur-md transition-all cursor-pointer shadow-lg",
                    isTorchOn 
                      ? "bg-amber-500 text-white shadow-amber-500/30" 
                      : "bg-black/50 text-white/80 hover:bg-black/70 border border-white/20"
                  )}
                  title={isTorchOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
                >
                  {isTorchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                </button>
              )}

              <button
                onClick={switchCamera}
                className="p-2.5 rounded-xl bg-black/50 hover:bg-black/70 text-white/80 border border-white/20 backdrop-blur-md transition-all cursor-pointer shadow-lg"
                title="Kamerani almashtirish (Oldi/Orqa)"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Camera Error / No Permission Display */}
          {cameraError && (
            <div className="absolute inset-0 bg-[var(--bg2)] flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-black text-[var(--text)] mb-1">Kameraga ulanib bo'lmadi</h4>
              <p className="text-xs text-[var(--text3)] mb-4 max-w-xs">{cameraError}</p>
              <button
                onClick={startScanner}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer"
              >
                Qayta urinish
              </button>
            </div>
          )}
        </div>

        {/* Live Scan Results & Mode Bar */}
        <div className="p-4 bg-[var(--bg)] border-t border-[var(--border)] space-y-3">
          
          {/* Quick Mode Switcher & Stats */}
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setContinuousMode(prev => !prev)}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border",
                continuousMode
                  ? "bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400 shadow-xs"
                  : "bg-[var(--bg2)] border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Ketma-ket skanerlash (POS)</span>
            </button>

            {scanCount > 0 && (
              <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {scanCount} ta mahsulot
              </span>
            )}
          </div>

          {/* Last Scanned Item Card */}
          {lastScannedResult && (
            <div className="p-3 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-black text-[var(--text)] truncate">{lastScannedResult.model}</div>
                  <div className="text-[10px] text-[var(--text3)] flex items-center gap-1">
                    {lastScannedResult.size && <span className="font-bold text-purple-500">Razmer: {lastScannedResult.size}</span>}
                    {lastScannedResult.quantity && <span>• Miqdor: {lastScannedResult.quantity} juft</span>}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Muvaffaqiyatli
              </span>
            </div>
          )}

          {/* Manual Input Fallback Form (for handheld barcode readers or keyboard input) */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="Kodni qo'lda kiritish (masalan: 101 Qora|42)..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg2)] border border-[var(--border)] rounded-xl text-xs text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              type="submit"
              disabled={!manualInput.trim()}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Qo'shish</span>
            </button>
          </form>

        </div>

      </div>
    </div>
  );
};
