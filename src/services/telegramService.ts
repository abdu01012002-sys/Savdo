import { DbState, TelegramConfig, WarehouseName, TelegramLog, TelegramMessageType, TelegramLogStatus } from '../types';
import { formatUzs, getTodayStr, getNowStr } from '../lib/utils';

export interface TelegramSendResult {
  success: boolean;
  message?: string;
  chatResults?: { chatId: string; success: boolean; error?: string }[];
  log?: TelegramLog;
}

/**
 * Generate a new Telegram log entry
 */
export const createTelegramLog = (
  turi: TelegramMessageType,
  status: TelegramLogStatus,
  chatId: string,
  xabar?: string,
  xatolik?: string,
  xodim?: string,
  ombor?: string,
  meta?: Record<string, any>
): TelegramLog => {
  return {
    id: 'tlog_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    vaqt: new Date().toISOString(),
    sana: getTodayStr(),
    turi,
    status,
    chatId,
    xabar,
    matn: xabar,
    xatolik,
    xodim,
    ombor,
    meta
  };
};

/**
 * Append a Telegram log entry into DbState
 */
export const appendTelegramLog = (
  setDb: React.Dispatch<React.SetStateAction<DbState>> | undefined,
  log: TelegramLog
) => {
  if (!setDb) return;
  setDb(prev => {
    const existing = prev.telegramLogs || [];
    return {
      ...prev,
      telegramLogs: [log, ...existing].slice(0, 500)
    };
  });
};

/**
 * Clean and parse chat IDs (supports comma, space, semicolon separated list of IDs)
 */
export const parseChatIds = (rawChatId: string): string[] => {
  if (!rawChatId) return [];
  return rawChatId
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
};

/**
 * Send raw HTML message to one or multiple Telegram chat IDs
 */
export const sendTelegramMessage = async (
  botToken: string,
  chatId: string,
  htmlText: string,
  options?: {
    turi?: TelegramMessageType;
    xodim?: string;
    ombor?: string;
    setDb?: React.Dispatch<React.SetStateAction<DbState>>;
    meta?: Record<string, any>;
  }
): Promise<TelegramSendResult> => {
  const cleanToken = botToken?.trim();
  const targetTuri: TelegramMessageType = options?.turi || 'boshqa';

  if (!cleanToken) {
    const errorMsg = "Bot Token kiritilmagan!";
    const log = createTelegramLog(targetTuri, 'xato', chatId || 'N/A', htmlText, errorMsg, options?.xodim, options?.ombor, options?.meta);
    if (options?.setDb) appendTelegramLog(options.setDb, log);
    return { success: false, message: errorMsg, log };
  }

  const targetIds = parseChatIds(chatId);
  if (targetIds.length === 0) {
    const errorMsg = "Chat ID kiritilmagan!";
    const log = createTelegramLog(targetTuri, 'xato', 'N/A', htmlText, errorMsg, options?.xodim, options?.ombor, options?.meta);
    if (options?.setDb) appendTelegramLog(options.setDb, log);
    return { success: false, message: errorMsg, log };
  }

  const results: { chatId: string; success: boolean; error?: string }[] = [];
  let atLeastOneSuccess = false;

  for (const id of targetIds) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: id,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const resData = await response.json();
      if (resData.ok) {
        results.push({ chatId: id, success: true });
        atLeastOneSuccess = true;
      } else {
        results.push({
          chatId: id,
          success: false,
          error: resData.description || `Telegram xatolik kodi: ${resData.error_code}`
        });
      }
    } catch (err: any) {
      // If direct fetch fails (e.g. adblocker or browser network policy), fallback to backend proxy
      try {
        const proxyRes = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: cleanToken,
            chatId: id,
            text: htmlText
          })
        });
        const proxyData = await proxyRes.json();
        if (proxyData.success) {
          results.push({ chatId: id, success: true });
          atLeastOneSuccess = true;
        } else {
          results.push({
            chatId: id,
            success: false,
            error: proxyData.message || 'Tarmoq xatosi'
          });
        }
      } catch (proxyErr: any) {
        results.push({
          chatId: id,
          success: false,
          error: err?.message || 'Tarmoq xatosi'
        });
      }
    }
  }

  const logStatus: TelegramLogStatus = atLeastOneSuccess ? 'yuborildi' : 'xato';
  const firstError = results.find(r => !r.success)?.error;
  const log = createTelegramLog(
    targetTuri,
    logStatus,
    targetIds.join(', '),
    htmlText,
    firstError,
    options?.xodim,
    options?.ombor,
    options?.meta
  );

  if (options?.setDb) {
    appendTelegramLog(options.setDb, log);
  }

  if (atLeastOneSuccess) {
    return {
      success: true,
      message: `Xabar muvaffaqiyatli jo'natildi (${results.filter(r => r.success).length}/${targetIds.length})`,
      chatResults: results,
      log
    };
  } else {
    const firstErr = firstError || "Noma'lum xatolik";
    return {
      success: false,
      message: `Telegramga xabar yuborib bo'lmadi: ${firstErr}`,
      chatResults: results,
      log
    };
  }
};

