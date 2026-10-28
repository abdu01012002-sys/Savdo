import { useDb } from '../context/DbContext';
import { useAudit } from '../hooks/useAudit';
import { Kontragent } from '../types';

export const useKontragentlar = () => {
  const { db, setDb } = useDb();
  const { logAudit } = useAudit();

  const addKontragent = (kontragent: Kontragent) => {
    setDb(prev => ({
      ...prev,
      kontragentlar: [kontragent, ...(prev.kontragentlar || [])]
    }));
  };

  const updateKontragent = (id: string, updates: Partial<Kontragent>) => {
    setDb(prev => ({
      ...prev,
      kontragentlar: (prev.kontragentlar || []).map(k => k.id === id ? { ...k, ...updates } : k)
    }));
  };

  const deleteKontragent = (id: string) => {
    const deletedClient = db.kontragentlar?.find(k => k.id === id);
    if (deletedClient) {
      logAudit('Mijozni o\'chirish', `Mijoz: ${deletedClient.ism}`, `Mijoz o'chirib yuborildi. Qoldiq balansi: ${deletedClient.balans || 0} so'm.`, 'high');
    }
    setDb(prev => ({
      ...prev,
      kontragentlar: (prev.kontragentlar || []).filter(k => k.id !== id)
    }));
  };

  return { kontragentlar: db.kontragentlar || [], addKontragent, updateKontragent, deleteKontragent };
};
