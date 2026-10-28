import { DbState, Kontragent } from '../types';
import { generateId } from './utils';

export interface ExcelImportResult {
  success: boolean;
  message: string;
  importedCounts: {
    models: number;
    totalStockPairs: number;
    kontragents: number;
    prices: number;
  };
  details: string[];
}

/**
 * Downloads a sample Excel template for users to fill in their initial inventory & clients
 */
export async function downloadSampleExcelTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 1. Sheet: Tovarlar Qoldigi (Stock template)
  const stockSample = [
    {
      'Ombor (tepa yoki kotta)': 'tepa',
      'Model Nomi': '056 astar yop',
      '39': 10,
      '40': 15,
      '41': 20,
      '42': 25,
      '43': 20,
      '44': 15,
      '45': 5,
      'Tan Narxi ($)': 12,
      'Sotish Narxi ($)': 18
    },
    {
      'Ombor (tepa yoki kotta)': 'tepa',
      'Model Nomi': 'Mokasina Klassik',
      '39': 5,
      '40': 10,
      '41': 15,
      '42': 15,
      '43': 10,
      '44': 5,
      '45': 0,
      'Tan Narxi ($)': 14,
      'Sotish Narxi ($)': 20
    },
    {
      'Ombor (tepa yoki kotta)': 'kotta',
      'Model Nomi': 'Krossovka Sport 01',
      '39': 8,
      '40': 12,
      '41': 18,
      '42': 18,
      '43': 12,
      '44': 8,
      '45': 4,
      'Tan Narxi ($)': 16,
      'Sotish Narxi ($)': 24
    }
  ];
  const wsStock = XLSX.utils.json_to_sheet(stockSample);
  XLSX.utils.book_append_sheet(wb, wsStock, 'Tovarlar Qoldigi');

  // 2. Sheet: Mijozlar va Kontragentlar
  const clientSample = [
    {
      'Ism yoki Do\'kon nomi': 'Akmal Do\'kon Samarqand',
      'Telefon': '+998901234567',
      'Kategoriya (Ulgurji / Do\'kon / Hamkor)': 'Ulgurji',
      'Manzil': 'Samarqand shahar, Registon ko\'chasi',
      'Boshlang\'ich Balans ($ yoki so\'mda qarz/haq)': -1500,
      'Izoh': 'Doimiy xaridor, har haftada tovar oladi'
    },
    {
      'Ism yoki Do\'kon nomi': 'Bekzod Poyabzal Toshkent',
      'Telefon': '+998935554433',
      'Kategoriya (Ulgurji / Do\'kon / Hamkor)': 'Do\'kon',
      'Manzil': 'Toshkent, Chorsu bozori',
      'Boshlang\'ich Balans ($ yoki so\'mda qarz/haq)': 0,
      'Izoh': 'Yangi ochilgan do\'kon'
    }
  ];
  const wsClients = XLSX.utils.json_to_sheet(clientSample);
  XLSX.utils.book_append_sheet(wb, wsClients, 'Mijozlar');

  XLSX.writeFile(wb, 'OmborPro_Namuna_Shablon.xlsx');
}

/**
 * Parses and merges an uploaded Excel workbook into current DbState
 */
