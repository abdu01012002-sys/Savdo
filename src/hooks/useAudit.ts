import { useDb } from '../context/DbContext';

export const useAudit = () => {
  const { currentUser, setDb } = useDb();

  const logAudit = (action: string, entity: string, details: string, severity: 'info' | 'warning' | 'high' = 'info') => {
    if (!currentUser) return;
    const newLog = {
      id: Date.now().toString(),
      user: currentUser.ism,
      action,
      entity,
      details,
      severity,
      date: new Date().toISOString()
    };
    setDb(prev => ({
      ...prev,
      auditLogs: [
        ...(prev.auditLogs || []),
        newLog
      ]
    }));
  };

  return { logAudit };
};
