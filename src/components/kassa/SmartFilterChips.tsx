import React from 'react';
import { 
  Sparkles, 
  DollarSign, 
  Banknote, 
  TrendingUp, 
  ArrowRightLeft, 
  Users, 
  Building, 
  Calendar,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type SmartFilterTag = 
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'usd_only'
  | 'uzs_only'
  | 'large_amount' // > 10,000,000 UZS
  | 'salary'
  | 'factory'
  | 'rent'
  | 'debt_payment'
  | 'transfers';

interface SmartFilterChipsProps {
  activeTag: SmartFilterTag;
  onSelectTag: (tag: SmartFilterTag) => void;
  counts?: Record<SmartFilterTag, number>;
}

export const SMART_FILTER_TAGS: { 
  id: SmartFilterTag; 
  label: string; 
  icon: any; 
  badgeColor?: string 
}[] = [
  { id: 'all', label: 'Barchasi', icon: Layers },
  { id: 'today', label: 'Bugun', icon: Calendar },
  { id: 'yesterday', label: 'Kecha', icon: Calendar },
  { id: 'this_week', label: 'Ushbu Hafta', icon: Calendar },
  { id: 'usd_only', label: 'Faqat Dollar ($)', icon: DollarSign, badgeColor: 'text-blue-500' },
  { id: 'uzs_only', label: 'Faqat So\'m (UZS)', icon: Banknote, badgeColor: 'text-emerald-500' },
  { id: 'large_amount', label: 'Katta Summali (>10 mln)', icon: TrendingUp, badgeColor: 'text-amber-500' },
  { id: 'salary', label: 'Faqat Ish Haqi', icon: Users, badgeColor: 'text-rose-500' },
  { id: 'factory', label: 'Fabrika & Xomashyo', icon: ShoppingBag, badgeColor: 'text-orange-500' },
  { id: 'rent', label: 'Faqat Ijara', icon: Building, badgeColor: 'text-pink-500' },
  { id: 'debt_payment', label: 'Nasiya / To\'lovlar', icon: Sparkles, badgeColor: 'text-indigo-500' },
  { id: 'transfers', label: 'O\'tkazma & Konvertatsiya', icon: ArrowRightLeft, badgeColor: 'text-purple-500' },
];

export const SmartFilterChips: React.FC<SmartFilterChipsProps> = ({
  activeTag,
  onSelectTag,
  counts
}) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar">
      {SMART_FILTER_TAGS.map((tag) => {
        const Icon = tag.icon;
        const isActive = activeTag === tag.id;
        const count = counts ? counts[tag.id] : undefined;

        return (
          <button
            key={tag.id}
            onClick={() => onSelectTag(tag.id)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border select-none whitespace-nowrap",
              isActive
                ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-500/20"
                : "bg-[var(--bg)] border-[var(--border)] text-[var(--text2)] hover:border-purple-500/30 hover:text-[var(--text)]"
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-white" : tag.badgeColor || "text-[var(--text3)]")} />
            <span>{tag.label}</span>
            {count !== undefined && count > 0 && (
              <span className={cn(
                "px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold",
                isActive ? "bg-white/20 text-white" : "bg-[var(--bg2)] text-[var(--text3)]"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
