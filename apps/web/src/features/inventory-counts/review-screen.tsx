import {
  PERMISSIONS,
  countLabel,
  type CountFinding,
  type InventoryCountReviewDetail,
} from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api-client.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { CountStatusBadge } from './status-badge.tsx';
import {
  useCancelInventoryCount,
  useCountTransition,
  useRegularizeFinding,
} from './use-inventory-counts.ts';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { formatBs, formatDateTime } from '../../lib/format.ts';

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo completar la operación. Intente de nuevo.';
}

function FindingRow({
  countId,
  finding,
  canRegularize,
}: {
  countId: string;
  finding: CountFinding;
  canRegularize: boolean;
}) {
  const regularize = useRegularizeFinding(countId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!note.trim()) {
      setError('Indique cómo se regularizó.');
      return;
    }
    try {
      await regularize.mutateAsync({ findingId: finding.id, note: note.trim() });
      setOpen(false);
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-stone-200 p-3 text-sm">
      <p className="font-medium">
        {finding.type === 'OUT_OF_SCOPE'
          ? `Fuera de alcance: ${finding.sku ?? finding.code} · ${finding.productName ?? ''}`
          : `Código desconocido: ${finding.code}`}{' '}
        <span className="tabular-nums">× {finding.quantity}</span>
        {finding.round === 2 && <span className="text-xs text-stone-500"> (recuento)</span>}
      </p>
      {finding.note && <p className="text-stone-600">Nota del operador: {finding.note}</p>}
      {finding.regularized ? (
        <p className="text-emerald-800">
          Regularizado por {finding.regularizedByName ?? '—'}
          {finding.regularizedAt ? ` el ${formatDateTime(finding.regularizedAt)}` : ''}:{' '}
          {finding.regularizationNote}
        </p>
      ) : (
        canRegularize && (
          <>
            <Button
              variant="secondary"
              aria-expanded={open}
              onClick={() => {
                setOpen(!open);
              }}
            >
              Marcar {finding.code} como regularizado
            </Button>
            {open && (
              <form onSubmit={(event) => void submit(event)} className="space-y-2">
                <label
                  htmlFor={`regularize-${finding.id}`}
                  className="block text-sm font-medium text-stone-700"
                >
                  Nota de regularización de {finding.code}
                </label>
                <input
                  id={`regularize-${finding.id}`}
                  value={note}
                  maxLength={2000}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                  className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={regularize.isPending}>
                  Confirmar regularización
                </Button>
              </form>
            )}
          </>
        )
      )}
    </li>
  );
}

