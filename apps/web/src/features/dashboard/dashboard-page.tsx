import { PERMISSIONS } from '@joyeria/shared';
import { Boxes, PackageCheck, PackageX, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { useCurrentUser, useHasPermission } from '../auth/use-auth.ts';
import { AttentionTable } from './attention-table.tsx';
import { CatalogHealthNotice } from './catalog-health-notice.tsx';
import { StatCard } from './stat-card.tsx';
import { StockDonut } from './stock-donut.tsx';
import { useAttentionItems, useStockSummary } from './use-dashboard.ts';

const today = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const card = 'rounded-xl border border-stone-200 bg-white p-5 shadow-sm shadow-black/5';

/** Marcador mientras se resuelve la sesión: mismas alturas que el contenido final (sin saltos). */
function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando panel" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl sm:h-[156px]" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

/**
 * Dashboard principal. Solo usa datos que la API ya expone (`/inventory`) y respeta permisos:
 * sin `inventory:read` muestra únicamente el saludo. No incluye costos (P-02).
 */
export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const canReadInventory = useHasPermission(PERMISSIONS.INVENTORY_READ);
  const stock = useStockSummary(canReadInventory);
  const attention = useAttentionItems(canReadInventory);
  const summary = stock.summary;
  const total = summary?.total ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-balance text-stone-900">
          Bienvenido/a, {user?.name}
        </h1>
        <p className="text-sm text-stone-500 first-letter:capitalize">{today.format(new Date())}</p>
      </header>

      <CatalogHealthNotice />

      {!user ? (
        <DashboardSkeleton />
      ) : !canReadInventory ? (
        <div className={card}>
          <p className="font-medium text-stone-900">Tu cuenta no incluye métricas de inventario.</p>
          <p className="mt-1 text-sm text-stone-500">
            Usa el menú lateral para acceder a las secciones disponibles para ti.
          </p>
        </div>
      ) : (
        <>
          {stock.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span>No se pudieron cargar las métricas de inventario.</span>
              <button
                type="button"
                onClick={() => void stock.refetch()}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium transition-all duration-200 ease-out hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
              >
                Reintentar
              </button>
            </div>
          )}

          <section
            aria-label="Métricas principales"
            className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
          >
            <StatCard
              label="Variantes activas"
              icon={Boxes}
              tone="neutral"
              value={summary?.total}
              share={1}
              caption="Piezas controladas en inventario"
            />
            <StatCard
              label="Disponibles"
              icon={PackageCheck}
              tone="ok"
              value={summary?.ok}
              share={total > 0 ? (summary?.ok ?? 0) / total : 0}
              caption="Por encima de su mínimo"
            />
            <StatCard
              label="Bajo mínimo"
              icon={TriangleAlert}
              tone="warn"
              value={summary?.low}
              share={total > 0 ? (summary?.low ?? 0) / total : 0}
              caption="Con stock, pendientes de reponer"
            />
            <StatCard
              label="Sin stock"
              icon={PackageX}
              tone="danger"
              value={summary?.out}
              share={total > 0 ? (summary?.out ?? 0) / total : 0}
              caption="Agotadas"
            />
          </section>

          <div className="grid items-start gap-4 @4xl:grid-cols-3">
            <section aria-labelledby="distribution-title" className={`${card} @4xl:col-span-1`}>
              <h2 id="distribution-title" className="mb-4 text-sm font-semibold text-stone-900">
                Distribución del stock
              </h2>
              <StockDonut summary={summary} />
            </section>

            <section
              aria-labelledby="attention-title"
              className={`${card} min-w-0 @4xl:col-span-2`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="attention-title" className="text-sm font-semibold text-stone-900">
                  Piezas que requieren atención
                </h2>
                <Link
                  to="/inventario"
                  className="inline-flex min-h-10 items-center rounded-md px-1 text-xs font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                >
                  Ir a Inventario
                </Link>
              </div>
              <AttentionTable
                items={attention.items}
                expectedTotal={summary ? summary.low + summary.out : undefined}
                isPending={attention.isPending}
                isError={attention.isError}
                onRetry={() => void attention.refetch()}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
