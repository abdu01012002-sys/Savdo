import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { auth } from '../lib/fbClient';
import { subscribeToXodimlarTarixi } from '../lib/xodimlarTarixiService';
import { XodimTarixi } from '../types';
import { 
  User as UserIcon, 
  Mail, 
  Clock, 
  ShieldCheck, 
  History, 
  Search, 
  RefreshCw, 
  Users, 
  LogIn, 
  Calendar,
  Smartphone,
  CheckCircle2,
  Copy,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import { toast } from 'sonner';

export default function ProfilPage() {
  const { currentUser, isOffline } = useDb();
  const fbUser = auth.currentUser;

  const [tarixList, setTarixList] = useState<XodimTarixi[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<XodimTarixi | null>(null);

  if (currentUser?.rol !== 'admin') {
    return (
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
        <ShieldCheck className="w-12 h-12 text-rose-500 opacity-60" />
        <h2 className="text-lg font-bold text-[var(--text)]">Ruxsat cheklangan</h2>
        <p className="text-xs text-[var(--text3)] max-w-md">
          Ushbu sahifani va xodimlar tarixini faqatgina Bosh Administrator ko'rishi mumkin.
        </p>
      </div>
    );
  }

  useEffect(() => {
    const unsubscribe = subscribeToXodimlarTarixi(
      (data) => {
        setTarixList(data);
        setLoading(false);
      },
      (error) => {
        console.error("XodimlarTarixi yuklashda xatolik:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredList = tarixList.filter(item => {
    const s = search.toLowerCase();
    return (
      (item.displayName && item.displayName.toLowerCase().includes(s)) ||
      (item.email && item.email.toLowerCase().includes(s)) ||
      (item.selectedUserName && item.selectedUserName.toLowerCase().includes(s)) ||
      (item.selectedUserRole && item.selectedUserRole.toLowerCase().includes(s))
    );
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} nusxalandi!`);
  };

  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return 'Noma\'lum';
    try {
      return format(new Date(dateStr), "dd.MM.yyyy HH:mm:ss", { locale: uz });
    } catch {
      return dateStr;
    }
  };

  // Stats calculation
  const totalUsers = tarixList.length;
  const totalLogins = tarixList.reduce((sum, item) => sum + (item.loginCount || 1), 0);
  
  const today = new Date().toDateString();
  const activeToday = tarixList.filter(item => {
    if (!item.lastLogin) return false;
    return new Date(item.lastLogin).toDateString() === today;
  }).length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between relative z-10">
          <div className="flex items-center gap-5">
            <div className="relative">
              {fbUser?.photoURL ? (
                <img 
                  src={fbUser.photoURL} 
                  alt="Google Avatar" 
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[var(--active-color)] shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-md">
                  {currentUser?.ism ? currentUser.ism.slice(0, 2).toUpperCase() : 'GP'}
                </div>
              )}
              <span 
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[var(--bg2)] ${
                  isOffline ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                title={isOffline ? "Oflayn rejim" : "Onlayn faol"}
              />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
                  {currentUser?.ism || fbUser?.displayName || 'Xodim'}
                </h1>
                <span className="px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider bg-purple-500/10 text-[#8b5cf6] border border-purple-500/20">
                  {currentUser?.rol === 'admin' ? '🔑 Bosh Administrator' : '📦 Omborchi'}
                </span>
              </div>
              
              <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text3)] flex-wrap">
                <div className="flex items-center gap-1.5 font-medium">
                  <Mail className="w-4 h-4 text-[var(--text3)]" />
                  <span>{fbUser?.email || 'Google akkaunt ulanmagan'}</span>
                </div>
                {fbUser?.uid && (
                  <div className="flex items-center gap-1.5 text-xs font-mono bg-[var(--bg)] px-2.5 py-1 rounded-md border border-[var(--border)]">
                    <span className="text-[var(--text3)]">UID:</span>
                    <span>{fbUser.uid.slice(0, 8)}...</span>
                    <button 
                      onClick={() => copyToClipboard(fbUser.uid, "UID")}
                      className="hover:text-[var(--active-color)] transition-colors ml-1"
                      title="Nusxalash"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[var(--bg)] p-3 rounded-xl border border-[var(--border)] w-full md:w-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Google Auth Holati</span>
              <span className="text-xs font-bold text-emerald-500">Tasdiqlangan va Xavfsiz</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[var(--text)]">{totalUsers}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Google Xodimlar</div>
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
            <LogIn className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-500">{activeToday}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Bugun kirganlar</div>
          </div>
        </div>

        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-[#8b5cf6] flex items-center justify-center font-bold">
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[var(--text)]">{totalLogins}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text3)]">Jami Seanslar</div>
          </div>
        </div>
      </div>

      {/* Xodimlar Tarixi Section */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#8b5cf6]" />
              Xodimlar Tarixi (Google Akkauntlar Jurnali)
            </h2>
            <p className="text-xs font-medium text-[var(--text3)] mt-0.5">
              Firebase Firestore <code className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[#8b5cf6]">XodimlarTarixi</code> kolleksiyasida saqlangan real vaqtli kirish ma'lumotlari
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email yoki ismni qidirish..."
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text)] outline-none focus:border-[#8b5cf6] focus:ring-4 focus:ring-purple-500/10 transition-all"
            />
          </div>
        </div>

        {/* Table / List */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <div className="animate-spin w-8 h-8 border-4 border-[#8b5cf6] border-t-transparent rounded-full" />
            <p className="text-xs text-[var(--text3)] font-medium">Xodimlar tarixi yuklanmoqda...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 text-center text-[var(--text3)] flex flex-col items-center justify-center border border-dashed border-[var(--border)] rounded-xl">
            <History className="w-10 h-10 opacity-30 mb-2" />
            <p className="text-sm font-semibold">Hozircha Google xodimlar tarixi mavjud emas</p>
            <p className="text-xs text-[var(--text3)] mt-1">Google orqali kirilganda bu yerda avtomatik saqlanadi.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-[var(--bg)] text-[var(--text3)] text-[11px] font-bold uppercase tracking-wider border-b border-[var(--border)]">
                <tr>
                  <th className="p-4">Google Foydalanuvchi</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Tanlangan Xodim</th>
                  <th className="p-4">Oxirgi Kirish</th>
                  <th className="p-4 text-center">Kirishlar</th>
                  <th className="p-4 text-center">Tarix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-[13px]">
                {filteredList.map((item) => {
                  const isCurrent = fbUser?.uid === item.uid;
                  return (
                    <tr 
                      key={item.id || item.uid}
                      className={`hover:bg-[var(--bg)] transition-colors ${isCurrent ? 'bg-purple-500/5' : ''}`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {item.photoURL ? (
                            <img 
                              src={item.photoURL} 
                              alt={item.displayName} 
                              className="w-9 h-9 rounded-full object-cover border border-[var(--border)]"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center font-bold text-xs">
                              {item.displayName ? item.displayName.slice(0, 2).toUpperCase() : 'X'}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-[var(--text)] flex items-center gap-1.5">
                              {item.displayName}
                              {isCurrent && (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-extrabold">Siz</span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--text3)] font-mono">UID: {item.uid.slice(0, 10)}...</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-medium text-[var(--text)]">
                        <span className="bg-[var(--bg)] px-2.5 py-1 rounded-md border border-[var(--border)] text-xs">
                          {item.email}
                        </span>
                      </td>

                      <td className="p-4">
                        {item.selectedUserName ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-[var(--text)]">{item.selectedUserName}</span>
                            <span className="text-[11px] text-[var(--text3)] uppercase font-semibold">
                              {item.selectedUserRole === 'admin' ? 'Admin' : 'Omborchi'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text3)] italic">Tanlanmagan</span>
                        )}
                      </td>

                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text)] font-semibold">
                          <Clock className="w-3.5 h-3.5 text-[#8b5cf6]" />
                          {formatDateStr(item.lastLogin)}
                        </div>
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-purple-500/10 text-[#8b5cf6] border border-purple-500/20">
                          {item.loginCount || 1} marta
                        </span>
                      </td>

                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedUserForHistory(item)}
                          className="p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text3)] hover:text-[#8b5cf6] hover:border-purple-500/30 transition-colors text-xs font-bold"
                          title="Batafsil seanslar tarixi"
                        >
                          <History className="w-4 h-4 inline mr-1" />
                          Loglar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History Detail Modal */}
      {selectedUserForHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-[#8b5cf6] flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text)]">{selectedUserForHistory.displayName}</h3>
                  <p className="text-xs text-[var(--text3)]">{selectedUserForHistory.email}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedUserForHistory(null)}
                className="p-2 rounded-xl text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="my-4 overflow-y-auto flex-1 pr-1">
              <div className="text-xs font-bold text-[var(--text3)] uppercase tracking-wider mb-3">
                Barcha seanslar ({selectedUserForHistory.history?.length || 1} ta qayd):
              </div>

              {selectedUserForHistory.history && selectedUserForHistory.history.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedUserForHistory.history.slice().reverse().map((h, i) => (
                    <div 
                      key={i} 
                      className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#8b5cf6] shrink-0" />
                        <span className="font-semibold text-[var(--text)]">{formatDateStr(h.date)}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[var(--text)]">{h.selectedUser || 'Xodim'}</span>
                        {h.selectedRole && (
                          <span className="ml-1 text-[10px] font-bold text-[#8b5cf6] uppercase">({h.selectedRole})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text3)] text-center">
                  Oxirgi kirish: {formatDateStr(selectedUserForHistory.lastLogin)}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[var(--border)] flex justify-end">
              <button 
                onClick={() => setSelectedUserForHistory(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
