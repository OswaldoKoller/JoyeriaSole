import { PERMISSIONS } from '@joyeria/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useHasPermission } from '../auth/use-auth.ts';
import { HistoryPanel } from './history-panel.tsx';
import { PendingPanel } from './pending-panel.tsx';
import { PriceGrid } from './price-grid.tsx';
import { usePendingCount } from './use-pricing.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

type Tab = 'precios' | 'pendientes' | 'historial';

/**
 * Precios de venta (ADR-018): precio manual por variante con el panel de costos, solicitudes del
 * Responsable, aprobación del Administrador e historial. Precio neto, en bolivianos.
 */
export function PricingPage() {
  useDocumentTitle('Precios');
  const canApprove = useHasPermission(PERMISSIONS.PRICES_APPROVE);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    params.get('tab') === 'pendientes' ? 'pendientes' : 'precios',
  );
  const pendingCount = usePendingCount(canApprove);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'precios', label: 'Precios' },
    {
      id: 'pendientes',
      label:
        canApprove && pendingCount.data
          ? `Pendientes (${String(pendingCount.data)})`
          : 'Pendientes',
    },
    { id: 'historial', label: 'Historial' },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Precios de venta</h1>
        <p className="text-sm text-stone-600">
          Usted define el precio de cada ítem a mano, mirando su costo. Los precios son netos (antes
          de impuestos) y están en bolivianos. Un precio en cero se marca «Sin precio»: no se podrá
          vender hasta tener precio.
        </p>
      </div>

      <div role="tablist" aria-label="Secciones de precios" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => {
              setTab(item.id);
            }}
            className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              tab === item.id
                ? 'bg-brand-700 text-white'
                : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'precios' && <PriceGrid initialSearch={params.get('q') ?? ''} />}
        {tab === 'pendientes' && <PendingPanel />}
        {tab === 'historial' && <HistoryPanel />}
      </div>
    </section>
  );
}
