export type Role = 'admin' | 'omborchi' | 'kuzatuvchi';

export interface User {
  id: string;
  ism: string;
  rol: Role;
  pin: string;
}

export type Amal = 'kirim' | 'chiqim' | 'otkazma-out' | 'otkazma-in' | 'tolov' | 'vozvrat' | 'brak' | 'tuzatish';

export type VozvratSabab = 
  | 'olcham_togri_kelmadi' 
  | 'ortiqcha_olingan' 
  | 'brak_nuqsonli' 
  | 'model_almashish' 
  | 'mijoz_rad_etdi' 
  | 'boshqa';

export type VozvratHolat = 'yaroqli' | 'brak';

export type VozvratTolovTuri = 
  | 'kassa_chiqim' 
  | 'qarzdan_ayirish' 
  | 'almashtirish' 
  | 'tolanmadi';

export interface VozvratItem {
  id: string;
  sana: string;
  vaqt: string;
  ombor: WarehouseName;
  model: string;
  sizes: Record<string, number>;
  jamiSoni: number;
  mijoz: string;
  sabab: VozvratSabab;
  holat: VozvratHolat; // yaroqli -> ombor qoldig'iga qaytadi, brak -> brak fondiga o'tadi
  summa: number; // qaytgan tovar qiymati (UZS)
  tolovQaytarishTuri: VozvratTolovTuri;
  kassaTuri?: KassaTuri;
  xodim: string;
  izoh: string;
  groupId?: string;
}

export type BrakNuqsonTuri = 
  | 'chok_tutilishi' 
  | 'taglik_kochinishi' 
  | 'teri_yirtilishi' 
  | 'rang_dog' 
  | 'razmer_notogri' 
  | 'furnitura_nuqson' 
  | 'boshqa';

export type BrakManba = 'mijoz_vozvrat' | 'ombor_aniqlangan' | 'fabrika_kirim';

export type BrakStatus = 
  | 'omborda' 
  | 'fabrikaga_yuborildi' 
  | 'utsenka_sotildi' 
  | 'hisobdan_chiqarildi';

export interface BrakItem {
  id: string;
  sana: string;
  vaqt: string;
  ombor: WarehouseName;
  model: string;
  sizes: Record<string, number>;
  jamiSoni: number;
  manba: BrakManba;
  nuqsonTuri: BrakNuqsonTuri;
  status: BrakStatus;
  xodim: string;
  izoh: string;
  vozvratId?: string;
  mijoz?: string;
  tannarx?: number; // bir juft yoki jami tannarx
  halQilinganSana?: string;
  halQilinganIzoh?: string;
  utsenkaNarxi?: number; // agar arzonlashtirib sotilgan bo'lsa
  kassaTuri?: KassaTuri;
}

export interface Transaction {
  id: string;
  vaqt: string;
  sana: string;
  amal: Amal;
  model: string;
  olcham: string;
  soni: number;
  kimdan?: string;
  kimga?: string;
  izoh?: string;
  xodim: string;
  summa?: number;
  foyda?: number;
  groupId?: string;
  isCorrection?: boolean;
  sort?: '1' | '2';
  ombor?: WarehouseName;
  kassaId?: string;
  kassaTuri?: KassaTuri;
  isKassaPayment?: boolean;
}

export type WarehouseName = 'tepa' | 'kotta' | 'sort2';

export interface Otkazma {
  id: string;
  vaqt: string;
  sana?: string;
  model: string;
  olcham: string;
  soni: number;
  from: WarehouseName;
  to: WarehouseName;
  izoh: string;
  qaytibKelganSoni?: number;
  groupId?: string;
}

export interface Kontragent {
  id: string;
  ism: string;
  tel: string;
  manzil: string;
  viloyat?: string;
  kategoriya: string;
  izoh: string;
  jami: number;
  xaridlarSoni: number;
  birinchiXarid: string;
  oxirgiXarid: string;
  qoshilganSana: string;
  balans?: number;
  kreditLimiti?: number;
}

export interface WarehouseData {
  stock: Record<string, Record<string, number>>;
  transactions: Transaction[];
}

export interface AuditLog {
  id: string;
  date: string;
  user: string;
  action: string;
  entity: string;
  details: string;
  severity: 'info' | 'warning' | 'high';
}

