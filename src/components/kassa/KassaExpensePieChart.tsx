import React from 'react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as RechartsTooltip 
} from 'recharts';

const PIE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', 
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'
];

interface KassaExpensePieChartProps {
  expensePieData: Array<{
    name: string;
    value: number;
  }>;
}

export const KassaExpensePieChart: React.FC<KassaExpensePieChartProps> = ({ expensePieData }) => {
  if (!expensePieData || expensePieData.length === 0) {
    return (
      <div className="h-[280px] w-full flex items-center justify-center text-xs text-[var(--text3)] font-bold">
        Ma'lumotlar yo'q
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={expensePieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
          >
            {expensePieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              backgroundColor: 'var(--bg2)',
              borderColor: 'var(--border)',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'var(--text)'
            }}
            formatter={(val: any) => [`${Number(val).toLocaleString()} UZS`]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default KassaExpensePieChart;
