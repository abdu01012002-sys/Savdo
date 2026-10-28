/**
 * O'zbek tilida raqamni so'z bilan ifodalash (Kassa orderlari va kvitansiyalar uchun)
 */

const birliklar = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const onliklar = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"];
const darajalar = ['', 'ming', 'million', 'milliard', 'trillion'];

function uchXonaliSoz(son: number): string {
  let res = '';
  const yuzlik = Math.floor(son / 100);
  const onlik = Math.floor((son % 100) / 10);
  const birlik = son % 10;

  if (yuzlik > 0) {
    res += birliklar[yuzlik] + ' yuz ';
  }
  if (onlik > 0) {
    res += onliklar[onlik] + ' ';
  }
  if (birlik > 0) {
    res += birliklar[birlik] + ' ';
  }

  return res.trim();
}

export function numberToWordsUz(num: number, currency: 'UZS' | 'USD' = 'UZS'): string {
  if (!num || isNaN(num) || num === 0) {
    return currency === 'USD' ? 'nol AQSH dollari' : "nol so'm";
  }

  const rounded = Math.floor(Math.abs(num));
  let str = rounded.toString();
  let groups: number[] = [];

  while (str.length > 0) {
    groups.unshift(parseInt(str.slice(-3), 10));
    str = str.slice(0, -3);
  }

  const parts: string[] = [];
  const len = groups.length;

  for (let i = 0; i < len; i++) {
    const val = groups[i];
    const darajaIdx = len - 1 - i;
    if (val > 0) {
      const soz = uchXonaliSoz(val);
      const daraja = darajalar[darajaIdx] || '';
      parts.push(`${soz} ${daraja}`.trim());
    }
  }

  const natija = parts.join(' ').trim();
  const capNatija = natija.charAt(0).toUpperCase() + natija.slice(1);

  if (currency === 'USD') {
    return `${capNatija} AQSH dollari`;
  }
  return `${capNatija} so'm`;
}
