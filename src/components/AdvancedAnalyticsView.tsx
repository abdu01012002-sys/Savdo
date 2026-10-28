import React, { useMemo, useState } from 'react';
import { useDb } from '../context/DbContext';
import { isCorrectionTx, formatCompact, formatUzs, cn, UZBEKISTAN_REGIONS, getTodayStr, formatPhoneNumber } from '../lib/utils';
import { 
  MapPin, 
  Layers, 
  TrendingUp, 
  AlertOctagon, 
  DollarSign, 
  ShoppingBag, 
  ArrowUpRight, 
  Sparkles, 
  Download, 
  Filter,
  CheckCircle2,
  Clock,
  Compass,
  AlertTriangle,
  Edit2,
  Check,
  X,
  ChevronDown,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';
import * as XLSX from 'xlsx';
import { LazyViewport } from './common/LazyViewport';

interface AdvancedAnalyticsProps {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

// O'zbekiston viloyatlari va Xorijiy/Qo'shni Respublikalar (Eksport) bo'yicha keng qamrovli lug'at
const REGION_KEYWORDS: Record<string, string[]> = {
  // --- O'ZBEKISTON HUDUDLARI ---
  'Toshkent shahri': [
    'toshkent shahri', 'toshkent sh', 'tashkent', 'chilonzor', 'yunusobod', 'sergeli', 'chorsu', 
    'abu saxiy', 'abusaxiy', 'bekto\'pi', 'bektopi', 'o\'rikzor', 'urikzor', 'qo\'yliq', 'qoyliq', 
    'shayxontohur', 'mirzo ulug\'bek', 'yashnobod', 'mirobod', 'uchtepa', 'olmazor', 'yakkasaroy', 'bektemir',
    'yangihayot', 'qoraqamish', 'chig\'atoy', 'toshkent'
  ],
  'Toshkent viloyati': [
    'toshkent viloyati', 'toshkent vil', 'chirchiq', 'angren', 'olmaliq', 'bekobod', 'yangiyo‘l', 'yangiyul', 
    'parkent', 'bo\'stonliq', 'zangiota', 'qibray', 'chinaz', 'chinoz', 'ohangaron', 'piskent', 'oqqo\'rg\'on',
    'quyichirchiq', 'yuqorichirchiq', 'o\'rtachirchiq', 'ortachirchiq', 'keles', 'g\'azalkent', 'gazalkent'
  ],
  'Samarqand viloyati': [
    'samarqand', 'samarkand', 'urgut', 'kattaqo‘rg‘on', 'kattaqurgon', 'ishtixon', 'pastdarg‘om', 'pastdargom', 
    'bulung‘ur', 'bulungur', 'jomboy', 'payariq', 'toyloq', 'oqdaryo', 'narpay', 'qo\'shrabot', 'paxtachi',
    'samarqand sh', 'chelok', 'juma'
  ],
  'Farg‘ona viloyati': [
    'farg‘ona', 'fargona', 'fergana', 'qo‘qon', 'qoqon', 'quva', 'marg‘ilon', 'margilon', 'rishton', 
    'oltiariq', 'beshariq', 'uchko\'prik', 'uchkoprik', 'bog\'dod', 'yozovon', 'toshloq', 'so\'x', 'quvasoy',
    'dang‘ara', 'dangara', 'furqat', 'fargona vil'
  ],
  'Andijon viloyati': [
    'andijon', 'andijan', 'asaka', 'shahrixon', 'xonobod', 'paxtaobod', 'qo‘rg‘ontepa', 'qorgontepa', 
    'marhamat', 'baliqchi', 'buloqboshi', 'bo\'ston', 'izboskan', 'jalaquduq', 'ulug\'nor', 'xo\'jaobod',
    'oltinko\'l', 'oltinkol', 'andijon sh'
  ],
  'Namangan viloyati': [
    'namangan', 'chust', 'pop', 'kosonsoy', 'uchqo‘rg‘on', 'uchqurgon', 'chortoq', 'to‘raqo‘rg‘on', 
    'toraqorgon', 'norin', 'mingbuloq', 'yangiqo\'rg\'on', 'davlatobod', 'uychi', 'namangan sh'
  ],
  'Buxoro viloyati': [
    'buxoro', 'bukhara', 'g‘ijduvon', 'gijduvon', 'kogon', 'vobkent', 'qorako‘l', 'qorakol', 
    'jondor', 'shofirkon', 'peshku', 'romitan', 'olot', 'qorovulbozor', 'buxoro sh'
  ],
  'Qashqadaryo viloyati': [
    'qashqadaryo', 'qarshi', 'shahrisabz', 'kitob', 'koson', 'g‘uzor', 'guzor', 'yakkabog‘', 
    'yakkabog', 'muborak', 'chiroqchi', 'kamashi', 'qamashi', 'nishon', 'kasbi', 'mirishkor', 'dexqonobod',
    'dehqonobod', 'ko\'kdala', 'kokdala', 'qarshi sh'
  ],
  'Surxondaryo viloyati': [
    'surxondaryo', 'termiz', 'denov', 'sherobod', 'boysun', 'sho‘rchi', 'shorchi', 
    'qumqo‘rg‘on', 'qumqurgon', 'sariosiyo', 'jarqo\'rg\'on', 'oltinsoy', 'angor', 'muzrabot', 'uzun',
    'qiziriq', 'bandixon', 'termiz sh'
  ],
  'Xorazm viloyati': [
    'xorazm', 'urganch', 'xiva', 'xonqa', 'hazorasp', 'gurlan', 'shovot', 
    'bog\'ot', 'yangiariq', 'yangibozor', 'qo\'shko\'pir', 'qoshkopir', 'tuproqqal\'a', 'urganch sh'
  ],
  'Navoiy viloyati': [
    'navoiy', 'navoi', 'zarafshon', 'karmana', 'qiziltepa', 'uchquduq', 'nurota', 'xatirchi', 'konimex', 'tomdi', 'navoiy sh'
  ],
  'Jizzax viloyati': [
    'jizzax', 'jizzakh', 'zomin', 'g‘allaorol', 'gallaorol', 'paxtakor', 'do‘stlik', 'dostlik', 
    'zarbdor', 'baxmal', 'forish', 'sharof rashidov', 'mirzacho\'l', 'arnasoy', 'yangiobod', 'jizzax sh'
  ],
  'Sirdaryo viloyati': [
    'sirdaryo', 'guliston', 'yangiyer', 'shirin', 'boyovut', 'baxt', 'sayxunobod', 'oqoltin', 'sardoba', 'xovos', 'mirzaobod', 'guliston sh'
  ],
  'Qoraqalpog‘iston Respublikasi': [
    'qoraqalpog‘iston', 'qoraqalpoq', 'nukus', 'qo‘ng‘irot', 'qongirot', 'beruniy', 'to‘rtko‘l', 
    'turtkol', 'chimboy', 'taxtako‘pir', 'amudaryo', 'xo\'jayli', 'shumanay', 'qonliko\'l', 'mo\'ynoq', 'ellikqala',
    'bo\'zatov', 'qorao\'zak', 'kegeyli', 'nukus sh'
  ],

  // --- XALQARO VA QO'SHNI RESPUBLIKALAR (EKSPORT) ---
  'Tojikiston Respublikasi': [
    'tojikiston', 'tojikston', 'tojikiston res', 'tajikistan', 'tadzhikistan', 'dushanbe', 'dushanba', 
    'xo‘jand', 'xojand', 'khujand', 'hujand', 'sug‘d', 'sogd', 'panjakent', 'penjikent', 'boxtar', 'bokhtar', 
    'hisor', 'gissar', 'istaravshan', 'isfara', 'konibodom', 'kanibadam', 'tursunzoda', 'regar', 'kulyab', 
    'ko‘lob', 'kolob', 'vanj', 'khorog', 'xorug', 'korvon', 'tojik', 'tj'
  ],
  'Qirg‘iziston Respublikasi': [
    'qirg‘iziston', 'qirgiziston', 'qirg\'iziston', 'qirgizston', 'qirgiziston res', 'kyrgyzstan', 'kirgiziya', 
    'kirgizstan', 'bishkek', 'o‘sh', 'osh', 'jalolobod', 'jalal-abad', 'jalalabad', 'qorasuv', 'kara-suu', 
    'karasuu', 'botken', 'batken', 'qadamjoy', 'kadamjay', 'talas', 'norin-kg', 'naryn', 'issiqko‘l', 
    'issyk-kul', 'cho‘lponota', 'cholpon-ata', 'to‘qmoq', 'tokmok', 'o‘zgan', 'uzgen', 'dordoy', 'madina bozori', 
    'qirgiz', 'kirgiz', 'kg'
  ],
  'Qozog‘iston Respublikasi': [
    'qozog‘iston', 'qozogiston', 'qozog\'iston', 'qozogston', 'qozogiston res', 'kazakhstan', 'kazaxstan', 
    'kazahstan', 'olmaota', 'almaty', 'almati', 'almata', 'ostona', 'astana', 'nur-sultan', 'nursulton', 
    'chimkent', 'shymkent', 'shimkent', 'turkiston', 'turkistan', 'taraz', 'jambul', 'sariog‘och', 'saryagash', 
    'saryagach', 'jetisay', 'zhetisay', 'qizilo‘rda', 'kyzylorda', 'aqtau', 'aktau', 'oqtov', 'aktobe', 'oqtobe', 
    'atyrau', 'atbi', 'pavlodar', 'qaragandi', 'karaganda', 'semey', 'baraxolka', 'qozog', 'kazakh', 'kz'
  ],
  'Turkmaniston Respublikasi': [
    'turkmaniston', 'turkmanston', 'turkmenistan', 'ashxobod', 'ashgabat', 'ashxabad', 'dashoguz', 'toshhovuz', 
    'tashauz', 'lebap', 'turkmanobod', 'turkmenabat', 'charjou', 'chorjoy', 'mari', 'mary', 'marv', 'bolqon', 
    'balkanabat', 'turkmanboshi', 'turkmenbashi', 'turkman', 'turkmen', 'tm'
  ],
  'Rossiya Federatsiyasi': [
    'rossiya', 'rossiya federatsiyasi', 'russia', 'rf', 'moskva', 'moscow', 'sankt-peterburg', 'piter', 'spb', 
    'novosibirsk', 'yekaterinburg', 'ekaterinburg', 'qozon', 'kazan', 'samara', 'nizhny novgorod', 'chelyabinsk', 
    'krasnoyarsk', 'ufa', 'rostov', 'krasnodar', 'omsk', 'voronej', 'volgograd', 'perm', 'tyumen', 'saratov', 
    'tolyatti', 'barnaul', 'irkutsk', 'vladivostok', 'sadovod', 'lyublino', 'rus', 'rubl'
  ],
  'Turkiya Respublikasi': [
    'turkiya', 'turkiya respublikasi', 'turkey', 'turkiye', 'istanbul', 'stambul', 'anqara', 'ankara', 'izmir', 
    'bursa', 'antaliya', 'antalya', 'gaziantep', 'konya', 'adana', 'denizli', 'laleli', 'gungoren', 'merter', 
    'osmanbey', 'turk'
  ],
  'Boshqa davlatlar (Eksport)': [
    'dubay', 'dubai', 'baa', 'uae', 'xitoy', 'china', 'eron', 'iran', 'ozarbayjon', 'azerbaijan', 'boku', 'baku', 
    'gruziya', 'georgia', 'tbilisi', 'armaniston', 'armenia', 'yerevan', 'belarus', 'minsk', 'ukraina', 'ukraine', 
    'kiev', 'moldova', 'polsha', 'germaniya', 'aqsh', 'usa', 'amerika', 'eksport', 'export', 'chet el'
  ]
};

// Matnni tozalash va standartlashtirish yordamchisi
function normalizeSearchText(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[‘'`ʼʻ"]/g, '')
    .replace(/[–—_.,!?:;()\/\\#№@+*-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Viloyat va Respublikani aniqlash yordamchi funksiyasi
export function smartDetectRegion(clientName: string, clientViloyat?: string, clientAddress?: string, note?: string, phone?: string): string {
  // 1. Agar mijoz profilida aniq viloyat tanlangan bo'lsa
  if (clientViloyat && clientViloyat.trim()) {
    const v = clientViloyat.trim();
    const vNorm = normalizeSearchText(v);

    // To'g'ridan-to'g'ri lug'atdan izlash
    for (const reg of Object.keys(REGION_KEYWORDS)) {
      const regNorm = normalizeSearchText(reg);
      if (vNorm === regNorm || 
          vNorm.includes(regNorm.replace(/ (viloyati|shahri|respublikasi|federatsiyasi)/, '')) ||
          regNorm.includes(vNorm)) {
        return reg;
      }
    }

    // Sinonim kalit so'zlar bo'yicha profil viloyatini tekshirish
    for (const [reg, keywords] of Object.entries(REGION_KEYWORDS)) {
      for (const kw of keywords) {
        const kwNorm = normalizeSearchText(kw);
        if (vNorm.includes(kwNorm) || kwNorm.includes(vNorm)) {
          return reg;
        }
      }
    }

    if (v !== 'Boshqa / Aniqlanmagan' && v !== 'Eksport (Chet el)') {
      return v;
    }
  }

  // 2. Telefon xalqaro kodi yoki shahar kodi orqali viloyat/davlatni aniqlash
  if (phone) {
    const p = phone.replace(/[^\d]/g, '');
    // Xalqaro qo'ng'iroq kodlari
    if (p.startsWith('992') || p.includes('992')) return 'Tojikiston Respublikasi';
    if (p.startsWith('996') || p.includes('996')) return 'Qirg‘iziston Respublikasi';
    if (p.startsWith('77') || p.startsWith('76') || p.includes('770') || p.includes('771') || p.includes('775') || p.includes('777')) return 'Qozog‘iston Respublikasi';
    if (p.startsWith('993') || p.includes('993')) return 'Turkmaniston Respublikasi';
    if (p.startsWith('79') || p.startsWith('74') || p.startsWith('78') || p.startsWith('73') || (p.startsWith('7') && p.length >= 11 && !p.startsWith('77') && !p.startsWith('76'))) return 'Rossiya Federatsiyasi';
    if (p.startsWith('90') || p.includes('905')) return 'Turkiya Respublikasi';
    if (p.startsWith('971') || p.startsWith('86') || p.startsWith('994') || p.startsWith('995') || p.startsWith('374')) return 'Boshqa davlatlar (Eksport)';

    // O'zbekiston shahar/hudud kodlari
    if (p.includes('99871') || p.includes('99878')) return 'Toshkent shahri';
    if (p.includes('99870')) return 'Toshkent viloyati';
    if (p.includes('99866')) return 'Samarqand viloyati';
    if (p.includes('99873')) return 'Farg‘ona viloyati';
    if (p.includes('99874')) return 'Andijon viloyati';
    if (p.includes('99869')) return 'Namangan viloyati';
    if (p.includes('99865')) return 'Buxoro viloyati';
    if (p.includes('99875')) return 'Qashqadaryo viloyati';
    if (p.includes('99876')) return 'Surxondaryo viloyati';
    if (p.includes('99862')) return 'Xorazm viloyati';
    if (p.includes('99879')) return 'Navoiy viloyati';
    if (p.includes('99872')) return 'Jizzax viloyati';
    if (p.includes('99867')) return 'Sirdaryo viloyati';
    if (p.includes('99861')) return 'Qoraqalpog‘iston Respublikasi';
  }

  // 3. Erkin matn bo'yicha qidiruv (ism, manzil, izoh)
  const fullText = normalizeSearchText(`${clientName || ''} ${clientAddress || ''} ${note || ''}`);
  const words = fullText.split(' ');
  
  for (const [reg, keywords] of Object.entries(REGION_KEYWORDS)) {
    for (const kw of keywords) {
      const kwNorm = normalizeSearchText(kw);
      if (!kwNorm) continue;

      // Qisqa so'zlar (<= 3 harf, masalan 'tj', 'kg', 'kz', 'rf', 'tm', 'osh', 'pop', 'sox') uchun butun so'z tekshiruvi
      if (kwNorm.length <= 3) {
        if (words.includes(kwNorm)) {
          return reg;
        }
      } else {
        // Uzun kalit so'zlar uchun matn ichida uchrashi
        if (fullText.includes(kwNorm)) {
          return reg;
        }
      }
    }
  }

  return 'Boshqa / Aniqlanmagan';
}

const REGION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#84cc16',
  '#d946ef', '#64748b', '#0284c7', '#e11d48', '#a855f7',
  '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2',
  '#ea580c', '#4f46e5'
];

export function AdvancedAnalyticsView({ dateFilter: propDateFilter, startDate: propStartDate, endDate: propEndDate }: AdvancedAnalyticsProps) {
  const { db, setDb } = useDb();
  const [activeSubTab, setActiveSubTab] = useState<'hudud' | 'razmer' | 'deadstock'>('hudud');
  
  // Local date filter overrides for flexibility inside analytics
  const [localDateFilter, setLocalDateFilter] = useState<string>(propDateFilter || 'all');
  const [selectedRegionModal, setSelectedRegionModal] = useState<string | null>(null);
  
  // Quick Region Assign state
  const [assigningClient, setAssigningClient] = useState<{ id?: string; name: string; tel?: string; manzil?: string; juft?: number } | null>(null);
  const [selectedAssignRegion, setSelectedAssignRegion] = useState<string>('');
  const [showAllUnassigned, setShowAllUnassigned] = useState<boolean>(false);

  const activeDateFilter = localDateFilter || propDateFilter || 'all';

  // 1. Filtrdan o'tgan barcha sof savdo (chiqim) tranzaksiyalari
  const filteredChiqim = useMemo(() => {
    const raw = [
      ...(db.tepa?.transactions || []),
      ...(db.kotta?.transactions || []),
      ...((db as any)?.transactions || [])
    ].filter(t => (t.amal === 'chiqim' || (t as any).amal === 'sotuv') && !isCorrectionTx(t));

    const todayStr = getTodayStr();
    const today = new Date();

    return raw.filter(t => {
      const sDate = (t.sana || '').slice(0, 10);
      if (!sDate) return true;

      switch (activeDateFilter) {
        case 'today':
          return sDate === todayStr;
        case 'yesterday': {
          const y = new Date();
          y.setDate(y.getDate() - 1);
          return sDate === y.toISOString().slice(0, 10);
        }
        case 'this_week': {
          const curr = new Date();
          const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
          const monday = new Date(curr.setDate(first));
          monday.setHours(0, 0, 0, 0);
          const mondayStr = monday.toISOString().slice(0, 10);
          return sDate >= mondayStr;
        }
        case 'this_month':
          return sDate.slice(0, 7) === todayStr.slice(0, 7);
        case 'this_year':
          return sDate.slice(0, 4) === todayStr.slice(0, 4);
        case 'all':
          return true;
        case 'custom':
        default: {
          if (propStartDate && sDate < propStartDate) return false;
          if (propEndDate && sDate > propEndDate) return false;
          return true;
        }
      }
    });
  }, [db, activeDateFilter, propStartDate, propEndDate]);

  // Kontragentlar lug'ati (ism -> Kontragent ob'ekti)
  const kontragentMap = useMemo(() => {
    const map = new Map<string, any>();
    (db.kontragentlar || []).forEach(k => {
      if (k.ism) {
        map.set(k.ism.trim().toLowerCase(), k);
      }
    });
    return map;
  }, [db.kontragentlar]);

  // Model narxlari (draft/current)
  const modelPrices = useMemo(() => {
    return {
      ...(db.prices || {}),
      ...((db.kotta as any)?.prices || {}),
      ...((db.tepa as any)?.prices || {})
    };
  }, [db]);

  // =========================================================================
  // A. HUDUDLAR (GEOGRAFIK) TAHLILI - DUAL SOURCE (TRANZAKSIYALAR + MIJOZLAR BAZASI)
  // =========================================================================
  const hududStats = useMemo(() => {
    const regionAgg: Record<string, {
      name: string;
      jamiJuft: number;
      jamiSumma: number;
      xaridlarSoni: number;
      topClients: Map<string, { name: string; juft: number; summa: number; tel?: string; manzil?: string }>;
      topModels: Record<string, number>;
    }> = {};

    const findKontragent = (name: string) => {
      if (!name) return null;
      const lower = name.toLowerCase().trim();
      if (kontragentMap.has(lower)) return kontragentMap.get(lower);
      for (const [kName, kObj] of kontragentMap.entries()) {
        if (kName.includes(lower) || lower.includes(kName)) return kObj;
      }
      return null;
    };

    const unassignedClients = new Map<string, { name: string; juft: number; summa: number; id?: string; tel?: string; manzil?: string }>();

    // 1. Agar tranzaksiyalar mavjud bo'lsa, tranzaksiyalar bo'yicha hisoblaymiz
    if (filteredChiqim.length > 0) {
      filteredChiqim.forEach(tx => {
        const clientName = (tx.kimdan || (tx as any).kimga || (tx as any).mijoz || (tx as any).client || tx.izoh || 'Noma\'lum xaridor').trim();
        const kInfo = findKontragent(clientName);
        const region = smartDetectRegion(clientName, kInfo?.viloyat, kInfo?.manzil, tx.izoh, kInfo?.tel);

        if (!regionAgg[region]) {
          regionAgg[region] = {
            name: region,
            jamiJuft: 0,
            jamiSumma: 0,
            xaridlarSoni: 0,
            topClients: new Map(),
            topModels: {}
          };
        }

        const soni = tx.soni || 0;
        const modelPrice = modelPrices[tx.model]?.selling || 0;
        const summa = tx.summa || (soni * modelPrice);

        regionAgg[region].jamiJuft += soni;
        regionAgg[region].jamiSumma += summa;
        regionAgg[region].xaridlarSoni += 1;

        if (clientName) {
          const clientEntry = regionAgg[region].topClients.get(clientName) || {
            name: clientName,
            juft: 0,
            summa: 0,
            tel: kInfo?.tel,
            manzil: kInfo?.manzil
          };
          clientEntry.juft += soni;
          clientEntry.summa += summa;
          regionAgg[region].topClients.set(clientName, clientEntry);
        }

        if (tx.model) {
          regionAgg[region].topModels[tx.model] = (regionAgg[region].topModels[tx.model] || 0) + soni;
        }

        // Agar aniqlanmagan bo'lsa
        if (region === 'Boshqa / Aniqlanmagan' && clientName && clientName !== "Noma'lum xaridor") {
          const curr = unassignedClients.get(clientName) || { 
            name: clientName, 
            juft: 0, 
            summa: 0, 
            id: kInfo?.id, 
            tel: kInfo?.tel, 
            manzil: kInfo?.manzil 
          };
          curr.juft += soni;
          curr.summa += summa;
          unassignedClients.set(clientName, curr);
        }
      });
    } else {
      // 2. Agar tanlangan davrda chiqim tranzaksiyalari yo'q bo'lsa, Mijozlar bazasidagi (Kontragentlar) ma'lumotlar bo'yicha hisoblaymiz
      (db.kontragentlar || []).forEach(k => {
        const clientName = k.ism.trim();
        const region = smartDetectRegion(clientName, k.viloyat, k.manzil, k.izoh, k.tel);

        if (!regionAgg[region]) {
          regionAgg[region] = {
            name: region,
            jamiJuft: 0,
            jamiSumma: 0,
            xaridlarSoni: 0,
            topClients: new Map(),
            topModels: {}
          };
        }

        const juft = k.jami || 0;
        // O'rtacha 1 juft poyabzal narxi taxminan 160 000 so'm yoki balansdan hisob
        const summa = (k.balans && k.balans > 0 ? k.balans : (juft * 160000));

        regionAgg[region].jamiJuft += juft;
        regionAgg[region].jamiSumma += summa;
        regionAgg[region].xaridlarSoni += k.xaridlarSoni || 1;

        regionAgg[region].topClients.set(clientName, {
          name: clientName,
          juft: juft,
          summa: summa,
          tel: k.tel,
          manzil: k.manzil
        });

        if (region === 'Boshqa / Aniqlanmagan' && clientName) {
          unassignedClients.set(clientName, {
            name: clientName,
            juft: juft,
            summa: summa,
            id: k.id,
            tel: k.tel,
            manzil: k.manzil
          });
        }
      });
    }

    // Barcha mijozlar orasidan viloyati belgilanmaganlarni ham ro'yxatga kiritamiz
    (db.kontragentlar || []).forEach(k => {
      if (!k.viloyat && !unassignedClients.has(k.ism.trim())) {
        unassignedClients.set(k.ism.trim(), {
          name: k.ism.trim(),
          juft: k.jami || 0,
          summa: k.balans || 0,
          id: k.id,
          tel: k.tel,
          manzil: k.manzil
        });
      }
    });

    const list = Object.values(regionAgg).map(r => {
      const topModelEntry = Object.entries(r.topModels).sort((a, b) => b[1] - a[1])[0];
      const sortedClients = Array.from(r.topClients.values()).sort((a, b) => b.juft - a.juft);
      return {
        ...r,
        clientCount: r.topClients.size,
        clientList: sortedClients,
        topModel: topModelEntry ? `${topModelEntry[0]} (${topModelEntry[1]} j.)` : (sortedClients[0] ? `${sortedClients[0].name}` : '—')
      };
    }).sort((a, b) => b.jamiJuft - a.jamiJuft);

    const totalJuftAll = list.reduce((sum, item) => sum + item.jamiJuft, 0);
    const totalSummaAll = list.reduce((sum, item) => sum + item.jamiSumma, 0);

    return {
      list,
      totalJuftAll,
      totalSummaAll,
      isBasedOnClientDb: filteredChiqim.length === 0 && (db.kontragentlar || []).length > 0,
      unassignedList: Array.from(unassignedClients.values()).sort((a, b) => b.juft - a.juft),
      chartData: list.slice(0, 8).map(r => ({
        name: r.name,
        juft: r.jamiJuft,
        summa: r.jamiSumma,
        share: totalJuftAll > 0 ? Math.round((r.jamiJuft / totalJuftAll) * 100) : 0
      }))
    };
  }, [filteredChiqim, db.kontragentlar, kontragentMap, modelPrices]);

  // Quick Assign Region Handler
  const handleAssignRegionSubmit = () => {
    if (!assigningClient || !selectedAssignRegion) {
      toast.error("Iltimos, viloyatni tanlang!");
      return;
    }

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      const clientName = assigningClient.name.trim();
      const existingIdx = draft.kontragentlar.findIndex(
        k => (assigningClient.id && k.id === assigningClient.id) || k.ism.trim().toLowerCase() === clientName.toLowerCase()
      );

      if (existingIdx >= 0) {
        draft.kontragentlar[existingIdx].viloyat = selectedAssignRegion;
      } else {
        draft.kontragentlar.unshift({
          id: Date.now().toString(),
          ism: clientName,
          tel: assigningClient.tel || '',
          manzil: assigningClient.manzil || '',
          viloyat: selectedAssignRegion,
          kategoriya: 'Ulgurji',
          izoh: 'Hududlar tahlilidan biriktirildi',
          balans: 0,
          jami: assigningClient.juft || 0,
          xaridlarSoni: 1,
          birinchiXarid: '',
          oxirgiXarid: '',
          qoshilganSana: new Date().toISOString()
        });
      }
      return draft;
    });

    toast.success(`«${assigningClient.name}» mijozi «${selectedAssignRegion}»ga muvaffaqiyatli biriktirildi!`);
    setAssigningClient(null);
    setSelectedAssignRegion('');
  };

  // Bulk Auto-Detect and Assign All Regions
  const handleBulkAutoAssignRegions = () => {
    let updatedCount = 0;
    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
      draft.kontragentlar = (draft.kontragentlar || []).map(k => {
        if (!k.viloyat || k.viloyat === 'Boshqa / Aniqlanmagan' || k.viloyat === 'Eksport (Chet el)') {
          const detected = smartDetectRegion(k.ism, undefined, k.manzil, k.izoh, k.tel);
          if (detected && detected !== 'Boshqa / Aniqlanmagan' && detected !== k.viloyat) {
            updatedCount++;
            return { ...k, viloyat: detected };
          }
        }
        return k;
      });
      return draft;
    });

    if (updatedCount > 0) {
      toast.success(`${updatedCount} ta mijozning hududi (viloyat/respublika) avtomatik aniqlanib biriktirildi!`);
    } else {
      toast.info("Mijozlar ism va manzillaridan yangi hududlar topilmadi. Qo'lda biriktirishingiz mumkin.");
    }
  };

  // =========================================================================
  // B. O'LCHAMLAR (RAZMERLAR) TAHLILI
  // =========================================================================
  const razmerStats = useMemo(() => {
    const sizeMap: Record<string, { size: string; soni: number; summa: number; count: number }> = {};

    filteredChiqim.forEach(tx => {
      const sz = (tx.olcham || 'Noma\'lum').trim();
      if (!sizeMap[sz]) {
        sizeMap[sz] = { size: sz, soni: 0, summa: 0, count: 0 };
      }
      const soni = tx.soni || 0;
      const modelPrice = modelPrices[tx.model]?.selling || 0;
      const summa = tx.summa || (soni * modelPrice);

      sizeMap[sz].soni += soni;
      sizeMap[sz].summa += summa;
      sizeMap[sz].count += 1;
    });

    // Raqamli o'lchamlarni tartiblash (38, 39, 40...)
    const list = Object.values(sizeMap).sort((a, b) => {
      const numA = parseInt(a.size, 10);
      const numB = parseInt(b.size, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size);
    });

    const totalSizeJuft = list.reduce((a, b) => a + b.soni, 0);

    // Eng ko'p sotilgan razmerlar reytingi (Top bo'yicha)
    const topBySize = [...list].sort((a, b) => b.soni - a.soni);

    return {
      list,
      topBySize,
      totalSizeJuft,
      chartData: list.map(s => ({
        name: `${s.size}-o'lcham`,
        shortName: s.size,
        soni: s.soni,
        share: totalSizeJuft > 0 ? Number(((s.soni / totalSizeJuft) * 100).toFixed(1)) : 0
      }))
    };
  }, [filteredChiqim, modelPrices]);

  // =========================================================================
  // C. MUZLAGAN MODELLAR VA HARAKATSIZ QOLDIQ (DEAD STOCK)
  // =========================================================================
  const deadStockStats = useMemo(() => {
    // Ombordagi barcha joriy qoldiqlar
    const allStock = { ...(db.tepa?.stock || {}), ...(db.kotta?.stock || {}) };
    
    // Har bir modelning jami qoldig'i
    const stockByModel: Record<string, { totalQty: number; sizes: Record<string, number> }> = {};
    Object.entries(allStock).forEach(([model, sizes]) => {
      if (!stockByModel[model]) stockByModel[model] = { totalQty: 0, sizes: {} };
      Object.entries(sizes || {}).forEach(([sz, qty]) => {
        if (qty > 0) {
          stockByModel[model].totalQty += qty;
          stockByModel[model].sizes[sz] = (stockByModel[model].sizes[sz] || 0) + qty;
        }
      });
    });

    // Oxirgi 30 kun va butun davr bo'yicha sotuv
    const salesLast30Days: Record<string, number> = {};
    const lastSaleDate: Record<string, string> = {};

    const rawChiqim = [...(db.tepa?.transactions || []), ...(db.kotta?.transactions || [])]
      .filter(t => t.amal === 'chiqim' && !isCorrectionTx(t));

    const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    rawChiqim.forEach(tx => {
      if (tx.model) {
        if (tx.sana >= thirtyDaysAgoStr) {
          salesLast30Days[tx.model] = (salesLast30Days[tx.model] || 0) + (tx.soni || 0);
        }
        if (!lastSaleDate[tx.model] || tx.sana > lastSaleDate[tx.model]) {
          lastSaleDate[tx.model] = tx.sana;
        }
      }
    });

    const deadList: Array<{
      model: string;
      stockQty: number;
      sales30d: number;
      lastDate: string;
      frozenValue: number;
      riskLevel: 'yuqori' | 'orta' | 'past';
      topSize: string;
    }> = [];

    let totalFrozenCapital = 0;
    let totalFrozenPairs = 0;

    Object.entries(stockByModel).forEach(([model, info]) => {
      const stockQty = info.totalQty;
      if (stockQty < 5) return; // Juda kam qoldiqni muzlagan deb hisoblamaymiz

      const sales30d = salesLast30Days[model] || 0;
      const lastDate = lastSaleDate[model] || 'Sotilmagan';
      const costPrice = modelPrices[model]?.cost || 0;
      const frozenValue = stockQty * (costPrice > 0 ? costPrice : 150000); // Agar tannarx bo'lmasa standart hisob

      // Agar oxirgi 30 kunda 0 ta yoki qoldiqqa nisbatan 5% dan kam sotilgan bo'lsa -> Muzlagan!
      if (sales30d === 0 || (sales30d <= 5 && stockQty >= 20)) {
        const topSz = Object.entries(info.sizes).sort((a, b) => b[1] - a[1])[0];
        const risk: 'yuqori' | 'orta' | 'past' = sales30d === 0 && stockQty >= 30 
          ? 'yuqori' 
          : stockQty >= 15 
          ? 'orta' 
          : 'past';

        totalFrozenCapital += frozenValue;
        totalFrozenPairs += stockQty;

        deadList.push({
          model,
          stockQty,
          sales30d,
          lastDate,
          frozenValue,
          riskLevel: risk,
          topSize: topSz ? `${topSz[0]}-o'lcham (${topSz[1]} j.)` : '—'
        });
      }
    });

    deadList.sort((a, b) => b.frozenValue - a.frozenValue);

    return {
      deadList,
      totalFrozenCapital,
      totalFrozenPairs
    };
  }, [db, modelPrices]);

  // Excel eksport
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    if (activeSubTab === 'hudud') {
      const data = hududStats.list.map(r => ({
        "Hudud / Viloyat": r.name,
        "Sotilgan (juft)": r.jamiJuft,
        "Ulush (%)": hududStats.totalJuftAll > 0 ? `${((r.jamiJuft / hududStats.totalJuftAll) * 100).toFixed(1)}%` : '0%',
        "Jami Summa (UZS/USD)": r.jamiSumma,
        "Xaridorlar soni": r.clientCount,
        "Top Model": r.topModel
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Hududlar Tahlili");
    } else if (activeSubTab === 'razmer') {
      const data = razmerStats.list.map(s => ({
        "O'lcham": `${s.size}-razmer`,
        "Sotilgan Juft": s.soni,
        "Savdo Ulushi (%)": razmerStats.totalSizeJuft > 0 ? `${((s.soni / razmerStats.totalSizeJuft) * 100).toFixed(1)}%` : '0%',
        "Bitimlar soni": s.count
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "O'lchamlar Tahlili");
    } else {
      const data = deadStockStats.deadList.map(d => ({
        "Model": d.model,
        "Muzlagan Qoldiq (juft)": d.stockQty,
        "Oxirgi 30 kunda sotuv": d.sales30d,
        "Oxirgi xarid sanasi": d.lastDate,
        "Muzlagan Zaxira Qiymati": d.frozenValue,
        "Xavf darajasi": d.riskLevel.toUpperCase(),
        "Asosiy qolgan razmer": d.topSize
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Muzlagan Modellar");
    }

    XLSX.writeFile(wb, `Tahlil_${activeSubTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
      
      {/* Sub-Tabs Switcher & Export */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg2)] border border-[var(--border)] p-2 rounded-2xl shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
          <button
            onClick={() => setActiveSubTab('hudud')}
            className={cn(
              "px-3.5 py-2 cursor-pointer text-xs font-black rounded-xl whitespace-nowrap transition-all flex items-center gap-2",
              activeSubTab === 'hudud'
                ? "bg-blue-600 text-white shadow-xs"
                : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
            )}
          >
            <MapPin size={15} />
            Hududlar (Viloyatlar) Tahlili
          </button>

          <button
            onClick={() => setActiveSubTab('razmer')}
            className={cn(
              "px-3.5 py-2 cursor-pointer text-xs font-black rounded-xl whitespace-nowrap transition-all flex items-center gap-2",
              activeSubTab === 'razmer'
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
            )}
          >
            <Layers size={15} />
            O'lchamlar (Razmerlar) Taqsimoti
          </button>

          <button
            onClick={() => setActiveSubTab('deadstock')}
            className={cn(
              "px-3.5 py-2 cursor-pointer text-xs font-black rounded-xl whitespace-nowrap transition-all flex items-center gap-2",
              activeSubTab === 'deadstock'
                ? "bg-rose-600 text-white shadow-xs"
                : "text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
            )}
          >
            <AlertOctagon size={15} />
            Muzlagan Modellar (Dead Stock)
            {deadStockStats.deadList.length > 0 && (
              <span className="px-1.5 py-0.2 bg-white/20 text-white rounded-full text-[10px] font-black">
                {deadStockStats.deadList.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'hudud' && hududStats.unassignedList.length > 0 && (
            <button
              onClick={handleBulkAutoAssignRegions}
              className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Mijozlar ism va manzillaridan viloyatlarni avtomatik topib biriktirish"
            >
              <Sparkles size={14} className="text-amber-500" />
              Avto-biriktirish ({hududStats.unassignedList.length})
            </button>
          )}

          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Download size={14} className="text-blue-500" />
            Excel yuklash
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. HUDUDLAR TAHLILI KO'RINISHI */}
      {/* ========================================================================= */}
      {activeSubTab === 'hudud' && (
        <div className="flex flex-col gap-5">
          {/* Quick Filter Header & Data Source Status */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[var(--bg2)] border border-[var(--border)] p-3 rounded-2xl shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-[var(--text2)] flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-500" /> Davr:
              </span>
              {[
                { id: 'all', label: 'Barcha vaqt' },
                { id: 'this_month', label: 'Shu oy' },
                { id: 'this_week', label: 'Shu hafta' },
                { id: 'today', label: 'Bugun' },
                { id: 'this_year', label: 'Yillik' }
              ].map(period => (
                <button
                  key={period.id}
                  onClick={() => setLocalDateFilter(period.id)}
                  className={cn(
                    "px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all",
                    activeDateFilter === period.id
                      ? "bg-blue-600 text-white shadow-xs font-black"
                      : "bg-[var(--bg)] text-[var(--text3)] hover:text-[var(--text)] border border-[var(--border)]"
                  )}
                >
                  {period.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5",
                hududStats.isBasedOnClientDb
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/25"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
              )}>
                <span className={cn("w-2 h-2 rounded-full", hududStats.isBasedOnClientDb ? "bg-amber-500" : "bg-emerald-500")} />
                {hududStats.isBasedOnClientDb 
                  ? "Mijozlar bazasi hisobidan shakllandi" 
                  : "Chiqim tranzaksiyalari asosida"}
              </span>
            </div>
          </div>

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <Compass size={14} className="text-blue-500" /> Faol Hududlar
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-[var(--text)]">{hududStats.list.length} ta</span>
                <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">Xarid amalga oshirilgan hududlar</p>
              </div>
            </div>

            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={14} className="text-emerald-500" /> Jami Sotilgan Juft
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {hududStats.totalJuftAll.toLocaleString()} <span className="text-xs font-bold">juft</span>
                </span>
                <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">Tanlangan davr mobaynida</p>
              </div>
            </div>

            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" /> Asosiy Yetakchi Hudud
              </span>
              <div className="mt-2">
                <span className="text-lg font-black text-[var(--text)] truncate block">
                  {hududStats.list[0]?.name || '—'}
                </span>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                  {hududStats.list[0] ? `${hududStats.list[0].jamiJuft.toLocaleString()} juft (${hududStats.totalJuftAll > 0 ? Math.round((hududStats.list[0].jamiJuft / hududStats.totalJuftAll) * 100) : 0}%)` : '—'}
                </p>
              </div>
            </div>

            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={14} className="text-purple-500" /> Jami Tushum Qiymati
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {formatCompact(hududStats.totalSummaAll)}
                </span>
                <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">Mintaqalar bo'yicha savdo</p>
              </div>
            </div>
          </div>

          {/* Chart & Geographic Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Bar Chart: Top 8 Regions */}
            <div className="lg:col-span-7 bg-[var(--bg2)] border border-[var(--border)] p-5 rounded-3xl shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-[var(--text)]">Viloyatlar bo'yicha Savdo Hajmi (Juft)</h3>
                  <p className="text-xs text-[var(--text3)] font-medium">Eng ko'p xarid qiluvchi yetakchi hududlar</p>
                </div>
              </div>

              <LazyViewport fallbackHeight="280px" placeholderLabel="Viloyatlar grafigi yuklanmoqda...">
                <div className="h-[280px] w-full">
                  {hududStats.chartData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <Compass size={36} className="text-zinc-400 mb-2 opacity-60" />
                      <p className="text-xs font-bold text-[var(--text3)]">Bu davr uchun ma'lumot mavjud emas</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hududStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fill: 'var(--text2)', fontSize: 11, fontWeight: 'bold' }} 
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={45}
                        />
                        <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', borderRadius: '16px', fontSize: '12px' }}
                          formatter={(val: any) => [`${Number(val).toLocaleString()} juft`, 'Savdo']}
                        />
                        <Bar dataKey="juft" radius={[8, 8, 0, 0]}>
                          {hududStats.chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={REGION_COLORS[index % REGION_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </LazyViewport>
            </div>

            {/* Region Share Breakdown */}
            <div className="lg:col-span-5 bg-[var(--bg2)] border border-[var(--border)] p-5 rounded-3xl shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-[var(--text)] mb-1">Mintaqaviy Ulush Taqsimoti</h3>
                <p className="text-xs text-[var(--text3)] font-medium mb-4">Umumiy sotuvdagi foiz hisobida (batafsil ko'rish uchun bosing)</p>

                <div className="flex flex-col gap-3">
                  {hududStats.list.slice(0, 5).map((r, i) => {
                    const pct = hududStats.totalJuftAll > 0 ? Math.round((r.jamiJuft / hududStats.totalJuftAll) * 100) : 0;
                    return (
                      <div 
                        key={r.name} 
                        onClick={() => setSelectedRegionModal(r.name)}
                        className="flex flex-col gap-1.5 p-2 rounded-xl hover:bg-[var(--bg)] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-2 text-[var(--text)]">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: REGION_COLORS[i % REGION_COLORS.length] }} />
                            {r.name}
                          </span>
                          <span className="text-[var(--text2)] font-black">
                            {r.jamiJuft.toLocaleString()} j. <span className="text-blue-500">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500" 
                            style={{ 
                              width: `${pct}%`,
                              backgroundColor: REGION_COLORS[i % REGION_COLORS.length]
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold text-[var(--text3)]">
                <span>Boshqa barcha hududlar ulushi:</span>
                <span className="text-[var(--text)] font-black">
                  {hududStats.list.slice(5).reduce((acc, curr) => acc + curr.jamiJuft, 0).toLocaleString()} juft
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Regions Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">Barcha Hududlar Ro'yxati va Strategik Tafsilotlar</h3>
                <p className="text-xs text-[var(--text3)] font-medium">Mijozlar ro'yxatini ko'rish uchun hudud qatoriga bosing</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3.5 pl-5">#</th>
                    <th className="p-3.5">Hudud / Viloyat</th>
                    <th className="p-3.5 text-right">Sotilgan Hajm</th>
                    <th className="p-3.5 text-center">Bozor Ulushi</th>
                    <th className="p-3.5 text-right">Umumiy Qiymat</th>
                    <th className="p-3.5 text-center">Faol Xaridorlar</th>
                    <th className="p-3.5 pr-5">Eng Xaridorgir Model / Xaridor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {hududStats.list.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[var(--text3)] font-semibold">
                        Bu davr uchun hududiy ma'lumot topilmadi. Yuqoridagi davr filtrini «Barcha vaqt»ga o'tkazing yoki Mijozlar bazasiga viloyat kiriting.
                      </td>
                    </tr>
                  ) : (
                    hududStats.list.map((r, idx) => {
                      const sharePct = hududStats.totalJuftAll > 0 
                        ? ((r.jamiJuft / hududStats.totalJuftAll) * 100).toFixed(1) 
                        : '0';

                      return (
                        <tr 
                          key={r.name} 
                          onClick={() => setSelectedRegionModal(r.name)}
                          className="hover:bg-[var(--bg)] transition-colors cursor-pointer"
                          title="Batafsil mijozlar ro'yxatini ko'rish"
                        >
                          <td className="p-3.5 pl-5 font-black text-[var(--text3)]">{idx + 1}</td>
                          <td className="p-3.5 font-bold text-[var(--text)] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: REGION_COLORS[idx % REGION_COLORS.length] }} />
                            {r.name}
                          </td>
                          <td className="p-3.5 text-right font-black text-blue-600 dark:text-blue-400">
                            {r.jamiJuft.toLocaleString()} <span className="text-[10px] font-bold text-[var(--text3)]">j.</span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {sharePct}%
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {formatCompact(r.jamiSumma)}
                          </td>
                          <td className="p-3.5 text-center font-bold text-[var(--text2)]">
                            👤 {r.clientCount} ta
                          </td>
                          <td className="p-3.5 pr-5 font-bold text-[var(--text)]">
                            👞 {r.topModel}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Assign Warning Card if there are Unassigned Clients */}
          {hududStats.unassignedList.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--text)]">
                      Hududi aniqlanmagan mijozlar ({hududStats.unassignedList.length} ta)
                    </h3>
                    <p className="text-xs text-[var(--text3)] font-medium">
                      Quyidagi mijozlarning profilida viloyat belgilanmagan. Bir marta viloyat biriktirsangiz, statistika to'liq aniq bo'ladi.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleBulkAutoAssignRegions}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Sparkles size={14} />
                  Barchasini avtomatik aniqlash
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(showAllUnassigned ? hududStats.unassignedList : hududStats.unassignedList.slice(0, 9)).map(u => (
                  <div key={u.name} className="bg-[var(--bg2)] border border-[var(--border)] p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-[var(--text)] truncate">{u.name}</div>
                      <div className="text-[10px] font-bold text-[var(--text3)]">
                        {u.juft.toLocaleString()} juft • {formatCompact(u.summa)}
                      </div>
                    </div>

                    {assigningClient?.name === u.name ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={selectedAssignRegion}
                          onChange={(e) => setSelectedAssignRegion(e.target.value)}
                          className="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text)] focus:outline-none focus:border-blue-500 max-w-[150px]"
                        >
                          <option value="">Tanlang...</option>
                          <optgroup label="O'zbekiston hududlari">
                            {UZBEKISTAN_REGIONS.filter(r => !r.includes('Respublikasi') && !r.includes('Eksport') || r === 'Qoraqalpog‘iston Respublikasi').map(reg => (
                              <option key={reg} value={reg}>{reg}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Xorijiy / Eksport Respublikalari">
                            {UZBEKISTAN_REGIONS.filter(r => r.includes('Respublikasi') && r !== 'Qoraqalpog‘iston Respublikasi' || r.includes('Federatsiyasi') || r.includes('Eksport')).map(reg => (
                              <option key={reg} value={reg}>{reg}</option>
                            ))}
                          </optgroup>
                        </select>
                        <button
                          onClick={handleAssignRegionSubmit}
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                          title="Saqlash"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => { setAssigningClient(null); setSelectedAssignRegion(''); }}
                          className="p-1.5 bg-zinc-500/20 hover:bg-zinc-500/30 text-[var(--text2)] rounded-lg transition-colors cursor-pointer"
                          title="Bekor qilish"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAssigningClient(u);
                          setSelectedAssignRegion(UZBEKISTAN_REGIONS[0]);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-black text-[11px] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        <MapPin size={12} />
                        Hududni tanlash
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {hududStats.unassignedList.length > 9 && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() => setShowAllUnassigned(!showAllUnassigned)}
                    className="px-4 py-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-bold text-[var(--text)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    {showAllUnassigned ? "Kamroq ko'rsatish (9 tagacha)" : `Barchasini ko'rsatish (${hududStats.unassignedList.length} ta mijoz)`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Region Details Modal */}
          {selectedRegionModal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-600 flex items-center justify-center">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-[var(--text)]">{selectedRegionModal}</h3>
                      <p className="text-xs text-[var(--text3)] font-medium">Ushbu viloyatdagi xaridorlar va savdo ko'rsatkichlari</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRegionModal(null)}
                    className="p-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex flex-col gap-4">
                  {(() => {
                    const regData = hududStats.list.find(r => r.name === selectedRegionModal);
                    if (!regData) return <p className="text-center text-xs text-[var(--text3)]">Ma'lumot topilmadi</p>;

                    return (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-[var(--bg)] border border-[var(--border)] p-3 rounded-2xl text-center">
                            <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Jami Juft</span>
                            <div className="text-lg font-black text-blue-600">{regData.jamiJuft.toLocaleString()} j.</div>
                          </div>
                          <div className="bg-[var(--bg)] border border-[var(--border)] p-3 rounded-2xl text-center">
                            <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Jami Summa</span>
                            <div className="text-lg font-black text-emerald-600">{formatCompact(regData.jamiSumma)}</div>
                          </div>
                          <div className="bg-[var(--bg)] border border-[var(--border)] p-3 rounded-2xl text-center">
                            <span className="text-[10px] font-bold text-[var(--text3)] uppercase">Xaridorlar</span>
                            <div className="text-lg font-black text-purple-600">{regData.clientCount} ta</div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-black text-[var(--text)] mb-2">Mijozlar Ro'yxati:</h4>
                          <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--bg)]">
                            {regData.clientList?.length === 0 ? (
                              <div className="p-4 text-center text-xs text-[var(--text3)]">Mijozlar topilmadi</div>
                            ) : (
                              regData.clientList?.map((c, i) => (
                                <div key={c.name} className="p-3 flex items-center justify-between gap-2 hover:bg-[var(--bg2)] transition-colors">
                                  <div className="min-w-0">
                                    <div className="text-xs font-black text-[var(--text)] truncate">
                                      {i + 1}. {c.name}
                                    </div>
                                    {c.tel && <div className="text-[11px] text-[var(--text3)] font-semibold">📞 {formatPhoneNumber(c.tel)}</div>}
                                    {c.manzil && <div className="text-[10px] text-[var(--text3)] truncate">📍 {c.manzil}</div>}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-xs font-black text-blue-600">{c.juft.toLocaleString()} juft</div>
                                    <div className="text-[11px] font-bold text-[var(--text3)]">{formatCompact(c.summa)}</div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="p-4 border-t border-[var(--border)] flex justify-end bg-[var(--bg)]">
                  <button
                    onClick={() => setSelectedRegionModal(null)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-colors cursor-pointer"
                  >
                    Yopish
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. O'LCHAMLAR (RAZMERLAR) TAHLILI */}
      {/* ========================================================================= */}
      {activeSubTab === 'razmer' && (
        <div className="flex flex-col gap-5">
          {/* Top 3 Razmer Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {razmerStats.topBySize.slice(0, 3).map((top, idx) => {
              const medal = idx === 0 ? '🥇 1-O\'rin (Top)' : idx === 1 ? '🥈 2-O\'rin' : '🥉 3-O\'rin';
              const share = razmerStats.totalSizeJuft > 0 ? Math.round((top.soni / razmerStats.totalSizeJuft) * 100) : 0;
              return (
                <div key={top.size} className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-500">{medal}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      {share}% ulush
                    </span>
                  </div>
                  <div className="my-2">
                    <span className="text-3xl font-black text-[var(--text)]">{top.size}</span>
                    <span className="text-xs font-bold text-[var(--text3)] ml-1">o'lcham</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--text2)] pt-2 border-t border-[var(--border)]">
                    <span>Sotilgan:</span>
                    <span className="font-black text-blue-600 dark:text-blue-400">{top.soni.toLocaleString()} juft</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Size Distribution Bar Chart */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] p-5 rounded-3xl shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">O'lchamlar (Razmerlar) Bo'yicha Talab Taqsimoti</h3>
                <p className="text-xs text-[var(--text3)] font-medium">Ishlab chiqarish va bichuv sexiga aniq reja berish uchun</p>
              </div>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl">
                Jami: {razmerStats.totalSizeJuft.toLocaleString()} juft
              </span>
            </div>

            <LazyViewport fallbackHeight="280px" placeholderLabel="O'lchamlar taqsimoti yuklanmoqda...">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={razmerStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                    <XAxis 
                      dataKey="shortName" 
                      tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 'bold' }} 
                    />
                    <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', borderRadius: '16px', fontSize: '12px' }}
                      formatter={(val: any, name: any, item: any) => [`${Number(val).toLocaleString()} juft (${item.payload.share}%)`, 'Sotuv']}
                    />
                    <Bar dataKey="soni" radius={[8, 8, 0, 0]} fill="#3b82f6">
                      {razmerStats.chartData.map((entry) => (
                        <Cell 
                          key={`cell-${entry.shortName}`} 
                          fill={entry.share >= 20 ? '#10b981' : entry.share >= 10 ? '#3b82f6' : '#94a3b8'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </LazyViewport>
          </div>

          {/* Size Recommendation Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-black text-[var(--text)]">O'lchamlar Bo'yicha To'liq Hisobot va Tavsiya</h3>
              <p className="text-xs text-[var(--text3)] font-medium">Bichuv sexida qaysi razmerga qancha foiz teri ajratish kerakligi</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3.5 pl-5">O'lcham</th>
                    <th className="p-3.5 text-right">Sotilgan Miqdor</th>
                    <th className="p-3.5 text-center">Talab Ulushi</th>
                    <th className="p-3.5 text-center">Tranzaksiyalar Soni</th>
                    <th className="p-3.5 pr-5">Sexga Tavsiya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {razmerStats.list.map((s) => {
                    const share = razmerStats.totalSizeJuft > 0 
                      ? ((s.soni / razmerStats.totalSizeJuft) * 100).toFixed(1) 
                      : '0';
                    const shareNum = parseFloat(share);

                    return (
                      <tr key={s.size} className="hover:bg-[var(--bg)] transition-colors">
                        <td className="p-3.5 pl-5 font-black text-sm text-[var(--text)]">{s.size}-o'lcham</td>
                        <td className="p-3.5 text-right font-black text-blue-600 dark:text-blue-400">
                          {s.soni.toLocaleString()} juft
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] font-black border",
                            shareNum >= 20 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" :
                            shareNum >= 10 ? "bg-blue-500/10 text-blue-600 border-blue-500/25" :
                            "bg-zinc-500/10 text-zinc-600 border-zinc-500/25"
                          )}>
                            {share}%
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-[var(--text2)]">{s.count} marta</td>
                        <td className="p-3.5 pr-5 font-bold">
                          {shareNum >= 20 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">🔥 Asosiy o'lcham (Ishlab chiqarishni ko'paytirish)</span>
                          ) : shareNum >= 10 ? (
                            <span className="text-blue-600 dark:text-blue-400">✅ Barqaror o'lcham (Standart hajm)</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">⚠️ Kam talab (Ehtiyotkorlik bilan chiqarish)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MUZLAGAN MODELLAR (DEAD STOCK) TAHLILI */}
      {/* ========================================================================= */}
      {activeSubTab === 'deadstock' && (
        <div className="flex flex-col gap-5">
          {/* Warning Banner / KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-rose-500/10 border border-rose-500/25 p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon size={15} /> Muzlagan Modellar Soni
              </span>
              <div className="mt-2">
                <span className="text-3xl font-black text-rose-600">{deadStockStats.deadList.length} ta</span>
                <p className="text-[11px] text-rose-700/80 font-semibold mt-0.5">Oxirgi 30 kunda sotuv bo'lmagan</p>
              </div>
            </div>

            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={14} className="text-amber-500" /> Muzlagan Zaxira Miqdori
              </span>
              <div className="mt-2">
                <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
                  {deadStockStats.totalFrozenPairs.toLocaleString()} <span className="text-xs font-bold">juft</span>
                </span>
                <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">Omborda harakatsiz yotgan</p>
              </div>
            </div>

            <div className="bg-[var(--bg2)] border border-[var(--border)] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={14} className="text-purple-500" /> Muzlagan Kapital Qiymati
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {formatCompact(deadStockStats.totalFrozenCapital)}
                </span>
                <p className="text-[11px] text-[var(--text3)] font-medium mt-0.5">Tezroq aylanmaga kiritish zarur</p>
              </div>
            </div>
          </div>

          {/* Dead Stock Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  Muzlagan Modellar Ro'yxati va Zudlik Bilan Ko'riladigan Choralar
                </h3>
                <p className="text-xs text-[var(--text3)] font-medium">Ushbu modellarga chegirma berish, aksiyalar o'tkazish yoki ishlab chiqarishni to'xtatish tavsiya etiladi</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text3)] font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3.5 pl-5">Model Nomi</th>
                    <th className="p-3.5 text-right">Ombordagi Qoldiq</th>
                    <th className="p-3.5 text-center">30 Kundagi Savdo</th>
                    <th className="p-3.5 text-center">Oxirgi Xarid Sanasi</th>
                    <th className="p-3.5 text-right">Muzlagan Qiymat</th>
                    <th className="p-3.5 text-center">Asosiy Razmer</th>
                    <th className="p-3.5 pr-5">Tavsiya etilgan Chora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {deadStockStats.deadList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-emerald-600 font-bold">
                        🎉 Ajoyib! Omborda 30 kundan ortiq muzlab qolgan model yo'q, tovarlar aylanmasi yuqori.
                      </td>
                    </tr>
                  ) : (
                    deadStockStats.deadList.map((d) => (
                      <tr key={d.model} className="hover:bg-[var(--bg)] transition-colors">
                        <td className="p-3.5 pl-5 font-black text-sm text-[var(--text)]">👞 {d.model}</td>
                        <td className="p-3.5 text-right font-black text-rose-600">
                          {d.stockQty.toLocaleString()} juft
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/10 text-rose-600 border border-rose-500/20">
                            {d.sales30d} juft
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-[var(--text3)]">
                          <Clock size={12} className="inline mr-1 text-zinc-400" />
                          {d.lastDate}
                        </td>
                        <td className="p-3.5 text-right font-black text-purple-600 dark:text-purple-400">
                          {formatCompact(d.frozenValue)}
                        </td>
                        <td className="p-3.5 text-center font-bold text-[var(--text2)]">
                          {d.topSize}
                        </td>
                        <td className="p-3.5 pr-5">
                          {d.riskLevel === 'yuqori' ? (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-rose-500/15 text-rose-600 border border-rose-500/30">
                              ⚡ Zudlik bilan aksiya / Chegirma
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-amber-500/15 text-amber-600 border border-amber-500/30">
                              ⚠️ Mijozlarga maxsus taklif berish
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
