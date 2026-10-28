const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Format numbers
const formatUzs = (val) => {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const getTashkentDate = () => {
  const now = new Date();
  const tzOffset = 5 * 60; // UTC+5 in minutes
  const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  return localTime.toISOString().slice(0, 10);
};

// Send message to Telegram API
async function sendToTelegram(botToken, chatId, htmlText) {
  if (!botToken || !chatId) return { success: false, error: 'Missing token or chatId' };
  const targetIds = chatId.split(/[\s,;]+/).map(id => id.trim()).filter(Boolean);

  for (const id of targetIds) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  }
  return { success: true };
}

// Build HTML Report from Firestore document data
function buildDailyReportHtml(appData, targetDate) {
  const sana = targetDate || getTashkentDate();
  
  const tepaTxs = (appData.tepa?.transactions ? Object.values(appData.tepa.transactions) : []).filter(t => t.sana === sana);
  const kottaTxs = (appData.kotta?.transactions ? Object.values(appData.kotta.transactions) : []).filter(t => t.sana === sana);

  const tepaChiqim = tepaTxs.filter(t => t.amal === 'chiqim');
  const kottaChiqim = kottaTxs.filter(t => t.amal === 'chiqim');
  const allChiqim = [...tepaChiqim, ...kottaChiqim];

  const totalJuftChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.soni) || 0), 0);
  const totalSummaChiqim = allChiqim.reduce((acc, t) => acc + (Number(t.summa) || 0), 0);
  const totalFoyda = allChiqim.reduce((acc, t) => acc + (Number(t.foyda) || 0), 0);

  const tepaKirim = tepaTxs.filter(t => t.amal === 'kirim');
  const kottaKirim = kottaTxs.filter(t => t.amal === 'kirim');
  const totalJuftKirim = [...tepaKirim, ...kottaKirim].reduce((acc, t) => acc + (Number(t.soni) || 0), 0);

  const vozvratlar = (appData.vozvratlar ? Object.values(appData.vozvratlar) : []).filter(v => v.sana === sana);
  const totalVozvratQty = vozvratlar.reduce((acc, v) => acc + (Number(v.soni) || 0), 0);

  const braklar = (appData.braklar ? Object.values(appData.braklar) : []).filter(b => b.sana === sana);
  const totalBrakQty = braklar.reduce((acc, b) => acc + (Number(b.soni) || 0), 0);

  const naqdSom = Number(appData.kassa?.naqdSom) || 0;
  const naqdDollar = Number(appData.kassa?.naqdDollar) || 0;
  const bankHisob = Number(appData.kassa?.bankHisob) || 0;

  let msg = `📊 <b>FALAK SHOE — KUNLIK YIG'MA HISOBOT</b>\n`;
  msg += `📅 <b>Sana:</b> ${sana} (Soat 20:00)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `💰 <b>SAVDO VA TUSHUM:</b>\n`;
  msg += `• <b>Jami sotildi:</b> <code>${formatUzs(totalJuftChiqim)} juft</code>\n`;
  msg += `• <b>Umumiy summa:</b> <code>${formatUzs(totalSummaChiqim)} so'm</code>\n`;
  msg += `• <b>Hisoblangan sof foyda:</b> <code>${formatUzs(totalFoyda)} so'm</code>\n\n`;

  msg += `📦 <b>OMBOR HARAKATI:</b>\n`;
  msg += `• <b>Kunlik yangi kirim:</b> <code>${formatUzs(totalJuftKirim)} juft</code>\n`;
  msg += `• <b>Mijozdan vozvrat:</b> <code>${formatUzs(totalVozvratQty)} juft</code>\n`;
  msg += `• <b>Brak fondiga:</b> <code>${formatUzs(totalBrakQty)} juft</code>\n\n`;

  msg += `💳 <b>KASSA BALANSI (JORIY):</b>\n`;
  msg += `• <b>Naqd so'm:</b> <code>${formatUzs(naqdSom)} so'm</code>\n`;
  msg += `• <b>Naqd dollar:</b> <code>$${formatUzs(naqdDollar)}</code>\n`;
  msg += `• <b>Bank hisobi:</b> <code>${formatUzs(bankHisob)} so'm</code>\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ <i>Avtomatik Cloud Function orqali jo'natildi.</i>`;
  return msg;
}

/**
 * 1. Scheduled Cloud Function (Runs every day at 20:00 Asia/Tashkent time)
 * Cron: 0 15 * * * UTC (which is 20:00 in UTC+5 Tashkent)
 */
exports.dailyTelegramReport = functions.pubsub
  .schedule('0 15 * * *')
  .timeZone('Asia/Tashkent')
  .onRun(async (context) => {
    try {
      const docSnap = await db.collection('app_db').doc('main').get();
      if (!docSnap.exists) {
        console.log('App DB document not found');
        return null;
      }
      const data = docSnap.data();
      const config = data.telegramConfig;

      if (!config || !config.isEnabled || !config.botToken || !config.chatId) {
        console.log('Telegram reporting is disabled or config is incomplete');
        return null;
      }

      const reportHtml = buildDailyReportHtml(data);
      await sendToTelegram(config.botToken, config.chatId, reportHtml);

      // Record last sent date
      await db.collection('app_db').doc('main').set({
        telegramConfig: {
          ...config,
          lastDailyReportSentDate: getTashkentDate()
        }
      }, { merge: true });

      console.log('Daily Telegram report sent successfully at 20:00');
      return null;
    } catch (err) {
      console.error('Error sending scheduled Telegram report:', err);
      return null;
    }
  });

/**
 * 2. HTTP Endpoint for on-demand trigger or Google Cloud Scheduler HTTP Job
 */
exports.sendDailyReportHttp = functions.https.onRequest(async (req, res) => {
  try {
    const docSnap = await db.collection('app_db').doc('main').get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'DB document not found' });
    }
    const data = docSnap.data();
    const config = data.telegramConfig;

    if (!config || !config.botToken || !config.chatId) {
      return res.status(400).json({ error: 'Telegram credentials missing' });
    }

    const reportHtml = buildDailyReportHtml(data);
    await sendToTelegram(config.botToken, config.chatId, reportHtml);

    return res.json({ success: true, message: 'Report sent successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
