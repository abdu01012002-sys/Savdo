import React, { useState, useEffect, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { WarehouseName, User } from '../types';
import { 
  Moon, 
  Sun, 
  Factory, 
  Lock, 
  AlertCircle, 
  Smartphone, 
  KeyRound, 
  RefreshCw, 
  CheckCircle2, 
  UserCheck, 
  ExternalLink, 
  ShieldCheck, 
  Globe, 
  Sparkles,
  Delete,
  Copy,
  Info,
  Clock,
  Shield,
  Eye,
  EyeOff,
  Users,
  ChevronRight,
  ArrowLeft,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cn, generateId } from '../lib/utils';
import { toast } from 'sonner';
import { auth, googleProvider } from '../lib/fbClient';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { recordGoogleLogin } from '../lib/xodimlarTarixiService';
import { OfflineBanner } from './OfflineBanner';
import { QuotaExhaustedBanner } from './QuotaExhaustedBanner';

// Device and in-app browser detection
const isMobileBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const isInAppBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Telegram|Instagram|FBAN|FBAV|Line|WhatsApp|MicroMessenger/i.test(ua);
};

// Formatted live clock & date in Uzbek
const getLiveDateTime = () => {
  const now = new Date();
  const time = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const days = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const dayName = days[now.getDay()];
  const monthName = months[now.getMonth()];
  const dateStr = `${now.getDate()}-${monthName}, ${now.getFullYear()}`;
  return { time, dayName, dateStr };
};