/**
 * Test Telegram Bot connection
 */
export const testTelegramConnection = async (
  botToken: string,
  chatId: string,
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<{ success: boolean; message: string; botUsername?: string; log?: TelegramLog }> => {
  const cleanToken = botToken?.trim();
  if (!cleanToken) {
    const errorMsg = 'Bot Token kiritilmagan!';
    const log = createTelegramLog('test', 'xato', chatId || 'N/A', undefined, errorMsg);
    if (setDb) appendTelegramLog(setDb, log);
    return { success: false, message: errorMsg, log };
  }

  try {
    // 1. Get Me check
    let meData: any;
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      meData = await meRes.json();
    } catch (directErr) {
      // Fallback to server-side test
      const proxyRes = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: cleanToken, chatId: chatId?.trim() })
      });
      const proxyData = await proxyRes.json();
      const log = createTelegramLog('test', proxyData.success ? 'yuborildi' : 'xato', chatId, 'Test ulanish tekshiruvi', proxyData.success ? undefined : proxyData.message);
      if (setDb) appendTelegramLog(setDb, log);
      return { ...proxyData, log };
    }

    if (!meData.ok) {
      const errorMsg = `Bot Token noto'g'ri! Telegram javobi: ${meData.description || 'Xato token'}`;
      const log = createTelegramLog('test', 'xato', chatId || 'N/A', undefined, errorMsg);
      if (setDb) appendTelegramLog(setDb, log);
      return {
        success: false,
        message: errorMsg,
        log
      };
    }

    const botUsername = meData.result?.username || meData.result?.first_name || 'Bot';

    // 2. If chatId is provided, send a ping message
    const cleanChatId = chatId?.trim();
    if (cleanChatId) {
      const pingText = `🤖 <b>FALAK SHOE — TIZIM BILDIRISHNOMASI</b>\n\n` +
        `✅ <b>Telegram Bot muvaffaqiyatli ulandi!</b>\n` +
        `• <b>Bot:</b> @${botUsername}\n` +
        `• <b>Vaqt:</b> ${getNowStr()}\n` +
        `• <b>Holat:</b> Barcha xabarnomalar va kunlik hisobotlar ushbu chatga yuboriladi. 🚀`;

      const sendRes = await sendTelegramMessage(cleanToken, cleanChatId, pingText, {
        turi: 'test',
        setDb
      });
      if (!sendRes.success) {
        return {
          success: false,
          botUsername,
          message: `Bot topildi (@${botUsername}), lekin Chat ID ga xabar yuborib bo'lmadi. Botga /start bosganingizni yoki guruhga qo'shganingizni tekshiring!\n(${sendRes.message})`,
          log: sendRes.log
        };
      }
    }

    return {
      success: true,
      botUsername,
      message: `✅ Bot @${botUsername} ga muvaffaqiyatli ulandi va test xabari yuborildi!`
    };
  } catch (err: any) {
    const errorMsg = `Tarmoq yoki ulanish xatoligi: ${err?.message || "Noma'lum xatolik"}`;
    const log = createTelegramLog('test', 'xato', chatId || 'N/A', undefined, errorMsg);
    if (setDb) appendTelegramLog(setDb, log);
    return {
      success: false,
      message: errorMsg,
      log
    };
  }
};

/**
 * Generate formatted HTML string for Daily Report
 */
