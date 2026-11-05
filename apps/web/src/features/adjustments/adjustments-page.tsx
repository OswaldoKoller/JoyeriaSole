import { PERMISSIONS, adjustmentLabel, type AdjustmentSummary } from '@joyeria/shared';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useHasPermission } from '../auth/use-auth.ts';
import { AdjustmentStatusBadge } from './status-badge.tsx';
import { searchInventory, useAdjustments, usePendingAdjustmentsCount } from './use-adjustments.ts';

const currency = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' });
const dateTime = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  dateStyle: 'short',
  timeStyle: 'short',
});

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function AdjustmentRow({
  adjustment,
  showValue,
}: {
  adjustment: AdjustmentSummary;
  showValue: boolean;
}) {
  return (
    <tr className="border-b border-stone-100">
      <td className="py-3 pr-4 font-medium">
        <Link
          to={`/inventario/ajustes/${adjustment.id}`}
          aria-label={`Abrir ajuste ${adjustmentLabel(adjustment.number)}`}
          className="inline-flex min-h-10 items-center text-brand-700 underline"
        >
          {adjustmentLabel(adjustment.number)}
        </Link>
      </td>
      <td data-label="Motivo" className="py-3 pr-4">
        {adjustment.reasonName}
      </td>
      <td data-label="Líneas" className="py-3 pr-4">
        {adjustment.itemsCount}
      </td>
      <td data-label="Diferencia" className="py-3 pr-4 font-medium tabular-nums">
        {signed(adjustment.netUnits)} pzs
      </td>
      {showValue && (
        <td data-label="Valor" className="py-3 pr-4 tabular-nums">
          {adjustment.valueImpact === null ? '—' : currency.format(Number(adjustment.valueImpact))}
        </td>
      )}
      <td data-label="Solicitó" className="py-3 pr-4">
        {adjustment.requestedByName}
      </td>
      <td data-label="Estado" className="py-3 pr-4">
        <AdjustmentStatusBadge status={adjustment.status} />
      </td>
      <td data-label="Fecha" className="py-3">
        {dateTime.format(new Date(adjustment.createdAt))}
      </td>
    </tr>
  );
}

export function AdjustmentsPage() {
  const canApprove = useHasPermission(PERMISSIONS.INVENTORY_ADJUST_APPROVE);
  const canSeeCosts = useHasPermission(PERMISSIONS.COSTS_READ);
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(
    searchParams.get('estado') === 'PENDING' ? 'PENDING' : 'all',
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skuDraft, setSkuDraft] = useState('');
  const [variantFilter, setVariantFilter] = useState<{ id: string; sku: string } | null>(null);
  const [skuError, setSkuError] = useState('');
  const list = useAdjustments({ page, status, variantId: variantFilter?.id ?? '', from, to });
  const pending = usePendingAdjustmentsCount(canApprove);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  async function applySku(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = skuDraft.trim();
    setSkuError('');
    if (!term) {
      setVariantFilter(null);
      setPage(1);
      return;
    }
    try {
      const found = await searchInventory(term);
      const exact = found.find((item) => item.sku === term || item.barcode === term);
      const match = exact ?? (found.length === 1 ? found[0] : undefined);
      if (!match) {
        setSkuError('No se encontró una única variante con ese SKU o código.');
        return;
      }
      setVariantFilter({ id: match.variantId, sku: match.sku });
      setPage(1);
    } catch {
      setSkuError('No se pudo buscar la variante.');
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ajustes de inventario</h1>
          <p className="text-sm text-stone-600">
            Correcciones manuales de stock. El Responsable solicita; el stock solo cambia cuando el
            Administrador aprueba.
          </p>
        </div>
        <Link
          to="/inventario/ajustes/nuevo"
          className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Solicitar ajuste
        </Link>
      </div>

      {canApprove && (
        <section
          aria-label="Pendientes de aprobación"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <p role="status" className="text-sm text-amber-900">
            {pending.isSuccess
              ? pending.data === 0
                ? 'No hay ajustes pendientes de aprobación.'
                : `Hay ${pending.data} ${pending.data === 1 ? 'ajuste pendiente' : 'ajustes pendientes'} de aprobación.`
              : 'Revisando ajustes pendientes…'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setStatus('PENDING');
              setPage(1);
            }}
          >
            Ver pendientes
          </Button>
        </section>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="adjustment-status" className="block text-sm font-medium text-stone-700">
              Estado
            </label>
            <select
              id="adjustment-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="PENDING">Pendientes</option>
              <option value="APPROVED">Aprobados</option>
              <option value="REJECTED">Rechazados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
          <Input
            label="Desde"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
          <form onSubmit={(event) => void applySku(event)} className="flex items-end gap-2">
            <Input
              label="Variante (SKU o código)"
              value={skuDraft}
              onChange={(event) => {
                setSkuDraft(event.target.value);
              }}
              maxLength={100}
              autoComplete="off"
              error={skuError}
            />
            <Button type="submit" variant="secondary">
              Filtrar variante
            </Button>
          </form>
        </div>
        {variantFilter && (
          <p className="mt-3 text-sm text-stone-700">
            Mostrando ajustes de <span className="font-mono">{variantFilter.sku}</span>.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setVariantFilter(null);
                setSkuDraft('');
                setPage(1);
              }}
            >
              Quitar filtro de variante
            </button>
          </p>
        )}

        {list.isPending && (
          <p role="status" className="py-6 text-sm">
            Cargando ajustes…
          </p>
        )}
        {list.isError && (
          <p role="alert" className="py-6 text-sm text-red-700">
            No se pudieron cargar los ajustes.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="py-6 text-sm text-stone-600">No se encontraron ajustes.</p>
        )}
        {list.isSuccess && rows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Ajuste</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Líneas</th>
                  <th className="py-2 pr-4">Diferencia</th>
                  {canSeeCosts && <th className="py-2 pr-4">Valor</th>}
                  <th className="py-2 pr-4">Solicitó</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <AdjustmentRow key={row.id} adjustment={row} showValue={canSeeCosts} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.isSuccess && total > 25 && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Anterior
            </Button>
            <span>
              Página {page} · {total} ajustes
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= total}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
