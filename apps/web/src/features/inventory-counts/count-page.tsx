import { PERMISSIONS, countLabel, type InventoryCountBlindDetail } from '@joyeria/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { CaptureScreen } from './capture-screen.tsx';
import { ReviewScreen } from './review-screen.tsx';
import { CountStatusBadge } from './status-badge.tsx';
import {
  useCancelInventoryCount,
  useCountTransition,
  useInventoryCount,
} from './use-inventory-counts.ts';

function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo completar la operación. Intente de nuevo.';
}

/** Borrador y cancelado: sin captura ni revisión. */
function PlainScreen({ count }: { count: InventoryCountBlindDetail }) {
  const canManage = useHasPermission(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const start = useCountTransition(count.id, 'start');
  const cancel = useCancelInventoryCount(count.id);
  const [error, setError] = useState('');
  const draft = count.status === 'DRAFT';

  async function startNow() {
    setError('');
    try {
      await start.mutateAsync();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function cancelNow() {
    setError('');
    if (!window.confirm('¿Cancelar este conteo?')) return;
    try {
      await cancel.mutateAsync('');
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/inventario/conteos"
          className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
        >
          ← Conteos físicos
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          Conteo {countLabel(count.number)} <CountStatusBadge status={count.status} />
        </h1>
        <p className="text-sm text-stone-600">{count.scope ?? 'Sin categoría'}</p>
      </div>
      {count.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          El conteo fue cancelado. No generó movimientos de stock.
        </p>
      )}
      {draft && (
        <section
          aria-label="Inicio del conteo"
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          <p className="text-sm text-stone-600">
            Al iniciar se toma la foto del sistema y quien inicia queda como único operador de la
            captura. La tienda puede seguir operando: los movimientos que ocurran durante el conteo
            se concilian al aprobar.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-3">
              <Button disabled={start.isPending} onClick={() => void startNow()}>
                {start.isPending ? 'Iniciando…' : 'Iniciar conteo'}
              </Button>
              <Button variant="danger" disabled={cancel.isPending} onClick={() => void cancelNow()}>
                Cancelar conteo
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function CountPage() {
  const { id = '' } = useParams();
  const query = useInventoryCount(id);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Cargando conteo" className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <p role="alert" className="py-6 text-sm text-red-700">
        {notFound ? 'El conteo no existe.' : 'No se pudo cargar el conteo.'}{' '}
        <Link to="/inventario/conteos" className="underline">
          Volver a la lista
        </Link>
      </p>
    );
  }
  const count = query.data;
  if (count.view === 'REVIEW') return <ReviewScreen key={count.status} count={count} />;
  if (count.status === 'IN_PROGRESS' || count.status === 'RECOUNT') {
    return <CaptureScreen key={count.status} count={count} />;
  }
  return <PlainScreen key={count.status} count={count} />;
}
