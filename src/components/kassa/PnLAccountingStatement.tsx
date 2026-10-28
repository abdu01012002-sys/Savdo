import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Receipt, 
  Briefcase, 
  Building2, 
  Truck, 
  Zap, 
  Megaphone, 
  Landmark, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  BarChart3,
  Percent
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { KassaHarakati, KassaBalansi, XarajatKategoriya } from '../../types';
import { XARAJAT_KATEGORIYALARI } from '../../pages/KassaPage';
import { exportKassaMultiSheetExcel } from '../../utils/exportKassaMultiSheetExcel';
import { A4PnLClosingReportModal } from './A4PnLClosingReportModal';
import { toast } from 'sonner';

interface PnLAccountingStatementProps {
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

export const PnLAccountingStatement: React.FC<PnLAccountingStatementProps> = ({
  pnlData,
  kassaBalansi,
  kassaHarakatlari,
  valyutaKursi,
  dateRange,
  startDate,
  endDate
}) => {
  const [isOpExExpanded, setIsOpExExpanded] = useState(true);
  const [currencyMode, setCurrencyMode] = useState<'both' | 'uzs' | 'usd'>('both');
  const [isA4ModalOpen, setIsA4ModalOpen] = useState(false);

  // Format currency helpers
  const formatUzs = (val: number) => Math.round(val).toLocaleString('uz-UZ') + ' UZS';
  const formatUsd = (val: number) => {
    const usd = valyutaKursi > 0 ? val / valyutaKursi : 0;
    return `$ ` + usd.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const getPercentOfRevenue = (val: number) => {
    if (pnlData.jamiSotuvSumma <= 0) return '0.0%';
    return `${((val / pnlData.jamiSotuvSumma) * 100).toFixed(1)}%`;
  };

  const dateLabel = 
    dateRange === 'bugun' ? 'Bugun' :
    dateRange === 'hafta' ? 'Oxirgi 7 kun' :
    dateRange === 'oy' ? 'Shu oy' :
    dateRange === 'yil' ? 'Shu yil' :
    dateRange === 'ixtiyoriy' ? `${startDate || '...'} — ${endDate || '...'}` : 'Barcha davr';

  const handleExport = () => {
    try {
      exportKassaMultiSheetExcel({
        pnlData,
        kassaBalansi,
        kassaHarakatlari,
        valyutaKursi,
        dateRangeLabel: dateLabel,
        startDate,
        endDate,
      });
      toast.success("Professional 3-varaqli Excel hisoboti yuklab olindi!");
    } catch (e: any) {
      toast.error("Excel yaratishda xatolik: " + (e?.message || e));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden p-5 md:p-6 space-y-6">
      
      {/* STATEMENT HEADER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-[var(--text)] tracking-tight">
                P&L (Profit & Loss / Foyda va Zarar Hisoboti)
              </h2>
              <p className="text-xs text-[var(--text3)]">
                Xalqaro buxgalteriya standarti (IFRS / GAAP) bo'yicha to'liq hisobot jadvali
              </p>
            </div>
          </div>
        </div>

        {/* ACTIONS & VIEW CONTROLS */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Valyuta tanlash */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold">
            <button
              onClick={() => setCurrencyMode('both')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyMode === 'both' ? "bg-blue-600 text-white shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              UZS & USD
            </button>
            <button
              onClick={() => setCurrencyMode('uzs')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyMode === 'uzs' ? "bg-blue-600 text-white shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Faqat UZS
            </button>
            <button
              onClick={() => setCurrencyMode('usd')}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                currencyMode === 'usd' ? "bg-blue-600 text-white shadow-xs" : "text-[var(--text3)] hover:text-[var(--text)]"
              )}
            >
              Faqat USD
            </button>
          </div>

          {/* A4 Yopilish Hisoboti (Chop etish / PDF) */}
          <button
            onClick={() => setIsA4ModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
            title="A4 formatdagi ixcham oylik/davriy yopilish hisoboti (P&L - 1 varaq)"
          >
            <Printer className="w-4 h-4" />
            <span>A4 Yopilish Hisoboti</span>
          </button>

          {/* Multi-Sheet Excel Eksport Tugmasi */}
          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Multi-Sheet Excel: 1-varaq P&L, 2-varaq Kassa jurnali, 3-varaq Xarajat tahlili"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel (3-Sheet)</span>
          </button>
        </div>
      </div>

      {/* METADATA STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[var(--bg)] p-3.5 rounded-xl border border-[var(--border)]">
        <div>
          <span className="text-[var(--text3)] block text-[10px] uppercase font-bold">Hisobot Davri:</span>
          <span className="font-extrabold text-[var(--text)]">{dateLabel}</span>
        </div>
        <div>
          <span className="text-[var(--text3)] block text-[10px] uppercase font-bold">Sotilgan Mahsulot:</span>
          <span className="font-extrabold text-blue-500">{pnlData.jamiSotilganJuft.toLocaleString()} juft</span>
        </div>
        <div>
          <span className="text-[var(--text3)] block text-[10px] uppercase font-bold">Dollar Kursi:</span>
          <span className="font-mono font-bold text-[var(--text)]">1$ = {valyutaKursi.toLocaleString()} UZS</span>
        </div>
        <div>
          <span className="text-[var(--text3)] block text-[10px] uppercase font-bold">Sof Foyda Marjasi:</span>
          <span className={cn("font-black", pnlData.sofFoyda >= 0 ? "text-emerald-500" : "text-rose-500")}>
            {pnlData.sofMarja.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* CLEAN INTERNATIONAL ACCOUNTING TABLE */}
      <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-xs bg-[var(--bg)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--bg2)] border-b border-[var(--border)] text-[var(--text3)] font-black uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-[40%]">Buxgalteriya Moddasi (P&L Items)</th>
                {currencyMode !== 'usd' && (
                  <th className="py-3 px-4 text-right">Summa (UZS)</th>
                )}
                {currencyMode !== 'uzs' && (
                  <th className="py-3 px-4 text-right">Ekvivalent (USD)</th>
                )}
                <th className="py-3 px-4 text-right w-[15%]">Tushumga Nisbati (%)</th>
                <th className="py-3 px-4 text-right w-[12%]">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              
              {/* 1. YALPI TUSHUM (GROSS REVENUE) */}
              <tr className="bg-blue-500/5 font-extrabold hover:bg-blue-500/10 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-600 flex items-center justify-center text-xs font-black">
                      1
                    </div>
                    <div>
                      <span className="text-[var(--text)] text-sm font-black">YALPI TUSHUM (Gross Revenue)</span>
                      <span className="block text-[11px] text-[var(--text3)] font-normal">
                        Ombordan sotilgan barcha tovarlar va xizmatlar summasi
                      </span>
                    </div>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                    {formatUzs(pnlData.jamiSotuvSumma)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                    {formatUsd(pnlData.jamiSotuvSumma)}
                  </td>
                )}
                <td className="py-3.5 px-4 text-right font-bold text-[var(--text)]">
                  100.0%
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    KIRIM
                  </span>
                </td>
              </tr>

              {/* 2. MAHSULOTLAR TANNARXI (COGS) */}
              <tr className="bg-amber-500/5 font-semibold hover:bg-amber-500/10 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-amber-500 font-black text-base">-</span>
                    <div>
                      <span className="text-[var(--text)] font-extrabold">Mahsulot Tannarxi (Cost of Goods Sold - COGS)</span>
                      <span className="block text-[11px] text-[var(--text3)] font-normal">
                        Xom-ashyo, ishlab chiqarish xarajatlari va sotilgan partiyalar tannarxi
                      </span>
                    </div>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className="py-3.5 px-4 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">
                    -{formatUzs(pnlData.jamiTannarx)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className="py-3.5 px-4 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">
                    -{formatUsd(pnlData.jamiTannarx)}
                  </td>
                )}
                <td className="py-3.5 px-4 text-right font-bold text-amber-600">
                  {getPercentOfRevenue(pnlData.jamiTannarx)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    TANNARX
                  </span>
                </td>
              </tr>

              {/* 3. YALPI FOYDA (GROSS PROFIT) */}
              <tr className="bg-[var(--bg2)] font-black border-y-2 border-[var(--border)]">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-600 flex items-center justify-center text-xs font-black">
                      =
                    </div>
                    <div>
                      <span className="text-[var(--text)] text-sm font-black">YALPI FOYDA (Gross Profit)</span>
                      <span className="block text-[11px] text-[var(--text3)] font-normal">
                        Yalpi Tushum — Sotilgan mahsulotlar tannarxi
                      </span>
                    </div>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    {formatUzs(pnlData.yalpiFoyda)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    {formatUsd(pnlData.yalpiFoyda)}
                  </td>
                )}
                <td className="py-3.5 px-4 text-right font-black text-indigo-600">
                  {pnlData.yalpiMarja.toFixed(1)}% (Marja)
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                    YALPI
                  </span>
                </td>
              </tr>

              {/* 4. OPERATSION XARAJATLAR (OPEX) HEADER ROW */}
              <tr 
                onClick={() => setIsOpExExpanded(!isOpExExpanded)}
                className="bg-rose-500/5 font-bold hover:bg-rose-500/10 transition-colors cursor-pointer select-none"
              >
                <td className="py-3.5 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-500 font-black text-base">-</span>
                      <div>
                        <span className="text-[var(--text)] font-black">OPERATSION XARAJATLAR (Operating Expenses - OpEx)</span>
                        <span className="block text-[11px] text-[var(--text3)] font-normal">
                          Korxona faoliyatini yurgizish uchun kundalik xarajatlar ({Object.keys(pnlData.xarajatByCat).length} toifa)
                        </span>
                      </div>
                    </div>
                    <button className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-500">
                      {isOpExExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                    -{formatUzs(pnlData.jamiXarajatlarUzs)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                    -{formatUsd(pnlData.jamiXarajatlarUzs)}
                  </td>
                )}
                <td className="py-3.5 px-4 text-right font-bold text-rose-600">
                  {getPercentOfRevenue(pnlData.jamiXarajatlarUzs)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-600 border border-rose-500/20">
                    OPEX
                  </span>
                </td>
              </tr>

              {/* OPEX CATEGORY SUB-ROWS (EXPANDABLE) */}
              {isOpExExpanded && XARAJAT_KATEGORIYALARI.map((cat) => {
                const amount = pnlData.xarajatByCat[cat.id] || 0;
                if (amount === 0) return null;

                const shareOfOpEx = pnlData.jamiXarajatlarUzs > 0 ? (amount / pnlData.jamiXarajatlarUzs) * 100 : 0;
                const IconComponent = cat.icon || Layers;

                return (
                  <tr key={cat.id} className="bg-[var(--bg)] hover:bg-[var(--bg2)] text-[11px] transition-colors">
                    <td className="py-2.5 px-4 pl-10">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded-md", cat.bg, cat.color)}>
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-[var(--text)]">{cat.label}</span>
                        <span className="text-[10px] text-[var(--text3)]">({shareOfOpEx.toFixed(1)}% OpEx)</span>
                      </div>
                    </td>
                    {currencyMode !== 'usd' && (
                      <td className="py-2.5 px-4 text-right font-mono text-[var(--text2)]">
                        -{formatUzs(amount)}
                      </td>
                    )}
                    {currencyMode !== 'uzs' && (
                      <td className="py-2.5 px-4 text-right font-mono text-[var(--text3)]">
                        -{formatUsd(amount)}
                      </td>
                    )}
                    <td className="py-2.5 px-4 text-right text-[var(--text3)]">
                      {getPercentOfRevenue(amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[10px] text-[var(--text3)]">
                      {cat.id}
                    </td>
                  </tr>
                );
              })}

              {/* 5. EBITDA / OPERATSION FOYDA */}
              <tr className="bg-purple-500/5 font-extrabold hover:bg-purple-500/10 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-600 flex items-center justify-center text-xs font-black">
                      =
                    </div>
                    <div>
                      <span className="text-[var(--text)] font-black">EBITDA / Operatsion Foyda (Operating Income)</span>
                      <span className="block text-[11px] text-[var(--text3)] font-normal">
                        Yalpi Foyda — Operatsion Xarajatlar (Amortizatsiya va soliqlardan oldingi foyda)
                      </span>
                    </div>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                    {formatUzs(pnlData.sofFoyda)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className="py-3.5 px-4 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                    {formatUsd(pnlData.sofFoyda)}
                  </td>
                )}
                <td className="py-3.5 px-4 text-right font-bold text-purple-600">
                  {pnlData.sofMarja.toFixed(1)}%
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-600 border border-purple-500/20">
                    EBITDA
                  </span>
                </td>
              </tr>

              {/* 6. SOF FOYDA (NET PROFIT / NET INCOME) - HERO ROW */}
              <tr className={cn(
                "font-black border-t-2 text-sm",
                pnlData.sofFoyda >= 0 
                  ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border-emerald-500" 
                  : "bg-rose-500/15 text-rose-900 dark:text-rose-100 border-rose-500"
              )}>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black shadow-xs",
                      pnlData.sofFoyda >= 0 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                    )}>
                      ★
                    </div>
                    <div>
                      <span className="text-base font-black tracking-tight">SOF FOYDA (Net Profit / Net Income)</span>
                      <span className="block text-xs font-normal opacity-80">
                        Barcha tannarx va operatsion xarajatlar chegirilgandan keyin korxonada qolgan toza foyda
                      </span>
                    </div>
                  </div>
                </td>
                {currencyMode !== 'usd' && (
                  <td className={cn(
                    "py-4 px-4 text-right font-mono font-black text-base",
                    pnlData.sofFoyda >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  )}>
                    {formatUzs(pnlData.sofFoyda)}
                  </td>
                )}
                {currencyMode !== 'uzs' && (
                  <td className={cn(
                    "py-4 px-4 text-right font-mono font-black text-base",
                    pnlData.sofFoyda >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  )}>
                    {formatUsd(pnlData.sofFoyda)}
                  </td>
                )}
                <td className="py-4 px-4 text-right font-black">
                  {pnlData.sofMarja.toFixed(1)}% (Sof Marja)
                </td>
                <td className="py-4 px-4 text-right">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-black shadow-xs",
                    pnlData.sofFoyda >= 0 
                      ? "bg-emerald-500 text-white" 
                      : "bg-rose-500 text-white"
                  )}>
                    {pnlData.sofFoyda >= 0 ? "FOYDA" : "ZARAR"}
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER AUDIT NOTES & QUICK FORMULA EXPLANATION */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-[var(--text3)] bg-[var(--bg)] p-4 rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            Barcha ko'rsatkichlar real vaqt rejimida avtomatik sinxronlanadi. Excel eksport qilish orqali barcha formulalar va jurnallarni yuklab olishingiz mumkin.
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono font-bold text-[var(--text2)] shrink-0">
          <span>Yalpi Marja: <strong>{pnlData.yalpiMarja.toFixed(1)}%</strong></span>
          <span>•</span>
          <span>Sof Marja: <strong className={pnlData.sofFoyda >= 0 ? "text-emerald-500" : "text-rose-500"}>{pnlData.sofMarja.toFixed(1)}%</strong></span>
        </div>
      </div>

      {/* A4 P&L Yopilish Hisoboti Modali */}
      <A4PnLClosingReportModal
        isOpen={isA4ModalOpen}
        onClose={() => setIsA4ModalOpen(false)}
        pnlData={pnlData}
        kassaBalansi={kassaBalansi}
        kassaHarakatlari={kassaHarakatlari}
        valyutaKursi={valyutaKursi}
        dateRange={dateRange}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
};
