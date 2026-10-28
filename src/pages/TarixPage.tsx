import React, { useState, useMemo } from 'react';
// @ts-ignore
import { FixedSizeList as List } from "react-window";
import { toast } from 'sonner';
import { useDb } from '../context/DbContext';
import { ModelSelect } from '../components/SharedComponents';
import { exportToExcel, exportToPdf, exportToCSV } from '../lib/exportUtils';
import { cn, formatCompact, formatUzs, isCorrectionTx, compareTxLatestFirst } from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';
import { WarehouseName, KassaTuri } from '../types';
import { User, FileSpreadsheet, FileText, Download, Trash2, Edit3, Check, X, Building, Calendar, Clock, DollarSign, Users, AlertCircle, Sparkles, Layers, ArrowRightLeft, RefreshCw, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, SlidersHorizontal, Search, ListFilter, CheckCircle2, Wallet } from 'lucide-react';
import { ClientReassignModal } from '../components/ClientReassignModal';
import { recalculateAllClientBalances } from '../lib/balanceUtils';
import { ClientSearchSelect } from '../components/ClientSearchSelect';

export default function TarixPage() {
  const { db, currentOmbor, currentUser, setDb, hasPermission } = useDb();
  const [activeTab, setActiveTab] = useState<'operatsiyalar' | 'bekor_qilinganlar'>('operatsiyalar');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [tableSearch, setTableSearch] = useState('');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  
  // Transaction Cancel Confirmation State
  const [txToCancel, setTxToCancel] = useState<any | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  
  // Transaction Editing State
  const [editingTx, setEditingTx] = useState<{
    id: string;
    kassaId?: string;
    isKassaPayment?: boolean;
    originalOmbor: WarehouseName;
    ombor: WarehouseName;
    amal: string;
    sana: string;
    vaqt: string;
    model: string;
    olcham: string;
    soni: number;
    summa: number;
    kimdan: string;
    izoh: string;
    xodim: string;
    kassaTuri?: KassaTuri;
  } | null>(null);

  const [clearScope, setClearScope] = useState<{
    kirim: boolean;
    chiqim: boolean;
    otkazma: boolean;
    bekorQilinganlar: boolean;
  }>({
    kirim: true,
    chiqim: true,
    otkazma: true,
    bekorQilinganlar: true
  });
  const canManage = currentUser?.rol === 'admin' || currentUser?.rol === 'omborchi';

  const handleOpenEdit = (tx: any) => {
    const isPay = tx.amal === 'tolov';
    setEditingTx({
      id: tx.id,
      kassaId: tx.kassaId,
      isKassaPayment: Boolean(tx.isKassaPayment || tx.kassaId),
      originalOmbor: (tx.ombor as WarehouseName) || currentOmbor,
      ombor: (tx.ombor as WarehouseName) || currentOmbor,
      amal: tx.amal || 'chiqim',
      sana: tx.sana || new Date().toISOString().split('T')[0],
      vaqt: tx.vaqt || '',
      model: tx.model || (isPay ? "To'lov" : ''),
      olcham: String(tx.olcham || (isPay ? '-' : '41')),
      soni: Number(tx.soni || 0),
      summa: Number(tx.summa || 0),
      kimdan: tx.kimdan || '',
      izoh: tx.izoh || '',
      xodim: tx.xodim || currentUser?.ism || 'Admin',
      kassaTuri: (tx.kassaTuri as KassaTuri) || 'naqd_uzs'
    });
  };

  const handleSaveEditTx = () => {
    if (!editingTx) return;

    if (editingTx.amal === 'tolov') {
      if (!editingTx.kimdan.trim()) {
        toast.error("Mijoz nomi kiritilishi shart!");
        return;
      }
      if (editingTx.summa <= 0) {
        toast.error("To'lov summasi 0 dan katta bo'lishi kerak!");
        return;
      }
      if (!editingTx.sana) {
        toast.error("Sana kiritilishi shart!");
        return;
      }
    } else {
      if (!editingTx.model.trim()) {
        toast.error("Model nomi kiritilishi shart!");
        return;
      }
      if (!editingTx.olcham.trim()) {
        toast.error("O'lcham kiritilishi shart!");
        return;
      }
      if (editingTx.soni <= 0) {
        toast.error("Soni kamida 1 juft bo'lishi kerak!");
        return;
      }
      if (!editingTx.sana) {
        toast.error("Sana kiritilishi shart!");
        return;
      }
    }

    try {
      setDb(prev => {
        const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
        const oldOmbor = editingTx.originalOmbor;
        const newOmbor = editingTx.ombor;

        // Special handling for tolov (payment)
        if (editingTx.amal === 'tolov') {
          const newSumma = Number(editingTx.summa || 0);
          const newKimdan = editingTx.kimdan.trim();
          const targetKassaId = editingTx.kassaId || editingTx.id;
          const newKassaTuri = editingTx.kassaTuri || 'naqd_uzs';

          // 1. Update kassaHarakatlari if exists
          if (Array.isArray(draft.kassaHarakatlari)) {
            const khIdx = draft.kassaHarakatlari.findIndex((h: any) => h.id === targetKassaId || h.id === editingTx.id);
            if (khIdx >= 0) {
              const oldKh = draft.kassaHarakatlari[khIdx];
              const oldSum = Number(oldKh.summa || oldKh.summaUzs || 0);
              const oldKType = (oldKh.kassaTuri as KassaTuri) || 'naqd_uzs';

              if (!draft.kassaBalansi) {
                draft.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
              }

              if (oldKType === newKassaTuri) {
                const diff = newSumma - oldSum;
                draft.kassaBalansi[newKassaTuri] = (Number(draft.kassaBalansi[newKassaTuri]) || 0) + diff;
              } else {
                draft.kassaBalansi[oldKType] = Math.max(0, (Number(draft.kassaBalansi[oldKType]) || 0) - oldSum);
                draft.kassaBalansi[newKassaTuri] = (Number(draft.kassaBalansi[newKassaTuri]) || 0) + newSumma;
              }

              draft.kassaHarakatlari[khIdx] = {
                ...oldKh,
                summa: newSumma,
                summaUzs: newSumma,
                kassaTuri: newKassaTuri,
                sana: editingTx.sana,
                vaqt: editingTx.vaqt || oldKh.vaqt,
                kimgaKimdan: newKimdan,
                izoh: editingTx.izoh.trim(),
                xodim: editingTx.xodim.trim() || oldKh.xodim
              };
            }
          }

          // 2. Update transaction in warehouse array if exists
          const txIdx = draft[oldOmbor]?.transactions?.findIndex((t: any) => t.id === editingTx.id);
          if (txIdx !== -1 && txIdx !== undefined) {
            draft[oldOmbor].transactions[txIdx] = {
              ...draft[oldOmbor].transactions[txIdx],
              summa: newSumma,
              kimdan: newKimdan,
              sana: editingTx.sana,
              vaqt: editingTx.vaqt || draft[oldOmbor].transactions[txIdx].vaqt,
              izoh: editingTx.izoh.trim(),
              xodim: editingTx.xodim.trim() || draft[oldOmbor].transactions[txIdx].xodim,
              kassaTuri: newKassaTuri
            };
          }

          // 3. Recalculate client balances cleanly
          const updatedDb = recalculateAllClientBalances(draft);
          draft.kontragentlar = updatedDb.kontragentlar;

          // 4. Audit log
          if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
          draft.auditLogs.unshift(
            createAuditLog(
              currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
              "To'lov tahrirlandi",
              'Tarix',
              `To'lov tahrirlandi: ${newKimdan}, Summa: ${newSumma.toLocaleString()} UZS (${newKassaTuri})`,
              'info'
            )
          );

          return draft;
        }

        // Find old product transaction
        const txIndex = draft[oldOmbor]?.transactions?.findIndex((t: any) => t.id === editingTx.id);
        if (txIndex === -1 || txIndex === undefined) {
          toast.error("Tahrirlanayotgan operatsiya topilmadi!");
          return prev;
        }

        const oldTx = draft[oldOmbor].transactions[txIndex];
        const oldSoni = Number(oldTx.soni || 0);
        const newSoni = Number(editingTx.soni || 0);
        const oldSumma = Number(oldTx.summa || 0);
        const newSumma = Number(editingTx.summa || 0);
        const oldModel = oldTx.model;
        const newModel = editingTx.model.trim();
        const oldOlcham = String(oldTx.olcham);
        const newOlcham = String(editingTx.olcham).trim();
        const oldKimdan = (oldTx.kimdan || '').trim();
        const newKimdan = editingTx.kimdan.trim();

        // 1. Stock Adjustment (for kirim / chiqim)
        if (oldTx.amal === 'kirim') {
          // Revert old kirim on oldOmbor
          if (!draft[oldOmbor].stock) draft[oldOmbor].stock = {};
          if (!draft[oldOmbor].stock[oldModel]) draft[oldOmbor].stock[oldModel] = {};
          draft[oldOmbor].stock[oldModel][oldOlcham] = (draft[oldOmbor].stock[oldModel][oldOlcham] || 0) - oldSoni;
          
          // Apply new kirim on newOmbor
          if (!draft[newOmbor].stock) draft[newOmbor].stock = {};
          if (!draft[newOmbor].stock[newModel]) draft[newOmbor].stock[newModel] = {};
          draft[newOmbor].stock[newModel][newOlcham] = (draft[newOmbor].stock[newModel][newOlcham] || 0) + newSoni;
        } else if (oldTx.amal === 'chiqim') {
          // Revert old chiqim on oldOmbor
          if (!draft[oldOmbor].stock) draft[oldOmbor].stock = {};
          if (!draft[oldOmbor].stock[oldModel]) draft[oldOmbor].stock[oldModel] = {};
          draft[oldOmbor].stock[oldModel][oldOlcham] = (draft[oldOmbor].stock[oldModel][oldOlcham] || 0) + oldSoni;
          
          // Apply new chiqim on newOmbor
          if (!draft[newOmbor].stock) draft[newOmbor].stock = {};
          if (!draft[newOmbor].stock[newModel]) draft[newOmbor].stock[newModel] = {};
          draft[newOmbor].stock[newModel][newOlcham] = (draft[newOmbor].stock[newModel][newOlcham] || 0) - newSoni;
        }

        // 2. Client Balance & Volume Adjustment (for chiqim / tolov)
        if (!Array.isArray(draft.kontragentlar)) draft.kontragentlar = [];
        
        if (oldTx.amal === 'chiqim') {
          if (oldKimdan !== newKimdan) {
            // Revert old client
            if (oldKimdan) {
              const oldClientIdx = draft.kontragentlar.findIndex((k: any) => k.ism === oldKimdan);
              if (oldClientIdx >= 0) {
                draft.kontragentlar[oldClientIdx].jami = Math.max(0, (draft.kontragentlar[oldClientIdx].jami || 0) - oldSoni);
                draft.kontragentlar[oldClientIdx].balans = (draft.kontragentlar[oldClientIdx].balans || 0) - oldSumma;
              }
            }
            // Apply to new client
            if (newKimdan) {
              const newClientIdx = draft.kontragentlar.findIndex((k: any) => k.ism === newKimdan);
              if (newClientIdx >= 0) {
                draft.kontragentlar[newClientIdx].jami = (draft.kontragentlar[newClientIdx].jami || 0) + newSoni;
                draft.kontragentlar[newClientIdx].balans = (draft.kontragentlar[newClientIdx].balans || 0) + newSumma;
                draft.kontragentlar[newClientIdx].oxirgiXarid = editingTx.sana;
              } else {
                // Create new client if does not exist
                draft.kontragentlar.push({
                  id: `client_${Date.now()}`,
                  ism: newKimdan,
                  tel: '',
                  manzil: '',
                  izoh: '',
                  jami: newSoni,
                  balans: newSumma,
                  qoshilganSana: editingTx.sana,
                  birinchiXarid: editingTx.sana,
                  oxirgiXarid: editingTx.sana,
                  xaridlarSoni: 1,
                  kategoriya: 'Ulgurji'
                });
              }
            }
          } else if (newKimdan) {
            // Same client, adjust differences
            const clientIdx = draft.kontragentlar.findIndex((k: any) => k.ism === newKimdan);
            if (clientIdx >= 0) {
              draft.kontragentlar[clientIdx].jami = Math.max(0, (draft.kontragentlar[clientIdx].jami || 0) + (newSoni - oldSoni));
              draft.kontragentlar[clientIdx].balans = (draft.kontragentlar[clientIdx].balans || 0) + (newSumma - oldSumma);
            }
          }
        } else if (oldTx.amal === 'tolov') {
          if (oldKimdan !== newKimdan) {
            if (oldKimdan) {
              const oldIdx = draft.kontragentlar.findIndex((k: any) => k.ism === oldKimdan);
              if (oldIdx >= 0) {
                draft.kontragentlar[oldIdx].balans = (draft.kontragentlar[oldIdx].balans || 0) + oldSumma;
              }
            }
            if (newKimdan) {
              const newIdx = draft.kontragentlar.findIndex((k: any) => k.ism === newKimdan);
              if (newIdx >= 0) {
                draft.kontragentlar[newIdx].balans = (draft.kontragentlar[newIdx].balans || 0) - newSumma;
              }
            }
          } else if (newKimdan) {
            const clientIdx = draft.kontragentlar.findIndex((k: any) => k.ism === newKimdan);
            if (clientIdx >= 0) {
              draft.kontragentlar[clientIdx].balans = (draft.kontragentlar[clientIdx].balans || 0) - (newSumma - oldSumma);
            }
          }
        }

        // 3. Update Transaction Object
        const updatedTx = {
          ...oldTx,
          model: newModel,
          olcham: newOlcham,
          soni: newSoni,
          summa: newSumma,
          sana: editingTx.sana,
          vaqt: editingTx.vaqt || oldTx.vaqt,
          kimdan: newKimdan,
          izoh: editingTx.izoh.trim(),
          xodim: editingTx.xodim.trim() || oldTx.xodim
        };

        if (oldOmbor === newOmbor) {
          draft[oldOmbor].transactions[txIndex] = updatedTx;
        } else {
          draft[oldOmbor].transactions.splice(txIndex, 1);
          if (!Array.isArray(draft[newOmbor].transactions)) draft[newOmbor].transactions = [];
          draft[newOmbor].transactions.push(updatedTx);
        }

        // 4. Audit Log
        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            'Operatsiya tahrirlandi',
            'Tarix',
            `Operatsiya tahrirlandi: ${oldModel} ${oldOlcham}° (${oldKimdan || '—'} ➔ ${newKimdan || '—'}, ${oldSoni} ➔ ${newSoni} ta)`,
            'warning'
          )
        );

        return draft;
      });

      toast.success("Operatsiya muvaffaqiyatli tahrirlandi!");
      setEditingTx(null);
    } catch (err: any) {
      toast.error("Tahrirlashda xatolik yuz berdi: " + (err?.message || err));
    }
  };

  const handleClearHistory = () => {
    if (currentUser?.rol !== 'admin') {
      toast.error("Faqat admin operatsiyalar tarixini tozalay oladi!");
      return;
    }

    try {
      setDb(prev => {
        const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;
        
        ['tepa', 'kotta'].forEach((omborKey) => {
          if (draft[omborKey as 'tepa' | 'kotta']?.transactions) {
            draft[omborKey as 'tepa' | 'kotta'].transactions = draft[omborKey as 'tepa' | 'kotta'].transactions.filter((t: any) => {
              if (clearScope.kirim && t.amal === 'kirim') return false;
              if (clearScope.chiqim && (t.amal === 'chiqim' || t.amal === 'tolov')) return false;
              if (clearScope.otkazma && t.amal?.startsWith('otkazma')) return false;
              return true;
            });
          }
        });

        if (clearScope.otkazma) {
          draft.otkazmalar = [];
        }

        if (clearScope.bekorQilinganlar) {
          draft.bekorQilinganOtkazmalar = [];
          draft.bekorQilinganKirimlar = [];
          draft.bekorQilinganChiqimlar = [];
        }

        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            'Tarix tozalandi',
            'Tarix',
            `Tanlangan operatsiyalar tarixi tozalandi (Kirim: ${clearScope.kirim ? 'Ha' : "Yo'q"}, Chiqim: ${clearScope.chiqim ? 'Ha' : "Yo'q"}, O'tkazma: ${clearScope.otkazma ? 'Ha' : "Yo'q"})`,
            'high'
          )
        );

        return draft;
      });

      toast.success("Tanlangan operatsiyalar tarixi muvaffaqiyatli tozalandi!");
      setIsClearModalOpen(false);
    } catch (e: any) {
      toast.error("Tozalashda xatolik yuz berdi: " + (e?.message || e));
    }
  };

  const handleCancelTx = (tx: any) => {
    setTxToCancel(tx);
  };

  const executeCancelTx = (tx: any) => {
    if (!tx) return;
    setIsCanceling(true);

    try {
      setDb(prev => {
        const draft = JSON.parse(JSON.stringify(prev)) as typeof prev;

        // 1. Identify which warehouse holds this transaction
        let targetOmbor: WarehouseName = (tx.ombor as WarehouseName);
        if (!targetOmbor || !draft[targetOmbor]?.transactions?.some((t: any) => t.id === tx.id)) {
          if (draft.tepa?.transactions?.some((t: any) => t.id === tx.id)) {
            targetOmbor = 'tepa';
          } else if (draft.kotta?.transactions?.some((t: any) => t.id === tx.id)) {
            targetOmbor = 'kotta';
          } else if (draft.sort2?.transactions?.some((t: any) => t.id === tx.id)) {
            targetOmbor = 'sort2';
          } else {
            targetOmbor = currentOmbor;
          }
        }

        const txIndex = draft[targetOmbor]?.transactions?.findIndex((t: any) => t.id === tx.id);
        if (txIndex === undefined || txIndex === -1) {
          // Check other warehouses just in case
          const otherWarehouses: WarehouseName[] = (['tepa', 'kotta', 'sort2'] as WarehouseName[]).filter(w => w !== targetOmbor);
          for (const ow of otherWarehouses) {
            const otherIdx = draft[ow]?.transactions?.findIndex((t: any) => t.id === tx.id);
            if (otherIdx !== undefined && otherIdx !== -1) {
              targetOmbor = ow;
              break;
            }
          }
        }

        const isPayment = tx.amal === 'tolov' || tx.isKassaPayment || Boolean(tx.kassaId);

        // If it's a payment, it might only exist in kassaHarakatlari or also in transactions
        if (isPayment) {
          // Remove from transactions array if present
          ['tepa', 'kotta', 'sort2'].forEach((w) => {
            const wName = w as WarehouseName;
            if (draft[wName]?.transactions) {
              draft[wName].transactions = draft[wName].transactions.filter((t: any) => t.id !== tx.id && t.kassaId !== (tx.kassaId || tx.id));
            }
          });

          // Remove from kassaHarakatlari
          const kassaIdToDel = tx.kassaId || tx.id;
          if (Array.isArray(draft.kassaHarakatlari)) {
            const khIdx = draft.kassaHarakatlari.findIndex((h: any) => h.id === kassaIdToDel || h.id === tx.id);
            if (khIdx >= 0) {
              const kh = draft.kassaHarakatlari[khIdx];
              const kassaTuri = (kh.kassaTuri as KassaTuri) || 'naqd_uzs';
              if (draft.kassaBalansi && draft.kassaBalansi[kassaTuri] !== undefined) {
                draft.kassaBalansi[kassaTuri] = Math.max(0, (Number(draft.kassaBalansi[kassaTuri]) || 0) - (Number(kh.summa) || 0));
              }
              draft.kassaHarakatlari.splice(khIdx, 1);
            }
          }

          // Recalculate client balances cleanly
          const updatedDb = recalculateAllClientBalances(draft);
          draft.kontragentlar = updatedDb.kontragentlar;

          // Audit log
          if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
          draft.auditLogs.unshift(
            createAuditLog(
              currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
              "To'lov bekor qilindi",
              'Tarix',
              `To'lov bekor qilindi (o'chirildi): ${tx.kimdan || '—'}, Summa: ${Number(tx.summa || 0).toLocaleString()} UZS`,
              'warning'
            )
          );

          return draft;
        }

        const finalTxIndex = draft[targetOmbor]?.transactions?.findIndex((t: any) => t.id === tx.id);
        if (finalTxIndex === undefined || finalTxIndex === -1) {
          toast.error("Amaliyot topilmadi yoki allaqachon o'chirilgan.");
          return prev;
        }

        const txObj = draft[targetOmbor].transactions[finalTxIndex];
        const model = txObj.model || tx.model;
        const olcham = txObj.olcham || tx.olcham;
        const soni = Number(txObj.soni || tx.soni || 0);
        const summa = Number(txObj.summa || tx.summa || 0);
        const kimdan = txObj.kimdan || tx.kimdan;

        // Ensure stock object exists
        if (!draft[targetOmbor].stock) draft[targetOmbor].stock = {};
        if (model && !draft[targetOmbor].stock[model]) draft[targetOmbor].stock[model] = {};

        const isTuzatish = txObj.amal === 'tuzatish' || isCorrectionTx(txObj);

        if (isTuzatish) {
          // Revert correction
          if (model && olcham) {
            draft[targetOmbor].stock[model][olcham] = (draft[targetOmbor].stock[model][olcham] || 0) - soni;
          }
        } else if (txObj.amal === 'kirim') {
          // Revert kirim -> reduce stock
          if (model && olcham) {
            draft[targetOmbor].stock[model][olcham] = (draft[targetOmbor].stock[model][olcham] || 0) - soni;
          }
          if (!Array.isArray(draft.bekorQilinganKirimlar)) draft.bekorQilinganKirimlar = [];
          draft.bekorQilinganKirimlar.push({
            ...txObj,
            ombor: targetOmbor,
            bekorQildi: currentUser?.ism || 'Admin',
            bekorQilinganVaqt: new Date().toISOString()
          } as any);
        } else if (txObj.amal === 'chiqim') {
          // Revert chiqim -> return stock back
          if (model && olcham) {
            draft[targetOmbor].stock[model][olcham] = (draft[targetOmbor].stock[model][olcham] || 0) + soni;
          }
          if (!Array.isArray(draft.bekorQilinganChiqimlar)) draft.bekorQilinganChiqimlar = [];
          draft.bekorQilinganChiqimlar.push({
            ...txObj,
            ombor: targetOmbor,
            bekorQildi: currentUser?.ism || 'Admin',
            bekorQilinganVaqt: new Date().toISOString()
          } as any);

          // Revert client purchase count and balance
          if (kimdan && Array.isArray(draft.kontragentlar)) {
            const mijozIdx = draft.kontragentlar.findIndex((k: any) => k.ism === kimdan || k.ism === txObj.izoh);
            if (mijozIdx >= 0) {
              draft.kontragentlar[mijozIdx].jami = Math.max(0, (draft.kontragentlar[mijozIdx].jami || 0) - soni);
              draft.kontragentlar[mijozIdx].balans = (draft.kontragentlar[mijozIdx].balans || 0) - summa;
            }
          }

          // If linked to cash register / kassa income, remove or balance
          if (txObj.kassaId && Array.isArray(draft.kassaHarakatlari)) {
            const khIdx = draft.kassaHarakatlari.findIndex((h: any) => h.id === txObj.kassaId);
            if (khIdx >= 0) {
              const kh = draft.kassaHarakatlari[khIdx];
              const kassaTuri = kh.kassaTuri || 'naqd_uzs';
              if (draft.kassaBalansi && draft.kassaBalansi[kassaTuri] !== undefined) {
                draft.kassaBalansi[kassaTuri] = Math.max(0, (draft.kassaBalansi[kassaTuri] || 0) - (kh.summa || 0));
              }
              draft.kassaHarakatlari.splice(khIdx, 1);
            }
          }
        } else if (txObj.amal === 'tolov') {
          // Revert payment -> restore client debt
          if (kimdan && Array.isArray(draft.kontragentlar)) {
            const mijozIdx = draft.kontragentlar.findIndex((k: any) => k.ism === kimdan);
            if (mijozIdx >= 0) {
              draft.kontragentlar[mijozIdx].balans = (draft.kontragentlar[mijozIdx].balans || 0) + summa;
            }
          }

          // Revert kassa incoming payment
          if (txObj.kassaId && Array.isArray(draft.kassaHarakatlari)) {
            const khIdx = draft.kassaHarakatlari.findIndex((h: any) => h.id === txObj.kassaId);
            if (khIdx >= 0) {
              const kh = draft.kassaHarakatlari[khIdx];
              const kassaTuri = kh.kassaTuri || 'naqd_uzs';
              if (draft.kassaBalansi && draft.kassaBalansi[kassaTuri] !== undefined) {
                draft.kassaBalansi[kassaTuri] = Math.max(0, (draft.kassaBalansi[kassaTuri] || 0) - (kh.summa || 0));
              }
              draft.kassaHarakatlari.splice(khIdx, 1);
            }
          }
        } else if (txObj.amal === 'otkazma-out' || txObj.amal === 'otkazma-in') {
          if (txObj.amal === 'otkazma-out' && model && olcham) {
            draft[targetOmbor].stock[model][olcham] = (draft[targetOmbor].stock[model][olcham] || 0) + soni;
          } else if (txObj.amal === 'otkazma-in' && model && olcham) {
            draft[targetOmbor].stock[model][olcham] = (draft[targetOmbor].stock[model][olcham] || 0) - soni;
          }
          if (!Array.isArray(draft.bekorQilinganOtkazmalar)) draft.bekorQilinganOtkazmalar = [];
          draft.bekorQilinganOtkazmalar.push({
            ...txObj,
            ombor: targetOmbor,
            bekorQildi: currentUser?.ism || 'Admin',
            bekorQilinganVaqt: new Date().toISOString()
          } as any);
        }

        // Remove transaction from array
        draft[targetOmbor].transactions.splice(finalTxIndex, 1);

        // Audit Log
        if (!Array.isArray(draft.auditLogs)) draft.auditLogs = [];
        draft.auditLogs.unshift(
          createAuditLog(
            currentUser || { id: 'admin', ism: 'Admin', rol: 'admin', pin: '0000' },
            'Operatsiya bekor qilindi',
            'Tarix',
            `${txObj.amal} bekor qilindi (${targetOmbor === 'tepa' ? 'Tepa' : 'Kotta'}): ${model} ${olcham}° (${soni} juft, ${kimdan || '—'})`,
            'high'
          )
        );

        // Recalculate client balances cleanly to prevent any drift
        return recalculateAllClientBalances(draft);
      });

      toast.success("Operatsiya muvaffaqiyatli bekor qilindi!");
      setTxToCancel(null);
    } catch (error: any) {
      toast.error("Xatolik yuz berdi: " + (error?.message || error));
    } finally {
      setIsCanceling(false);
    }
  };
  
  const [amal, setAmal] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [model, setModel] = useState('');
  const [xodim, setXodim] = useState('');
  const [omborScope, setOmborScope] = useState<'all' | 'tepa' | 'kotta'>('all');
  const [visibleCount, setVisibleCount] = useState(100);
  const [canceledVisibleCount, setCanceledVisibleCount] = useState(50);

  const allModels = useMemo(() => {
    const set = new Set([
      ...Object.keys(db.tepa?.stock || {}),
      ...Object.keys(db.kotta?.stock || {}),
      ...(db.tepa?.transactions || []).map(t => t.model),
      ...(db.kotta?.transactions || []).map(t => t.model),
    ]);
    return Array.from(set).filter(Boolean);
  }, [db]);

  const rawTransactions = useMemo(() => {
    let list: any[] = [];
    if (omborScope === 'tepa') {
      list = (db.tepa?.transactions || []).map(t => ({ ...t, ombor: 'tepa' }));
    } else if (omborScope === 'kotta') {
      list = (db.kotta?.transactions || []).map(t => ({ ...t, ombor: 'kotta' }));
    } else {
      const tList = (db.tepa?.transactions || []).map(t => ({ ...t, ombor: 'tepa' }));
      const kList = (db.kotta?.transactions || []).map(t => ({ ...t, ombor: 'kotta' }));
      const sList = (db.sort2?.transactions || []).map(t => ({ ...t, ombor: 'sort2' }));
      list = [...tList, ...kList, ...sList];
    }

    // Now include payments from kassaHarakatlari (avoiding duplicates if already in transactions)
    const existingTxIds = new Set(list.map(t => t.id));
    const existingKassaIds = new Set(list.map(t => t.kassaId).filter(Boolean));

    const kassaPayments = (db.kassaHarakatlari || [])
      .filter(k => k.tur === 'kirim' && (k.kategoriya === 'savdo_tushumi' || k.kategoriya === 'qarz_tolovi' || !k.kategoriya))
      .filter(k => !existingTxIds.has(k.id) && !existingKassaIds.has(k.id))
      .map(k => {
        const kassaLabel = k.kassaTuri === 'naqd_uzs' ? 'Naqd' : k.kassaTuri === 'naqd_usd' ? 'USD' : k.kassaTuri === 'karta_uzs' ? 'Karta' : 'Bank';
        return {
          id: k.id,
          kassaId: k.id,
          sana: k.sana || '',
          vaqt: k.vaqt || '',
          amal: 'tolov' as const,
          model: `To'lov (${kassaLabel})`,
          olcham: k.valyuta === 'USD' ? 'USD' : 'UZS',
          soni: 0,
          summa: Number(k.summaUzs || k.summa || 0),
          kimdan: k.kimgaKimdan || 'Mijoz',
          izoh: k.izoh || (k.boglanishId ? `Faktura #${k.boglanishId.slice(-6)} to'lovi` : "Kassaga to'lov"),
          xodim: k.xodim || 'Admin',
          ombor: currentOmbor,
          groupId: k.boglanishId || k.id,
          kassaTuri: (k.kassaTuri as KassaTuri) || 'naqd_uzs',
          isKassaPayment: true
        };
      });

    return [...list, ...kassaPayments];
  }, [db, omborScope, currentOmbor]);

  // Deferred values for input responsiveness
  const deferredTableSearch = React.useDeferredValue(tableSearch);
  const deferredModel = React.useDeferredValue(model);
  const deferredXodim = React.useDeferredValue(xodim);

  // Quick Date Helpers
  const setQuickDate = (type: 'all' | 'today' | '2days' | '7days' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (type === 'all') {
      setFromDate('');
      setToDate('');
    } else if (type === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === '2days') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (type === 'month') {
      const d = new Date();
      d.setDate(1);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    }
  };

  const { 
    rows, 
    kirimCount, 
    kirimTotal, 
    kirimSum, 
    chiqimCount, 
    chiqimTotal, 
    chiqimSum, 
    otkazmaCount, 
    otkazmaTotal,
    kirimTxCount,
    chiqimTxCount,
    otkazmaTxCount,
    tolovSum,
    tolovTxCount
  } = useMemo(() => {
    const q = deferredTableSearch.toLowerCase().trim();
    const modelQ = deferredModel.toLowerCase().trim();
    const xodimQ = deferredXodim.toLowerCase().trim();

    const filtered: any[] = [];
    const kirimGroups = new Set<string>();
    const chiqimGroups = new Set<string>();
    const otkazmaGroups = new Set<string>();

    let kTotal = 0;
    let kSum = 0;
    let kTxCount = 0;
    let chTotal = 0;
    let chSum = 0;
    let chTxCount = 0;
    let otkTotal = 0;
    let otkTxCount = 0;
    let tolSum = 0;
    let tolTxCount = 0;

    for (let i = rawTransactions.length - 1; i >= 0; i--) {
      const t = rawTransactions[i];
      const isCorr = isCorrectionTx(t);

      // Amal filter
      if (amal) {
        if (amal === 'otkazma' && !t.amal?.startsWith('otkazma')) continue;
        if (amal === 'tuzatish' && t.amal !== 'tuzatish' && !isCorr) continue;
        if (amal !== 'otkazma' && amal !== 'tuzatish' && (t.amal !== amal || isCorr)) continue;
      }

      // Date filter
      if (fromDate && t.sana < fromDate) continue;
      if (toDate && t.sana > toDate) continue;

      // Model filter
      if (modelQ && !String(t.model || '').toLowerCase().includes(modelQ)) continue;

      // Xodim filter
      if (xodimQ && !String(t.xodim || '').toLowerCase().includes(xodimQ)) continue;

      // Search query filter
      if (q) {
        const matches = 
          String(t.model || '').toLowerCase().includes(q) ||
          String(t.kimdan || '').toLowerCase().includes(q) ||
          String(t.izoh || '').toLowerCase().includes(q) ||
          String(t.xodim || '').toLowerCase().includes(q) ||
          String(t.sana || '').includes(q) ||
          String(t.olcham ?? '').toLowerCase().includes(q) ||
          String(t.soni ?? '').includes(q) ||
          String(t.summa ?? '').includes(q);
        if (!matches) continue;
      }

      filtered.push(t);

      // Aggregate stats
      const soni = Number(t.soni || 0);
      const summa = Number(t.summa || 0);
      const gId = t.groupId || t.vaqt || t.id;

      if (t.amal === 'kirim' && !isCorr) {
        kirimGroups.add(gId);
        kTotal += soni;
        kSum += summa;
        kTxCount++;
      } else if (t.amal === 'chiqim' && !isCorr) {
        chiqimGroups.add(gId);
        chTotal += soni;
        chSum += summa;
        chTxCount++;
      } else if (t.amal?.startsWith('otkazma')) {
        otkazmaGroups.add(gId);
        otkTotal += soni;
        otkTxCount++;
      } else if (t.amal === 'tolov') {
        tolSum += summa;
        tolTxCount++;
      }
    }

    return {
      rows: filtered.sort(compareTxLatestFirst),
      kirimCount: kirimGroups.size,
      kirimTotal: kTotal,
      kirimSum: kSum,
      kirimTxCount: kTxCount,
      chiqimCount: chiqimGroups.size,
      chiqimTotal: chTotal,
      chiqimSum: chSum,
      chiqimTxCount: chTxCount,
      otkazmaCount: otkazmaGroups.size,
      otkazmaTotal: otkTotal,
      otkazmaTxCount: otkTxCount,
      tolovSum: tolSum,
      tolovTxCount: tolTxCount
    };
  }, [rawTransactions, amal, fromDate, toDate, deferredModel, deferredXodim, deferredTableSearch]);

  // Bekor qilingan barcha amallarni bitta joyga yig'ish va vaqti bo'yicha saralash
  const canceledRows = useMemo(() => {
    const o = (db.bekorQilinganOtkazmalar || []).map(t => ({ ...t, tip: "O'tkazma" }));
    const k = (db.bekorQilinganKirimlar || []).map(t => ({ ...t, tip: "Kirim" }));
    const ch = (db.bekorQilinganChiqimlar || []).map(t => ({ ...t, tip: "Chiqim" }));
    return [...o, ...k, ...ch].sort((a, b) => (b.vaqt || '').localeCompare(a.vaqt || ''));
  }, [db.bekorQilinganOtkazmalar, db.bekorQilinganKirimlar, db.bekorQilinganChiqimlar]);

  const clearFilter = () => {
    setAmal('');
    setFromDate('');
    setToDate('');
    setModel('');
    setXodim('');
  };

  const getExportData = () => {
    if (activeTab === 'bekor_qilinganlar') {
      return {
        title: "Bekor qilingan Operatsiyalar",
        headers: ['#', 'Amal Turi', 'Vaqt', 'Model', "O'lcham", 'Soni', "Qaytdi (Agar O'tkazma bo'lsa)"],
        rows: canceledRows.map((t, i) => [i + 1, t.tip, t.vaqt, t.model, t.olcham, t.soni, (t as any).qaytibKelganSoni || '-'])
      };
    }

    return {
      title: "Operatsiyalar Tarixi",
      headers: ['#', 'Sana/Vaqt', 'Amal', 'Model', "O'lcham", 'Soni', 'Summa', 'Mijoz/Manba', 'Izoh', 'Xodim'],
      rows: rows.map((t, i) => [
        i + 1, 
        `${t.sana} ${t.vaqt && t.vaqt.length > 5 ? t.vaqt.slice(-5) : t.vaqt}`, 
        t.amal, 
        t.model, 
        t.olcham, 
        t.soni, 
        t.summa || 0,
        t.kimdan || '', 
        t.izoh || '', 
        t.xodim || ''
      ])
    };
  };

  const exportCsv = () => {
    const { title, headers, rows: dataRows } = getExportData();
    exportToCSV([headers, ...dataRows], `${currentOmbor}_${activeTab}`);
  };

  const exportExcel = () => {
    const { title, headers, rows: dataRows } = getExportData();
    exportToExcel([headers, ...dataRows], `${currentOmbor}_${activeTab}`, title);
  };

  const exportPdf = () => {
    const { title, headers, rows: dataRows } = getExportData();
    exportToPdf(title, headers, dataRows, `${currentOmbor}_${activeTab}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Filter Card */}
      <div className="soft-card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] font-bold text-[var(--text)]">Tarix va Filtrlar</h2>
              <span className="bg-[#8b5cf6]/10 text-[#8b5cf6] text-[11px] px-2.5 py-1.5 rounded-lg font-bold tracking-wider">{rows.length} amaliyot</span>
            </div>

            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileFiltersOpen(prev => !prev)}
              className="sm:hidden px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs font-bold flex items-center gap-1.5 text-[var(--text)] shadow-xs"
            >
              <SlidersHorizontal size={14} className="text-[#8b5cf6]" />
              <span>{isMobileFiltersOpen ? "Yopish" : "Filtrlar"}</span>
            </button>
          </div>

          {/* Ombor Selector Buttons */}
          <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] gap-1 overflow-x-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setOmborScope('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                omborScope === 'all'
                  ? 'bg-[#8b5cf6] text-white shadow-xs'
                  : 'text-[var(--text3)] hover:text-[var(--text)]'
              }`}
            >
              Ikkala Ombor (Barchasi)
            </button>
            <button
              type="button"
              onClick={() => setOmborScope('tepa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                omborScope === 'tepa'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text3)] hover:text-[var(--text)]'
              }`}
            >
              Tepa Ombori ({(db.tepa?.transactions || []).length})
            </button>
            <button
              type="button"
              onClick={() => setOmborScope('kotta')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                omborScope === 'kotta'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-[var(--text3)] hover:text-[var(--text)]'
              }`}
            >
              Kotta Ombori ({(db.kotta?.transactions || []).length})
            </button>
          </div>
        </div>

        {/* Collapsible Filter Body on Mobile, always visible on Desktop */}
        <div className={cn("space-y-4", !isMobileFiltersOpen && "hidden sm:block")}>
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs font-bold text-[var(--text3)]">Vaqt:</span>
            <button
              type="button"
              onClick={() => setQuickDate('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                !fromDate && !toDate
                  ? 'bg-purple-500/15 text-[#8b5cf6] border-[#8b5cf6]/30'
                  : 'bg-[var(--bg)] text-[var(--text3)] border-[var(--border)] hover:text-[var(--text)]'
              }`}
            >
              Barcha vaqt
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('today')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Bugun
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('2days')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Oxirgi 2 kun
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('7days')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Oxirgi 7 kun
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('month')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Shu oy
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
            <select 
              value={amal}
              onChange={e => setAmal(e.target.value)}
              className="w-full p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all cursor-pointer"
            >
              <option value="">Barcha amallar</option>
              <option value="kirim">Kirim</option>
              <option value="chiqim">Chiqim</option>
              <option value="tuzatish">Tuzatish (Audit)</option>
              <option value="tolov">To'lovlar</option>
              <option value="otkazma">O'tkazmalar (Barchasi)</option>
              <option value="otkazma-out">O'tkazma (Chiqdi)</option>
              <option value="otkazma-in">O'tkazma (Keldi)</option>
            </select>
            
            <div className="w-full flex items-center gap-2">
              <input 
                type="date" 
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all cursor-pointer" 
              />
              <span className="text-[var(--text3)] opacity-60 font-bold">—</span>
              <input 
                type="date" 
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all cursor-pointer" 
              />
            </div>
            
            <div className="w-full">
              <ModelSelect value={model} onChange={setModel} options={allModels} placeholder="Model nomi..." />
            </div>

            <div className="w-full relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] w-4 h-4" />
              <input 
                type="text" 
                value={xodim}
                onChange={e => setXodim(e.target.value)}
                placeholder="Xodim bo'yicha..."
                className="w-full pl-10 pr-3.5 py-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all"
              />
            </div>
            
            <div className="flex gap-2 w-full lg:w-auto">
              <button onClick={clearFilter} className="flex-1 lg:flex-none px-5 py-3.5 rounded-xl text-[13px] font-semibold bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:border-[var(--text)] hover:text-[var(--text)] transition-colors shadow-sm cursor-pointer">
                Tozalash
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Client Reassign & Recalculate Tools */}
            <button
              type="button"
              onClick={() => setIsReassignModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-xs"
              title="Sotuvlarni mijozlarga taqsimlash va balanslarni to'g'rilash markazi"
            >
              <Users size={15} />
              <span>Mijozlarga Taqsimlash & Tiklash</span>
            </button>

            <button
              type="button"
              onClick={() => {
                try {
                  const updated = recalculateAllClientBalances(db);
                  setDb(updated);
                  toast.success("Barcha mijozlar balansi va xaridlari qayta hisoblab to'g'rilandi!");
                } catch (e: any) {
                  toast.error("Xatolik: " + e.message);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer shadow-xs"
              title="Barcha mijozlar hisob-kitobini avtomatik qayta hisoblash"
            >
              <RefreshCw size={14} />
              <span>Balanslarni Qayta Hisoblash</span>
            </button>

            {currentUser?.rol === 'admin' && (
              <button
                onClick={() => setIsClearModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer shadow-xs"
              >
                <Trash2 size={15} />
                <span>Tarixni tozalash</span>
              </button>
            )}
          </div>

          {hasPermission('export') && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors shadow-sm">
                <FileText size={16} /> PDF
              </button>
              <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors shadow-sm">
                <Download size={16} /> CSV
              </button>
              <button onClick={exportExcel} className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 hover:border-emerald-500 transition-colors shadow-sm">
                <FileSpreadsheet size={16} /> EXCEL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="soft-card p-6 hover:shadow-lg transition-shadow">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-[var(--text3)] mb-2 font-bold">Kirimlar</div>
          <div className="text-2xl sm:text-3xl font-black leading-none text-emerald-500 tabular-nums">{kirimCount}</div>
          <div className="text-xs text-[var(--text3)] mt-2 font-medium flex flex-col gap-0.5">
            <span>{kirimTotal.toLocaleString()} juft</span>
            {kirimSum > 0 && <span className="text-emerald-500 font-bold"><span title={`${formatUzs(kirimSum)} UZS`}>{formatCompact(kirimSum)} UZS</span></span>}
          </div>
        </div>
        <div className="soft-card p-6 hover:shadow-lg transition-shadow">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-[var(--text3)] mb-2 font-bold">Chiqimlar</div>
          <div className="text-2xl sm:text-3xl font-black leading-none text-rose-500 tabular-nums">{chiqimCount}</div>
          <div className="text-xs text-[var(--text3)] mt-2 font-medium flex flex-col gap-0.5">
            <span>{chiqimTotal.toLocaleString()} juft</span>
            {chiqimSum > 0 && <span className="text-rose-500 font-bold"><span title={`${formatUzs(chiqimSum)} UZS`}>{formatCompact(chiqimSum)} UZS</span></span>}
          </div>
        </div>
        <div className="soft-card p-6 hover:shadow-lg transition-shadow">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-[var(--text3)] mb-2 font-bold">O'tkazmalar</div>
          <div className="text-2xl sm:text-3xl font-black leading-none text-blue-500 tabular-nums">{otkazmaCount}</div>
          <div className="text-xs text-[var(--text3)] mt-2 font-medium">
            <span>{otkazmaTotal.toLocaleString()} juft</span>
          </div>
        </div>
        <div className="soft-card p-6 hover:shadow-lg transition-shadow">
          <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-[var(--text3)] mb-2 font-bold">Jami Amaliyotlar</div>
          <div className="text-2xl sm:text-3xl font-black leading-none text-[#8b5cf6] tabular-nums">{rows.length}</div>
          <div className="text-xs text-[var(--text3)] mt-2 font-medium flex flex-col gap-0.5">
            <span>Aylanma tahlili</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs & Controls Bar */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Tabs */}
          <div className="flex gap-2 bg-[var(--bg)] p-1.5 rounded-2xl border border-[var(--border)] w-fit shadow-xs overflow-x-auto">
            {(['operatsiyalar', 'bekor_qilinganlar'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 cursor-pointer text-xs font-bold rounded-xl whitespace-nowrap transition-all tracking-wide flex items-center gap-2",
                  activeTab === tab 
                    ? "bg-[var(--bg2)] text-[var(--text)] shadow-xs border border-[var(--border)] font-black" 
                    : "text-[var(--text3)] border border-transparent hover:text-[var(--text)] hover:bg-[var(--bg2)]"
                )}
              >
                {tab === 'operatsiyalar' && <CheckCircle2 size={15} className="text-emerald-500" />}
                {tab === 'bekor_qilinganlar' && <Trash2 size={15} className="text-rose-500" />}
                <span>{tab === 'operatsiyalar' ? "Muvaffaqiyatli Operatsiyalar" : "Bekor qilinganlar (Savat)"}</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono",
                  activeTab === tab ? "bg-[#8b5cf6]/15 text-[#8b5cf6] font-bold" : "bg-[var(--bg2)] text-[var(--text3)]"
                )}>
                  {tab === 'operatsiyalar' ? rows.length : canceledRows.length}
                </span>
              </button>
            ))}
          </div>

          {/* Table Tools (Density & Search) */}
          {activeTab === 'operatsiyalar' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Live Search Input */}
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="Jadvaldan tezkor qidirish..."
                  className="w-full pl-9 pr-8 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-purple-500/10 transition-all placeholder:text-[var(--text3)]"
                />
                {tableSearch && (
                  <button 
                    onClick={() => setTableSearch('')} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] p-0.5 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Density Switcher */}
              <div className="flex items-center bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)] gap-1">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    density === 'compact'
                      ? "bg-[#8b5cf6] text-white shadow-2xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Ixcham ko'rinish (Ko'proq qatorlar)"
                >
                  <SlidersHorizontal size={13} />
                  <span>Ixcham</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    density === 'comfortable'
                      ? "bg-[#8b5cf6] text-white shadow-2xs"
                      : "text-[var(--text3)] hover:text-[var(--text)]"
                  )}
                  title="Keng va qulay ko'rinish"
                >
                  <span>Keng</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Amal Pills */}
        {activeTab === 'operatsiyalar' && (
          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg2)]/50 p-2 rounded-2xl border border-[var(--border)]">
            <span className="text-[11px] font-bold text-[var(--text3)] px-2 flex items-center gap-1">
              <ListFilter size={13} /> Amal:
            </span>
            <button
              type="button"
              onClick={() => setAmal('')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                amal === '' 
                  ? "bg-[#8b5cf6] text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-[var(--text3)] border border-[var(--border)] hover:text-[var(--text)]"
              )}
            >
              Barchasi ({rawTransactions.length})
            </button>
            <button
              type="button"
              onClick={() => setAmal('kirim')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                amal === 'kirim' 
                  ? "bg-emerald-600 text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-emerald-600 dark:text-emerald-400 border border-[var(--border)] hover:bg-emerald-500/10"
              )}
            >
              <ArrowDownLeft size={13} /> Kirim ({kirimTxCount})
            </button>
            <button
              type="button"
              onClick={() => setAmal('chiqim')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                amal === 'chiqim' 
                  ? "bg-rose-600 text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-rose-600 dark:text-rose-400 border border-[var(--border)] hover:bg-rose-500/10"
              )}
            >
              <ArrowUpRight size={13} /> Chiqim ({chiqimTxCount})
            </button>
            <button
              type="button"
              onClick={() => setAmal('otkazma')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                amal === 'otkazma' 
                  ? "bg-blue-600 text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-blue-600 dark:text-blue-400 border border-[var(--border)] hover:bg-blue-500/10"
              )}
            >
              <ArrowLeftRight size={13} /> O'tkazma ({otkazmaTxCount})
            </button>
            <button
              type="button"
              onClick={() => setAmal('tolov')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                amal === 'tolov' 
                  ? "bg-purple-600 text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-purple-600 dark:text-purple-400 border border-[var(--border)] hover:bg-purple-500/10"
              )}
            >
              <CreditCard size={13} /> To'lov ({tolovTxCount})
            </button>
            <button
              type="button"
              onClick={() => setAmal('tuzatish')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                amal === 'tuzatish' 
                  ? "bg-amber-600 text-white shadow-2xs" 
                  : "bg-[var(--bg)] text-amber-600 dark:text-amber-400 border border-[var(--border)] hover:bg-amber-500/10"
              )}
            >
              <AlertCircle size={13} /> Tuzatish
            </button>
          </div>
        )}

        <div className="soft-card overflow-hidden flex flex-col border border-[var(--border)] rounded-2xl shadow-sm">
          {activeTab === 'operatsiyalar' && (
            <>
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden lg:block flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[var(--bg)]/95 backdrop-blur-md text-[var(--text3)] text-[11px] uppercase tracking-wider sticky top-0 z-10 border-b border-[var(--border)] select-none">
                    <tr>
                      <th className={cn("font-bold text-[var(--text2)]", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Sana & Vaqt</th>
                      <th className={cn("font-bold text-[var(--text2)] text-center", density === 'compact' ? "px-3 py-3" : "px-5 py-4")}>Amal / Ombor</th>
                      <th className={cn("font-bold text-[var(--text2)]", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Model & O'lcham</th>
                      <th className={cn("font-bold text-[var(--text2)] text-right", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Miqdor (Juft)</th>
                      <th className={cn("font-bold text-[var(--text2)] text-right", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Summa</th>
                      <th className={cn("font-bold text-[var(--text2)]", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Mijoz / Izoh</th>
                      <th className={cn("font-bold text-[var(--text2)]", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Mas'ul Xodim</th>
                      {canManage && <th className={cn("font-bold text-[var(--text2)] text-right", density === 'compact' ? "px-4 py-3" : "px-6 py-4")}>Amallar</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-xs">
                    {rows.slice(0, visibleCount).length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="text-center py-16 text-[var(--text3)] italic font-medium">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="text-2xl opacity-40">🔍</span>
                            <span>Tanlangan filtrlar bo'yicha ma'lumot topilmadi</span>
                            <button
                              type="button"
                              onClick={clearFilter}
                              className="mt-2 text-xs font-bold text-[#8b5cf6] underline cursor-pointer"
                            >
                              Filtrlarni tozalash
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : rows.slice(0, visibleCount).map((t, idx) => {
                      const isTuzatish = t.amal === 'tuzatish' || isCorrectionTx(t);
                      const isKirim = t.amal === 'kirim' && !isTuzatish;
                      const isChiqim = t.amal === 'chiqim' && !isTuzatish;
                      const isOtkIn = t.amal === 'otkazma-in';
                      const isOtkOut = t.amal === 'otkazma-out';
                      const isTolov = t.amal === 'tolov';
                      
                      const badgeCls = isTuzatish 
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        : isKirim 
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : isChiqim 
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : isTolov 
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30";
                        
                      const label = isTuzatish ? "Tuzatish" : isKirim ? "Kirim" : isChiqim ? "Chiqim" : isTolov ? "To'lov" : isOtkOut ? "O'tk. Chiqdi" : "O'tk. Keldi";
                      const sign = isTuzatish ? '±' : (isKirim || isOtkIn || isTolov ? '+' : '−');
                      const colorCls = isTuzatish 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : (isKirim || isOtkIn ? 'text-emerald-600 dark:text-emerald-400' : isChiqim ? 'text-rose-600 dark:text-rose-400' : isTolov ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400');

                      const cellPy = density === 'compact' ? "py-2.5" : "py-3.5";

                      return (
                        <tr 
                          key={`${(t as any).ombor || ''}_${t.id}_${idx}`} 
                          className="hover:bg-blue-500/5 odd:bg-transparent even:bg-[var(--bg2)]/30 transition-colors group"
                        >
                          {/* Sana & Vaqt */}
                          <td className={cn("px-4 font-medium", cellPy)}>
                            <div className="font-bold text-[var(--text)] text-[13px] tracking-tight">{t.sana}</div>
                            <div className="text-[10px] text-[var(--text3)] font-mono">
                              {t.vaqt && t.vaqt.length > 5 ? t.vaqt.slice(-5) : t.vaqt || '—'}
                            </div>
                          </td>

                          {/* Amal / Ombor */}
                          <td className={cn("px-3 text-center", cellPy)}>
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider", badgeCls)}>
                                {isKirim && <ArrowDownLeft size={11} />}
                                {isChiqim && <ArrowUpRight size={11} />}
                                {(isOtkIn || isOtkOut) && <ArrowLeftRight size={11} />}
                                {isTolov && <CreditCard size={11} />}
                                {isTuzatish && <AlertCircle size={11} />}
                                <span>{label}</span>
                              </span>
                              {omborScope === 'all' && (t as any).ombor && (
                                <span className="text-[9px] font-bold text-[var(--text3)] uppercase tracking-widest">
                                  {(t as any).ombor === 'tepa' ? 'Tepa' : 'Kotta'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Model & O'lcham */}
                          <td className={cn("px-4", cellPy)}>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[13px] text-[var(--text)] group-hover:text-[#8b5cf6] transition-colors">
                                {t.model}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text2)] shadow-2xs">
                                {t.olcham}°
                              </span>
                            </div>
                          </td>

                          {/* Soni (Juft) */}
                          <td className={cn("px-4 text-right tabular-nums font-mono font-black text-sm", cellPy, colorCls)}>
                            {sign}{Number(t.soni).toLocaleString()}
                          </td>

                          {/* Summa */}
                          <td className={cn("px-4 text-right font-bold text-xs text-[var(--text)] tabular-nums font-mono", cellPy)}>
                            {t.summa ? (
                              <span title={`${formatUzs(t.summa)} UZS`} className="hover:underline cursor-help">
                                {formatCompact(t.summa)} <span className="text-[10px] text-[var(--text3)] font-normal">UZS</span>
                              </span>
                            ) : (
                              <span className="text-[var(--text3)] opacity-40">—</span>
                            )}
                          </td>

                          {/* Mijoz / Manzil / Izoh */}
                          <td className={cn("px-4 max-w-[220px]", cellPy)}>
                            <div className="font-semibold text-[var(--text)] truncate" title={t.kimdan || t.izoh}>
                              {t.kimdan || '—'}
                            </div>
                            {t.izoh && (
                              <div className="text-[11px] text-[var(--text3)] truncate mt-0.5" title={t.izoh}>
                                {t.izoh}
                              </div>
                            )}
                          </td>

                          {/* Mas'ul Xodim */}
                          <td className={cn("px-4", cellPy)}>
                            <div className="flex items-center gap-1.5 text-[var(--text2)] font-semibold text-xs">
                              <div className="w-5 h-5 rounded-full bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center text-[10px] font-black shrink-0">
                                {t.xodim ? t.xodim.charAt(0).toUpperCase() : 'X'}
                              </div>
                              <span className="truncate max-w-[110px]">{t.xodim || '—'}</span>
                            </div>
                          </td>

                          {/* Amallar */}
                          {canManage && (
                            <td className={cn("px-4 text-right", cellPy)}>
                              <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenEdit(t)}
                                  className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                                  title="Tahrirlash"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleCancelTx(t)}
                                  className="p-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer"
                                  title="Bekor qilish"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW */}
              <div className="lg:hidden flex flex-col divide-y divide-[var(--border)] bg-[var(--bg2)]">
                {rows.slice(0, visibleCount).length === 0 ? (
                  <div className="text-center py-12 text-[var(--text3)] italic text-[13px] font-medium">Ma'lumot topilmadi</div>
                ) : rows.slice(0, visibleCount).map((t, idx) => {
                  const isTuzatish = t.amal === 'tuzatish' || isCorrectionTx(t);
                  const isKirim = t.amal === 'kirim' && !isTuzatish;
                  const isChiqim = t.amal === 'chiqim' && !isTuzatish;
                  const isOtkIn = t.amal === 'otkazma-in';
                  const isOtkOut = t.amal === 'otkazma-out';
                  const isTolov = t.amal === 'tolov';
                  
                  const label = isTuzatish ? "Tuzatish" : isKirim ? "Kirim" : isChiqim ? "Chiqim" : isTolov ? "To'lov" : isOtkOut ? "O'tk. Chiqdi" : "O'tk. Keldi";
                  const sign = isTuzatish ? '±' : (isKirim || isOtkIn || isTolov ? '+' : '−');
                  const colorCls = isTuzatish ? 'text-amber-500' : (isKirim || isOtkIn ? 'text-emerald-500' : isChiqim ? 'text-rose-500' : isTolov ? 'text-purple-500' : 'text-blue-500');
                  const bgCls = isTuzatish ? 'bg-amber-500/10' : (isKirim || isOtkIn ? 'bg-emerald-500/10' : isChiqim ? 'bg-rose-500/10' : isTolov ? 'bg-purple-500/10' : 'bg-blue-500/10');

                  return (
                    <div key={`${(t as any).ombor || ''}_${t.id}_${idx}`} className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-0.5">
                          <span className={`w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${bgCls} ${colorCls}`}>
                            {label}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--text3)] font-mono">{t.sana} • {t.vaqt && t.vaqt.length > 5 ? t.vaqt.slice(-5) : t.vaqt}</span>
                        </div>
                        <div className="text-right">
                          <div className={`font-black text-[15px] tabular-nums font-mono ${colorCls}`}>{sign}{t.soni} ta</div>
                          {t.summa > 0 && <div className="text-[11px] font-bold text-[var(--text2)] font-mono" title={`${formatUzs(t.summa)} UZS`}>{formatCompact(t.summa)} UZS</div>}
                        </div>
                      </div>
                      
                      <div className="bg-[var(--bg)] p-2.5 rounded-xl border border-[var(--border)]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-[13px] text-[var(--text)]">{t.model}</span>
                          <span className="text-[11px] font-bold text-[var(--text3)] bg-[var(--bg2)] px-2 py-0.5 rounded border border-[var(--border)]">{t.olcham}°</span>
                        </div>
                        <div className="text-[11px] text-[var(--text2)] mt-1 flex justify-between items-center">
                          <span className="truncate pr-2 font-medium">{t.kimdan || t.izoh || '—'}</span>
                          <span className="flex items-center gap-1 opacity-60 text-[10px] uppercase font-bold tracking-wider shrink-0">
                            <User size={11}/> {t.xodim}
                          </span>
                        </div>
                        {canManage && (
                          <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(t)}
                              className="px-2.5 py-1 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 size={13} /> Tahrirlash
                            </button>
                            <button
                              onClick={() => handleCancelTx(t)}
                              className="px-2.5 py-1 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={13} /> Bekor qilish
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table Footer Summary Bar */}
              <div className="p-3.5 bg-[var(--bg)] border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-[var(--text3)]">
                    Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(visibleCount, rows.length)}</strong> / {rows.length} ta operatsiya
                  </span>
                  <span className="hidden sm:inline text-[var(--border)]">|</span>
                  <span className="font-semibold">
                    Jami ko'rinayotgan hajm: <strong className="text-emerald-500 font-mono">{rows.slice(0, visibleCount).reduce((a, b) => a + (Number(b.soni) || 0), 0).toLocaleString()}</strong> juft
                  </span>
                </div>

                {rows.length > visibleCount && (
                  <button 
                    onClick={() => setVisibleCount(v => v + 100)} 
                    className="px-4 py-1.5 bg-[var(--bg2)] border border-[var(--border)] hover:border-[#8b5cf6] rounded-xl text-xs font-bold text-[var(--text)] transition-colors shadow-2xs cursor-pointer"
                  >
                    Yana 100 tasini ko'rsatish ({rows.length - visibleCount} qoldi)
                  </button>
                )}
              </div>
            </>
          )}
          
          {activeTab === 'bekor_qilinganlar' && (
            <div className="p-0 sm:p-6 bg-[var(--bg)] sm:bg-[var(--bg2)]">
              <div className="hidden sm:flex mb-6 items-center gap-2">
                <span className="text-rose-500">🗑️</span>
                <h2 className="text-[16px] font-bold text-[var(--text)]">Savatdagi operatsiyalar ro'yxati (Bekor qilingan)</h2>
              </div>
              
              {canceledRows.length === 0 ? (
                <div className="p-12 text-center text-[var(--text3)] italic text-[13px] font-medium border border-[var(--border)] rounded-2xl bg-[var(--bg)]">
                  Bekor qilingan amallar mavjud emas.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 p-3 sm:p-0">
                    {canceledRows.slice(0, canceledVisibleCount).map((tx, idx) => (
                      <div key={`${(tx as any).ombor || ''}_${tx.id}_${idx}`} className="bg-[var(--bg2)] sm:bg-[var(--bg)] p-4 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center border border-[var(--border)] shadow-sm gap-3 transition-hover hover:border-rose-500/30">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold text-white bg-rose-500 px-2 py-0.5 rounded uppercase tracking-wider">{tx.tip}</span>
                            <span className="text-[11px] font-semibold text-[var(--text3)]">{tx.vaqt}</span>
                          </div>
                          <div className="font-bold text-[14px] text-[var(--text)]">
                            {tx.model} <span className="text-[var(--text3)] mx-1">•</span> {tx.olcham}° o'lcham
                          </div>
                        </div>
                        <div className="flex flex-col sm:items-end bg-[var(--bg)] sm:bg-transparent p-2 sm:p-0 rounded-lg">
                          <span className="font-black text-[15px] text-[var(--text)] tabular-nums">{tx.soni} dona</span>
                          {(tx as any).qaytibKelganSoni !== undefined && (
                            <span className="text-[11px] font-bold text-amber-500 mt-0.5">Qaytdi: {(tx as any).qaytibKelganSoni}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canceledRows.length > canceledVisibleCount && (
                    <div className="p-3.5 bg-[var(--bg2)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text2)] mt-4 rounded-xl">
                      <span className="font-semibold text-[var(--text3)]">
                        Ko'rsatilmoqda: <strong className="text-[var(--text)]">{Math.min(canceledVisibleCount, canceledRows.length)}</strong> / {canceledRows.length} ta bekor qilingan amal
                      </span>
                      <button 
                        type="button"
                        onClick={() => setCanceledVisibleCount(v => v + 50)} 
                        className="px-4 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/30 text-rose-500 font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                      >
                        Yana 50 tasini ko'rsatish ({canceledRows.length - canceledVisibleCount} qoldi)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CLEAR HISTORY CONFIRMATION MODAL */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Operatsiyalar tarixini tozalash</h3>
                <p className="text-xs text-[var(--text3)]">O'chiriladigan bo'limlarni tanlang</p>
              </div>
            </div>

            <div className="space-y-2.5 p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={clearScope.kirim}
                  onChange={e => setClearScope(prev => ({ ...prev, kirim: e.target.checked }))}
                  className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500 w-4 h-4"
                />
                <span>Kirim operatsiyalari tarixi</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={clearScope.chiqim}
                  onChange={e => setClearScope(prev => ({ ...prev, chiqim: e.target.checked }))}
                  className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500 w-4 h-4"
                />
                <span>Chiqim va sotuv operatsiyalari tarixi</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={clearScope.otkazma}
                  onChange={e => setClearScope(prev => ({ ...prev, otkazma: e.target.checked }))}
                  className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500 w-4 h-4"
                />
                <span>O'tkazmalar (Omborlararo) tarixi</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={clearScope.bekorQilinganlar}
                  onChange={e => setClearScope(prev => ({ ...prev, bekorQilinganlar: e.target.checked }))}
                  className="rounded border-[var(--border)] text-rose-500 focus:ring-rose-500 w-4 h-4"
                />
                <span>Bekor qilingan operatsiyalar arxivi</span>
              </label>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium leading-relaxed">
              ⚠️ Diqqat! Ushbu amal tanlangan barcha operatsiya yozuvlarini butunlay o'chiradi.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={!clearScope.kirim && !clearScope.chiqim && !clearScope.otkazma && !clearScope.bekorQilinganlar}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tozalashni tasdiqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TRANSACTION MODAL */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-5 my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Operatsiyani tahrirlash</h3>
                  <p className="text-xs text-[var(--text3)]">Mijoz, model, o'lcham yoki miqdorni to'g'irlash</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                editingTx.amal === 'kirim' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                editingTx.amal === 'chiqim' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                editingTx.amal === 'tolov' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                'bg-blue-500/10 text-blue-500 border border-blue-500/20'
              }`}>
                {editingTx.amal === 'kirim' ? 'Kirim' : editingTx.amal === 'chiqim' ? 'Chiqim (Sotuv)' : editingTx.amal === 'tolov' ? "To'lov" : editingTx.amal}
              </span>
            </div>

            {/* Modal Body Form */}
            <div className="space-y-4 text-xs max-h-[65vh] overflow-y-auto pr-1">
              
              {/* Mijoz / Kontragent */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--text)] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-blue-500" />
                    Mijoz / Manba (Xaridor)
                  </span>
                  <span className="text-[11px] font-normal text-[var(--text3)]">Mavjud mijozlardan qidiring yoki yangi yozing</span>
                </label>
                <ClientSearchSelect
                  value={editingTx.kimdan}
                  onChange={(name) => setEditingTx(prev => prev ? ({ ...prev, kimdan: name }) : null)}
                  placeholder="Mijoz nomini yozing yoki ro'yxatdan tanlang..."
                  inputClassName="py-2.5 rounded-xl text-xs sm:text-sm font-bold"
                />

                {/* Quick Client Selection Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {/* Priority chip for Umid 8708 */}
                  <button
                    type="button"
                    onClick={() => setEditingTx(prev => prev ? ({ ...prev, kimdan: 'Umid 8708' }) : null)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      editingTx.kimdan === 'Umid 8708'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                    }`}
                  >
                    ✨ Umid 8708
                  </button>
                  
                  {(db.kontragentlar || [])
                    .filter(k => k.ism !== 'Umid 8708' && k.ism !== editingTx.kimdan)
                    .slice(0, 4)
                    .map((k, kIdx) => (
                      <button
                        key={`${k.id || 'kontr'}_${kIdx}`}
                        type="button"
                        onClick={() => setEditingTx(prev => prev ? ({ ...prev, kimdan: k.ism }) : null)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:border-blue-500/50 transition-colors cursor-pointer"
                      >
                        {k.ism}
                      </button>
                    ))}
                </div>
              </div>

              {editingTx.amal === 'tolov' ? (
                <>
                  {/* To'lov Summasi & Kassa Turi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <DollarSign size={14} className="text-emerald-500" />
                          To'lov Summasi (UZS) *
                        </span>
                        {editingTx.summa > 0 && (
                          <span className="text-[11px] font-bold text-emerald-500">{formatCompact(editingTx.summa)} UZS</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={editingTx.summa || ''}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, summa: Math.max(0, parseInt(e.target.value) || 0) }) : null)}
                        placeholder="0"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-black text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 focus:outline-hidden"
                      />
                      {/* Quick Amount Presets */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[100000, 500000, 1000000, 2000000, 5000000].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setEditingTx(prev => prev ? ({ ...prev, summa: amt }) : null)}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-emerald-500 hover:border-emerald-500 cursor-pointer transition-colors"
                          >
                            {formatCompact(amt)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Wallet size={14} className="text-purple-500" />
                        Kassa Turi
                      </label>
                      <select
                        value={editingTx.kassaTuri || 'naqd_uzs'}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, kassaTuri: e.target.value as KassaTuri }) : null)}
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-purple-500 focus:outline-hidden"
                      >
                        <option value="naqd_uzs">Naqd pul (UZS)</option>
                        <option value="naqd_usd">Naqd Dollar (USD)</option>
                        <option value="karta_uzs">Plastik Karta (UzCard/Humo)</option>
                        <option value="bank_uzs">Bank Hisobi (Perexod)</option>
                      </select>
                    </div>
                  </div>

                  {/* Sana & Vaqt */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Calendar size={14} className="text-blue-500" />
                        To'lov Sanasi *
                      </label>
                      <input
                        type="date"
                        value={editingTx.sana}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, sana: e.target.value }) : null)}
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Clock size={14} className="text-amber-500" />
                        Vaqt
                      </label>
                      <input
                        type="text"
                        value={editingTx.vaqt}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, vaqt: e.target.value }) : null)}
                        placeholder="Masalan: 14:30"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Model & O'lcham */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Layers size={14} className="text-amber-500" />
                        Model nomi
                      </label>
                      <input
                        type="text"
                        list="models-edit-list"
                        value={editingTx.model}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, model: e.target.value }) : null)}
                        placeholder="Model nomini kiriting"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      />
                      <datalist id="models-edit-list">
                        {allModels.map(m => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)]">O'lcham (°)</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={editingTx.olcham}
                          onChange={e => setEditingTx(prev => prev ? ({ ...prev, olcham: e.target.value }) : null)}
                          placeholder="41"
                          className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                      {/* Size Quick Buttons */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {['39', '40', '41', '42', '43', '44', '45'].map(sz => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setEditingTx(prev => prev ? ({ ...prev, olcham: sz }) : null)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                              editingTx.olcham === sz
                                ? 'bg-[var(--text)] text-[var(--bg)]'
                                : 'bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)]'
                            }`}
                          >
                            {sz}°
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Soni & Summa */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)]">Soni (Juft / Dona)</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingTx(prev => prev ? ({ ...prev, soni: Math.max(1, prev.soni - 1) }) : null)}
                          className="w-10 h-10 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-base font-black text-[var(--text)] hover:bg-[var(--border)] transition-colors flex items-center justify-center cursor-pointer"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={editingTx.soni}
                          onChange={e => setEditingTx(prev => prev ? ({ ...prev, soni: Math.max(1, parseInt(e.target.value) || 1) }) : null)}
                          className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-center text-base font-black text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingTx(prev => prev ? ({ ...prev, soni: prev.soni + 1 }) : null)}
                          className="w-10 h-10 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-base font-black text-[var(--text)] hover:bg-[var(--border)] transition-colors flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <DollarSign size={13} className="text-emerald-500" />
                          Summa (UZS)
                        </span>
                        {editingTx.summa > 0 && (
                          <span className="text-[11px] font-bold text-emerald-500">{formatCompact(editingTx.summa)} UZS</span>
                        )}
                      </label>
                      <input
                        type="number"
                        value={editingTx.summa}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, summa: Math.max(0, parseInt(e.target.value) || 0) }) : null)}
                        placeholder="0"
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Ombor & Sana */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Building size={14} className="text-purple-500" />
                        Ombor
                      </label>
                      <select
                        value={editingTx.ombor}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, ombor: e.target.value as WarehouseName }) : null)}
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      >
                        <option value="tepa">Tepa Ombori</option>
                        <option value="kotta">Kotta Ombori</option>
                        <option value="sort2">🟡 2-Sort Ombori</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <Calendar size={14} className="text-blue-500" />
                        Sana
                      </label>
                      <input
                        type="date"
                        value={editingTx.sana}
                        onChange={e => setEditingTx(prev => prev ? ({ ...prev, sana: e.target.value }) : null)}
                        className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Vaqt & Xodim */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-500" />
                    Vaqt
                  </label>
                  <input
                    type="text"
                    value={editingTx.vaqt}
                    onChange={e => setEditingTx(prev => prev ? ({ ...prev, vaqt: e.target.value }) : null)}
                    placeholder="Masalan: 04/07 yoki 14:30"
                    className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[var(--text)] flex items-center gap-1.5">
                    <User size={14} className="text-emerald-500" />
                    Xodim
                  </label>
                  <input
                    type="text"
                    value={editingTx.xodim}
                    onChange={e => setEditingTx(prev => prev ? ({ ...prev, xodim: e.target.value }) : null)}
                    placeholder="Xodim ismi"
                    className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Izoh */}
              <div className="space-y-1.5">
                <label className="font-bold text-[var(--text)]">Izoh / Qo'shimcha ma'lumot</label>
                <input
                  type="text"
                  value={editingTx.izoh}
                  onChange={e => setEditingTx(prev => prev ? ({ ...prev, izoh: e.target.value }) : null)}
                  placeholder="Ixtiyoriy izoh..."
                  className="w-full px-3.5 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--text)] focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Informative Note */}
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Tahrirlash natijasida ombor qoldig'i (zaxira) va mijoz balansi/jami xarid ko'rsatkichlari avtomatik ravishda to'g'ri hisob-kitob qilinadi.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleSaveEditTx}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>O'zgarishlarni saqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Reassign & Balance Recalculate Modal */}
      <ClientReassignModal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
      />

      {/* CONFIRM CANCEL TRANSACTION MODAL */}
      {txToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Operatsiyani bekor qilish</h3>
                  <p className="text-xs text-[var(--text3)]">Amaliyotni qaytarish va omborni to'g'rilash</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTxToCancel(null)}
                className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--bg)] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Transaction Details Box */}
            <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text3)] font-semibold">Amal turi:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${
                  txToCancel.amal === 'kirim' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                  txToCancel.amal === 'chiqim' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                  txToCancel.amal === 'tolov' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                  'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}>
                  {txToCancel.amal === 'kirim' ? 'Kirim' :
                   txToCancel.amal === 'chiqim' ? 'Chiqim (Sotuv)' :
                   txToCancel.amal === 'tolov' ? "To'lov" :
                   txToCancel.amal}
                </span>
              </div>

              {txToCancel.amal !== 'tolov' ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text3)] font-semibold">Model & O'lcham:</span>
                    <span className="font-bold text-[var(--text)]">{txToCancel.model} ({txToCancel.olcham}°)</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text3)] font-semibold">Miqdor:</span>
                    <span className="font-mono font-black text-sm text-[var(--text)]">{Number(txToCancel.soni).toLocaleString()} juft</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text3)] font-semibold">To'lov usuli:</span>
                  <span className="font-bold text-[var(--text)]">{txToCancel.model}</span>
                </div>
              )}

              {txToCancel.summa > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text3)] font-semibold">Summasi:</span>
                  <span className="font-mono font-bold text-[var(--text)]">{formatUzs(txToCancel.summa)} UZS</span>
                </div>
              )}

              {txToCancel.kimdan && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text3)] font-semibold">Mijoz / Manba:</span>
                  <span className="font-semibold text-[var(--text)] truncate max-w-[180px]">{txToCancel.kimdan}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-[var(--text3)] font-semibold">Sana & Vaqt:</span>
                <span className="font-mono text-[var(--text2)]">{txToCancel.sana} {txToCancel.vaqt ? `(${txToCancel.vaqt})` : ''}</span>
              </div>
            </div>

            {/* Warning Note */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {txToCancel.amal === 'chiqim' && "Ushbu chiqim bekor qilinsa, ombor zaxirasiga tovarlar qaytariladi va mijoz qarzi/xaridlari kamaytiriladi."}
                {txToCancel.amal === 'kirim' && "Ushbu kirim bekor qilinsa, ombordagi mavjud qoldiqdan ushbu miqdor olib tashlanadi."}
                {txToCancel.amal === 'tolov' && "Ushbu to'lov bekor qilinsa, mijoz hisobiga qarz qayta yuklanadi."}
                {txToCancel.amal !== 'chiqim' && txToCancel.amal !== 'kirim' && txToCancel.amal !== 'tolov' && "Ushbu operatsiya bekor qilinib arxivga o'tkaziladi."}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTxToCancel(null)}
                disabled={isCanceling}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--bg)] transition-all cursor-pointer"
              >
                Orqaga qaytish
              </button>
              <button
                type="button"
                onClick={() => executeCancelTx(txToCancel)}
                disabled={isCanceling}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isCanceling ? "Bekor qilinmoqda..." : "Ha, bekor qilish"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
