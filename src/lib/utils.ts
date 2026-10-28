import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getNowStr() {
  return new Date().toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Operatsiya yoki guruh sanasi va vaqtidan Unix timestamp hisoblash
 */
export function parseTxTimestamp(item: { sana?: string; vaqt?: string | number; groupId?: string; id?: string } | null | undefined): number {
  if (!item || typeof item !== 'object') return 0;
  
  // 1. Agar vaqt o'zi to'g'ridan-to'g'ri raqamli timestamp bo'lsa
  if (typeof (item as any).vaqt === 'number' && (item as any).vaqt > 1600000000000) {
    return (item as any).vaqt;
  }
  
  // 2. groupId oxiridagi epoch timestamp (masalan: client_2026-09-28_..._1727500000000)
  if (item.groupId) {
    const groupIdStr = String(item.groupId);
    const parts = groupIdStr.split('_');
    const lastPart = parts[parts.length - 1];
    const num = Number(lastPart);
    if (!isNaN(num) && num > 1600000000000) {
      return num;
    }
  }

  // 3. sana (YYYY-MM-DD) va vaqt (HH:mm) birlashtirib parse qilish
  if (item.sana) {
    const sanaStr = String(item.sana);
    let timeStr = '00:00:00';
    if (item.vaqt !== undefined && item.vaqt !== null) {
      const vaqtStr = String(item.vaqt);
      if (vaqtStr.includes(',')) {
        const timePart = vaqtStr.split(',')[1]?.trim();
        if (timePart) timeStr = timePart.length === 5 ? `${timePart}:00` : timePart;
      } else if (vaqtStr.includes(':') && vaqtStr.length <= 8) {
        timeStr = vaqtStr.length === 5 ? `${vaqtStr}:00` : vaqtStr;
      }
    }
    const combinedStr = `${sanaStr}T${timeStr}`;
    const parsed = Date.parse(combinedStr);
    if (!isNaN(parsed)) return parsed;
    const dateOnlyParsed = Date.parse(sanaStr);
    if (!isNaN(dateOnlyParsed)) return dateOnlyParsed;
  }

  return 0;
}

/**
 * Operatsiyalar va guruhlarni eng oxirgi sana va vaqti bo'yicha kamayish tartibida saralash
 */
export function compareTxLatestFirst(a: any, b: any): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // 1. Sana bo'yicha (YYYY-MM-DD kamayish tartibida: eng yangi sana yuqorida)
  const dateA = String(a.sana || '');
  const dateB = String(b.sana || '');
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA);
  }

  // 2. Vaqt / Timestamp bo'yicha (eng yangi amal yuqorida)
  const timeA = parseTxTimestamp(a);
  const timeB = parseTxTimestamp(b);
  if (timeA !== timeB && timeA > 0 && timeB > 0) {
    return timeB - timeA;
  }

  // 3. Vaqt satri bo'yicha
  const vaqtA = String(a.vaqt || '');
  const vaqtB = String(b.vaqt || '');
  if (vaqtA !== vaqtB) {
    return vaqtB.localeCompare(vaqtA);
  }

  // 4. ID / GroupID bo'yicha
  const idA = String(a.id || a.groupId || '');
  const idB = String(b.id || b.groupId || '');
  return idB.localeCompare(idA);
}

export function getCat(modelName: string): 'qishki' | 'yozgi' | 'umumiy' {
  const l = modelName.toLowerCase();
  if (l.includes('mex')) return 'qishki';
  if (l.includes('sariq') || l.includes('seriy') || l.includes('setka')) return 'yozgi';
  return 'umumiy';
}

export function getGender(modelName: string): 'erkaklar' | 'ayollar' | 'umumiy' {
  const l = modelName.toLowerCase();
  if (l.includes('ayol') || l.includes('kabluk') || l.includes('tufli-a') || l.includes('sapog-a') || l.includes('ledi') || l.includes('lady')) {
    return 'ayollar';
  }
  if (l.includes('erkak') || l.includes('klassik') || l.includes('botinka') || l.includes('mokasin') || l.includes('krossovka') || l.includes('bertsy')) {
    return 'erkaklar';
  }
  return 'erkaklar'; // default shoe category for standard inventory
}

export const ALL_SIZES = ['39', '40', '41', '42', '43', '44', '45'];

export const UZBEKISTAN_REGIONS = [
  'Toshkent shahri',
  'Toshkent viloyati',
  'Samarqand viloyati',
  'Farg‘ona viloyati',
  'Andijon viloyati',
  'Namangan viloyati',
  'Buxoro viloyati',
  'Qashqadaryo viloyati',
  'Surxondaryo viloyati',
  'Xorazm viloyati',
  'Navoiy viloyati',
  'Jizzax viloyati',
  'Sirdaryo viloyati',
  'Qoraqalpog‘iston Respublikasi',
  'Tojikiston Respublikasi',
  'Qirg‘iziston Respublikasi',
  'Qozog‘iston Respublikasi',
  'Turkmaniston Respublikasi',
  'Rossiya Federatsiyasi',
  'Turkiya Respublikasi',
  'Boshqa davlatlar (Eksport)'
] as const;

export type UzbekistanRegion = typeof UZBEKISTAN_REGIONS[number];