/** Revisión del aprobador: aquí (y solo aquí) se ve el sistema, lo esperado y las diferencias. */
export function ReviewScreen({ count }: { count: InventoryCountReviewDetail }) {
  const canApprove = useHasPermission(PERMISSIONS.INVENTORY_COUNTS_APPROVE);
  const canManage = useHasPermission(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const approve = useCountTransition(count.id, 'approve');
  const cancel = useCancelInventoryCount(count.id);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const inReview = count.status === 'IN_REVIEW';
  const showCosts = count.valueImpact !== null;
  const rows = onlyDifferences ? count.items.filter((item) => item.difference !== 0) : count.items;
  const hasRecount = count.items.some((item) => item.recountQty !== null);

  async function approveNow() {
    setError('');
    if (
      !window.confirm(
        'Al aprobar, el stock cambiará de inmediato según las diferencias y quedará registrado en el historial. ¿Aprobar el conteo?',
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

  async function cancelNow(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await cancel.mutateAsync(reason.trim());
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
          Revisión del conteo {countLabel(count.number)} <CountStatusBadge status={count.status} />
        </h1>
        <p className="text-sm text-stone-600">
          {count.scope ?? 'Sin categoría'} · Iniciado por{' '}
          {count.operatorName ?? count.createdByName}
          {count.startedAt ? ` el ${formatDateTime(count.startedAt)}` : ''}
        </p>
      </div>

      {count.status === 'APPROVED' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Aprobado por {count.approvedByName ?? '—'}
          {count.approvedAt ? ` el ${formatDateTime(count.approvedAt)}` : ''}. El stock ya cambió y
          cada ajuste quedó en el historial de movimientos.
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">Variantes contadas</dt>
          <dd className="text-2xl font-semibold tabular-nums">{count.totalVariants}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">Variantes con diferencia</dt>
          <dd className="text-2xl font-semibold tabular-nums">{count.differencesCount}</dd>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <dt className="text-sm text-stone-500">Diferencia neta (piezas)</dt>
          <dd className="text-2xl font-semibold tabular-nums">{signed(count.netUnits)}</dd>
        </div>
        {showCosts && (
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <dt className="text-sm text-stone-500">Valor de la diferencia</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatBs(count.valueImpact)}</dd>
          </div>
        )}
      </dl>

      <section
        aria-labelledby="review-lines-title"
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="review-lines-title" className="text-lg font-semibold">
            Esperado, conteo y diferencia
          </h2>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyDifferences}
              onChange={(event) => {
                setOnlyDifferences(event.target.checked);
              }}
            />
            Solo con diferencia
          </label>
        </div>
        <p className="text-xs text-stone-500">
          «Esperado» es lo que el sistema tenía cuando se contó cada pieza: si hubo movimientos
          después (p. ej. un ingreso), se conservan y no cuentan como diferencia.
        </p>
        <div className="overflow-x-auto">
          <table className="table-cards w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-600">
                <th className="py-2 pr-3">Variante</th>
                <th className="py-2 pr-3">Sistema (inicio)</th>
                <th className="py-2 pr-3">Esperado</th>
                <th className="py-2 pr-3">Conteo 1</th>
                {hasRecount && <th className="py-2 pr-3">Recuento</th>}
                <th className="py-2 pr-3">Movimientos conciliados</th>
                <th className="py-2 pr-3">Diferencia</th>
                <th className="py-2 pr-3">{inReview ? 'Quedará' : 'Quedó'}</th>
                {showCosts && <th className="py-2">Valor</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.variantId} className="border-b border-stone-100 align-top">
                  <td className="py-3 pr-3">
                    <PieceImage variantId={item.variantId} className="float-left mr-3 size-12" />
                    <span className="block font-medium">{item.productName}</span>
                    <span className="block text-xs text-stone-500">
                      {item.variantLabel && item.variantLabel !== 'Única'
                        ? `${item.variantLabel} · `
                        : ''}
                      <span className="font-mono">{item.sku}</span>
                    </span>
                  </td>
                  <td data-label="Sistema (inicio)" className="py-3 pr-3 tabular-nums">
                    {item.systemQty}
                  </td>
                  <td data-label="Esperado" className="py-3 pr-3 tabular-nums">
                    {item.expectedQty}
                  </td>
                  <td data-label="Conteo 1" className="py-3 pr-3 tabular-nums">
                    {item.countedQty}
                  </td>
                  {hasRecount && (
                    <td data-label="Recuento" className="py-3 pr-3 tabular-nums">
                      {item.recountQty ?? '—'}
                    </td>
                  )}
                  <td data-label="Movimientos conciliados" className="py-3 pr-3 tabular-nums">
                    {item.reconciledMovements === 0 ? '—' : signed(item.reconciledMovements)}
                  </td>
                  <td
                    data-label="Diferencia"
                    className={`py-3 pr-3 font-semibold tabular-nums ${
                      item.difference === 0
                        ? ''
                        : item.difference < 0
                          ? 'text-red-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {signed(item.difference)}
                  </td>
                  <td
                    data-label={inReview ? 'Quedará' : 'Quedó'}
                    className="py-3 pr-3 tabular-nums"
                  >
                    {item.resultingQty}
                  </td>
                  {showCosts && (
                    <td data-label="Valor" className="py-3 tabular-nums">
                      {item.valueImpact === null ? '—' : formatBs(item.valueImpact)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="review-findings-title"
        className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
      >
        <h2 id="review-findings-title" className="text-lg font-semibold">
          Hallazgos
        </h2>
        {count.findings.length === 0 ? (
          <p className="text-sm text-stone-600">No hubo hallazgos.</p>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              No afectan el stock. Márquelos como regularizados cuando se resuelvan manualmente.
            </p>
            <ul className="space-y-2">
              {count.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  countId={count.id}
                  finding={finding}
                  canRegularize={canApprove}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {inReview && (
        <section
          aria-label="Acciones del conteo"
          className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          {count.blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {count.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {!canApprove && (
            <p className="text-sm text-stone-600">
              Esperando la aprobación de quien tenga permiso. El stock no cambia hasta entonces.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {canApprove && (
              <Button
                disabled={approve.isPending || count.blockers.length > 0}
                onClick={() => void approveNow()}
              >
                {approve.isPending ? 'Aprobando…' : 'Aprobar conteo'}
              </Button>
            )}
            {canManage && (
              <Button
                variant="danger"
                aria-expanded={cancelling}
                onClick={() => {
                  setCancelling(!cancelling);
                }}
              >
                Cancelar conteo
              </Button>
            )}
          </div>
          {cancelling && (
            <form onSubmit={(event) => void cancelNow(event)} className="space-y-2">
              <label htmlFor="cancel-reason" className="block text-sm font-medium text-stone-700">
                Motivo de la cancelación (opcional)
              </label>
              <input
                id="cancel-reason"
                value={reason}
                maxLength={2000}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                className="block min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <Button type="submit" variant="danger" disabled={cancel.isPending}>
                Confirmar cancelación
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