export interface TemplateItem {
  model: string;
  olcham: string;
  soni: number;
}

export interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
}

export interface PriceHistory {
  date: string;
  cost: number;
  sale: number;
  changedBy: string;
}

export interface ModelPrice {
  cost: number;
  sale: number;
  history: PriceHistory[];
}

export interface PendingIncomingItem {
  id: string;
  model: string;
  totalCount: number;
  date: string;
  sender?: string;
  status?: 'pending' | 'completed' | 'rejected';
}

export type KassaTuri = 'naqd_uzs' | 'naqd_usd' | 'karta_uzs' | 'bank_uzs';

export type XarajatKategoriya = 
  | 'ish_haqi' 
  | 'ijara' 
  | 'transport' 
  | 'kommunal' 
  | 'postavshik' 
  | 'soliq_bank' 
  | 'tushlik_xojalik' 
  | 'marketing' 
  | 'boshqa';

export type KassaHarakatTuri = 'kirim' | 'chiqim';

export interface KassaHarakati {
  id: string;
  vaqt: string;
  sana: string;
  tur: KassaHarakatTuri; // kirim (daromad/kapital) yoki chiqim (xarajat)
  kategoriya: XarajatKategoriya | 'savdo_tushumi' | 'qarz_tolovi' | 'kapital' | 'boshqa_daromad';
  summa: number; // asosiy qiymat
  valyuta: 'UZS' | 'USD';
  kurs: number; // valyuta kursi (masalan 12850)
  summaUzs: number; // so'mdagi hisoblangan qiymati
  kassaTuri: KassaTuri;
  kimgaKimdan: string;
  izoh: string;
  xodim: string;
  boglanishId?: string;
}

export interface KassaBalansi {
  naqd_uzs: number;
  naqd_usd: number;
  karta_uzs: number;
  bank_uzs: number;
}

export interface ValyutaTarixiItem {
  id: string;
  sana: string;
  vaqt: string;
  kurs: number;
  cbuKurs: number;
  manba: 'cbu_avto' | 'bozor_avto' | 'qolda';
  farq: number; // oldingi kursga nisbatan
  xodim: string;
}

export interface ValyutaKursConfig {
  joriyKurs: number;
  cbuKurs: number;
  cbuDiff: number;
  cbuSana: string;
  manba: 'cbu_avto' | 'bozor_avto' | 'qolda';
  bozorUstamaTuri: 'foiz' | 'summa';
  bozorUstamaQiymati: number; // masalan 0.5 foiz yoki 50 so'm
  avtoYangilash: boolean;
  oxirgiYangilanish: string;
  yangilaganXodim?: string;
  tarix?: ValyutaTarixiItem[];
}

export interface ValyutaCbuItem {
  id: number;
  Code: string;
  Ccy: string;
  CcyNm_RU: string;
  CcyNm_UZ: string;
  CcyNm_UZC: string;
  CcyNm_EN: string;
  Nominal: string;
  Rate: string;
  Diff: string;
  Date: string;
}

export interface KassaTransfer {
  id: string;
  sana: string;
  vaqt: string;
  fromKassa: KassaTuri;
  toKassa: KassaTuri;
  fromSumma: number;
  fromValyuta: 'UZS' | 'USD';
  toSumma: number;
  toValyuta: 'UZS' | 'USD';
  kurs: number; // konvertatsiya kursi
  cbuKurs?: number;
  forexGainLossUzs?: number; // Kurs farqidan foyda (+) yoki zarar (-)
  xodim: string;
  izoh?: string;
}

export interface KassirSmena {
  id: string;
  zReportNumber: number;
  ochilganVaqt: string;
  ochganXodim: string;
  yopilganVaqt?: string;
  yopganXodim?: string;
  status: 'ochiq' | 'yopilgan';
  boshlangichKassa: Record<KassaTuri, number>;
  yopilishKassa?: Record<KassaTuri, number>; // kassir sanagan real naqd
  kutilganKassa?: Record<KassaTuri, number>; // tizim hisoblagan kassa
  farqlar?: Record<KassaTuri, number>; // real - kutilgan (musbat = izlishek, manfiy = kamomad)
  jamiSavdoKirimUzs?: number;
  jamiXarajatChiqimUzs?: number;
  jamiQarzUndirildiUzs?: number;
  izoh?: string;
}

