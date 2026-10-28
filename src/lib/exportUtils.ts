import { DbState } from '../types';

export interface ExportOptions {
  dateRange?: 'all' | '7days' | '30days' | 'custom';
  startDate?: string;
  endDate?: string;
  selectedSheets?: {
    stock: boolean;
    kirim: boolean;
    chiqim: boolean;
    otkazma: boolean;
    kontragent: boolean;
    prices: boolean;
    users: boolean;
    audit: boolean;
  };
}

/**
 * Filter transactions by date range
 */
function isDateInRange(dateStr: string, options?: ExportOptions): boolean {
  if (!options || options.dateRange === 'all' || !options.dateRange) return true;
  if (!dateStr) return true;

  const itemDate = new Date(dateStr).getTime();
  const now = new Date().getTime();

  if (options.dateRange === '7days') {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return itemDate >= sevenDaysAgo;
  }
  if (options.dateRange === '30days') {
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    return itemDate >= thirtyDaysAgo;
  }
  if (options.dateRange === 'custom') {
    if (options.startDate && itemDate < new Date(options.startDate).getTime()) return false;
    if (options.endDate && itemDate > new Date(options.endDate).getTime() + 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

/**
 * Basic single-sheet array export to Excel (Dynamically loaded)
 */
export async function exportToExcel(data: (string | number)[][], filename: string, sheetName: string = 'Ma\'lumotlar') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Basic export to CSV
 */
export async function exportToCSV(data: (string | number)[][], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Basic table export to PDF (Dynamically loaded)
 */
export async function exportToPdf(title: string, headers: string[], rows: any[][], filename: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, 15);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Sana: ${new Date().toLocaleString()}`, 14, 21);

  autoTable(doc, {
    startY: 25,
    head: [headers],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 },
  });

  doc.save(`${filename}.pdf`);
}

/**
 * 1. COMPREHENSIVE MULTI-SHEET EXCEL EXPORT (.xlsx) (Dynamically loaded)
 */
export async function exportToMultiSheetExcel(db: DbState, options?: ExportOptions) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheets = options?.selectedSheets || {
    stock: true,
    kirim: true,
    chiqim: true,
    otkazma: true,
    kontragent: true,
    prices: true,
    users: true,
    audit: true,
  };

  const prices = db.prices || {};

  // 1. Stock sheet (Ombor Qoldiqlari)
  if (sheets.stock) {
    const stockRows: any[] = [];
    
    // Tepa filial
    Object.entries(db.tepa?.stock || {}).forEach(([model, sizes]) => {
      Object.entries(sizes || {}).forEach(([size, qty]) => {
        if (qty > 0) {
          const cost = prices[model]?.cost || 0;
          const sale = prices[model]?.sale || 0;
          stockRows.push({
            'Filial': 'Tepa (Bosh Ombor)',
            'Model': model,
            'O\'lcham': size,
            'Qoldiq Soni (dona)': qty,
            'Tan Narxi ($)': cost,
            'Sotish Narxi ($)': sale,
            'Jami Tan Qiymati ($)': qty * cost,
            'Jami Sotish Qiymati ($)': qty * sale,
          });
        }
      });
    });

    // Kotta filial
    Object.entries(db.kotta?.stock || {}).forEach(([model, sizes]) => {
      Object.entries(sizes || {}).forEach(([size, qty]) => {
        if (qty > 0) {
          const cost = prices[model]?.cost || 0;
          const sale = prices[model]?.sale || 0;
          stockRows.push({
            'Filial': 'Kotta Filial',
            'Model': model,
            'O\'lcham': size,
            'Qoldiq Soni (dona)': qty,
            'Tan Narxi ($)': cost,
            'Sotish Narxi ($)': sale,
            'Jami Tan Qiymati ($)': qty * cost,
            'Jami Sotish Qiymati ($)': qty * sale,
          });
        }
      });
    });

    const wsStock = XLSX.utils.json_to_sheet(stockRows.length > 0 ? stockRows : [{ 'Holat': 'Hozircha tovar qoldig\'i mavjud emas' }]);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Tovarlar Qoldigi');
  }

  // 2. Kirimlar Tarixi
  if (sheets.kirim) {
    const kirimRows: any[] = [];
    const collectKirim = (transactions: any[], filialName: string) => {
      (transactions || [])
        .filter(t => t.amal === 'kirim' && isDateInRange(t.vaqt || t.sana, options))
        .forEach(t => {
          kirimRows.push({
            'Sana': t.sana || (t.vaqt ? new Date(t.vaqt).toLocaleDateString() : ''),
            'Vaqt': t.vaqt ? new Date(t.vaqt).toLocaleTimeString() : '',
            'Filial': filialName,
            'Model': t.model,
            'O\'lcham': t.olcham,
            'Soni (dona)': t.soni,
            'Yetkazib Beruvchi / Kimdan': t.kimdan || 'Noma\'lum',
            'Summa ($)': t.summa || (t.soni * (prices[t.model]?.cost || 0)),
            'Mas\'ul Xodim': t.xodim || '',
            'Izoh': t.izoh || '',
          });
        });
    };

    collectKirim(db.tepa?.transactions || [], 'Tepa Filial');
    collectKirim(db.kotta?.transactions || [], 'Kotta Filial');

    const wsKirim = XLSX.utils.json_to_sheet(kirimRows.length > 0 ? kirimRows : [{ 'Holat': 'Kirim ma\'lumotlari topilmadi' }]);
    XLSX.utils.book_append_sheet(wb, wsKirim, 'Kirimlar Tarixi');
  }

  // 3. Chiqimlar (Savdo & Chiqim)
  if (sheets.chiqim) {
    const chiqimRows: any[] = [];
    const collectChiqim = (transactions: any[], filialName: string) => {
      (transactions || [])
        .filter(t => t.amal === 'chiqim' && isDateInRange(t.vaqt || t.sana, options))
        .forEach(t => {
          chiqimRows.push({
            'Sana': t.sana || (t.vaqt ? new Date(t.vaqt).toLocaleDateString() : ''),
            'Vaqt': t.vaqt ? new Date(t.vaqt).toLocaleTimeString() : '',
            'Filial': filialName,
            'Model': t.model,
            'O\'lcham': t.olcham,
            'Soni (dona)': t.soni,
            'Xaridor / Mijoz': t.kimdan || 'Chakana xaridor',
            'Summa ($)': t.summa || (t.soni * (prices[t.model]?.sale || 0)),
            'Sof Foyda ($)': t.foyda || 0,
            'Mas\'ul Xodim': t.xodim || '',
            'Izoh': t.izoh || '',
          });
        });
    };

    collectChiqim(db.tepa?.transactions || [], 'Tepa Filial');
    collectChiqim(db.kotta?.transactions || [], 'Kotta Filial');

    const wsChiqim = XLSX.utils.json_to_sheet(chiqimRows.length > 0 ? chiqimRows : [{ 'Holat': 'Chiqim ma\'lumotlari topilmadi' }]);
    XLSX.utils.book_append_sheet(wb, wsChiqim, 'Chiqimlar va Savdo');
  }

  // 4. O'tkazmalar
  if (sheets.otkazma) {
    const otkazmaRows = (db.otkazmalar || [])
      .filter(o => isDateInRange(o.vaqt || o.sana || '', options))
      .map(o => ({
        'Sana / Vaqt': o.vaqt ? new Date(o.vaqt).toLocaleString() : (o.sana || ''),
        'Qayerdan (Filial)': o.from === 'tepa' ? 'Tepa Filial' : 'Kotta Filial',
        'Qayerga (Filial)': o.to === 'tepa' ? 'Tepa Filial' : 'Kotta Filial',
        'Model': o.model,
        'O\'lcham': o.olcham,
        'Yuborilgan Soni': o.soni,
        'Qaytgan Soni': o.qaytibKelganSoni || 0,
        'Haqiqiy Yetib Borgan': o.soni - (o.qaytibKelganSoni || 0),
        'Izoh': o.izoh || '',
      }));

    const wsOtkazma = XLSX.utils.json_to_sheet(otkazmaRows.length > 0 ? otkazmaRows : [{ 'Holat': 'O\'tkazmalar mavjud emas' }]);
    XLSX.utils.book_append_sheet(wb, wsOtkazma, 'Otkazmalar Tarixi');
  }

  // 5. Kontragentlar & Mijozlar
  if (sheets.kontragent) {
    const kontragentRows = (db.kontragentlar || []).map(k => ({
      'Ism / Kompaniya': k.ism,
      'Telefon Raqam': k.tel || '',
      'Kategoriya': k.kategoriya || 'Boshqa',
      'Hudud / Viloyat': k.viloyat || '',
      'Manzil': k.manzil || '',
      'Jami Savdo Aylanmasi ($)': k.jami || 0,
      'Joriy Balans / Qarz ($)': k.balans || 0,
      'Xaridlar Soni': k.xaridlarSoni || 0,
      'Birinchi Xarid': k.birinchiXarid || '',
      'Oxirgi Xarid': k.oxirgiXarid || '',
      'Ro\'yxatga Olingan': k.qoshilganSana || '',
      'Izoh': k.izoh || '',
    }));

    const wsKontragent = XLSX.utils.json_to_sheet(kontragentRows.length > 0 ? kontragentRows : [{ 'Holat': 'Kontragentlar mavjud emas' }]);
    XLSX.utils.book_append_sheet(wb, wsKontragent, 'Mijozlar va Kontragentlar');
  }

  // 6. Narxlar & Tan Narxlar
  if (sheets.prices) {
    const priceRows = Object.entries(db.prices || {}).map(([model, item]) => {
      const margin = (item.sale || 0) - (item.cost || 0);
      const marginPercent = item.cost ? ((margin / item.cost) * 100).toFixed(1) + '%' : '0%';
      return {
        'Model': model,
        'Tan Narxi ($)': item.cost || 0,
        'Sotish Narxi ($)': item.sale || 0,
        'Kutilayotgan Foyda ($)': margin,
        'Foyda Marjasi (%)': marginPercent,
      };
    });

    const wsPrices = XLSX.utils.json_to_sheet(priceRows.length > 0 ? priceRows : [{ 'Holat': 'Narxlar belgilanmagan' }]);
    XLSX.utils.book_append_sheet(wb, wsPrices, 'Model Narxlari');
  }

  // 7. Xodimlar
  if (sheets.users) {
    const userRows = (db.users || []).map(u => ({
      'Xodim ID': u.id,
      'Ism': u.ism,
      'Rol / Lavozim': u.rol === 'admin' ? 'Administrator' : 'Omborchi',
    }));

    const wsUsers = XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{ 'Holat': 'Xodimlar ro\'yxati bo\'sh' }]);
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Xodimlar');
  }

  // 8. Audit Loglari
  if (sheets.audit) {
    const auditRows = (db.auditLogs || [])
      .filter(a => isDateInRange(a.date, options))
      .map(a => ({
        'Sana va Vaqt': a.date ? new Date(a.date).toLocaleString() : '',
        'Xodim': a.user,
        'Harakat': a.action,
        'Ob\'yekt': a.entity,
        'Darajasi': a.severity || 'info',
        'Tafsilotlar': a.details,
      }));

    const wsAudit = XLSX.utils.json_to_sheet(auditRows.length > 0 ? auditRows : [{ 'Holat': 'Audit loglari mavjud emas' }]);
    XLSX.utils.book_append_sheet(wb, wsAudit, 'Xavfsizlik Loglari');
  }

  // Save file
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Ombor_Boshqaruv_Baza_${dateStr}.xlsx`);
}

/**
 * 2. FULL JSON DATABASE BACKUP
 */
export function exportDatabaseToJson(db: DbState) {
  const exportPayload = {
    backupMetadata: {
      exportedAt: new Date().toISOString(),
      appName: 'Falak Shoes Ombor Boshqaruvi',
      version: '2.0.0',
      totalStockTepa: Object.values(db.tepa?.stock || {}).reduce((acc, sizes) => acc + Object.values(sizes || {}).reduce((a, b) => a + b, 0), 0),
      totalStockKotta: Object.values(db.kotta?.stock || {}).reduce((acc, sizes) => acc + Object.values(sizes || {}).reduce((a, b) => a + b, 0), 0),
      totalUsers: (db.users || []).length,
      totalClients: (db.kontragentlar || []).length,
    },
    ...db,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = URL.createObjectURL(blob);
  a.download = `Ombor_Toliq_Zaxira_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * 3. COMPREHENSIVE PDF REPORT (.pdf) (Dynamically loaded)
 */
export async function exportToComprehensivePdf(db: DbState, options?: ExportOptions) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString();

  const prices = db.prices || {};

  // Compute key stats
  let tepaTotalQty = 0;
  let tepaTotalCost = 0;
  let tepaTotalSale = 0;
  Object.entries(db.tepa?.stock || {}).forEach(([m, sizes]) => {
    Object.entries(sizes || {}).forEach(([_, q]) => {
      tepaTotalQty += q;
      tepaTotalCost += q * (prices[m]?.cost || 0);
      tepaTotalSale += q * (prices[m]?.sale || 0);
    });
  });

  let kottaTotalQty = 0;
  let kottaTotalCost = 0;
  let kottaTotalSale = 0;
  Object.entries(db.kotta?.stock || {}).forEach(([m, sizes]) => {
    Object.entries(sizes || {}).forEach(([_, q]) => {
      kottaTotalQty += q;
      kottaTotalCost += q * (prices[m]?.cost || 0);
      kottaTotalSale += q * (prices[m]?.sale || 0);
    });
  });

  const totalQty = tepaTotalQty + kottaTotalQty;
  const totalCostVal = tepaTotalCost + kottaTotalCost;
  const totalSaleVal = tepaTotalSale + kottaTotalSale;

  // Header Title
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text('OMBOR BOSHQARUVI RASMIY HISOBOTI', 14, 20);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Chop etilgan sana: ${dateStr} ${timeStr}`, 14, 26);
  doc.text(`Tizim: Falak Shoes Warehouse Pro`, 14, 30);

  // Summary Metrics Table
  autoTable(doc, {
    startY: 35,
    head: [['Ko\'rsatkich', 'Tepa Filial', 'Kotta Filial', 'JAMI']],
    body: [
      ['Umumiy Qoldiq Soni (dona)', tepaTotalQty.toLocaleString() + ' dona', kottaTotalQty.toLocaleString() + ' dona', totalQty.toLocaleString() + ' dona'],
      ['Tan Narxi Boyicha Qiymat ($)', '$' + tepaTotalCost.toLocaleString(), '$' + kottaTotalCost.toLocaleString(), '$' + totalCostVal.toLocaleString()],
      ['Sotish Narxi Boyicha Qiymat ($)', '$' + tepaTotalSale.toLocaleString(), '$' + kottaTotalSale.toLocaleString(), '$' + totalSaleVal.toLocaleString()],
      ['Kutilayotgan Sof Marja ($)', '$' + (tepaTotalSale - tepaTotalCost).toLocaleString(), '$' + (kottaTotalSale - kottaTotalCost).toLocaleString(), '$' + (totalSaleVal - totalCostVal).toLocaleString()],
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  // Top Stock Items Table
  const stockRows: any[] = [];
  const modelSummaries: Record<string, { tepa: number; kotta: number; cost: number; sale: number }> = {};
  
  Object.entries(db.tepa?.stock || {}).forEach(([m, sizes]) => {
    if (!modelSummaries[m]) modelSummaries[m] = { tepa: 0, kotta: 0, cost: prices[m]?.cost || 0, sale: prices[m]?.sale || 0 };
    Object.values(sizes || {}).forEach(q => { modelSummaries[m].tepa += q; });
  });
  Object.entries(db.kotta?.stock || {}).forEach(([m, sizes]) => {
    if (!modelSummaries[m]) modelSummaries[m] = { tepa: 0, kotta: 0, cost: prices[m]?.cost || 0, sale: prices[m]?.sale || 0 };
    Object.values(sizes || {}).forEach(q => { modelSummaries[m].kotta += q; });
  });

  Object.entries(modelSummaries)
    .sort((a, b) => (b[1].tepa + b[1].kotta) - (a[1].tepa + a[1].kotta))
    .slice(0, 25)
    .forEach(([m, data]) => {
      const sum = data.tepa + data.kotta;
      stockRows.push([
        m,
        data.tepa > 0 ? data.tepa.toLocaleString() : '-',
        data.kotta > 0 ? data.kotta.toLocaleString() : '-',
        sum.toLocaleString(),
        data.cost ? '$' + data.cost : '-',
        data.sale ? '$' + data.sale : '-',
        data.cost ? '$' + (sum * data.cost).toLocaleString() : '-',
      ]);
    });

  let currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Asosiy Modellar Qoldig\'i (Top 25)', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Model Nomi', 'Tepa', 'Kotta', 'Jami', 'Tan ($)', 'Sotish ($)', 'Jami Tan ($)']],
    body: stockRows.length > 0 ? stockRows : [['Ma\'lumot yo\'q', '-', '-', '-', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 2.5 },
  });

  // Kontragentlar Balansi
  currentY = (doc as any).lastAutoTable.finalY + 10;
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Mijozlar va Kontragentlar Holati (Qarz / Haq)', 14, currentY);

  const clientRows = (db.kontragentlar || [])
    .slice(0, 15)
    .map(k => [
      k.ism,
      k.tel || '-',
      k.kategoriya || 'Boshqa',
      '$' + (k.jami || 0).toLocaleString(),
      (k.balans || 0) < 0 ? `Qarz: $${Math.abs(k.balans || 0).toLocaleString()}` : (k.balans || 0) > 0 ? `Haq: $${k.balans}` : '$0',
      k.oxirgiXarid || '-',
    ]);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Ism / Korxona', 'Telefon', 'Kategoriya', 'Jami Aylanma', 'Balans', 'Oxirgi Xarid']],
    body: clientRows.length > 0 ? clientRows : [['Kontragentlar mavjud emas', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 2.5 },
  });

  // Footer / Signatures
  currentY = (doc as any).lastAutoTable.finalY + 15;
  if (currentY > 250) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Mas\'ul Rahbar: ____________________', 14, currentY);
  doc.text('Bosh Hisobchi / Omborchi: ____________________', 110, currentY);
  doc.text('Muhr o\'rni (M.O\'.): [          ]', 14, currentY + 12);

  // Save PDF
  const pdfDate = new Date().toISOString().split('T')[0];
  doc.save(`Ombor_Rasmiy_Hisobot_${pdfDate}.pdf`);
}

function computeRecordCounts(state: any) {
  if (!state) return { transactions: 0, kontragentlar: 0, stockModels: 0, users: 0, prices: 0 };
  const tepaTx = Array.isArray(state.tepa?.transactions) ? state.tepa.transactions.length : 0;
  const kottaTx = Array.isArray(state.kotta?.transactions) ? state.kotta.transactions.length : 0;
  const sort2Tx = Array.isArray(state.sort2?.transactions) ? state.sort2.transactions.length : 0;
  const otkazmalar = Array.isArray(state.otkazmalar) ? state.otkazmalar.length : 0;
  
  const kontragentlar = Array.isArray(state.kontragentlar) ? state.kontragentlar.length : 0;
  const users = Array.isArray(state.users) ? state.users.length : 0;
  const prices = state.prices ? Object.keys(state.prices).length : 0;

  const tepaModels = state.tepa?.stock ? Object.keys(state.tepa.stock).length : 0;
  const kottaModels = state.kotta?.stock ? Object.keys(state.kotta.stock).length : 0;
  const sort2Models = state.sort2?.stock ? Object.keys(state.sort2.stock).length : 0;

  return {
    transactions: tepaTx + kottaTx + sort2Tx + otkazmalar,
    tepaTransactions: tepaTx,
    kottaTransactions: kottaTx,
    sort2Transactions: sort2Tx,
    otkazmalar,
    kontragentlar,
    users,
    prices,
    stockModels: tepaModels + kottaModels + sort2Models,
  };
}

export async function exportFullComprehensiveBackup(): Promise<{ summaryText: string }> {
  async function readIdb(dbName: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName, 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('app_state')) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction('app_state', 'readonly');
          const store = tx.objectStore('app_state');
          const getReq = store.get('main_db');
          getReq.onsuccess = () => { db.close(); resolve(getReq.result || null); };
          getReq.onerror = () => { db.close(); resolve(null); };
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  let indexedDbData = await readIdb('OmborPro_LocalDB');
  if (!indexedDbData) {
    indexedDbData = await readIdb('FalakOmborDB');
  }

  let localStorageCache = null;
  try {
    const cached = localStorage.getItem('ombor_db_cache');
    if (cached) localStorageCache = JSON.parse(cached);
  } catch {}

  const dailyBackups: Record<string, any> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('ombor_daily_backup_') || key.startsWith('ombor_') || key.startsWith('falak_'))) {
        const val = localStorage.getItem(key);
        if (val) {
          try { dailyBackups[key] = JSON.parse(val); } catch { dailyBackups[key] = val; }
        }
      }
    }
  } catch {}

  let firestoreAppDb = null;
  let firestoreHistoryRecords = null;
  try {
    const { firestoreDb } = await import('./fbClient');
    const { doc, getDoc } = await import('firebase/firestore');
    
    const appSnap = await getDoc(doc(firestoreDb, 'app_db', 'main'));
    if (appSnap.exists()) {
      firestoreAppDb = appSnap.data();
    }

    const histSnap = await getDoc(doc(firestoreDb, 'history_records', 'main'));
    if (histSnap.exists()) {
      firestoreHistoryRecords = histSnap.data();
    }
  } catch (e) {
    console.warn("Firestore fetch error during comprehensive backup:", e);
  }

  const summary = {
    exportedAt: new Date().toISOString(),
    sources: {
      indexedDb: {
        available: !!indexedDbData,
        counts: computeRecordCounts(indexedDbData),
      },
      localStorageCache: {
        available: !!localStorageCache,
        counts: computeRecordCounts(localStorageCache),
      },
      localStorageDailyBackups: Object.entries(dailyBackups).map(([key, data]) => ({
        key,
        counts: computeRecordCounts(data),
      })),
      firestoreAppDb: {
        available: !!firestoreAppDb,
        counts: computeRecordCounts(firestoreAppDb),
      },
      firestoreHistoryRecords: {
        available: !!firestoreHistoryRecords,
        counts: computeRecordCounts(firestoreHistoryRecords),
      },
    }
  };

  const fullPayload = {
    backupSummary: summary,
    indexedDbData,
    localStorageCache,
    localStorageDailyBackups: dailyBackups,
    firestoreAppDb,
    firestoreHistoryRecords,
  };

  const blob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = URL.createObjectURL(blob);
  a.download = `Falak_Toliq_Kop_Manbali_Zaxira_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(a.href);

  const idbTx = summary.sources.indexedDb.counts.transactions;
  const fsAppTx = summary.sources.firestoreAppDb.counts.transactions;
  const fsHistTx = summary.sources.firestoreHistoryRecords.counts.transactions;

  return {
    summaryText: `IndexedDB: ${idbTx} tranzaksiya | Firestore app_db: ${fsAppTx} tranzaksiya | history_records: ${fsHistTx} tranzaksiya`
  };
}

