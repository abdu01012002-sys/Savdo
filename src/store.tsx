// src/store.tsx
// React Store Boshqaruvi: Hybrid Persistence (LocalStorage 0ms + Firestore onSnapshot Real-time Sync)
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { subscribeToCollection, saveWithOptimisticUpdate } from './services/firebase';

/**
 * 1-qadam: Boshlang'ich Holatni LocalStorage'dan Yuklash
 * Sahifa ochilishi bilan tarmoqni kutmasdan keshdan olinadi (0 millisekundlik javob tezligi)
 */
export const getInitialState = <T,>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch (e) {
    console.warn(`[STORE] Keshni o'qishda xatolik (${key}):`, e);
    return defaultValue;
  }
};

export interface StoreContextType {
  // Asosiy real-time kolleksiyalar holati
  ombor: any[];
  setOmbor: React.Dispatch<React.SetStateAction<any[]>>;
  savdolar: any[];
  setSavdolar: React.Dispatch<React.SetStateAction<any[]>>;
  kontragentlar: any[];
  setKontragentlar: React.Dispatch<React.SetStateAction<any[]>>;
  kassa: any[];
  setKassa: React.Dispatch<React.SetStateAction<any[]>>;
  transactions: any[];
  setTransactions: React.Dispatch<React.SetStateAction<any[]>>;

  // Optimistik amallar yordamchilari
  addSavdo: (item: any) => Promise<void>;
  updateOmbor: (id: string, item: any) => Promise<void>;
  isSyncing: boolean;
  lastSyncTime: Date | null;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  // 1. Sahifa ochilishi bilan tarmoqni kutmasdan keshdan olinadi (0 ms)
  const [ombor, setOmbor] = useState<any[]>(() => getInitialState('cache_ombor', []));
  const [savdolar, setSavdolar] = useState<any[]>(() => getInitialState('cache_savdolar', []));
  const [kontragentlar, setKontragentlar] = useState<any[]>(() => getInitialState('cache_kontragentlar', []));
  const [kassa, setKassa] = useState<any[]>(() => getInitialState('cache_kassaHarakatlari', []));
  const [transactions, setTransactions] = useState<any[]>(() => getInitialState('cache_transactions', []));

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  /**
   * 2-qadam: Firestore Tinglovchilarini Faollashtirish va Clean-up
   * onSnapshot serverdagi har qanday o'zgarishni boshqa qurilmalardan <100ms ichida qabul qiladi
   */
  useEffect(() => {
    setIsSyncing(true);

    // 1. Ombor kolleksiyasini tinglash
    const unsubOmbor = subscribeToCollection('ombor', (data) => {
      setOmbor(data);
      setLastSyncTime(new Date());
      setIsSyncing(false);
    });

    // 2. Savdolar (chiqimlar) kolleksiyasini tinglash
    const unsubSavdolar = subscribeToCollection('savdolar', (data) => {
      setSavdolar(data);
      setLastSyncTime(new Date());
      setIsSyncing(false);
    });

    // 3. Kontragentlar (mijozlar) kolleksiyasini tinglash
    const unsubKontragent = subscribeToCollection('kontragentlar', (data) => {
      setKontragentlar(data);
      setLastSyncTime(new Date());
    });

    // 4. Kassa harakatlari kolleksiyasini tinglash
    const unsubKassa = subscribeToCollection('kassaHarakatlari', (data) => {
      setKassa(data);
      setLastSyncTime(new Date());
    });

    // 5. Tranzaksiyalar kolleksiyasini tinglash
    const unsubTransactions = subscribeToCollection('transactions', (data) => {
      setTransactions(data);
      setLastSyncTime(new Date());
    });

    // Komponent yopilganda yoki qayta yuklanganda tinglovchilarni o'chirish (Memory Leak oldini oladi!)
    return () => {
      unsubOmbor();
      unsubSavdolar();
      unsubKontragent();
      unsubKassa();
      unsubTransactions();
    };
  }, []);

  // Optimistik yangi savdo qo'shish
  const addSavdo = useCallback(async (item: any) => {
    const id = item.id || `savdo_${Date.now()}`;
    const payload = { ...item, id };

    // 1. React holatini va mahalliy keshni darhol yangilash (0 ms)
    setSavdolar(prev => [payload, ...prev]);

    // 2. Orqa fonda Firestore'ga yuborish
    await saveWithOptimisticUpdate('savdolar', id, payload);
  }, []);

  // Optimistik ombor tovarini yangilash
  const updateOmbor = useCallback(async (id: string, item: any) => {
    const payload = { ...item, id };

    setOmbor(prev => prev.map(o => (o.id === id ? { ...o, ...payload } : o)));

    await saveWithOptimisticUpdate('ombor', id, payload);
  }, []);

  const value: StoreContextType = {
    ombor,
    setOmbor,
    savdolar,
    setSavdolar,
    kontragentlar,
    setKontragentlar,
    kassa,
    setKassa,
    transactions,
    setTransactions,
    addSavdo,
    updateOmbor,
    isSyncing,
    lastSyncTime
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
};

/**
 * useStore Hook: Komponentlarda ma'lumotlarni oson va qulay ishlatish uchun
 */
export const useStore = (): StoreContextType => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore StoreProvider ichida ishlatilishi shart!');
  }
  return context;
};
