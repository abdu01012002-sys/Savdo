import React from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart as RePieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

interface VozvratBrakAnalyticsChartsProps {
  analyticsData: {
    topDefectiveModels: Array<{
      model: string;
      vozvrat: number;
      brak: number;
      total?: number;
    }>;
    pieNuqsonData: Array<{
      name: string;
      value: number;
    }>;
    pieSababData?: Array<{
      name: string;
      value: number;
    }>;
  };
}

export const VozvratBrakAnalyticsCharts: React.FC<VozvratBrakAnalyticsChartsProps> = ({ analyticsData }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Defective Models */}
        <div className="p-6 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-rose-500" />
              <span>Eng ko'p qaytgan & nuqsonli modellar (Top 7)</span>
            </h3>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Ishlab chiqarish va sifat nazorati uchun modellar kesimida ko'rsatkich
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData.topDefectiveModels} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="model" tick={{ fontSize: 10, fill: 'var(--text3)' }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', borderRadius: '12px', color: 'var(--text)' }} 
                />
                <Legend />
                <Bar dataKey="vozvrat" name="Mijoz Vozvrati (Juft)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="brak" name="Brak (Juft)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Nuqson Turlari Tuzilishi */}
        <div className="p-6 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-amber-500" />
              <span>Nuqson Sabablari Strukturasi</span>
            </h3>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Qaysi turdagi nosozliklar ko'proq uchramoqda
            </p>
          </div>

          <div className="h-72 w-full flex items-center justify-center">
            {analyticsData.pieNuqsonData.length === 0 ? (
              <div className="text-xs text-[var(--text3)]">Ma'lumotlar yetarli emas</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={analyticsData.pieNuqsonData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {analyticsData.pieNuqsonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', borderRadius: '12px', color: 'var(--text)' }} 
                  />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VozvratBrakAnalyticsCharts;