export const generateDailyReportMessage = (db: DbState, targetDate?: string): string => {
  const sana = targetDate || getTodayStr();
  const vaqt = getNowStr().slice(11, 16) || '20:00';

  // 1. Transactions breakdown for today
  const tepaTxs = (db.tepa?.transactions || []).filter(t => t.sana === sana);
  const kottaTxs = (db.kotta?.transactions || []).filter(t => t.sana === sana);

  // Chiqimlar
  const tepaChiqim = tepaTxs.filter(t => t.amal === 'chiqim');
  const kottaChiqim = kottaTxs.filter(t => t.amal === 'chiqim');

  const tepaChiqimQty = tepaChiqim.reduce((acc, t) => acc + Number(t.soni || 0), 0);
  const kottaChiqimQty = kottaChiqim.reduce((acc, t) => acc + Number(t.soni || 0), 0);
  const totalChiqimQty = tepaChiqimQty + kottaChiqimQty;

  const tepaChiqimSum = tepaChiqim.reduce((acc, t) => acc + Number(t.summa || 0), 0);
  const kottaChiqimSum = kottaChiqim.reduce((acc, t) => acc + Number(t.summa || 0), 0);
  const totalChiqimSum = tepaChiqimSum + kottaChiqimSum;

  const totalFoyda = [...tepaChiqim, ...kottaChiqim].reduce((acc, t) => acc + Number(t.foyda || 0), 0);

  // Kirimlar
  const tepaKirim = tepaTxs.filter(t => t.amal === 'kirim');
  const kottaKirim = kottaTxs.filter(t => t.amal === 'kirim');
  const totalKirimQty = [...tepaKirim, ...kottaKirim].reduce((acc, t) => acc + Number(t.soni || 0), 0);

  // O'tkazmalar
  const otkazmalar = (db.otkazmalar || []).filter(o => o.sana === sana);
  const totalOtkazmaQty = otkazmalar.reduce((acc, o) => acc + Number(o.soni || 0), 0);

  // Vozvrat va Brak
  const bugungiVozvrat = (db.vozvratlar || []).filter(v => v.sana === sana);
  const vozvratQty = bugungiVozvrat.reduce((acc, v) => acc + Number(v.jamiSoni || 0), 0);
  const vozvratSum = bugungiVozvrat.reduce((acc, v) => acc + Number(v.summa || 0), 0);

  const bugungiBrak = (db.braklar || []).filter(b => b.sana === sana);
  const brakQty = bugungiBrak.reduce((acc, b) => acc + Number(b.jamiSoni || 0), 0);

  // Kassa harakatlari
  const kassaTxs = (db.kassaHarakatlari || []).filter(k => k.sana === sana);
  const kassaDaromadUzs = kassaTxs
    .filter(k => k.tur === 'kirim' && k.valyuta === 'UZS')
    .reduce((acc, k) => acc + Number(k.summa || 0), 0);
  const kassaDaromadUsd = kassaTxs
    .filter(k => k.tur === 'kirim' && k.valyuta === 'USD')
    .reduce((acc, k) => acc + Number(k.summa || 0), 0);
  
  const kassaXarajatUzs = kassaTxs
    .filter(k => k.tur === 'chiqim' && k.valyuta === 'UZS')
    .reduce((acc, k) => acc + Number(k.summa || 0), 0);
  const kassaXarajatUsd = kassaTxs
    .filter(k => k.tur === 'chiqim' && k.valyuta === 'USD')
    .reduce((acc, k) => acc + Number(k.summa || 0), 0);

  // Kassa joriy balansi
  const bal = db.kassaBalansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };

  // Kam qolgan tovarlar (ogohlantirish)
  const lowStockThreshold = db.telegramConfig?.lowStockThreshold || 10;
  const lowStockList: { model: string; ombor: string; qty: number }[] = [];

  const checkOmbor = (stockData: Record<string, Record<string, number>>, omborName: string) => {
    Object.entries(stockData || {}).forEach(([model, sizes]) => {
      const modelTotal = Object.values(sizes || {}).reduce((a, b) => a + Number(b || 0), 0);
      if (modelTotal > 0 && modelTotal <= lowStockThreshold) {
        lowStockList.push({ model, ombor: omborName, qty: modelTotal });
      }
    });
  };

  checkOmbor(db.tepa?.stock || {}, 'Tepa');
  checkOmbor(db.kotta?.stock || {}, 'Kotta');
  lowStockList.sort((a, b) => a.qty - b.qty);

  // Format message
  let msg = `📊 <b>FALAK SHOE — KUNLIK HISOBOT</b>\n`;
  msg += `🗓 <b>Sana:</b> ${sana} | <b>Vaqt:</b> ${vaqt}\n\n`;

  msg += `📦 <b>SOTILGAN TOVARLAR (CHIQIM):</b>\n`;
  msg += `• <b>Tepa Ombor:</b> ${tepaChiqimQty.toLocaleString()} juft (${formatUzs(tepaChiqimSum)} UZS)\n`;
  msg += `• <b>Kotta Ombor:</b> ${kottaChiqimQty.toLocaleString()} juft (${formatUzs(kottaChiqimSum)} UZS)\n`;
  msg += `👉 <b>JAMI CHIQIM:</b> <b>${totalChiqimQty.toLocaleString()} juft</b>\n`;
  msg += `💵 <b>Jami Savdo Summasi:</b> <b>${formatUzs(totalChiqimSum)} UZS</b>\n`;
  if (totalFoyda > 0) {
    msg += `📈 <b>Savdodan Sof Foyda:</b> <b>+${formatUzs(totalFoyda)} UZS</b>\n`;
  }
  msg += `\n`;

  if (totalKirimQty > 0 || totalOtkazmaQty > 0) {
    msg += `📥 <b>OMBOR HARAKATLARI:</b>\n`;
    if (totalKirimQty > 0) msg += `• <b>Yangi Kirim:</b> ${totalKirimQty.toLocaleString()} juft\n`;
    if (totalOtkazmaQty > 0) msg += `• <b>Omborlararo O'tkazma:</b> ${totalOtkazmaQty.toLocaleString()} juft\n`;
    msg += `\n`;
  }

  if (vozvratQty > 0 || brakQty > 0) {
    msg += `🔄 <b>VOZVRAT VA BRAK:</b>\n`;
    if (vozvratQty > 0) msg += `• <b>Vozvrat:</b> ${vozvratQty} juft (${formatUzs(vozvratSum)} UZS)\n`;
    if (brakQty > 0) msg += `• <b>Brak qayd etildi:</b> ${brakQty} juft\n`;
    msg += `\n`;
  }

  msg += `💰 <b>KASSA HARAKATLARI:</b>\n`;
  msg += `• <b>Bugungi Tushum:</b> ${formatUzs(kassaDaromadUzs)} UZS` + (kassaDaromadUsd > 0 ? ` | $${kassaDaromadUsd.toLocaleString()} USD` : '') + `\n`;
  msg += `• <b>Bugungi Xarajat:</b> ${formatUzs(kassaXarajatUzs)} UZS` + (kassaXarajatUsd > 0 ? ` | $${kassaXarajatUsd.toLocaleString()} USD` : '') + `\n\n`;

  msg += `🏦 <b>JORIY KASSA BALANSI:</b>\n`;
  msg += `• 💵 <b>Naqd UZS:</b> ${formatUzs(bal.naqd_uzs)} so'm\n`;
  msg += `• 💵 <b>Naqd USD:</b> $${(bal.naqd_usd || 0).toLocaleString()}\n`;
  msg += `• 💳 <b>Karta:</b> ${formatUzs(bal.karta_uzs)} so'm\n`;
  msg += `• 🏛 <b>Bank hisob:</b> ${formatUzs(bal.bank_uzs)} so'm\n\n`;

  if (lowStockList.length > 0) {
    msg += `⚠️ <b>KAM QOLGAN MODELLAR (≤${lowStockThreshold} juft):</b>\n`;
    lowStockList.slice(0, 6).forEach(item => {
      msg += `• ${item.model} (<i>${item.ombor}</i>): <b>${item.qty} juft qoldi</b>\n`;
    });
    if (lowStockList.length > 6) {
      msg += `...va yana ${lowStockList.length - 6} ta model\n`;
    }
  } else {
    msg += `✅ <i>Barcha modellar zaxirasi yetarli.</i>\n`;
  }

  return msg;
};

