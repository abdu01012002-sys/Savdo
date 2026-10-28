import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDb } from '../context/DbContext';
import { ALL_SIZES, cn, formatCompact } from '../lib/utils';
import { WarehouseName } from '../types';
import { ChevronDown, Check, Tag, X } from 'lucide-react';

interface ModelSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  stockMap?: Record<string, number>;
  autoFocus?: boolean;
}

export const ModelSelect: React.FC<ModelSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder,
  stockMap,
  autoFocus 
}) => {
  const { db } = useDb();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const query = (search || '').trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return options;

    const exact: string[] = [];
    const startsWith: string[] = [];
    const contains: string[] = [];

    options.forEach(opt => {
      const optLower = opt.toLowerCase();
      if (optLower === query) {
        exact.push(opt);
      } else if (optLower.startsWith(query)) {
        startsWith.push(opt);
      } else if (optLower.includes(query)) {
        contains.push(opt);
      }
    });

    return [...exact, ...startsWith, ...contains];
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered]);

  // Scroll active item into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeItem = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, open]);

  const selectOption = (opt: string) => {
    setSearch(opt);
    onChange(opt);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && filtered[highlightedIndex]) {
        selectOption(filtered[highlightedIndex]);
      } else if (search.trim()) {
        selectOption(search.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Helper to highlight matching text
  const renderHighlighted = (text: string) => {
    if (!query) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return <span>{text}</span>;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);

    return (
      <span>
        {before}
        <span className="text-purple-600 dark:text-purple-400 bg-purple-500/15 font-black px-0.5 rounded">
          {match}
        </span>
        {after}
      </span>
    );
  };

  return (
    <div className="relative w-full" ref={ref}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          autoFocus={autoFocus}
          placeholder={placeholder || "Model nomini tanlang yoki yozing..."}
          value={search}
          onChange={(e) => {
            const val = e.target.value.replace(/[.#$/\[\]]/g, '');
            setSearch(val);
            onChange(val);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-3.5 pr-16 py-2.5 bg-[var(--bg3)] border border-[var(--border2)] rounded-xl text-[var(--text)] text-sm font-semibold outline-none transition-all focus:border-[var(--active-color)] focus:ring-[3px] focus:ring-[var(--active-soft)] placeholder:text-[var(--text3)] placeholder:font-normal"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                onChange('');
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md cursor-pointer transition-colors"
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(prev => !prev);
              inputRef.current?.focus();
            }}
            className="p-1 text-[var(--text3)] hover:text-[var(--active-color)] rounded-md cursor-pointer transition-colors"
            title="Modellar ro'yxatini ochish"
          >
            <ChevronDown size={16} className={cn("transition-transform duration-200", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div 
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-2xl z-50 max-h-[280px] overflow-y-auto shadow-2xl p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--border)] mb-1">
            <span>
              {query ? `Topilgan modellar (${filtered.length} ta)` : `Barcha modellar (${options.length} ta)`}
            </span>
            <span className="text-[10px] text-[var(--text3)] lowercase font-normal">
              {query ? 'tanlash uchun bosing yoki Enter' : 'qidirish uchun yozing'}
            </span>
          </div>

          {filtered.length > 0 ? (
            filtered.map((opt, idx) => {
              const priceInfo = db.prices?.[opt];
              const isSelected = opt.toLowerCase() === (value || '').trim().toLowerCase();
              const isHighlighted = idx === highlightedIndex;
              const stockCount = stockMap ? stockMap[opt] : undefined;

              return (
                <div
                  key={opt}
                  data-index={idx}
                  className={cn(
                    "px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all flex items-center justify-between group",
                    isHighlighted && "ring-1 ring-purple-500/40 bg-purple-500/10",
                    isSelected 
                      ? "bg-[var(--active-soft)] text-[var(--active-color)] font-bold" 
                      : "hover:bg-[var(--bg2)] text-[var(--text)] hover:text-[var(--active-color)]"
                  )}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => selectOption(opt)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0", 
                      isSelected ? "bg-[var(--active-color)]" : "bg-[var(--text3)]/40 group-hover:bg-[var(--active-color)]"
                    )} />
                    <span className="font-bold truncate">{renderHighlighted(opt)}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {stockCount !== undefined && (
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md border",
                        stockCount > 0 
                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" 
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                      )}>
                        {stockCount} jft
                      </span>
                    )}
                    {priceInfo?.cost ? (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 hidden sm:inline-block">
                        Tan: {formatCompact(priceInfo.cost)}
                      </span>
                    ) : null}
                    {priceInfo?.sale ? (
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 hidden sm:inline-block">
                        Sotuv: {formatCompact(priceInfo.sale)}
                      </span>
                    ) : null}
                    {isSelected && <Check size={14} className="text-[var(--active-color)] ml-1" />}
                  </div>
                </div>
              );
            })
          ) : (
            <div 
              onClick={() => search.trim() && selectOption(search.trim())}
              className="px-3 py-3 text-center text-xs text-[var(--text)] hover:bg-[var(--bg2)] rounded-xl cursor-pointer transition-colors"
            >
              <div className="text-purple-600 dark:text-purple-400 font-bold mb-0.5">
                ✨ Yangi model: "{search}"
              </div>
              <span className="text-[10px] text-[var(--text3)]">
                Shu nom bilan kiritish uchun bosing yoki Enter bosing
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SizeInputsProps {
  model: string;
  ombor: WarehouseName;
  value: Record<string, number>;
  onChange: (val: Record<string, number>) => void;
  accentColor?: 'emerald' | 'blue' | 'rose' | 'indigo' | 'amber';
}

export const SizeInputs: React.FC<SizeInputsProps> = ({ model, ombor, value, onChange, accentColor = 'blue' }) => {
  const { db } = useDb();
  const stock = db[ombor]?.stock || {};
  
  const existingSizes = model && stock[model] ? Object.keys(stock[model]) : [];
  const sizes = Array.from(new Set([...ALL_SIZES, ...existingSizes])).sort((a, b) => parseInt(a) - parseInt(b));
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleSize = (sz: string) => {
    const newVal = { ...value };
    if (newVal[sz] !== undefined) {
      delete newVal[sz];
    } else {
      newVal[sz] = 0;
      // Auto focus newly added size input after render
      setTimeout(() => {
        if (inputRefs.current[sz]) {
          inputRefs.current[sz]?.focus();
          inputRefs.current[sz]?.select();
        }
      }, 50);
    }
    onChange(newVal);
  };

  const selectAllSizes = () => {
    const newVal: Record<string, number> = {};
    sizes.forEach(sz => {
      newVal[sz] = value[sz] !== undefined ? value[sz] : 0;
    });
    onChange(newVal);
  };

  const clearAllSizes = () => {
    onChange({});
  };

  const updateQuantity = (sz: string, qty: number) => {
    onChange({ ...value, [sz]: qty });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentSz: string) => {
    const selectedSizeKeys = Object.keys(value).sort((a, b) => parseInt(a) - parseInt(b));
    const currentIndex = selectedSizeKeys.indexOf(currentSz);

    if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentIndex < selectedSizeKeys.length - 1) {
        const nextSz = selectedSizeKeys[currentIndex + 1];
        inputRefs.current[nextSz]?.focus();
        inputRefs.current[nextSz]?.select();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentIndex > 0) {
        const prevSz = selectedSizeKeys[currentIndex - 1];
        inputRefs.current[prevSz]?.focus();
        inputRefs.current[prevSz]?.select();
      }
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.7px] text-[var(--text3)] flex items-center gap-2">
          O'LCHAMLAR VA QOLDIQ
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllSizes}
            className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:border-[var(--active-color)] transition-colors cursor-pointer"
          >
            Hammasini tanlash
          </button>
          {Object.keys(value).length > 0 && (
            <button
              type="button"
              onClick={clearAllSizes}
              className="text-[10px] font-bold px-2 py-1 rounded-md bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              Tozalash
            </button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5 p-1">
        {sizes.map(sz => {
          const isSelected = value[sz] !== undefined;
          const avail = (stock[model] && stock[model][sz]) || 0;
          return (
            <button
              key={sz}
              type="button"
              onClick={() => toggleSize(sz)}
              className={cn(
                "relative flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none group",
                isSelected
                  ? "bg-[var(--active-soft)] border-[var(--active-color)] shadow-sm scale-[1.02]"
                  : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border2)] hover:bg-[var(--bg2)]"
              )}
            >
              <span className={cn(
                "text-[15px] font-extrabold tracking-tight",
                isSelected ? "text-[var(--active-color)]" : "text-[var(--text)]"
              )}>
                {sz}°
              </span>
              <span className={cn(
                "text-[10px] font-semibold mt-0.5",
                avail <= 0 ? "text-rose-500/80 font-bold" : "text-[var(--text3)]"
              )}>
                {avail} ta
              </span>
            </button>
          );
        })}
      </div>

      {Object.keys(value).length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text3)]">
            <span>MIQDORNI KIRITING (Enter / Tab orqali keyingisiga o'tish):</span>
            <span className="text-[var(--text)] font-extrabold">
              Jami: {Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0)} juft
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
            {Object.keys(value).sort((a, b) => parseInt(a) - parseInt(b)).map((sz) => {
              const qty = value[sz];
              const avail = (stock[model] && stock[model][sz]) || 0;
              return (
                <div 
                  key={sz} 
                  className="bg-[var(--bg)] border-2 border-[var(--active-color)]/60 focus-within:border-[var(--active-color)] rounded-xl p-2.5 flex flex-col gap-1.5 shadow-xs transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black text-[var(--active-color)]">{sz}°</span>
                    <span className="text-[9px] font-bold text-[var(--text3)]">qoldiq: {avail}</span>
                  </div>
                  <input
                    ref={el => { inputRefs.current[sz] = el; }}
                    type="number"
                    min="0"
                    value={qty === 0 ? '' : qty}
                    onChange={(e) => updateQuantity(sz, parseInt(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, sz)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg text-lg font-black bg-[var(--bg2)] text-[var(--text)] text-center font-mono outline-none focus:border-[var(--active-color)] focus:bg-[var(--bg)] transition-all"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
