import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, onValue, get, update } from 'firebase/database';

export const PROD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCvsKwwrEZkh0NMcpMfeIlxpsWvwZ6tncY",
  databaseURL: "https://falak-a7b6d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "falak-a7b6d"
};

// Initialize secondary Firebase App specifically for Production Realtime Database
export function getProductionApp() {
  const existingApp = getApps().find(app => app.name === 'falakProductionApp');
  if (existingApp) return existingApp;
  return initializeApp(PROD_FIREBASE_CONFIG, 'falakProductionApp');
}

export function getProductionRtdb() {
  const app = getProductionApp();
  return getDatabase(app);
}

export interface ProductionPartyStage {
  confirmed?: boolean;
  inQty?: number;
  outQty?: number;
  date?: string;
  sender?: string;
  worker?: string;
  status?: string;
  izoh?: string;
  [key: string]: any;
}

export interface ProductionParty {
  id?: string;
  partiyaId?: string;
  partiyaNomi?: string;
  model?: string;
  modelNomi?: string;
  nomi?: string;
  soni?: number;
  jamiSoni?: number;
  sana?: string;
  tannarx?: number;
  stages?: {
    sotuv_ombori?: ProductionPartyStage;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Listen to real-time production parties ready for Sotuv Ombori
 */
export function listenToProductionParties(
  onData: (parties: ProductionParty[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const rtdb = getProductionRtdb();
    const partiesRef = ref(rtdb, 'falak_aylanma_data/parties');

    return onValue(
      partiesRef,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          onData([]);
          return;
        }

        const partyList: ProductionParty[] = [];
        if (typeof val === 'object') {
          Object.keys(val).forEach((key) => {
            const item = val[key];
            if (item && typeof item === 'object') {
              partyList.push({
                ...item,
                id: item.id || key,
                partiyaId: item.partiyaId || key
              });
            }
          });
        }

        // Filter those relevant for Sotuv Ombori
        const readyParties = partyList.filter((party) => {
          const sotuvStage = party.stages?.sotuv_ombori || party.stages?.ombor || party.stages?.sotuv;
          if (!sotuvStage) return false;
          const isConfirmed = sotuvStage?.confirmed === true || sotuvStage?.accepted === true || sotuvStage?.partialSent === true;
          const hasQty = Number(sotuvStage?.inQty || sotuvStage?.outQty || party.soni || party.jamiSoni || 0) > 0;
          return isConfirmed || hasQty;
        });

        onData(readyParties);
      },
      (error) => {
        console.error('Realtime Database listen error:', error);
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    console.error('Failed to attach production listener:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Mark a party as received or update its status in production RTDB (if write access is allowed)
 */
export async function markPartyAsReceivedInProduction(
  partyId: string, 
  info?: { 
    worker?: string; 
    note?: string;
    receivedQty?: number;
    totalExpectedQty?: number;
  }
) {
  try {
    const rtdb = getProductionRtdb();
    const partyRef = ref(rtdb, `falak_aylanma_data/parties/${partyId}/stages/sotuv_ombori`);
    const isFullyCompleted = info?.receivedQty && info?.totalExpectedQty 
      ? info.receivedQty >= info.totalExpectedQty 
      : false;

    await update(partyRef, {
      accepted_at: new Date().toISOString(),
      accepted_by: info?.worker || 'Sotuv omborchi',
      status: isFullyCompleted ? 'qabul_qilindi' : 'qisman_qabul_qilindi',
      isAccepted: isFullyCompleted,
      acceptedQty: info?.receivedQty !== undefined ? info.receivedQty : null,
      lastAcceptedDate: new Date().toISOString().split('T')[0]
    });
    return true;
  } catch (e) {
    console.warn('Could not write status back to production RTDB (read-only or permission):', e);
    return false;
  }
}
