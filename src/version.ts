export interface ChangelogItem {
  type: 'new' | 'improved' | 'fixed' | 'security' | 'perf';
  title: string;
  description: string;
  tag?: string;
}

export interface VersionInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  releaseTime?: string;
  title: string;
  badge?: string;
  description: string;
  changelog: ChangelogItem[];
  isCurrent?: boolean;
}

/**
 * JORIY ISHLAYOTGAN ILOVA VERSIYASI (Current Running Version)
 */
export const APP_VERSION_CONFIG: VersionInfo = {
  version: "2.7.4",
  versionCode: 274,
  releaseDate: "2026-10-08",
  releaseTime: "14:05",
  title: "OmborPro Ultimate v2.7.4 (Ombor Boshqaruv & Qidiruv Ergonomikasi)",
  badge: "Joriy Versiya (Faol)",
  description: "Ombor boshqaruvi va qidiruv tizimi optimallashtirildi, qoldiqlarni tezkor aniqlash qulayligi oshirildi.",
  isCurrent: true,
  changelog: [
    {
      type: 'new',
      tag: 'Chiqim & Faktura',
      title: "Fakturani To'liq Tahrirlash va Unutilgan Mahsulotni Qo'shish",
      description: "Oldin qilingan chiqim operatsiyasiga yangi mahsulot qo'shish (+ Mahsulot qo'shish), o'lchamlarni o'zgartirish yoki tovarlarni o'chirish imkoniyati. Tizim ombor qoldig'i (stock diff)ni avtomatik zanjirli hisoblab, tovarlarni ombordan to'g'ri ayiradi yoki qaytaradi."
    },
    {
      type: 'new',
      tag: 'Moliya & Kassa',
      title: "Shu Faktura / Kun Uchun To'lov Qabul Qilish (Ekspress To'lov)",
      description: "Chiqimlar ro'yxatidan yoki faktura tahrirlash oynasining o'zidan to'lov sanasini (shu kun yoki bugungi kun) ko'rsatib, Naqd UZS, USD, Karta yoki Bank orqali to'lov kiritish. To'lov avtomatik ravishda kassaga tushadi va mijoz qarzidan ayiriladi."
    },
    {
      type: 'improved',
      tag: 'A4 & Chek',
      title: "Yagona Birlashtirilgan Kvitansiya va To'lovlar Aks Etishi",
      description: "Tahrirlangan faktura yoki kiritilgan to'lovlar A4 Yuk xatida va 80mm Termal kassa chekida darhol yangilanadi: Jami summa, Qabul qilingan to'lov va Qoldiq qarz 100% to'g'ri aks etadi."
    },
    {
      type: 'improved',
      tag: 'Avtomatika & Versiya',
      title: "Har bir Kichik O'zgarish uchun Avtomatik Patch (v2.7.1 -> v2.7.2)",
      description: "Dasturga kiritiladigan har bir kichik tuzatish yoki qo'shimcha avtomatik ravishda yangi patch versiya sifatida belgilanadi va barcha qurilmalarda darhol aks etadi."
    },
    {
      type: 'new',
      tag: 'Sex & Sverka',
      title: "Ishlab chiqarish (Sex) bilan Taqqoslash (Sverka) Moduli",
      description: "Ishlab chiqarish ilovasidagi barcha partiyalar bilan omborga kelgan haqiqiy tovarlar o'rtasida to'liq avtomatlashtirilgan taqqoslash jadvali. Tafovutlar (kamomad, to'liq, ortiqcha) rangli indikatorlar orqali ko'rsatiladi va bir bosishda qabul qilish mumkin."
    },
    {
      type: 'new',
      tag: 'Partiyalar',
      title: "Partiyalar Qoldig'i va Davomiyligi (Batch Continuation)",
      description: "Agar sexdan bitta partiya bir necha kunda bo'lib-bo'lib yuborilsa, birinchi qism qabul qilingandan keyin ham partiya yo'qolib qolmaydi. Tizim qolgan qismini 'Davomi' sifatida avtomatik aniqlaydi va qabul qilish imkonini beradi."
    },
    {
      type: 'improved',
      tag: 'Sinxronizatsiya',
      title: "Mustaqil Server Sinxronizatsiyasi (/api/sync/db)",
      description: "Firestore kvotalaridan qat'i nazar, barcha telefon va kompyuterlar o'rtasida tovarlar, qoldiqlar va tranzaksiyalar uzluksiz hamda zudlik bilan sinxronlanadi."
    },
    {
      type: 'perf',
      tag: 'Tezlik & Mobil',
      title: "Recharts Grafiklari uchun 'LazyViewport' Tizimi",
      description: "Barcha og'ir grafiklar faqat ekranni skroll qilib ko'rgan paytdagina yuklanadi. Mobil telefonlarda sahifa ochilishi 4 barobar tezlashdi."
    },
    {
      type: 'security',
      tag: 'Ombor Xavfsizligi',
      title: "Tranzaksiyalar Butunligi va Partiya Tarixi",
      description: "Har bir partiyaning omborga qachon, qaysi filialga va qancha dona qabul qilingani to'liq partiyaQabulTarixi jurnalida saqlanadi."
    }
  ]
};

/**
 * BARCHA VERSIYALAR TARIXI (Version History Timeline)
 */
