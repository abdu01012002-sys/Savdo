import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  query,
  where,
  Timestamp 
} from 'firebase/firestore';
import { firestoreDb } from '../lib/fbClient';
import { Transaction } from '../types';

import { sanitizeForFirestore } from '../lib/firestoreCollectionSync';

/**
 * Encapsulates access to sharded transactions collections.
 */

const getCollectionName = (sana: string): string => {
  const parts = (sana || '2026-01').split('-');
  const year = parts[0] || '2026';
  const month = (parts[1] || '01').padStart(2, '0');
  return `transactions_${year}_${month}`;
};

export const saveTransaction = async (tx: Transaction): Promise<void> => {
  if (!tx || !tx.id) return;
  const cleanTx = sanitizeForFirestore(tx);
  // Write to primary collection for instant multi-device visibility
  const primaryCol = cleanTx.ombor === 'kotta' ? 'kottaTransactions' : 'transactions';
  await setDoc(doc(firestoreDb, primaryCol, String(cleanTx.id)), cleanTx, { merge: true });

  const colName = getCollectionName(cleanTx.sana);
  const txRef = doc(firestoreDb, colName, String(cleanTx.id));
  await setDoc(txRef, cleanTx, { merge: true });
};

export const getTransactionsByMonth = async (year: number, month: number): Promise<Transaction[]> => {
  const colName = `transactions_${year}_${month.toString().padStart(2, '0')}`;
  const colRef = collection(firestoreDb, colName);
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map(doc => doc.data() as Transaction);
};