export interface PostavshikQarzi {
  id: string;
  nomi: string;
  tel?: string;
  xomashyoTuri: string; // Masalan: Taglik, Teri, Fason, Furnitura, Quti
  qarzSummaUzs: number;
  qarzSummaUsd?: number;
  valyuta: 'UZS' | 'USD';
  oxirgiTolanganSana?: string;
  oxirgiTolanganSumma?: number;
  izoh?: string;
  sana: string;
}

export interface XarajatBudjeti {
  kategoriya: XarajatKategoriya;
  oylikLimitUzs: number;
  ogohlantirishFoizi?: number; // Masalan 80%
  izoh?: string;
}

export type TelegramMessageType = 
  | 'kirim' 
  | 'chiqim' 
  | 'qoldiq' 
  | 'kunlik_hisobot' 
  | 'kam_qolgan' 
  | 'vozvrat' 
  | 'brak' 
  | 'kassa' 
  | 'test' 
  | 'boshqa';

export type TelegramLogStatus = 'yuborildi' | 'xato';

export interface TelegramLog {
  id: string;
  vaqt: string;
  sana: string;
  turi: TelegramMessageType;
  status: TelegramLogStatus;
  chatId: string;
  xabar?: string;
  matn?: string;
  xatolik?: string;
  xodim?: string;
  ombor?: string;
  meta?: Record<string, any>;
}

export interface DbState {
  tepa: WarehouseData;
  kotta: WarehouseData;
  sort2: WarehouseData;
  otkazmalar: Otkazma[];
  bekorQilinganOtkazmalar: Otkazma[];
  bekorQilinganKirimlar: Transaction[];
  bekorQilinganChiqimlar: Transaction[];
  users: User[];
  muzlatilgan: string[];
  kontragentlar: Kontragent[];
  auditLogs?: AuditLog[];
  telegramLogs?: TelegramLog[];
  templates?: Template[];
  prices?: Record<string, ModelPrice>;
  pendingKirim?: PendingIncomingItem[];
  kassaHarakatlari?: KassaHarakati[];
  kassaBalansi?: KassaBalansi;
  kassaTransferlar?: KassaTransfer[];
  smenalar?: KassirSmena[];
  joriySmena?: KassirSmena | null;
  postavshiklar?: PostavshikQarzi[];
  xarajatBudjetlari?: Record<string, number>;
  valyutaKursi?: number;
  valyutaKursConfig?: ValyutaKursConfig;
  vozvratlar?: VozvratItem[];
  braklar?: BrakItem[];
  telegramConfig?: TelegramConfig;
  qabulQilinganPartiyaIds?: string[];
  partiyaQabulTarixi?: Record<string, PartiyaQabulYozuvi>;
  archivedModels?: string[];
}

export interface PartiyaQabulYozuvi {
  jamiQabul: number;
  oxirgiSana: string;
  oxirgiVaqt?: string;
  kirimTarixi?: {
    sana: string;
    vaqt?: string;
    soni: number;
    ombor: string;
    xodim: string;
  }[];
}

export interface TelegramConfig {
  isEnabled: boolean;
  botToken: string;
  chatId: string;
  chatName?: string;
  notifyKirim?: boolean; // Yangi tovar kirimi haqida xabar
  notifyDailyReport: boolean;
  dailyReportTime: string; // e.g. "20:00"
  notifyLowStock: boolean;
  lowStockThreshold: number; // e.g. 10
  notifyBigSale: boolean;
  bigSaleQtyThreshold: number; // e.g. 50 juft
  bigSaleSummaThreshold: number; // e.g. 10000000 UZS
  notifyVozvrat: boolean;
  notifyBrak: boolean;
  notifyKassaKirimChiqim: boolean;
  lastDailyReportSentDate?: string;
  lastTestedAt?: string;
}

export interface XodimTarixi {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastLogin: string;
  firstLogin?: string;
  loginCount: number;
  selectedUserName?: string;
  selectedUserRole?: string;
  userAgent?: string;
  history?: {
    date: string;
    selectedUser?: string;
    selectedRole?: string;
  }[];
}

export type Theme = 'light' | 'dark';