export const LoginScreen = () => {
  const { db, setDb, setCurrentUser, theme, toggleTheme, isOffline } = useDb();
  
  // Auth method tab: 'google' | 'pin'
  const [authMode, setAuthMode] = useState<'pin' | 'google'>(() => {
    const isMobile = isMobileBrowser();
    const isInApp = isInAppBrowser();
    if (isInApp) return 'pin';
    return isMobile ? 'pin' : 'pin'; // Default to ultra-fast PIN
  });

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('ombor_last_user_id') || '';
    }
    return '';
  });

  // Toggle to switch between full employee card selector and single active PIN pad
  const [isSelectingUser, setIsSelectingUser] = useState<boolean>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ombor_last_user_id') : '';
    return !saved;
  });
  
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Security brute-force cooldown state
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Real-time clock state
  const [currentTime, setCurrentTime] = useState(getLiveDateTime());

  // Firebase user state
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRedirectAttempting, setIsRedirectAttempting] = useState(false);
  
  // Watchdog timer reference to prevent stuck loading state
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clock interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getLiveDateTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const clearLoadingTimeout = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };

  // Find currently selected user object
  const selectedUser = Array.isArray(db?.users) ? db.users.find(u => u.id === selectedUserId) : undefined;

  // If selected user doesn't exist in db, reset to selector
  useEffect(() => {
    if (selectedUserId && !selectedUser) {
      setSelectedUserId('');
      setIsSelectingUser(true);
    }
  }, [selectedUserId, selectedUser]);

  // Helper: auto-match Google user with local user profile
  const autoMatchUserWithGoogle = (user: FirebaseUser, userList: User[]) => {
    if (!userList || userList.length === 0) return;
    const email = (user.email || '').toLowerCase();
    const displayName = (user.displayName || '').toLowerCase();

    // 1. Try match by email
    const matchByEmail = userList.find(u => (u as any).email && (u as any).email.toLowerCase() === email);
    if (matchByEmail) {
      setSelectedUserId(matchByEmail.id);
      setIsSelectingUser(false);
      return;
    }

    // 2. Try match by name similarity
    if (displayName) {
      const matchByName = userList.find(u => {
        const uName = u.ism.toLowerCase();
        return displayName.includes(uName) || uName.includes(displayName.split(' ')[0]);
      });
      if (matchByName) {
        setSelectedUserId(matchByName.id);
        setIsSelectingUser(false);
      }
    }
  };

  // Check for redirect result on component mount
  useEffect(() => {
    let isMounted = true;
    
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result && result.user) {
          setFbUser(result.user);
          autoMatchUserWithGoogle(result.user, Array.isArray(db?.users) ? db.users : []);
          recordGoogleLogin(result.user).catch(console.error);
          toast.success(`Google orqali tasdiqlandi: ${result.user.email}`);
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.warn("Redirect auth result warning:", err);
        if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          handleAuthError(err);
        }
      });

    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!isMounted) return;
      setFbUser(user);
      if (user) {
        autoMatchUserWithGoogle(user, Array.isArray(db?.users) ? db.users : []);
        const sessionKey = `login_recorded_${user.uid}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, 'true');
          recordGoogleLogin(user).catch(() => {});
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      clearLoadingTimeout();
    };
  }, [db.users]);

  useEffect(() => {
    // Clear pin if user changes
    setPin('');
  }, [selectedUserId]);

  // Handle Physical Keyboard Navigation & Numpad
  useEffect(() => {
    if (isSelectingUser || cooldownSeconds > 0 || isLoggingIn) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleNumpadPress(e.key);
      } else if (e.key === 'Backspace') {
        handleNumpadDelete();
      } else if (e.key === 'Escape') {
        handleNumpadClear();
      } else if (e.key === 'Enter') {
        if (selectedUserId && pin.length === 4) {
          submitLogin(selectedUserId, pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUserId, pin, isSelectingUser, cooldownSeconds, isLoggingIn]);

  const handleNumpadPress = (digit: string) => {
    if (cooldownSeconds > 0 || isLoggingIn) return;
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4 && selectedUserId) {
        // Auto-login trigger
        setTimeout(() => {
          submitLogin(selectedUserId, nextPin);
        }, 150);
      }
    }
  };

  const handleNumpadDelete = () => {
    if (cooldownSeconds > 0 || isLoggingIn) return;
    setPin(prev => prev.slice(0, -1));
  };

  const handleNumpadClear = () => {
    if (cooldownSeconds > 0 || isLoggingIn) return;
    setPin('');
  };

  const handleAuthError = (e: any) => {
    clearLoadingTimeout();
    setIsGoogleLoading(false);
    setIsRedirectAttempting(false);

    const code = e?.code || '';
    const msg = e?.message || '';

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      setLoginError(null);
      return;
    }

    console.warn("Google Auth Handler:", code, msg);

    if (code === 'auth/popup-blocked') {
      const errorText = "Brauzeringiz qalqib chiquvchi oynani (popup) to'sib qo'ydi. Quyidagi 'Qayta yo'naltirish (Redirect)' tugmasini bosing yoki to'g'ridan-to'g'ri PIN kod bilan kiring.";
      setLoginError(errorText);
      toast.error("Popup oynasi bloklandi. PIN kod yoki Redirect orqali kiring.", { duration: 5000 });
      return;
    }

    if (code === 'auth/disallowed-useragent' || isInAppBrowser()) {
      const errorText = "Google Telegram / in-app brauzerlarda to'g'ridan-to'g'ri kirishni cheklagan. Ilovani telefon brauzerida (Chrome / Safari) oching yoki bevosita PIN kod orqali kiring.";
      setLoginError(errorText);
      toast.error(errorText, { duration: 6000 });
      return;
    }

    if (code === 'auth/operation-not-supported-in-this-environment') {
      const errorText = "Ushbu brauzerda popup qo'llab-quvvatlanmaydi. PIN kod orqali to'g'ridan-to'g'ri kirishingiz mumkin.";
      setLoginError(errorText);
      toast.error(errorText, { duration: 5000 });
      return;
    }

    if (code === 'auth/unauthorized-domain') {
      const errorText = "Ushbu veb-domen Firebase'da ro'yxatdan o'tmagan. Siz bevosita PIN kod orqali tizimdan to'liq foydalanishingiz mumkin.";
      setLoginError(errorText);
      toast.info("PIN kod orqali to'g'ridan-to'g'ri kirishingiz mumkin.", { duration: 5000 });
      return;
    }

    if (code === 'auth/network-request-failed') {
      const errorText = "Internet aloqasi sekin yoki uzilgan. Tarmoqni tekshirib qayta urinib ko'ring yoki PIN kod bilan kiring.";
      setLoginError(errorText);
      toast.error(errorText, { duration: 5000 });
      return;
    }

    const fallbackMsg = msg || "Google orqali ulanishda xatolik yuz berdi. To'g'ridan-to'g'ri PIN kod orqali kirishingiz mumkin.";
    setLoginError(fallbackMsg);
    toast.error("Google orqali kirishda xatolik yuz berdi. PIN kod orqali kirishingiz mumkin.", { duration: 4000 });
  };

  // Google Login via standard Popup with mobile fallback
  const doGoogleLogin = async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    setLoginError(null);

    clearLoadingTimeout();
    loadingTimeoutRef.current = setTimeout(() => {
      setIsGoogleLoading(false);
      setLoginError("Javob kutish vaqti tugadi. Agar oyna ochilmagan bo'lsa, 'Redirect' tugmasi yoki PIN kod orqali kiring.");
    }, 14000);

    try {
      const res = await signInWithPopup(auth, googleProvider);
      clearLoadingTimeout();
      if (res && res.user) {
        setFbUser(res.user);
        autoMatchUserWithGoogle(res.user, Array.isArray(db?.users) ? db.users : []);
        await recordGoogleLogin(res.user);
        toast.success(`Xush kelibsiz: ${res.user.email}`);
        setLoginError(null);
      }
    } catch (e: any) {
      clearLoadingTimeout();
      const code = e?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || isMobileBrowser()) {
        try {
          setIsRedirectAttempting(true);
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr: any) {
          handleAuthError(redirectErr);
        }
      } else {
        handleAuthError(e);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const doGoogleLoginRedirect = async () => {
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    setIsRedirectAttempting(true);
    setLoginError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (e: any) {
      handleAuthError(e);
      setIsGoogleLoading(false);
      setIsRedirectAttempting(false);
    }
  };

  const doGoogleLogout = async () => {
    try {
      await signOut(auth);
      setFbUser(null);
      toast.info("Google hisobidan chiqildi");
    } catch (e: any) {
      console.error(e);
    }
  };

  const copyAppUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Ilova havolasi nusxalandi! Chrome yoki Safari brauzerida oching.");
    }
  };

  const submitLogin = async (userId: string, userPin: string) => {
    if (cooldownSeconds > 0) {
      toast.error(`Xavfsizlik blokirovkasi! Iltimos ${cooldownSeconds} soniya kuting.`);
      return;
    }

    if (!userId) {
      toast.error('Xodim profilini tanlang!');
      setIsSelectingUser(true);
      return;
    }
    if (!userPin || userPin.length !== 4) {
      toast.error('PIN kodingizni to\'liq 4 xonali kiriting!');
      return;
    }

    setIsLoggingIn(true);

    const user = Array.isArray(db?.users) ? db.users.find(u => u.id === userId && u.pin === userPin) : undefined;
    if (!user) {
      setIsLoggingIn(false);
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);
      
      // Shake animation effect
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      setPin('');

      if (nextFailed >= 5) {
        setCooldownSeconds(30);
        toast.error('5 marta noto\'g\'ri PIN kiritildi! Tizim 30 soniyaga bloklandi.');

        // Record security audit log
        setDb(prev => {
          const draft = JSON.parse(JSON.stringify(prev));
          if (!draft.auditLogs) draft.auditLogs = [];
          draft.auditLogs.push({
            id: generateId(),
            date: new Date().toISOString(),
            user: selectedUser?.ism || 'Noma\'lum',
            action: 'Xavfsizlik ogohlantirishi',
            details: `Ketma-ket 5 marta noto'g'ri PIN kod kiritildi. Tizim vaqtincha 30 soniyaga bloklandi.`
          });
          return draft;
        });
      } else {
        toast.error(`PIN kod noto'g'ri! (${5 - nextFailed} ta urinish qoldi)`);
      }
      return;
    }

    // Save last user id for fast convenience
    try {
      localStorage.setItem('ombor_last_user_id', user.id);
    } catch (e) {}

    // Record login with selected user in XodimlarTarixi
    if (fbUser) {
      recordGoogleLogin(fbUser, user).catch(console.error);
    }

    // Push audit log
    const auditText = fbUser?.email 
      ? `Tizimga "${fbUser.email}" Google akkounti orqali (${user.ism} sifatida) muvaffaqiyatli kirildi.`
      : `Tizimga PIN kod orqali (${user.ism} sifatida) to'g'ridan-to'g'ri muvaffaqiyatli kirildi.`;

    setDb(prev => {
      const draft = JSON.parse(JSON.stringify(prev));
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(),
        date: new Date().toISOString(),
        user: user.ism,
        action: 'Tizimga kirish',
        details: auditText
      });
      return draft;
    });

    setFailedAttempts(0);
    setCurrentUser(user);
    toast.success(`Xush kelibsiz, ${user.ism}!`);
  };

  const isLight = theme === 'light';
  const inApp = isInAppBrowser();
  const isMobile = isMobileBrowser();

  return (
    <div className={cn(
      "min-h-screen flex flex-col justify-between bg-[var(--bg)] relative p-3 sm:p-6 select-none transition-colors duration-200",
      "bg-[radial-gradient(ellipse_at_65%_15%,rgba(168,85,247,.09)_0%,transparent_55%),radial-gradient(ellipse_at_20%_85%,rgba(59,130,246,.07)_0%,transparent_50%)]"
    )}>
      {/* Top Banner Alerts */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <OfflineBanner isOffline={isOffline} />
        <QuotaExhaustedBanner />
      </div>

      {/* 1. TOP STATUS & INFO HEADER */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between pt-2 pb-4 z-10">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black shadow-lg shadow-purple-500/25">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-[var(--text)] flex items-center gap-1">
              Ombor<span className="text-purple-600 dark:text-purple-400">Pro</span>
              <span className="text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider ml-1 border border-purple-500/20">v2.5</span>
            </h1>
            <p className="text-[11px] font-semibold text-[var(--text3)] hidden sm:block">
              Poyabzal ishlab chiqarish va ombor boshqaruvi
            </p>
          </div>
        </div>

        {/* Live Clock & Connectivity Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cloud Sync Status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-full text-[11px] font-bold text-[var(--text2)] shadow-2xs">
            {isOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">Oflayn rejim</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-600 dark:text-emerald-400">Onlayn</span>
              </>
            )}
          </div>

          {/* Clock Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-full text-[12px] font-bold text-[var(--text)] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span>{currentTime.time}</span>
            <span className="text-[10px] text-[var(--text3)] font-normal hidden md:inline">• {currentTime.dayName}</span>
          </div>

          {/* Theme Switcher */}
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full text-[var(--text3)] hover:text-purple-600 dark:hover:text-purple-400 hover:bg-[var(--bg2)] transition-colors cursor-pointer border border-[var(--border)] bg-[var(--bg2)] shadow-2xs"
            title="Mavzuni almashtirish (Tun/Kun)"
          >
            {isLight ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 2. MAIN LOGIN CONTAINER */}
      <main className="w-full max-w-[460px] mx-auto my-auto z-10">
        <div className={cn(
          "bg-[var(--bg2)] border border-[var(--border)] rounded-[32px] p-5 sm:p-8 shadow-2xl transition-all relative overflow-hidden",
          isShaking && "animate-shake ring-2 ring-rose-500"
        )}>
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-14 -right-14 w-44 h-44 bg-purple-500/12 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-14 -left-14 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* In-app Browser Warning */}
          {inApp && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-left flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
                <span className="font-bold">Telegram / Webview:</span> PIN kod orqali tezkor kiring yoki havolani asosiy brauzeringizda oching.
              </div>
              <button 
                onClick={copyAppUrl}
                className="text-[10px] font-black bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-lg shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                title="Havolani nusxalash"
              >
                <Copy className="w-3 h-3" />
                <span>Nusxa</span>
              </button>
            </div>
          )}

          {/* Google Active User Banner */}
          {fbUser ? (
            <div className="mb-5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center shadow-xs">
              <div className="flex items-center gap-2.5 overflow-hidden">
                {fbUser.photoURL ? (
                  <img 
                    src={fbUser.photoURL} 
                    alt="" 
                    className="w-8 h-8 rounded-full border border-emerald-500/30 object-cover shrink-0" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                <div className="flex flex-col truncate">
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 inline" /> Google Tasdiqlangan
                  </span>
                  <span className="text-[12px] font-bold text-[var(--text)] truncate">{fbUser.email}</span>
                </div>
              </div>
              <button 
                onClick={doGoogleLogout}
                className="text-[11px] font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer shrink-0 ml-2"
                title="Google hisobidan chiqish"
              >
                Chiqish
              </button>
            </div>
          ) : (
            /* Segmented Switcher: PIN vs Google */
            <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-2xl mb-5">
              <button
                onClick={() => {
                  setAuthMode('pin');
                  setLoginError(null);
                }}
                className={cn(
                  "py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2",
                  authMode === 'pin'
                    ? "bg-[var(--bg2)] text-purple-600 dark:text-purple-400 shadow-xs border border-[var(--border)]"
                    : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>PIN Kod orqali</span>
              </button>
              <button
                onClick={() => {
                  setAuthMode('google');
                  setLoginError(null);
                }}
                className={cn(
                  "py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2",
                  authMode === 'google'
                    ? "bg-[var(--bg2)] text-blue-600 dark:text-blue-400 shadow-xs border border-[var(--border)]"
                    : "text-[var(--text3)] hover:text-[var(--text)]"
                )}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Google orqali</span>
              </button>
            </div>
          )}

          {/* Cooldown Security Alert Banner */}
          {cooldownSeconds > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-left flex items-start gap-3 animate-in fade-in duration-200">
              <Shield className="w-5 h-5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1">
                <h4 className="text-[13px] font-black text-rose-600 dark:text-rose-400">Xavfsizlik blokirovkasi faol</h4>
                <p className="text-[11px] text-rose-600/90 dark:text-rose-400/90 mt-0.5">
                  5 marta ketma-ket noto'g'ri PIN kiritildi. Qayta urinish uchun kuting: <span className="font-black text-[13px] underline">{cooldownSeconds} soniya</span>
                </p>
                {/* Progress bar */}
                <div className="w-full bg-rose-500/20 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-rose-500 h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(cooldownSeconds / 30) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Login Error Notification */}
          {loginError && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-left flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-[12px] text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
                {loginError}
              </div>
            </div>
          )}

          {/* MODE 1: GOOGLE AUTH VIEW */}
          {!fbUser && authMode === 'google' && (
            <div className="flex flex-col gap-3.5 text-center animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-left">
                <div className="flex items-center gap-2 font-bold text-blue-500 text-xs mb-1">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>Google hisobi orqali avtorizatsiya</span>
                </div>
                <p className="text-[11px] text-[var(--text3)] leading-relaxed">
                  Google hisobingiz orqali tizimga tezkor ulaning. Har bir amal xodimlar tarixiga qayd etiladi.
                </p>
              </div>

              <button 
                onClick={doGoogleLogin}
                disabled={isGoogleLoading}
                className={cn(
                  "w-full py-4 rounded-2xl text-[14px] font-black transition-all duration-200 shadow-md bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 flex items-center justify-center gap-3 active:scale-[0.99]",
                  isGoogleLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:shadow-lg'
                )}
              >
                {isGoogleLoading ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                <span>{isGoogleLoading ? 'Ulanmoqda...' : 'Google orqali kirish'}</span>
              </button>

              {isMobile && (
                <button
                  onClick={doGoogleLoginRedirect}
                  disabled={isGoogleLoading}
                  className="w-full py-2.5 px-3 rounded-xl text-[11px] font-bold text-[var(--text2)] bg-[var(--bg)] hover:bg-[var(--bg2)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                  <span>Telefonda qayta yo'naltirish (Redirect)</span>
                </button>
              )}

              <div className="text-[11px] text-[var(--text3)] flex items-center justify-center gap-1.5 pt-2">
                <span>Yoki to'g'ridan-to'g'ri:</span>
                <button 
                  onClick={() => setAuthMode('pin')}
                  className="font-black text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                >
                  PIN kod bilan kirish →
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: PIN AUTH VIEW */}
          {(fbUser || authMode === 'pin') && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              
              {/* SUB-VIEW 2A: EMPLOYEE SELECTOR GRID (If no user or changing user) */}
              {isSelectingUser || !selectedUser ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[var(--text3)] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-500" />
                      <span>Xodim profilingizni tanlang</span>
                    </label>
                    {selectedUser && (
                      <button 
                        onClick={() => setIsSelectingUser(false)}
                        className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                      >
                        Bekor qilish
                      </button>
                    )}
                  </div>

                  {/* Employee Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {(Array.isArray(db?.users) ? db.users : []).map((u, uIdx) => {
                      const isAdmin = u.rol === 'admin';
                      const isSelected = u.id === selectedUserId;
                      return (
                        <button
                          key={`${u.id || 'user'}_${uIdx}`}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setIsSelectingUser(false);
                            setPin('');
                          }}
                          className={cn(
                            "p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center gap-3 relative group",
                            isSelected
                              ? "bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/20"
                              : "bg-[var(--bg)] border-[var(--border)] hover:border-purple-500/50 hover:bg-[var(--bg)]/80"
                          )}
                        >
                          {/* Avatar Circle */}
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-xs transition-transform group-hover:scale-105",
                            isAdmin 
                              ? "bg-gradient-to-tr from-amber-500 to-purple-600 text-white" 
                              : "bg-gradient-to-tr from-blue-500 to-indigo-600 text-white"
                          )}>
                            {u.ism ? u.ism[0].toUpperCase() : 'X'}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-[13px] font-black text-[var(--text)] truncate flex items-center gap-1">
                              {u.ism}
                            </h4>
                            <span className={cn(
                              "inline-flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-md mt-0.5",
                              isAdmin 
                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/25" 
                                : "bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/25"
                            )}>
                              {isAdmin ? '👑 Admin' : '👤 Xodim'}
                            </span>
                          </div>

                          <ChevronRight className="w-4 h-4 text-[var(--text3)] group-hover:text-purple-500 transition-colors shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* SUB-VIEW 2B: REMEMBERED USER PROFILE & INTERACTIVE PIN PAD */
                <div className="space-y-4">
                  {/* Active Employee Hero Card */}
                  <div className="p-3.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base text-white shrink-0 shadow-md",
                        selectedUser.rol === 'admin' 
                          ? "bg-gradient-to-tr from-amber-500 via-purple-600 to-indigo-600 shadow-purple-500/20" 
                          : "bg-gradient-to-tr from-blue-500 to-indigo-600 shadow-blue-500/20"
                      )}>
                        {selectedUser.ism ? selectedUser.ism[0].toUpperCase() : 'X'}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px] font-black text-[var(--text)] truncate">{selectedUser.ism}</span>
                          <span className={cn(
                            "text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wider",
                            selectedUser.rol === 'admin'
                              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25"
                              : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25"
                          )}>
                            {selectedUser.rol === 'admin' ? '👑 Admin' : '👤 Xodim'}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-[var(--text3)] mt-0.5">
                          PIN kodni kiriting
                        </p>
                      </div>
                    </div>

                    {/* Switch Profile Button */}
                    <button
                      type="button"
                      onClick={() => setIsSelectingUser(true)}
                      className="px-2.5 py-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl transition-colors cursor-pointer shrink-0 ml-2"
                      title="Boshqa xodim profilini tanlash"
                    >
                      Almashtirish
                    </button>
                  </div>

                  {/* Visual 4-Digit PIN Status Display */}
                  <div className="flex flex-col items-center justify-center pt-1 pb-1">
                    <div className="flex items-center gap-3.5 mb-2">
                      {[0, 1, 2, 3].map(idx => {
                        const isFilled = pin.length > idx;
                        const isCurrent = pin.length === idx;
                        return (
                          <div 
                            key={idx}
                            className={cn(
                              "w-12 h-13 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 shadow-2xs",
                              isFilled 
                                ? "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-500/25 scale-105" 
                                : isCurrent 
                                  ? "bg-[var(--bg)] border-purple-500 ring-4 ring-purple-500/15 scale-100" 
                                  : "bg-[var(--bg)] border-[var(--border2)]"
                            )}
                          >
                            {isFilled ? (
                              showPin ? (
                                <span className="font-black text-lg">{pin[idx]}</span>
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full bg-white animate-in zoom-in-50 duration-150" />
                              )
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-[var(--text3)]/30" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Show/Hide PIN toggle */}
                    <button
                      type="button"
                      onClick={() => setShowPin(prev => !prev)}
                      className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--text)] flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-[var(--bg)] transition-colors cursor-pointer mt-1"
                    >
                      {showPin ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-purple-500" />
                          <span>PIN kodni yashirish</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-purple-500" />
                          <span>PIN kodni ko'rish</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* POS / Touch Interactive Numpad */}
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                      <button
                        key={num}
                        type="button"
                        disabled={cooldownSeconds > 0 || isLoggingIn}
                        onClick={() => handleNumpadPress(num)}
                        className={cn(
                          "py-3.5 sm:py-4 bg-[var(--bg)] hover:bg-purple-500/10 active:bg-purple-500/20 active:scale-95 border border-[var(--border)] rounded-2xl text-xl font-black text-[var(--text)] transition-all cursor-pointer shadow-xs",
                          (cooldownSeconds > 0 || isLoggingIn) && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                    
                    {/* Clear Button */}
                    <button
                      type="button"
                      disabled={cooldownSeconds > 0 || isLoggingIn}
                      onClick={handleNumpadClear}
                      className={cn(
                        "py-3.5 sm:py-4 bg-[var(--bg)] hover:bg-rose-500/10 active:bg-rose-500/20 active:scale-95 border border-[var(--border)] rounded-2xl text-xs font-black text-rose-500 transition-all cursor-pointer",
                        (cooldownSeconds > 0 || isLoggingIn) && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      Tozalash
                    </button>

                    {/* Zero */}
                    <button
                      type="button"
                      disabled={cooldownSeconds > 0 || isLoggingIn}
                      onClick={() => handleNumpadPress('0')}
                      className={cn(
                        "py-3.5 sm:py-4 bg-[var(--bg)] hover:bg-purple-500/10 active:bg-purple-500/20 active:scale-95 border border-[var(--border)] rounded-2xl text-xl font-black text-[var(--text)] transition-all cursor-pointer shadow-xs",
                        (cooldownSeconds > 0 || isLoggingIn) && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      0
                    </button>

                    {/* Backspace Button */}
                    <button
                      type="button"
                      disabled={cooldownSeconds > 0 || isLoggingIn}
                      onClick={handleNumpadDelete}
                      className={cn(
                        "py-3.5 sm:py-4 bg-[var(--bg)] hover:bg-amber-500/10 active:bg-amber-500/20 active:scale-95 border border-[var(--border)] rounded-2xl text-sm font-black text-amber-500 transition-all cursor-pointer flex items-center justify-center",
                        (cooldownSeconds > 0 || isLoggingIn) && "opacity-40 cursor-not-allowed"
                      )}
                      title="Bitta o'chirish"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Primary Login Submit Button */}
                  <button 
                    type="button"
                    disabled={cooldownSeconds > 0 || isLoggingIn || pin.length !== 4}
                    onClick={() => submitLogin(selectedUserId, pin)}
                    className={cn(
                      "w-full py-4 rounded-2xl text-[15px] font-black transition-all duration-200 shadow-lg text-white flex items-center justify-center gap-2 mt-2 select-none",
                      (cooldownSeconds > 0 || isLoggingIn || pin.length !== 4)
                        ? "bg-purple-600/50 cursor-not-allowed opacity-60"
                        : "bg-purple-600 hover:bg-purple-700 active:scale-[0.99] cursor-pointer shadow-purple-500/25"
                    )}
                  >
                    {isLoggingIn ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Tizimga Kirish</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* 3. BOTTOM FOOTER INFO */}
      <footer className="w-full max-w-5xl mx-auto py-2 text-center text-[11px] text-[var(--text3)] font-medium z-10">
        <span>© {new Date().getFullYear()} Ombor Pro • Barcha huquqlar himoyalangan</span>
      </footer>
    </div>
  );
};
