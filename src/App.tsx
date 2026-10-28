import React, { useState, useEffect, useMemo, Suspense, lazy, Component, ErrorInfo, ReactNode } from 'react';
import { useDb } from './context/DbContext';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/LoginScreen';
import { CommandPalette } from './components/CommandPalette';
import { OfflineBanner } from './components/OfflineBanner';
import { QuotaExhaustedBanner } from './components/QuotaExhaustedBanner';
import { ChangelogModal } from './components/ChangelogModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { BarcodeScannerModal, ScanResult } from './components/BarcodeScannerModal';
import { ModelDrillDownModal } from './components/ModelDrillDownModal';
import { APP_VERSION_CONFIG, hasSeenCurrentVersion, markCurrentVersionAsSeen } from './version';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Loader2, RefreshCw, AlertCircle, Camera, QrCode } from 'lucide-react';

// Eagerly load all pages for instant zero-latency navigation and eliminate chunk loading / React hook boundary issues
import AsosiyPage from './pages/AsosiyPage';
import ChiqimPage from './pages/ChiqimPage';
import KirimPage from './pages/KirimPage';
import OmborPage from './pages/OmborPage';
import KassaPage from './pages/KassaPage';
import TarixPage from './pages/TarixPage';
import DashboardPage from './pages/DashboardPage';
import OlchamPage from './pages/OlchamPage';
import OtkazmaPage from './pages/OtkazmaPage';
import NarxlarPage from './pages/NarxlarPage';
import SozlamalarPage from './pages/SozlamalarPage';
import InventarizatsiyaPage from './pages/InventarizatsiyaPage';
import AuditPage from './pages/AuditPage';
import ProfilPage from './pages/ProfilPage';
import VozvratBrakPage from './pages/VozvratBrakPage';
import MijozlarPage from './pages/MijozlarPage';
import BarcodePage from './pages/BarcodePage';

// Error Boundary for page routes
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Page rendering error caught by boundary:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center bg-[var(--bg2)] rounded-2xl border border-[var(--border)] shadow-sm max-w-lg mx-auto mt-8 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4 shadow-sm">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-[var(--text)] mb-1.5">
            Sahifada xatolik yuz berdi
          </h3>
          <p className="text-xs text-[var(--text3)] mb-5 max-w-sm">
            Sahifani yangilash orqali qayta urinib ko'ring.
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sahifani Qayta Yuklash</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

type Tab = 'asosiy' | 'ombor' | 'olcham' | 'kirim' | 'chiqim' | 'otkazma' | 'tarix' | 'dashboard' | 'sozlamalar' | 'narxlar' | 'inventarizatsiya' | 'audit' | 'profil' | 'kassa' | 'vozvrat-brak' | 'mijozlar' | 'shtrix-kod';

