import { PERMISSIONS, adjustmentLabel, type AdjustmentDetail } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCurrentUser, useHasPermission } from '../auth/use-auth.ts';
import { AdjustmentStatusBadge } from './status-badge.tsx';
import {
  useAdjustment,
  useApproveAdjustment,
  useCancelAdjustment,
  useRejectAdjustment,
} from './use-adjustments.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });
const unitCurrency = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo completar la operación. Intente de nuevo.';
}

function Detail({ adjustment }: { adjustment: AdjustmentDetail }) {
  const { data: user } = useCurrentUser();
  const canApprove = useHasPermission(PERMISSIONS.INVENTORY_ADJUST_APPROVE);
  const showCosts = adjustment.items.some((item) => item.unitCost !== null);
  const pending = adjustment.status === 'PENDING';
  const isRequester = !!user && user.id === adjustment.requestedById;

  const approve = useApproveAdjustment(adjustment.id);
  const reject = useRejectAdjustment(adjustment.id);
  const cancel = useCancelAdjustment(adjustment.id);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [error, setError] = useState('');

  async function approveNow() {
    setError('');
    if (
      !window.confirm(
        'Al aprobar, el stock cambiará de inmediato y quedará registrado en el historial. ¿Aprobar el ajuste?',
      )
    ) {
      return;
    }
    try {
      await approve.mutateAsync();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function rejectNow(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!rejectNotes.trim()) {
      setError('Indique el motivo del rechazo.');
      return;
    }
    try {
      await reject.mutateAsync({ notes: rejectNotes.trim() });
      setRejecting(false);
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  async function cancelNow() {
    setError('');
    if (!window.confirm('¿Cancelar esta solicitud? No se registrará ningún movimiento de stock.')) {
      return;
    }
    try {
      await cancel.mutateAsync();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/inventario/ajustes"
          className="inline-flex min-h-10 items-center text-sm text-brand-700 underline"
        >
          ← Ajustes de inventario
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          Ajuste {adjustmentLabel(adjustment.number)}{' '}
          <AdjustmentStatusBadge status={adjustment.status} />
        </h1>
      </div>

      {adjustment.status === 'APPROVED' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Aprobado por {adjustment.resolvedByName ?? '—'}
          {adjustment.resolvedAt ? ` el ${dateTime.format(new Date(adjustment.resolvedAt))}` : ''}.
          El stock ya cambió y cada línea quedó en el historial de movimientos.
        </p>
      )}
      {adjustment.status === 'REJECTED' && (
        <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Rechazado por {adjustment.resolvedByName ?? '—'}
          {adjustment.resolvedAt ? ` el ${dateTime.format(new Date(adjustment.resolvedAt))}` : ''}.
          Motivo: {adjustment.resolutionNotes}. No se registró ningún movimiento de stock.
        </p>
      )}
      {adjustment.status === 'CANCELLED' && (
        <p role="status" className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          La solicitud fue cancelada. No generó movimientos de stock.
        </p>
      )}

      <section
        aria-label="Datos del ajuste"
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Motivo</dt>
            <dd className="font-medium">{adjustment.reasonName}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Solicitado por</dt>
            <dd className="font-medium">
              {adjustment.requestedByName} · {dateTime.format(new Date(adjustment.createdAt))}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-stone-500">Observación</dt>
            <dd className="whitespace-pre-wrap">{adjustment.notes ?? '—'}</dd>
          </div>
          {adjustment.valueImpact !== null && (
            <div>
              <dt className="text-stone-500">Valor de la diferencia</dt>
              <dd className="font-medium tabular-nums">
                {currency.format(Number(adjustment.valueImpact))}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section
        aria-labelledby="adjustment-lines-title"
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <h2 id="adjustment-lines-title" className="text-lg font-semibold">
          Líneas del ajuste
        </h2>
        <div className="overflow-x-auto">
          <table className="table-cards w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="py-2 pr-3">Variante</th>
                <th className="py-2 pr-3">Diferencia</th>
                <th className="py-2 pr-3">
                  {pending ? 'Saldo al solicitar' : 'Cantidad anterior'}
                </th>
                <th className="py-2 pr-3">{pending ? 'Saldo actual' : 'Cantidad nueva'}</th>
                {showCosts && <th className="py-2 pr-3">Costo unitario</th>}
                {showCosts && <th className="py-2">Valor</th>}
              </tr>
            </thead>
            <tbody>
              {adjustment.items.map((item) => (
                <tr key={item.id} className="border-b border-stone-100 align-top">
                  <td className="py-3 pr-3">
                    <span className="block font-medium">{item.productName}</span>
                    <span className="block text-xs text-stone-500">
                      {item.variantLabel && item.variantLabel !== 'Única'
                        ? `${item.variantLabel} · `
                        : ''}
                      <span className="font-mono">{item.sku}</span>
                    </span>
                  </td>
                  <td data-label="Diferencia" className="py-3 pr-3 font-semibold tabular-nums">
                    {signed(item.quantityDelta)}
                  </td>
                  <td
                    data-label={pending ? 'Saldo al solicitar' : 'Cantidad anterior'}
                    className="py-3 pr-3 tabular-nums"
                  >
                    {pending ? item.quantityAtRequest : (item.balanceBefore ?? '—')}
                  </td>
                  <td
                    data-label={pending ? 'Saldo actual' : 'Cantidad nueva'}
                    className="py-3 pr-3 tabular-nums"
                  >
                    {pending ? item.currentQuantity : (item.balanceAfter ?? '—')}
                  </td>
                  {showCosts && (
                    <td data-label="Costo unitario" className="py-3 pr-3 tabular-nums">
                      {item.unitCost === null ? '—' : unitCurrency.format(Number(item.unitCost))}
                    </td>
                  )}
                  {showCosts && (
                    <td data-label="Valor" className="py-3 tabular-nums">
                      {item.valueImpact === null ? '—' : currency.format(Number(item.valueImpact))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {pending && (
        <section
          aria-label="Acciones del ajuste"
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          {adjustment.blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {adjustment.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {!canApprove && (
            <p className="text-sm text-stone-600">
              Esperando la aprobación del Administrador. El stock no cambia hasta entonces.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {canApprove && (
              <>
                <Button
                  disabled={approve.isPending || adjustment.blockers.length > 0}
                  onClick={() => void approveNow()}
                >
                  {approve.isPending ? 'Aprobando…' : 'Aprobar ajuste'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={reject.isPending}
                  onClick={() => {
                    setRejecting(!rejecting);
                  }}
                  aria-expanded={rejecting}
                >
                  Rechazar ajuste
                </Button>
              </>
            )}
            {isRequester && (
              <Button variant="danger" disabled={cancel.isPending} onClick={() => void cancelNow()}>
                Cancelar solicitud
              </Button>
            )}
          </div>
          {canApprove && rejecting && (
            <form onSubmit={(event) => void rejectNow(event)} className="space-y-2">
              <label htmlFor="reject-notes" className="block text-sm font-medium text-stone-700">
                Motivo del rechazo
              </label>
              <textarea
                id="reject-notes"
                value={rejectNotes}
                onChange={(event) => {
                  setRejectNotes(event.target.value);
                }}
                maxLength={2000}
                rows={3}
                required
                className="block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
              <Button type="submit" variant="danger" disabled={reject.isPending}>
                {reject.isPending ? 'Rechazando…' : 'Confirmar rechazo'}
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

export function AdjustmentPage() {
  const { id = '' } = useParams();
  const query = useAdjustment(id);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Cargando ajuste" className="space-y-4">
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
        {notFound ? 'El ajuste no existe.' : 'No se pudo cargar el ajuste.'}{' '}
        <Link to="/inventario/ajustes" className="underline">
          Volver a la lista
        </Link>
      </p>
    );
  }
  return <Detail key={query.data.status} adjustment={query.data} />;
}
