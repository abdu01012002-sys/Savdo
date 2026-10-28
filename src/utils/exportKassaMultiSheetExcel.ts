import * as XLSX from 'xlsx';
import { KassaHarakati, KassaBalansi, XarajatKategoriya } from '../types';
import { XARAJAT_KATEGORIYALARI } from '../pages/KassaPage';

export interface PnLExportData {
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
}

export interface ExportMultiSheetOptions {
  pnlData: PnLExportData;
  kassaBalansi: KassaBalansi;
  kassaHarakatlari: KassaHarakati[];
  valyutaKursi: number;
  dateRangeLabel: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Xalqaro buxgalteriya standarti bo'yicha Professional Multi-Sheet Excel (XLSX) eksport qilish
 * 1-varaq: Umumiy balans va P&L xulosasi
 * 2-varaq: Kassa harakatlari to'liq jurnali
 * 3-varaq: Xarajatlar kategoriyalari bo'yicha tahlil
 */
export function exportKassaMultiSheetExcel(options: ExportMultiSheetOptions) {
  const {
    pnlData,
    kassaBalansi,
    kassaHarakatlari,
    valyutaKursi,
    dateRangeLabel,
    startDate,
    endDate,
  } = options;

  const wb = XLSX.utils.book_new();
  const today = new Date().toISOString().split('T')[0];
  const formattedTime = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  // Jami Kassa Aktivlari
  const naqdUzs = Number(kassaBalansi.naqd_uzs || 0);
  const naqdUsd = Number(kassaBalansi.naqd_usd || 0);
  const kartaUzs = Number(kassaBalansi.karta_uzs || 0);
  const bankUzs = Number(kassaBalansi.bank_uzs || 0);
  const jamiAktivUzs = naqdUzs + (naqdUsd * valyutaKursi) + kartaUzs + bankUzs;
  const jamiAktivUsd = valyutaKursi > 0 ? jamiAktivUzs / valyutaKursi : 0;

  // ==========================================
  // 1-VARAQ: UMUMIY BALANS VA P&L XULOSASI
  // ==========================================
  const sheet1Data: any[] = [
    ["KORXONA MOLIYAVIY HISOBOTI & P&L (FOYDA VA ZARAR HISOBOTI)"],
    ["Hisobot Sanasi:", `${today} ${formattedTime}`],
    ["Hisobot Davri:", dateRangeLabel + (startDate && endDate ? ` (${startDate} - ${endDate})` : '')],
    ["Amaldagi Dollar Kursi:", `1 USD = ${valyutaKursi.toLocaleString()} UZS`],
    [],
    ["--- I. KASSA VA LIKVID AKTIVLAR BALANSI ---", "", "", ""],
    ["Hamyon / Hisob Turi", "Valyuta", "Qoldiq Summa", "UZS Ekvivalenti"],
    ["Naqd Pul (So'm)", "UZS", naqdUzs, naqdUzs],
    ["Naqd Pul (Dollar)", "USD", naqdUsd, naqdUsd * valyutaKursi],
    ["Plastik Karta (Humo/Uzcard)", "UZS", kartaUzs, kartaUzs],
    ["Bank Hisob Raqami (Hisob-kitob)", "UZS", bankUzs, bankUzs],
    ["JAMI LIKVID KASSA AKTIVLARI", "UZS / USD", `${jamiAktivUsd.toFixed(2)} USD`, jamiAktivUzs],
    [],
    ["--- II. P&L FOYDA VA ZARAR HISOBOTI (XALQARO BUXGALTERIYA STANDARTI) ---", "", "", ""],
    ["Modda / Ko'rsatkich Nomi", "Qiymati (UZS)", "Qiymati (USD)", "Tushumga Nisbatan Ulushi (%)"],
    ["1. YALPI TUSHUM (Gross Revenue)", pnlData.jamiSotuvSumma, pnlData.jamiSotuvSumma / valyutaKursi, "100.0%"],
    ["  - Sotilgan poyafzallar hajmi", `${pnlData.jamiSotilganJuft.toLocaleString()} juft`, "-", "-"],
    ["2. MAHSULOTLAR TANNARXI (COGS)", pnlData.jamiTannarx, pnlData.jamiTannarx / valyutaKursi, pnlData.jamiSotuvSumma > 0 ? `${((pnlData.jamiTannarx / pnlData.jamiSotuvSumma) * 100).toFixed(1)}%` : "0.0%"],
    ["3. YALPI FOYDA (Gross Profit)", pnlData.yalpiFoyda, pnlData.yalpiFoyda / valyutaKursi, `${pnlData.yalpiMarja.toFixed(1)}%`],
    [],
    ["4. OPERATSION XARAJATLAR (OpEx)", pnlData.jamiXarajatlarUzs, pnlData.jamiXarajatlarUzs / valyutaKursi, pnlData.jamiSotuvSumma > 0 ? `${((pnlData.jamiXarajatlarUzs / pnlData.jamiSotuvSumma) * 100).toFixed(1)}%` : "0.0%"],
  ];

  // OpEx kategoriyalari
  XARAJAT_KATEGORIYALARI.forEach(cat => {
    const sumUzs = pnlData.xarajatByCat[cat.id] || 0;
    if (sumUzs > 0) {
      const shareOfRev = pnlData.jamiSotuvSumma > 0 ? ((sumUzs / pnlData.jamiSotuvSumma) * 100).toFixed(1) + "%" : "0.0%";
      sheet1Data.push([`  • ${cat.label}`, sumUzs, sumUzs / valyutaKursi, shareOfRev]);
    }
  });

  sheet1Data.push(
    [],
    ["5. OPERATSION FOYDA / EBITDA", pnlData.sofFoyda, pnlData.sofFoyda / valyutaKursi, `${pnlData.sofMarja.toFixed(1)}%`],
    ["6. SOF FOYDA (Net Profit / Net Income)", pnlData.sofFoyda, pnlData.sofFoyda / valyutaKursi, `${pnlData.sofMarja.toFixed(1)}%`],
    [],
    ["--- III. DEBITORLIK VA BOZOR TALABLARI ---", "", "", ""],
    ["Ko'rsatkich", "Qiymati (UZS)", "Qiymati (USD)", "Izoh"],
    ["Mijozlar Nasiya Qarzlari (Debitorlik)", pnlData.jamiNasiyaQarzlari, pnlData.jamiNasiyaQarzlari / valyutaKursi, "Bozordan yig'ilishi kutilayotgan mablag'lar"],
    ["KORXONA SOF AKTIVLARI (Net Worth)", jamiAktivUzs + pnlData.jamiNasiyaQarzlari, (jamiAktivUzs + pnlData.jamiNasiyaQarzlari) / valyutaKursi, "Kassa qoldiqlari + Debitorlik qarzlari"]
  );

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Set column widths for Sheet 1
  ws1['!cols'] = [
    { wch: 45 }, // Ko'rsatkich nomi
    { wch: 22 }, // UZS
    { wch: 18 }, // USD
    { wch: 25 }, // Ulush / Izoh
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "Umumiy Balans & P&L");

  // ==========================================
  // 2-VARAQ: KASSA HARAKATLARI TO'LIQ JURNALI
  // ==========================================
  const sheet2Headers = [
    "№",
    "Sana",
    "Vaqt",
    "Amal Turi",
    "Kategoriya",
    "Summa (Asl Valyutada)",
    "Valyuta",
    "Dollar Kursi",
    "Summa (UZS Ekvivalenti)",
    "Hamyon / Kassa Turi",
    "Kimga / Kimdan (Kontragent)",
    "Mas'ul Xodim",
    "Izoh va Tafsilotlar"
  ];

  const sheet2Rows: any[][] = [
    ["KASSA HARAKATLARI VA TRANZATSIYALAR TO'LIQ JURNALI"],
    [`Davr: ${dateRangeLabel} | Jami Amallar Soni: ${kassaHarakatlari.length} ta`],
    [],
    sheet2Headers
  ];

  let jamiKirimUzs = 0;
  let jamiChiqimUzs = 0;

  kassaHarakatlari.forEach((item, index) => {
    const sumUzs = item.summaUzs || (item.valyuta === 'USD' ? item.summa * (item.kurs || valyutaKursi) : item.summa);
    if (item.tur === 'kirim') {
      jamiKirimUzs += sumUzs;
    } else {
      jamiChiqimUzs += sumUzs;
    }

    const catObj = XARAJAT_KATEGORIYALARI.find(c => c.id === item.kategoriya);
    const catName = catObj ? catObj.label : item.kategoriya;

    sheet2Rows.push([
      index + 1,
      item.sana || "-",
      item.vaqt || "-",
      item.tur === 'chiqim' ? 'Xarajat (Chiqim)' : 'Kassa Kirimi',
      catName,
      item.summa,
      item.valyuta,
      item.kurs || (item.valyuta === 'USD' ? valyutaKursi : "-"),
      sumUzs,
      item.kassaTuri === 'naqd_uzs' ? "Naqd (UZS)" :
      item.kassaTuri === 'naqd_usd' ? "Naqd (USD)" :
      item.kassaTuri === 'karta_uzs' ? "Karta (UZS)" : "Bank (UZS)",
      item.kimgaKimdan || "-",
      item.xodim || "Admin",
      item.izoh || "-"
    ]);
  });

  // Summary Row
  sheet2Rows.push(
    [],
    [
      "JAMI XULOSA",
      "",
      "",
      `Kirim: ${jamiKirimUzs.toLocaleString()} UZS`,
      `Chiqim: ${jamiChiqimUzs.toLocaleString()} UZS`,
      "",
      "",
      "Sof Kassa Farqi:",
      jamiKirimUzs - jamiChiqimUzs,
      "",
      "",
      "",
      ""
    ]
  );

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);