export async function parseExcelDataToDb(
  file: File, 
  currentDb: DbState, 
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ updatedDb: DbState; result: ExcelImportResult }> {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        
        const newDb: DbState = JSON.parse(JSON.stringify(currentDb));
        if (mode === 'replace') {
          newDb.tepa.stock = {};
          newDb.kotta.stock = {};
          newDb.prices = {};
          newDb.kontragentlar = [];
        }

        if (!newDb.tepa.stock) newDb.tepa.stock = {};
        if (!newDb.kotta.stock) newDb.kotta.stock = {};
        if (!newDb.prices) newDb.prices = {};
        if (!newDb.kontragentlar) newDb.kontragentlar = [];

        let importedModelsCount = 0;
        let importedStockPairs = 0;
        let importedKontragentsCount = 0;
        let importedPricesCount = 0;
        const details: string[] = [];

        // 1. Process Stock Sheet
        const stockSheetNames = wb.SheetNames.filter(name => 
          name.toLowerCase().includes('tovar') || 
          name.toLowerCase().includes('qoldiq') || 
          name.toLowerCase().includes('stock') ||
          name.toLowerCase().includes('ombor')
        );

        const stockSheetName = stockSheetNames[0] || wb.SheetNames[0];
        if (stockSheetName) {
          const ws = wb.Sheets[stockSheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(ws);

          rows.forEach((row) => {
            const omborRaw = String(row['Ombor (tepa yoki kotta)'] || row['Ombor'] || row['Filial'] || 'tepa').toLowerCase();
            const targetOmbor: 'tepa' | 'kotta' = omborRaw.includes('kot') ? 'kotta' : 'tepa';

            const modelRaw = String(row['Model Nomi'] || row['Model'] || row['Nomi'] || row['Tovar'] || '').trim();
            if (!modelRaw) return;

            if (!newDb[targetOmbor].stock[modelRaw]) {
              newDb[targetOmbor].stock[modelRaw] = {};
              importedModelsCount++;
            }

            // Sizes
            const sizeKeys = ['39', '40', '41', '42', '43', '44', '45'];
            sizeKeys.forEach(sz => {
              const val = Number(row[sz] || row[`${sz}°`] || row[`Razmer ${sz}`] || 0);
              if (!isNaN(val) && val > 0) {
                newDb[targetOmbor].stock[modelRaw][sz] = (newDb[targetOmbor].stock[modelRaw][sz] || 0) + val;
                importedStockPairs += val;
              }
            });

            // Prices
            const cost = Number(row['Tan Narxi ($)'] || row['Tan Narx'] || row['Tannarx'] || 0);
            const sale = Number(row['Sotish Narxi ($)'] || row['Sotish Narx'] || row['Sotish'] || 0);
            if (cost > 0 || sale > 0) {
              const prevPrice = newDb.prices[modelRaw];
              newDb.prices[modelRaw] = {
                cost: cost || prevPrice?.cost || 0,
                sale: sale || prevPrice?.sale || 0,
                history: prevPrice?.history || []
              };
              importedPricesCount++;
            }
          });

          details.push(`📦 Tovarlar: ${importedModelsCount} xil model, jami ${importedStockPairs} juft qoldiq yuklandi.`);
        }

        // 2. Process Clients Sheet
        const clientSheetNames = wb.SheetNames.filter(name => 
          name.toLowerCase().includes('mijoz') || 
          name.toLowerCase().includes('kontragent') || 
          name.toLowerCase().includes('client') ||
          name.toLowerCase().includes('xaridor')
        );

        const clientSheetName = clientSheetNames[0] || (wb.SheetNames.length > 1 ? wb.SheetNames[1] : null);
        if (clientSheetName && clientSheetName !== stockSheetName) {
          const ws = wb.Sheets[clientSheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(ws);

          rows.forEach((row) => {
            const ism = String(row['Ism yoki Do\'kon nomi'] || row['Ism'] || row['Mijoz'] || row['Do\'kon'] || '').trim();
            if (!ism) return;

            const tel = String(row['Telefon'] || row['Tel'] || '');
            const kategoriya = String(row['Kategoriya'] || row['Kategoriya (Ulgurji / Do\'kon / Hamkor)'] || 'Ulgurji');
            const viloyat = String(row['Hudud / Viloyat'] || row['Viloyat'] || row['Hudud'] || row['Region'] || '').trim();
            const manzil = String(row['Manzil'] || '');
            const balans = Number(row['Boshlang\'ich Balans ($ yoki so\'mda qarz/haq)'] || row['Balans'] || row['Qarz'] || 0);
            const izoh = String(row['Izoh'] || '');
            const todayStr = new Date().toISOString().split('T')[0];

            const existingIdx = newDb.kontragentlar.findIndex(k => k.ism.toLowerCase() === ism.toLowerCase());
            if (existingIdx >= 0) {
              newDb.kontragentlar[existingIdx].tel = tel || newDb.kontragentlar[existingIdx].tel;
              newDb.kontragentlar[existingIdx].viloyat = viloyat || newDb.kontragentlar[existingIdx].viloyat;
              newDb.kontragentlar[existingIdx].manzil = manzil || newDb.kontragentlar[existingIdx].manzil;
              newDb.kontragentlar[existingIdx].balans = balans || newDb.kontragentlar[existingIdx].balans;
            } else {
              const newK: Kontragent = {
                id: generateId(),
                ism,
                tel,
                kategoriya,
                viloyat: viloyat || undefined,
                manzil,
                balans: isNaN(balans) ? 0 : balans,
                jami: 0,
                xaridlarSoni: 0,
                birinchiXarid: todayStr,
                oxirgiXarid: todayStr,
                qoshilganSana: todayStr,
                izoh
              };
              newDb.kontragentlar.push(newK);
              importedKontragentsCount++;
            }
          });

          details.push(`👥 Mijozlar: ${importedKontragentsCount} nafar yangi kontragent muvaffaqiyatli qo'shildi.`);
        }

        resolve({
          updatedDb: newDb,
          result: {
            success: true,
            message: "Excel faylidagi ma'lumotlar muvaffaqiyatli tahlil qilindi va tizimga kiritildi!",
            importedCounts: {
              models: importedModelsCount,
              totalStockPairs: importedStockPairs,
              kontragents: importedKontragentsCount,
              prices: importedPricesCount,
            },
            details
          }
        });
      } catch (err: any) {
        reject(new Error("Excel faylini o'qishda xatolik: " + (err?.message || err)));
      }
    };

    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik yuz berdi"));
    reader.readAsArrayBuffer(file);
  });
}
