import React, { useMemo } from 'react';
import { 
  Wallet, 
  DollarSign, 
  CreditCard, 
  Building2, 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck,
  Zap,
  Wifi,
  Cpu
} from 'lucide-react';
import { KassaTuri, KassaBalansi, KassaHarakati } from '../../types';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';

interface AppleCardWalletsProps {
  balansi?: KassaBalansi;
  kassaBalansi?: KassaBalansi;
  valyutaKursi: number;
  harakatlar?: KassaHarakati[];
  kassaHarakatlari?: KassaHarakati[];
  isAdmin?: boolean;
  onOpenIncome: (kassaTuri?: KassaTuri) => void;
  onOpenExpense: (kassaTuri?: KassaTuri) => void;
  onOpenTransfer: (sourceKassa?: KassaTuri) => void;
  onEditBalance?: () => void;
}

export const AppleCardWallets: React.FC<AppleCardWalletsProps> = ({
  balansi,
  kassaBalansi: propKassaBalansi,
  valyutaKursi,
  harakatlar,
  kassaHarakatlari: propKassaHarakatlari,
  isAdmin,
  onOpenIncome,
  onOpenExpense,
  onOpenTransfer,
  onEditBalance
}) => {
  const kassaBalansi = propKassaBalansi || balansi || { naqd_uzs: 0, naqd_usd: 0, karta_uzs: 0, bank_uzs: 0 };
  const kassaHarakatlari = propKassaHarakatlari || harakatlar || [];
  // Oxirgi 7 kunlik harakatlar tahlili va har bir kassa uchun mini sparkline yaratish
  const sparklineData = useMemo(() => {
    const today = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const computeKassaTrend = (kassaId: KassaTuri) => {
      let net24h = 0;
      const todayStr = days[days.length - 1];
      const yesterdayStr = days[days.length - 2];

      const dailyFlows = days.map(dayStr => {
        let net = 0;
        kassaHarakatlari.forEach(h => {
          if (h.sana === dayStr && h.kassaTuri === kassaId) {
            const amount = h.valyuta === 'USD' ? h.summa : h.summa;
            if (h.tur === 'kirim') net += amount;
            else net -= amount;
          }
        });
        return net;
      });

      // 24h net
      kassaHarakatlari.forEach(h => {
        if (h.sana === todayStr && h.kassaTuri === kassaId) {
          const amount = h.valyuta === 'USD' ? h.summa : h.summa;
          if (h.tur === 'kirim') net24h += amount;
          else net24h -= amount;
        }
      });

      return { dailyFlows, net24h };
    };

    return {
      naqd_uzs: computeKassaTrend('naqd_uzs'),
      naqd_usd: computeKassaTrend('naqd_usd'),
      karta_uzs: computeKassaTrend('karta_uzs'),
      bank_uzs: computeKassaTrend('bank_uzs'),
    };
  }, [kassaHarakatlari]);

  // Mini Sparkline SVG chizish yordamchisi
  const renderSparkline = (data: number[], strokeColor: string, fillColor: string) => {
    if (!data || data.length === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 100;
    const height = 28;
    const padding = 2;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    const fillPath = `${points} ${width - padding},${height} ${padding},${height}`;

    return (
      <svg className="w-24 h-7 overflow-visible opacity-85" viewBox={`0 0 ${width} ${height}`}>
        <polygon points={fillPath} fill={fillColor} opacity={0.25} />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const cards = [
    {
      id: 'naqd_uzs' as KassaTuri,
      name: "Naqd Pul (UZS)",
      subtitle: "Asosiy Savdo Kassasi",
      balanceStr: `${Number(kassaBalansi.naqd_uzs || 0).toLocaleString()}`,
      currency: "UZS",
      secondaryText: "To'g'ridan-to'g'ri naqd tushumlar",
      icon: Wallet,
      badge: "CASH WALLET",
      gradient: "from-[#0d2818] via-[#09351e] to-[#041a0f] border-emerald-500/30 text-emerald-100",
      accentBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
      sparkColor: "#10b981",
      sparkFill: "#10b981",
      glowColor: "shadow-emerald-500/10",
      patternColor: "rgba(16, 185, 129, 0.08)",
      trend: sparklineData.naqd_uzs
    },
    {
      id: 'naqd_usd' as KassaTuri,
      name: "Valyuta Kassasi (USD)",
      subtitle: "AQSH Dollari Zaxirasi",
      balanceStr: `$${Number(kassaBalansi.naqd_usd || 0).toLocaleString()}`,
      currency: "USD",
      secondaryText: `≈ ${(Number(kassaBalansi.naqd_usd || 0) * valyutaKursi).toLocaleString()} UZS`,
      icon: DollarSign,
      badge: "GLOBAL FX",
      gradient: "from-[#0d1f3c] via-[#0b2b5c] to-[#07162c] border-blue-500/30 text-blue-100",
      accentBg: "bg-blue-500/20 text-blue-400 border-blue-500/40",
      sparkColor: "#3b82f6",
      sparkFill: "#3b82f6",
      glowColor: "shadow-blue-500/10",
      patternColor: "rgba(59, 130, 246, 0.08)",
      trend: sparklineData.naqd_usd
    },
    {
      id: 'karta_uzs' as KassaTuri,
      name: "Karta (Uzcard / Humo)",
      subtitle: "POS & QR Terminal",
      balanceStr: `${Number(kassaBalansi.karta_uzs || 0).toLocaleString()}`,
      currency: "UZS",
      secondaryText: "Payme / Click / Humo tushumlari",
      icon: CreditCard,
      badge: "DIGITAL CARD",
      gradient: "from-[#1e1338] via-[#2c1a54] to-[#120a24] border-purple-500/30 text-purple-100",
      accentBg: "bg-purple-500/20 text-purple-400 border-purple-500/40",
      sparkColor: "#a855f7",
      sparkFill: "#a855f7",
      glowColor: "shadow-purple-500/10",
      patternColor: "rgba(168, 85, 247, 0.08)",
      trend: sparklineData.karta_uzs
    },
    {
      id: 'bank_uzs' as KassaTuri,
      name: "Bank Hisob Raqami",
      subtitle: "Korporativ / Perechisleniye",
      balanceStr: `${Number(kassaBalansi.bank_uzs || 0).toLocaleString()}`,
      currency: "UZS",
      secondaryText: "Shartnoma & B2B to'lovlar",
      icon: Building2,
      badge: "IBAN B2B",
      gradient: "from-[#1c2430] via-[#253243] to-[#141b24] border-slate-500/30 text-slate-100",
      accentBg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
      sparkColor: "#06b6d4",
      sparkFill: "#06b6d4",
      glowColor: "shadow-cyan-500/10",
      patternColor: "rgba(6, 182, 212, 0.08)",
      trend: sparklineData.bank_uzs
    }
  ];

  return (
    <div className="space-y-3">
      {/* SECTION TITLE & TOTAL GLANCE */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text2)]">
            Kassa Hamyonlari & Real-Vaqt Balanslari (Apple / Revolut Style)
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)] font-medium">
          <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          <span>Real-vaqt sinxronizatsiyasi</span>
        </div>
      </div>

      {/* 4 REVOLUT / APPLE CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isPositive24h = (card.trend?.net24h || 0) >= 0;

          return (
            <motion.div
              key={card.id}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className={cn(
                "relative rounded-3xl p-5 border shadow-lg overflow-hidden flex flex-col justify-between bg-gradient-to-br transition-all select-none min-h-[220px]",
                card.gradient,
                card.glowColor
              )}
            >
              {/* Modern Glass Background Decor & Microchip */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: `radial-gradient(circle at 15% 15%, ${card.patternColor} 0%, transparent 60%), radial-gradient(circle at 85% 85%, ${card.patternColor} 0%, transparent 60%)`
                }}
              />

              {/* CARD TOP ROW: Chip, Badge, NFC icon */}
              <div className="relative z-10 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  {/* EMV Metallic Chip Visual */}
                  <div className="w-9 h-7 rounded-lg bg-gradient-to-tr from-amber-400/30 via-yellow-200/40 to-amber-500/20 border border-amber-300/40 p-1 flex items-center justify-center shadow-inner">
                    <Cpu className="w-4 h-4 text-amber-300/80" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-75">
                      {card.badge}
                    </span>
                    <h4 className="text-sm font-black tracking-tight leading-none mt-0.5 text-white">
                      {card.name}
                    </h4>
                  </div>
                </div>

                <div className={cn("p-2 rounded-2xl border backdrop-blur-md", card.accentBg)}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              {/* CARD MIDDLE: Balance, Secondary Value & Sparkline */}
              <div className="relative z-10 my-3">
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                  {card.subtitle}
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black tracking-tight font-mono text-white drop-shadow-sm">
                    {card.balanceStr}
                  </span>
                  <span className="text-xs font-black opacity-80 font-mono">
                    {card.currency}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10 text-[11px]">
                  <span className="opacity-75 font-medium truncate max-w-[130px]">
                    {card.secondaryText}
                  </span>
                  
                  {/* Mini Sparkline Trend */}
                  <div className="flex items-center gap-1.5">
                    {renderSparkline(card.trend.dailyFlows, card.sparkColor, card.sparkFill)}
                  </div>
                </div>
              </div>

              {/* CARD FOOTER: 24h Trend Stat & 1-Click Interactive Buttons */}
              <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                
                {/* 24h indicator */}
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  {isPositive24h ? (
                    <span className="text-emerald-400 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" />
                      +{Math.abs(card.trend.net24h).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-0.5">
                      <TrendingDown className="w-3 h-3" />
                      -{Math.abs(card.trend.net24h).toLocaleString()}
                    </span>
                  )}
                  <span className="opacity-50 font-normal">/24s</span>
                </div>

                {/* 3 Quick Action Micro Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenIncome(card.id);
                    }}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-emerald-500 hover:text-white text-white/90 border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
                    title={`${card.name} ga Kirim kiritish`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenExpense(card.id);
                    }}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-rose-500 hover:text-white text-white/90 border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
                    title={`${card.name} dan Chiqim/Xarajat`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTransfer(card.id);
                    }}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-purple-500 hover:text-white text-white/90 border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
                    title={`${card.name} dan boshqa kassaga o'tkazma / konvertatsiya`}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
