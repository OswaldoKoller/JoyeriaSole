import { PERMISSIONS, type PriceChange } from '@joyeria/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useCurrentUser, useHasPermission } from '../auth/use-auth.ts';
import { formatBsPrecise, formatDateTime } from '../../lib/format.ts';
import { ProfitDisplay } from './profit-display.tsx';
import {
  useApproveChanges,
  useCancelChange,
  usePendingChanges,
  useRejectChanges,
} from './use-pricing.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';

/** Ids que la API señala como causa de un rechazo de lote (`error.details.ids`). */
function offendingIds(cause: unknown): string[] {
  if (!(cause instanceof ApiError)) return [];
  const details = cause.details;
  if (details && typeof details === 'object' && 'ids' in details && Array.isArray(details.ids)) {
    return details.ids.filter((id): id is string => typeof id === 'string');
  }
  return [];
}

/**
 * Solicitudes de precio pendientes. El Administrador las aprueba o rechaza una a una o en masa
 * (el rechazo exige comentario); el Responsable ve las suyas y puede cancelarlas (D4).
 */
export function PendingPanel() {
  const canApprove = useHasPermission(PERMISSIONS.PRICES_APPROVE);
  const { data: me } = useCurrentUser();
  const pending = usePendingChanges();
  const approve = useApproveChanges();
  const reject = useRejectChanges();
  const cancel = useCancelChange();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stale, setStale] = useState<Set<string>>(new Set());
  const rows = pending.data?.data ?? [];
  const showCosts = rows.some((row) => row.costSnapshot !== null);
  const ids = rows.filter((row) => selected.has(row.id)).map((row) => row.id);
  const busy = approve.isPending || reject.isPending || cancel.isPending;

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function clear() {
    setSelected(new Set());
    setRejecting(false);
    setComment('');
    setStale(new Set());
  }

  async function onApprove() {
    setMessage('');
    setError('');
    setStale(new Set());
    try {
      await approve.mutateAsync(ids);
      setMessage(
        ids.length === 1
          ? 'Se aprobó 1 cambio de precio.'
          : `Se aprobaron ${String(ids.length)} cambios de precio.`,
      );
      clear();
    } catch (cause) {
      setStale(new Set(offendingIds(cause)));
      setError(
        cause instanceof Error
          ? `${cause.message}. No se aplicó ningún cambio de este lote.`
          : 'No se pudo aprobar',
      );
    }
  }

  async function onReject() {
    setMessage('');
    setError('');
    if (comment.trim().length < 3) {
      setError('Indique el motivo del rechazo (obligatorio).');
      return;
    }
    try {
      await reject.mutateAsync({ ids, comment: comment.trim() });
      setMessage(
        ids.length === 1
          ? 'Se rechazó 1 solicitud.'
          : `Se rechazaron ${String(ids.length)} solicitudes.`,
      );
      clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo rechazar');
    }
  }

  async function onCancel(row: PriceChange) {
    setMessage('');
    setError('');
    try {
      await cancel.mutateAsync(row.id);
      setMessage(`Se canceló la solicitud de ${row.sku}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cancelar la solicitud');
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        {pending.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando solicitudes…
          </p>
        )}
        {pending.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar las solicitudes.
          </p>
        )}
        {pending.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No hay cambios de precio pendientes.</p>
        )}
        {pending.isSuccess && rows.length > 0 && (
          <>
            {canApprove && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.size === rows.length}
                    onChange={(event) => {
                      toggleAll(event.target.checked);
                    }}
                  />
                  Seleccionar todas
                </label>
                <Button disabled={busy || ids.length === 0} onClick={() => void onApprove()}>
                  Aprobar seleccionadas ({ids.length})
                </Button>
                <Button
                  variant="danger"
                  disabled={busy || ids.length === 0}
                  onClick={() => {
                    setRejecting(true);
                  }}
                >
                  Rechazar seleccionadas…
                </Button>
              </div>
            )}
            {canApprove && rejecting && (
              <div className="mb-4 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <label htmlFor="reject-comment" className="block text-sm font-medium">
                  Motivo del rechazo (obligatorio)
                </label>
                <textarea
                  id="reject-comment"
                  value={comment}
                  maxLength={500}
                  onChange={(event) => {
                    setComment(event.target.value);
                  }}
                  className="block min-h-20 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy} onClick={() => void onReject()}>
                    Confirmar rechazo ({ids.length})
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRejecting(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="table-cards w-full text-left text-sm">
                <caption className="sr-only">Cambios de precio pendientes de aprobación</caption>
                <thead>
                  <tr className="border-b border-stone-200 text-stone-600">
                    <th className="py-2 pr-3">Ítem</th>
                    <th className="py-2 pr-3">Solicitó</th>
                    <th className="py-2 pr-3">Precio vigente</th>
                    <th className="py-2 pr-3">Precio solicitado</th>
                    {showCosts && <th className="py-2 pr-3">Costo total</th>}
                    {showCosts && <th className="py-2 pr-3">Ganancia solicitada</th>}
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 align-top">
                      <td className="py-3 pr-3">
                        <label className="flex items-start gap-2">
                          {canApprove && (
                            <input
                              type="checkbox"
                              className="mt-1 size-4"
                              checked={selected.has(row.id)}
                              onChange={(event) => {
                                toggle(row.id, event.target.checked);
                              }}
                              aria-label={`Seleccionar solicitud de ${row.sku}`}
                            />
                          )}
                          <span>
                            <PieceImage
                              variantId={row.variantId}
                              className="float-left mr-3 size-12"
                            />
                            <span className="block font-medium">{row.productName}</span>
                            <span className="block text-xs font-normal text-stone-500">
                              {row.variantLabel && row.variantLabel !== 'Única'
                                ? `${row.variantLabel} · `
                                : ''}
                              <span className="font-mono">{row.sku}</span>
                            </span>
                            {stale.has(row.id) && (
                              <span className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                Obsoleta: el precio vigente cambió
                              </span>
                            )}
                          </span>
                        </label>
                      </td>
                      <td data-label="Solicitó" className="py-3 pr-3">
                        {row.requestedBy.name}
                      </td>
                      <td data-label="Precio vigente" className="py-3 pr-3 tabular-nums">
                        {formatBsPrecise(row.previousPrice)}
                      </td>
                      <td
                        data-label="Precio solicitado"
                        className="py-3 pr-3 font-medium tabular-nums"
                      >
                        {formatBsPrecise(row.newPrice)}
                      </td>
                      {showCosts && (
                        <td data-label="Costo total" className="py-3 pr-3 tabular-nums">
                          {formatBsPrecise(row.costSnapshot)}
                        </td>
                      )}
                      {showCosts && (
                        <td data-label="Ganancia solicitada" className="py-3 pr-3">
                          <ProfitDisplay
                            price={row.newPrice}
                            totalCost={row.costSnapshot}
                            label="del precio solicitado"
                          />
                        </td>
                      )}
                      <td data-label="Motivo" className="py-3 pr-3">
                        {row.reason ?? '—'}
                      </td>
                      <td data-label="Fecha" className="py-3 pr-3">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="py-3">
                        {row.requestedBy.id === me?.id ? (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            aria-label={`Cancelar solicitud de ${row.sku}`}
                            onClick={() => void onCancel(row)}
                          >
                            Cancelar solicitud
                          </Button>
                        ) : (
                          <span className="text-xs text-stone-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