function AppContent() {
  const { db, currentUser, setCurrentUser, theme, toggleTheme, isOffline } = useDb();
  const [activeTab, setActiveTab] = useState<Tab>(() => currentUser?.rol === 'admin' ? 'dashboard' : 'asosiy');

  // Foydalanuvchi tizimga kirganda (yoki profil almashganda) tegishli boshlang'ich sahifani ochish
  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.rol === 'admin') {
        setActiveTab('dashboard');
      } else {
        setActiveTab('asosiy');
      }
    }
  }, [currentUser?.ism, currentUser?.rol]);

  // Avtomatik xavfsiz qulflash (Inactivity Auto-Lock: 20 daqiqa harakatsizlikda)
  React.useEffect(() => {
    if (!currentUser) return;

    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT_MS = 20 * 60 * 1000; // 20 daqiqa

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          localStorage.setItem('ombor_last_user_id', currentUser.id);
        } catch (e) {}
        setCurrentUser(null);
        toast.info("Harakatsizlik tufayli xavfsizlik maqsadida ekran qulflangandi. PIN kodingizni kiriting.", { duration: 6000 });
      }, INACTIVITY_LIMIT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [currentUser?.id, setCurrentUser]);

  React.useEffect(() => {
    const adminOnlyTabs = ['dashboard', 'inventarizatsiya', 'audit', 'sozlamalar', 'profil', 'kassa'];
    
    // Agar oddiy xodim bo'lsa va admin sahifasida turgan bo'lsa, avtomatik 'asosiy' ga yo'naltirish
    if (currentUser?.rol !== 'admin' && adminOnlyTabs.includes(activeTab)) {
      setActiveTab('asosiy');
    }

    const handleNav = (e: any) => {
      const target = e.detail as Tab;
      if (currentUser?.rol !== 'admin' && adminOnlyTabs.includes(target)) {
        setActiveTab('asosiy');
      } else {
        setActiveTab(target);
      }
    };

    const handleOpenSidebar = () => setIsSidebarOpen(true);
    const handleOpenChangelog = () => setIsChangelogOpen(true);

    window.addEventListener('navigate', handleNav);
    window.addEventListener('open-sidebar', handleOpenSidebar);
    window.addEventListener('open-changelog', handleOpenChangelog);
    return () => {
      window.removeEventListener('navigate', handleNav);
      window.removeEventListener('open-sidebar', handleOpenSidebar);
      window.removeEventListener('open-changelog', handleOpenChangelog);
    };
  }, [currentUser?.rol, activeTab]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedModelForModal, setScannedModelForModal] = useState<string | null>(null);

  // Barcha mavjud modellar ro'yxati (shtrix-kodni aniq modelga moslashtirish uchun)
  const availableModelNames = useMemo(() => {
    const set = new Set<string>();
    if (db?.tepa?.stock) Object.keys(db.tepa.stock).forEach(m => set.add(m));
    if (db?.kotta?.stock) Object.keys(db.kotta.stock).forEach(m => set.add(m));
    if (db?.sort2?.stock) Object.keys(db.sort2.stock).forEach(m => set.add(m));
    if (db?.prices) Object.keys(db.prices).forEach(m => set.add(m));
    return Array.from(set);
  }, [db]);

  const handleGlobalScan = (result: ScanResult) => {
    setIsScannerOpen(false);
    
    const target = result.model.trim();
    // Case-insensitive exact or partial match
    const matched = availableModelNames.find(
      m => m.toLowerCase() === target.toLowerCase()
    ) || availableModelNames.find(
      m => m.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(m.toLowerCase())
    ) || target;

    // Bir soniyada model qoldig'ini drill-down modalda ko'rsatish
    setScannedModelForModal(matched);
    toast.success(`"${matched}" modeli aniqlandi! Qoldiq yuklandi.`);
  };

  // Notify user once about new version features
  useEffect(() => {
    if (currentUser && !hasSeenCurrentVersion()) {
      const timer = setTimeout(() => {
        toast("🚀 OmborPro v" + APP_VERSION_CONFIG.version + " versiyasiga yangilandi!", {
          description: APP_VERSION_CONFIG.description || "Yangi imkoniyatlar va tezlik optimizatsiyasi qo'shildi.",
          duration: 2000,
          action: {
            label: "Nimalar yangi?",
            onClick: () => {
              setIsChangelogOpen(true);
              markCurrentVersionAsSeen();
            }
          }
        });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden text-[var(--text)]">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />

      <CommandPalette setActiveTab={setActiveTab} />
      <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <OfflineBanner isOffline={isOffline} />
        <QuotaExhaustedBanner />
        <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
        
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative pb-28 lg:pb-10">
          <div className="max-w-[1400px] mx-auto w-full pb-10">
            <PageErrorBoundary>
              {activeTab === 'asosiy' && (
                <AsosiyPage 
                  onNavigate={setActiveTab} 
                  onOpenSidebar={() => setIsSidebarOpen(true)} 
                />
              )}
              {activeTab === 'ombor' && <OmborPage />}
              {activeTab === 'olcham' && <OlchamPage />}
              {activeTab === 'kirim' && <KirimPage />}
              {activeTab === 'chiqim' && <ChiqimPage />}
              {activeTab === 'otkazma' && <OtkazmaPage />}
              {activeTab === 'vozvrat-brak' && <VozvratBrakPage />}
              {activeTab === 'tarix' && <TarixPage />}
              {activeTab === 'dashboard' && currentUser.rol === 'admin' && <DashboardPage />}
              {activeTab === 'kassa' && currentUser.rol === 'admin' && <KassaPage />}
              {activeTab === 'inventarizatsiya' && currentUser.rol === 'admin' && <InventarizatsiyaPage />}
              {activeTab === 'shtrix-kod' && currentUser.rol === 'admin' && <BarcodePage />}
              {activeTab === 'narxlar' && <NarxlarPage />}
              {activeTab === 'audit' && currentUser.rol === 'admin' && <AuditPage />}
              {activeTab === 'sozlamalar' && currentUser.rol === 'admin' && <SozlamalarPage />}
              {activeTab === 'profil' && currentUser.rol === 'admin' && <ProfilPage />}
              {activeTab === 'mijozlar' && <MijozlarPage />}
            </PageErrorBoundary>
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar (Thumb-Zone, elevated actions button, zero crowding) */}
        <MobileBottomNav 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenScanner={() => setIsScannerOpen(true)}
        />

        {/* KAMERA ORQALI SKANERLASH TUGMASI (FAB - FLOATING ACTION BUTTON) - Faqat omborchi uchun */}
        {currentUser?.rol !== 'admin' && (
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="fixed right-4 sm:right-6 bottom-20 sm:bottom-6 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-2xl shadow-purple-600/40 border-2 border-white/25 flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95 group focus:outline-hidden"
            title="Kamera orqali shtrix-kod yoki QR-kodni skanerlash (Qoldiqni tekshirish)"
            aria-label="Kamera Skaner"
          >
            <div className="relative flex items-center justify-center">
              <Camera className="w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover:scale-110" />
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-zinc-900"></span>
              </span>
            </div>
            
            {/* Tooltip on Desktop hover */}
            <span className="absolute right-full mr-3 px-3 py-1.5 rounded-xl bg-zinc-900/90 text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg border border-white/10 hidden sm:flex items-center gap-1.5 backdrop-blur-xs">
              <QrCode size={13} className="text-purple-400" />
              <span>Kamera Skaner (Qoldiq tekshirish)</span>
            </span>
          </button>
        )}

        {/* Global Barcode Scanner Modal */}
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleGlobalScan}
          availableModels={availableModelNames}
          title="Kamera Shtrix-kod & QR Skaner"
          description="Tovar ustidagi shtrix-kod yoki QR-kodni kameraga qarating — model qoldig'i darhol ko'rsatiladi"
        />

        {/* Skanerlangan Modelning Qoldiq Tafsilotlari Modali (Soniyada ko'rsatadi) */}
        {scannedModelForModal && (
          <ModelDrillDownModal
            modelName={scannedModelForModal}
            onClose={() => setScannedModelForModal(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (r) {
        // Har 30 daqiqada yangi versiya bor-yo'qligini tekshirish
        setInterval(async () => {
          if (!r.installing && navigator.onLine) {
            try {
              await r.update();
            } catch (e) {
              console.error('SW update check error:', e);
            }
          }
        }, 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast('Yangi versiya tayyor!', {
        description: 'Ilovani yangilash va eng so\'nggi o\'zgarishlarni qo\'llash uchun tugmani bosing.',
        duration: Infinity,
        action: {
          label: 'Yangi versiyani yuklash',
          onClick: () => updateServiceWorker(true),
        },
        cancel: {
          label: 'Keyinroq',
          onClick: () => setNeedRefresh(false),
        },
      });
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh]);

  const { currentUser } = useDb();

  return (
    <>
      <AppContent key={currentUser?.id || 'guest'} />
      <Toaster position="bottom-right" richColors />
    </>
  );
}