export function toArray<T>(obj: Record<string, T> | undefined): T[] {
  return obj ? Object.values(obj) : [];
}
export function formatUzs(val: number): string {
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatCompact(val: number): string {
  if (!val) return '0';
  if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace(/\.0$/, '') + ' mlrd';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + ' mln';
  if (val >= 10000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + ' ming';
  return new Intl.NumberFormat('uz-UZ').format(val);
}

export function isCorrectionTx(t: { amal?: string; isCorrection?: boolean; kimdan?: string; izoh?: string } | undefined | null): boolean {
  if (!t) return false;
  if (t.amal === 'tuzatish') return true;
  if (t.isCorrection) return true;
  const sender = (t.kimdan || '').toLowerCase();
  const note = (t.izoh || '').toLowerCase();
  if (
    sender.includes('admin tahrir') ||
    sender.includes('admin tuzatish') ||
    sender.includes('o\'lcham tuzatish') ||
    sender.includes('audit') ||
    sender.includes('inventarizatsiya') ||
    sender.includes('reviyzya') ||
    sender.includes('spisaniya') ||
    sender.includes('ortiqcha') ||
    sender.includes('kamomad') ||
    note.includes('o\'lcham tahrirlandi') ||
    note.includes('qo\'lda tahrirlandi') ||
    note.includes('tahrirlandi:') ||
    note.includes('inventarizatsiya') ||
    note.includes('reviyzya')
  ) {
    return true;
  }
  return false;
}

/**
 * Formats telephone numbers into standard readable format (+998 94 398 42 50).
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');

  // Uzbekistan 12 digits: 998943984250 -> +998 94 398 42 50
  if (digits.startsWith('998') && digits.length === 12) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }

  // Uzbekistan 9 digits: 943984250 -> +998 94 398 42 50
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }

  // Tajikistan 12 digits: 992927771234 -> +992 92 777 12 34
  if (digits.startsWith('992') && digits.length === 12) {
    return `+992 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }

  // Kyrgyzstan 12 digits: 996555123456 -> +996 555 12 34 56
  if (digits.startsWith('996') && digits.length === 12) {
    return `+996 ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }

  // Kazakhstan / Russia 11 digits: 77011234567 -> +7 701 123 45 67
  if ((digits.startsWith('7') || digits.startsWith('8')) && digits.length === 11) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }

  // Turkey 12 digits: 905321234567 -> +90 532 123 45 67
  if (digits.startsWith('90') && digits.length === 12) {
    return `+90 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }

  // Partial Uzbekistan starting with +998 or 998
  if (digits.startsWith('998') && digits.length > 3) {
    const rest = digits.slice(3);
    let out = '+998';
    if (rest.length > 0) out += ' ' + rest.slice(0, 2);
    if (rest.length > 2) out += ' ' + rest.slice(2, 5);
    if (rest.length > 5) out += ' ' + rest.slice(5, 7);
    if (rest.length > 7) out += ' ' + rest.slice(7, 9);
    return out;
  }

  // If already formatted with spaces and starts with +, return as-is
  if (trimmed.startsWith('+') && trimmed.includes(' ')) {
    return trimmed;
  }

  // Fallback: if starts with + and has digits
  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Handles typing in phone input fields, auto-inserting spaces for readability (+998 94 398 42 50).
 */
export function formatPhoneInput(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();

  // Foreign numbers check
  if (trimmed.startsWith('+7')) {
    const digits = trimmed.replace(/\D/g, '');
    const rest = digits.startsWith('7') ? digits.slice(1) : digits;
    let res = '+7';
    if (rest.length > 0) res += ' ' + rest.slice(0, 3);
    if (rest.length > 3) res += ' ' + rest.slice(3, 6);
    if (rest.length > 6) res += ' ' + rest.slice(6, 8);
    if (rest.length > 8) res += ' ' + rest.slice(8, 10);
    return res;
  }
  if (trimmed.startsWith('+992')) {
    const digits = trimmed.replace(/\D/g, '');
    const rest = digits.startsWith('992') ? digits.slice(3) : digits;
    let res = '+992';
    if (rest.length > 0) res += ' ' + rest.slice(0, 2);
    if (rest.length > 2) res += ' ' + rest.slice(2, 5);
    if (rest.length > 5) res += ' ' + rest.slice(5, 7);
    if (rest.length > 7) res += ' ' + rest.slice(7, 9);
    return res;
  }
  if (trimmed.startsWith('+996')) {
    const digits = trimmed.replace(/\D/g, '');
    const rest = digits.startsWith('996') ? digits.slice(3) : digits;
    let res = '+996';
    if (rest.length > 0) res += ' ' + rest.slice(0, 3);
    if (rest.length > 3) res += ' ' + rest.slice(3, 5);
    if (rest.length > 5) res += ' ' + rest.slice(5, 7);
    if (rest.length > 7) res += ' ' + rest.slice(7, 9);
    return res;
  }
  if (trimmed.startsWith('+90')) {
    const digits = trimmed.replace(/\D/g, '');
    const rest = digits.startsWith('90') ? digits.slice(2) : digits;
    let res = '+90';
    if (rest.length > 0) res += ' ' + rest.slice(0, 3);
    if (rest.length > 3) res += ' ' + rest.slice(3, 6);
    if (rest.length > 6) res += ' ' + rest.slice(6, 8);
    if (rest.length > 8) res += ' ' + rest.slice(8, 10);
    return res;
  }

  // Default: Uzbekistan format (+998 94 398 42 50)
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  // Max 9 digits for Uzbek local number
  digits = digits.slice(0, 9);

  if (digits.length === 0) {
    return val.startsWith('+') ? '+' : '';
  }

  let formatted = '+998';
  if (digits.length > 0) {
    formatted += ' ' + digits.slice(0, 2);
  }
  if (digits.length > 2) {
    formatted += ' ' + digits.slice(2, 5);
  }
  if (digits.length > 5) {
    formatted += ' ' + digits.slice(5, 7);
  }
  if (digits.length > 7) {
    formatted += ' ' + digits.slice(7, 9);
  }

  return formatted;
}
