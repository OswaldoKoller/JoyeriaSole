import { MOVEMENT_TYPES, PERMISSIONS, movementTypeLabel } from '@joyeria/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { ExportCsvButton } from './export-csv-button.tsx';
import {
  EMPTY_MOVEMENT_FILTERS,
  movementsExportPath,
  useAllInventoryMovements,
  type MovementFormFilters,
} from './use-inventory.ts';
import { useHasPermission } from '../auth/use-auth.ts';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { PieceImage } from '../catalog/photos/piece-image.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';

export function MovementsPage() {
  useDocumentTitle('Movimientos');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<MovementFormFilters>(EMPTY_MOVEMENT_FILTERS);
  const canExport = useHasPermission(PERMISSIONS.INVENTORY_READ);
  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  // Con un rango invertido no se consulta ni se exporta: se muestra el error y se conserva lo anterior.
  const [applied, setApplied] = useState<MovementFormFilters>(EMPTY_MOVEMENT_FILTERS);
  const list = useAllInventoryMovements(page, applied);
  const hasFilters = !!(applied.type || applied.from || applied.to);

  function change(next: Partial<MovementFormFilters>) {
    const updated = { ...filters, ...next };
    setFilters(updated);
    if (!updated.from || !updated.to || updated.from <= updated.to) {
      setApplied(updated);
      setPage(1);
    }
  }
  const movements = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        <p className="text-sm text-stone-600">Historial de entradas y ajustes por variante.</p>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <form
          aria-label="Filtros de movimientos"
          onSubmit={(event) => {
            event.preventDefault();
          }}
          className="mb-4 flex flex-wrap items-end gap-3"
        >
          <div className="max-w-full min-w-0 space-y-1">
            <label htmlFor="movement-type" className="block text-sm font-medium text-stone-700">
              Tipo de movimiento
            </label>
            <select
              id="movement-type"
              value={filters.type}
              onChange={(event) => {
                change({ type: event.target.value });
              }}
              className="block min-h-10 w-full max-w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {MOVEMENT_TYPES.filter((type) => type !== 'EXCHANGE').map((type) => (
                <option key={type} value={type}>
                  {movementTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Desde"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => {
              change({ from: event.target.value });
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => {
              change({ to: event.target.value });
            }}
            error={invalidRange ? 'La fecha final no puede ser anterior a la inicial' : undefined}
          />
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={() => {
                setFilters(EMPTY_MOVEMENT_FILTERS);
                setApplied(EMPTY_MOVEMENT_FILTERS);
                setPage(1);
              }}
            >
              Limpiar filtros
            </Button>
          )}
          {canExport && (
            <ExportCsvButton
              path={movementsExportPath(applied)}
              subject="los movimientos"
              hint="Respeta los filtros elegidos. Máximo 50.000 filas."
            />
          )}
        </form>
        {list.isPending && <p role="status">Cargando movimientos…</p>}
        {list.isError && (
          <p role="alert" className="text-red-700">
            No se pudieron cargar los movimientos.{' '}
            <button className="underline" onClick={() => void list.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {list.isSuccess && movements.length === 0 && (
          <p className="text-sm text-stone-600">
            {hasFilters
              ? 'No hay movimientos con esos filtros.'
              : 'No hay movimientos registrados.'}
          </p>
        )}
        {list.isSuccess && movements.length > 0 && (
          <div aria-busy={list.isPlaceholderData} className="overflow-x-auto">
            <table className="table-cards w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-600">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Producto / SKU</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Cambio</th>
                  <th className="py-2 pr-4">Saldo</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">{formatDateTime(movement.createdAt)}</td>
                    <td data-label="Producto" className="py-3 pr-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <PieceImage variantId={movement.variantId} />
                        <div className="min-w-0">
                          {movement.productName}
                          <span className="block text-stone-500">
                            {movement.variantLabel && movement.variantLabel !== 'Única'
                              ? `${movement.variantLabel} · `
                              : ''}
                            <Link
                              to={`/inventario?sku=${encodeURIComponent(movement.sku)}`}
                              className="inline-block py-1 whitespace-nowrap text-brand-700 underline"
                            >
                              {movement.sku}
                            </Link>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Tipo" className="py-3 pr-4">
                      {movementTypeLabel(movement.type)}
                    </td>
                    <td data-label="Cambio" className="py-3 pr-4">
                      {movement.quantity > 0 ? '+' : ''}
                      {movement.quantity}
                    </td>
                    <td data-label="Saldo" className="py-3 pr-4">
                      {movement.balanceBefore} → {movement.balanceAfter}
                    </td>
                    <td data-label="Motivo" className="py-3">
                      {movement.reason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.isSuccess && (
          <Pagination page={page} total={total} noun="movimientos" onPageChange={setPage} />
        )}
      </div>
    </section>
  );
}
