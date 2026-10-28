import React, { useRef } from 'react';
import { usePrint } from '../../hooks/usePrint';
import { 
  Printer, 
  X, 
  FileText, 
  CheckCircle2, 
  Building2, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Wallet,
  Landmark,
  CreditCard,
  Percent,
  Download
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { KassaBalansi, KassaHarakati } from '../../types';
import { XARAJAT_KATEGORIYALARI } from '../../pages/KassaPage';

interface A4PnLClosingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pnlData: {
    jamiSotuvSumma: number;
    jamiSotilganJuft: number;
    jamiTannarx: number;
    yalpiFoyda: number;
    yalpiMarja: number;
    jamiXarajatlarUzs: number;
    sofFoyda: number;
    sofMarja: number;
    jamiNasiyaQarzlari: number;
    xarajatByCat: Record<string, number>;
    topProfitableModels: Array<{
      model: string;
      pairs: number;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
    }>;
  };
  kassaBalansi: KassaBalansi;
  kassaHarakatlari: KassaHarakati[];
  valyutaKursi: number;
  dateRange: string;
  startDate?: string;
  endDate?: string;
}

export const A4PnLClosingReportModal: React.FC<A4PnLClosingReportModalProps> = ({
  isOpen,
  onClose,
  pnlData,
  kassaBalansi,
  kassaHarakatlari,
  valyutaKursi,
  dateRange,
  startDate,
  endDate
}) => {
  const { print, isPrinting } = usePrint();
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const dateLabel = 
    dateRange === 'bugun' ? 'Bugun' :
    dateRange === 'hafta' ? 'Oxirgi 7 kun' :
    dateRange === 'oy' ? 'Shu oy' :
    dateRange === 'yil' ? 'Shu yil' :
    dateRange === 'ixtiyoriy' ? `${startDate || '...'} — ${endDate || '...'}` : 'Barcha davr';

  const formatUzs = (val: number) => Math.round(val || 0).toLocaleString('uz-UZ') + ' so\'m';
  const formatUsd = (val: number) => {
    const usd = valyutaKursi > 0 ? (val || 0) / valyutaKursi : 0;
    return '$ ' + usd.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const getPercentOfRevenue = (val: number) => {
    if (pnlData.jamiSotuvSumma <= 0) return '0.0%';
    return `${(((val || 0) / pnlData.jamiSotuvSumma) * 100).toFixed(1)}%`;
  };

  const handlePrint = () => {
    if (reportRef.current) {
      print(reportRef, {
        title: `P&L Moliyaviy Hisobot - ${dateLabel}`,
        pageSize: 'A4',
        orientation: 'portrait'
      });
    }
  };

  const totalAssetsUzs = (kassaBalansi.naqd_uzs || 0) + 
    ((kassaBalansi.naqd_usd || 0) * valyutaKursi) + 
    (kassaBalansi.karta_uzs || 0) + 
    (kassaBalansi.bank_uzs || 0);

  const currentDateFormatted = new Date().toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[96vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* MODAL CONTROL HEADER (Hidden during print) */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                A4 Yopilish Hisoboti (P&L Financial Closing Statement)
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  1-Varaq A4
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A4 standartida chop etish va PDF saqlash uchun ixchamlangan buxgalteriya hujjati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? "Tayyorlanmoqda..." : "A4 Chop Etish / PDF"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE A4 SHEET WRAPPER */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 flex justify-center bg-slate-200/70 dark:bg-slate-950">
          
          {/* THE EXACT A4 SHEET */}
          <div 
            ref={reportRef} 
            id="a4-pnl-sheet"
            className="bg-white text-slate-900 w-full max-w-[210mm] min-h-[290mm] p-6 sm:p-8 shadow-xl rounded-lg border border-slate-300 relative flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:min-h-0 print:rounded-none"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* INLINE PRINT CSS */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm;
                }
                body {
                  background: #fff !important;
                  color: #000 !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                nav, header, aside, .print\\:hidden, #app-topbar, #app-sidebar {
                  display: none !important;
                }
                #a4-pnl-sheet {
                  width: 100% !important;
                  max-width: 100% !important;
                  padding: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                }
              }
            `}} />

            <div>
              {/* 1. DOCUMENT HEADER */}
              <div className="border-b-2 border-slate-900 pb-3 mb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                      FALAK SHOES — KORXONA MOLIYAVIY HISOBOTI
                    </h1>
                    <p className="text-xs font-bold text-slate-600">
                      Oyoq kiyim ishlab chiqarish va ulgurji savdo majmuasi
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Foyda va Zararlar (P&L / Profit and Loss Closing Statement)
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded border border-slate-300 inline-block mb-1">
                      DAVR: {dateLabel.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Chiqarilgan vaqt: {currentDateFormatted}
                    </div>
                    <div className="text-[10px] font-mono text-slate-600">
                      1 USD = {valyutaKursi.toLocaleString()} UZS
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SUMMARY KPI 4-BOX METRICS */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="bg-slate-50 border border-slate-300 p-2 rounded">
                  <span className="block text-[9px] uppercase font-bold text-slate-500">1. Yalpi Tushum</span>
                  <span className="text-xs font-black text-blue-700 font-mono block">
                    {formatUzs(pnlData.jamiSotuvSumma)}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">{formatUsd(pnlData.jamiSotuvSumma)}</span>
                </div>

                <div className="bg-slate-50 border border-slate-300 p-2 rounded">
                  <span className="block text-[9px] uppercase font-bold text-slate-500">2. Tannarx (COGS)</span>
                  <span className="text-xs font-black text-amber-700 font-mono block">
                    {formatUzs(pnlData.jamiTannarx)}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">{getPercentOfRevenue(pnlData.jamiTannarx)} ulush</span>
                </div>

                <div className="bg-slate-50 border border-slate-300 p-2 rounded">
                  <span className="block text-[9px] uppercase font-bold text-slate-500">3. OpEx Xarajatlar</span>
                  <span className="text-xs font-black text-rose-700 font-mono block">
                    {formatUzs(pnlData.jamiXarajatlarUzs)}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">{getPercentOfRevenue(pnlData.jamiXarajatlarUzs)} ulush</span>
                </div>

                <div className={cn(
                  "border-2 p-2 rounded",
                  pnlData.sofFoyda >= 0 ? "bg-emerald-50 border-emerald-600 text-emerald-950" : "bg-rose-50 border-rose-600 text-rose-950"
                )}>
                  <span className="block text-[9px] uppercase font-extrabold opacity-80">4. Sof Foyda (Net)</span>
                  <span className={cn(
                    "text-xs font-black font-mono block",
                    pnlData.sofFoyda >= 0 ? "text-emerald-700" : "text-rose-700"
                  )}>
                    {formatUzs(pnlData.sofFoyda)}
                  </span>
                  <span className="text-[9px] font-bold">Marja: {pnlData.sofMarja.toFixed(1)}%</span>
                </div>
              </div>

              {/* 3. MAIN P&L ACCOUNTING TABLE (COMPACT SINGLE A4 FIT) */}
              <div className="border border-slate-300 rounded overflow-hidden mb-3">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px] tracking-wider">
                      <th className="py-1.5 px-2.5 w-6 text-center">#</th>
                      <th className="py-1.5 px-2">Buxgalteriya Moddasi (P&L Account Item)</th>
                      <th className="py-1.5 px-2 text-right">Summa (UZS)</th>
                      <th className="py-1.5 px-2 text-right">Ekvivalent (USD)</th>
                      <th className="py-1.5 px-2 text-right">Tushumga %</th>
                      <th className="py-1.5 px-2 text-center">Turi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    
                    {/* 1. YALPI TUSHUM */}
                    <tr className="bg-blue-50/50 font-bold">
                      <td className="py-1.5 px-2 text-center text-blue-800 font-black">1</td>
                      <td className="py-1.5 px-2 text-slate-900 font-black">
                        YALPI TUSHUM (Gross Sales Revenue)
                        <span className="block text-[8.5px] font-normal text-slate-500">
                          Jami sotilgan: {pnlData.jamiSotilganJuft.toLocaleString()} juft poyabzal
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-blue-900">{formatUzs(pnlData.jamiSotuvSumma)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-700">{formatUsd(pnlData.jamiSotuvSumma)}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-800">100.0%</td>
                      <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[8px] font-bold">KIRIM</span></td>
                    </tr>

                    {/* 2. TANNARX */}
                    <tr className="bg-amber-50/30">
                      <td className="py-1.5 px-2 text-center text-amber-800 font-bold">2</td>
                      <td className="py-1.5 px-2 text-slate-900 font-semibold pl-4">
                        - Mahsulot Tannarxi (Cost of Goods Sold - COGS)
                        <span className="block text-[8.5px] font-normal text-slate-500">Xomashyo, furnitura va ishlab chiqarish partiyalari</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-800">-{formatUzs(pnlData.jamiTannarx)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-600">-{formatUsd(pnlData.jamiTannarx)}</td>
                      <td className="py-1.5 px-2 text-right text-amber-800 font-bold">{getPercentOfRevenue(pnlData.jamiTannarx)}</td>
                      <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[8px] font-bold">TANNARX</span></td>
                    </tr>

                    {/* 3. YALPI FOYDA */}
                    <tr className="bg-slate-100 font-black border-y border-slate-300">
                      <td className="py-1.5 px-2 text-center text-indigo-800 font-black">=</td>
                      <td className="py-1.5 px-2 text-slate-900 font-black">
                        YALPI FOYDA (Gross Profit)
                        <span className="block text-[8.5px] font-normal text-slate-600">Tushum — Tannarx</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-indigo-900">{formatUzs(pnlData.yalpiFoyda)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-800">{formatUsd(pnlData.yalpiFoyda)}</td>
                      <td className="py-1.5 px-2 text-right font-black text-indigo-900">{pnlData.yalpiMarja.toFixed(1)}%</td>
                      <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded text-[8px] font-bold">YALPI</span></td>
                    </tr>

                    {/* 4. OPEX SUMMARY HEADER */}
                    <tr className="bg-rose-50/40 font-bold">
                      <td className="py-1.5 px-2 text-center text-rose-800 font-black">3</td>
                      <td className="py-1.5 px-2 text-slate-900 font-bold">
                        - OPERATSION XARAJATLAR (OpEx)
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-rose-800">-{formatUzs(pnlData.jamiXarajatlarUzs)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-600">-{formatUsd(pnlData.jamiXarajatlarUzs)}</td>
                      <td className="py-1.5 px-2 text-right text-rose-800 font-bold">{getPercentOfRevenue(pnlData.jamiXarajatlarUzs)}</td>
                      <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded text-[8px] font-bold">OPEX</span></td>
                    </tr>

                    {/* OPEX ITEMIZED BREAKDOWN */}
                    {XARAJAT_KATEGORIYALARI.map((cat, idx) => {
                      const amount = pnlData.xarajatByCat[cat.id] || 0;
                      if (amount === 0) return null;

                      return (
                        <tr key={cat.id} className="text-[9.5px]">
                          <td className="py-1 px-2 text-center text-slate-400">3.{idx + 1}</td>
                          <td className="py-1 px-2 pl-6 text-slate-700">
                            • {cat.label}
                          </td>
                          <td className="py-1 px-2 text-right font-mono text-slate-700">-{formatUzs(amount)}</td>
                          <td className="py-1 px-2 text-right font-mono text-slate-500">-{formatUsd(amount)}</td>
                          <td className="py-1 px-2 text-right text-slate-500">{getPercentOfRevenue(amount)}</td>
                          <td className="py-1 px-2 text-center text-[8px] text-slate-400">{cat.id}</td>
                        </tr>
                      );
                    })}

                    {/* 5. EBITDA */}
                    <tr className="bg-purple-50/50 font-bold">
                      <td className="py-1.5 px-2 text-center text-purple-800 font-black">=</td>
                      <td className="py-1.5 px-2 text-slate-900 font-extrabold">
                        EBITDA / Operatsion Foyda (Operating Income)
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-extrabold text-purple-900">{formatUzs(pnlData.sofFoyda)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-700">{formatUsd(pnlData.sofFoyda)}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-purple-900">{pnlData.sofMarja.toFixed(1)}%</td>
                      <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded text-[8px] font-bold">EBITDA</span></td>
                    </tr>

                    {/* 6. SOF FOYDA (FINAL HERO ROW) */}
                    <tr className={cn(
                      "font-black border-t-2 text-xs",
                      pnlData.sofFoyda >= 0 ? "bg-emerald-100/70 border-emerald-600 text-emerald-950" : "bg-rose-100/70 border-rose-600 text-rose-950"
                    )}>
                      <td className="py-2 px-2 text-center text-sm font-black">★</td>
                      <td className="py-2 px-2">
                        <span className="font-black text-xs uppercase tracking-tight">SOF FOYDA (NET PROFIT / NET INCOME)</span>
                        <span className="block text-[8px] font-normal opacity-80">Barcha xarajat va tannarxlardan keyingi sof qoldiq</span>
                      </td>
                      <td className={cn(
                        "py-2 px-2 text-right font-mono font-black text-xs",
                        pnlData.sofFoyda >= 0 ? "text-emerald-900" : "text-rose-900"
                      )}>
                        {formatUzs(pnlData.sofFoyda)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-xs">{formatUsd(pnlData.sofFoyda)}</td>
                      <td className="py-2 px-2 text-right font-black text-xs">{pnlData.sofMarja.toFixed(1)}%</td>
                      <td className="py-2 px-2 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black text-white",
                          pnlData.sofFoyda >= 0 ? "bg-emerald-600" : "bg-rose-600"
                        )}>
                          {pnlData.sofFoyda >= 0 ? "SOF FOYDA" : "ZARAR"}
                        </span>
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>

              {/* 4. KASSA VA HAMYONLAR HOLATI SNAPSHOT */}
              <div className="bg-slate-50 border border-slate-300 rounded p-2.5 mb-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-1.5">
                  <span className="text-[10px] font-black uppercase text-slate-700 flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-slate-600" />
                    Kassa Hamyonlari Qoldiqlari (Balans Snapshot)
                  </span>
                  <span className="text-[10px] font-black text-slate-900 font-mono">
                    Jami Likvid Aktivlar: {formatUzs(totalAssetsUzs)}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[9.5px]">
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="block text-slate-500 font-semibold text-[8.5px]">1. Naqd Pul (UZS):</span>
                    <span className="font-mono font-bold text-slate-900">{formatUzs(kassaBalansi.naqd_uzs || 0)}</span>
                  </div>
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="block text-slate-500 font-semibold text-[8.5px]">2. Naqd Pul (USD):</span>
                    <span className="font-mono font-bold text-slate-900">${(kassaBalansi.naqd_usd || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="block text-slate-500 font-semibold text-[8.5px]">3. Karta (Humo/Uzcard):</span>
                    <span className="font-mono font-bold text-slate-900">{formatUzs(kassaBalansi.karta_uzs || 0)}</span>
                  </div>
                  <div className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="block text-slate-500 font-semibold text-[8.5px]">4. Bank Hisob Raqami:</span>
                    <span className="font-mono font-bold text-slate-900">{formatUzs(kassaBalansi.bank_uzs || 0)}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* 5. OFFICIAL SIGNATURES & STAMP SECTION */}
            <div className="border-t-2 border-slate-800 pt-3 mt-auto">
              <div className="grid grid-cols-3 gap-4 text-[10px]">
                <div>
                  <span className="block font-bold text-slate-700">Rahbar / Direktor:</span>
                  <div className="h-9 border-b border-dashed border-slate-400 flex items-end">
                    <span className="text-[9px] text-slate-400 italic">imzo & F.I.SH</span>
                  </div>
                </div>
                <div>
                  <span className="block font-bold text-slate-700">Bosh Hisobchi / Kassir:</span>
                  <div className="h-9 border-b border-dashed border-slate-400 flex items-end">
                    <span className="text-[9px] text-slate-400 italic">imzo & F.I.SH</span>
                  </div>
                </div>
                <div className="text-center">
                  <span className="block font-bold text-slate-700">Muhr o'rni (M.O'):</span>
                  <div className="h-10 w-16 border border-slate-300 rounded mx-auto flex items-center justify-center text-[8px] text-slate-400 uppercase font-mono">
                    M.O'
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[8px] text-slate-400 mt-2">
                <span>Hujjat tizim orqali avtomatik shakllantirildi. Buxgalteriya nazorati tasdiqlangan.</span>
                <span>Falak Shoes ERP • Sahifa 1 / 1 (A4)</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
