import React, { useState, lazy, Suspense } from 'react';
import { useDb } from '../context/DbContext';
import { KontragentlarView } from '../components/KontragentlarView';
import { Kontragent } from '../types';
import { BarChart3 } from 'lucide-react';

const LazyKontragentAnaliz = lazy(() => import('../components/KontragentAnaliz'));

export default function MijozlarPage() {
  const { db } = useDb();
  const [selectedKontragent, setSelectedKontragent] = useState<Kontragent | null>(null);

  if (selectedKontragent) {
    return (
      <div className="w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <Suspense fallback={
          <div className="w-full min-h-[400px] rounded-2xl bg-[var(--bg2)]/60 animate-pulse border border-[var(--border)] flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-[var(--text3)] animate-pulse" />
          </div>
        }>
          <LazyKontragentAnaliz
            kontragent={selectedKontragent}
            db={db}
            onClose={() => setSelectedKontragent(null)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <KontragentlarView onSelectClient={(k) => setSelectedKontragent(k)} />
    </div>
  );
}