/**
 * Dispatch daily report notification
 */
export const sendDailyReportNotification = async (
  db: DbState,
  configOverride?: TelegramConfig,
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<TelegramSendResult> => {
  const config = configOverride || db.telegramConfig;
  if (!config || !config.isEnabled) {
    return { success: false, message: "Telegram integratsiyasi yoqilmagan!" };
  }

  const message = generateDailyReportMessage(db);
  return await sendTelegramMessage(config.botToken, config.chatId, message, {
    turi: 'kunlik_hisobot',
    setDb
  });
};

/**
 * Dispatch low stock warning notification
 */
export const notifyLowStockAlert = async (
  db: DbState,
  model: string,
  ombor: WarehouseName,
  remainingQty: number,
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || !config.notifyLowStock) return false;

  const threshold = config.lowStockThreshold || 10;
  if (remainingQty > threshold) return false;

  const omborName = ombor === 'tepa' ? 'Tepa ombor' : ombor === 'kotta' ? 'Kotta ombor' : '2-Sort ombor';
  const text = `⚠️ <b>DIQQAT! MAHSULOT KAM QOLDI</b>\n\n` +
    `📦 <b>Model:</b> <code>${model}</code>\n` +
    `🏢 <b>Ombor:</b> ${omborName}\n` +
    `📉 <b>Qolgan soni:</b> <b>${remainingQty} juft</b> (Kritik chegara: ≤${threshold})\n` +
    `🕒 <b>Vaqt:</b> ${getNowStr()}\n\n` +
    `💡 <i>Iltimos, ishlab chiqarish yoki fabrikaga yangi partiya buyurtma qiling!</i>`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'kam_qolgan',
    ombor: omborName,
    setDb,
    meta: { model, remainingQty, threshold }
  });
  return res.success;
};

