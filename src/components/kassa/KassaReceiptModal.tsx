import React, { useState, useRef, useEffect } from 'react';
import { 
  Printer, 
  Send, 
  Copy, 
  Check, 
  X, 
  Receipt, 
  FileText, 
  Layers, 
  Building, 
  Calendar, 
  Clock, 
  User, 
  DollarSign, 
  Share2,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { KassaHarakati, KassaTuri, XarajatKategoriya } from '../../types';
import { numberToWordsUz } from '../../lib/numberToWordsUz';
import { formatUzs, getTodayStr, getNowStr, cn } from '../../lib/utils';
import { usePrint } from '../../hooks/usePrint';
import { toast } from 'sonner';

interface KassaReceiptModalProps {
  isOpen: boolean;
  harakat: KassaHarakati | null;
  valyutaKursi: number;
  onClose: () => void;
}

export const KassaReceiptModal: React.FC<KassaReceiptModalProps> = ({
  isOpen,
  harakat,
  valyutaKursi,
  onClose
}) => {
  const { print, isPrinting } = usePrint();
  const [formatType, setFormatType] = useState<'thermal' | 'official_a4'>('thermal');
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !harakat) return null;

  const isIncome = harakat.tur === 'kirim';
  const orderTitle = isIncome ? "KASSA KIRIM ORDERI (KO-1)" : "KASSA CHIQIM ORDERI (KO-2)";
  const orderNum = `ORD-${harakat.id.replace(/[^0-9]/g, '').slice(-6) || Math.floor(100000 + Math.random() * 900000)}`;
  const amountWords = numberToWordsUz(harakat.summa, harakat.valyuta);

  const kassaNameMap: Record<KassaTuri, string> = {
    naqd_uzs: "Asosiy Naqd Kassa (UZS)",
    naqd_usd: "Valyuta Kassasi (USD $)",
    karta_uzs: "Karta / Terminal (Humo/Uzcard)",
    bank_uzs: "Bank Hisob Raqami"
  };

  // Generate Telegram formatted text
  const generateTelegramSlip = () => {
    const symbol = isIncome ? "🟢 KIRIM KVITANSIYASI" : "🔴 CHIQIM KVITANSIYASI";
    const txt = `${symbol} #${orderNum}
━━━━━━━━━━━━━━━━━━━
🏢 Korxona: "FALAK SHOES" MChJ
📅 Sana/Vaqt: ${harakat.sana} | ${harakat.vaqt || '12:00'}
📂 Kategoriya: ${harakat.kategoriya?.toUpperCase()}
💼 Hamyon: ${kassaNameMap[harakat.kassaTuri] || harakat.kassaTuri}

👤 ${isIncome ? "Topshiruvchi" : "Qabul qiluvchi"}: ${harakat.kimgaKimdan}
💰 Summa: ${harakat.summa.toLocaleString()} ${harakat.valyuta}
${harakat.valyuta === 'USD' ? `💵 Kurs: 1$ = ${harakat.kurs || valyutaKursi} UZS (≈ ${((harakat.summaUzs || harakat.summa * valyutaKursi)).toLocaleString()} UZS)\n` : ''}📝 So'z bilan: ${amountWords}
📌 Asos/Izoh: ${harakat.izoh || "Rasmiy kassa operatsiyasi"}
━━━━━━━━━━━━━━━━━━━
Mas'ul Kassir: ${harakat.xodim || "Kassir"}
Holati: ✅ TASDIQLANGAN`;

    return txt;
  };

  const handleCopyTelegramSlip = () => {
    const text = generateTelegramSlip();
    navigator.clipboard.writeText(text);
    setCopiedTelegram(true);
    toast.success("Telegram kvitansiya matni nusxalandi!");
    setTimeout(() => setCopiedTelegram(false), 2500);
  };

  const handlePrint = () => {
    if (printRef.current) {
      print(printRef, {
        title: orderTitle,
        pageSize: formatType === 'thermal' ? 'thermal-80' : 'A4'
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 print-receipt-modal print:fixed print:inset-0 print:bg-white print:p-0 print:m-0 print:z-[99999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto flex flex-col max-h-[85vh] print-modal-card print:shadow-none print:w-full print:max-w-none print:rounded-none print:h-auto print:block print:border-none"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* TOP BAR / CONTROLS (Hidden during actual print) */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--bg)] no-print sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm",
              isIncome ? "bg-emerald-600" : "bg-rose-600"
            )}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[var(--text)] tracking-tight">
                {isIncome ? "Kirim Kvitansiyasi" : "Chiqim Orderi & Chek"}
              </h3>
              <span className="text-[11px] font-mono text-[var(--text3)]">
                № {orderNum}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Toggle */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] p-1 rounded-xl flex items-center text-xs font-bold">
              <button
                type="button"
                onClick={() => setFormatType('thermal')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  formatType === 'thermal'
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Termo Chek (80mm)</span>
                <span className="sm:hidden">Termo</span>
              </button>
              <button
                type="button"
                onClick={() => setFormatType('official_a4')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  formatType === 'official_a4'
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rasmiy Order (A4)</span>
                <span className="sm:hidden">A4 Order</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg2)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE RECEIPT CONTENT AREA */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-neutral-900/10 dark:bg-black/40 flex justify-center">
          
          {/* FORMAT 1: THERMAL RECEIPT (58mm / 80mm) */}
          {formatType === 'thermal' && (
            <div 
              ref={printRef}
              className="w-full max-w-[340px] bg-white text-black p-5 rounded-2xl shadow-xl font-mono text-xs border border-neutral-300 print-area"
              style={{ color: '#000000', backgroundColor: '#ffffff' }}
            >
              {/* Header */}
              <div className="text-center pb-3 border-b border-dashed border-neutral-400 space-y-1">
                <h2 className="text-base font-black tracking-wider uppercase">FALAK SHOES</h2>
                <p className="text-[10px] text-neutral-600">Poyafzal Ishlab Chiqarish & Savdo</p>
                <div className="text-[11px] font-bold mt-1 bg-neutral-100 py-1 rounded">
                  {orderTitle}
                </div>
                <p className="text-[10px] text-neutral-500">№ {orderNum}</p>
              </div>

              {/* Meta */}
              <div className="py-2.5 border-b border-dashed border-neutral-400 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Sana/Vaqt:</span>
                  <span className="font-bold">{harakat.sana} {harakat.vaqt || '12:00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Kassa:</span>
                  <span className="font-bold text-right truncate max-w-[170px]">{kassaNameMap[harakat.kassaTuri] || harakat.kassaTuri}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Kategoriya:</span>
                  <span className="font-bold">{harakat.kategoriya}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">{isIncome ? "Kimdan:" : "Kimga:"}</span>
                  <span className="font-black text-right truncate max-w-[170px]">{harakat.kimgaKimdan}</span>
                </div>
              </div>

              {/* Amount block */}
              <div className="py-3.5 border-b border-dashed border-neutral-400 text-center space-y-1 bg-neutral-50 rounded my-2 px-2">
                <span className="text-[10px] uppercase text-neutral-500 font-sans font-bold">To'langan Summa:</span>
                <div className="text-xl font-black tracking-tight">
                  {harakat.summa.toLocaleString()} {harakat.valyuta}
                </div>
                {harakat.valyuta === 'USD' && (
                  <div className="text-[10px] text-neutral-600">
                    Kurs: 1$ = {harakat.kurs || valyutaKursi} UZS <br />
                    (≈ {((harakat.summaUzs || harakat.summa * valyutaKursi)).toLocaleString()} UZS)
                  </div>
                )}
                <div className="text-[10px] italic text-neutral-700 font-sans mt-1 leading-tight">
                  "{amountWords}"
                </div>
              </div>

              {/* Izoh */}
              {harakat.izoh && (
                <div className="py-2 border-b border-dashed border-neutral-400 text-[10px] text-neutral-700">
                  <span className="text-neutral-500">Izoh/Asos:</span> {harakat.izoh}
                </div>
              )}

              {/* Signatures */}
              <div className="pt-4 pb-2 text-[10px] space-y-3">
                <div className="flex justify-between items-center">
                  <span>Kassir: {harakat.xodim}</span>
                  <span className="border-b border-neutral-400 w-20 inline-block text-right">______</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{isIncome ? "Topshiruvchi:" : "Qabul qiluvchi:"}</span>
                  <span className="border-b border-neutral-400 w-20 inline-block text-right">______</span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-3 border-t border-dashed border-neutral-400 text-[9px] text-neutral-500 space-y-0.5">
                <p>Kvitansiyani saqlab qo'ying</p>
                <p>Tizim: FALAK ERP Anti-Fraud Protected</p>
                <div className="text-[8px] mt-1 font-mono tracking-widest">*** TASDIQLANDI ***</div>
              </div>
            </div>
          )}

          {/* FORMAT 2: RASMIY A4 KASSA ORDERI (Buxgalteriya standarti) */}
          {formatType === 'official_a4' && (
            <div 
              ref={printRef}
              className="w-full max-w-xl bg-white text-black p-8 rounded-2xl shadow-xl font-sans text-xs border border-neutral-300 print-area"
              style={{ color: '#000000', backgroundColor: '#ffffff' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                <div>
                  <h1 className="text-base font-black tracking-tight">"FALAK SHOES" MChJ</h1>
                  <p className="text-[10px] text-neutral-600">Bosh Kassa va Buxgalteriya Bo'limi</p>
                  <p className="text-[10px] text-neutral-600">STIR: 308912456 | Manzil: Andijon sh.</p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black uppercase bg-neutral-100 border border-neutral-300 px-3 py-1 rounded">
                    {orderTitle}
                  </div>
                  <div className="text-[11px] font-mono font-bold mt-1">№ {orderNum}</div>
                  <div className="text-[10px] text-neutral-500">{harakat.sana} {harakat.vaqt || '12:00'}</div>
                </div>
              </div>

              {/* Main table data */}
              <div className="border border-black mb-4">
                <table className="w-full text-left border-collapse text-[11px]">
                  <tbody>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 w-1/3 border-r border-neutral-300">Operatsiya turi:</td>
                      <td className="p-2 font-black uppercase text-purple-900">{isIncome ? "Kassaga Kirim" : "Kassadan Chiqim / Xarajat"}</td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">{isIncome ? "Kimdan qabul qilindi:" : "Kimga to'landi (Qabul qiluvchi):"}</td>
                      <td className="p-2 font-black text-sm">{harakat.kimgaKimdan}</td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">Xarajat / Daromad toifasi:</td>
                      <td className="p-2 font-bold">{harakat.kategoriya}</td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">Kassa / Hisob raqam:</td>
                      <td className="p-2 font-semibold">{kassaNameMap[harakat.kassaTuri]}</td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">Summa (raqamda):</td>
                      <td className="p-2 font-black text-base text-black">
                        {harakat.summa.toLocaleString()} {harakat.valyuta}
                        {harakat.valyuta === 'USD' && (
                          <span className="text-xs font-normal text-neutral-600 ml-2">
                            (Kurs: {harakat.kurs || valyutaKursi} UZS = {((harakat.summaUzs || harakat.summa * valyutaKursi)).toLocaleString()} UZS)
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">Summa (so'z bilan):</td>
                      <td className="p-2 font-bold italic text-neutral-800">{amountWords}</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-bold bg-neutral-100 border-r border-neutral-300">Asos / Izoh:</td>
                      <td className="p-2 text-neutral-700">{harakat.izoh || "Rejali kassa harakati"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signatures box */}
              <div className="mt-8 pt-4 border-t border-black grid grid-cols-3 gap-4 text-[10px]">
                <div className="space-y-4">
                  <p className="font-bold">Bosh hisobchi / Rahbar:</p>
                  <div className="border-b border-black h-6"></div>
                  <p className="text-[9px] text-neutral-500">(imzo va F.I.Sh)</p>
                </div>
                <div className="space-y-4">
                  <p className="font-bold">Kassir:</p>
                  <div className="border-b border-black h-6 text-center font-bold text-xs">{harakat.xodim}</div>
                  <p className="text-[9px] text-neutral-500">(imzo va F.I.Sh)</p>
                </div>
                <div className="space-y-4">
                  <p className="font-bold">{isIncome ? "Pulni topshirdi:" : "Pulni oldi:"}</p>
                  <div className="border-b border-black h-6"></div>
                  <p className="text-[9px] text-neutral-500">(imzo va F.I.Sh)</p>
                </div>
              </div>

              {/* Stamp area */}
              <div className="mt-6 flex justify-between items-center text-[9px] text-neutral-500">
                <span>M.O'. (Muhr o'rni)</span>
                <span>FALAK ERP Kassa moduli orqali shakllantirildi</span>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM ACTION BUTTONS (Hidden during print) */}
        <div className="p-4 sm:p-5 border-t border-[var(--border)] bg-[var(--bg)] flex flex-wrap items-center justify-between gap-3 no-print sticky bottom-0 z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTelegramSlip}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm shadow-blue-500/20 active:scale-95"
            >
              {copiedTelegram ? <Check className="w-4 h-4 text-emerald-300" /> : <Send className="w-4 h-4" />}
              <span>{copiedTelegram ? "Nusxalandi!" : "Telegram Slip Nusxalash"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[var(--bg2)] hover:bg-[var(--bg3)] text-[var(--text2)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Yopish
            </button>
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-60"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? "Tayyorlanmoqda..." : "Chop Etish (Print)"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
