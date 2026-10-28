import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { generateId, cn } from '../lib/utils';
import { createAuditLog } from '../lib/auditUtils';
import { Trash2, Key, AlertTriangle, RotateCcw, ArrowDownLeft, ArrowUpRight, Repeat, AlertCircle, Database, Check } from 'lucide-react';
import { Role, DbState } from '../types';
import { toast } from 'sonner';
import { ExportBackupHub } from '../components/ExportBackupHub';
import { TelegramSettingsPanel } from '../components/TelegramSettingsPanel';
import { LegacyDataRecoveryCard } from '../components/LegacyDataRecoveryCard';
import { AppVersionCard } from '../components/AppVersionCard';
import { MigrationControlPanel } from '../components/MigrationControlPanel';

export default function SozlamalarPage() {
  const { db, setDb, currentUser } = useDb();
  const [ism, setIsm] = useState('');
  const [rol, setRol] = useState<Role>('omborchi');
  const [pin, setPin] = useState('');

  const [editPinUserId, setEditPinUserId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');

  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Clear specific module states
  const [confirmClearModule, setConfirmClearModule] = useState<string | null>(null);

  const isAdmin = currentUser?.rol === 'admin';

  const addXodim = () => {
    if (!ism) return toast.error('Ism kiriting!');
    if (!pin || pin.length !== 4) return toast.error('PIN kod 4 ta raqam bo\'lishi kerak!');
    
    if ((Array.isArray(db?.users) ? db.users : []).find(u => u.ism.toLowerCase() === ism.toLowerCase())) return toast.error('Bu ism allaqachon mavjud!');
    if ((Array.isArray(db?.users) ? db.users : []).find(u => u.pin === pin)) return toast.error('Bu PIN allaqachon boshqa xodimda bor!');
    
    setDb(prev => ({
      ...prev,
      users: [...(prev.users || []), { id: generateId(), ism, rol, pin }]
    }));
    
    setIsm('');
    setPin('');
    toast.success(`✅ ${ism} qo'shildi`);
  };

  const deleteXodim = (id: string) => {
    if (id === 'u1') return toast.error('Asosiy Adminni o\'chirib bo\'lmaydi!');
    if (id === currentUser?.id) return toast.error('O\'zingizni o\'chira olmaysiz!');
    
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    
    setDb(prev => ({
      ...prev,
      users: (prev.users || []).filter(u => u.id !== id)
    }));
    setDeleteConfirmId(null);
  };

  const handleSavePin = () => {
    if (!newPin || newPin.length !== 4) return toast.error('PIN kod 4 ta raqam bo\'lishi kerak!');
    if ((Array.isArray(db?.users) ? db.users : []).find(x => x.id !== editPinUserId && x.pin === newPin)) return toast.error('Bu PIN boshqa xodimda bor!');
    
    setDb(prev => ({
      ...prev,
      users: (prev.users || []).map(u => u.id === editPinUserId ? { ...u, pin: newPin } : u)
    }));
    
    setEditPinUserId(null);
    setNewPin('');
    toast.success('✅ PIN yangilandi');
  };

  // 1. Kirim tarixini tozalash
  const handleClearKirim = () => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.tepa.transactions = (nextDb.tepa.transactions || []).filter(t => t.amal !== 'kirim');
      nextDb.kotta.transactions = (nextDb.kotta.transactions || []).filter(t => t.amal !== 'kirim');
      nextDb.pendingKirim = [];
      nextDb.bekorQilinganKirimlar = [];
      return nextDb;
    });
    logAction('Kirim tarixi va kutilayotgan kirimlar tozalandi');
    toast.success("Kirim tarixi va ro'yxatlari muvaffaqiyatli tozalandi!");
    setConfirmClearModule(null);
  };

  // 2. Chiqim tarixini tozalash
  const handleClearChiqim = () => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.tepa.transactions = (nextDb.tepa.transactions || []).filter(t => t.amal !== 'chiqim');
      nextDb.kotta.transactions = (nextDb.kotta.transactions || []).filter(t => t.amal !== 'chiqim');
      nextDb.bekorQilinganChiqimlar = [];
      return nextDb;
    });
    logAction('Chiqim (savdo) tarixi tozalandi');
    toast.success("Chiqim va savdo tarixi muvaffaqiyatli tozalandi!");
    setConfirmClearModule(null);
  };

  // 3. O'tkazmalar tarixini tozalash
  const handleClearOtkazmalar = () => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.tepa.transactions = (nextDb.tepa.transactions || []).filter(t => !t.amal?.startsWith('otkazma'));
      nextDb.kotta.transactions = (nextDb.kotta.transactions || []).filter(t => !t.amal?.startsWith('otkazma'));
      nextDb.otkazmalar = [];
      nextDb.bekorQilinganOtkazmalar = [];
      return nextDb;
    });
    logAction('Omborlararo o\'tkazmalar tarixi tozalandi');
    toast.success("O'tkazmalar tarixi muvaffaqiyatli tozalandi!");
    setConfirmClearModule(null);
  };

  // 4. Vozvrat & Brak tarixini tozalash
  const handleClearVozvratBrak = () => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.tepa.transactions = (nextDb.tepa.transactions || []).filter(t => t.amal !== 'vozvrat' && t.amal !== 'brak');
      nextDb.kotta.transactions = (nextDb.kotta.transactions || []).filter(t => t.amal !== 'vozvrat' && t.amal !== 'brak');
      nextDb.vozvratlar = [];
      nextDb.braklar = [];
      return nextDb;
    });
    logAction('Vozvrat va Brak tovarlar jurnallari tozalandi');
    toast.success("Vozvrat va Brak yozuvlari muvaffaqiyatli tozalandi!");
    setConfirmClearModule(null);
  };

  // 5. Kassa harakatlarini tozalash
  const handleClearKassa = (resetBalances: boolean = false) => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.kassaHarakatlari = [];
      if (resetBalances) {
        nextDb.kassaBalansi = { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
      }
      return nextDb;
    });
    logAction(`Kassa xarajatlari va harakatlari tozalandi${resetBalances ? ' (balanslar 0 qilindi)' : ''}`);
    toast.success("Kassa amallari muvaffaqiyatli tozalandi!");
    setConfirmClearModule(null);
  };

  // 6. Barcha amallar tarixini tozalash (Ombor qoldiqlari saqlanadi)
  const handleClearAllHistory = () => {
    if (!isAdmin) return;
    setDb(prev => {
      const nextDb = JSON.parse(JSON.stringify(prev)) as DbState;
      nextDb.tepa.transactions = [];
      nextDb.kotta.transactions = [];
      nextDb.otkazmalar = [];
      nextDb.bekorQilinganOtkazmalar = [];
      nextDb.bekorQilinganKirimlar = [];
      nextDb.bekorQilinganChiqimlar = [];
      nextDb.pendingKirim = [];
      nextDb.vozvratlar = [];
      nextDb.braklar = [];
      nextDb.kassaHarakatlari = [];
      return nextDb;
    });
    logAction('Barcha bo\'limlar harakat tarixi tozalandi (Qoldiqlar saqlangan)');
    toast.success("Barcha harakatlar (Kirim, Chiqim, O'tkazma, Vozvrat, Brak, Kassa) tarixi tozalandi!");
    setConfirmClearModule(null);
  };

  const logAction = (details: string) => {
    if (!currentUser) return;
    try {
      const log = createAuditLog(currentUser, 'clear_module_data', 'Sozlamalar', details);
      setDb(prev => ({
        ...prev,
        auditLogs: [log, ...(prev.auditLogs || [])].slice(0, 300)
      }));
    } catch (e) {
      console.warn("Log creation error", e);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* App Version & Changelog Hub */}
      <AppVersionCard />

      {/* Xodimlar */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
        <h2 className="text-[16px] font-bold mb-6 text-[var(--text)] flex items-center gap-2">
            <span>👥</span> Xodimlar boshqaruvi
        </h2>
        
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Ism-Familiya</label>
            <input 
              type="text" 
              value={ism}
              onChange={e => setIsm(e.target.value)}
              placeholder="Abdullayev Jasur"
              className="p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all" 
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Rol</label>
            <select 
              value={rol}
              onChange={e => setRol(e.target.value as Role)}
              className="p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all cursor-pointer"
            >
              <option value="omborchi">📦 Omborchi</option>
              <option value="admin">🔑 Admin</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">PIN kod (4 raqam)</label>
            <input 
              type="password" 
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              className="p-3.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg)] text-[var(--text)] outline-none tracking-[4px] focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all" 
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={addXodim} className="px-5 py-3 rounded-xl text-[13px] font-bold bg-[#8cc63f] text-[#1a3300] hover:bg-[#7ebd35] transition-colors shadow-sm shadow-[#8cc63f]/20 cursor-pointer">
            + Xodim qo'shish
          </button>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'profil' }))} 
            className="px-5 py-3 rounded-xl text-[13px] font-bold bg-purple-500/10 text-[#8b5cf6] border border-purple-500/20 hover:bg-purple-500/20 transition-colors cursor-pointer flex items-center gap-2"
          >
            <span>📜</span> Google Xodimlar Tarixini ko'rish
          </button>
        </div>

        <div className="h-px bg-[var(--border)] my-6" />

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {(Array.isArray(db?.users) ? db.users : []).map((u, uIdx) => {
            const initials = u.ism.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={`${u.id || 'user'}_${uIdx}`} className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-[var(--text3)] transition-colors group">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-[15px] shrink-0",
                  u.rol === 'admin' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                )}>
                  {initials}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-[15px] text-[var(--text)]">{u.ism}</div>
                  <div className="mt-1">
                    <span className={cn(
                      "inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                      u.rol === 'admin' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    )}>
                      {u.rol === 'admin' ? '🔑 Admin' : '📦 Omborchi'}
                    </span>
                  </div>
                  <div className="text-[var(--text3)] text-[12px] mt-1.5 font-medium">PIN: ••••</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditPinUserId(u.id)} className="p-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-[var(--text3)] hover:text-[#8b5cf6] hover:border-[#8b5cf6]/30 transition-colors cursor-pointer" title="PIN o'zgartirish">
                    <Key className="w-4 h-4" />
                  </button>
                  {u.id !== 'u1' && u.id !== currentUser?.id && (
                    <button 
                      onClick={() => deleteXodim(u.id)} 
                      className={`p-2.5 rounded-xl border transition-colors cursor-pointer text-[12px] font-bold flex items-center gap-2 ${
                        deleteConfirmId === u.id 
                          ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20' 
                          : 'bg-[var(--bg2)] border-[var(--border)] text-[var(--text3)] hover:text-rose-500 hover:border-rose-500/30'
                      }`}
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                      {deleteConfirmId === u.id && "Tasdiqlash"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Telegram Bot Integratsiyasi */}
      <TelegramSettingsPanel />

      {/* Eski Baza Ma'lumotlarini Qidirish va Tiklash */}
      <LegacyDataRecoveryCard />

      {/* Ma'lumotlar Bazasini Eksport va Zaxiralash Markazi */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-[var(--text)] flex items-center gap-2">
            <span>📦</span> Ma'lumotlar Bazasini Yuklab Olish va Zaxiralash
          </h2>
          <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            Excel • JSON • PDF
          </span>
        </div>
        <ExportBackupHub />
      </div>

      {/* Firestore Collections Migration Panel */}
      <MigrationControlPanel />

      {/* Bo'limlar Ma'lumotlarini Boshqarish & Tozalash Markazi (Faqat Admin) */}
      {isAdmin && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="text-[16px] font-black text-[var(--text)] flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-500" />
                <span>Bo'limlar Ma'lumotlarini Tozalash Markazi</span>
              </h2>
              <p className="text-xs text-[var(--text3)] mt-0.5">
                Kirim, chiqim, o'tkazma, vozvrat, brak va kassa jurnallarini alohida yoki birgalikda tozalash
              </p>
            </div>
            <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 w-fit">
              Faqat Bosh Admin
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            
            {/* 1. Kirim Tarixi */}
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-3 hover:border-blue-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">Kirim Tarixi</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Barcha kirim yozuvlari va kutilayotgan kirimlarni tozalash
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('kirim')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white border border-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kirimni tozalash</span>
              </button>
            </div>

            {/* 2. Chiqim Tarixi */}
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-3 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">Chiqim (Savdo) Tarixi</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Barcha chiqim/savdo ro'yxatlari va yuk xatlarini tozalash
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('chiqim')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Chiqimni tozalash</span>
              </button>
            </div>

            {/* 3. O'tkazmalar Tarixi */}
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-3 hover:border-purple-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">O'tkazmalar Tarixi</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Tepa va Kotta omborlararo o'tkazma amallarini tozalash
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('otkazma')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-purple-500/10 hover:bg-purple-500 text-purple-600 hover:text-white border border-purple-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>O'tkazmalarni tozalash</span>
              </button>
            </div>

            {/* 4. Vozvrat & Brak */}
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-3 hover:border-rose-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">Vozvrat & Brak Jurnali</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Qaytgan tovarlar, nuqsonli braklar va aktlarni tozalash
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('vozvrat_brak')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vozvrat & Brakni tozalash</span>
              </button>
            </div>

            {/* 5. Kassa Harakatlari */}
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex flex-col justify-between gap-3 hover:border-amber-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text)]">Kassa & Xarajatlar</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Barcha kassa kirim-chiqimlari va xarajat amallarini tozalash
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('kassa')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white border border-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kassani tozalash</span>
              </button>
            </div>

            {/* 6. Barcha Amallarni Birvarakay Tozalash */}
            <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/30 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-600 dark:text-rose-400">Barcha Tarixni Tozalash</h4>
                  <p className="text-[11px] text-[var(--text3)] mt-0.5">
                    Kirim, chiqim, o'tkazma, vozvrat, brak va kassa tarixini 0 dan boshlash (ombor tovar qoldiqlari saqlanadi)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearModule('all')}
                className="w-full py-2 px-3 rounded-lg text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hammasini birvarakay tozalash</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Danger */}
      <div className="bg-[var(--bg2)] border border-rose-500/30 rounded-2xl p-6 shadow-sm bg-rose-500/5">
        <h2 className="text-[16px] font-bold mb-5 text-rose-500 flex items-center gap-2">
            <span>⚠️</span> Xavfli amallar
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <button 
            onClick={() => {
              if (resetConfirm) {
                localStorage.clear();
                window.location.reload();
              } else {
                setResetConfirm(true);
                setTimeout(() => setResetConfirm(false), 4000);
              }
            }}
            className={resetConfirm ? "px-5 py-3 rounded-xl text-[13px] font-bold bg-rose-500 text-white border-none cursor-pointer" : "px-5 py-3 rounded-xl text-[13px] font-bold bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"}
          >
            {resetConfirm ? "Tasdiqlaysizmi?" : "🗑 Ilovani tozalash (Reset)"}
          </button>
          <span className="text-[13px] text-rose-400 font-medium bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">Bu amalni bekor qilib bo'lmaydi!</span>
        </div>
      </div>

      {/* Audit Log (Tarix) */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 flex flex-col max-h-[500px] shadow-sm">
        <h2 className="text-[16px] font-bold mb-5 text-[var(--text)] flex items-center gap-2">
            <span>📜</span> Tizim audit loglari
        </h2>
        <div className="overflow-y-auto flex-1 border border-[var(--border)] rounded-xl shadow-inner">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-[var(--bg)] text-[var(--text3)] text-[11px] uppercase tracking-wider sticky top-0 border-b border-[var(--border)] shadow-sm">
              <tr>
                <th className="px-5 py-3 font-semibold">Sana / Vaqt</th>
                <th className="px-5 py-3 font-semibold">Xodim</th>
                <th className="px-5 py-3 font-semibold text-center">Harakat</th>
                <th className="px-5 py-3 font-semibold">Tafsilotlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg2)]">
              {(((db.auditLogs || []).length) === 0) ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-[var(--text3)] italic text-[13px] font-medium">Hozircha loglar yo'q</td>
                </tr>
              ) : [...(db.auditLogs || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log, lIdx) => (
                <tr key={`${log.id || 'audit'}_${lIdx}`} className="hover:bg-[var(--bg)] transition-colors group">
                  <td className="px-5 py-3 text-[11px] font-mono text-[var(--text3)] whitespace-nowrap">{log.date ? new Date(log.date).toLocaleString() : 'Noma\'lum'}</td>
                  <td className="px-5 py-3 font-bold text-[13px] text-[var(--text)]">{log.user}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold bg-[var(--bg)] text-[#8b5cf6] border border-[#8b5cf6]/20 uppercase tracking-wider">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-[var(--text3)] leading-relaxed font-medium">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PIN Change Modal */}
      {editPinUserId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-7 w-full max-w-sm shadow-2xl">
            <h3 className="text-[18px] font-bold text-[var(--text)] mb-6 flex items-center gap-2"><span>🔑</span> PIN o'zgartirish</h3>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">Yangi PIN (4 raqam)</label>
              <input 
                type="password"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl text-center text-3xl tracking-[12px] text-[#8b5cf6] font-bold outline-none caret-[#8b5cf6] p-5 focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/20 transition-all shadow-inner"
                placeholder="••••"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end mt-8">
              <button onClick={() => setEditPinUserId(null)} className="px-5 py-3 rounded-xl text-[13px] font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer shadow-sm">Bekor qilish</button>
              <button onClick={handleSavePin} className="px-5 py-3 rounded-xl text-[13px] font-bold bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors cursor-pointer shadow-sm shadow-purple-500/20">Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* Module Clear Confirmation Modal */}
      {confirmClearModule && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-rose-500/30 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-4 mx-auto border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-black text-center text-[var(--text)] mb-2">
              {confirmClearModule === 'kirim' && "Kirim Tarixini Tozalash"}
              {confirmClearModule === 'chiqim' && "Chiqim (Savdo) Tarixini Tozalash"}
              {confirmClearModule === 'otkazma' && "O'tkazmalar Tarixini Tozalash"}
              {confirmClearModule === 'vozvrat_brak' && "Vozvrat va Brak Jurnallarini Tozalash"}
              {confirmClearModule === 'kassa' && "Kassa Harakatlarini Tozalash"}
              {confirmClearModule === 'all' && "Barcha Bo'limlar Tarixini Tozalash"}
            </h3>

            <p className="text-xs text-center text-[var(--text3)] leading-relaxed mb-6">
              {confirmClearModule === 'kirim' && "Barcha kirim yozuvlari, kutilayotgan kirimlar va ularning hisobotlari to'liq o'chiriladi. Omborlardagi joriy qoldiq tovarlar o'zgarishsiz saqlanadi."}
              {confirmClearModule === 'chiqim' && "Barcha chiqim (savdo) ro'yxatlari, kvitansiyalar va yuk xatlari tarixi o'chiriladi. Joriy ombor qoldiqlari o'zgarishsiz qoladi."}
              {confirmClearModule === 'otkazma' && "Omborlararo o'tkazma loglari va bekor qilingan o'tkazmalar tarixi to'liq o'chiriladi."}
              {confirmClearModule === 'vozvrat_brak' && "Qaytarilgan mahsulotlar (vozvrat) va yaroqsiz (brak) tovarlar jurnallari to'liq tozalanadi."}
              {confirmClearModule === 'kassa' && "Barcha kassa kirim-chiqimlari, xarajatlar va to'lov operatsiyalari jurnali tozalanadi."}
              {confirmClearModule === 'all' && "Diqqat: Kirim, chiqim, o'tkazma, vozvrat, brak va kassa harakatlari jurnallari to'liq tozalanadi! Ombor qoldiqlari saqlanadi."}
            </p>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-6 text-center text-xs font-semibold text-rose-500">
              Bu amalni ortga qaytarib bo'lmaydi!
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmClearModule(null)}
                className="flex-1 py-3 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmClearModule === 'kirim') handleClearKirim();
                  else if (confirmClearModule === 'chiqim') handleClearChiqim();
                  else if (confirmClearModule === 'otkazma') handleClearOtkazmalar();
                  else if (confirmClearModule === 'vozvrat_brak') handleClearVozvratBrak();
                  else if (confirmClearModule === 'kassa') handleClearKassa(false);
                  else if (confirmClearModule === 'all') handleClearAllHistory();
                }}
                className="flex-1 py-3 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tozalashni tasdiqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
