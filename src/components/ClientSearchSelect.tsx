import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { Kontragent } from '../types';
import { formatCompact, cn } from '../lib/utils';
import { User, X, ChevronDown, Check, Plus, Phone, MapPin } from 'lucide-react';

interface ClientSearchSelectProps {
  value: string;
  onChange: (name: string, client?: Kontragent) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  showBalance?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export const ClientSearchSelect: React.FC<ClientSearchSelectProps> = ({
  value,
  onChange,
  placeholder = "Mijoz nomini yozing yoki ro'yxatdan tanlang...",
  className,
  inputClassName,
  showBalance = true,
  required = false,
  disabled = false,
  id
}) => {
  const { db } = useDb();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal search query with value when value changes externally
  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // All clients sorted A-Z
  const allClients = useMemo(() => {
    return [...(db.kontragentlar || [])].sort((a, b) => 
      (a.ism || '').localeCompare(b.ism || '', 'uz', { sensitivity: 'base' })
    );
  }, [db.kontragentlar]);

  // Filter clients by search query (partial matching anywhere in name, phone, region or note)
  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allClients;
    return allClients.filter(k => 
      k.ism.toLowerCase().includes(q) ||
      (k.tel && k.tel.includes(q)) ||
      (k.viloyat && k.viloyat.toLowerCase().includes(q)) ||
      (k.manzil && k.manzil.toLowerCase().includes(q)) ||
      (k.kategoriya && k.kategoriya.toLowerCase().includes(q))
    );
  }, [allClients, searchQuery]);

  // Exact match found?
  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return allClients.find(k => k.ism.trim().toLowerCase() === q);
  }, [allClients, searchQuery]);

  const handleSelect = (client: Kontragent) => {
    onChange(client.ism, client);
    setSearchQuery(client.ism);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleCustomSelect = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Input Field with Icons */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none flex items-center">
          <User size={15} className={value ? "text-blue-500" : "opacity-60"} />
        </div>

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={searchQuery}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          onChange={(e) => {
            const val = e.target.value;
            setSearchQuery(val);
            onChange(val);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          className={cn(
            "w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl pl-10 pr-16 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-[var(--text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:font-normal placeholder:text-[var(--text3)]",
            inputClassName
          )}
        />

        {/* Clear & Dropdown toggle buttons */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg text-[var(--text3)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(prev => !prev)}
            className="p-1 rounded-lg text-[var(--text3)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Mijozlar ro'yxatini ko'rish"
          >
            <ChevronDown size={15} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-2xl p-2 z-50 max-h-64 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase text-[var(--text3)] border-b border-[var(--border)]">
            <span>
              {searchQuery.trim() 
                ? `Qidiruv natijalari (${filteredClients.length} ta)` 
                : `Barcha mijozlar (${allClients.length} ta)`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-blue-500 hover:underline cursor-pointer"
            >
              Yopish
            </button>
          </div>

          {/* Custom option if user typed something not matching any existing client exactly */}
          {searchQuery.trim() && !exactMatch && (
            <div
              onClick={handleCustomSelect}
              className="px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 font-bold transition-colors border border-blue-500/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus size={14} className="shrink-0" />
                <span className="truncate">"{searchQuery.trim()}" sifatida tanlash / qoldirish</span>
              </div>
              <span className="text-[10px] uppercase font-black tracking-wider bg-blue-600 text-white px-1.5 py-0.5 rounded">
                Yangi
              </span>
            </div>
          )}

          {/* Filtered Clients List */}
          {filteredClients.length === 0 && !searchQuery.trim() ? (
            <div className="p-4 text-center text-xs text-[var(--text3)]">
              Mijozlar ro'yxati bo'sh
            </div>
          ) : filteredClients.length === 0 && searchQuery.trim() && !exactMatch ? (
            <div className="p-3 text-center text-xs text-[var(--text3)]">
              Mos mijoz topilmadi. Yuqoridagi tugma orqali yangi nom sifatida saqlashingiz mumkin.
            </div>
          ) : (
            filteredClients.map((client, clientIdx) => {
              const isSelected = value?.trim().toLowerCase() === client.ism.trim().toLowerCase();
              const debt = client.balans || 0;
              const limit = client.kreditLimiti || 0;

              return (
                <div
                  key={`${client.id || 'client'}_${client.ism}_${clientIdx}`}
                  onClick={() => handleSelect(client)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all",
                    isSelected
                      ? "bg-blue-600 text-white font-black shadow-xs"
                      : "hover:bg-[var(--bg)] text-[var(--text)]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 uppercase",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      )}
                    >
                      {client.ism ? client.ism[0] : 'M'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold truncate">{client.ism}</span>
                        {client.kategoriya && (
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase",
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                            )}
                          >
                            {client.kategoriya}
                          </span>
                        )}
                      </div>
                      {(client.tel || client.viloyat) && (
                        <div
                          className={cn(
                            "text-[10px] flex items-center gap-2 mt-0.5 truncate",
                            isSelected ? "text-white/80" : "text-[var(--text3)]"
                          )}
                        >
                          {client.tel && (
                            <span className="flex items-center gap-0.5">
                              <Phone size={9} /> {client.tel}
                            </span>
                          )}
                          {client.viloyat && (
                            <span className="flex items-center gap-0.5">
                              <MapPin size={9} /> {client.viloyat}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: Debt & Select checkmark */}
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {showBalance && debt !== 0 && (
                      <span
                        className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-md whitespace-nowrap",
                          isSelected
                            ? "bg-white text-blue-700"
                            : debt > 0
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {debt > 0 ? `Qarz: ${formatCompact(debt)}` : `Haq: ${formatCompact(Math.abs(debt))}`}
                      </span>
                    )}
                    {isSelected && <Check size={14} className="text-white shrink-0" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