/**
 * Dispatch Big Sale / Wholesale notification
 */
export const notifyBigSaleAlert = async (
  db: DbState,
  params: {
    mijoz: string;
    totalQty: number;
    totalSumma: number;
    ombor: WarehouseName;
    xodim: string;
    itemSummary?: string;
  },
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || !config.notifyBigSale) return false;

  const qtyThreshold = config.bigSaleQtyThreshold || 40;
  const sumThreshold = config.bigSaleSummaThreshold || 5000000;

  // Check thresholds
  if (params.totalQty < qtyThreshold && params.totalSumma < sumThreshold) {
    return false;
  }

  const omborName = params.ombor === 'tepa' ? 'Tepa ombor' : params.ombor === 'kotta' ? 'Kotta ombor' : '2-Sort ombor';
  const text = `🛍 <b>YANGI ULGURJI SAVDO (KATTA CHIQIM)</b>\n\n` +
    `👤 <b>Mijoz:</b> <b>${params.mijoz}</b>\n` +
    `📦 <b>Sotilgan hajm:</b> <b>${params.totalQty.toLocaleString()} juft</b>\n` +
    `💰 <b>Umumiy Summa:</b> <b>${formatUzs(params.totalSumma)} UZS</b>\n` +
    `🏢 <b>Ombor:</b> ${omborName}\n` +
    `👨‍💼 <b>Mas'ul xodim:</b> ${params.xodim}\n` +
    (params.itemSummary ? `📋 <b>Tarkib:</b> ${params.itemSummary}\n` : '') +
    `🕒 <b>Vaqt:</b> ${getNowStr()}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'chiqim',
    xodim: params.xodim,
    ombor: omborName,
    setDb,
    meta: { mijoz: params.mijoz, totalQty: params.totalQty, totalSumma: params.totalSumma }
  });
  return res.success;
};

/**
 * Dispatch Kassa Kirim / Chiqim notification
 */
export const notifyKassaAlert = async (
  db: DbState,
  params: {
    tur: 'kirim' | 'chiqim';
    summa: number;
    valyuta: 'UZS' | 'USD';
    kassaTuri: string;
    kategoriya?: string;
    kimgaKimdan: string;
    xodim: string;
    izoh?: string;
  },
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || !config.notifyKassaKirimChiqim) return false;

  const isIncome = params.tur === 'kirim';
  const icon = isIncome ? '🟢' : '🔴';
  const title = isIncome ? 'KASSA KIRIM AMALIYOTI' : 'KASSA CHIQIM (XARAJAT)';

  const text = `${icon} <b>${title}</b>\n\n` +
    `💰 <b>Summa:</b> <b>${params.summa.toLocaleString()} ${params.valyuta}</b>\n` +
    `💼 <b>Kassa turi:</b> ${params.kassaTuri}\n` +
    `👤 <b>${isIncome ? "Kimdan:" : "Kimga:"}</b> ${params.kimgaKimdan}\n` +
    (params.kategoriya ? `📂 <b>Kategoriya:</b> ${params.kategoriya.toUpperCase()}\n` : '') +
    (params.izoh ? `📝 <b>Izoh:</b> ${params.izoh}\n` : '') +
    `👨‍💼 <b>Kassir:</b> ${params.xodim}\n` +
    `🕒 <b>Vaqt:</b> ${getNowStr()}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'kassa',
    xodim: params.xodim,
    setDb,
    meta: { tur: params.tur, summa: params.summa, valyuta: params.valyuta, kassaTuri: params.kassaTuri }
  });
  return res.success;
};

