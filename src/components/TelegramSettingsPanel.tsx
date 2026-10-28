import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { TelegramConfig } from '../types';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Bell, 
  Clock, 
  Package, 
  TrendingUp, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Sparkles,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  MessageSquare,
  Flame,
  Server,
  Terminal,
  Bot,
  Zap,
  Code2,
  Copy,
  Check,
  Lock,
  KeyRound,
  ShieldAlert,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  testTelegramConnection, 
  sendDailyReportNotification, 
  generateDailyReportMessage,
  sendStockSummaryNotification 
} from '../services/telegramService';
import { cn, formatUzs } from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';

export function TelegramSettingsPanel() {
  const { db, setDb, currentUser } = useDb();

  const config: TelegramConfig = db.telegramConfig || {
    isEnabled: false,
    botToken: '',
    chatId: '',
    chatName: 'Asosiy Guruh / Rahbariyat',
    notifyKirim: true,
    notifyDailyReport: true,
    dailyReportTime: '20:00',
    notifyLowStock: true,
    lowStockThreshold: 10,
    notifyBigSale: true,
    bigSaleQtyThreshold: 40,
    bigSaleSummaThreshold: 5000000,
    notifyVozvrat: true,
    notifyBrak: true,
    notifyKassaKirimChiqim: true
  };

  const [botToken, setBotToken] = useState(config.botToken || '');
  const [chatId, setChatId] = useState(config.chatId || '');
  const [chatName, setChatName] = useState(config.chatName || '');
  const [isEnabled, setIsEnabled] = useState(config.isEnabled || false);
  const [notifyKirim, setNotifyKirim] = useState(config.notifyKirim !== false);
  const [notifyDailyReport, setNotifyDailyReport] = useState(config.notifyDailyReport !== false);
  const [dailyReportTime, setDailyReportTime] = useState(config.dailyReportTime || '20:00');
  const [notifyLowStock, setNotifyLowStock] = useState(config.notifyLowStock !== false);
  const [lowStockThreshold, setLowStockThreshold] = useState(config.lowStockThreshold || 10);
  const [notifyBigSale, setNotifyBigSale] = useState(config.notifyBigSale !== false);
  const [bigSaleQtyThreshold, setBigSaleQtyThreshold] = useState(config.bigSaleQtyThreshold || 40);
  const [bigSaleSummaThreshold, setBigSaleSummaThreshold] = useState(config.bigSaleSummaThreshold || 5000000);
  const [notifyVozvrat, setNotifyVozvrat] = useState(config.notifyVozvrat !== false);
  const [notifyBrak, setNotifyBrak] = useState(config.notifyBrak !== false);
  const [notifyKassaKirimChiqim, setNotifyKassaKirimChiqim] = useState(config.notifyKassaKirimChiqim !== false);

  const [showToken, setShowToken] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedChatId, setCopiedChatId] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [isSendingStockSummary, setIsSendingStockSummary] = useState(false);
  const [isTriggeringServerCron, setIsTriggeringServerCron] = useState(false);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showCloudGuide, setShowCloudGuide] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Validate Bot Token Format (standard Telegram Bot token: 8-11 digits : 35 alphanumeric chars)
  const isTokenFormatValid = /^\d{8,11}:[A-Za-z0-9_-]{30,}$/.test(botToken.trim());
  const isChatIdFormatValid = /^[-0-9,\s]+$/.test(chatId.trim()) && chatId.trim().length > 4;

  const handleCopyToken = () => {
    if (!botToken) return;
    navigator.clipboard.writeText(botToken.trim());
    setCopiedToken(true);
    toast.success("Bot Token buferga nusxalandi!");
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCopyChatId = () => {
    if (!chatId) return;
    navigator.clipboard.writeText(chatId.trim());
    setCopiedChatId(true);
    toast.success("Chat ID buferga nusxalandi!");
    setTimeout(() => setCopiedChatId(false), 2000);
  };

  const handleClearCredentials = () => {
    setBotToken('');
    setChatId('');
    setChatName('');
    setIsEnabled(false);
    setBotUsername(null);
    setShowResetModal(false);

    setDb(prev => ({
      ...prev,
      telegramConfig: {
        ...(prev.telegramConfig || config),
        botToken: '',
        chatId: '',
        isEnabled: false,
        lastTestedAt: undefined
      }
    }));
    toast.success("Telegram hisob ma'lumotlari tozalandi");
  };

  const [serverStatus, setServerStatus] = useState<{
    serverTimezone?: string;
    currentTashkentTime?: string;
    cronTargetTime?: string;
    cronEnabled?: boolean;
    lastDailyReportSentDate?: string;
  } | null>(null);

  // Fetch Server Cron Status
  const fetchServerStatus = async () => {
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch {
      // ignore if offline
    }
  };

  useEffect(() => {
    fetchServerStatus();
    const interval = setInterval(fetchServerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    const updatedConfig: TelegramConfig = {
      isEnabled,
      botToken: botToken.trim(),
      chatId: chatId.trim(),
      chatName: chatName.trim() || 'Telegram Chat',
      notifyKirim,
      notifyDailyReport,
      dailyReportTime,
      notifyLowStock,
      lowStockThreshold: Number(lowStockThreshold) || 10,
      notifyBigSale,
      bigSaleQtyThreshold: Number(bigSaleQtyThreshold) || 40,
      bigSaleSummaThreshold: Number(bigSaleSummaThreshold) || 5000000,
      notifyVozvrat,
      notifyBrak,
      notifyKassaKirimChiqim,
      lastDailyReportSentDate: config.lastDailyReportSentDate,
      lastTestedAt: config.lastTestedAt
    };

    setDb(prev => {
      const draft = { ...prev };
      draft.telegramConfig = updatedConfig;
      if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
      draft.auditLogs.unshift(
        createAuditLog(
          currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
          'Telegram sozlamalari yangilandi',
          'Sozlamalar',
          `Telegram bot holati: ${isEnabled ? "Faol (Yoqilgan)" : "O'chirilgan"}`
        )
      );
      return draft;
    });

    toast.success("✅ Telegram sozlamalari muvaffaqiyatli saqlandi!");
    fetchServerStatus();
  };

  const handleTestConnection = async () => {
    if (!botToken.trim()) {
      return toast.error("Iltimos, avval Bot Tokenni kiriting!");
    }
    if (!chatId.trim()) {
      return toast.error("Iltimos, Chat ID ni kiriting!");
    }

    setIsTesting(true);
    try {
      const res = await testTelegramConnection(botToken, chatId, setDb);
      if (res.success) {
        if (res.botUsername) {
          setBotUsername(res.botUsername);
        }
        toast.success(res.message, { duration: 6000 });
        setDb(prev => ({
          ...prev,
          telegramConfig: {
            ...(prev.telegramConfig || config),
            lastTestedAt: new Date().toISOString()
          }
        }));
      } else {
        if (res.botUsername) {
          setBotUsername(res.botUsername);
        }
        toast.error(res.message, { duration: 8000 });
      }
    } catch (err: any) {
      toast.error(`Xatolik: ${err?.message || 'Ulanishda xato'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendLiveReport = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      return toast.error("Bot Token va Chat ID kiritilmagan!");
    }

    setIsSendingReport(true);
    try {
      const tempConfig: TelegramConfig = {
        isEnabled: true,
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        notifyKirim,
        notifyDailyReport: true,
        dailyReportTime,
        notifyLowStock,
        lowStockThreshold,
        notifyBigSale,
        bigSaleQtyThreshold,
        bigSaleSummaThreshold,
        notifyVozvrat,
        notifyBrak,
        notifyKassaKirimChiqim
      };

      const res = await sendDailyReportNotification(db, tempConfig, setDb);
      if (res.success) {
        toast.success("🚀 Bugungi kunlik hisobot Telegramga muvaffaqiyatli yuborildi!", { duration: 5000 });
      } else {
        toast.error(`Hisobot yuborilmadi: ${res.message}`, { duration: 7000 });
      }
    } catch (err: any) {
      toast.error(`Xatolik: ${err?.message || "Yuborishda xato"}`);
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleSendStockSummary = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      return toast.error("Bot Token va Chat ID kiritilmagan!");
    }

    setIsSendingStockSummary(true);
    try {
      const tempConfig: TelegramConfig = {
        isEnabled: true,
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        notifyKirim,
        notifyDailyReport: true,
        dailyReportTime,
        notifyLowStock,
        lowStockThreshold,
        notifyBigSale,
        bigSaleQtyThreshold,
        bigSaleSummaThreshold,
        notifyVozvrat,
        notifyBrak,
        notifyKassaKirimChiqim
      };

      const res = await sendStockSummaryNotification(db, tempConfig, setDb);
      if (res.success) {
        toast.success("📦 Ombor qoldiqlari hisoboti Telegramga muvaffaqiyatli yuborildi!", { duration: 5000 });
      } else {
        toast.error(`Qoldiqlar yuborilmadi: ${res.message}`, { duration: 7000 });
      }
    } catch (err: any) {
      toast.error(`Xatolik: ${err?.message || "Yuborishda xato"}`);
    } finally {
      setIsSendingStockSummary(false);
    }
  };

  // Trigger Server-side Cron
  const handleTriggerServerCron = async () => {
    setIsTriggeringServerCron(true);
    try {
      const res = await fetch('/api/telegram/cron-trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`⚡ Server orqali hisobot Telegramga jo'natildi! (${data.date})`, { duration: 6000 });
        fetchServerStatus();
      } else {
        toast.error(`Server xabari: ${data.message || 'Xatolik'}`);
      }
    } catch (err: any) {
      toast.error(`Server bilan aloqa xatosi: ${err?.message}`);
    } finally {
      setIsTriggeringServerCron(false);
    }
  };

  // Connect Webhook
  const handleSetWebhook = async () => {
    if (!botToken.trim()) {
      return toast.error("Avval Bot Tokenni kiriting va saqlang!");
    }

    setIsSettingWebhook(true);
    try {
      const currentOrigin = window.location.origin;
      const webhookUrl = `${currentOrigin}/api/telegram/webhook`;

      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl })
      });
      const data = await res.json();

      if (data.success) {
        toast.success("🤖 Telegram Webhook muvaffaqiyatli ulandi! Endi bot chatda buyruqlarga (/hisobot, /kassa, /ombor) darhol javob beradi.", { duration: 8000 });
      } else {
        toast.error(`Webhook ulanmadi: ${data.result?.description || data.message}`);
      }
    } catch (err: any) {
      toast.error(`Webhook xatosi: ${err?.message}`);
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const copyCloudFunctionCode = () => {
    const code = `// Firebase Cloud Function - Har kuni soat 20:00 da hisobot jo'natish
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.dailyTelegramReport = functions.pubsub
  .schedule('0 15 * * *') // 20:00 Asia/Tashkent (UTC+5)
  .timeZone('Asia/Tashkent')
  .onRun(async (context) => {
    const docSnap = await db.collection('app_db').doc('main').get();
    const data = docSnap.data();
    const config = data.telegramConfig;
    if (!config || !config.isEnabled || !config.botToken || !config.chatId) return null;
    
    // Send Telegram Daily Report via Telegram API
    await fetch(\`https://api.telegram.org/bot\${config.botToken}/sendMessage\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: '📊 Falak Shoe 20:00 Kunlik Hisoboti...',
        parse_mode: 'HTML'
      })
    });
    return null;
  });`;

    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Nusxalandi!");
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const previewMessage = generateDailyReportMessage(db);

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md",
            isEnabled && botToken ? "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20" : "bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)]"
          )}>
            <Send className="w-6 h-6 -translate-x-0.5 translate-y-0.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-black text-[var(--text)]">Telegram Bot Integratsiyasi</h2>
              {isEnabled && botToken && chatId ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Faol ulanish
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Sozlash kutilmoqda
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Har kuni soat 20:00 da hisobot, kam qolgan tovarlar va savdo xabarnomalarini avtomatik Telegramga yuborish
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showGuide ? "Qo'llanmani yopish" : "Qanday sozlanadi?"}
          </button>
          
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-black bg-[#8cc63f] text-[#1a3300] hover:bg-[#7ebd35] shadow-sm shadow-[#8cc63f]/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            Saqlash
          </button>
        </div>
      </div>

      {/* Guide Card (Collapsible) */}
      {showGuide && (
        <div className="bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 border border-blue-500/20 rounded-2xl p-5 flex flex-col gap-3.5 text-xs text-[var(--text)] animate-in fade-in duration-200">
          <div className="font-bold text-sm text-blue-500 flex items-center gap-2">
            <span>💡</span> 3 daqiqada Telegram Botni ulash qo'llanmasi:
          </div>
          <ol className="list-decimal list-inside space-y-2 text-[var(--text2)] leading-relaxed pl-1">
            <li>
              Telegramda <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-500 font-bold underline inline-flex items-center gap-0.5">@BotFather <ExternalLink className="w-3 h-3" /></a> ga kiring va <code>/newbot</code> deb yozing.
            </li>
            <li>
              Botga nom va username bering (masalan: <code>FalakShoe_Bot</code>). @BotFather sizga bergan <b>HTTP API Token</b> (masalan: <code>7123456789:AAH...</code>) ni nusxalab oling.
            </li>
            <li>
              Yangi botingizga kiring va <b>/start</b> tugmasini bosing (yoki uni Telegram guruhingizga qo'shing).
            </li>
            <li>
              O'zingizning shaxsiy yoki guruhingizning Chat ID raqamini bilish uchun <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-blue-500 font-bold underline inline-flex items-center gap-0.5">@userinfobot <ExternalLink className="w-3 h-3" /></a> yoki <a href="https://t.me/GetMyChatID_Bot" target="_blank" rel="noreferrer" className="text-blue-500 font-bold underline inline-flex items-center gap-0.5">@GetMyChatID_Bot <ExternalLink className="w-3 h-3" /></a> dan ID raqamni oling (masalan: <code>987654321</code> yoki guruh uchun <code>-1001234567890</code>).
            </li>
            <li>
              Quyidagi maydonlarga Token va Chat ID ni qo'yib <b>"Ulanishni tekshirish (Test)"</b> tugmasini bosing!
            </li>
          </ol>
        </div>
      )}

      {/* Main Bot Credentials & Master Switch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Credentials */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Master Switch & Connection Status Header */}
          <div className="flex items-center justify-between bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm transition-all",
                isEnabled 
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shadow-sm shadow-emerald-500/10" 
                  : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
              )}>
                {isEnabled ? "ON" : "OFF"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-[var(--text)]">Telegram Xabarnomalarini Yoqish</span>
                  {botToken && chatId ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Sozlangan
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      Token kutilmoqda
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text3)] mt-0.5">
                  Barcha avtomatik va tezkor hisobotlarni Telegramga yuborish
                </div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isEnabled} 
                onChange={e => setIsEnabled(e.target.checked)} 
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* Active Bot Status Pill if verified */}
          {(botUsername || config.lastTestedAt) && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-blue-500 font-bold">
                <Bot className="w-4 h-4 shrink-0" />
                <span>Uланган Bot:</span>
                {botUsername ? (
                  <a
                    href={`https://t.me/${botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline inline-flex items-center gap-1 hover:text-blue-400 font-mono"
                  >
                    @{botUsername}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="font-mono text-[var(--text)]">Faol Bot</span>
                )}
              </div>
              {config.lastTestedAt && (
                <span className="text-[10px] text-[var(--text3)] font-medium">
                  So'nggi test: {new Date(config.lastTestedAt).toLocaleDateString()} {new Date(config.lastTestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}

          {/* Bot Token Input with Masking, Validation & Copy */}
          <div className="flex flex-col gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-500" />
                <span>Telegram Bot API Token</span>
              </label>
              <div className="flex items-center gap-1.5">
                {botToken.trim().length > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1",
                    isTokenFormatValid 
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  )}>
                    {isTokenFormatValid ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {isTokenFormatValid ? "To'g'ri format" : "Formatni tekshiring"}
                  </span>
                )}
                <span className="text-[10px] text-blue-500 font-medium">@BotFather</span>
              </div>
            </div>

            <div className="relative mt-1">
              <input
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="7123456789:AAFlPabc123xyz_exampleToken..."
                className="w-full pl-3.5 pr-20 py-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg2)] text-[var(--text)] font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {botToken && (
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--border)] rounded-lg transition-colors cursor-pointer"
                    title="Tokenni buferga nusxalash"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--border)] rounded-lg transition-colors cursor-pointer"
                  title={showToken ? "Tokenni yashirish" : "Tokenni ko'rsatish"}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text3)] pt-1">
              <span>Token shifrlangan bazada xavfsiz saqlanadi</span>
              <span>Namuna: <code>7123456789:AAH...</code></span>
            </div>
          </div>

          {/* Chat ID Input & Chat Label */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Chat ID / Guruh ID</span>
                </label>
                {chatId.trim() && (
                  <button
                    type="button"
                    onClick={handleCopyChatId}
                    className="text-[10px] text-emerald-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    {copiedChatId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedChatId ? "Nusxalandi" : "Nusxalash"}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="123456789 yoki -1009876543"
                className="w-full px-3.5 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg2)] text-[var(--text)] font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner mt-1"
              />
              <span className="text-[10px] text-[var(--text3)]">
                Shaxsiy ID: <code>987654321</code>, Guruh: <code>-1001234567890</code>
              </span>
            </div>

            <div className="flex flex-col gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4">
              <label className="text-[11px] font-black text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                <span>Chat / Guruh Nomi (Eslatma)</span>
              </label>
              <input
                type="text"
                value={chatName}
                onChange={e => setChatName(e.target.value)}
                placeholder="Falak Shoe Rahbariyat"
                className="w-full px-3.5 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg2)] text-[var(--text)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner mt-1"
              />
              <span className="text-[10px] text-[var(--text3)]">Dastur ichida tanib olish uchun nom</span>
            </div>
          </div>

          {/* Security & Access Protection Notice */}
          <div className="bg-gradient-to-r from-emerald-500/5 to-blue-500/5 border border-emerald-500/20 rounded-2xl p-3.5 flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-[11px] leading-relaxed text-[var(--text2)]">
                <span className="font-bold text-[var(--text)]">Xavfsiz Saqlash Kafolati:</span> Bot Token va Chat ID ma'lumotlari Firebase Firestore'dagi himoyalangan tuzilmada saqlanadi. Faqat <b>Admin</b> xodimlar PIN kodi orqali ko'rish va tahrirlash huquqiga ega.
              </div>
            </div>
            {(botToken || chatId) && (
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="px-2.5 py-1.5 text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                title="Token va Chat ID ni tozalash"
              >
                <Trash2 className="w-3 h-3" />
                Tozalash
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !botToken}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isTesting ? "Sinov xabari yuborilmoqda..." : "Ulanishni tekshirish (Test Ping)"}
            </button>

            <button
              onClick={handleSendLiveReport}
              disabled={isSendingReport || !botToken || !chatId}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              {isSendingReport ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
              {isSendingReport ? "Hisobot yuborilmoqda..." : "Bugungi Savdo Hisobotini Jo'natish"}
            </button>

            <button
              onClick={handleSendStockSummary}
              disabled={isSendingStockSummary || !botToken || !chatId}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
            >
              {isSendingStockSummary ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
              {isSendingStockSummary ? "Qoldiqlar yuborilmoqda..." : "Ombor Qoldiqlarini Jo'natish"}
            </button>

            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Sozlamalarni Saqlash
            </button>

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:border-blue-500 transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
              {showPreview ? "Namunalarni yopish" : "Xabar matnini ko'rish"}
            </button>
          </div>
        </div>

        {/* Right Column: Live Message Preview */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Telegramda keladigan xabar namunasi
              </div>
              <span className="text-[10px] text-[var(--text3)] uppercase font-semibold">HTML Format</span>
            </div>

            <div className="flex-1 bg-[#182533] text-[#e4ecf2] p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[320px] shadow-inner selection:bg-blue-600 border border-blue-950">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: previewMessage
                    .replace(/\n/g, '<br/>')
                    .replace(/<code>/g, '<code style="background:#242f3d;padding:1px 4px;border-radius:4px;color:#64b5f6;">') 
                }} 
              />
            </div>
            
            <div className="mt-2 text-[10px] text-[var(--text3)] flex items-center justify-between">
              <span>* Haqiqiy ombor va kassa ma'lumotlari asosida tuziladi</span>
              <span>Rejalashtirilgan vaqt: <b>{dailyReportTime}</b></span>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Functions & Server Cron Management Banner */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-[var(--bg)] to-blue-950/30 border border-indigo-500/25 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-[var(--text)]">24/7 Avtomatik Server Cron & Cloud Functions</h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  20:00 Avto-Taymer Faol
                </span>
              </div>
              <p className="text-xs text-[var(--text3)] mt-0.5">
                Dastur yopiq bo'lsa ham server har kuni <b>soat 20:00 da (Toshkent vaqti, UTC+5)</b> Firestore bazasidan hisobotni yig'ib Telegramga jo'natadi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTriggerServerCron}
              disabled={isTriggeringServerCron || !botToken || !chatId}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/20"
            >
              {isTriggeringServerCron ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
              {isTriggeringServerCron ? "Yuborilmoqda..." : "Serverdan Test Qilish"}
            </button>

            <button
              onClick={handleSetWebhook}
              disabled={isSettingWebhook || !botToken}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isSettingWebhook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
              {isSettingWebhook ? "Ulanmoqda..." : "Bot Webhook-ni Yoqish"}
            </button>

            <button
              onClick={() => setShowCloudGuide(!showCloudGuide)}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-indigo-400" />
              {showCloudGuide ? "Kodni yopish" : "Cloud Function Kodi"}
            </button>
          </div>
        </div>

        {/* Server Status Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-indigo-500/15">
          <div className="bg-[var(--bg)]/70 border border-[var(--border)] rounded-xl p-2.5">
            <div className="text-[10px] text-[var(--text3)] uppercase font-semibold">Server Mintaqasi</div>
            <div className="text-xs font-bold text-[var(--text)] mt-0.5">Asia/Tashkent (UTC+5)</div>
          </div>
          <div className="bg-[var(--bg)]/70 border border-[var(--border)] rounded-xl p-2.5">
            <div className="text-[10px] text-[var(--text3)] uppercase font-semibold">Avtomatik Vaqt</div>
            <div className="text-xs font-bold text-amber-400 mt-0.5">Har kuni {dailyReportTime}</div>
          </div>
          <div className="bg-[var(--bg)]/70 border border-[var(--border)] rounded-xl p-2.5">
            <div className="text-[10px] text-[var(--text3)] uppercase font-semibold">Oxirgi Yuborilgan</div>
            <div className="text-xs font-bold text-[var(--text)] mt-0.5">
              {config.lastDailyReportSentDate || "Bugun hali yuborilmadi"}
            </div>
          </div>
          <div className="bg-[var(--bg)]/70 border border-[var(--border)] rounded-xl p-2.5">
            <div className="text-[10px] text-[var(--text3)] uppercase font-semibold">Server API Yo'li</div>
            <div className="text-xs font-mono font-bold text-blue-400 mt-0.5">/api/telegram/cron-trigger</div>
          </div>
        </div>

        {/* Interactive Bot Commands Helper */}
        <div className="bg-[var(--bg)]/90 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Bot className="w-3.5 h-3.5" />
              Telegramda Botga yuboriladigan tezkor buyruqlar:
            </span>
            <span className="text-[10px] text-[var(--text3)]">Webhook ulanganda ishlaydi</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-2 flex flex-col">
              <code className="text-blue-400 font-bold">/hisobot</code>
              <span className="text-[10px] text-[var(--text3)]">Bugungi yig'ma hisobot</span>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-2 flex flex-col">
              <code className="text-emerald-400 font-bold">/kassa</code>
              <span className="text-[10px] text-[var(--text3)]">Naqd so'm, dollar balansi</span>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-2 flex flex-col">
              <code className="text-amber-400 font-bold">/ombor</code>
              <span className="text-[10px] text-[var(--text3)]">Tepa & Kotta ombor zaxirasi</span>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-2 flex flex-col">
              <code className="text-rose-400 font-bold">/qarzlar</code>
              <span className="text-[10px] text-[var(--text3)]">Top qarzdorlar ro'yxati</span>
            </div>
          </div>
        </div>

        {/* Cloud Functions Code & Deployment Guide Modal/Box */}
        {showCloudGuide && (
          <div className="bg-[#10141d] border border-indigo-500/30 rounded-xl p-4 flex flex-col gap-3 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="font-bold text-indigo-300 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Firebase Cloud Functions & Cloud Scheduler (Standalone Deploy):
              </div>
              <button
                onClick={copyCloudFunctionCode}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 flex items-center gap-1 font-bold text-[11px] cursor-pointer"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedCode ? "Nusxalandi" : "Kodni nusxalash"}
              </button>
            </div>
            <p className="text-[var(--text3)] leading-relaxed text-[11px]">
              Ushbu funksiya loyihangizning <code>functions/index.js</code> fayliga joylangan. Uni Firebase orqali ishga tushirish uchun quyidagi buyruqni bering:
            </p>
            <div className="bg-black/60 p-3 rounded-lg font-mono text-[11px] text-emerald-400 border border-emerald-950 flex items-center justify-between">
              <span>firebase deploy --only functions</span>
            </div>
            <div className="text-[11px] text-[var(--text3)]">
              Cron sozlamasi: <code>0 15 * * *</code> (UTC 15:00 = Toshkent vaqti 20:00). Cloud Scheduler har kuni belgilangan vaqtda bazadan hisobotni olib jo'natadi.
            </div>
          </div>
        )}
      </div>

      {/* Specific Notification Preferences Section */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-[var(--text)] mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-500" />
          Avtomatik Bildirishnomalar Turlari va Chegaralari
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Yangi Kirim Bildirishnomasi */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyKirim ? "bg-[var(--bg)] border-emerald-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Yangi Tovar Kirimi</div>
                  <div className="text-[11px] text-[var(--text3)]">Fabrikadan tovar kelganda</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyKirim} 
                onChange={e => setNotifyKirim(e.target.checked)} 
                className="w-4 h-4 rounded text-emerald-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] text-[var(--text3)] pt-2 border-t border-[var(--border)]">
              Qabul qilingan model, o'lchamlar, juftlar soni va ombor nomi darhol yuboriladi.
            </div>
          </div>

          {/* 2. Kunlik Hisobot */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyDailyReport ? "bg-[var(--bg)] border-blue-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Kunlik Yig'ma Hisobot</div>
                  <div className="text-[11px] text-[var(--text3)]">Har kuni kechki hisobot</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyDailyReport} 
                onChange={e => setNotifyDailyReport(e.target.checked)} 
                className="w-4 h-4 rounded text-blue-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase">Yuborish vaqti:</span>
              <input 
                type="time" 
                value={dailyReportTime} 
                onChange={e => setDailyReportTime(e.target.value)}
                disabled={!notifyDailyReport}
                className="px-2.5 py-1 text-xs font-bold border border-[var(--border)] rounded-lg bg-[var(--bg2)] text-[var(--text)] outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 2. Kam Qolgan Tovar Ogohlantirishi */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyLowStock ? "bg-[var(--bg)] border-amber-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Kam Qolgan Tovar (Zaxira)</div>
                  <div className="text-[11px] text-[var(--text3)]">Kritik darajaga tushganda</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyLowStock} 
                onChange={e => setNotifyLowStock(e.target.checked)} 
                className="w-4 h-4 rounded text-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase">Chegara (≤ juft):</span>
              <div className="flex items-center gap-1.5">
                <input 
                  type="number" 
                  min="1" 
                  max="500" 
                  value={lowStockThreshold} 
                  onChange={e => setLowStockThreshold(Number(e.target.value))}
                  disabled={!notifyLowStock}
                  className="w-16 px-2 py-1 text-xs font-bold text-center border border-[var(--border)] rounded-lg bg-[var(--bg2)] text-[var(--text)] outline-none focus:border-amber-500"
                />
                <span className="text-xs text-[var(--text3)] font-medium">juft</span>
              </div>
            </div>
          </div>

          {/* 3. Katta Chiqim / Ulgurji Savdo */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyBigSale ? "bg-[var(--bg)] border-emerald-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Katta Chiqim / Ulgurji Savdo</div>
                  <div className="text-[11px] text-[var(--text3)]">Katta partiyalar sotilganda</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyBigSale} 
                onChange={e => setNotifyBigSale(e.target.checked)} 
                className="w-4 h-4 rounded text-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] font-bold text-[var(--text3)] uppercase">Chegara (≥ juft):</span>
              <div className="flex items-center gap-1.5">
                <input 
                  type="number" 
                  min="5" 
                  max="1000" 
                  value={bigSaleQtyThreshold} 
                  onChange={e => setBigSaleQtyThreshold(Number(e.target.value))}
                  disabled={!notifyBigSale}
                  className="w-16 px-2 py-1 text-xs font-bold text-center border border-[var(--border)] rounded-lg bg-[var(--bg2)] text-[var(--text)] outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-[var(--text3)] font-medium">juft</span>
              </div>
            </div>
          </div>

          {/* 4. Vozvrat Qabuli */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyVozvrat ? "bg-[var(--bg)] border-indigo-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Mijozdan Vozvrat Qabuli</div>
                  <div className="text-[11px] text-[var(--text3)]">Tovar qaytarilganda tezkor xabar</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyVozvrat} 
                onChange={e => setNotifyVozvrat(e.target.checked)} 
                className="w-4 h-4 rounded text-indigo-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] text-[var(--text3)] pt-2 border-t border-[var(--border)]">
              Mijoz ismi, qaytgan juftlar soni va holati darhol yuboriladi.
            </div>
          </div>

          {/* 5. Brak Tovarlar */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyBrak ? "bg-[var(--bg)] border-rose-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Brak Fondi Qaydlari</div>
                  <div className="text-[11px] text-[var(--text3)]">Nuqsonli tovar aniqlanganda</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyBrak} 
                onChange={e => setNotifyBrak(e.target.checked)} 
                className="w-4 h-4 rounded text-rose-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] text-[var(--text3)] pt-2 border-t border-[var(--border)]">
              Nuqson turi (chok, taglik, teri) va ombor nomi ko'rsatiladi.
            </div>
          </div>

          {/* 6. Kassa Moliya */}
          <div className={cn(
            "border rounded-2xl p-4.5 flex flex-col justify-between gap-3 transition-all",
            notifyKassaKirimChiqim ? "bg-[var(--bg)] border-purple-500/30 shadow-sm" : "bg-[var(--bg)]/50 border-[var(--border)] opacity-70"
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[var(--text)]">Kassa Tushum & Xarajatlar</div>
                  <div className="text-[11px] text-[var(--text3)]">Kassadagi yirik amallar</div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={notifyKassaKirimChiqim} 
                onChange={e => setNotifyKassaKirimChiqim(e.target.checked)} 
                className="w-4 h-4 rounded text-purple-500 cursor-pointer"
              />
            </div>
            <div className="text-[11px] text-[var(--text3)] pt-2 border-t border-[var(--border)]">
              Kun davomidagi barcha kassa o'zgarishlari hisobotga kiritiladi.
            </div>
          </div>
        </div>
      </div>

      {/* Reset Credentials Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-rose-500/30 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-4 mx-auto border border-rose-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-black text-center text-[var(--text)] mb-2">
              Telegram Ma'lumotlarini O'chirish
            </h3>

            <p className="text-xs text-center text-[var(--text3)] leading-relaxed mb-6">
              Haqiqatan ham saqlangan Bot Token va Chat ID ma'lumotlarini tizimdan tozalab tashlamoqchimisiz? Telegram xabarnomalari to'xtatiladi.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleClearCredentials}
                className="flex-1 py-3 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer shadow-md shadow-rose-600/20"
              >
                O'chirish va Tozalash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