  ws2['!cols'] = [
    { wch: 6 },  // №
    { wch: 13 }, // Sana
    { wch: 10 }, // Vaqt
    { wch: 18 }, // Amal Turi
    { wch: 25 }, // Kategoriya
    { wch: 22 }, // Summa
    { wch: 10 }, // Valyuta
    { wch: 14 }, // Kurs
    { wch: 24 }, // Summa UZS
    { wch: 18 }, // Kassa Turi
    { wch: 28 }, // Kimga / Kimdan
    { wch: 20 }, // Mas'ul Xodim
    { wch: 35 }  // Izoh
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Kassa Jurnali");

  // ==========================================
  // 3-VARAQ: XARAJATLAR KATEGORIYALARI TAHLILI
  // ==========================================
  const sheet3Headers = [
    "№",
    "Kategoriya Kodu",
    "Kategoriya Nomi",
    "Amallar Soni (Tranzaksiyalar)",
    "Jami Xarajat (UZS)",
    "Jami Xarajat (USD Ekv.)",
    "Umumiy Xarajatdagi Ulushi (% of OpEx)",
    "Yalpi Tushumdagi Ulushi (% of Revenue)",
    "O'rtacha Bitta Chiqim (UZS)"
  ];

  const sheet3Rows: any[][] = [
    ["XARAJATLAR KATEGORIYALARI BO'YICHA CHUQUR TAHLIL"],
    [`Jami Operatsion Xarajat: ${pnlData.jamiXarajatlarUzs.toLocaleString()} UZS | Davr: ${dateRangeLabel}`],
    [],
    sheet3Headers
  ];

  let catIndex = 1;
  XARAJAT_KATEGORIYALARI.forEach(cat => {
    const sumUzs = pnlData.xarajatByCat[cat.id] || 0;
    // Count transactions for this category
    const count = kassaHarakatlari.filter(k => k.tur === 'chiqim' && k.kategoriya === cat.id).length;
    const shareOfOpEx = pnlData.jamiXarajatlarUzs > 0 ? (sumUzs / pnlData.jamiXarajatlarUzs) * 100 : 0;
    const shareOfRev = pnlData.jamiSotuvSumma > 0 ? (sumUzs / pnlData.jamiSotuvSumma) * 100 : 0;
    const avgExpense = count > 0 ? sumUzs / count : 0;

    sheet3Rows.push([
      catIndex++,
      cat.id,
      cat.label,
      count,
      sumUzs,
      valyutaKursi > 0 ? sumUzs / valyutaKursi : 0,
      `${shareOfOpEx.toFixed(1)}%`,
      `${shareOfRev.toFixed(1)}%`,
      Math.round(avgExpense)
    ]);
  });

  // Category summary totals
  sheet3Rows.push(
    [],
    [
      "JAMI OPERATSION XARAJAT",
      "-",
      "Barcha Kategoriyalar",
      kassaHarakatlari.filter(k => k.tur === 'chiqim').length,
      pnlData.jamiXarajatlarUzs,
      valyutaKursi > 0 ? pnlData.jamiXarajatlarUzs / valyutaKursi : 0,
      "100.0%",
      pnlData.jamiSotuvSumma > 0 ? `${((pnlData.jamiXarajatlarUzs / pnlData.jamiSotuvSumma) * 100).toFixed(1)}%` : "0.0%",
      "-"
    ]
  );

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);

  ws3['!cols'] = [
    { wch: 6 },  // №
    { wch: 18 }, // Kod
    { wch: 30 }, // Kategoriya
    { wch: 22 }, // Amallar Soni
    { wch: 24 }, // UZS
    { wch: 20 }, // USD
    { wch: 25 }, // % of OpEx
    { wch: 25 }, // % of Rev
    { wch: 22 }  // O'rtacha
  ];

  XLSX.utils.book_append_sheet(wb, ws3, "Xarajatlar Tahlili");

  // Save workbook
  const fileName = `Kassa_Moliya_MultiSheet_${today}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