/**
 * Dispatch Vozvrat notification
 */
export const notifyVozvratAlert = async (
  db: DbState,
  params: {
    mijoz: string;
    model: string;
    totalQty: number;
    holat: string;
    summa: number;
    tolovQaytarishTuri: string;
    xodim: string;
  },
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || !config.notifyVozvrat) return false;

  const holatText = params.holat === 'yaroqli' ? '✅ Yaroqli (omborga qaytarildi)' : '⚠️ Nuqsonli (Brak fondiga o\'tkazildi)';
  const text = `🔄 <b>MIJOZDAN TOVAR QAYTDI (VOZVRAT)</b>\n\n` +
    `👤 <b>Mijoz:</b> ${params.mijoz}\n` +
    `📦 <b>Model:</b> <code>${params.model}</code> (${params.totalQty} juft)\n` +
    `🔍 <b>Holati:</b> ${holatText}\n` +
    `💵 <b>Summa:</b> ${formatUzs(params.summa)} UZS\n` +
    `💳 <b>Hisob-kitob:</b> ${params.tolovQaytarishTuri}\n` +
    `👨‍💼 <b>Qabul qildi:</b> ${params.xodim}\n` +
    `🕒 <b>Vaqt:</b> ${getNowStr()}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'vozvrat',
    xodim: params.xodim,
    setDb,
    meta: { mijoz: params.mijoz, model: params.model, totalQty: params.totalQty, summa: params.summa }
  });
  return res.success;
};

/**
 * Dispatch Brak alert
 */
export const notifyBrakAlert = async (
  db: DbState,
  params: {
    model: string;
    totalQty: number;
    manba: string;
    nuqsonTuri: string;
    ombor: string;
    xodim: string;
  },
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || !config.notifyBrak) return false;

  const text = `🚫 <b>BRAK TOVAR QAYD ETILDI</b>\n\n` +
    `📦 <b>Model:</b> <code>${params.model}</code> (${params.totalQty} juft)\n` +
    `🏢 <b>Ombor:</b> ${params.ombor}\n` +
    `🔍 <b>Nuqson turi:</b> ${params.nuqsonTuri}\n` +
    `🏷 <b>Manba:</b> ${params.manba}\n` +
    `👨‍💼 <b>Xodim:</b> ${params.xodim}\n` +
    `🕒 <b>Vaqt:</b> ${getNowStr()}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'brak',
    xodim: params.xodim,
    ombor: params.ombor,
    setDb,
    meta: { model: params.model, totalQty: params.totalQty, nuqsonTuri: params.nuqsonTuri }
  });
  return res.success;
};

/**
 * Dispatch New Incoming Stock notification
 */