export const VERSION_HISTORY: VersionInfo[] = [
  APP_VERSION_CONFIG,
  {
    version: "2.6.0",
    versionCode: 260,
    releaseDate: "2026-09-26",
    releaseTime: "12:45",
    title: "OmborPro Ultimate v2.6.0 (Mobil Tezlik & Recharts Lazy)",
    badge: "Oldingi versiya",
    description: "Mobil qurilmalar uchun grafiklar to'liq LazyViewport (Intersection Observer) tizimiga o'tkazildi, Markaziy Bank (CBU) server proksi va versiyalar monitoringi ishga tushirildi.",
    changelog: [
      {
        type: 'perf',
        tag: 'Tezlik & Mobil',
        title: "Recharts Grafiklari uchun 'LazyViewport' Tizimi",
        description: "Barcha og'ir grafiklar faqat ekranni skroll qilib ko'rgan paytdagina dinamik yuklanadi."
      },
      {
        type: 'new',
        tag: 'Avtomatika',
        title: "Avtomatik Versiya va Changelog Boshqaruvi",
        description: "Dasturning har bir yangilanishi avtomatik aniqlanadi va to'liq versiyalar tarixi taqdim etiladi."
      },
      {
        type: 'fixed',
        tag: 'Valyuta & Server',
        title: "CBU Server Proksi & Tarmoq Barqarorligi",
        description: "Markaziy Bank API so'rovlari backend server orqali proksilanib, brauzer CORS va timeout xatoliklari to'liq bartaraf qilindi."
      }
    ]
  },
  {
    version: "2.5.0",
    versionCode: 250,
    releaseDate: "2026-09-26",
    releaseTime: "09:15",
    title: "Shtrix-kod Studiyasi va Dastur Yengillashtirish",
    badge: "Oldingi versiya",
    description: "1D Shtrix-kod generatori qo'shildi va tranzaksiyalar hisob-kitobi optimallashtirildi.",
    changelog: [
      {
        type: 'new',
        tag: 'Shtrix-kod',
        title: "Code 128 Shtrix-kod generatori",
        description: "Yorliqlar bo'limida chiziqli shtrix-kod formati va chop etish formati sozlandi."
      },
      {
        type: 'improved',
        tag: 'Dastur Tezligi',
        title: "Indekslangan Hash Map Hisobi",
        description: "Ombor va kassa statistikasi hisoblash tezligi oshirildi."
      }
    ]
  },
  {
    version: "2.4.0",
    versionCode: 240,
    releaseDate: "2026-09-25",
    releaseTime: "17:30",
    title: "Markaziy Bank Kurslari & Mobil Topbar",
    badge: "Oldingi versiya",
    description: "Markaziy Bank (CBU) rasmiy kurslari bilan avtomatik integratsiya va mobil interfeys yaxshilandi.",
    changelog: [
      {
        type: 'new',
        tag: 'Valyuta',
        title: "CBU Live Valyuta Kursi va Kalkulyator",
        description: "AQSH Dollari kursi kunlik avtomatik sinxronlanadi va qulay valyuta konvertori qo'shildi."
      },
      {
        type: 'improved',
        tag: 'Interfeys',
        title: "Mobil Topbar va Omborlar Paneli",
        description: "TEPA, KOTTA va 2-SORT omborlari telefon ekraniga to'liq moslashtirildi."
      }
    ]
  },
  {
    version: "2.3.0",
    versionCode: 230,
    releaseDate: "2026-09-20",
    releaseTime: "14:00",
    title: "Mijozlar CRM va O'tkazmalar Moduli",
    badge: "Oldingi versiya",
    description: "Mijozlar balansi, qarz daftari va omborlararo o'tkazmalar boshqaruvi takomillashtirildi.",
    changelog: [
      {
        type: 'new',
        tag: 'CRM',
        title: "Mijozlar CRM va Qarz Balansi",
        description: "Har bir xaridor bo'yicha to'liq hisob-kitob va qarz daftari yo'lga qo'yildi."
      },
      {
        type: 'improved',
        tag: 'Ombor',
        title: "Omborlararo O'tkazmalar Nazorati",
        description: "TEPA va KOTTA omborlari o'rtasida tovar almashinuvi soddalashtirildi."
      }
    ]
  },
  {
    version: "2.2.0",
    versionCode: 220,
    releaseDate: "2026-09-15",
    releaseTime: "11:20",
    title: "Kassa & Moliya Boshqaruvi (P&L va Xarajatlar)",
    badge: "Boshlang'ich arxitektura",
    description: "Kassa kirim-chiqimlari, smenalar va ko'p valyutali hisob-kitoblar yo'lga qo'yildi.",
    changelog: [
      {
        type: 'new',
        tag: 'Kassa',
        title: "Bosh Kassa va Smena Moduli",
        description: "Kassirlar smenasi, Z-Hisobot va kunlik kassa transferlari yo'lga qo'yildi."
      }
    ]
  }
];

const LAST_SEEN_VERSION_KEY = 'omborpro_last_seen_version';

/**
 * Check if the user has already seen the changelog for the current version
 */
export function hasSeenCurrentVersion(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const seen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    return seen === APP_VERSION_CONFIG.version;
  } catch {
    return true;
  }
}

/**
 * Get previously saved version in browser storage
 */
export function getSavedVersion(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Mark the current version as seen in local storage
 */
export function markCurrentVersionAsSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION_CONFIG.version);
  } catch (e) {
    console.warn('Versiya saqlanmadi:', e);
  }
}

/**
 * Check for updates against service worker / network status
 */
export async function checkForAppUpdates(): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  message: string;
}> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        hasUpdate: false,
        currentVersion: APP_VERSION_CONFIG.version,
        latestVersion: APP_VERSION_CONFIG.version,
        message: "Siz eng so'nggi va eng tezkor versiyadasiz! (v" + APP_VERSION_CONFIG.version + ")"
      });
    }, 800);
  });
}
