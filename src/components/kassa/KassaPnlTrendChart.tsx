import React from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend 
} from 'recharts';
import { formatCompact } from '../../lib/utils';

interface KassaPnlTrendChartProps {
  pnlChartData: Array<{
    sana: string;
    tushum: number;
    xarajat: number;
    foyda: number;
  }>;
}

export const KassaPnlTrendChart: React.FC<KassaPnlTrendChartProps> = ({ pnlChartData }) => {
  if (!pnlChartData || pnlChartData.length === 0) {
    return (
      <div className="h-full min-h-[260px] flex items-center justify-center text-xs text-[var(--text3)] font-bold">
        Tanlangan oraliq bo'yicha ma'lumotlar mavjud emas
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pnlChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="sana" stroke="var(--text3)" fontSize={11} tickLine={false} />
          <YAxis stroke="var(--text3)" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: 'var(--bg2)', 
              borderColor: 'var(--border)', 
              borderRadius: '12px', 
              color: 'var(--text)', 
              fontSize: '12px', 
              fontWeight: 'bold' 
            }} 
            formatter={(val: any) => [`${Number(val).toLocaleString()} UZS`]} 
          />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          <Bar dataKey="tushum" name="Yalpi Tushum" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="xarajat" name="Xarajat (OpEx)" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="foyda" name="Sof Foyda" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default KassaPnlTrendChart;