export const notifyKirimAlert = async (
  db: DbState,
  params: {
    manba?: string;
    totalQty: number;
    ombor: WarehouseName;
    xodim: string;
    itemSummary: string;
    partyId?: string;
  },
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<boolean> => {
  const config = db.telegramConfig;
  if (!config || !config.isEnabled || config.notifyKirim === false) return false;

  const omborName = params.ombor === 'tepa' ? 'Tepa ombor' : params.ombor === 'kotta' ? 'Kotta ombor' : '2-Sort ombor';
  const text = `📥 <b>YANGI TOVAR KIRIMI (OMBORGA QABUL QILINDI)</b>\n\n` +
    `📦 <b>Qabul qilingan hajm:</b> <b>${params.totalQty.toLocaleString()} juft</b>\n` +
    `🏢 <b>Ombor:</b> ${omborName}\n` +
    (params.manba ? `🏭 <b>Manba / Fabrika:</b> ${params.manba}\n` : '') +
    (params.partyId ? `🆔 <b>Partiya ID:</b> <code>${params.partyId}</code>\n` : '') +
    `📋 <b>Tarkib:</b> ${params.itemSummary}\n` +
    `👨‍💼 <b>Qabul qilgan xodim:</b> ${params.xodim}\n` +
    `🕒 <b>Vaqt:</b> ${getNowStr()}`;

  const res = await sendTelegramMessage(config.botToken, config.chatId, text, {
    turi: 'kirim',
    xodim: params.xodim,
    ombor: omborName,
    setDb,
    meta: { manba: params.manba, totalQty: params.totalQty, partyId: params.partyId }
  });
  return res.success;
};

/**
 * Send real-time Stock Summary report
 */
export const sendStockSummaryNotification = async (
  db: DbState,
  configOverride?: TelegramConfig,
  setDb?: React.Dispatch<React.SetStateAction<DbState>>
): Promise<TelegramSendResult> => {
  const config = configOverride || db.telegramConfig;
  if (!config || !config.botToken || !config.chatId) {
    return { success: false, message: "Bot Token yoki Chat ID sozlanmagan!" };
  }

  const calcStock = (stockObj: Record<string, Record<string, number>>) => {
    let total = 0;
    const modelTotals: Record<string, number> = {};
    Object.entries(stockObj || {}).forEach(([m, sizes]) => {
      const sum = Object.values(sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (sum > 0) {
        modelTotals[m] = sum;
        total += sum;
      }
    });
    return { total, modelTotals };
  };

  const tepa = calcStock(db.tepa?.stock || {});
  const kotta = calcStock(db.kotta?.stock || {});
  const sort2 = calcStock(db.sort2?.stock || {});
  const grandTotal = tepa.total + kotta.total + sort2.total;

  let msg = `📦 <b>FALAK SHOE — OMBOR QOLDIG'I (JORIY HOLAT)</b>\n`;
  msg += `🕒 <b>Vaqt:</b> ${getNowStr()}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `🏢 <b>OMBORLAR BO'YICHA:</b>\n`;
  msg += `• <b>Tepa Ombor:</b> <b>${tepa.total.toLocaleString()} juft</b>\n`;
  msg += `• <b>Kotta Ombor:</b> <b>${kotta.total.toLocaleString()} juft</b>\n`;
  if (sort2.total > 0) {
    msg += `• <b>2-Sort Ombor:</b> <b>${sort2.total.toLocaleString()} juft</b>\n`;
  }
  msg += `👉 <b>JAMI ZAXIRA:</b> <b>${grandTotal.toLocaleString()} juft</b>\n\n`;

  // Top models
  const combinedModels: Record<string, number> = {};
  [tepa.modelTotals, kotta.modelTotals, sort2.modelTotals].forEach(omborMap => {
    Object.entries(omborMap).forEach(([model, count]) => {
      combinedModels[model] = (combinedModels[model] || 0) + count;
    });
  });

  const sortedModels = Object.entries(combinedModels).sort((a, b) => b[1] - a[1]);
  if (sortedModels.length > 0) {
    msg += `📊 <b>MODELLAR BO'YICHA QOLDICHLAR:</b>\n`;
    sortedModels.slice(0, 15).forEach(([model, qty], idx) => {
      msg += `${idx + 1}. <code>${model}</code>: <b>${qty.toLocaleString()} juft</b>\n`;
    });
    if (sortedModels.length > 15) {
      msg += `<i>...va yana ${sortedModels.length - 15} ta boshqa modellar</i>\n`;
    }
  }

  return await sendTelegramMessage(config.botToken, config.chatId, msg, {
    turi: 'qoldiq',
    setDb,
    meta: { grandTotal, tepa: tepa.total, kotta: kotta.total, sort2: sort2.total }
  });
};
