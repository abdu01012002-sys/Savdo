import React, { useState, useMemo } from 'react';
import { X, FileText, Printer, Calendar, User, Phone, MapPin, Download, ArrowLeft, Building2, DollarSign, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Kontragent, Transaction } from '../types';
import { formatUzs, formatCompact, getTodayStr, cn, formatPhoneNumber } from '../lib/utils';
import { exportToExcel } from '../lib/exportUtils';
import { toast } from 'sonner';

interface Props {
  kontragent: Kontragent;
  allTxs: Transaction[];
  onClose: () => void;
}

export default function AktSverka({ kontragent, allTxs, onClose }: Props) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(getTodayStr());

  const filteredTransactions = useMemo(() => {
    return [...allTxs]
      .filter(t => {
        if (startDate && t.sana < startDate) return false;
        if (endDate && t.sana > endDate) return false;
        return true;
      })
      .sort((a, b) => new Date(a.sana + 'T' + (a.vaqt || '00:00')).getTime() - new Date(b.sana + 'T' + (b.vaqt || '00:00')).getTime());
  }, [allTxs, startDate, endDate]);

  let runningBalance = 0;
  let totalChiqimSumma = 0;
  let totalChiqimJuft = 0;
  let totalTolovSumma = 0;
  let totalVozvratJuft = 0;

  const history = filteredTransactions.map((t, idx) => {
    const amount = Number(t.summa || 0);
    const isChiqim = t.amal === 'chiqim';
    const isTolov = t.amal === 'tolov';
    const isKirim = t.amal === 'kirim';

    if (isChiqim) {
      runningBalance += amount;
      totalChiqimSumma += amount;
      totalChiqimJuft += t.soni || 0;
    } else if (isTolov) {
      runningBalance -= amount;
      totalTolovSumma += amount;
    } else if (isKirim) {
      // Vozvrat
      runningBalance -= amount;
      totalVozvratJuft += t.soni || 0;
    }

    return {
      ...t,
      idx: idx + 1,
      debet: isChiqim ? amount : 0,
      kredit: (isTolov || isKirim) ? amount : 0,
      balanceAfter: runningBalance
    };
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const headers = [
      '№',
      'Sana',
      'Vaqt',
      'Hujjat / Operatsiya',
      'Model & O\'lcham',
      'Miqdori (Juft)',
      'Debet / Berilgan tovar (UZS)',
      'Kredit / To\'langan summa (UZS)',
      'Qoldiq Qarz (UZS)',
      'Izoh'
    ];

    const rows = history.map(h => [
      h.idx,
      h.sana,
      h.vaqt || '',
      h.amal === 'chiqim' ? 'Chiqim (Savdo)' : h.amal === 'tolov' ? 'Qarz to\'lovi' : 'Vozvrat (Qaytarish)',
      `${h.model} ${h.olcham && h.olcham !== '-' ? `(${h.olcham})` : ''}`,
      h.soni || 0,
      h.debet,
      h.kredit,
      h.balanceAfter,
      h.izoh || ''
    ]);

    // Total row
    rows.push([
      'JAMI',
      '',
      '',
      '',
      '',
      totalChiqimJuft - totalVozvratJuft,
      totalChiqimSumma,
      totalTolovSumma,
      runningBalance,
      ''
    ]);

    exportToExcel([headers, ...rows], `Akt_Sverka_${kontragent.ism}_${getTodayStr()}`, `Akt-Sverka`);
    toast.success("Akt-Sverka Excel fayli yuklab olindi");
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-zinc-950 z-[250] flex flex-col overflow-y-auto print-receipt-modal print:p-0 print:bg-white print:text-black">
      {/* Top action header (Hidden on print) */}
      <div className="sticky top-0 bg-zinc-900 text-white p-4 px-6 flex flex-wrap items-center justify-between gap-3 shadow-md z-10 print:hidden">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} /> Orqaga
          </button>
          <div className="h-6 w-px bg-zinc-750"></div>
          <div>
            <h2 className="font-black text-sm tracking-tight">Akt-Sverka (Solishtirma Dalolatnoma)</h2>
            <p className="text-[11px] text-zinc-400 font-semibold">{kontragent.ism} • {history.length} ta yozuv</p>
          </div>
        </div>

        {/* Date Filter & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-800 px-2.5 py-1.5 rounded-xl text-xs font-semibold">
            <Calendar size={13} className="text-zinc-400" />
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              className="bg-transparent text-white outline-none text-[11px] cursor-pointer" 
              placeholder="Dan"
            />
            <span className="text-zinc-500">—</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              className="bg-transparent text-white outline-none text-[11px] cursor-pointer" 
              placeholder="Gacha"
            />
          </div>

          <button 
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Download size={14} /> Excel
          </button>

          <button 
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-500/20"
          >
            <Printer size={15} /> Chop etish (PDF)
          </button>
        </div>
      </div>

      {/* Main Printable Document Area */}
      <div className="max-w-4xl mx-auto w-full p-6 sm:p-10 flex flex-col gap-6 text-zinc-900 dark:text-zinc-100 print:text-black print:p-0">
        
        {/* Factory Header */}
        <div className="border-b-2 border-zinc-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">F</span>
              <span className="font-black text-xl tracking-wider uppercase text-zinc-900 dark:text-zinc-100 print:text-black">
                «FALAK SHOE» MChJ
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-bold mt-1">
              Erkaklar va bolalar poyabzallari ishlab chiqarish va ulgurji savdo fabrikasi
            </p>
          </div>
          <div className="text-left sm:text-right">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-100 print:text-black">
              AKT-SVERKA
            </h1>
            <p className="text-xs font-bold text-zinc-500 mt-0.5">
              Hujjat sanasi: {new Date().toLocaleDateString('uz-UZ')}
            </p>
          </div>
        </div>

        {/* Client & Summary Dossier Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 print:bg-white print:border-zinc-300">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              Kontragent (Mijoz) Ma'lumotlari:
            </h3>
            <p className="font-black text-base text-zinc-900 dark:text-zinc-100 print:text-black">{kontragent.ism}</p>
            {kontragent.tel && <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 print:text-zinc-700 mt-0.5">Tel: {formatPhoneNumber(kontragent.tel)}</p>}
            {kontragent.manzil && <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 print:text-zinc-700">Manzil: {kontragent.manzil}</p>}
            {kontragent.kategoriya && <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 print:text-zinc-700">Toifa: {kontragent.kategoriya}</p>}
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 print:bg-white print:border-zinc-300 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                Joriy Hisob-kitob Yakuniy Qoldig'i:
              </h3>
              <p className={cn(
                "text-2xl sm:text-3xl font-black tracking-tight tabular-nums",
                runningBalance > 0 ? "text-rose-600" : runningBalance < 0 ? "text-emerald-600" : "text-zinc-800 dark:text-zinc-200"
              )}>
                {runningBalance > 0 ? '-' : runningBalance < 0 ? '+' : ''}{formatUzs(Math.abs(runningBalance))} UZS
              </p>
            </div>
            <div className="text-xs font-bold text-zinc-500 mt-2 flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 print:border-zinc-300">
              <span>Berilgan: {formatUzs(totalChiqimSumma)} UZS</span>
              <span>To'langan: {formatUzs(totalTolovSumma)} UZS</span>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-400">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 print:bg-zinc-200 print:text-black font-black uppercase text-[10px] tracking-wider border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="p-3 text-center w-10">№</th>
                <th className="p-3">Sana & Vaqt</th>
                <th className="p-3">Hujjat / Tovar</th>
                <th className="p-3 text-center">Miqdori</th>
                <th className="p-3 text-right">Debet (Berildi)</th>
                <th className="p-3 text-right">Kredit (To'landi)</th>
                <th className="p-3 text-right">Qoldiq Qarz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 print:divide-zinc-300 font-medium">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-zinc-400 font-bold">
                    Tanlangan oraliqda tranzaksiyalar mavjud emas
                  </td>
                </tr>
              ) : (
                history.map((t) => (
                  <tr key={t.id || t.idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 print:bg-transparent">
                    <td className="p-3 text-center text-zinc-400 font-bold">{t.idx}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-bold">{t.sana}</div>
                      <div className="text-[10px] text-zinc-400">{t.vaqt || ''}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-extrabold">{t.model} {t.olcham && t.olcham !== '-' ? `(O'lcham: ${t.olcham})` : ''}</div>
                      <div className="text-[10px] text-zinc-400">{t.izoh || (t.amal === 'chiqim' ? 'Poyabzal xaridi' : t.amal === 'tolov' ? 'Kassaga to\'lov' : 'Vozvrat')}</div>
                    </td>
                    <td className="p-3 text-center font-black">
                      {t.soni ? `${t.soni} j.` : '—'}
                    </td>
                    <td className="p-3 text-right font-black text-rose-600 dark:text-rose-400 print:text-rose-700 tabular-nums">
                      {t.debet > 0 ? `${formatUzs(t.debet)} UZS` : '—'}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400 print:text-emerald-700 tabular-nums">
                      {t.kredit > 0 ? `${formatUzs(t.kredit)} UZS` : '—'}
                    </td>
                    <td className="p-3 text-right font-black text-zinc-900 dark:text-zinc-100 print:text-black tabular-nums">
                      {formatUzs(t.balanceAfter)} UZS
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-zinc-100 dark:bg-zinc-800 font-black text-xs text-zinc-900 dark:text-zinc-100 print:bg-zinc-200 print:text-black border-t-2 border-zinc-300 dark:border-zinc-700">
              <tr>
                <td colSpan={3} className="p-3 uppercase">JAMI ORALIQ YAKUNI:</td>
                <td className="p-3 text-center">{totalChiqimJuft - totalVozvratJuft} juft</td>
                <td className="p-3 text-right text-rose-600 dark:text-rose-400">{formatUzs(totalChiqimSumma)} UZS</td>
                <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">{formatUzs(totalTolovSumma)} UZS</td>
                <td className="p-3 text-right text-base">{formatUzs(runningBalance)} UZS</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures for Print */}
        <div className="mt-8 pt-6 border-t border-zinc-300 dark:border-zinc-700 flex justify-between items-end text-xs font-bold print:block">
          <div className="flex flex-col gap-8">
            <span>Taqdim etuvchi: «FALAK SHOE» MChJ</span>
            <span className="border-b border-zinc-400 w-48 pb-1">Imzo: _________________</span>
          </div>
          <div className="flex flex-col gap-8 text-right">
            <span>Qabul qiluvchi: {kontragent.ism}</span>
            <span className="border-b border-zinc-400 w-48 pb-1">Imzo: _________________</span>
          </div>
        </div>

      </div>
    </div>
  );
}
